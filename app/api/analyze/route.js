import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage } from "@langchain/core/messages";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { GoogleAuth } from "google-auth-library";
import { del } from "@vercel/blob";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { FEEDBACK_CATEGORIES, FEEDBACK_ITEMS_BY_ID, ALL_ITEM_IDS } from "../../lib/feedbackAreas";

export const maxDuration = 300;
export const runtime = "nodejs";

const FILE_PROCESSING_POLL_MS = 1500;
const VIDEO_PROCESSING_MAX_WAIT_MS = 180000;
const MATERIAL_PROCESSING_MAX_WAIT_MS = 45000;
const CHIRP_STT_LOCATION = process.env.CHIRP_STT_LOCATION || "global";
const CHIRP_STT_MODEL = process.env.CHIRP_STT_MODEL || "chirp_3";
const CHIRP_STT_LANGUAGE = process.env.CHIRP_STT_LANGUAGE || "ko-KR";
const CHIRP_STT_POLL_MS = 5000;
const CHIRP_STT_MAX_WAIT_MS = Number(process.env.CHIRP_STT_MAX_WAIT_MS || 120000);
const GOOGLE_AUTH_SCOPES = ["https://www.googleapis.com/auth/cloud-platform"];

// ── 유틸: JSON 추출 ──────────────────────────────────────────────────────────
function extractJSON(text) {
    const fenced = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
    return fenced ? fenced[1] : text;
}

function safeTempFileName(fileName, fallback) {
    return String(fileName || fallback)
        .replace(/[^a-zA-Z0-9_.-]/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 160);
}

async function waitForActiveFile(fileManager, fileName, { maxWaitMs, label }) {
    const startedAt = Date.now();
    let file = await fileManager.getFile(fileName);

    while (file.state === "PROCESSING" && Date.now() - startedAt < maxWaitMs) {
        await new Promise((resolve) => setTimeout(resolve, FILE_PROCESSING_POLL_MS));
        file = await fileManager.getFile(fileName);
    }

    if (file.state === "FAILED") {
        throw new Error(`${label} 처리에 실패했습니다.`);
    }

    if (file.state === "PROCESSING") {
        const seconds = Math.round(maxWaitMs / 1000);
        throw new Error(`${label} 처리 시간이 ${seconds}초를 초과했습니다. 잠시 후 다시 시도하거나 더 짧은 영상을 사용해주세요.`);
    }

    return file;
}

async function streamUrlToTempFile(url, tempFilePath, label) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${label}을(를) 가져오지 못했습니다.`);
    }
    if (!response.body) {
        throw new Error(`${label} 응답 스트림을 사용할 수 없습니다.`);
    }

    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(tempFilePath));
}

function unlinkTempFile(tempFilePath) {
    try {
        fs.unlinkSync(tempFilePath);
    } catch (_) { }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeGcsUri(bucket, storagePath) {
    const cleanBucket = String(bucket || "").replace(/^gs:\/\//, "").replace(/\/+$/, "");
    const cleanPath = String(storagePath || "").replace(/^\/+/, "");
    if (!cleanBucket || !cleanPath) return "";
    return `gs://${cleanBucket}/${cleanPath}`;
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
    const auth = new GoogleAuth({ scopes: GOOGLE_AUTH_SCOPES });
    const client = await auth.getClient();
    const tokenResult = await client.getAccessToken();
    const accessToken = typeof tokenResult === "string" ? tokenResult : tokenResult?.token;
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || await auth.getProjectId();

    if (!accessToken || !projectId) {
        throw new Error("Google OAuth 인증 정보를 가져오지 못했습니다.");
    }

    return { accessToken, projectId };
}

