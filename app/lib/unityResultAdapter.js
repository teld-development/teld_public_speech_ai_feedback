/**
 * Unity 시뮬레이션 결과를 원본 analysis 페이지가 기대하는 형식으로 변환.
 *
 * Unity raw 결과:
 *   { feedbackText, refinedTranscript, pscrScoresJson, logsJson,
 *     totalScore, audioUrl, videoUrl, motionSummary, timelineEventsJson }
 *
 * 원본 analysis 형식:
 *   { summary: { overall, strengths, suggestions },
 *     scores: { eye_contact, gesture, ... },
 *     timestamps: [{ time, seconds, category, item, feedback }, ...],
 *     materialAnalysis: null, conditionsAnalysis: null }
 *
 * 핵심: 분석 페이지는 절대 수정하지 않고, 데이터만 어댑팅.
 */

// 12개 항목 ID (FEEDBACK_CATEGORIES 와 매칭)
const VISUAL_ITEMS = [
    { id: "gesture",                label: "제스처",           keywords: ["제스처", "gesture"] },
    { id: "facing",                 label: "청중 대면",        keywords: ["자세", "방향", "정면", "facing", "posture"] },
    { id: "no_distraction",         label: "방해 동작 지양",    keywords: ["흔들", "산만", "fidget", "정적"] },
    { id: "audience_awareness",     label: "비언어적 청중 인식", keywords: ["끄덕", "반응", "react"] },
    { id: "eye_contact",            label: "시선 접촉",        keywords: ["시선", "eye", "응시"] },
    { id: "facial_expression",     label: "얼굴 표정",        keywords: ["표정", "미소", "웃", "expression"] },
    { id: "verbal_nonverbal_sync", label: "언어-비언어 동기화", keywords: ["동기화", "sync"] },
];

const VERBAL_ITEMS = [
    { id: "prosody",              label: "구어 표현 및 준언어" },
    { id: "language_choice",      label: "언어 선택" },
    { id: "audience_adaptation",  label: "청중 적응" },
];

/**
 * Unity 결과를 원본 analysis 페이지 형식으로 변환
 * @param {Object} unityResult - Unity 백엔드에서 받은 raw 데이터
 * @returns {Object} - 원본 analysis 페이지가 기대하는 형식
 */
