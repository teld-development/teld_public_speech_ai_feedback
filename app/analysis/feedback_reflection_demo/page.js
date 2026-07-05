"use client";

import { useMemo, useState } from "react";
import PresentationDataVisuals from "../../components/PresentationDataVisuals";

const DEMO_FEEDBACK_CATEGORIES = [
    {
        id: "content",
        label: "내용",
        shortLabel: "내용",
        icon: "book",
        desc: "발표 주제와 청중에 맞는 정보 선택과 설명을 점검합니다.",
        items: [
            { id: "content_suitability", label: "내용적합성", desc: "발표 목적과 주제에 맞는 내용을 선정하였다." },
            { id: "audience_consideration", label: "청중고려", desc: "청중의 수준과 특성을 고려하였다." },
            { id: "example_use", label: "사례 활용", desc: "설명하는 내용과 관련된 적절한 사례나 예시를 제시하였다." },
            { id: "explanation_specificity", label: "설명의 구체성", desc: "예상 청중이 이해하기 쉽게 내용을 구체적으로 설명하였다." },
        ],
    },
    {
        id: "organization",
        label: "조직",
        shortLabel: "조직",
        icon: "target",
        desc: "발표 내용이 어떤 순서와 관계로 배열되었는지 점검합니다.",
        items: [
            { id: "organization_explanation_specificity", label: "설명의 구체성", desc: "각 부분의 설명이 조직 안에서 충분히 구체적으로 제시되었다." },
            { id: "structure_completeness", label: "구조의 완결성", desc: "도입-전개-마무리의 구조를 갖추어 내용을 조직하였다." },
            { id: "content_connectivity", label: "내용의 연결성", desc: "단락과 단락이 유기적으로 연결되었다." },
            { id: "organization_method", label: "구성 방식의 적절성", desc: "설명 대상에 적절한 방식으로 내용을 구성하였다." },
        ],
    },
    {
        id: "expression_delivery",
        label: "표현 및 전달",
        shortLabel: "표현",
        icon: "mic",
        desc: "말하기 표현, 음성, 비언어적 전달 방식을 점검합니다.",
        items: [
            { id: "vocabulary_appropriateness", label: "어휘의 적절성", desc: "발표 상황에 적절한 어휘를 선택하여 말하였다." },
            { id: "grammar_accuracy", label: "어법의 정확성", desc: "어법에 맞게 말하였다." },
            { id: "vocal_expression_use", label: "음성 표현 활용", desc: "억양, 속도, 강세 등을 효과적으로 활용하였다." },
            { id: "nonverbal_expression_use", label: "비언어 표현 활용", desc: "표정과 신체 동작이 발표 내용에 적합하였다." },
            { id: "eye_contact", label: "시선 처리", desc: "청중과 골고루 시선 접촉을 유지하였다." },
            { id: "pronunciation_clarity", label: "발음의 명료성", desc: "발음이 명료하였다." },
        ],
    },
];

const DEMO_RUBRIC_ITEMS = DEMO_FEEDBACK_CATEGORIES.flatMap((category) =>
    category.items.map((item, index) => ({
        ...item,
        categoryId: category.id,
        categoryLabel: category.label,
        itemIndex: index,
    }))
);

