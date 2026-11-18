// /api/qa-feedback
// 시뮬레이션 질의응답(질문 + 발표자 답변 STT)에 대해 질문별 AI 피드백을 만든다.
//
// 호출: 분석 화면(app/analysis/page.js)이 aiFeedback 이 없는 Q&A 항목을 모아 요청하고,
//       받은 결과를 simulations/{code}.qaResults[i].aiFeedback 에 저장한다.
//
// 입력:
// {
//   presentation: { title, topic, audience },   // 선택
//   transcript: "발표 전사 텍스트",               // 선택, 앞부분만 사용
//   items: [{ index, question, questionType, answer }, ...]   // 최대 5개
// }
//
// 출력:
// {
//   items: [{ index, feedback: { version, answered, relevance, strength, improvement, overall, generatedAt, model } }
//           | { index, error }]
// }

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage } from "@langchain/core/messages";
import {
    QA_FEEDBACK_VERSION,
    buildUnansweredFeedback,
    cleanAnswerText,
    hasMeaningfulAnswer,
} from "../../lib/qaFeedback";

export const maxDuration = 60;

const MODEL_NAME = "gemini-2.5-flash";
const MAX_ITEMS = 5;
const TRANSCRIPT_MAX_CHARS = 6000;
const ANSWER_MAX_CHARS = 3000;

const QUESTION_TYPE_LABELS = {
    clarification: "개념·정의를 명확히 해 달라는 질문",
    evidence: "근거·자료·사례를 요청하는 질문",
    application: "한계·확장·적용을 묻는 질문",
    critical: "발표의 허점이나 약한 논리를 지적하는 질문",
    fact: "사실 확인 질문",
    inference: "추론·해석을 묻는 질문",
};

function extractJSON(text) {
    if (!text) return "";
    const fenced = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
    if (fenced) return fenced[1];
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) return text.slice(firstBrace, lastBrace + 1);
    return text;
}

function clip(text, maxChars) {
    const value = String(text || "").trim();
    if (value.length <= maxChars) return value;
    const head = Math.floor(maxChars * 0.7);
    const tail = maxChars - head;
    return `${value.slice(0, head)}\n... [중간 생략] ...\n${value.slice(-tail)}`;
}

function buildPrompt({ presentation, transcript, question, questionType, answer }) {
    const typeHint = QUESTION_TYPE_LABELS[questionType] || "";
    const presentationLines = [
        presentation?.title && `- 제목: ${presentation.title}`,
        presentation?.topic && `- 주제: ${presentation.topic}`,
        presentation?.audience && `- 예상 청중: ${presentation.audience}`,
    ].filter(Boolean).join("\n");

    return `당신은 대학 공적 말하기 수업의 질의응답 코치입니다.
발표가 끝난 뒤 청중이 질문했고, 발표자가 즉석에서 답했습니다. 발표자의 답변을 평가해 피드백을 주세요.

[발표 정보]
${presentationLines || "- (정보 없음)"}

[발표 전사 — 답변이 발표 내용과 일관된지 판단하는 참고용]
${transcript ? clip(transcript, TRANSCRIPT_MAX_CHARS) : "(전사 없음)"}

[청중 질문]${typeHint ? ` (${typeHint})` : ""}
${question}

[발표자 답변 — 음성 인식(STT) 결과]
${clip(answer, ANSWER_MAX_CHARS)}

[평가 기준 — 각각 good / fair / poor 로 판정]
- intent (질문 의도): 질문이 묻는 핵심에 직접 답했는가. 질문을 비껴가거나 일반론만 말하면 poor.
- evidence (근거): 주장에 이유·사례·자료를 붙였는가.
- consistency (발표와의 일관성): 발표 내용과 어긋나지 않고, 발표에서 한 말을 적절히 끌어왔는가.
- structure (전달 구조): 결론과 근거가 정리된 순서로 나왔는가. 결론이 끝까지 안 나오거나 같은 말을 반복하면 poor.
판정은 엄격하게 하세요. 대학 발표 질의응답에서 흔히 보이는 무난한 답변은 fair 입니다.

[relevance 판정]
- "direct": 질문의 핵심에 분명히 답함
- "partial": 관련된 말은 했지만 질문의 핵심 일부를 빠뜨리거나 비껴감
- "off_topic": 질문과 거의 상관없는 말이 대부분임

[작성 지침]
- 답변은 음성 인식 결과라 오탈자, 끊긴 문장, "어", "음" 같은 군말이 섞여 있습니다. 인식 오류 자체는 지적하지 마세요.
- 답변 안에 질문과 무관한 말(예: 세션 종료 안내, 진행자와의 대화)이 섞여 있으면 그 부분은 평가에서 빼세요.
- strength: 가장 잘된 기준 하나에 대해, 답변에서 실제로 한 말을 짧게 인용하며 1~2문장으로 쓰세요.
- improvement: 가장 약한 기준 하나를 골라, 다음 질의응답에서 바로 해 볼 수 있는 행동 하나를 1~2문장으로 쓰세요. 이 답변에 실제로 해당하는 문제만 쓰고, 모든 답변에 똑같이 할 수 있는 일반적인 조언은 피하세요.
- 고쳐 말한 예시를 들 때는 이 질문과 답변 내용에 맞춘 문장으로 쓰세요.
- overall: 이 답변을 한 문장으로 요약 평가하세요.
- 발표자에게 직접 말하듯 존댓말로 쓰세요. strength 와 improvement 는 각각 150자 이내로 쓰세요.

[출력 형식 — JSON 하나만 출력]
{
  "criteria": { "intent": "good|fair|poor", "evidence": "good|fair|poor", "consistency": "good|fair|poor", "structure": "good|fair|poor" },
  "relevance": "direct|partial|off_topic",
  "strength": "잘한 점",
  "improvement": "개선점",
  "overall": "한 줄 총평"
}`;
}

