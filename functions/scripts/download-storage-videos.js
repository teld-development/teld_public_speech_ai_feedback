#!/usr/bin/env node

const fs = require("node:fs/promises");
const { createWriteStream } = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { pipeline } = require("node:stream/promises");
const { Readable } = require("node:stream");

const DEFAULT_BUCKET = "public-speech-feedback.firebasestorage.app";
const DEFAULT_MIN_SIZE_MB = 50;
const VIDEO_EXTENSIONS = new Set([
  ".3g2",
  ".3gp",
  ".avi",
  ".m4v",
  ".mkv",
  ".mov",
  ".mp4",
  ".mpeg",
  ".mpg",
  ".webm",
  ".wmv",
]);

function parseArgs(argv) {
  const args = {
    bucket: process.env.FIREBASE_STORAGE_BUCKET || DEFAULT_BUCKET,
    prefix: "",
    outDir: path.resolve(process.cwd(), "..", "storage-video-downloads"),
    minSizeMb: DEFAULT_MIN_SIZE_MB,
    manifest: "",
    download: false,
    overwrite: false,
    limit: 0,
    auth: "auto",
    excludeManifestPaths: [],
  };

  for (const rawArg of argv) {
    const [key, ...valueParts] = rawArg.split("=");
    const value = valueParts.join("=");

    if (rawArg === "--help" || rawArg === "-h") args.help = true;
    else if (rawArg === "--download") args.download = true;
    else if (rawArg === "--dry-run") args.download = false;
    else if (rawArg === "--overwrite") args.overwrite = true;
    else if (key === "--bucket") args.bucket = value;
    else if (key === "--prefix") args.prefix = value || "";
    else if (key === "--out") args.outDir = path.resolve(value);
    else if (key === "--manifest") args.manifest = path.resolve(value);
    else if (key === "--exclude-manifest") args.excludeManifestPaths.push(path.resolve(value));
    else if (key === "--min-size-mb") args.minSizeMb = Number(value);
    else if (key === "--limit") args.limit = Number(value);
    else if (key === "--auth") args.auth = value || "auto";
    else throw new Error(`알 수 없는 옵션입니다: ${rawArg}`);
  }

  if (!args.bucket) throw new Error("Storage bucket이 필요합니다. --bucket=<bucket>으로 지정하세요.");
  if (!Number.isFinite(args.minSizeMb) || args.minSizeMb < 0) {
    throw new Error("--min-size-mb는 0 이상의 숫자여야 합니다.");
  }
  if (!Number.isFinite(args.limit) || args.limit < 0) {
    throw new Error("--limit은 0 이상의 숫자여야 합니다.");
  }
  if (!["auto", "gcloud"].includes(args.auth)) {
    throw new Error("--auth는 auto 또는 gcloud만 지원합니다.");
  }

  if (!args.manifest) {
    args.manifest = path.join(args.outDir, `storage-video-manifest-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  }

  return args;
}

function printHelp() {
  console.log(`
Firebase Storage 영상 후보 스캔/다운로드

사용법:
  node scripts/download-storage-videos.js [옵션]

옵션:
  --download                 실제 다운로드를 수행합니다. 없으면 dry-run입니다.
  --dry-run                  후보 목록과 manifest만 생성합니다. 기본값입니다.
  --bucket=<bucket>          조회할 Storage bucket. 기본값: ${DEFAULT_BUCKET}
  --prefix=<path/>           특정 prefix만 조회합니다. 기본값: 전체 bucket
  --out=<dir>                다운로드/manifest 저장 폴더. 기본값: ../storage-video-downloads
  --manifest=<file>          manifest JSON 파일 경로를 직접 지정합니다.
  --exclude-manifest=<file>  이 manifest에 있는 후보는 제외합니다. 여러 번 지정 가능
  --min-size-mb=<number>     후보 최소 크기(MB). 기본값: ${DEFAULT_MIN_SIZE_MB}
  --limit=<number>           테스트용 후보 개수 제한. 0이면 제한 없음.
  --overwrite                이미 내려받은 파일도 다시 다운로드합니다.
  --auth=<auto|gcloud>       인증 방식. 기본값: auto

예시:
  node scripts/download-storage-videos.js --dry-run --min-size-mb=50
  node scripts/download-storage-videos.js --download --min-size-mb=50
  node scripts/download-storage-videos.js --download --min-size-mb=10 --exclude-manifest=../storage-video-downloads/storage-video-manifest-download.json
  node scripts/download-storage-videos.js --download --prefix=recordings/
`.trim());
}

function bytesToMb(bytes) {
  return Number((bytes / 1024 / 1024).toFixed(2));
}

function encodeObjectName(name) {
  return encodeURIComponent(name).replace(/%2F/g, "%2F");
}

function getGcloudAccessToken() {
  return execFileSync("gcloud", ["auth", "print-access-token"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

class GcsRestClient {
  constructor({ auth }) {
    this.auth = auth;
    this.accessToken = "";
    this.tokenExpiresAt = 0;
  }

  getAccessToken() {
    const now = Date.now();
    if (this.accessToken && now < this.tokenExpiresAt - 5 * 60 * 1000) {
      return this.accessToken;
    }

    if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) {
      this.accessToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN.trim();
      this.tokenExpiresAt = now + 50 * 60 * 1000;
      return this.accessToken;
    }

    if (this.auth === "auto" || this.auth === "gcloud") {
      this.accessToken = getGcloudAccessToken();
      this.tokenExpiresAt = now + 50 * 60 * 1000;
      return this.accessToken;
    }

    throw new Error("사용 가능한 인증 토큰을 찾지 못했습니다.");
  }

  async requestJson(url) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.getAccessToken()}`,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.error?.message || `GCS 요청 실패: HTTP ${response.status}`;
      throw new Error(message);
    }
    return payload;
  }

  async listFiles({ bucket, prefix, pageToken }) {
    const params = new URLSearchParams({
      maxResults: "1000",
      projection: "full",
    });
    if (prefix) params.set("prefix", prefix);
    if (pageToken) params.set("pageToken", pageToken);

    const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o?${params}`;
    const payload = await this.requestJson(url);
    return {
      files: payload.items || [],
      nextPageToken: payload.nextPageToken || "",
    };
  }

  async downloadFile({ bucket, name, destination }) {
    const url = `https://storage.googleapis.com/download/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeObjectName(name)}?alt=media`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.getAccessToken()}`,
      },
    });
    if (!response.ok) {
      let message = `GCS 다운로드 실패: HTTP ${response.status}`;
      const payload = await response.json().catch(() => null);
      if (payload?.error?.message) message = payload.error.message;
      throw new Error(message);
    }

    const tempDestination = `${destination}.part`;
    await pipeline(Readable.fromWeb(response.body), createWriteStream(tempDestination));
    await fs.rename(tempDestination, destination);
  }
}