const DUMMY_FEEDBACK = {
    content_suitability: {
        score: 4,
        summary: "발표 목적과 주제에 맞는 내용을 중심으로 선정해 전체 메시지가 비교적 분명하게 전달되었습니다.",
        evidence: [
            "도입부에서 생성형 인공지능의 수업 활용이라는 발표 목적을 분명히 제시했습니다.",
            "개인정보, 저작권, 교사의 검토처럼 주제와 직접 관련된 내용을 중심으로 설명했습니다.",
        ],
        suggestion: "발표 목적을 한 문장으로 먼저 제시한 뒤, 각 내용이 그 목적과 어떻게 연결되는지 짧게 덧붙여보세요.",
    },
    audience_consideration: {
        score: 3,
        summary: "청중의 수준을 일부 고려했지만, 전문 용어나 학교 현장 맥락을 더 쉽게 풀어 설명할 필요가 있습니다.",
        evidence: [
            "수업 설계와 피드백 자동화처럼 청중에게 익숙한 맥락을 활용했습니다.",
            "생성 결과 검토, 저작권 같은 개념은 청중 수준에 맞춘 간단한 예시가 더 필요했습니다.",
        ],
        suggestion: "전문 용어를 말한 뒤 바로 쉬운 예시를 하나 붙여 청중의 이해를 도와보세요.",
    },
    organization_explanation_specificity: {
        score: 3,
        summary: "조직 안에서 주요 내용은 차례로 제시되었지만, 각 부분의 설명이 왜 그 순서로 이어지는지 더 구체적으로 드러낼 필요가 있습니다.",
        evidence: [
            "활용 사례, 피드백 자동화, 주의점이 순서대로 제시되어 큰 흐름은 확인되었습니다.",
            "각 부분이 앞 내용과 어떻게 이어지는지 설명하는 연결 문장이 더해지면 조직의 설득력이 높아집니다.",
        ],
        suggestion: "새 항목으로 넘어갈 때 '이 부분은 앞서 말한 사례와 연결됩니다'처럼 순서의 이유를 짧게 밝혀보세요.",
    },
    structure_completeness: {
        score: 3,
        summary: "도입-전개-마무리의 기본 구조는 갖추었지만, 마무리에서 핵심 논지를 다시 묶는 문장이 더 필요합니다.",
        evidence: [
            "도입에서 발표 주제와 방향을 제시하고, 본론에서 활용 사례와 주의점을 차례로 설명했습니다.",
            "마지막 인사 직전에 청중이 기억해야 할 핵심 메시지를 한 번 더 정리하면 완결성이 높아집니다.",
        ],
        suggestion: "결론은 '정리하면'으로 시작해 핵심 주장, 이유, 청중에게 남길 메시지를 한 문장씩 말해보세요.",
    },
    content_connectivity: {
        score: 4,
        summary: "단락과 단락의 흐름은 대체로 자연스럽지만, 전환 문장을 보강하면 연결성이 더 분명해집니다.",
        evidence: [
            "AI 활용 사례에서 피드백 자동화로 넘어가는 흐름은 청중이 따라가기 쉬웠습니다.",
            "일부 전환부에서는 앞 내용과 다음 내용의 관계를 더 직접적으로 설명할 여지가 있었습니다.",
        ],
        suggestion: "새 단락으로 넘어갈 때 '이 사례는 다음 주의점과 연결됩니다'처럼 관계를 드러내는 문장을 넣어보세요.",
    },
    vocabulary_appropriateness: {
        score: 4,
        summary: "발표 상황에 맞는 어휘를 선택해 설명했고, 전문 용어도 대체로 무리 없이 사용했습니다.",
        evidence: [
            "생성형 인공지능, 피드백 자동화, 저작권처럼 발표 주제에 필요한 어휘를 적절히 사용했습니다.",
            "청중이 어려워할 수 있는 용어에는 간단한 풀이가 더해지면 이해가 쉬워질 수 있습니다.",
        ],
        suggestion: "전문 용어를 처음 말할 때는 쉬운 표현으로 한 번 풀어 설명해보세요.",
    },
    grammar_accuracy: {
        score: 1,
        summary: "대부분의 문장은 이해 가능했지만, 일부 문장에서 어법이 어색해 의미 전달이 흐려지는 부분이 있었습니다.",
        evidence: [
            "일부 문장에서 조사나 연결 표현이 부자연스러워 문장 간 관계가 명확하지 않았습니다.",
            "긴 문장을 한 번에 말하면서 주어와 서술어의 호응이 약해지는 구간이 있었습니다.",
        ],
        suggestion: "긴 문장은 두 문장으로 나누고, 발표 전 핵심 문장만 따로 읽으며 어법을 점검해보세요.",
    },
    vocal_expression_use: {
        score: 3,
        summary: "발음과 속도는 안정적이지만, 핵심 문장에서 억양과 강세 변화가 더 필요합니다.",
        evidence: [
            "설명 구간의 속도는 일정해 청중이 내용을 따라가기 쉬웠습니다.",
            "중요한 결론을 말할 때도 톤 변화가 작아 강조점이 약하게 전달되었습니다.",
        ],
        suggestion: "핵심 문장은 속도를 조금 늦추고 마지막 단어에 힘을 싣는 방식으로 연습해보세요.",
    },
    topic_relevance: {
        score: 4,
        summary: "발표 주제가 청중의 관심과 발표 상황에 잘 맞아 도입부터 목적이 분명하게 전달되었습니다.",
        evidence: [
            "도입부에서 발표 주제를 청중의 실제 상황과 연결해 관심을 유도했습니다.",
            "주제 범위가 지나치게 넓지 않아 제한된 시간 안에서 다루기 적절했습니다.",
        ],
        suggestion: "도입 마지막에 발표를 통해 청중이 얻을 수 있는 핵심 가치를 한 문장으로 제시해보세요.",
    },
    organization_flow: {
        score: 4,
        summary: "내용 간 연결이 비교적 자연스럽고, 발표자가 의도한 설명 순서가 명확하게 드러났습니다.",
        evidence: [
            "본론의 주요 항목을 순서대로 제시해 청중이 흐름을 따라가기 쉬웠습니다.",
            "일부 전환부에서는 앞 내용과 다음 내용의 관계를 더 명확히 설명할 여지가 있었습니다.",
        ],
        suggestion: "새 소주제로 넘어갈 때 '이제 원인에서 해결 방안으로 넘어가겠습니다'처럼 연결 문장을 넣어보세요.",
    },
    conclusion_structure: {
        score: 3,
        summary: "마무리 발화는 있었지만 핵심 논지를 다시 묶어주는 결론 문장이 조금 약했습니다.",
        evidence: [
            "03:12 구간에서 발표를 마쳤지만, 발표 전체의 핵심 가치를 한 번 더 정리하지는 않았습니다.",
            "마지막 인사 직전에 청중이 기억해야 할 메시지를 제시하면 마무리감이 더 선명해질 수 있습니다.",
        ],
        suggestion: "결론은 '정리하면'으로 시작해 핵심 주장, 이유, 청중에게 남길 메시지를 한 문장씩 말해보세요.",
    },
    vocal_expression: {
        score: 3,
        summary: "발음과 속도는 안정적이지만, 핵심 문장에서 억양과 강세 변화가 더 필요합니다.",
        evidence: [
            "설명 구간의 속도는 일정해 청중이 내용을 따라가기 쉬웠습니다.",
            "중요한 결론을 말할 때도 톤 변화가 작아 강조점이 약하게 전달되었습니다.",
        ],
        suggestion: "핵심 문장은 속도를 조금 늦추고 마지막 단어에 힘을 싣는 방식으로 연습해보세요.",
    },
    eye_contact: {
        score: 4,
        summary: "발표 초반과 결론부에서 카메라를 안정적으로 응시해 청중과 연결되는 느낌이 잘 살아났습니다.",
        evidence: [
            "핵심 주제를 소개하는 00:18 구간에서 시선이 정면에 머물러 메시지 집중도가 높았습니다.",
            "자료를 확인한 뒤 카메라로 돌아오는 속도가 빨라 발표 흐름이 끊기지 않았습니다.",
        ],
        suggestion: "설명 자료를 볼 때도 한 문장을 마친 뒤 정면을 다시 바라보는 리듬을 유지해보세요.",
    },
    media_use: {
        score: 4,
        summary: "슬라이드 전환과 화면 공유 흐름이 자연스러워 발표 목적에 맞는 매체 활용이 이루어졌습니다.",
        evidence: [
            "화면 전환 직후 바로 다음 설명으로 연결되어 공백이 거의 없었습니다.",
            "복잡한 자료에서는 볼 위치를 먼저 짚어주면 시각적 안내가 더 강화될 수 있습니다.",
        ],
        suggestion: "표나 이미지가 등장하는 순간에는 핵심 위치를 먼저 안내한 뒤 설명을 시작해보세요.",
    },
};

const DUMMY_SUMMARY = {
    overall: "이번 발표는 주제와 청중을 고려한 내용 구성이 안정적이었고, 도입-전개-마무리의 흐름도 비교적 분명했습니다. 핵심 개념을 설명하는 어휘 선택과 매체 활용은 발표 목적에 잘 맞았습니다. 다만 결론부의 논지 강화와 핵심 문장의 음성 강조를 조금 더 분명하게 만들면 전달력이 높아질 수 있습니다.",
    strengths: [
        "청중 수준에 맞춘 예시를 사용해 주제 이해를 도왔습니다.",
        "도입에서 발표의 방향을 제시해 전체 흐름을 따라가기 쉬웠습니다.",
        "발표 상황에 맞는 태도와 매체 활용으로 전문성이 유지되었습니다.",
    ],
    suggestions: [
        "결론에서 핵심 논지를 한 문장으로 다시 정리해 마무리감을 강화해보세요.",
        "내용 전환부마다 연결 표현을 넣어 조직의 흐름을 더 분명히 만들어보세요.",
        "강조할 문장은 속도를 늦추고 억양 변화를 주어 청중의 주의를 모아보세요.",
    ],
};

