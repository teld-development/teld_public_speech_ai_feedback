const FEEDBACK_CATEGORIES = [
  {
    id: "content",
    label: "내용",
    shortLabel: "내용",
    icon: "📘",
    items: [
      { id: "topic_relevance", label: "주제 적절성", desc: "발표의 목적을 고려하여 주제를 적절히 선정하였다." },
      { id: "presentation_content", label: "발표 내용의 적절성", desc: "발표 주제에 대해 적절한 핵심 내용을 제시하였다." },
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
      { id: "explanation_method", label: "설명 방식의 적절성", desc: "적절한 설명 방식을 사용하였다(예: 원인/결과, 문제/해결, 비교, 대조, 분류, 분석)." },
    ],
  },
  {
    id: "expression",
    label: "표현 및 전달",
    shortLabel: "표현 및 전달",
    icon: "🎙️",
    items: [
      { id: "vocabulary_selection", label: "어휘 선택의 적절성", desc: "청중과 발표 목적에 맞는 적절한 어휘를 사용하였다." },
      { id: "paralinguistic_expression", label: "준언어적 표현의 효과적 활용", desc: "준언어적 요소(억양, 속도, 강세 등)를 효과적으로 활용하였다." },
      { id: "presentation_fluency", label: "발표의 유창성", desc: "말의 흐름이 자연스럽고 원활하였다." },
      { id: "nonverbal_expression", label: "비언어적 표현의 효과적 활용", desc: "비언어적 행동(표정, 자세, 몸짓)을 효과적으로 활용하였다." },
      { id: "eye_contact", label: "시선 처리의 지속성", desc: "청중과 시선을 골고루 맞추었다." },
      { id: "presentation_materials", label: "발표 자료의 적절성", desc: "발표자료가 발표 내용과 잘 부합하며, 이를 뒷받침하는 시각 자료(차트, 표, 사진 등)가 제시됨." },
    ],
  },
];

const FEEDBACK_ITEMS_BY_ID = FEEDBACK_CATEGORIES.reduce((acc, cat) => {
  cat.items.forEach((item) => {
    acc[item.id] = { ...item, categoryId: cat.id, categoryLabel: cat.label };
  });
  return acc;
}, {});

const ALL_ITEM_IDS = Object.keys(FEEDBACK_ITEMS_BY_ID);

const LEGACY_ITEM_ID_TO_CURRENT_ID = {
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

function normalizeFeedbackItemIds(ids = []) {
  return [...new Set((Array.isArray(ids) ? ids : [])
    .map((id) => FEEDBACK_ITEMS_BY_ID[id] ? id : LEGACY_ITEM_ID_TO_CURRENT_ID[id])
    .filter(Boolean))];
}

function buildEmptyCategoryAverages() {
  return FEEDBACK_CATEGORIES.reduce((acc, category) => {
    acc[category.id] = null;
    return acc;
  }, {});
}

module.exports = {
  FEEDBACK_CATEGORIES,
  FEEDBACK_ITEMS_BY_ID,
  ALL_ITEM_IDS,
  LEGACY_ITEM_ID_TO_CURRENT_ID,
  normalizeFeedbackItemIds,
  buildEmptyCategoryAverages,
};
