const admin = require("firebase-admin");
const ffmpegPath = require("ffmpeg-static");
const { GoogleAuth } = require("google-auth-library");
const { execFile } = require("node:child_process");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const fs = require("node:fs/promises");
const { logger } = require("firebase-functions");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const {
  FEEDBACK_CATEGORIES,
  FEEDBACK_ITEMS_BY_ID,
  ALL_ITEM_IDS,
  buildEmptyCategoryAverages,
} = require("./lib/feedbackAreas.cjs");

const execFileAsync = promisify(execFile);

admin.initializeApp();

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const geminiApiKey = defineSecret("GEMINI_API_KEY");
const DEFAULT_REGION = "us-central1";
const DEFAULT_MODEL = "gemini-2.5-flash";
const FILE_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const FILE_REGISTER_ENDPOINT = `${FILE_API_BASE}/files:register`;
const FILE_PROCESSING_POLL_MS = 3000;
const VIDEO_PROCESSING_MAX_WAIT_MS = 300000;
const MATERIAL_PROCESSING_MAX_WAIT_MS = 120000;
const RAW_CHIRP_STT_LOCATION = process.env.CHIRP_STT_LOCATION || "us";
const CHIRP_STT_MODEL = process.env.CHIRP_STT_MODEL || "chirp_3";
const CHIRP_STT_LANGUAGE = process.env.CHIRP_STT_LANGUAGE || "ko-KR";
const CHIRP_STT_WORD_TIME_OFFSET_MAX_SECONDS = Number(process.env.CHIRP_STT_WORD_TIME_OFFSET_MAX_SECONDS || 20 * 60);
const STT_OUTPUT_PREFIX = "speech-transcripts";
const GCS_READ_SCOPES = [
  "https://www.googleapis.com/auth/devstorage.read_only",
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/generative-language.retriever",
];

function resolveChirpSttLocation(location, model, languageCode) {
  const normalized = String(location || "us").trim().toLowerCase();
  if (model === "chirp_3" && languageCode === "ko-KR" && normalized === "global") {
    return "us";
  }
  return normalized || "us";
}

const CHIRP_STT_LOCATION = resolveChirpSttLocation(RAW_CHIRP_STT_LOCATION, CHIRP_STT_MODEL, CHIRP_STT_LANGUAGE);

function speechApiBaseForLocation(location) {
  return location === "global"
    ? "https://speech.googleapis.com/v2"
    : `https://${location}-speech.googleapis.com/v2`;
}

function speechApiBaseFromOperationName(operationName) {
  const location = String(operationName || "").match(/\/locations\/([^/]+)\//)?.[1] || CHIRP_STT_LOCATION;
  return speechApiBaseForLocation(location);
}

function extractJSON(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
  return fenced ? fenced[1] : text;
}

function calculateCategoryAverages(scores = {}) {
  return FEEDBACK_CATEGORIES.reduce((acc, category) => {
    const values = category.items
      .map((item) => scores[item.id])
      .filter((score) => typeof score === "number" && Number.isFinite(score));

    acc[category.id] = values.length
      ? Number((values.reduce((sum, score) => sum + score, 0) / values.length).toFixed(2))
      : null;

    return acc;
  }, {});
}

function calculateScoreAverage(scores = {}) {
  const values = Object.values(scores).filter((score) => typeof score === "number" && Number.isFinite(score));
  if (!values.length) return null;
  return Number((values.reduce((sum, score) => sum + score, 0) / values.length).toFixed(2));
}

function getApiKey() {
  const value = geminiApiKey.value() || process.env.GEMINI_API_KEY;
  if (!value) {
    throw new HttpsError("failed-precondition", "GEMINI_API_KEY secret이 설정되지 않았습니다.");
  }
  return value.trim();
}

function assertStoragePathBelongsToUser(storagePath, uid, label) {
  if (!storagePath || typeof storagePath !== "string") {
    throw new HttpsError("invalid-argument", `${label} Storage 경로가 필요합니다.`);
  }

  const allowedPrefixes = [
    `recordings/${uid}/`,
    `users/${uid}/presentation-materials/`,
  ];

  if (!allowedPrefixes.some((prefix) => storagePath.startsWith(prefix))) {
    throw new HttpsError("permission-denied", `${label} Storage 경로에 접근할 권한이 없습니다.`);
  }
}

function makeGcsUri(bucket, storagePath) {
  const cleanBucket = String(bucket || "").replace(/^gs:\/\//, "").replace(/\/+$/, "");
  const cleanPath = String(storagePath || "").replace(/^\/+/, "");
  if (!cleanBucket || !cleanPath) {
    throw new HttpsError("invalid-argument", "GCS URI를 만들 수 없습니다.");
  }
  return `gs://${cleanBucket}/${cleanPath}`;
}

function parseGcsUri(gcsUri) {
  const match = String(gcsUri || "").match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`GCS URI 형식이 올바르지 않습니다: ${gcsUri || "(empty)"}`);
  }
  return { bucket: match[1], path: match[2] };
}