const DEMO_EXPECTED_SECONDS = 180;
const DEMO_ACTUAL_SECONDS = 228;
const RUBRIC_EVIDENCE_TIMES = ["00:18", "00:42", "01:12", "01:43", "02:04", "02:31"];
const DUMMY_TRANSCRIPT = [
    { time: "00:03", text: "안녕하세요. 오늘은 생성형 인공지능을 수업 설계에 활용하는 방법을 발표하겠습니다." },
    { time: "00:17", text: "먼저 교사가 반복적으로 수행하는 준비 작업을 줄이는 사례부터 살펴보겠습니다." },
    { time: "00:36", text: "예를 들어 학습 목표에 맞춘 질문 생성이나 수준별 활동지를 빠르게 만들 수 있습니다." },
    { time: "00:58", text: "다만 생성 결과를 그대로 쓰기보다 수업 맥락과 학생 수준에 맞게 조정하는 과정이 필요합니다." },
    { time: "01:21", text: "두 번째로 피드백 자동화는 학생의 초안을 빠르게 점검하는 데 도움을 줄 수 있습니다." },
    { time: "01:43", text: "하지만 평가 기준을 교사가 명확하게 제시하지 않으면 피드백의 방향이 흐려질 수 있습니다." },
    { time: "02:04", text: "마지막으로 데이터 보안과 저작권 문제를 고려해 학교 차원의 사용 원칙을 세워야 합니다." },
    { time: "02:31", text: "정리하면 인공지능은 수업을 대체하는 도구가 아니라 교사의 판단을 보조하는 도구로 활용되어야 합니다." },
    { time: "03:12", text: "이상으로 발표를 마치겠습니다. 감사합니다." },
];

const REFLECTION_STEPS = [
    {
        id: "keep",
        label: "잘한점",
        title: "오늘 발표에서 계속 가져갈 점",
        desc: "잘 작동했던 표현, 구성, 태도, 자료 활용을 적어두세요.",
        placeholder: "예: 도입에서 발표 목적을 먼저 말해서 흐름이 분명했다.",
    },
    {
        id: "improve",
        label: "개선점",
        title: "다음 회차에서 조정할 점",
        desc: "분석 결과를 보고 가장 먼저 고치고 싶은 한두 가지를 정리하세요.",
        placeholder: "예: 결론에서 핵심 문장을 더 짧고 분명하게 말해야겠다.",
    },
    {
        id: "next",
        label: "다음 계획",
        title: "다음 연습에서 실제로 할 행동",
        desc: "다음 회차 전에 바로 실행할 수 있는 연습 계획을 적어두세요.",
        placeholder: "예: 마지막 30초 결론부만 따로 3번 녹화해보기.",
    },
];

const FLOW_STEPS = [
    { id: "self", label: "자기평가 및 성찰" },
    { id: "ai", label: "AI 중요 피드백 확인 및 논의" },
    { id: "qa", label: "질의응답 피드백" },
    { id: "full", label: "전체 피드백" },
];

const IMPORTANT_FEEDBACK = [
    {
        id: "content_connectivity",
        category: "조직",
        title: "내용의 연결성",
        reason: "설명 순서는 안정적이지만, 소주제 사이의 연결 문장을 보강하면 청중이 흐름을 더 쉽게 따라올 수 있습니다.",
        prompt: "내용의 연결성 피드백을 바탕으로 다음 발표에서 바로 고칠 점을 알려줘.",
    },
    {
        id: "vocal_expression_use",
        category: "표현",
        title: "음성 표현 활용",
        reason: "중요 문장의 속도와 강세 변화가 작아 핵심 메시지가 상대적으로 약하게 전달되었습니다.",
        prompt: "음성 표현 활용 피드백을 더 구체적으로 연습 계획으로 바꿔줘.",
    },
    {
        id: "structure_completeness",
        category: "조직",
        title: "구조의 완결성",
        reason: "마지막 인사는 자연스러웠지만, 발표 전체를 압축하는 결론 문장이 더 필요합니다.",
        prompt: "구조의 완결성을 개선하려면 어떤 문장 틀로 연습하면 좋을까?",
    },
];

const MOCK_CHAT_REPLIES = {
    organization_flow: "내용 흐름은 '지금 말한 내용이 다음 내용과 어떻게 이어지는지'를 짧게 말해주는 것이 핵심이에요. 다음 연습에서는 각 소주제 앞에 '첫째', '이어서', '마지막으로' 같은 표지어를 적어두고, 전환 문장을 한 문장씩 붙여보세요.",
    vocal_expression: "음성 표현은 모든 문장을 크게 바꾸기보다 핵심 문장 3개만 표시해서 연습하면 좋아요. 표시한 문장에서는 말하기 속도를 10퍼센트 정도 늦추고, 마지막 단어를 조금 더 또렷하게 마무리해보세요.",
    conclusion_structure: "결론은 '오늘 발표에서 가장 중요한 점은...', '그 이유는...', '따라서...'의 세 문장 틀로 만들면 안정적이에요. 마지막 인사 전에 이 세 문장을 넣으면 발표가 갑자기 끝나는 느낌이 줄어듭니다.",
    default: "좋아요. 이번 발표에서는 흐름, 강조, 결론 중 하나를 먼저 고르는 것이 좋아요. 다음 연습에서는 한 번에 전부 고치려 하기보다 가장 효과가 큰 한 가지를 정하고 녹화 후 다시 확인해보세요.",
};

const DUMMY_QA_FEEDBACK = [
    {
        question: "생성형 인공지능을 수업에 활용할 때 가장 조심해야 할 점은 무엇인가요?",
        answer: "결과를 그대로 쓰기보다 교사가 수업 목표와 학생 수준에 맞게 검토해야 한다고 생각합니다. 특히 개인정보나 저작권도 함께 확인해야 합니다.",
        score: 4,
        strength: "질문의 핵심인 주의점을 정확히 잡았고, 발표 내용의 주요 논지와 일관되게 답했습니다.",
        improve: "개인정보, 저작권, 교사 검토를 나열한 뒤 가장 중요한 기준 하나를 먼저 강조하면 답변의 중심이 더 선명해집니다.",
    },
    {
        question: "AI 피드백 자동화가 학생에게 어떤 도움을 줄 수 있나요?",
        answer: "학생이 초안을 빠르게 점검할 수 있고, 반복적으로 고쳐야 하는 부분을 확인하는 데 도움을 줄 수 있습니다.",
        score: 3,
        strength: "핵심 장점을 짧고 명확하게 답해 질문에 바로 반응했습니다.",
        improve: "구체적인 예시가 부족합니다. '문장 표현, 근거 부족, 구성 흐름'처럼 피드백 항목 예시를 하나 덧붙이면 설득력이 올라갑니다.",
    },
    {
        question: "AI가 교사를 대체할 수 있다고 보나요?",
        answer: "아니요. AI는 수업을 대신하기보다는 교사의 판단을 도와주는 도구로 활용되어야 한다고 생각합니다.",
        score: 4,
        strength: "입장을 먼저 밝힌 뒤 발표의 결론과 연결해 매우 안정적으로 답했습니다.",
        improve: "답변 자체는 좋습니다. 여기에 '왜냐하면 학생 맥락을 판단하는 일은 교사의 역할이기 때문입니다'를 붙이면 더 완결된 답이 됩니다.",
    },
];

