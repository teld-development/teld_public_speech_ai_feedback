#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const DEFAULT_PROJECT_ID = "public-speech-feedback";
const DEFAULT_ROOT = path.resolve(process.cwd(), "..", "storage-video-downloads");
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"]);

function parseArgs(argv) {
  const args = {
    projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID,
    rootDir: DEFAULT_ROOT,
    overwrite: false,
    limit: 0,
  };

  for (const rawArg of argv) {
    const [key, ...valueParts] = rawArg.split("=");
    const value = valueParts.join("=");
    if (rawArg === "--help" || rawArg === "-h") args.help = true;
    else if (rawArg === "--overwrite") args.overwrite = true;
    else if (key === "--project") args.projectId = value;
    else if (key === "--root") args.rootDir = path.resolve(value);
    else if (key === "--limit") args.limit = Number(value);
    else throw new Error(`알 수 없는 옵션입니다: ${rawArg}`);
  }

  if (!args.projectId) throw new Error("Firebase project id가 필요합니다. --project=<id>로 지정하세요.");
  if (!Number.isFinite(args.limit) || args.limit < 0) throw new Error("--limit은 0 이상의 숫자여야 합니다.");
  return args;
}

function printHelp() {
  console.log(`
다운로드된 영상 옆에 Firestore 메타데이터 JSON을 생성합니다.

사용법:
  node scripts/attach-video-firestore-metadata.js [옵션]

옵션:
  --root=<dir>       영상 다운로드 루트. 기본값: ../storage-video-downloads
  --project=<id>     Firebase project id. 기본값: ${DEFAULT_PROJECT_ID}
  --overwrite        이미 있는 .firestore.json 파일을 다시 씁니다.
  --limit=<number>   테스트용 처리 개수 제한. 0이면 제한 없음
`.trim());
}