function isLikelyVideo(fileName, metadata) {
  const contentType = String(metadata.contentType || "").toLowerCase();
  if (contentType.startsWith("video/")) return true;
  return VIDEO_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

function metadataValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return String(value);
}

function toManifestEntry(file) {
  const metadata = file || {};
  const customMetadata = metadata.metadata || {};
  const sizeBytes = Number(metadata.size || 0);

  return {
    bucket: metadata.bucket,
    name: metadata.name,
    gsUri: `gs://${metadata.bucket}/${metadata.name}`,
    sizeBytes,
    sizeMb: bytesToMb(sizeBytes),
    contentType: metadataValue(metadata.contentType),
    updated: metadataValue(metadata.updated),
    created: metadataValue(metadata.timeCreated),
    md5Hash: metadataValue(metadata.md5Hash),
    crc32c: metadataValue(metadata.crc32c),
    ownerUid: metadataValue(customMetadata.ownerUid),
    presentationId: metadataValue(customMetadata.presentationId),
    attemptId: metadataValue(customMetadata.attemptId),
    sourceType: metadataValue(customMetadata.sourceType),
  };
}

async function loadExcludedNames(manifestPaths) {
  const excludedNames = new Set();

  for (const manifestPath of manifestPaths) {
    const text = await fs.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(text);
    for (const entry of manifest.candidates || []) {
      if (entry?.name) excludedNames.add(entry.name);
    }
  }

  return excludedNames;
}

function safeLocalPath(rootDir, objectName) {
  const parts = objectName
    .split("/")
    .filter(Boolean)
    .map((part) => {
      const cleaned = part.replace(/[<>:"\\|?*\x00-\x1F]/g, "_");
      return cleaned === "." || cleaned === ".." ? "__" : cleaned;
    });

  const destination = path.resolve(rootDir, ...parts);
  const relative = path.relative(rootDir, destination);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`로컬 저장 경로가 안전하지 않습니다: ${objectName}`);
  }
  return destination;
}