const DUMMY_QA_REVIEW_ITEMS = DUMMY_QA_FEEDBACK.map((item, index) => ({
    id: `demo-qa-${index + 1}`,
    index: index + 1,
    type: index === 0 ? "이해 확인" : index === 1 ? "적용 질문" : "입장 질문",
    target: `${index + 1}번`,
    question: item.question,
    answerTranscript: item.answer,
    aiFeedback: `잘한 점: ${item.strength}\n개선점: ${item.improve}`,
}));

function parseDemoTimeToSeconds(time) {
    const [mins, secs] = String(time || "0:00").split(":").map((part) => Number(part));
    return (Number.isFinite(mins) ? mins : 0) * 60 + (Number.isFinite(secs) ? secs : 0);
}

function buildDemoFeedback(item, category, index = 0) {
    const baseScore = 3 + (index % 3 === 0 ? 1 : 0);
    return {
        score: baseScore,
        summary: `${item.label}은 ${category.label} 영역에서 대체로 안정적으로 수행되었습니다. ${item.desc}`,
        evidence: [
            `${item.label}과 관련된 장면에서 발표 목적과 청중을 고려한 선택이 관찰되었습니다.`,
            `일부 구간에서는 ${item.label}을 더 분명하게 드러내면 발표의 설득력과 전달력이 높아질 수 있습니다.`,
            `${item.label} 기준이 드러나는 표현은 있었지만, 근거가 되는 장면을 조금 더 선명하게 만들 필요가 있습니다.`,
            `마무리 구간에서도 ${item.label}을 한 번 더 점검하면 발표 전체의 완성도가 높아질 수 있습니다.`,
        ],
        suggestion: `${item.label}을 다음 연습의 우선 점검 항목으로 두고, 발표 전 체크리스트에 한 문장 기준을 추가해보세요.`,
    };
}

function getRubricEvidenceList(feedback, item) {
    const baseEvidence = Array.isArray(feedback?.evidence) ? feedback.evidence : [];
    const label = item?.label || "해당 영역";
    const fallbackEvidence = [
        `${label}과 관련된 수행 모습은 확인되지만, 청중이 기준을 바로 알아차릴 만큼 뚜렷하게 드러나지는 않았습니다.`,
        `${label}을 보완할 수 있는 짧은 설명이나 예시가 더해지면 발표의 설득력이 높아질 수 있습니다.`,
        `후반부에서도 ${label}을 다시 확인할 수 있는 표현을 넣으면 발표 전체의 일관성이 좋아집니다.`,
        `다음 연습에서는 ${label} 기준을 발표 대본 옆에 표시해두고 해당 구간을 집중 점검해보세요.`,
    ];

    const combined = [...baseEvidence];
    fallbackEvidence.forEach((text) => {
        if (combined.length < 4) combined.push(text);
    });

    return combined;
}

function getRubricTone(score) {
    if (score === 1) return "danger";
    if (score < 4) return "warning";
    return "good";
}

function renderDemoCategoryIcon(icon) {
    const commonProps = {
        width: 22,
        height: 22,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": "true",
    };

    if (icon === "target") {
        return (
            <svg {...commonProps}>
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="5" />
                <circle cx="12" cy="12" r="1" />
            </svg>
        );
    }

    if (icon === "mic") {
        return (
            <svg {...commonProps}>
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <path d="M12 19v3" />
                <path d="M8 22h8" />
            </svg>
        );
    }

    return (
        <svg {...commonProps}>
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" />
        </svg>
    );
}

function getDemoCategoryStats(category) {
    const scores = category.items.map((item, index) => {
        const feedback = DUMMY_FEEDBACK[item.id] || buildDemoFeedback(item, category, index);
        return feedback.score;
    });
    const average = scores.reduce((sum, score) => sum + score, 0) / Math.max(scores.length, 1);

    return {
        average: average.toFixed(1),
        count: scores.length,
        tone: getRubricTone(average),
    };
}

function getStepIndex(stepId) {
    return FLOW_STEPS.findIndex((step) => step.id === stepId);
}

