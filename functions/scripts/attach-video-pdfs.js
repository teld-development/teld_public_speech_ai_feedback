#!/usr/bin/env node

const fs = require("node:fs/promises");
const { createWriteStream } = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { pipeline } = require("node:stream/promises");
const { Readable } = require("node:stream");

const DEFAULT_BUCKET = "public-speech-feedback.firebasestorage.app";
const DEFAULT_ROOT = path.resolve(process.cwd(), "..", "storage-video-downloads");

function parseArgs(argv) {
  const args = {
    rootDir: DEFAULT_ROOT,
    bucket: process.env.FIREBASE_STORAGE_BUCKET || DEFAULT_BUCKET,
    overwrite: false,
    limit: 0,
  };

  for (const rawArg of argv) {
    const [key, ...valueParts] = rawArg.split("=");
    const value = valueParts.join("=");
    if (rawArg === "--help" || rawArg === "-h") args.help = true;
    else if (rawArg === "--overwrite") args.overwrite = true;
    else if (key === "--root") args.rootDir = path.resolve(value);
    else if (key === "--bucket") args.bucket = value;
    else if (key === "--limit") args.limit = Number(value);
    else throw new Error(`알 수 없는 옵션입니다: ${rawArg}`);
  }

  if (!args.bucket) throw new Error("Storage bucket이 필요합니다. --bucket=<bucket>으로 지정하세요.");
  if (!Number.isFinite(args.limit) || args.limit < 0) throw new Error("--limit은 0 이상의 숫자여야 합니다.");
  return args;
}

function printHelp() {
  console.log(`
영상 옆에 발표자료 PDF를 내려받습니다.

사용법:
  node scripts/attach-video-pdfs.js [옵션]

옵션:
  --root=<dir>       영상 다운로드 루트. 기본값: ../storage-video-downloads
  --bucket=<bucket>  Firebase Storage bucket. 기본값: ${DEFAULT_BUCKET}
  --overwrite        이미 있는 .presentation.pdf 파일을 다시 씁니다.
  --limit=<number>   테스트용 처리 개수 제한. 0이면 제한 없음
`.trim());
}

function getGcloudAccessToken() {
  return execFileSync("gcloud", ["auth", "print-access-token"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function encodeObjectName(name) {
  return encodeURIComponent(name).replace(/%2F/g, "%2F");
}

async function collectFirestoreJsonFiles(rootDir) {
  const files = [];

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".firestore.json")) {
        files.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return files.sort();
}

function destinationForMetadata(metadataPath) {
  const videoPath = metadataPath.slice(0, -".firestore.json".length);
  const parsed = path.parse(videoPath);
  return {
    videoPath,
    pdfPath: path.join(parsed.dir, `${parsed.name}.presentation.pdf`),
  };
}

function getPdfSource(metadata) {
  const material = metadata?.slideSync?.presentationMaterial
    || metadata?.firestore?.simulation?.presentationMaterial
    || metadata?.firestore?.presentation?.presentationMaterial
    || null;
  const pdfUrl = metadata?.slideSync?.pdfUrl
    || metadata?.firestore?.simulation?.simulation?.pdfUrl
    || material?.url
    || "";
  const materialPath = material?.path || "";
  const type = String(material?.type || "").toLowerCase();

  if (materialPath) {
    return {
      kind: "gcs",
      key: `gcs:${materialPath}`,
      storagePath: materialPath,
      expectedSize: Number(material?.size || 0),
      material,
    };
  }

  if (pdfUrl && (type === "application/pdf" || /\.pdf(?:[?#]|$)/i.test(pdfUrl))) {
    return {
      kind: "url",
      key: `url:${pdfUrl}`,
      url: pdfUrl,
      expectedSize: Number(material?.size || 0),
      material,
    };
  }

  return null;
}

async function existsWithExpectedSize(filePath, expectedSize) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return false;
    return expectedSize > 0 ? stat.size === expectedSize : stat.size > 0;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function streamResponseToFile(response, destination) {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`PDF 다운로드 실패: HTTP ${response.status}${text ? ` ${text.slice(0, 200)}` : ""}`);
  }

  const tempDestination = `${destination}.part`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(tempDestination));
  await fs.rename(tempDestination, destination);
}

async function downloadPdfSource(source, destination, bucket) {
  await fs.mkdir(path.dirname(destination), { recursive: true });

  if (source.kind === "gcs") {
    const url = `https://storage.googleapis.com/download/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeObjectName(source.storagePath)}?alt=media`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${getGcloudAccessToken()}`,
      },
    });
    await streamResponseToFile(response, destination);
    return;
  }

  const response = await fetch(source.url);
  await streamResponseToFile(response, destination);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const metadataFiles = await collectFirestoreJsonFiles(args.rootDir);
  const selectedFiles = args.limit ? metadataFiles.slice(0, args.limit) : metadataFiles;
  const sourceCache = new Map();
  const summary = {
    metadataFiles: selectedFiles.length,
    written: 0,
    copied: 0,
    skippedExisting: 0,
    skippedNoPdf: 0,
    errors: [],
  };

  console.log(`[config] root=${args.rootDir}`);
  console.log(`[config] bucket=${args.bucket}`);
  console.log(`[config] metadataFiles=${selectedFiles.length}`);

  for (const metadataPath of selectedFiles) {
    const relativeMetadataPath = path.relative(args.rootDir, metadataPath);

    try {
      const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
      const source = getPdfSource(metadata);
      const { videoPath, pdfPath } = destinationForMetadata(metadataPath);
      const relativePdfPath = path.relative(args.rootDir, pdfPath);

      if (!source) {
        summary.skippedNoPdf += 1;
        console.log(`[no-pdf] ${relativeMetadataPath}`);
        continue;
      }

      if (!args.overwrite && await existsWithExpectedSize(pdfPath, source.expectedSize)) {
        summary.skippedExisting += 1;
        console.log(`[skip] ${relativePdfPath}`);
        continue;
      }

      if (!await existsWithExpectedSize(videoPath, 0)) {
        throw new Error(`원본 영상 파일을 찾을 수 없습니다: ${videoPath}`);
      }

      const cachedPath = sourceCache.get(source.key);
      if (cachedPath && await existsWithExpectedSize(cachedPath, source.expectedSize)) {
        await fs.copyFile(cachedPath, pdfPath);
        summary.copied += 1;
        console.log(`[copy] ${relativePdfPath}`);
      } else {
        await downloadPdfSource(source, pdfPath, args.bucket);
        sourceCache.set(source.key, pdfPath);
        summary.written += 1;
        console.log(`[download] ${relativePdfPath}`);
      }

      if (!await existsWithExpectedSize(pdfPath, source.expectedSize)) {
        throw new Error(`PDF 파일 크기 검증 실패: ${pdfPath}`);
      }
    } catch (error) {
      summary.errors.push({ metadataPath, error: error.message });
      console.error(`[error] ${relativeMetadataPath}: ${error.message}`);
    }
  }

  console.log(`[summary] ${JSON.stringify(summary)}`);
  if (summary.errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[fatal] ${error.message}`);
  process.exitCode = 1;
});
