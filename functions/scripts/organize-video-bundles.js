#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_ROOT = path.resolve(process.cwd(), "..", "storage-video-downloads");
const DEFAULT_OUT = "_organized_video_bundles";
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"]);

function parseArgs(argv) {
  const args = {
    rootDir: DEFAULT_ROOT,
    outDir: "",
    overwrite: false,
    copy: false,
  };

  for (const rawArg of argv) {
    const [key, ...valueParts] = rawArg.split("=");
    const value = valueParts.join("=");
    if (rawArg === "--help" || rawArg === "-h") args.help = true;
    else if (rawArg === "--overwrite") args.overwrite = true;
    else if (rawArg === "--copy") args.copy = true;
    else if (key === "--root") args.rootDir = path.resolve(value);
    else if (key === "--out") args.outDir = path.resolve(value);
    else throw new Error(`알 수 없는 옵션입니다: ${rawArg}`);
  }

  if (!args.outDir) args.outDir = path.join(args.rootDir, DEFAULT_OUT);
  return args;
}

function printHelp() {
  console.log(`
깊은 Storage 경로의 영상 묶음을 보기 쉬운 단일 폴더로 정리합니다.

사용법:
  node scripts/organize-video-bundles.js [옵션]

옵션:
  --root=<dir>    영상 다운로드 루트. 기본값: ../storage-video-downloads
  --out=<dir>     정리본 출력 폴더. 기본값: <root>/_organized_video_bundles
  --overwrite     기존 정리본 폴더를 지우고 다시 만듭니다.
  --copy          하드링크 대신 실제 복사를 사용합니다.
`.trim());
}