export default function FeedbackReflectionDemoPage() {
    const [activeStep, setActiveStep] = useState("self");
    const [transitionDirection, setTransitionDirection] = useState("forward");
    const [selfScore, setSelfScore] = useState(3.5);
    const [reflectionFields, setReflectionFields] = useState({
        keep: "도입에서 발표 목적을 먼저 말한 점은 유지하고 싶다.",
        improve: "결론에서 핵심 문장을 더 짧고 분명하게 말해야겠다.",
        next: "마지막 30초 결론부만 따로 3번 녹화해보기.",
    });
    const [activeReflectionStep, setActiveReflectionStep] = useState("keep");
    const [reflectionOpen, setReflectionOpen] = useState(false);
    const [selectedRubricItemId, setSelectedRubricItemId] = useState(DEMO_RUBRIC_ITEMS[0]?.id || "");
    const [summaryModal, setSummaryModal] = useState(null);
    const [bottomTab, setBottomTab] = useState("data");
    const [selectedTranscriptIndex, setSelectedTranscriptIndex] = useState(null);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatInput, setChatInput] = useState("");
    const [mockChatMessages, setMockChatMessages] = useState([
        {
            role: "assistant",
            content: "안녕하세요. 먼저 중요한 피드백을 하나 고르면, 다음 발표에서 바로 해볼 수 있는 연습 방법으로 바꿔드릴게요.",
        },
    ]);

    const activeReflection = REFLECTION_STEPS.find((step) => step.id === activeReflectionStep) || REFLECTION_STEPS[0];
    const activeStepIndex = getStepIndex(activeStep);
    const selectedRubricItem = DEMO_RUBRIC_ITEMS.find((item) => item.id === selectedRubricItemId) || DEMO_RUBRIC_ITEMS[0];
    const selectedRubricCategory = DEMO_FEEDBACK_CATEGORIES.find((category) => category.id === selectedRubricItem?.categoryId) || DEMO_FEEDBACK_CATEGORIES[0];
    const selectedRubricCategoryStats = getDemoCategoryStats(selectedRubricCategory);
    const selectedRubricFeedback = selectedRubricItem
        ? DUMMY_FEEDBACK[selectedRubricItem.id] || buildDemoFeedback(selectedRubricItem, selectedRubricCategory, selectedRubricItem.itemIndex)
        : null;
    const selectedRubricTone = selectedRubricFeedback ? getRubricTone(selectedRubricFeedback.score) : "good";
    const selectedRubricEvidence = selectedRubricFeedback ? getRubricEvidenceList(selectedRubricFeedback, selectedRubricItem) : [];
    const demoTranscriptUtterances = useMemo(() => {
        return DUMMY_TRANSCRIPT.map((utterance, index) => {
            const startSec = parseDemoTimeToSeconds(utterance.time);
            const nextStartSec = DUMMY_TRANSCRIPT[index + 1]
                ? parseDemoTimeToSeconds(DUMMY_TRANSCRIPT[index + 1].time)
                : startSec + 12;
            return {
                ...utterance,
                startSec,
                endSec: Math.max(startSec + 1, nextStartSec - 1),
            };
        });
    }, []);

    function goToStep(nextStep) {
        const nextIndex = getStepIndex(nextStep);
        setTransitionDirection(nextIndex >= activeStepIndex ? "forward" : "backward");
        setActiveStep(nextStep);
    }

    function appendMockReply(userText, feedbackId = "default") {
        const normalizedText = String(userText || "").trim();
        if (!normalizedText) return;
        setMockChatMessages((prev) => [
            ...prev,
            { role: "user", content: normalizedText },
            { role: "assistant", content: MOCK_CHAT_REPLIES[feedbackId] || MOCK_CHAT_REPLIES.default },
        ]);
        setChatInput("");
    }

    function handleChatSubmit(event) {
        event.preventDefault();
        appendMockReply(chatInput);
    }

    function handleDiscussFeedback(item) {
        appendMockReply(item.prompt, item.id);
    }

    function renderReflectionFields(compact = false) {
        return (
            <div className={`feedback-reflection-demo-note-fields ${compact ? "compact" : ""}`}>
                {REFLECTION_STEPS.map((step) => (
                    <label key={step.id} className="feedback-reflection-demo-note-field">
                        <span>{step.label}</span>
                        <strong>{step.title}</strong>
                        <textarea
                            value={reflectionFields[step.id] || ""}
                            onChange={(event) => setReflectionFields((prev) => ({
                                ...prev,
                                [step.id]: event.target.value,
                            }))}
                            placeholder={step.placeholder}
                            rows={compact ? 3 : 5}
                        />
                    </label>
                ))}
            </div>
        );
    }

    function renderSelfScoreStars() {
        return (
            <div className="feedback-reflection-demo-stars" aria-label="총괄 자기평가 점수">
                <div className="feedback-reflection-demo-star-row">
                    {[1, 2, 3, 4].map((star) => {
                        const state = selfScore >= star ? "filled" : selfScore >= star - 0.5 ? "half" : "";
                        const nextScore = selfScore === star
                            ? star - 0.5
                            : selfScore === star - 0.5
                                ? star - 1
                                : star;
                        return (
                            <button
                                key={star}
                                type="button"
                                className={state}
                                onClick={() => setSelfScore(Number(nextScore.toFixed(1)))}
                                aria-label={`${nextScore.toFixed(1)}점 선택`}
                            >
                                ★
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    function renderSelfStep() {
        return (
            <section className="feedback-reflection-demo-self">
                <div className="feedback-reflection-demo-intro">
                    <span>Step 1</span>
                    <h2>자기평가 및 성찰</h2>
                </div>

                <article className="feedback-reflection-demo-score-panel">
                    <span className="feedback-reflection-demo-kicker">총괄 자기평가</span>
                    <strong>{selfScore.toFixed(1)} / 4.0</strong>
                    {renderSelfScoreStars()}
                </article>

                {renderReflectionFields(true)}

                <div className="feedback-reflection-demo-stage-actions">
                    <button type="button" className="btn-primary-sm" onClick={() => goToStep("ai")}>
                        다음
                    </button>
                </div>
            </section>
        );
    }

    function renderAiStep() {
        return (
            <section className="feedback-reflection-demo-ai">
                <div className="feedback-reflection-demo-intro">
                    <span>Step 2</span>
                    <h2>AI 중요 피드백 확인 및 논의</h2>
                    <p>전체 피드백으로 넘어가기 전에, 개선 효과가 큰 피드백만 먼저 확인하고 AI와 연습 방향을 논의합니다.</p>
                </div>

                <div className="feedback-reflection-demo-ai-grid">
                    <div className="feedback-reflection-demo-important-list">
                        {IMPORTANT_FEEDBACK.map((item) => {
                            const feedback = DUMMY_FEEDBACK[item.id];
                            return (
                                <article key={item.id} className="feedback-reflection-demo-important-card">
                                    <header>
                                        <span>{item.category}</span>
                                        <h3>{item.title}</h3>
                                    </header>
                                    <p>{item.reason}</p>
                                    <div className="feedback-reflection-demo-evidence">
                                        <strong>근거</strong>
                                        <ul>
                                            {feedback.evidence.map((evidence, index) => (
                                                <li key={index}>{evidence}</li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div className="feedback-reflection-demo-suggestion-box">
                                        <strong>개선 제안</strong>
                                        <p>{feedback.suggestion}</p>
                                    </div>
                                    <button type="button" onClick={() => handleDiscussFeedback(item)}>
                                        이 피드백으로 대화하기
                                    </button>
                                </article>
                            );
                        })}
                    </div>

                    <aside className="feedback-reflection-demo-mock-chat" aria-label="AI 중요 피드백 논의">
                        <header>
                            <div>
                                <span>Mock AI</span>
                                <h3>발표 개선 대화</h3>
                            </div>
                        </header>
                        <div className="feedback-reflection-demo-mock-chat-messages">
                            {mockChatMessages.map((message, index) => (
                                <div key={`${message.role}-${index}`} className={`chat-message ${message.role}`}>
                                    {message.role === "assistant" && <div className="message-avatar">AI</div>}
                                    <div className="message-content markdown-content">
                                        <p>{message.content}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="chat-suggestions">
                            <p className="chat-suggestions-label">빠른 질문</p>
                            <div className="chat-suggestion-buttons">
                                <button type="button" className="chat-suggestion-btn" onClick={() => setChatInput("가장 먼저 고칠 한 가지만 골라줘.")}>
                                    가장 먼저 고칠 한 가지
                                </button>
                                <button type="button" className="chat-suggestion-btn" onClick={() => setChatInput("다음 연습 계획을 3단계로 만들어줘.")}>
                                    3단계 연습 계획
                                </button>
                            </div>
                        </div>
                        <form className="chat-input-form" onSubmit={handleChatSubmit}>
                            <textarea
                                className="chat-input"
                                placeholder="중요 피드백에 대해 질문해보세요..."
                                value={chatInput}
                                onChange={(event) => setChatInput(event.target.value)}
                                rows={1}
                            />
                            <button type="submit" className="chat-send-btn" disabled={!chatInput.trim()} aria-label="메시지 보내기">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                                </svg>
                            </button>
                        </form>
                    </aside>
                </div>

                <div className="feedback-reflection-demo-stage-actions">
                    <button type="button" className="btn-outline" onClick={() => goToStep("self")}>
                        이전
                    </button>
                    <button type="button" className="btn-primary-sm" onClick={() => goToStep("qa")}>
                        다음
                    </button>
                </div>
            </section>
        );
    }

    function renderQaStep() {
        return (
            <section className="feedback-reflection-demo-qa">
                <div className="feedback-reflection-demo-intro">
                    <span>Step 3</span>
                    <h2>질의응답 피드백</h2>
                </div>

                <div className="feedback-reflection-demo-qa-grid">
                    {DUMMY_QA_FEEDBACK.map((item, index) => (
                        <article key={index} className="feedback-reflection-demo-qa-card">
                            <header>
                                <span>Q{index + 1}</span>
                                <strong>질의응답 결과</strong>
                            </header>

                            <div className="feedback-reflection-demo-qa-result">
                                <div className="feedback-reflection-demo-qa-block question">
                                    <b>질문</b>
                                    <p>{item.question}</p>
                                </div>

                                <div className="feedback-reflection-demo-qa-block answer">
                                    <b>답변</b>
                                    <p>{item.answer}</p>
                                </div>
                            </div>

                            <div className="feedback-reflection-demo-qa-feedback-panel">
                                <h3>피드백</h3>
                                <div className="feedback-reflection-demo-qa-feedback-row">
                                    <div className="feedback-reflection-demo-qa-feedback strength">
                                        <b>잘한 점</b>
                                        <p>{item.strength}</p>
                                    </div>
                                    <div className="feedback-reflection-demo-qa-feedback improve">
                                        <b>개선점</b>
                                        <p>{item.improve}</p>
                                    </div>
                                </div>
                            </div>
                        </article>
                    ))}
                </div>

                <div className="feedback-reflection-demo-stage-actions">
                    <button type="button" className="btn-outline" onClick={() => goToStep("ai")}>
                        이전
                    </button>
                    <button type="button" className="btn-primary-sm" onClick={() => goToStep("full")}>
                        다음
                    </button>
                </div>
            </section>
        );
    }

    function renderFullStep() {
        return (
            <section className="feedback-reflection-demo-full">
                <section className="video-summary-section">
                    <div className="video-container-v2">
                        <div className="video-placeholder-v2 feedback-demo-video">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                            <p>발표 영상</p>
                        </div>
                    </div>

                    <div className="summary-container-v2">
                        <h3>종합 피드백</h3>
                        <p className="summary-overall">{DUMMY_SUMMARY.overall}</p>
                        <div className="summary-detail-grid">
                            <section className="slide-sync-panel">
                                <div className="slide-sync-header">
                                    <div>
                                        <span>발표자료</span>
                                        <strong>2페이지</strong>
                                    </div>
                                    <time>01:21</time>
                                </div>
                                <div className="slide-sync-preview">
                                    <div className="feedback-reflection-demo-slide-card" aria-label="발표자료 2페이지 미리보기">
                                        <span>생성형 AI 활용</span>
                                        <strong>피드백 자동화의 가능성과 한계</strong>
                                        <ul>
                                            <li>초안 점검 속도 향상</li>
                                            <li>평가 기준 명확화 필요</li>
                                            <li>교사의 최종 판단 유지</li>
                                        </ul>
                                    </div>
                                </div>
                            </section>

                            <div className="summary-lists summary-lists-stack">
                                <button
                                    type="button"
                                    className="summary-card-trigger strengths"
                                    onClick={() => setSummaryModal({ title: "강점", tone: "strengths", items: DUMMY_SUMMARY.strengths })}
                                >
                                    <span>
                                        <strong>강점 확인</strong>
                                        <small>잘된 부분 모아보기</small>
                                    </span>
                                    <i aria-hidden="true">→</i>
                                </button>
                                <button
                                    type="button"
                                    className="summary-card-trigger suggestions"
                                    onClick={() => setSummaryModal({ title: "개선 제안", tone: "suggestions", items: DUMMY_SUMMARY.suggestions })}
                                >
                                    <span>
                                        <strong>개선점 확인</strong>
                                        <small>다음 연습 포인트 보기</small>
                                    </span>
                                    <i aria-hidden="true">→</i>
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="bottom-sections-wrapper">
                    <div className="bottom-tabs-header" role="tablist" aria-label="분석 자료 보기">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={bottomTab === "data"}
                            className={bottomTab === "data" ? "active" : ""}
                            onClick={() => setBottomTab("data")}
                        >
                            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 3v18h18" />
                                <path d="M7 15l4-4 3 3 5-7" />
                            </svg>
                            <span>발표 데이터</span>
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={bottomTab === "qa"}
                            className={bottomTab === "qa" ? "active" : ""}
                            onClick={() => setBottomTab("qa")}
                        >
                            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 14a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                                <path d="M8 8h8" />
                                <path d="M8 12h5" />
                            </svg>
                            <span>질의응답</span>
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={bottomTab === "feedback"}
                            className={bottomTab === "feedback" ? "active" : ""}
                            onClick={() => setBottomTab("feedback")}
                        >
                            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M9 11l3 3L22 4" />
                                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                            </svg>
                            <span>영역별 피드백 보기</span>
                        </button>
                    </div>

                    <div className="bottom-tabs-panel">
                        {bottomTab === "data" ? (
                            <section className="presentation-data-combined">
                                <article className="transcript-data-card">
                                    <header className="transcript-data-card-header">
                                        <h3>발표 전사문</h3>
                                    </header>
                                    <div className="transcript-prose-container">
                                        <p className="transcript-prose">
                                            {DUMMY_TRANSCRIPT.map((utterance, index) => (
                                                <button
                                                    key={`${utterance.time}-${index}`}
                                                    type="button"
                                                    className={`transcript-prose-segment ${selectedTranscriptIndex === index ? "selected" : ""}`}
                                                    onClick={() => setSelectedTranscriptIndex(index)}
                                                    data-tooltip={utterance.time}
                                                    title={utterance.time}
                                                    aria-label={`${utterance.time} 발화로 이동`}
                                                >
                                                    {utterance.text}
                                                </button>
                                            ))}
                                        </p>
                                    </div>
                                </article>
                                <div className="presentation-data-visuals-column">
                                    <PresentationDataVisuals
                                        utterances={demoTranscriptUtterances}
                                        expectedSeconds={DEMO_EXPECTED_SECONDS}
                                        actualSeconds={DEMO_ACTUAL_SECONDS}
                                        onRatePointClick={(point) => setSelectedTranscriptIndex(point.index)}
                                    />
                                </div>
                            </section>
                        ) : bottomTab === "qa" ? (
                            <section className="qa-review-section">
                                <header className="qa-review-header">
                                    <div>
                                        <span>시뮬레이션 질의응답</span>
                                        <h3>질문별 응답 전사와 피드백</h3>
                                    </div>
                                    <b>{DUMMY_QA_REVIEW_ITEMS.length}/3</b>
                                </header>

                                <div className="qa-card-grid">
                                    {DUMMY_QA_REVIEW_ITEMS.map((item) => (
                                        <article key={item.id} className="qa-review-card">
                                            <header className="qa-card-header">
                                                <span className="qa-index">Q{item.index}</span>
                                                <div className="qa-card-meta">
                                                    <small>{item.type}</small>
                                                    <small>청중 {item.target}</small>
                                                </div>
                                            </header>

                                            <div className="qa-question-block">
                                                <span>질문</span>
                                                <p>{item.question}</p>
                                            </div>

                                            <div className="qa-answer-block">
                                                <span>응답 전사</span>
                                                <p>{item.answerTranscript}</p>
                                            </div>

                                            <div className="qa-feedback-block">
                                                <span>AI 피드백</span>
                                                <p>{item.aiFeedback}</p>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            </section>
                        ) : (
                            <section className="detailed-feedback-section feedback-demo-section">
                                <div className="feedback-reflection-demo-rubric-browser">
                                    <div className="feedback-reflection-demo-area-tabs" role="tablist" aria-label="피드백 대영역">
                                        {DEMO_FEEDBACK_CATEGORIES.map((category) => {
                                            const stats = getDemoCategoryStats(category);
                                            const isActive = selectedRubricCategory?.id === category.id;
                                            const firstItem = category.items[0];

                                            return (
                                                <button
                                                    key={category.id}
                                                    type="button"
                                                    role="tab"
                                                    aria-selected={isActive}
                                                    className={`feedback-reflection-demo-area-tab ${stats.tone} ${isActive ? "active" : ""}`}
                                                    onClick={() => firstItem && setSelectedRubricItemId(firstItem.id)}
                                                    data-tooltip={category.desc}
                                                >
                                                    <span className="feedback-reflection-demo-area-tab-icon">{renderDemoCategoryIcon(category.icon)}</span>
                                                    <span>
                                                        <strong>{category.label}</strong>
                                                        <small>평균 {stats.average}/4</small>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className={`feedback-reflection-demo-subrubric-panel ${selectedRubricTone}`}>
                                        <header className="feedback-reflection-demo-subrubric-header">
                                            <div>
                                                <span>대영역</span>
                                                <h3>{selectedRubricCategory.label}</h3>
                                            </div>
                                            <p>{selectedRubricCategory.desc}</p>
                                            <strong>{selectedRubricCategoryStats.average}/4</strong>
                                        </header>

                                        <div className="feedback-reflection-demo-subrubric-label">세부 기준</div>
                                        <div className="feedback-reflection-demo-rubric-picker" aria-label={`${selectedRubricCategory.label} 하위 피드백 기준`}>
                                            {selectedRubricCategory.items.map((item, index) => {
                                                const feedback = DUMMY_FEEDBACK[item.id] || buildDemoFeedback(item, selectedRubricCategory, index);
                                                const tone = getRubricTone(feedback.score);
                                                const isSelected = selectedRubricItem?.id === item.id;

                                                return (
                                                    <button
                                                        key={item.id}
                                                        type="button"
                                                        className={`feedback-reflection-demo-rubric-button ${tone} ${isSelected ? "active" : ""}`}
                                                        onClick={() => setSelectedRubricItemId(item.id)}
                                                        aria-pressed={isSelected}
                                                    >
                                                        <span>{item.label}</span>
                                                        <strong>{feedback.score}/4</strong>
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {selectedRubricItem && selectedRubricFeedback && (
                                            <article className={`feedback-reflection-demo-rubric-detail connected ${selectedRubricTone}`}>
                                                <header>
                                                    <div>
                                                        <span>{selectedRubricItem.categoryLabel} &gt; {selectedRubricItem.label}</span>
                                                        <h3>{selectedRubricItem.label}</h3>
                                                        <p>{selectedRubricItem.desc}</p>
                                                    </div>
                                                    <div className={`feedback-reflection-demo-rubric-score ${selectedRubricTone}`}>
                                                        <strong>{selectedRubricFeedback.score}</strong>
                                                        <span>/4</span>
                                                    </div>
                                                </header>

                                                <div className="feedback-demo-suggestion feedback-reflection-demo-rubric-top-suggestion">
                                                    <strong>개선 제안</strong>
                                                    <p>{selectedRubricFeedback.suggestion}</p>
                                                </div>

                                                <div className="feedback-reflection-demo-rubric-grid">
                                                    <div className="feedback-reflection-demo-timestamp-strip">
                                                        {selectedRubricEvidence.map((text, index) => (
                                                            <div key={index} className="timestamp-card-mini">
                                                                <span className="time-badge-mini">{RUBRIC_EVIDENCE_TIMES[index % RUBRIC_EVIDENCE_TIMES.length]}</span>
                                                                <p className="timestamp-feedback-mini">{text}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </article>
                                        )}
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>
                </div>
            </section>
        );
    }

    return (
        <main className={`analysis-page-v2 feedback-demo-page feedback-reflection-demo-page feedback-reflection-demo-step-${activeStep} ${isChatOpen ? "chat-open" : ""}`}>
            {activeStep === "full" && (
                <header className="analysis-header-v2 feedback-reflection-demo-header">
                    <div className="header-content">
                        <h1>발표 분석 결과</h1>
                        <p>더미 발표 영상.mp4</p>
                    </div>

                    <div className="feedback-reflection-demo-full-step-label">
                        <span>Step 4</span>
                        <strong>전체 피드백</strong>
                    </div>

                    <div className="header-actions feedback-reflection-demo-header-actions">
                        <button type="button" className="btn-outline" onClick={() => goToStep("qa")}>
                            이전
                        </button>
                        <button type="button" className="analysis-tool-btn note" onClick={() => setReflectionOpen(true)}>
                            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <path d="M14 2v6h6" />
                                <path d="M16 13H8" />
                                <path d="M16 17H8" />
                                <path d="M10 9H8" />
                            </svg>
                            <span>성찰 노트</span>
                        </button>
                        <button
                            type="button"
                            className={`analysis-tool-btn ai ${isChatOpen ? "active" : ""}`}
                            onClick={() => setIsChatOpen((value) => !value)}
                        >
                            {isChatOpen ? (
                                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                            ) : (
                                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                            )}
                            <span>{isChatOpen ? "AI 닫기" : "AI 성찰"}</span>
                        </button>
                    </div>
                </header>
            )}

            <div className="analysis-main-v2 feedback-demo-main feedback-reflection-demo-main">
                <div
                    key={activeStep}
                    className={`feedback-reflection-demo-stage transition-${transitionDirection}`}
                >
                    {activeStep === "self" && renderSelfStep()}
                    {activeStep === "ai" && renderAiStep()}
                    {activeStep === "qa" && renderQaStep()}
                    {activeStep === "full" && renderFullStep()}
                </div>
            </div>

            {summaryModal && (
                <div className="summary-modal-backdrop" role="presentation" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setSummaryModal(null);
                }}>
                    <section className={`summary-modal summary-modal-${summaryModal.tone}`} role="dialog" aria-modal="true" aria-labelledby="summary-modal-title">
                        <header>
                            <div>
                                <span>종합 피드백</span>
                                <h2 id="summary-modal-title">{summaryModal.title}</h2>
                            </div>
                            <button type="button" onClick={() => setSummaryModal(null)} aria-label="닫기">×</button>
                        </header>
                        <ul>
                            {summaryModal.items.map((item, index) => <li key={index}>{item}</li>)}
                        </ul>
                    </section>
                </div>
            )}

            {reflectionOpen && (
                <div className="reflection-note-modal-backdrop" role="presentation" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setReflectionOpen(false);
                }}>
                    <section className="reflection-note-modal feedback-reflection-demo-note-modal" role="dialog" aria-modal="true" aria-labelledby="reflection-note-modal-title">
                        <header className="reflection-note-modal-header">
                            <div>
                                <span>자기평가 {selfScore.toFixed(1)} / 4.0</span>
                                <h2 id="reflection-note-modal-title">성찰 노트</h2>
                                <p>1단계에서 작성한 자기평가와 성찰 내용입니다.</p>
                            </div>
                            <button type="button" onClick={() => setReflectionOpen(false)} aria-label="닫기">×</button>
                        </header>

                        <div className="reflection-note-body reflection-note-modal-body">
                            <section className="reflection-note-score-panel" aria-label="성찰 노트 자기평가 점수">
                                <div>
                                    <span>오늘 발표 자기평가</span>
                                    <strong>{selfScore.toFixed(1)} / 4.0</strong>
                                </div>
                                {renderSelfScoreStars()}
                            </section>
                            <div className="reflection-step-tabs" role="tablist" aria-label="성찰 항목">
                                {REFLECTION_STEPS.map((step) => (
                                    <button
                                        key={step.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={activeReflectionStep === step.id}
                                        className={activeReflectionStep === step.id ? "active" : ""}
                                        onClick={() => setActiveReflectionStep(step.id)}
                                    >
                                        <span>{step.label}</span>
                                        {reflectionFields[step.id]?.trim() && <i aria-label="작성됨">✓</i>}
                                    </button>
                                ))}
                            </div>
                            <div className="reflection-step-copy">
                                <h3>{activeReflection.title}</h3>
                                <p>{activeReflection.desc}</p>
                            </div>
                            <div className="reflection-step-panel">
                                <textarea
                                    value={reflectionFields[activeReflection.id] || ""}
                                    onChange={(event) => setReflectionFields((prev) => ({
                                        ...prev,
                                        [activeReflection.id]: event.target.value,
                                    }))}
                                    placeholder={activeReflection.placeholder}
                                    rows={5}
                                />
                            </div>
                            <div className="reflection-note-actions">
                                <span>더미 화면입니다. 실제 분석 화면에서는 회차 기록에 저장됩니다.</span>
                                <button type="button" disabled>성찰 저장</button>
                            </div>
                        </div>
                    </section>
                </div>
            )}

            {activeStep === "full" && (
            <div className={`reflection-chat-panel ${isChatOpen ? "open" : ""}`}>
                <div className="chat-panel-header">
                    <div className="chat-panel-title">
                        <span className="chat-icon">AI</span>
                        <h3>AI 발표 성찰 대화</h3>
                        <button type="button" className="chat-panel-close" onClick={() => setIsChatOpen(false)} aria-label="AI 성찰 닫기">×</button>
                    </div>
                    <p className="chat-panel-desc">중요 피드백을 바탕으로 발표 개선점을 논의해보세요</p>
                </div>

                <div className="chat-messages">
                    {mockChatMessages.map((message, index) => (
                        <div key={`panel-${message.role}-${index}`} className={`chat-message ${message.role}`}>
                            {message.role === "assistant" && <div className="message-avatar">AI</div>}
                            <div className="message-content markdown-content">
                                <p>{message.content}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="chat-suggestions">
                    <p className="chat-suggestions-label">이런 질문을 해보세요</p>
                    <div className="chat-suggestion-buttons">
                        <button type="button" className="chat-suggestion-btn" onClick={() => setChatInput("이번 발표에서 가장 개선되어야 할 부분이 뭘까?")}>
                            가장 개선되어야 할 부분
                        </button>
                        <button type="button" className="chat-suggestion-btn" onClick={() => setChatInput("내 자기평가와 AI 피드백을 비교해서 알려줘.")}>
                            자기평가와 비교
                        </button>
                    </div>
                </div>

                <form className="chat-input-form" onSubmit={handleChatSubmit}>
                    <textarea
                        className="chat-input"
                        placeholder="발표에 대해 궁금한 점을 물어보세요..."
                        value={chatInput}
                        onChange={(event) => setChatInput(event.target.value)}
                        rows={1}
                    />
                    <button type="submit" className="chat-send-btn" disabled={!chatInput.trim()} aria-label="메시지 보내기">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                        </svg>
                    </button>
                </form>
            </div>
            )}
        </main>
    );
}