function getGcloudAccessToken() {
  return execFileSync("gcloud", ["auth", "print-access-token"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

class FirestoreRestClient {
  constructor(projectId) {
    this.projectId = projectId;
    this.accessToken = "";
    this.tokenExpiresAt = 0;
    this.documentCache = new Map();
    this.queryCache = new Map();
  }

  getAccessToken() {
    const now = Date.now();
    if (this.accessToken && now < this.tokenExpiresAt - 5 * 60 * 1000) return this.accessToken;
    this.accessToken = getGcloudAccessToken();
    this.tokenExpiresAt = now + 50 * 60 * 1000;
    return this.accessToken;
  }

  baseUrl() {
    return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents`;
  }

  async requestJson(url, init = {}) {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.getAccessToken()}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 404) return null;
      const message = payload?.error?.message || `Firestore 요청 실패: HTTP ${response.status}`;
      throw new Error(message);
    }
    return payload;
  }

  async getDocument(documentPath) {
    if (!documentPath) return null;
    if (this.documentCache.has(documentPath)) return this.documentCache.get(documentPath);
    const encodedPath = documentPath.split("/").map(encodeURIComponent).join("/");
    const payload = await this.requestJson(`${this.baseUrl()}/${encodedPath}`);
    const parsed = payload ? fromFirestoreDocument(payload) : null;
    this.documentCache.set(documentPath, parsed);
    return parsed;
  }

  async querySimulationByRawVideoPath(storagePath) {
    if (!storagePath) return null;
    if (this.queryCache.has(storagePath)) return this.queryCache.get(storagePath);

    const url = `${this.baseUrl()}:runQuery`;
    const body = {
      structuredQuery: {
        from: [{ collectionId: "simulations" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "recordingUpload.rawVideoPath" },
            op: "EQUAL",
            value: { stringValue: storagePath },
          },
        },
        limit: 1,
      },
    };
    const payload = await this.requestJson(url, {
      method: "POST",
      body: JSON.stringify(body),
    });
    const found = Array.isArray(payload)
      ? payload.find((row) => row.document)?.document
      : null;
    const parsed = found ? fromFirestoreDocument(found) : null;
    this.queryCache.set(storagePath, parsed);
    return parsed;
  }
}

function parseFirestoreValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("stringValue" in value) return value.stringValue;
  if ("bytesValue" in value) return value.bytesValue;
  if ("referenceValue" in value) return value.referenceValue;
  if ("geoPointValue" in value) return value.geoPointValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(parseFirestoreValue);
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields || {}).map(([key, child]) => [key, parseFirestoreValue(child)])
    );
  }
  return null;
}

function fromFirestoreDocument(document) {
  const fields = document.fields || {};
  const data = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, parseFirestoreValue(value)])
  );
  const nameParts = String(document.name || "").split("/documents/");
  return {
    path: nameParts[1] || document.name || "",
    createTime: document.createTime || "",
    updateTime: document.updateTime || "",
    data,
  };
}

async function collectVideos(rootDir) {
  const videos = [];

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        videos.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return videos.sort();
}

function deriveVideoIdentity(rootDir, videoPath) {
  const relativePath = path.relative(rootDir, videoPath).split(path.sep).join("/");
  const recordingMatch = relativePath.match(/^recordings\/([^/]+)\/presentations\/([^/]+)\/attempts\/([^/]+)\/raw\/([^/]+)$/);
  const simulationMatch = relativePath.match(/^simulations\/([^/]+)\/recording_[^/]+$/);
  const fileName = path.basename(videoPath);
  const codeFromFileName = fileName.match(/(?:simulation|recording)_(\d{6})/i)?.[1] || "";

  if (recordingMatch) {
    return {
      type: "recording",
      storagePath: relativePath,
      ownerUid: recordingMatch[1],
      presentationId: recordingMatch[2],
      attemptId: recordingMatch[3],
      fileName,
      simulationCode: codeFromFileName,
    };
  }

  if (simulationMatch) {
    return {
      type: "simulation-root",
      storagePath: relativePath,
      ownerUid: "",
      presentationId: "",
      attemptId: "",
      fileName,
      simulationCode: simulationMatch[1] || codeFromFileName,
    };
  }

  return {
    type: "unknown",
    storagePath: relativePath,
    ownerUid: "",
    presentationId: "",
    attemptId: "",
    fileName,
    simulationCode: codeFromFileName,
  };
}

function parseTimelineTimeToSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  const text = String(value || "").trim();
  if (!text) return null;
  const parts = text.split(":").map((part) => Number(part.trim()));
  if (parts.length === 2 && parts.every(Number.isFinite)) return Math.max(0, parts[0] * 60 + parts[1]);
  if (parts.length === 3 && parts.every(Number.isFinite)) return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  return null;
}

function parseSlideTimeline(value) {
  let timeline = value;
  if (typeof timeline === "string") {
    const trimmed = timeline.trim();
    if (!trimmed) return [];
    try {
      timeline = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }

  const rawSlides = Array.isArray(timeline?.slides)
    ? timeline.slides
    : Array.isArray(timeline)
      ? timeline
      : [];

  return rawSlides
    .map((slide) => {
      const seconds = parseTimelineTimeToSeconds(slide?.t ?? slide?.time ?? slide?.timeFormatted);
      const page = Number.parseInt(slide?.page ?? slide?.slide ?? slide?.slideIndex, 10);
      if (seconds == null || !Number.isFinite(page) || page < 1) return null;
      return {
        t: seconds,
        timeFormatted: String(slide?.timeFormatted || "").trim(),
        page,
        content: String(slide?.content || slide?.label || "").trim(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.t - b.t);
}

function compactDoc(doc, fields) {
  if (!doc?.data) return null;
  return Object.fromEntries(fields.map((field) => [field, doc.data[field]]).filter(([, value]) => value !== undefined));
}

function extractSlidePackage({ presentationDoc, attemptDoc, simulationDoc }) {
  const attempt = attemptDoc?.data || {};
  const presentation = presentationDoc?.data || {};
  const simulation = simulationDoc?.data || {};
  const nestedSimulation = simulation.simulation || attempt.simulation || {};

  const rawTimeline =
    simulation.slideTimeline ??
    nestedSimulation.slideTimeline ??
    attempt.slideTimeline ??
    attempt.simulation?.slideTimeline ??
    null;
  const slideImageUrls = [
    nestedSimulation.slideImageUrls,
    simulation.slideImageUrls,
    attempt.simulation?.slideImageUrls,
  ].find((candidate) => Array.isArray(candidate) && candidate.length) || [];
  const pdfUrl =
    nestedSimulation.pdfUrl ||
    simulation.pdfUrl ||
    simulation.presentationMaterial?.url ||
    attempt.simulation?.pdfUrl ||
    presentation.presentationMaterial?.url ||
    "";
  const presentationMaterial =
    simulation.presentationMaterial ||
    attempt.presentationMaterial ||
    presentation.presentationMaterial ||
    null;

  return {
    slideTimelineRaw: rawTimeline,
    slides: parseSlideTimeline(rawTimeline),
    slideImageUrls,
    pdfUrl,
    presentationMaterial,
  };
}

async function buildMetadataForVideo(client, rootDir, videoPath) {
  const stat = await fs.stat(videoPath);
  const identity = deriveVideoIdentity(rootDir, videoPath);
  let presentationDoc = null;
  let attemptDoc = null;
  let simulationDoc = null;
  const lookupNotes = [];

  if (identity.ownerUid && identity.presentationId) {
    presentationDoc = await client.getDocument(`users/${identity.ownerUid}/presentations/${identity.presentationId}`);
    if (!presentationDoc) lookupNotes.push("presentation document not found");
  }

  if (identity.ownerUid && identity.presentationId && identity.attemptId) {
    attemptDoc = await client.getDocument(`users/${identity.ownerUid}/presentations/${identity.presentationId}/attempts/${identity.attemptId}`);
    if (!attemptDoc) lookupNotes.push("attempt document not found");
  }

  const codeCandidates = [
    identity.simulationCode,
    attemptDoc?.data?.simulation?.code,
  ].filter(Boolean);

  for (const code of codeCandidates) {
    const candidateDoc = await client.getDocument(`simulations/${code}`);
    if (!candidateDoc) continue;
    const candidateRawVideoPath = candidateDoc.data?.recordingUpload?.rawVideoPath || "";
    const matchesCurrentRecording = identity.type !== "recording"
      || !candidateRawVideoPath
      || candidateRawVideoPath === identity.storagePath;
    if (matchesCurrentRecording) {
      simulationDoc = candidateDoc;
      break;
    }
  }

  if (!simulationDoc && identity.storagePath) {
    simulationDoc = await client.querySimulationByRawVideoPath(identity.storagePath);
  }
  if (!simulationDoc && (identity.type === "recording" || identity.type === "simulation-root")) {
    lookupNotes.push("simulation document not found");
  }

  const slidePackage = extractSlidePackage({ presentationDoc, attemptDoc, simulationDoc });

  return {
    generatedAt: new Date().toISOString(),
    video: {
      localPath: videoPath,
      relativePath: path.relative(rootDir, videoPath).split(path.sep).join("/"),
      storagePath: identity.storagePath,
      fileName: identity.fileName,
      sizeBytes: stat.size,
      sizeMb: Number((stat.size / 1024 / 1024).toFixed(2)),
    },
    refs: {
      projectId: client.projectId,
      ownerUid: identity.ownerUid || simulationDoc?.data?.ownerUid || "",
      presentationId: identity.presentationId || simulationDoc?.data?.presentationId || "",
      attemptId: identity.attemptId || simulationDoc?.data?.attemptId || "",
      simulationCode: identity.simulationCode || attemptDoc?.data?.simulation?.code || simulationDoc?.path?.split("/").pop() || "",
      presentationPath: presentationDoc?.path || "",
      attemptPath: attemptDoc?.path || "",
      simulationPath: simulationDoc?.path || "",
    },
    slideSync: {
      hasTimeline: slidePackage.slides.length > 0,
      slideCount: slidePackage.slides.length,
      slides: slidePackage.slides,
      raw: slidePackage.slideTimelineRaw,
      slideImageUrls: slidePackage.slideImageUrls,
      pdfUrl: slidePackage.pdfUrl,
      presentationMaterial: slidePackage.presentationMaterial,
    },
    firestore: {
      presentation: compactDoc(presentationDoc, [
        "title",
        "topic",
        "audience",
        "duration",
        "presentationType",
        "presentationMaterial",
        "ownerUid",
        "ownerEmail",
        "createdAt",
        "updatedAt",
      ]),
      attempt: compactDoc(attemptDoc, [
        "attemptNo",
        "sourceType",
        "status",
        "video",
        "recordingUpload",
        "simulation",
        "createdAt",
        "updatedAt",
        "completedAt",
      ]),
      simulation: compactDoc(simulationDoc, [
        "title",
        "topic",
        "audience",
        "duration",
        "sourceType",
        "status",
        "backendSessionId",
        "backendCode",
        "recordingUpload",
        "presentationMaterial",
        "simulation",
        "slideTimeline",
        "createdAt",
        "completedAt",
      ]),
    },
    lookupNotes,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const client = new FirestoreRestClient(args.projectId);
  const videos = await collectVideos(args.rootDir);
  const selectedVideos = args.limit ? videos.slice(0, args.limit) : videos;
  const summary = {
    totalVideos: selectedVideos.length,
    written: 0,
    skipped: 0,
    withTimeline: 0,
    withoutTimeline: 0,
    errors: [],
  };

  console.log(`[config] project=${args.projectId}`);
  console.log(`[config] root=${args.rootDir}`);
  console.log(`[config] videos=${selectedVideos.length}`);

  for (const videoPath of selectedVideos) {
    const outputPath = `${videoPath}.firestore.json`;
    try {
      if (!args.overwrite) {
        try {
          await fs.access(outputPath);
          summary.skipped += 1;
          console.log(`[skip] ${path.relative(args.rootDir, outputPath)}`);
          continue;
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }

      const metadata = await buildMetadataForVideo(client, args.rootDir, videoPath);
      await fs.writeFile(outputPath, `${JSON.stringify(metadata, null, 2)}\n`);
      summary.written += 1;
      if (metadata.slideSync.hasTimeline) summary.withTimeline += 1;
      else summary.withoutTimeline += 1;
      console.log(`[write] slides=${metadata.slideSync.slideCount} ${path.relative(args.rootDir, outputPath)}`);
    } catch (error) {
      summary.errors.push({ videoPath, error: error.message });
      console.error(`[error] ${videoPath}: ${error.message}`);
    }
  }

  console.log(`[summary] ${JSON.stringify(summary)}`);
  if (summary.errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[fatal] ${error.message}`);
  process.exitCode = 1;
});
