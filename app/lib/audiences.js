export const AUDIENCE_OPTIONS = [
    "주제에 대한 사전지식이 거의 없는 사람",
    "주제에 대한 기초지식이 있는 사람",
    "주제에 대한 전문지식 또는 실무경험이 있는 사람",
];

export const LEGACY_STUDENT_AUDIENCE = "학생들";
export const BASIC_KNOWLEDGE_AUDIENCE = AUDIENCE_OPTIONS[1];

export function normalizeAudience(value) {
    return value === LEGACY_STUDENT_AUDIENCE ? BASIC_KNOWLEDGE_AUDIENCE : value || "";
}

