// 질의응답(Q&A) 피드백 공용 모듈 — /api/qa-feedback 과 분석 화면이 함께 쓴다.
//
// 저장 형식 (simulations/{code}.qaResults[i].aiFeedback):
// {
//   version: 1,
//   answered: boolean,          // 답변이 기록됐는지
//   relevance: "direct" | "partial" | "off_topic" | "none",
//   strength: string,           // 잘한 점
//   improvement: string,        // 개선점
//   overall: string,            // 한 줄 총평
//   criteria: { intent, evidence, consistency, structure },  // 각 "good" | "fair" | "poor" (내부 판정용)
//   generatedAt: ISO string,
//   model: string,
// }
// 예전 데이터처럼 "잘한 점: … 개선점: …" 문자열로 저장된 경우도 normalizeQaFeedback 으로 같이 읽는다.

export const QA_FEEDBACK_VERSION = 1;

// 이 글자 수보다 짧은 답변은 "답변 없음"으로 본다 (예: "네", "음…" 같은 짧은 반응).
export const MIN_ANSWER_CHARS = 8;

export const QA_RELEVANCE_LABELS = {
    direct: "질문에 바로 답함",
    partial: "일부만 답함",
    off_topic: "질문과 다른 답",
    none: "답변 없음",
};

// Unity STT 원문 "[30번] \"…\" 속도:2.0(느림)" 형태에서 발화 번호·속도·효과음 표기를 걷어낸다.
export function cleanAnswerText(value) {
    return String(value || "")
        .split(/\n+/)
        .map((line) => line
            .replace(/^\s*\[\d+\s*번\]\s*/g, "")
            .replace(/^\s*\d+\s*[.)]\s*/g, "")
            .replace(/\s*속도\s*:\s*[-+]?\d+(?:\.\d+)?\s*(?:\([^)]*\))?\s*$/g, "")
            .replace(/\[(?:두근|웃음|박수|침묵|무음|소음|잡음|기침|한숨|숨소리|호흡|음악|효과음)[^\]]*\]/g, "")
            .replace(/^["“”']+|["“”']+$/g, "")
            .replace(/\s+/g, " ")
            .trim())
        .filter(Boolean)
        .join("\n");
}

export function hasMeaningfulAnswer(answerText) {
    return cleanAnswerText(answerText).replace(/\s+/g, "").length >= MIN_ANSWER_CHARS;
}

export function buildUnansweredFeedback() {
    return {
        version: QA_FEEDBACK_VERSION,
        answered: false,
        relevance: "none",
        strength: "",
        improvement: "답변이 기록되지 않았습니다. 질문을 받으면 바로 답이 떠오르지 않더라도 \"좋은 질문 감사합니다\"로 시간을 벌고, 결론을 한 문장으로 먼저 말한 뒤 근거를 덧붙여 보세요.",
        overall: "이번 질문에는 답변이 기록되지 않았습니다.",
    };
}

function parseLegacyFeedbackText(text) {
    const strength = text.match(/잘한\s*점\s*:\s*([\s\S]*?)(?=\s*개선점\s*:|$)/)?.[1]?.trim() || "";
    const improvement = text.match(/개선점\s*:\s*([\s\S]*)$/)?.[1]?.trim() || "";
    return {
        strength,
        improvement,
        overall: strength || improvement ? "" : text,
    };
}

// 저장된 aiFeedback(객체·문자열·JSON 문자열)을 화면에서 쓰는 한 가지 모양으로 맞춘다. 비어 있으면 null.
export function normalizeQaFeedback(value) {
    if (value == null) return null;

    let source = value;
    if (typeof source === "string") {
        const text = source.trim();
        if (!text) return null;
        if (text.startsWith("{")) {
            try {
                source = JSON.parse(text);
            } catch {
                source = text;
            }
        }
        if (typeof source === "string") {
            const legacy = parseLegacyFeedbackText(text);
            return { answered: true, relevance: "", ...legacy };
        }
    }

    if (typeof source !== "object") return null;

    const pick = (...keys) => {
        for (const key of keys) {
            const candidate = source[key];
            if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
        }
        return "";
    };

    const relevance = Object.prototype.hasOwnProperty.call(QA_RELEVANCE_LABELS, source.relevance) ? source.relevance : "";
    const normalized = {
        answered: source.answered !== false,
        relevance,
        strength: pick("strength", "strengths", "good"),
        improvement: pick("improvement", "improvements", "suggestion"),
        overall: pick("overall", "summary", "text"),
    };

    if (!normalized.strength && !normalized.improvement && !normalized.overall) return null;
    return normalized;
}
