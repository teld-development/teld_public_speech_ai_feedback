// 발표 피드백 영역 정의 (3 카테고리, 12개 세부 항목)

export const FEEDBACK_CATEGORIES = [
    {
        id: "visual",
        label: "시각적 수치 및 신체 활용",
        shortLabel: "Visual & Body",
        icon: "👁️",
        items: [
            { id: "eye_contact", label: "시선 접촉", desc: "카메라 렌즈를 응시하며 청중과 눈을 맞추는 빈도와 적절성" },
            { id: "facial_expression", label: "얼굴 표정", desc: "메시지의 감정과 의미를 강화하는 안면 근육의 움직임" },
            { id: "gesture", label: "제스처", desc: "화면 범위(Camera frame) 내에서 메시지를 강조하기 위해 사용하는 손동작" },
            { id: "verbal_nonverbal_sync", label: "언어-비언어 동기화", desc: "말의 내용과 표정, 손짓이 시간적으로 일치하는 정도" },
            { id: "audience_awareness", label: "비언어적 청중 인식", desc: "화면 너머의 청중을 인지하고 있음을 보여주는 미세한 반응(고개 끄덕임 등)" },
            { id: "no_distraction", label: "방해 동작 지양", desc: "카메라 앞에서 불필요하게 몸을 흔들거나 만지는 등 산만한 습관의 부재" },
            { id: "facing", label: "청중 대면", desc: "앉아 있는 상태에서 신체의 방향이 정면(카메라)을 올바르게 향하고 있는 상태" },
        ],
    },
    {
        id: "verbal",
        label: "음성 전달 수행",
        shortLabel: "Verbal & Vocal",
        icon: "🎤",
        items: [
            { id: "prosody", label: "구어 표현 및 준언어", desc: "목소리의 톤, 속도, 크기 등을 조절하여 전달력을 높이는 능력" },
            { id: "language_choice", label: "언어 선택", desc: "텍스트의 정교함과 상황에 맞는 단어 사용 능력" },
            { id: "audience_adaptation", label: "청중 적응", desc: "실시간 채팅이나 화상 화면의 반응에 따라 발표 내용을 유연하게 조정하는 능력" },
        ],
    },
    {
        id: "media",
        label: "매체 및 환경 관리",
        shortLabel: "Media & Professionalism",
        icon: "🖥️",
        items: [
            { id: "media_interaction", label: "기술 및 매체 상호작용", desc: "화면 공유, 슬라이드 넘기기 등 디지털 도구를 매끄럽게 다루는 능력" },
            { id: "professional_appearance", label: "전문적 외양", desc: "카메라에 비치는 연사의 복장과 배경이 발표 맥락에 부합하는 정도" },
        ],
    },
];

// flat lookup: id → { ...item, categoryId, categoryLabel }
export const FEEDBACK_ITEMS_BY_ID = FEEDBACK_CATEGORIES.reduce((acc, cat) => {
    cat.items.forEach((item) => {
        acc[item.id] = { ...item, categoryId: cat.id, categoryLabel: cat.label };
    });
    return acc;
}, {});

export const ALL_ITEM_IDS = Object.keys(FEEDBACK_ITEMS_BY_ID);