async function collectCandidates({ auth, bucket, prefix, minSizeMb, limit, excludeManifestPaths }) {
  const client = new GcsRestClient({ auth });
  const excludedNames = await loadExcludedNames(excludeManifestPaths);
  const minSizeBytes = minSizeMb * 1024 * 1024;
  const candidates = [];
  let excluded = 0;
  let scanned = 0;
  let pageToken;

  do {
    const response = await client.listFiles({
      bucket,
      pageToken,
      prefix,
    });
    const files = response.files;

    for (const file of files) {
      scanned += 1;
      const metadata = { ...file, bucket: file.bucket || bucket };
      const sizeBytes = Number(metadata.size || 0);

      if (sizeBytes >= minSizeBytes && isLikelyVideo(file.name, metadata)) {
        if (excludedNames.has(file.name)) {
          excluded += 1;
          continue;
        }

        candidates.push(toManifestEntry(metadata));
        const latest = candidates[candidates.length - 1];
        console.log(`[candidate] ${latest.sizeMb} MB  ${latest.gsUri}`);
        if (limit && candidates.length >= limit) {
          return { candidates, scanned, excluded, limited: true };
        }
      }

      if (scanned % 1000 === 0) {
        console.log(`[scan] ${scanned} objects scanned, ${candidates.length} candidates, ${excluded} excluded`);
      }
    }

    pageToken = response.nextPageToken;
  } while (pageToken);

  return { candidates, scanned, excluded, limited: false };
}

async function writeManifest(manifestPath, payload) {
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function fileExistsWithSize(filePath, sizeBytes) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() && stat.size === sizeBytes;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function downloadCandidates({ auth, bucket, outDir, overwrite }, candidates) {
  const client = new GcsRestClient({ auth });
  let downloaded = 0;
  let skipped = 0;

  for (const entry of candidates) {
    const destination = safeLocalPath(outDir, entry.name);

    if (!overwrite && await fileExistsWithSize(destination, entry.sizeBytes)) {
      skipped += 1;
      console.log(`[skip] already exists (${entry.sizeMb} MB) ${destination}`);
      continue;
    }

    await fs.mkdir(path.dirname(destination), { recursive: true });
    console.log(`[download] ${entry.sizeMb} MB  ${entry.gsUri}`);
    await client.downloadFile({ bucket, name: entry.name, destination });
    if (!await fileExistsWithSize(destination, entry.sizeBytes)) {
      throw new Error(`다운로드 검증 실패: ${destination}`);
    }
    downloaded += 1;
  }

  return { downloaded, skipped };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  console.log(`[config] bucket=${args.bucket}`);
  console.log(`[config] prefix=${args.prefix || "(entire bucket)"}`);
  console.log(`[config] minSizeMb=${args.minSizeMb}`);
  console.log(`[config] excludeManifests=${args.excludeManifestPaths.length ? args.excludeManifestPaths.join(", ") : "(none)"}`);
  console.log(`[config] mode=${args.download ? "download" : "dry-run"}`);

  const scanResult = await collectCandidates(args);
  const manifestPayload = {
    generatedAt: new Date().toISOString(),
    bucket: args.bucket,
    prefix: args.prefix,
    minSizeMb: args.minSizeMb,
    excludedManifestPaths: args.excludeManifestPaths,
    scannedObjectCount: scanResult.scanned,
    excludedCandidateCount: scanResult.excluded,
    candidateCount: scanResult.candidates.length,
    limited: scanResult.limited,
    candidates: scanResult.candidates,
  };

  await writeManifest(args.manifest, manifestPayload);
  console.log(`[manifest] ${args.manifest}`);
  console.log(`[summary] scanned=${scanResult.scanned}, excluded=${scanResult.excluded}, candidates=${scanResult.candidates.length}`);

  if (!args.download) {
    console.log("[dry-run] 다운로드하려면 같은 명령에 --download를 추가하세요.");
    return;
  }

  const downloadResult = await downloadCandidates(args, scanResult.candidates);
  console.log(`[done] downloaded=${downloadResult.downloaded}, skipped=${downloadResult.skipped}, out=${args.outDir}`);
}

main().catch((error) => {
  console.error(`[error] ${error.message}`);
  process.exitCode = 1;
});
