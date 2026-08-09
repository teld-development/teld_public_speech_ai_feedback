// 발표 피드백 영역 정의 (제공된 평가표 기준 12개 소영역)

export const FEEDBACK_CATEGORIES = [
    {
        id: "content",
        label: "내용",
        shortLabel: "내용",
        icon: "📘",
        items: [
            { id: "topic_relevance", label: "주제 적절성", desc: "발표 목적에 적절한 주제를 선정하였다." },
            { id: "presentation_content", label: "발표 내용의 적절성", desc: "적절한 핵심 내용을 제시하였다." },
            { id: "examples_appropriateness", label: "사례와 예시의 적절성", desc: "적절한 사례나 예시를 제시하였다." },
        ],
    },
    {
        id: "organization",
        label: "조직",
        shortLabel: "조직",
        icon: "🧭",
        items: [
            { id: "presentation_structure", label: "발표 구조의 완결성", desc: "도입·전개·마무리의 구조를 갖추어 내용을 조직하였다." },
            { id: "paragraph_connection", label: "단락 간 연결의 유기성", desc: "단락과 단락이 유기적으로 연결되었다." },
            { id: "explanation_method", label: "설명 방식의 적절성", desc: "발표 내용에 적절한 설명 방식을 사용하였다." },
        ],
    },
    {
        id: "expression",
        label: "전달 및 표현",
        shortLabel: "전달 및 표현",
        icon: "🎙️",
        items: [
            { id: "vocabulary_selection", label: "어휘 선택의 적절성", desc: "발표 상황에 적절한 어휘를 선택하여 말하였다." },
            { id: "paralinguistic_expression", label: "준언어적 표현의 적절성", desc: "억양, 속도, 강세 등의 준언어적 요소를 효과적으로 활용하였다." },
            { id: "presentation_fluency", label: "발표의 유창성", desc: "발음이 명료하고 매끄럽게 말하였다." },
            { id: "nonverbal_expression", label: "비언어적 표현의 적절성", desc: "표정과 신체 동작이 발표 내용에 적합하였다." },
            { id: "eye_contact", label: "시선 접촉의 지속성", desc: "청중과 골고루 시선 접촉을 유지하였다." },
            { id: "presentation_materials", label: "발표 자료의 적절성", desc: "발표 자료가 발표 내용과 잘 부합하고 이해에 도움을 준다." },
        ],
    },
];

// flat lookup: id -> { ...item, categoryId, categoryLabel }
export const FEEDBACK_ITEMS_BY_ID = FEEDBACK_CATEGORIES.reduce((acc, cat) => {
    cat.items.forEach((item) => {
        acc[item.id] = { ...item, categoryId: cat.id, categoryLabel: cat.label };
    });
    return acc;
}, {});

export const ALL_ITEM_IDS = Object.keys(FEEDBACK_ITEMS_BY_ID);

// 이전 16개 영역으로 저장된 결과를 현재 12개 평가표에 표시하기 위한 대응표.
export const LEGACY_ITEM_ID_TO_CURRENT_ID = {
    vocabulary_expression: "vocabulary_selection",
    grammar_accuracy: "presentation_content",
    audience_customization: "presentation_content",
    intro_structure: "presentation_structure",
    organization_flow: "paragraph_connection",
    sentence_clarity: "explanation_method",
    conclusion_structure: "presentation_structure",
    vocal_expression: "paralinguistic_expression",
    pronunciation_fluency: "presentation_fluency",
    gesture_movement: "nonverbal_expression",
    attitude_attire: "nonverbal_expression",
    movement_control: "nonverbal_expression",
    media_use: "presentation_materials",
};

export const LEGACY_ITEM_LABELS = {
    vocabulary_expression: "어휘 및 표현 적절성",
    grammar_accuracy: "문법 및 언어 정확성",
    audience_customization: "청중 맞춤성",
    intro_structure: "도입 구성",
    organization_flow: "내용 조직 및 흐름",
    sentence_clarity: "문장 완결성 및 명료성",
    conclusion_structure: "결론 구성",
    vocal_expression: "음성 표현",
    pronunciation_fluency: "발음 및 말하기 유창성",
    gesture_movement: "몸짓 및 움직임",
    attitude_attire: "태도 및 복장",
    movement_control: "불필요한 움직임 통제",
    media_use: "매체 활용",
};

export function normalizeFeedbackItemIds(ids = []) {
    return [...new Set((Array.isArray(ids) ? ids : [])
        .map((id) => FEEDBACK_ITEMS_BY_ID[id] ? id : LEGACY_ITEM_ID_TO_CURRENT_ID[id])
        .filter(Boolean))];
}

export function buildEmptyCategoryAverages() {
    return FEEDBACK_CATEGORIES.reduce((acc, category) => {
        acc[category.id] = null;
        return acc;
    }, {});
}
