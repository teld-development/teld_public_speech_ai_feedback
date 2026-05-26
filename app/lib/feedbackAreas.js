// 발표 피드백 영역 정의 (3대 영역, 17개 하위 영역)

export const FEEDBACK_CATEGORIES = [
    {
        id: "content",
        label: "내용",
        shortLabel: "내용",
        icon: "📘",
        items: [
            { id: "topic_relevance", label: "주제 적절성", desc: "청중과 발표 상황에 적절한 주제를 선정하였다." },
            { id: "vocabulary_expression", label: "어휘 및 표현 적절성", desc: "상황과 맥락에 적절한 어휘를 선택하여 표현하였다." },
            { id: "grammar_accuracy", label: "문법 및 언어 정확성", desc: "어법과 문법에 맞게 표현하였다." },
            { id: "audience_customization", label: "청중 맞춤성", desc: "청중의 수준과 특성을 고려하여 발표 내용을 효과적으로 조정하였다." },
        ],
    },
    {
        id: "organization",
        label: "조직",
        shortLabel: "조직",
        icon: "🧭",
        items: [
            { id: "intro_structure", label: "도입 구성", desc: "청중이 발표 주제와 발표자에 대해 이해할 수 있도록 도입을 구성하였다." },
            { id: "organization_flow", label: "내용 조직 및 흐름", desc: "내용 간 연결이 자연스럽고 체계적인 조직 구조를 활용하였다." },
            { id: "sentence_clarity", label: "문장 완결성 및 명료성", desc: "한 가지 생각이나 내용을 완결된 문장으로 명확하게 전달하였다." },
            { id: "conclusion_structure", label: "결론 구성", desc: "논지를 강화하고 청중이 발표의 마무리를 명확히 인식할 수 있도록 결론을 구성하였다." },
            { id: "time_management", label: "시간 운영", desc: "발표시간을 초과하지 않고 효과적으로 활용하였다." },
        ],
    },
    {
        id: "expression",
        label: "표현",
        shortLabel: "표현",
        icon: "🎙️",
        items: [
            { id: "vocal_expression", label: "음성 표현", desc: "음성 표현과 준언어적 요소(억양, 속도, 강세 등)를 효과적으로 활용하였다." },
            { id: "nonverbal_expression", label: "비언어적 표현", desc: "언어적 메시지를 보완하는 비언어적 행동을 적절히 활용하였다." },
            { id: "eye_contact", label: "시선 처리", desc: "청중과 적절한 시선 접촉을 유지하였다." },
            { id: "pronunciation_fluency", label: "발음 및 말하기 유창성", desc: "발음과 말하기 속도가 적절하며 매끄럽게 말하였다." },
            { id: "gesture_movement", label: "몸짓 및 움직임", desc: "전달 내용을 효과적으로 지원하는 움직임과 몸짓을 활용하였다." },
            { id: "attitude_attire", label: "태도 및 복장", desc: "발표 상황과 맥락에 적절한 복장과 태도를 유지하였다." },
            { id: "movement_control", label: "불필요한 움직임 통제", desc: "산만하거나 불필요한 신체 움직임을 보이지 않았다." },
            { id: "media_use", label: "매체 활용", desc: "기술 및 매체를 발표 목적에 맞게 적절히 활용하였다." },
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

export function buildEmptyCategoryAverages() {
    return FEEDBACK_CATEGORIES.reduce((acc, category) => {
        acc[category.id] = null;
        return acc;
    }, {});
}
