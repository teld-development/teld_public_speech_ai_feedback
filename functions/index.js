const admin = require("firebase-admin");
const { GoogleAuth } = require("google-auth-library");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const {
  FEEDBACK_CATEGORIES,
  FEEDBACK_ITEMS_BY_ID,
  ALL_ITEM_IDS,
  buildEmptyCategoryAverages,
} = require("./lib/feedbackAreas.cjs");

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
const GCS_READ_SCOPES = [
  "https://www.googleapis.com/auth/devstorage.read_only",
  "https://www.googleapis.com/auth/cloud-platform",
];

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  while (current.state === "PROCESSING" && Date.now() - startedAt < maxWaitMs) {
    await sleep(FILE_PROCESSING_POLL_MS);
    current = await fetchRegisteredFile(file.name, authContext, fallbackUri, fallbackMimeType);
    logger.info("[analysis] Waiting for registered file", {
      label,
      fileName: file.name,
      state: current.state,
      elapsedMs: Date.now() - startedAt,
    });
  }

  if (current.state === "FAILED") {
    throw new Error(`${label} 파일 처리에 실패했습니다.`);
  }

  if (current.state === "PROCESSING") {
    const seconds = Math.round(maxWaitMs / 1000);
    throw new Error(`${label} 파일 처리 시간이 ${seconds}초를 초과했습니다. 더 짧은 영상으로 다시 시도해주세요.`);
  }

  return current;
}

