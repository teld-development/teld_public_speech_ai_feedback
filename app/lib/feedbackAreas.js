// 발표 피드백 영역 정의 (3대 영역, 16개 하위 영역)

export const FEEDBACK_CATEGORIES = [
    {
        id: "content",
        label: "내용",
        shortLabel: "내용",
        icon: "📘",
        items: [
            { id: "topic_relevance", label: "주제 적절성", desc: "발표 목적과 주제에 맞는 내용을 선정하였다." },
            { id: "example_case", label: "사례 또는 예시 제시", desc: "설명하는 내용과 관련된 적절한 사례나 예시를 제시하였다." },
            { id: "audience_customization", label: "설명의 구체성", desc: "예상 청중이 이해하기 쉽게 내용을 구체적으로 설명하였다." },
        ],
    },
    {
        id: "organization",
        label: "조직",
        shortLabel: "조직",
        icon: "🧭",
        items: [
            { id: "intro_final", label: "도입-전개-마무리의 구성", desc: "도입-전개-마무리의 구조를 갖추어 내용을 조직하였다." },
            { id: "paragraph_link", label: "단락 연결의 유기성", desc: "단락과 단락이 유기적으로 연결되었다." },
            { id: "appropriate_method", label: "내용 조직의 목적 부합성", desc: "설명 대상에 적절한 방식으로 내용을 구성하였다. 예) 원인/결과, 문제/해결, 비교, 대조, 분류, 분석" },
        ],
    },
    {
        id: "expression",
        label: "표현",
        shortLabel: "표현",
        icon: "🎙️",
        items: [
            { id: "appropriate_vocab", label: "어휘 적절성", desc: "발표 상황에 적절한 어휘를 선택하여 표현하였다." },
            { id: "grammar_accuracy", label: "어법 준수", desc: "어법에 맞게 말하였다." },
            { id: "nonverbal_expression", label: "비언어적 표현", desc: "비언어적 행동(표정, 신체 동작)이 발표 내용에 적합하였다." },
            { id: "eye_contact", label: "시선 처리", desc: "청중과 골고루 시선 접촉을 유지하였다." },
            { id: "pronunciation_fluency", label: "발음", desc: "발음이 명료하였다." },
            { id: "media_alignment", label: "발표자료의 적절성", desc: "발표자료와 발표 내용이 부합하였다." },
            { id: "media_complement", label: "발표자료의 보완성", desc: "발표내용을 뒷받침하는 발표자료를 사용하였다." },
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