async function fetchSpeechOperation(operationName, authContext) {
    const response = await fetch(`https://speech.googleapis.com/v2/${operationName}`, {
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

async function transcribeWithChirp(gcsUri) {
    const authContext = await getGoogleAuthContext();
    const recognizer = `projects/${authContext.projectId}/locations/${CHIRP_STT_LOCATION}/recognizers/_`;
    const response = await fetch(`https://speech.googleapis.com/v2/${recognizer}:batchRecognize`, {
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
                    enableWordTimeOffsets: true,
                },
            },
            configMask: "*",
            files: [{ uri: gcsUri }],
            recognitionOutputConfig: {
                inlineResponseConfig: {},
            },
        }),
    });

    const operation = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = operation?.error?.message || `Speech-to-Text 요청 실패: HTTP ${response.status}`;
        throw new Error(message);
    }
    if (!operation.name) {
        throw new Error("Speech-to-Text operation 이름을 확인하지 못했습니다.");
    }

    const startedAt = Date.now();
    let current = operation;
    while (!current.done && Date.now() - startedAt < CHIRP_STT_MAX_WAIT_MS) {
        await sleep(CHIRP_STT_POLL_MS);
        current = await fetchSpeechOperation(operation.name, authContext);
        console.log("[분석 API] Chirp STT 대기 중:", operation.name);
    }

    if (!current.done) {
        throw new Error(`Chirp STT가 ${Math.round(CHIRP_STT_MAX_WAIT_MS / 1000)}초 안에 완료되지 않았습니다.`);
    }
    if (current.error) {
        throw new Error(current.error.message || "Chirp STT operation이 실패했습니다.");
    }

    const normalized = normalizeSpeechResults(current.response, gcsUri);
    const utterances = wordsToUtterances(normalized.segments);
    return {
        model: CHIRP_STT_MODEL,
        languageCode: CHIRP_STT_LANGUAGE,
        location: CHIRP_STT_LOCATION,
        text: normalized.text || utterances.map((utterance) => utterance.text).join("\n").trim(),
        utterances,
        segmentCount: normalized.segments.length,
        createdAt: new Date().toISOString(),
    };
}

// ── 카테고리별 타임스탬프 + 항목별 점수 분석 ─────────────────────────────────
async function analyzeCategory(model, fileUri, fileMimeType, category, { topic, audience, duration }, transcript = null) {
    // 항목별 id를 프롬프트에 명시해 모델이 scores 키로 직접 사용하게 함
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
- 주제: ${topic || "미지정"}
- 청중: ${audience || "미지정"}
- 발표 시간: ${duration || "미지정"}
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

    const message = new HumanMessage({
        content: [
            { type: "media", mimeType: fileMimeType, fileUri },
            { type: "text", text: prompt },
        ],
    });

    const response = await model.invoke([message]);
    const text = typeof response.content === "string" ? response.content : (response.content[0]?.text ?? "");
    const rawJson = extractJSON(text).trim();
    console.log(`[분석 API] '${category.label}' 원시 응답 (앞 800자):`, rawJson.slice(0, 800));
    const parsed = JSON.parse(rawJson);
    return {
        timestamps: Array.isArray(parsed.timestamps) ? parsed.timestamps : [],
        scores: parsed.scores && typeof parsed.scores === "object" ? parsed.scores : {},
    };
}

// ── 종합 요약 분석 ─────────────────────────────────────────────────────────────
async function analyzeSummary(model, fileUri, fileMimeType, activeCategories, { topic, audience, duration }, transcript = null) {
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
- 주제: ${topic || "미지정"}
- 청중: ${audience || "미지정"}
- 발표 시간: ${duration || "미지정"}
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

    const message = new HumanMessage({
        content: [
            { type: "media", mimeType: fileMimeType, fileUri },
            { type: "text", text: prompt },
        ],
    });

    const response = await model.invoke([message]);
    const text = typeof response.content === "string" ? response.content : (response.content[0]?.text ?? "");
    const parsed = JSON.parse(extractJSON(text).trim());
    return parsed.summary ?? { overall: "", strengths: [], suggestions: [] };
}

// ── 발표 자료 분석 ────────────────────────────────────────────────────────────
async function analyzeMaterial(model, fileUri, fileMimeType, materialFileUri, materialMimeType) {
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

    const message = new HumanMessage({
        content: [
            { type: "media", mimeType: fileMimeType, fileUri },
            { type: "media", mimeType: materialMimeType, fileUri: materialFileUri },
            { type: "text", text: prompt },
        ],
    });

    const response = await model.invoke([message]);
    const text = typeof response.content === "string" ? response.content : (response.content[0]?.text ?? "");
    const parsed = JSON.parse(extractJSON(text).trim());
    return parsed.materialAnalysis ?? null;
}

