import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage } from "@langchain/core/messages";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { del } from "@vercel/blob";
import { FEEDBACK_CATEGORIES, FEEDBACK_ITEMS_BY_ID, ALL_ITEM_IDS } from "../../lib/feedbackAreas";

export const maxDuration = 300;
export const runtime = "nodejs";

const FILE_PROCESSING_POLL_MS = 1500;
const VIDEO_PROCESSING_MAX_WAIT_MS = 180000;
const MATERIAL_PROCESSING_MAX_WAIT_MS = 45000;

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

// ── 카테고리별 타임스탬프 + 항목별 점수 분석 ─────────────────────────────────
async function analyzeCategory(model, fileUri, fileMimeType, category, { topic, audience, duration }) {
    // 항목별 id를 프롬프트에 명시해 모델이 scores 키로 직접 사용하게 함
    const rubric = category.items
        .map((it) => `   - ${it.label}: ${it.desc}`)
        .join("\n");
    const itemLabels = category.items.map((it) => it.label).join(", ");
    const scoreKeys = category.items.map((it) => `"${it.id}": 1~5 사이 정수`).join(", ");
    const minTs = Math.max(3, category.items.length);
    const maxTs = Math.max(minTs, 7);

    const prompt = `당신은 발표(프레젠테이션) 분석 전문가입니다.
발표 영상에서 "${category.label}" (${category.shortLabel}) 영역만 집중 분석해주세요.

발표 정보:
- 주제: ${topic || "미지정"}
- 청중: ${audience || "미지정"}
- 발표 시간: ${duration || "미지정"}

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
4. scores는 각 항목의 발표 전반에 걸친 수행 수준을 1(매우 미흡)~5(매우 우수) 정수로 평가하세요.
5. 구체적이고 건설적인 피드백을 작성하세요.
6. 한국어로 응답하세요.`;

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
async function analyzeSummary(model, fileUri, fileMimeType, activeCategories, { topic, audience, duration }) {
    const categoryLabels = activeCategories.map((c) => `${c.icon} ${c.label}`).join(", ");

    const prompt = `당신은 발표(프레젠테이션) 분석 전문가입니다.
발표 영상 전체를 종합 평가하고 요약 피드백을 제공해주세요.

발표 정보:
- 주제: ${topic || "미지정"}
- 청중: ${audience || "미지정"}
- 발표 시간: ${duration || "미지정"}
- 평가 영역: ${categoryLabels}

다음 JSON 형식으로만 응답하세요 (순수 JSON):
{
  "summary": {
    "overall": "전체 발표에 대한 종합 피드백 (3-4문장)",
    "strengths": ["강점 1", "강점 2", "강점 3"],
    "suggestions": ["개선 제안 1", "개선 제안 2", "개선 제안 3"]
  }
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

        // ── 영상 다운로드 & Gemini 업로드 ────────────────────────────────────
        const videoResponse = await fetch(blobUrl);
        if (!videoResponse.ok) throw new Error("Blob에서 비디오를 가져오지 못했습니다.");
        const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

        const fileManager = new GoogleAIFileManager(cleanApiKey);
        const fs = await import("fs");
        const path = await import("path");
        const os = await import("os");

        const tempDir = os.tmpdir();
        const safeVideoFileName = safeTempFileName(fileName, "upload.mp4");
        const tempFilePath = path.join(tempDir, `upload_${Date.now()}_${safeVideoFileName}`);
        fs.writeFileSync(tempFilePath, videoBuffer);

        let uploadResult;
        try {
            uploadResult = await fileManager.uploadFile(tempFilePath, {
                mimeType: mimeType || "video/mp4",
                displayName: safeVideoFileName,
            });
        } finally {
            fs.unlinkSync(tempFilePath);
        }

        const file = await waitForActiveFile(fileManager, uploadResult.file.name, {
            maxWaitMs: VIDEO_PROCESSING_MAX_WAIT_MS,
            label: "영상",
        });

        // ── 발표 자료 업로드 (선택) ───────────────────────────────────────────
        let materialFile = null;
        if (materialUrl) {
            try {
                const mRes = await fetch(materialUrl);
                if (mRes.ok) {
                    const mBuffer = Buffer.from(await mRes.arrayBuffer());
                    const mFileName = safeTempFileName(materialUrl.split("/").pop(), "material.pdf");
                    const materialTempPath = path.join(tempDir, `mat_${Date.now()}_${mFileName}`);
                    fs.writeFileSync(materialTempPath, mBuffer);

                    let mUpload;
                    try {
                        mUpload = await fileManager.uploadFile(materialTempPath, {
                            mimeType: "application/pdf",
                            displayName: mFileName,
                        });
                    } finally {
                        fs.unlinkSync(materialTempPath);
                    }

                    materialFile = await waitForActiveFile(fileManager, mUpload.file.name, {
                        maxWaitMs: MATERIAL_PROCESSING_MAX_WAIT_MS,
                        label: "발표 자료",
                    });
                    if (materialFile.state !== "ACTIVE") materialFile = null;
                }
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

        // ── 카테고리별 + 요약 + 선택 분석을 모두 병렬 실행 ──────────────────
        console.log(`[분석 API] ${activeCategories.length}개 카테고리 + 요약 병렬 분석 시작`);

        const categoryPromises = activeCategories.map((cat) =>
            analyzeCategory(model, file.uri, file.mimeType, cat, meta)
                .then((result) => {
                    console.log(`[분석 API] '${cat.label}' 완료 (${result.timestamps.length}개 타임스탬프)`);
                    return result;
                })
                .catch((e) => {
                    console.error(`[분석 API] '${cat.label}' 실패:`, e.message);
                    return { timestamps: [], scores: {} };
                })
        );

        const summaryPromise = analyzeSummary(model, file.uri, file.mimeType, activeCategories, meta)
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