async function collectMetadataFiles(rootDir, outDir) {
  const files = [];
  const outRelative = path.relative(rootDir, outDir);

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relative = path.relative(rootDir, fullPath);
      if (outRelative && (relative === outRelative || relative.startsWith(`${outRelative}${path.sep}`))) {
        continue;
      }

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

function sanitizePart(value, fallback = "untitled", maxLength = 44) {
  const text = String(value || fallback)
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (text || fallback).slice(0, maxLength);
}

function firstPresent(...values) {
  return values.find((value) => String(value || "").trim()) || "";
}

function shortId(value, fallback = "unknown") {
  return sanitizePart(String(value || fallback).slice(0, 8), fallback, 12);
}

function readableTitle(metadata) {
  const title = firstPresent(
    metadata.firestore?.presentation?.title,
    metadata.firestore?.simulation?.title
  );
  const topic = firstPresent(
    metadata.firestore?.presentation?.topic,
    metadata.firestore?.simulation?.topic
  );
  const videoStem = path.parse(metadata.video?.fileName || "").name;

  if (String(title || "").trim().length >= 2) return title;
  if (String(topic || "").trim().length >= 2) return topic;
  return firstPresent(videoStem, "untitled_video");
}

function folderNameFor(metadata, index) {
  const sourceType = firstPresent(
    metadata.firestore?.attempt?.sourceType,
    metadata.firestore?.simulation?.sourceType,
    metadata.refs?.simulationCode ? "simulation" : "upload"
  );
  const source = sanitizePart(sourceType, "unknown", 14);
  const code = metadata.refs?.simulationCode
    ? `code-${sanitizePart(metadata.refs.simulationCode, "unknown", 12)}`
    : `attempt-${shortId(metadata.refs?.attemptId)}`;
  const title = sanitizePart(readableTitle(metadata), "untitled_video", 36);
  const slideCount = Number(metadata.slideSync?.slideCount || 0);
  const pdfState = metadata.slideSync?.presentationMaterial || metadata.slideSync?.pdfUrl ? "pdf" : "no-pdf";
  const suffix = `${shortId(metadata.refs?.ownerUid)}-${shortId(metadata.refs?.presentationId)}-${shortId(metadata.refs?.attemptId)}`;

  return [
    String(index).padStart(3, "0"),
    source,
    code,
    title,
    `slides-${slideCount}`,
    pdfState,
    suffix,
  ].join("__");
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function linkOrCopy(source, destination, { copy }) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  if (copy) {
    await fs.copyFile(source, destination);
    return "copy";
  }

  try {
    await fs.link(source, destination);
    return "link";
  } catch (error) {
    if (["EXDEV", "EEXIST", "EPERM"].includes(error.code)) {
      await fs.copyFile(source, destination);
      return "copy";
    }
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function deriveSourcePaths(metadataPath) {
  const videoPath = metadataPath.slice(0, -".firestore.json".length);
  const videoExt = path.extname(videoPath).toLowerCase();
  const parsed = path.parse(videoPath);
  const pdfPath = path.join(parsed.dir, `${parsed.name}.presentation.pdf`);
  return { videoPath, videoExt, pdfPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (args.overwrite) {
    await fs.rm(args.outDir, { recursive: true, force: true });
  } else if (await exists(args.outDir)) {
    throw new Error(`출력 폴더가 이미 있습니다. 다시 만들려면 --overwrite를 사용하세요: ${args.outDir}`);
  }

  await fs.mkdir(args.outDir, { recursive: true });

  const metadataFiles = await collectMetadataFiles(args.rootDir, args.outDir);
  const indexRows = [];
  const summary = {
    bundles: 0,
    withPdf: 0,
    withSlideTimeline: 0,
    linked: 0,
    copied: 0,
    missingVideo: 0,
    missingPdf: 0,
  };

  console.log(`[config] root=${args.rootDir}`);
  console.log(`[config] out=${args.outDir}`);
  console.log(`[config] metadataFiles=${metadataFiles.length}`);

  let bundleIndex = 0;
  for (const metadataPath of metadataFiles) {
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    const { videoPath, videoExt, pdfPath } = deriveSourcePaths(metadataPath);

    if (!VIDEO_EXTENSIONS.has(videoExt) || !await exists(videoPath)) {
      summary.missingVideo += 1;
      console.log(`[missing-video] ${path.relative(args.rootDir, videoPath)}`);
      continue;
    }

    bundleIndex += 1;
    const folderName = folderNameFor(metadata, bundleIndex);
    const bundleDir = path.join(args.outDir, folderName);
    await fs.mkdir(bundleDir, { recursive: true });

    const videoDest = path.join(bundleDir, `video${videoExt}`);
    const infoDest = path.join(bundleDir, "slide-info.json");
    const firestoreDest = path.join(bundleDir, "firestore-metadata.json");
    const pdfDest = path.join(bundleDir, "slides.pdf");

    const videoMode = await linkOrCopy(videoPath, videoDest, args);
    summary[videoMode === "link" ? "linked" : "copied"] += 1;

    await writeJson(infoDest, {
      video: metadata.video,
      refs: metadata.refs,
      slideSync: metadata.slideSync,
      lookupNotes: metadata.lookupNotes || [],
    });
    await writeJson(firestoreDest, metadata);

    const hasPdf = await exists(pdfPath);
    if (hasPdf) {
      const pdfMode = await linkOrCopy(pdfPath, pdfDest, args);
      summary[pdfMode === "link" ? "linked" : "copied"] += 1;
      summary.withPdf += 1;
    } else {
      summary.missingPdf += 1;
    }

    if (metadata.slideSync?.hasTimeline) summary.withSlideTimeline += 1;
    summary.bundles += 1;

    indexRows.push({
      folder: folderName,
      video: path.relative(args.outDir, videoDest),
      pdf: hasPdf ? path.relative(args.outDir, pdfDest) : "",
      slideInfo: path.relative(args.outDir, infoDest),
      firestoreMetadata: path.relative(args.outDir, firestoreDest),
      sourceVideo: path.relative(args.rootDir, videoPath),
      sourcePdf: hasPdf ? path.relative(args.rootDir, pdfPath) : "",
      sourceType: metadata.firestore?.attempt?.sourceType || metadata.firestore?.simulation?.sourceType || "",
      title: metadata.firestore?.presentation?.title || metadata.firestore?.simulation?.title || "",
      topic: metadata.firestore?.presentation?.topic || metadata.firestore?.simulation?.topic || "",
      simulationCode: metadata.refs?.simulationCode || "",
      ownerUid: metadata.refs?.ownerUid || "",
      presentationId: metadata.refs?.presentationId || "",
      attemptId: metadata.refs?.attemptId || "",
      slideCount: Number(metadata.slideSync?.slideCount || 0),
      hasPdf,
    });

    console.log(`[bundle] ${folderName}`);
  }

  await writeJson(path.join(args.outDir, "_index.json"), {
    generatedAt: new Date().toISOString(),
    rootDir: args.rootDir,
    summary,
    bundles: indexRows,
  });

  console.log(`[summary] ${JSON.stringify(summary)}`);
}

main().catch((error) => {
  console.error(`[fatal] ${error.message}`);
  process.exitCode = 1;
});