export function adaptUnityResultToAnalysis(unityResult) {
    if (!unityResult) return null;

    // ─── 1) summary ───
    const text = unityResult.feedbackText || "";
    const summary = {
        overall: text || "발표 분석이 완료되었습니다.",
        strengths: [],
        suggestions: [],
    };

    // feedbackText 에서 강점/제안 추출 (Markdown 헤더 기반)
    const strengthsMatch = text.match(/(?:강점|잘한\s*점|훌륭한\s*점)[\s\S]*?(?=\n\n|##|개선|아쉬|$)/i);
    const suggestionsMatch = text.match(/(?:개선|제안|아쉬운\s*점|보완)[\s\S]*?(?=\n\n|##|$)/i);
    if (strengthsMatch) {
        const items = strengthsMatch[0].split(/\n\s*[-*•]\s/).filter(s => s.trim().length > 5 && !s.includes("강점"));
        if (items.length > 0) summary.strengths = items.slice(0, 5).map(s => s.trim());
    }
    if (suggestionsMatch) {
        const items = suggestionsMatch[0].split(/\n\s*[-*•]\s/).filter(s => s.trim().length > 5 && !s.includes("개선") && !s.includes("제안"));
        if (items.length > 0) summary.suggestions = items.slice(0, 5).map(s => s.trim());
    }
    if (summary.strengths.length === 0) summary.strengths = ["전체 종합 피드백을 아래에서 확인하세요."];
    if (summary.suggestions.length === 0) summary.suggestions = ["타임스탬프별 상세 피드백을 참고하세요."];

    // ─── 2) scores - PSCR 데이터에서만 추출 (없는 항목은 미설정) ───
    const scores = {};
    try {
        const pscr = JSON.parse(unityResult.pscrScoresJson || "{}");
        const mapKey = (k) => {
            const lk = k.toLowerCase();
            if (lk.includes("speed") || lk.includes("속도") || lk.includes("prosody")) return "prosody";
            if (lk.includes("volume") || lk.includes("성량") || lk.includes("크기")) return "prosody";
            if (lk.includes("language") || lk.includes("어휘") || lk.includes("vocabulary")) return "language_choice";
            if (lk.includes("gesture") || lk.includes("제스처") || lk.includes("motion")) return "gesture";
            if (lk.includes("eye") || lk.includes("시선")) return "eye_contact";
            if (lk.includes("expression") || lk.includes("표정")) return "facial_expression";
            if (lk.includes("posture") || lk.includes("자세")) return "facing";
            if (lk.includes("preparation") || lk.includes("준비")) return "professional_appearance";
            if (lk.includes("clarity") || lk.includes("명확")) return "prosody";
            if (lk.includes("reaction") || lk.includes("반응") || lk.includes("adaptation")) return "audience_adaptation";
            return null;
        };
        Object.entries(pscr).forEach(([key, val]) => {
            if (typeof val !== "number") return;
            const itemId = mapKey(key);
            if (!itemId) return;
            scores[itemId] = Math.max(1, Math.min(5, Math.round(val / 20)));
        });
    } catch { }

    // ─── 3) timestamps - 실제 데이터 있는 것만 ───
    const timestamps = [];

    // logsJson → verbal 카테고리 (실제 신호 있는 로그만)
    try {
        const logs = JSON.parse(unityResult.logsJson || "[]");
        if (Array.isArray(logs)) {
            let cumSec = 0;
            logs.forEach((log) => {
                if (!log.text || log.text.length < 5) return;
                const dur = log.durationSec || 5;
                const sec = Math.round(cumSec);
                cumSec += dur + (log.silenceDuration || 0);
                const mm = Math.floor(sec / 60).toString().padStart(2, "0");
                const ss = (sec % 60).toString().padStart(2, "0");

                let itemLabel = null;
                if (log.speedStatus === "느림" || log.speedStatus === "빠름" ||
                    log.emphasizeStatus === "강조" || (log.volumeRatio && Math.abs(log.volumeRatio - 1) > 0.3)) {
                    itemLabel = "구어 표현 및 준언어";
                }
                if (!itemLabel) return;

                timestamps.push({
                    time: `${mm}:${ss}`, seconds: sec,
                    category: "음성 전달 수행", item: itemLabel,
                    feedback: `[${log.speedStatus || "보통"} / 음량 ${log.volumeRatio?.toFixed(1) || "?"}배] ${log.text.slice(0, 80)}${log.text.length > 80 ? "…" : ""}`,
                });
            });
        }
    } catch { }

    // motionSummary → visual 카테고리 (키워드 매칭 성공한 것만)
    if (unityResult.motionSummary && unityResult.motionSummary.length > 10) {
        const motionLines = unityResult.motionSummary.split("\n").filter(l => l.trim().length > 5);
        motionLines.forEach((line, idx) => {
            let matched = null;
            for (const v of VISUAL_ITEMS) {
                if (v.keywords.some(k => line.toLowerCase().includes(k.toLowerCase()))) {
                    matched = v;
                    break;
                }
            }
            if (!matched) return;
            const sec = idx * 25;
            const mm = Math.floor(sec / 60).toString().padStart(2, "0");
            const ss = (sec % 60).toString().padStart(2, "0");
            timestamps.push({
                time: `${mm}:${ss}`, seconds: sec,
                category: "시각적 수치 및 신체 활용", item: matched.label,
                feedback: line.replace(/^[-*•■]\s*/, "").trim().slice(0, 100),
            });
        });
    }

    // timelineEventsJson → media 카테고리 (슬라이드 이벤트만)
    try {
        const events = JSON.parse(unityResult.timelineEventsJson || "[]");
        if (Array.isArray(events)) {
            events.forEach(e => {
                if (e.type !== "slide_change" && !(e.label?.includes("슬라이드"))) return;
                const sec = Math.round(e.time || 0);
                const mm = Math.floor(sec / 60).toString().padStart(2, "0");
                const ss = (sec % 60).toString().padStart(2, "0");
                timestamps.push({
                    time: `${mm}:${ss}`, seconds: sec,
                    category: "매체 및 환경 관리", item: "기술 및 매체 상호작용",
                    feedback: e.label || "슬라이드 전환",
                });
            });
        }
    } catch { }

    timestamps.sort((a, b) => a.seconds - b.seconds);

    return {
        summary,
        scores,
        timestamps,
        materialAnalysis: null,
        conditionsAnalysis: null,
        // Unity raw 데이터도 보관 (디버깅·향후 확장용)
        _unityRaw: unityResult,
        source: "unity",
    };
}