// ── 조건 충족 분석 ────────────────────────────────────────────────────────────
async function analyzeConditions(model, fileUri, fileMimeType, conditions) {
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

    const message = new HumanMessage({
        content: [
            { type: "media", mimeType: fileMimeType, fileUri },
            { type: "text", text: prompt },
        ],
    });

    const response = await model.invoke([message]);
    const text = typeof response.content === "string" ? response.content : (response.content[0]?.text ?? "");
    const parsed = JSON.parse(extractJSON(text).trim());
    return Array.isArray(parsed.conditionsAnalysis) ? parsed.conditionsAnalysis : [];
}

// ── 메인 핸들러 ───────────────────────────────────────────────────────────────
export async function POST(request) {
    let blobUrl = null;

    try {
        console.log("[분석 API] 요청 시작");

        const body = await request.json();
        const {
            blobUrl: videoUrl,
            fileName,
            mimeType,
            topic = "",
            audience = "",
            duration = "",
            feedbackItems = [],
            materialUrl = null,
            conditions = [],
            bucket = "",
            storagePath = "",
        } = body;

        blobUrl = videoUrl;

        if (!blobUrl) {
            return Response.json({ error: "비디오 URL이 필요합니다." }, { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return Response.json({ error: "GEMINI_API_KEY가 설정되지 않았습니다." }, { status: 500 });
        }
        const cleanApiKey = apiKey.trim();

        const videoGcsUri = makeGcsUri(bucket, storagePath);
        const transcriptPromise = videoGcsUri && process.env.ENABLE_CHIRP_STT !== "false"
            ? transcribeWithChirp(videoGcsUri).catch((e) => {
                console.warn("[분석 API] Chirp STT 실패, 발화록 없이 계속 진행:", e.message);
                return {
                    error: e.message,
                    model: CHIRP_STT_MODEL,
                    languageCode: CHIRP_STT_LANGUAGE,
                    location: CHIRP_STT_LOCATION,
                    text: "",
                    utterances: [],
                };
            })
            : Promise.resolve(null);

        // ── 영상 다운로드 & Gemini 업로드 ────────────────────────────────────
        const fileManager = new GoogleAIFileManager(cleanApiKey);

        const tempDir = os.tmpdir();
        const safeVideoFileName = safeTempFileName(fileName, "upload.mp4");
        const tempFilePath = path.join(tempDir, `upload_${Date.now()}_${safeVideoFileName}`);

        let uploadResult;
        try {
            await streamUrlToTempFile(blobUrl, tempFilePath, "Blob 비디오");
            uploadResult = await fileManager.uploadFile(tempFilePath, {
                mimeType: mimeType || "video/mp4",
                displayName: safeVideoFileName,
            });
        } finally {
            unlinkTempFile(tempFilePath);
        }

        const file = await waitForActiveFile(fileManager, uploadResult.file.name, {
            maxWaitMs: VIDEO_PROCESSING_MAX_WAIT_MS,
            label: "영상",
        });

        // ── 발표 자료 업로드 (선택) ───────────────────────────────────────────
        let materialFile = null;
        if (materialUrl) {
            try {
                const mFileName = safeTempFileName(materialUrl.split("/").pop(), "material.pdf");
                const materialTempPath = path.join(tempDir, `mat_${Date.now()}_${mFileName}`);

                let mUpload;
                try {
                    await streamUrlToTempFile(materialUrl, materialTempPath, "발표 자료");
                    mUpload = await fileManager.uploadFile(materialTempPath, {
                        mimeType: "application/pdf",
                        displayName: mFileName,
                    });
                } finally {
                    unlinkTempFile(materialTempPath);
                }

                materialFile = await waitForActiveFile(fileManager, mUpload.file.name, {
                    maxWaitMs: MATERIAL_PROCESSING_MAX_WAIT_MS,
                    label: "발표 자료",
                });
                if (materialFile.state !== "ACTIVE") materialFile = null;
            } catch (e) {
                console.warn("[분석 API] 발표 자료 처리 오류:", e.message);
            }
        }

        // ── LangChain 모델 초기화 ─────────────────────────────────────────────
        const model = new ChatGoogleGenerativeAI({
            model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
            apiKey: cleanApiKey,
        });

        // ── 분석 대상 카테고리/항목 결정 ─────────────────────────────────────
        const activeItemIds = feedbackItems.length > 0
            ? feedbackItems.filter((id) => FEEDBACK_ITEMS_BY_ID[id])
            : ALL_ITEM_IDS;

        const activeCategories = FEEDBACK_CATEGORIES
            .map((cat) => ({
                ...cat,
                items: cat.items.filter((it) => activeItemIds.includes(it.id)),
            }))
            .filter((cat) => cat.items.length > 0);

        const meta = { topic, audience, duration };
        const transcript = await transcriptPromise;

        // ── 카테고리별 + 요약 + 선택 분석을 모두 병렬 실행 ──────────────────
        console.log(`[분석 API] ${activeCategories.length}개 카테고리 + 요약 병렬 분석 시작`, {
            transcriptUtteranceCount: transcript?.utterances?.length || 0,
        });

        const categoryPromises = activeCategories.map((cat) =>
            analyzeCategory(model, file.uri, file.mimeType, cat, meta, transcript)
                .then((result) => {
                    console.log(`[분석 API] '${cat.label}' 완료 (${result.timestamps.length}개 타임스탬프)`);
                    return result;
                })
                .catch((e) => {
                    console.error(`[분석 API] '${cat.label}' 실패:`, e.message);
                    return { timestamps: [], scores: {} };
                })
        );

        const summaryPromise = analyzeSummary(model, file.uri, file.mimeType, activeCategories, meta, transcript)
            .then((s) => { console.log("[분석 API] 요약 완료"); return s; })
            .catch((e) => { console.error("[분석 API] 요약 실패:", e.message); return { overall: "", strengths: [], suggestions: [] }; });

        const materialPromise = materialFile
            ? analyzeMaterial(model, file.uri, file.mimeType, materialFile.uri, materialFile.mimeType)
                .then((m) => { console.log("[분석 API] 자료 분석 완료"); return m; })
                .catch((e) => { console.error("[분석 API] 자료 분석 실패:", e.message); return null; })
            : Promise.resolve(null);

        const conditionsPromise = conditions.length > 0
            ? analyzeConditions(model, file.uri, file.mimeType, conditions)
                .then((c) => { console.log("[분석 API] 조건 분석 완료"); return c; })
                .catch((e) => { console.error("[분석 API] 조건 분석 실패:", e.message); return []; })
            : Promise.resolve([]);

        // 전부 병렬로 대기
        const [categoryResults, summary, materialAnalysis, conditionsAnalysis] = await Promise.all([
            Promise.all(categoryPromises),
            summaryPromise,
            materialPromise,
            conditionsPromise,
        ]);

        // ── 결과 병합 ─────────────────────────────────────────────────────────
        const allTimestamps = categoryResults
            .flatMap((r) => r.timestamps)
            .sort((a, b) => (a.seconds ?? 0) - (b.seconds ?? 0));

        // 카테고리별 scores를 하나의 객체로 합침 { item_id: score, ... }
        const scores = Object.assign({}, ...categoryResults.map((r) => r.scores));

        const analysisResult = { timestamps: allTimestamps, scores, summary };
        if (transcript) analysisResult.transcript = transcript;
        if (materialAnalysis) analysisResult.materialAnalysis = materialAnalysis;
        if (conditionsAnalysis.length > 0) analysisResult.conditionsAnalysis = conditionsAnalysis;

        console.log(`[분석 API] 완료 — 총 ${allTimestamps.length}개 타임스탬프`);

        // ── 파일 정리 ─────────────────────────────────────────────────────────
        try { await fileManager.deleteFile(file.name); } catch (_) { }
        if (materialFile) { try { await fileManager.deleteFile(materialFile.name); } catch (_) { } }
        try { await del(blobUrl); } catch (_) { }

        return Response.json(analysisResult);

    } catch (error) {
        console.error("[분석 API] 오류:", error);
        if (blobUrl) { try { await del(blobUrl); } catch (_) { } }
        return Response.json(
            { error: "영상 분석 중 오류가 발생했습니다: " + error.message },
            { status: 500 }
        );
    }
}