async function registerGcsFile(gcsUri, fallbackMimeType, { maxWaitMs, label }) {
  const authContext = await getGoogleAuthContext();

  const response = await fetch(FILE_REGISTER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authContext.accessToken}`,
      "x-goog-user-project": authContext.projectId,
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
    state: registeredFile.state,
    mimeType: registeredFile.mimeType,
  });

  return waitForActiveRegisteredFile(registeredFile, authContext, {
    maxWaitMs,
    label,
    fallbackUri: gcsUri,
    fallbackMimeType,
  });
}

async function generateContent(apiKey, model, parts) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
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

async function analyzeCategory(apiKey, model, videoFile, category, meta) {
  const rubric = category.items
    .map((it) => `   - [${it.id}] ${it.label}: ${it.desc}`)
    .join("\n");
  const itemLabels = category.items.map((it) => it.label).join(", ");
  const scoreKeys = category.items.map((it) => `"${it.id}": 1~5 사이 정수`).join(", ");
  const minTs = Math.max(3, category.items.length);
  const maxTs = Math.max(minTs, 7);

  const prompt = `당신은 발표(프레젠테이션) 분석 전문가입니다.
발표 영상에서 "${category.label}" (${category.shortLabel}) 영역만 집중 분석해주세요.

발표 정보:
- 주제: ${meta.topic || "미지정"}
- 청중: ${meta.audience || "미지정"}
- 발표 시간: ${meta.duration || "미지정"}

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
6. 한국어로 응답하세요.`;

  const text = await generateContent(apiKey, model, [filePart(videoFile), { text: prompt }]);
  const parsed = JSON.parse(extractJSON(text).trim());
  return {
    timestamps: Array.isArray(parsed.timestamps) ? parsed.timestamps : [],
    scores: parsed.scores && typeof parsed.scores === "object" ? parsed.scores : {},
  };
}

async function analyzeSummary(apiKey, model, videoFile, activeCategories, meta) {
  const categoryLabels = activeCategories.map((c) => `${c.icon} ${c.label}`).join(", ");
  const rubric = activeCategories
    .map((category) => {
      const items = category.items
        .map((item) => `  - [${item.id}] ${item.label}: ${item.desc}`)
        .join("\n");
      return `${category.label}\n${items}`;
    })
    .join("\n\n");

  const prompt = `당신은 발표(프레젠테이션) 분석 전문가입니다.
발표 영상 전체를 종합 평가하고 요약 피드백을 제공해주세요.

발표 정보:
- 주제: ${meta.topic || "미지정"}
- 청중: ${meta.audience || "미지정"}
- 발표 시간: ${meta.duration || "미지정"}
- 평가 영역: ${categoryLabels}

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
3. 한국어로 응답하세요.`;

  const text = await generateContent(apiKey, model, [filePart(videoFile), { text: prompt }]);
  const parsed = JSON.parse(extractJSON(text).trim());
  return parsed.summary ?? { overall: "", strengths: [], suggestions: [] };
}

async function analyzeMaterial(apiKey, model, videoFile, materialFile) {
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
  ]);
  const parsed = JSON.parse(extractJSON(text).trim());
  return parsed.materialAnalysis ?? null;
}

async function analyzeConditions(apiKey, model, videoFile, conditions) {
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

  const text = await generateContent(apiKey, model, [filePart(videoFile), { text: prompt }]);
  const parsed = JSON.parse(extractJSON(text).trim());
  return Array.isArray(parsed.conditionsAnalysis) ? parsed.conditionsAnalysis : [];
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
    const presentationRef = db.doc(`users/${uid}/presentations/${presentationId}`);
    const apiKey = getApiKey();
    const model = data.model || process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const meta = {
      topic: data.topic || "",
      audience: data.audience || "",
      duration: data.duration || "",
    };

    try {
      assertStoragePathBelongsToUser(video.storagePath, uid, "영상");
      const videoGcsUri = makeGcsUri(video.bucket, video.storagePath);

      await attemptRef.set({
        status: "analyzing",
        video: {
          bucket: video.bucket,
          storagePath: video.storagePath,
          videoUrl: video.videoUrl || "",
          fileName: video.fileName || "",
          mimeType: video.mimeType || "video/mp4",
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      logger.info("[analysis] Registering video", { uid, presentationId, attemptId, videoGcsUri });
      const videoFile = await registerGcsFile(videoGcsUri, video.mimeType || "video/mp4", {
        maxWaitMs: VIDEO_PROCESSING_MAX_WAIT_MS,
        label: "영상",
      });

      let materialFile = null;
      if (material?.storagePath) {
        try {
          assertStoragePathBelongsToUser(material.storagePath, uid, "발표 자료");
          const materialGcsUri = makeGcsUri(material.bucket || video.bucket, material.storagePath);
          materialFile = await registerGcsFile(materialGcsUri, material.mimeType || "application/pdf", {
            maxWaitMs: MATERIAL_PROCESSING_MAX_WAIT_MS,
            label: "발표 자료",
          });
        } catch (error) {
          logger.warn("[analysis] Material registration failed; continuing without material", {
            message: error.message,
          });
        }
      }

      const activeItemIds = Array.isArray(data.feedbackItems) && data.feedbackItems.length > 0
        ? data.feedbackItems.filter((id) => FEEDBACK_ITEMS_BY_ID[id])
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
        conditionCount: Array.isArray(data.conditions) ? data.conditions.length : 0,
      });

      const categoryPromises = activeCategories.map((cat) =>
        analyzeCategory(apiKey, model, videoFile, cat, meta).catch((error) => {
          logger.error("[analysis] Category failed", { category: cat.id, message: error.message });
          return { timestamps: [], scores: {} };
        })
      );

      const summaryPromise = analyzeSummary(apiKey, model, videoFile, activeCategories, meta)
        .catch((error) => {
          logger.error("[analysis] Summary failed", { message: error.message });
          return { overall: "", strengths: [], suggestions: [] };
        });

      const materialPromise = materialFile
        ? analyzeMaterial(apiKey, model, videoFile, materialFile).catch((error) => {
          logger.error("[analysis] Material analysis failed", { message: error.message });
          return null;
        })
        : Promise.resolve(null);

      const conditions = Array.isArray(data.conditions) ? data.conditions : [];
      const conditionsPromise = conditions.length > 0
        ? analyzeConditions(apiKey, model, videoFile, conditions).catch((error) => {
          logger.error("[analysis] Conditions analysis failed", { message: error.message });
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
        analysisResult,
        scoreAverage,
        categoryAverages,
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (data.simulation) completedPatch.simulation = data.simulation;

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

      return { analysisResult };
    } catch (error) {
      logger.error("[analysis] Failed", {
        uid,
        presentationId,
        attemptId,
        message: error.message,
      });
      await failAttempt(uid, presentationId, attemptId, error.message, data.simulation ? { simulation: data.simulation } : {});
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", `영상 분석 중 오류가 발생했습니다: ${error.message}`);
    }
  }
);