const CRITERIA_KEYS = ["intent", "evidence", "consistency", "structure"];
const CRITERIA_LEVELS = ["good", "fair", "poor"];

function normalizeCriteria(value) {
    const source = value && typeof value === "object" ? value : {};
    return Object.fromEntries(CRITERIA_KEYS.map((key) => [
        key,
        CRITERIA_LEVELS.includes(source[key]) ? source[key] : "",
    ]));
}

async function generateFeedback(model, { presentation, transcript, item }) {
    const answer = cleanAnswerText(item.answer);
    if (!hasMeaningfulAnswer(answer)) {
        return { ...buildUnansweredFeedback(), generatedAt: new Date().toISOString(), model: "rule:no-answer" };
    }

    const prompt = buildPrompt({
        presentation,
        transcript,
        question: String(item.question || "").trim(),
        questionType: String(item.questionType || "").trim(),
        answer,
    });

    const response = await model.invoke([new HumanMessage({ content: [{ type: "text", text: prompt }] })]);
    const rawText = typeof response.content === "string"
        ? response.content
        : (response.content?.map?.((part) => part?.text || "").join("") ?? "");
    const parsed = JSON.parse(extractJSON(rawText));

    const relevance = ["direct", "partial", "off_topic"].includes(parsed.relevance) ? parsed.relevance : "partial";
    const feedback = {
        version: QA_FEEDBACK_VERSION,
        answered: true,
        relevance,
        strength: String(parsed.strength || "").trim(),
        improvement: String(parsed.improvement || "").trim(),
        overall: String(parsed.overall || "").trim(),
        criteria: normalizeCriteria(parsed.criteria),
        generatedAt: new Date().toISOString(),
        model: MODEL_NAME,
    };

    if (!feedback.strength && !feedback.improvement && !feedback.overall) {
        throw new Error("피드백 내용이 비어 있습니다.");
    }
    return feedback;
}

export async function POST(request) {
    let body;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: "요청 본문이 JSON 이 아닙니다." }, { status: 400 });
    }

    const rawItems = Array.isArray(body?.items) ? body.items : [];
    const items = rawItems
        .filter((item) => item && typeof item === "object" && String(item.question || "").trim())
        .slice(0, MAX_ITEMS);

    if (items.length === 0) {
        return Response.json({ error: "피드백을 만들 질문이 없습니다. items 에 question 을 넣어 주세요." }, { status: 400 });
    }

    const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
    const needsModel = items.some((item) => hasMeaningfulAnswer(item.answer));
    if (needsModel && !apiKey) {
        return Response.json({ error: "GEMINI_API_KEY 가 설정되지 않았습니다." }, { status: 500 });
    }

    const model = needsModel
        ? new ChatGoogleGenerativeAI({ model: MODEL_NAME, apiKey, temperature: 0.3 })
        : null;

    const presentation = body?.presentation && typeof body.presentation === "object" ? body.presentation : {};
    const transcript = typeof body?.transcript === "string" ? body.transcript : "";

    const results = await Promise.all(items.map(async (item, position) => {
        const index = Number.isInteger(item.index) ? item.index : position;
        try {
            const feedback = await generateFeedback(model, { presentation, transcript, item });
            return { index, feedback };
        } catch (err) {
            console.error(`[qa-feedback] ${index}번 질문 피드백 생성 실패:`, err?.message || err);
            return { index, error: "피드백을 만들지 못했습니다. 잠시 후 다시 시도해 주세요." };
        }
    }));

    return Response.json({ items: results });
}