function compactPathPart(value, fallback) {
  return String(value || fallback)
    .replace(/[^a-zA-Z0-9_.-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function makeTranscriptOutputUri(bucket, uid, presentationId, attemptId) {
  return makeGcsUri(bucket, [
    STT_OUTPUT_PREFIX,
    compactPathPart(uid, "unknown-user"),
    compactPathPart(presentationId, "unknown-presentation"),
    compactPathPart(attemptId, "unknown-attempt"),
    "",
  ].join("/"));
}

function makeTranscriptAudioUri(outputUri, sourceGcsUri) {
  const { bucket, path: outputPath } = parseGcsUri(outputUri);
  const sourcePath = parseGcsUri(sourceGcsUri).path;
  const parsed = path.parse(sourcePath);
  const audioPath = [
    outputPath.replace(/\/+$/, ""),
    "audio",
    `${compactPathPart(parsed.name, "input")}.wav`,
  ].join("/");
  return makeGcsUri(bucket, audioPath);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatSeconds(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(safeSeconds / 60);
  const secs = Math.floor(safeSeconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function parseDurationSeconds(value) {
  if (typeof value === "number") return value;
  if (!value || typeof value !== "string") return null;
  const match = value.match(/^(-?\d+(?:\.\d+)?)s$/);
  if (!match) return null;
  return Number(match[1]);
}

function parseDurationTextSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value || "").trim();
  if (!text) return null;

  const colonParts = text.split(":").map((part) => Number(part));
  if (colonParts.length >= 2 && colonParts.length <= 3 && colonParts.every((part) => Number.isFinite(part))) {
    return colonParts.reduce((total, part) => total * 60 + part, 0);
  }

  const compact = text.match(/(\d+(?:\.\d+)?)\s*(시간|hours?|hrs?|h|분|minutes?|mins?|m|초|seconds?|secs?|s)/gi);
  if (compact) {
    return compact.reduce((total, token) => {
      const [, amountText, unit] = token.match(/(\d+(?:\.\d+)?)\s*(시간|hours?|hrs?|h|분|minutes?|mins?|m|초|seconds?|secs?|s)/i) || [];
      const amount = Number(amountText);
      if (!Number.isFinite(amount)) return total;
      if (/^(시간|hours?|hrs?|h)$/i.test(unit)) return total + amount * 3600;
      if (/^(분|minutes?|mins?|m)$/i.test(unit)) return total + amount * 60;
      return total + amount;
    }, 0);
  }

  const minutes = text.match(/^(\d+(?:\.\d+)?)\s*분?$/);
  if (minutes) return Number(minutes[1]) * 60;
  return null;
}

function shouldEnableChirpWordTimeOffsets(durationText) {
  if (process.env.CHIRP_STT_ENABLE_WORD_TIME_OFFSETS === "false") return false;
  if (process.env.CHIRP_STT_ENABLE_WORD_TIME_OFFSETS === "true") return true;

  const durationSeconds = parseDurationTextSeconds(durationText);
  if (durationSeconds != null && durationSeconds > CHIRP_STT_WORD_TIME_OFFSET_MAX_SECONDS) {
    return false;
  }

  return true;
}

function makeTranscriptDigest(transcript, maxChars = 6000) {
  const utterances = transcript?.utterances || [];
  if (!utterances.length) return "";
  const lines = utterances.map((utt) => `[${utt.time}] ${utt.text}`).join("\n");
  if (lines.length <= maxChars) return lines;
  const head = lines.slice(0, Math.floor(maxChars * 0.7));
  const tail = lines.slice(-Math.floor(maxChars * 0.25));
  return `${head}\n... [발화록 중간 생략] ...\n${tail}`;
}

async function getGoogleAuthContext() {
  const auth = new GoogleAuth({ scopes: GCS_READ_SCOPES });
  const client = await auth.getClient();
  const tokenResult = await client.getAccessToken();
  const accessToken = typeof tokenResult === "string" ? tokenResult : tokenResult?.token;
  const projectId = await auth.getProjectId();

  if (!accessToken) {
    throw new Error("Google OAuth access token을 가져오지 못했습니다.");
  }

  return { accessToken, projectId };
}

async function fetchSpeechOperation(operationName, authContext) {
  const response = await fetch(`${speechApiBaseFromOperationName(operationName)}/${operationName}`, {
    headers: {
      Authorization: `Bearer ${authContext.accessToken}`,
      "x-goog-user-project": authContext.projectId,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `Speech operation 조회 실패: HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function normalizeSpeechResults(batchPayload, gcsUri) {
  if (Array.isArray(batchPayload?.results)) {
    const segments = batchPayload.results
      .map((result, index) => {
        const alternative = result.alternatives?.[0] || {};
        const words = Array.isArray(alternative.words)
          ? alternative.words
              .map((word) => ({
                word: word.word || "",
                startSec: parseDurationSeconds(word.startOffset),
                endSec: parseDurationSeconds(word.endOffset),
                speaker: word.speakerLabel || word.speakerTag || null,
              }))
              .filter((word) => word.word)
          : [];

        const startSec = words.find((word) => word.startSec != null)?.startSec
          ?? (index === 0 ? 0 : null);
        const endSec = [...words].reverse().find((word) => word.endSec != null)?.endSec
          ?? parseDurationSeconds(result.resultEndOffset)
          ?? startSec;

        return {
          text: alternative.transcript || "",
          languageCode: result.languageCode || "",
          startSec,
          endSec,
          words,
        };
      })
      .filter((segment) => segment.text || segment.words.length);

    return {
      segments,
      text: segments.map((segment) => segment.text).filter(Boolean).join("\n").trim(),
    };
  }

  const fileResult = batchPayload?.results?.[gcsUri] || Object.values(batchPayload?.results || {})[0] || null;
  const transcriptResults = fileResult?.transcript?.results || fileResult?.results || [];

  const segments = transcriptResults
    .map((result, index) => {
      const alternative = result.alternatives?.[0] || {};
      const words = Array.isArray(alternative.words)
        ? alternative.words
            .map((word) => ({
              word: word.word || "",
              startSec: parseDurationSeconds(word.startOffset),
              endSec: parseDurationSeconds(word.endOffset),
              speaker: word.speakerLabel || word.speakerTag || null,
            }))
            .filter((word) => word.word)
        : [];

      const startSec = words.find((word) => word.startSec != null)?.startSec
        ?? (index === 0 ? 0 : null);
      const endSec = [...words].reverse().find((word) => word.endSec != null)?.endSec
        ?? parseDurationSeconds(result.resultEndOffset)
        ?? startSec;

      return {
        text: alternative.transcript || "",
        languageCode: result.languageCode || "",
        startSec,
        endSec,
        words,
      };
    })
    .filter((segment) => segment.text || segment.words.length);

  return {
    segments,
    text: segments.map((segment) => segment.text).filter(Boolean).join("\n").trim(),
  };
}

function buildTranscriptFromBatchPayload(batchPayload, gcsUri, extra = {}) {
  const normalized = normalizeSpeechResults(batchPayload, gcsUri);
  const utterances = wordsToUtterances(normalized.segments);
  return {
    model: CHIRP_STT_MODEL,
    languageCode: CHIRP_STT_LANGUAGE,
    location: CHIRP_STT_LOCATION,
    text: normalized.text || utterances.map((utterance) => utterance.text).join("\n").trim(),
    utterances,
    segmentCount: normalized.segments.length,
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

function wordsToUtterances(segments) {
  const utterances = [];
  let current = null;
  const maxUtteranceSeconds = 18;
  const pauseBreakSeconds = 1.1;

  const flush = () => {
    if (!current || !current.words.length) return;
    const text = current.words.map((word) => word.word).join(" ").replace(/\s+([,.!?;:])/g, "$1").trim();
    if (!text) {
      current = null;
      return;
    }
    const startSec = current.startSec ?? 0;
    const endSec = current.endSec ?? startSec;
    utterances.push({
      startSec,
      endSec,
      time: formatSeconds(startSec),
      speaker: current.speaker || null,
      text,
    });
    current = null;
  };

  for (const segment of segments) {
    if (!segment.words.length) continue;
    for (const word of segment.words) {
      const wordStart = word.startSec ?? current?.endSec ?? segment.startSec ?? 0;
      const wordEnd = word.endSec ?? wordStart;
      const lastEnd = current?.endSec ?? null;
      const gap = lastEnd == null ? 0 : wordStart - lastEnd;
      const elapsed = current ? wordEnd - current.startSec : 0;
      const changedSpeaker = current?.speaker && word.speaker && current.speaker !== word.speaker;
      const previousWord = current?.words[current.words.length - 1]?.word || "";
      const sentenceEnded = /[.!?。？！]$/.test(previousWord);

      if (current && (changedSpeaker || gap > pauseBreakSeconds || elapsed > maxUtteranceSeconds || (sentenceEnded && elapsed > 4))) {
        flush();
      }

      if (!current) {
        current = {
          startSec: wordStart,
          endSec: wordEnd,
          speaker: word.speaker || null,
          words: [],
        };
      }

      current.words.push(word);
      current.endSec = wordEnd;
      if (!current.speaker && word.speaker) current.speaker = word.speaker;
    }
  }
  flush();

  if (utterances.length) return utterances;

  return segments
    .filter((segment) => segment.text)
    .map((segment, index) => {
      const startSec = segment.startSec ?? 0;
      const endSec = segment.endSec ?? startSec;
      return {
        startSec,
        endSec,
        time: formatSeconds(startSec),
        speaker: null,
        text: segment.text,
        index,
      };
    });
}

async function extractSpeechAudioToWav(sourceGcsUri, outputUri) {
  if (!ffmpegPath) {
    throw new Error("ffmpeg binary를 찾지 못해 STT용 오디오를 추출할 수 없습니다.");
  }

  const source = parseGcsUri(sourceGcsUri);
  const audioGcsUri = makeTranscriptAudioUri(outputUri, sourceGcsUri);
  const audio = parseGcsUri(audioGcsUri);
  const tempPrefix = `chirp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const sourceExt = path.extname(source.path) || ".mp4";
  const tempVideoPath = path.join(os.tmpdir(), `${tempPrefix}${sourceExt}`);
  const tempAudioPath = path.join(os.tmpdir(), `${tempPrefix}.wav`);

  try {
    await admin.storage().bucket(source.bucket).file(source.path).download({ destination: tempVideoPath });
    await execFileAsync(ffmpegPath, [
      "-y",
      "-i", tempVideoPath,
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-c:a", "pcm_s16le",
      tempAudioPath,
    ], { timeout: 480000, maxBuffer: 1024 * 1024 * 8 });

    await admin.storage().bucket(audio.bucket).upload(tempAudioPath, {
      destination: audio.path,
      metadata: {
        contentType: "audio/wav",
        metadata: {
          sourceVideoUri: sourceGcsUri,
          generatedFor: "chirp-stt",
        },
      },
    });

    return audioGcsUri;
  } catch (error) {
    throw new Error(`STT용 오디오 추출 실패: ${error.stderr || error.message}`);
  } finally {
    await Promise.all([
      fs.unlink(tempVideoPath).catch(() => {}),
      fs.unlink(tempAudioPath).catch(() => {}),
    ]);
  }
}

async function startChirpBatchTranscription(gcsUri, outputUri, authContext, options = {}) {
  const enableWordTimeOffsets = shouldEnableChirpWordTimeOffsets(options.duration);
  const recognizer = `projects/${authContext.projectId}/locations/${CHIRP_STT_LOCATION}/recognizers/_`;
  const response = await fetch(
    `${speechApiBaseForLocation(CHIRP_STT_LOCATION)}/${recognizer}:batchRecognize`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authContext.accessToken}`,
        "x-goog-user-project": authContext.projectId,
      },
      body: JSON.stringify({
        config: {
          autoDecodingConfig: {},
          languageCodes: [CHIRP_STT_LANGUAGE],
          model: CHIRP_STT_MODEL,
          features: {
            enableAutomaticPunctuation: true,
            enableWordTimeOffsets,
          },
        },
        configMask: "*",
        files: [{ uri: gcsUri }],
        recognitionOutputConfig: {
          gcsOutputConfig: {
            uri: outputUri,
          },
        },
      }),
    }
  );

  const operation = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = operation?.error?.message || `Speech-to-Text 요청 실패: HTTP ${response.status}`;
    throw new Error(message);
  }
  if (!operation.name) {
    throw new Error("Speech-to-Text operation 이름을 확인하지 못했습니다.");
  }

  return {
    name: operation.name,
    inputUri: gcsUri,
    outputUri,
    model: CHIRP_STT_MODEL,
    languageCode: CHIRP_STT_LANGUAGE,
    location: CHIRP_STT_LOCATION,
    requestedLocation: RAW_CHIRP_STT_LOCATION,
    sourceVideoUri: options.sourceVideoUri || "",
    wordTimeOffsets: enableWordTimeOffsets,
    createdAt: new Date().toISOString(),
  };
}

async function downloadJsonFromGcsUri(gcsUri) {
  const { bucket, path } = parseGcsUri(gcsUri);
  const [buffer] = await admin.storage().bucket(bucket).file(path).download();
  return JSON.parse(buffer.toString("utf8"));
}

async function resolveChirpBatchTranscript(operationInfo, authContext) {
  if (!operationInfo?.name) {
    return { done: true, transcript: null };
  }

  const current = await fetchSpeechOperation(operationInfo.name, authContext);
  if (!current.done) {
    return { done: false, operation: current };
  }

  if (current.error) {
    return {
      done: true,
      transcript: {
        error: current.error.message || "Chirp STT operation이 실패했습니다.",
        model: CHIRP_STT_MODEL,
        languageCode: CHIRP_STT_LANGUAGE,
        location: CHIRP_STT_LOCATION,
        text: "",
        utterances: [],
      },
    };
  }

  const fileResult = current.response?.results?.[operationInfo.inputUri]
    || Object.values(current.response?.results || {})[0]
    || null;

  const outputResultUri = fileResult?.uri || fileResult?.cloudStorageResult?.uri || "";
  if (fileResult?.error) {
    return {
      done: true,
      transcript: {
        error: fileResult.error.message || "Chirp STT 파일 인식이 실패했습니다.",
        errorCode: fileResult.error.code || null,
        model: CHIRP_STT_MODEL,
        languageCode: CHIRP_STT_LANGUAGE,
        location: CHIRP_STT_LOCATION,
        inputUri: operationInfo.inputUri,
        sourceVideoUri: operationInfo.sourceVideoUri || "",
        outputUri: outputResultUri || operationInfo.outputUri || "",
        text: "",
        utterances: [],
      },
    };
  }

  const batchPayload = outputResultUri
    ? await downloadJsonFromGcsUri(outputResultUri)
    : current.response;

  return {
    done: true,
    transcript: buildTranscriptFromBatchPayload(batchPayload, operationInfo.inputUri, {
      operationName: operationInfo.name,
      outputUri: outputResultUri || operationInfo.outputUri || "",
    }),
  };
}

function normalizeGeminiFile(file, fallbackUri, fallbackMimeType) {
  return {
    name: file.name,
    uri: file.uri || file.fileUri || fallbackUri,
    mimeType: file.mimeType || file.mime_type || fallbackMimeType,
    state: file.state,
  };
}

async function fetchRegisteredFile(fileName, authContext, fallbackUri, fallbackMimeType) {
  const response = await fetch(`${FILE_API_BASE}/${fileName}`, {
    headers: {
      Authorization: `Bearer ${authContext.accessToken}`,
      "x-goog-user-project": authContext.projectId,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `등록 파일 상태 조회 실패: HTTP ${response.status}`;
    throw new Error(message);
  }

  return normalizeGeminiFile(payload, fallbackUri, fallbackMimeType);
}

async function waitForActiveRegisteredFile(file, authContext, { maxWaitMs, label, fallbackUri, fallbackMimeType }) {
  if (!file.name) {
    throw new Error(`${label} 등록 파일 이름을 확인하지 못했습니다.`);
  }

  const startedAt = Date.now();
  let current = file;

  while (current.state !== "ACTIVE" && Date.now() - startedAt < maxWaitMs) {
    await sleep(FILE_PROCESSING_POLL_MS);
    current = await fetchRegisteredFile(file.name, authContext, fallbackUri, fallbackMimeType);
    logger.info("[analysis] Waiting for registered file", {
      label,
      fileName: file.name,
      fileState: current.state || "STATE_UNSPECIFIED",
      elapsedMs: Date.now() - startedAt,
    });
  }

  if (current.state === "FAILED") {
    throw new Error(`${label} 파일 처리에 실패했습니다.`);
  }

  if (current.state !== "ACTIVE") {
    const seconds = Math.round(maxWaitMs / 1000);
    throw new Error(`${label} 파일이 ${seconds}초 안에 ACTIVE 상태가 되지 않았습니다. 현재 상태: ${current.state || "STATE_UNSPECIFIED"}`);
  }

  return current;
}

async function registerGcsFile(gcsUri, fallbackMimeType, { maxWaitMs, label, authContext }) {
  const fileAuthContext = authContext || await getGoogleAuthContext();

  const response = await fetch(FILE_REGISTER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${fileAuthContext.accessToken}`,
      "x-goog-user-project": fileAuthContext.projectId,
    },
    body: JSON.stringify({ uris: [gcsUri] }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `GCS 파일 등록 실패: HTTP ${response.status}`;
    throw new Error(message);
  }

  const file = payload.files?.[0] || payload.file || payload;
  const registeredFile = normalizeGeminiFile(file, gcsUri, fallbackMimeType);

  logger.info("[analysis] Registered file", {
    label,
    fileName: registeredFile.name,
    fileState: registeredFile.state || "STATE_UNSPECIFIED",
    mimeType: registeredFile.mimeType,
  });

  return waitForActiveRegisteredFile(registeredFile, fileAuthContext, {
    maxWaitMs,
    label,
    fallbackUri: gcsUri,
    fallbackMimeType,
  });
}

async function generateContent(apiKey, model, parts, authContext) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (authContext?.accessToken) {
    headers.Authorization = `Bearer ${authContext.accessToken}`;
    headers["x-goog-user-project"] = authContext.projectId;
  } else {
    headers["x-goog-api-key"] = apiKey;
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
      }),
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `Gemini 요청 실패: HTTP ${response.status}`;
    throw new Error(message);
  }

  return (payload.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || "")
    .join("")
    .trim();
}

function filePart(file) {
  return {
    file_data: {
      mime_type: file.mimeType,
      file_uri: file.uri,
    },
  };
}

async function analyzeCategory(apiKey, model, videoFile, category, meta, authContext, transcript = null) {
  const rubric = category.items
    .map((it) => `   - [${it.id}] ${it.label}: ${it.desc}`)
    .join("\n");
  const itemLabels = category.items.map((it) => it.label).join(", ");
  const scoreKeys = category.items.map((it) => `"${it.id}": 1~5 사이 정수`).join(", ");
  const minTs = Math.max(3, category.items.length);
  const maxTs = Math.max(minTs, 7);
  const transcriptDigest = makeTranscriptDigest(transcript);
  const transcriptBlock = transcriptDigest
    ? `
Chirp 3 STT 발화록:
${transcriptDigest}
`
    : "";

  const prompt = `당신은 발표(프레젠테이션) 분석 전문가입니다.
발표 영상에서 "${category.label}" (${category.shortLabel}) 영역만 집중 분석해주세요.

발표 정보:
- 주제: ${meta.topic || "미지정"}
- 청중: ${meta.audience || "미지정"}
- 발표 시간: ${meta.duration || "미지정"}
${transcriptBlock}

이 영역의 평가 항목 ([id] 이름: 설명):
${rubric}

다음 JSON 형식으로만 응답하세요 (순수 JSON, 다른 텍스트 없이):
{
  "timestamps": [
    {
      "time": "MM:SS",
      "seconds": 초단위숫자,
      "category": "${category.label}",
      "item": "항목명",
      "feedback": "구체적인 관찰 내용과 피드백"
    }
  ],
  "scores": {
    ${scoreKeys}
  }
}

주의사항:
1. 이 영역의 항목(${itemLabels})에 대해서만 분석하세요.
2. timestamps는 영상 전체에서 ${minTs}~${maxTs}개를 고르게 선정하세요. 각 평가 항목마다 최소 1개 이상 포함하세요.
3. item 값은 위 항목명을 철자·공백·부호까지 완전히 동일하게 사용하세요. 영어나 약어를 사용하지 마세요.
4. scores의 키는 반드시 위 대괄호 안의 id를 그대로 사용하고, 값은 1(매우 미흡)~5(매우 우수) 정수로 평가하세요.
5. 구체적이고 건설적인 피드백을 작성하세요.
6. Chirp 3 STT 발화록이 제공된 경우 내용·조직 관련 근거와 시간은 발화록을 우선 참고하세요. 단, 표현 영역은 영상의 음성·시선·자세도 함께 관찰하세요.
7. 한국어로 응답하세요.`;

  const text = await generateContent(apiKey, model, [filePart(videoFile), { text: prompt }], authContext);
  const parsed = JSON.parse(extractJSON(text).trim());
  return {
    timestamps: Array.isArray(parsed.timestamps) ? parsed.timestamps : [],
    scores: parsed.scores && typeof parsed.scores === "object" ? parsed.scores : {},
  };
}

async function analyzeSummary(apiKey, model, videoFile, activeCategories, meta, authContext, transcript = null) {
  const categoryLabels = activeCategories.map((c) => `${c.icon} ${c.label}`).join(", ");
  const rubric = activeCategories
    .map((category) => {
      const items = category.items
        .map((item) => `  - [${item.id}] ${item.label}: ${item.desc}`)
        .join("\n");
      return `${category.label}\n${items}`;
    })
    .join("\n\n");
  const transcriptDigest = makeTranscriptDigest(transcript, 8000);
  const transcriptBlock = transcriptDigest
    ? `
Chirp 3 STT 발화록:
${transcriptDigest}
`
    : "";

  const prompt = `당신은 발표(프레젠테이션) 분석 전문가입니다.
발표 영상 전체를 종합 평가하고 요약 피드백을 제공해주세요.

발표 정보:
- 주제: ${meta.topic || "미지정"}
- 청중: ${meta.audience || "미지정"}
- 발표 시간: ${meta.duration || "미지정"}
- 평가 영역: ${categoryLabels}
${transcriptBlock}

평가 기준:
${rubric}

다음 JSON 형식으로만 응답하세요 (순수 JSON):
{
  "summary": {
    "overall": "전체 발표에 대한 종합 피드백 (3-4문장)",
    "strengths": ["강점 1", "강점 2", "강점 3"],
    "suggestions": ["개선 제안 1", "개선 제안 2", "개선 제안 3"]
  }
}

주의사항:
1. 위 평가 기준의 내용, 조직, 표현 영역을 모두 고려하세요.
2. strengths와 suggestions는 가능하면 특정 하위 영역명을 언급해 작성하세요.
3. Chirp 3 STT 발화록이 제공된 경우 발표 내용의 흐름과 표현의 언어적 근거를 함께 반영하세요.
4. 한국어로 응답하세요.`;

  const text = await generateContent(apiKey, model, [filePart(videoFile), { text: prompt }], authContext);
  const parsed = JSON.parse(extractJSON(text).trim());
  return parsed.summary ?? { overall: "", strengths: [], suggestions: [] };
}

async function analyzeMaterial(apiKey, model, videoFile, materialFile, authContext) {
  const prompt = `발표 자료(PDF)와 실제 발표 영상의 정합성을 분석해주세요.

다음 JSON 형식으로만 응답하세요 (순수 JSON):
{
  "materialAnalysis": {
    "overallConsistency": "높음 또는 보통 또는 낮음",
    "summary": "발표 자료와 실제 발표의 정합성에 대한 2-3문장 평가",
    "matches": ["자료와 일치한 부분 1", "부분 2"],
    "deviations": ["자료와 달랐던 부분 (없으면 빈 배열)"],
    "suggestions": ["자료 활용 개선 제안 1", "제안 2"]
  }
}

한국어로 응답하세요.`;

  const text = await generateContent(apiKey, model, [
    filePart(videoFile),
    filePart(materialFile),
    { text: prompt },
  ], authContext);
  const parsed = JSON.parse(extractJSON(text).trim());
  return parsed.materialAnalysis ?? null;
}

async function analyzeConditions(apiKey, model, videoFile, conditions, authContext) {
  const conditionList = conditions.map((c, i) => `${i + 1}. ${c}`).join("\n");
  const prompt = `발표 영상에서 다음 조건들이 충족되었는지 판단해주세요.
${conditionList}

다음 JSON 형식으로만 응답하세요 (순수 JSON):
{
  "conditionsAnalysis": [
    { "condition": "조건 내용", "fulfilled": true, "evidence": "근거", "timestamp": "MM:SS 또는 null" }
  ]
}

한국어로 응답하세요.`;

  const text = await generateContent(apiKey, model, [filePart(videoFile), { text: prompt }], authContext);
  const parsed = JSON.parse(extractJSON(text).trim());
  return Array.isArray(parsed.conditionsAnalysis) ? parsed.conditionsAnalysis : [];
}

function buildAnalysisJob(data, video) {
  return {
    video: {
      bucket: video.bucket || "",
      storagePath: video.storagePath || "",
      videoUrl: video.videoUrl || "",
      fileName: video.fileName || "",
      mimeType: video.mimeType || "video/mp4",
    },
    material: data.material || null,
    model: data.model || process.env.GEMINI_MODEL || DEFAULT_MODEL,
    meta: {
      topic: data.topic || "",
      audience: data.audience || "",
      duration: data.duration || "",
    },
    feedbackItems: Array.isArray(data.feedbackItems) ? data.feedbackItems : [],
    conditions: Array.isArray(data.conditions) ? data.conditions : [],
    simulation: data.simulation || null,
  };
}

async function runPresentationAnalysisJob({ uid, presentationId, attemptId, job, transcript }) {
  const attemptRef = db.doc(`users/${uid}/presentations/${presentationId}/attempts/${attemptId}`);
  const presentationRef = db.doc(`users/${uid}/presentations/${presentationId}`);
  const apiKey = getApiKey();
  const authContext = await getGoogleAuthContext();
  const video = job.video || {};
  const material = job.material || null;
  const model = job.model || process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const meta = job.meta || {};

  assertStoragePathBelongsToUser(video.storagePath, uid, "영상");
  const videoGcsUri = makeGcsUri(video.bucket, video.storagePath);

  await attemptRef.set({
    status: "analyzing",
    analysisStage: "gemini",
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  logger.info("[analysis] Registering video", { uid, presentationId, attemptId, videoGcsUri });
  const videoFile = await registerGcsFile(videoGcsUri, video.mimeType || "video/mp4", {
    maxWaitMs: VIDEO_PROCESSING_MAX_WAIT_MS,
    label: "영상",
    authContext,
  });

  let materialFile = null;
  if (material?.storagePath) {
    try {
      assertStoragePathBelongsToUser(material.storagePath, uid, "발표 자료");
      const materialGcsUri = makeGcsUri(material.bucket || video.bucket, material.storagePath);
      materialFile = await registerGcsFile(materialGcsUri, material.mimeType || "application/pdf", {
        maxWaitMs: MATERIAL_PROCESSING_MAX_WAIT_MS,
        label: "발표 자료",
        authContext,
      });
    } catch (error) {
      logger.warn("[analysis] Material registration failed; continuing without material", {
        errorMessage: error.message,
      });
    }
  }

  const activeItemIds = Array.isArray(job.feedbackItems) && job.feedbackItems.length > 0
    ? job.feedbackItems.filter((id) => FEEDBACK_ITEMS_BY_ID[id])
    : ALL_ITEM_IDS;

  const activeCategories = FEEDBACK_CATEGORIES
    .map((cat) => ({
      ...cat,
      items: cat.items.filter((it) => activeItemIds.includes(it.id)),
    }))
    .filter((cat) => cat.items.length > 0);

  logger.info("[analysis] Starting Gemini analysis", {
    categoryCount: activeCategories.length,
    hasMaterial: Boolean(materialFile),
    transcriptUtteranceCount: transcript?.utterances?.length || 0,
    conditionCount: Array.isArray(job.conditions) ? job.conditions.length : 0,
  });

  const categoryPromises = activeCategories.map((cat) =>
    analyzeCategory(apiKey, model, videoFile, cat, meta, authContext, transcript).catch((error) => {
      logger.error("[analysis] Category failed", { category: cat.id, errorMessage: error.message });
      return { timestamps: [], scores: {} };
    })
  );

  const summaryPromise = analyzeSummary(apiKey, model, videoFile, activeCategories, meta, authContext, transcript)
    .catch((error) => {
      logger.error("[analysis] Summary failed", { errorMessage: error.message });
      return { overall: "", strengths: [], suggestions: [] };
    });

  const materialPromise = materialFile
    ? analyzeMaterial(apiKey, model, videoFile, materialFile, authContext).catch((error) => {
      logger.error("[analysis] Material analysis failed", { errorMessage: error.message });
      return null;
    })
    : Promise.resolve(null);

  const conditions = Array.isArray(job.conditions) ? job.conditions : [];
  const conditionsPromise = conditions.length > 0
    ? analyzeConditions(apiKey, model, videoFile, conditions, authContext).catch((error) => {
      logger.error("[analysis] Conditions analysis failed", { errorMessage: error.message });
      return [];
    })
    : Promise.resolve([]);

  const [categoryResults, summary, materialAnalysis, conditionsAnalysis] = await Promise.all([
    Promise.all(categoryPromises),
    summaryPromise,
    materialPromise,
    conditionsPromise,
  ]);

  const allTimestamps = categoryResults
    .flatMap((result) => result.timestamps)
    .sort((a, b) => (a.seconds ?? 0) - (b.seconds ?? 0));
  const scores = Object.assign({}, ...categoryResults.map((result) => result.scores));
  const analysisResult = { timestamps: allTimestamps, scores, summary };
  if (transcript) analysisResult.transcript = transcript;
  if (materialAnalysis) analysisResult.materialAnalysis = materialAnalysis;
  if (conditionsAnalysis.length > 0) analysisResult.conditionsAnalysis = conditionsAnalysis;

  const hasSummary = Boolean(
    summary?.overall ||
    summary?.strengths?.length ||
    summary?.suggestions?.length
  );
  const hasAnyResult = allTimestamps.length > 0 || Object.keys(scores).length > 0 || hasSummary;
  if (!hasAnyResult) {
    throw new Error("Gemini 분석 결과가 모두 비어 있습니다. 함수 로그의 Category failed/Summary failed 메시지를 확인해주세요.");
  }

  const scoreAverage = calculateScoreAverage(scores);
  const categoryAverages = calculateCategoryAverages(scores);
  const completedPatch = {
    status: "completed",
    analysisStage: "completed",
    analysisResult,
    scoreAverage,
    categoryAverages,
    completedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (job.simulation) completedPatch.simulation = job.simulation;

  await attemptRef.set(completedPatch, { merge: true });
  await presentationRef.set({
    latestAttemptId: attemptId,
    latestScoreAverage: scoreAverage,
    categoryAverages: categoryAverages || buildEmptyCategoryAverages(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  logger.info("[analysis] Completed", {
    uid,
    presentationId,
    attemptId,
    timestampCount: allTimestamps.length,
  });

  return analysisResult;
}

async function failAttempt(uid, presentationId, attemptId, errorMessage, patch = {}) {
  if (!presentationId || !attemptId) return;
  await db
    .doc(`users/${uid}/presentations/${presentationId}/attempts/${attemptId}`)
    .set({
      ...patch,
      status: "failed",
      errorMessage: errorMessage || "처리 중 오류가 발생했습니다.",
      failedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
}

exports.analyzePresentationFromStorage = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: 540,
    memory: "1GiB",
    concurrency: 1,
    maxInstances: 5,
    secrets: [geminiApiKey],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const data = request.data || {};
    const presentationId = data.presentationId;
    const attemptId = data.attemptId;
    const video = data.video || {};
    const material = data.material || null;

    if (!presentationId || !attemptId) {
      throw new HttpsError("invalid-argument", "presentationId와 attemptId가 필요합니다.");
    }

    const attemptRef = db.doc(`users/${uid}/presentations/${presentationId}/attempts/${attemptId}`);
    const job = buildAnalysisJob(data, video);

    try {
      const existingAttemptSnap = await attemptRef.get();
      const existingAttempt = existingAttemptSnap.exists ? existingAttemptSnap.data() || {} : {};
      if (existingAttempt.status === "completed" && existingAttempt.analysisResult) {
        return { analysisResult: existingAttempt.analysisResult };
      }
      if (
        existingAttempt.status === "analyzing" &&
        existingAttempt.analysisStage === "transcribing" &&
        existingAttempt.transcript?.operation?.name
      ) {
        return {
          pending: true,
          stage: "transcribing",
          operationName: existingAttempt.transcript.operation.name,
        };
      }
      if (
        existingAttempt.status === "analyzing" &&
        existingAttempt.analysisStage === "gemini" &&
        existingAttempt.analysisJob?.video?.storagePath
      ) {
        return {
          pending: true,
          stage: "gemini",
        };
      }
      if (existingAttempt.status === "failed") {
        throw new HttpsError("failed-precondition", existingAttempt.errorMessage || "분석이 실패한 회차입니다.");
      }

      const authContext = await getGoogleAuthContext();

      assertStoragePathBelongsToUser(video.storagePath, uid, "영상");
      const videoGcsUri = makeGcsUri(video.bucket, video.storagePath);
      const transcriptOutputUri = makeTranscriptOutputUri(video.bucket, uid, presentationId, attemptId);

      await attemptRef.set({
        status: "analyzing",
        analysisStage: process.env.ENABLE_CHIRP_STT === "false" ? "gemini" : "transcribing",
        analysisJob: job,
        video: {
          bucket: video.bucket,
          storagePath: video.storagePath,
          videoUrl: video.videoUrl || "",
          fileName: video.fileName || "",
          mimeType: video.mimeType || "video/mp4",
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      if (process.env.ENABLE_CHIRP_STT === "false") {
        const analysisResult = await runPresentationAnalysisJob({
          uid,
          presentationId,
          attemptId,
          job,
          transcript: null,
        });
        return { analysisResult };
      }

      const speechAudioGcsUri = await extractSpeechAudioToWav(videoGcsUri, transcriptOutputUri);
      const speechOperation = await startChirpBatchTranscription(speechAudioGcsUri, transcriptOutputUri, authContext, {
        duration: data.duration,
        sourceVideoUri: videoGcsUri,
      });
      await attemptRef.set({
        transcript: {
          status: "processing",
          operation: speechOperation,
          updatedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      logger.info("[stt] Chirp batch transcription started", {
        uid,
        presentationId,
        attemptId,
        operation: speechOperation.name,
        inputUri: speechAudioGcsUri,
        outputUri: transcriptOutputUri,
        sourceVideoUri: videoGcsUri,
        location: speechOperation.location,
        requestedLocation: speechOperation.requestedLocation,
        wordTimeOffsets: speechOperation.wordTimeOffsets,
      });

      return {
        pending: true,
        stage: "transcribing",
        operationName: speechOperation.name,
      };
    } catch (error) {
      logger.error("[analysis] Failed", {
        uid,
        presentationId,
        attemptId,
        errorMessage: error.message,
      });
      await failAttempt(uid, presentationId, attemptId, error.message, data.simulation ? { simulation: data.simulation } : {});
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", `영상 분석 중 오류가 발생했습니다: ${error.message}`);
    }
  }
);

exports.resumePresentationAnalysis = onCall(
  {
    region: DEFAULT_REGION,
    timeoutSeconds: 540,
    memory: "1GiB",
    concurrency: 1,
    maxInstances: 5,
    secrets: [geminiApiKey],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const data = request.data || {};
    const presentationId = data.presentationId;
    const attemptId = data.attemptId;

    if (!presentationId || !attemptId) {
      throw new HttpsError("invalid-argument", "presentationId와 attemptId가 필요합니다.");
    }

    const attemptRef = db.doc(`users/${uid}/presentations/${presentationId}/attempts/${attemptId}`);

    try {
      const attemptSnap = await attemptRef.get();
      if (!attemptSnap.exists) {
        throw new HttpsError("not-found", "분석 회차를 찾을 수 없습니다.");
      }

      const attempt = attemptSnap.data() || {};
      if (attempt.status === "completed" && attempt.analysisResult) {
        return { analysisResult: attempt.analysisResult };
      }
      if (attempt.status === "failed") {
        throw new HttpsError("failed-precondition", attempt.errorMessage || "분석이 실패한 회차입니다.");
      }

      const job = attempt.analysisJob;
      if (!job?.video?.storagePath) {
        throw new Error("이어받을 분석 작업 정보를 찾지 못했습니다.");
      }

      const authContext = await getGoogleAuthContext();
      const operationInfo = attempt.transcript?.operation || null;
      let transcript = null;

      if (process.env.ENABLE_CHIRP_STT !== "false" && operationInfo?.name) {
        const resolved = await resolveChirpBatchTranscript(operationInfo, authContext);
        if (!resolved.done) {
          await attemptRef.set({
            status: "analyzing",
            analysisStage: "transcribing",
            transcript: {
              ...(attempt.transcript || {}),
              status: "processing",
              updatedAt: FieldValue.serverTimestamp(),
            },
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });

          return {
            pending: true,
            stage: "transcribing",
            operationName: operationInfo.name,
          };
        }

        transcript = resolved.transcript;
        await attemptRef.set({
          analysisStage: "gemini",
          transcript: {
            ...(attempt.transcript || {}),
            status: transcript?.error ? "failed" : "completed",
            result: transcript || null,
            error: transcript?.error || null,
            updatedAt: FieldValue.serverTimestamp(),
          },
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      const analysisResult = await runPresentationAnalysisJob({
        uid,
        presentationId,
        attemptId,
        job,
        transcript,
      });

      return { analysisResult };
    } catch (error) {
      logger.error("[analysis] Resume failed", {
        uid,
        presentationId,
        attemptId,
        errorMessage: error.message,
      });

      if (error instanceof HttpsError) throw error;

      const attemptSnap = await attemptRef.get().catch(() => null);
      const attempt = attemptSnap?.exists ? attemptSnap.data() : {};
      await failAttempt(uid, presentationId, attemptId, error.message, attempt?.analysisJob?.simulation ? {
        simulation: attempt.analysisJob.simulation,
      } : {});
      throw new HttpsError("internal", `영상 분석을 이어서 처리하는 중 오류가 발생했습니다: ${error.message}`);
    }
  }
);
