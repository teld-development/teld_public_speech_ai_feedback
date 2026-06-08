"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FEEDBACK_CATEGORIES } from "../../lib/feedbackAreas";

const DUMMY_FEEDBACK = {
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
const DEMO_REFLECTION_STEPS = [
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

function formatDuration(seconds) {
    const rounded = Math.max(0, Math.round(seconds));
    const mins = Math.floor(rounded / 60);
    const secs = rounded % 60;
    return mins > 0 ? `${mins}분 ${secs}초` : `${secs}초`;
}

function buildDemoFeedback(item, category, index = 0) {
    const baseScore = 3 + (index % 3 === 0 ? 1 : 0);
    return {
        score: baseScore,
        summary: `${item.label}은 ${category.label} 영역에서 대체로 안정적으로 수행되었습니다. ${item.desc}`,
        evidence: [
            `${item.label}과 관련된 장면에서 발표 목적과 청중을 고려한 선택이 관찰되었습니다.`,
            `일부 구간에서는 ${item.label}을 더 분명하게 드러내면 발표의 설득력과 전달력이 높아질 수 있습니다.`,
        ],
        suggestion: `${item.label}을 다음 연습의 우선 점검 항목으로 두고, 발표 전 체크리스트에 한 문장 기준을 추가해보세요.`,
    };
}

function getInitialSelections() {
    return FEEDBACK_CATEGORIES.reduce((acc, category) => {
        acc[category.id] = category.items[0]?.id || "";
        return acc;
    }, {});
}

export default function FeedbackDemoPage() {
    const router = useRouter();
    const [selectedByCategory, setSelectedByCategory] = useState(getInitialSelections);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatInput, setChatInput] = useState("");
    const [demoReflectionOpen, setDemoReflectionOpen] = useState(false);
    const [activeDemoReflectionStep, setActiveDemoReflectionStep] = useState("keep");
    const [demoReflectionFields, setDemoReflectionFields] = useState({
        keep: "도입에서 발표 목적을 먼저 말한 점은 유지하고 싶다.",
        improve: "결론에서 핵심 문장을 더 짧고 분명하게 말해야겠다.",
        next: "마지막 30초 결론부만 따로 3번 녹화해보기.",
    });
    const [summaryModal, setSummaryModal] = useState(null);
    const [bottomTab, setBottomTab] = useState("transcript");
    const [selectedDemoTranscriptIndex, setSelectedDemoTranscriptIndex] = useState(null);

    const totalFeedbackCount = useMemo(
        () => FEEDBACK_CATEGORIES.reduce((sum, category) => sum + category.items.length, 0),
        []
    );
    const activeDemoReflection = DEMO_REFLECTION_STEPS.find((step) => step.id === activeDemoReflectionStep) || DEMO_REFLECTION_STEPS[0];

    return (
        <main className={`analysis-page-v2 feedback-demo-page ${isChatOpen ? "chat-open" : ""}`}>
            <header className="analysis-header-v2">
                <div className="header-content">
                    <h1>발표 분석 결과</h1>
                    <p>더미 발표 영상.mp4</p>
                </div>
                <div className="header-reflection-actions" aria-label="성찰 도구">
                    <button
                        type="button"
                        className="analysis-tool-btn note"
                        onClick={() => setDemoReflectionOpen(true)}
                    >
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
                <div className="header-actions">
                    <button type="button" className="btn-outline" onClick={() => router.push("/analysis/test")}>
                        더미 선택
                    </button>
                    <button type="button" className="btn-primary-sm" onClick={() => router.push("/analysis")}>
                        분석 화면
                    </button>
                </div>
            </header>

            <div className="analysis-main-v2 feedback-demo-main">
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
                        <div className="duration-check-card duration-check-warn">
                            <div className="duration-check-main">
                                <span className="duration-check-kicker">발표 시간</span>
                                <strong>{formatDuration(DEMO_ACTUAL_SECONDS - DEMO_EXPECTED_SECONDS)} 초과</strong>
                                <span className="duration-check-status">조금 초과</span>
                            </div>
                            <div className="duration-check-meta">
                                <span>예상 {formatDuration(DEMO_EXPECTED_SECONDS)}</span>
                                <span>실제 {formatDuration(DEMO_ACTUAL_SECONDS)}</span>
                            </div>
                        </div>
                        <h3>종합 피드백</h3>
                        <p className="summary-overall">{DUMMY_SUMMARY.overall}</p>

                        <div className="summary-lists">
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
                </section>

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

                <div className="bottom-sections-wrapper">
                    <div className="bottom-tabs-header" role="tablist" aria-label="분석 자료 보기">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={bottomTab === "transcript"}
                            className={bottomTab === "transcript" ? "active" : ""}
                            onClick={() => setBottomTab("transcript")}
                        >
                            <span>전사 자료 보기</span>
                            <small>{DUMMY_TRANSCRIPT.length}개 발화</small>
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={bottomTab === "feedback"}
                            className={bottomTab === "feedback" ? "active" : ""}
                            onClick={() => setBottomTab("feedback")}
                        >
                            <span>피드백 보기</span>
                            <small>{totalFeedbackCount}개 하위 영역</small>
                        </button>
                    </div>

                    <div className="bottom-tabs-panel">
                        {bottomTab === "transcript" ? (
                    <section className="transcript-section-v2">
                        <div className="timestamps-header">
                            <h3>발화 기록</h3>
                            <span className="timestamps-count">{DUMMY_TRANSCRIPT.length}개 발화</span>
                        </div>
                        <div className="transcript-prose-container">
                            <p className="transcript-prose">
                            {DUMMY_TRANSCRIPT.map((utterance, index) => (
                                <button
                                    key={`${utterance.time}-${index}`}
                                    type="button"
                                    className={`transcript-prose-segment ${selectedDemoTranscriptIndex === index ? "selected" : ""}`}
                                    onClick={() => setSelectedDemoTranscriptIndex(index)}
                                    title={utterance.time}
                                    aria-label={`${utterance.time} 발화로 이동`}
                                >
                                    {utterance.text}
                                </button>
                            ))}
                            </p>
                        </div>
                    </section>
                        ) : (
                    <section className="detailed-feedback-section feedback-demo-section">
                        <div className="detailed-feedback-header">
                            <h3>영역별 상세 피드백</h3>
                            <span className="timestamps-count">{totalFeedbackCount}개 하위 영역</span>
                        </div>
                        <p className="timestamps-hint-v2">카드 헤더의 하위 영역을 선택하면 해당 피드백 내용이 표시됩니다</p>

                        <div className="feedback-demo-category-row">
                            {FEEDBACK_CATEGORIES.map((category) => {
                                const selectedItemId = selectedByCategory[category.id];
                                const selectedItem = category.items.find((item) => item.id === selectedItemId) || category.items[0];
                                const feedback = DUMMY_FEEDBACK[selectedItem.id] || buildDemoFeedback(selectedItem, category, category.items.findIndex((item) => item.id === selectedItem.id));

                                return (
                                    <article key={category.id} className="feedback-demo-card">
                                        <div className="feedback-demo-card-header">
                                            <div className="feedback-category-title feedback-demo-title">
                                                <span className="category-icon">{category.icon}</span>
                                                <div>
                                                    <h4>{category.label}</h4>
                                                    <span className="category-short">{category.shortLabel}</span>
                                                </div>
                                            </div>
                                            <div className="feedback-demo-tabs" aria-label={`${category.label} 하위 영역`}>
                                                {category.items.map((item) => (
                                                    <button
                                                        key={item.id}
                                                        type="button"
                                                        className={`feedback-demo-tab ${selectedItem.id === item.id ? "active" : ""}`}
                                                        onClick={() => setSelectedByCategory((prev) => ({
                                                            ...prev,
                                                            [category.id]: item.id,
                                                        }))}
                                                    >
                                                        {item.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="feedback-demo-card-body">
                                            <div className="feedback-area-header feedback-demo-active-header">
                                                <div className="feedback-area-title">
                                                    <h4>{selectedItem.label}</h4>
                                                    <span className="feedback-area-desc">{selectedItem.desc}</span>
                                                </div>
                                                <div className="score-badge" data-score={feedback.score} title={`${feedback.score}/5점`}>
                                                    {[1, 2, 3, 4, 5].map((score) => (
                                                        <span key={score} className={`score-dot ${score <= feedback.score ? "filled" : ""}`} />
                                                    ))}
                                                    <span className="score-value">{feedback.score}<span className="score-max">/5</span></span>
                                                </div>
                                            </div>

                                            <div className="timestamp-card-mini feedback-demo-summary">
                                                <span className="time-badge-mini">요약</span>
                                                <p className="timestamp-feedback-mini">{feedback.summary}</p>
                                            </div>

                                            <div className="feedback-demo-evidence-list">
                                                {feedback.evidence.map((text, index) => (
                                                    <div key={index} className="timestamp-card-mini">
                                                        <span className="time-badge-mini">{index === 0 ? "00:18" : "01:12"}</span>
                                                        <p className="timestamp-feedback-mini">{text}</p>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="feedback-demo-suggestion">
                                                <strong>개선 제안</strong>
                                                <p>{feedback.suggestion}</p>
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    </section>
                        )}
                    </div>
                </div>
            </div>

            {demoReflectionOpen && (
                <div className="reflection-note-modal-backdrop" role="presentation" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setDemoReflectionOpen(false);
                }}>
                    <section className="reflection-note-modal" role="dialog" aria-modal="true" aria-labelledby="reflection-note-modal-title">
                        <header className="reflection-note-modal-header">
                            <div>
                                <h2 id="reflection-note-modal-title">성찰 노트</h2>
                            </div>
                            <button type="button" onClick={() => setDemoReflectionOpen(false)} aria-label="닫기">×</button>
                        </header>

                        <div className="reflection-note-body reflection-note-modal-body">
                            <div className="reflection-step-tabs" role="tablist" aria-label="성찰 항목">
                                {DEMO_REFLECTION_STEPS.map((step) => (
                                    <button
                                        key={step.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={activeDemoReflectionStep === step.id}
                                        className={activeDemoReflectionStep === step.id ? "active" : ""}
                                        onClick={() => setActiveDemoReflectionStep(step.id)}
                                    >
                                        <span>{step.label}</span>
                                        {demoReflectionFields[step.id]?.trim() && <i aria-label="작성됨">✓</i>}
                                    </button>
                                ))}
                            </div>
                            <div className="reflection-step-panel">
                                <textarea
                                    value={demoReflectionFields[activeDemoReflection.id] || ""}
                                    onChange={(event) => setDemoReflectionFields((prev) => ({
                                        ...prev,
                                        [activeDemoReflection.id]: event.target.value,
                                    }))}
                                    placeholder={activeDemoReflection.placeholder}
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

            <div className={`reflection-chat-panel ${isChatOpen ? "open" : ""}`}>
                <div className="chat-panel-header">
                    <div className="chat-panel-title">
                        <span className="chat-icon">🤔</span>
                        <h3>AI 발표 성찰 대화</h3>
                        <button type="button" className="chat-panel-close" onClick={() => setIsChatOpen(false)} aria-label="AI 성찰 닫기">×</button>
                    </div>
                    <p className="chat-panel-desc">AI와 함께 발표를 되돌아보며 성찰해보세요</p>
                </div>

                <div className="chat-messages">
                    <div className="chat-message assistant">
                        <div className="message-avatar">🤖</div>
                        <div className="message-content markdown-content">
                            <p>안녕하세요! 이번 발표에 대해 함께 성찰해볼까요?</p>
                            <p>분석 결과를 바탕으로 궁금한 점이나 더 깊이 이야기하고 싶은 부분이 있으시면 말씀해주세요.</p>
                        </div>
                    </div>
                    <div className="chat-message user">
                        <div className="message-content">
                            <p>내용 흐름과 표현 전달을 우선 개선하고 싶어요.</p>
                        </div>
                    </div>
                    <div className="chat-message assistant">
                        <div className="message-avatar">🤖</div>
                        <div className="message-content markdown-content">
                            <p>좋아요. 다음 연습에서는 도입-본론-결론의 연결 문장을 먼저 표시하고, 핵심 문장은 속도를 조금 늦춰 말해보세요.</p>
                        </div>
                    </div>
                </div>

                <div className="chat-suggestions">
                    <p className="chat-suggestions-label">이런 질문을 해보세요</p>
                    <div className="chat-suggestion-buttons">
                        <button type="button" className="chat-suggestion-btn" onClick={() => setChatInput("이번 발표에서 가장 개선되어야 할 부분이 뭘까?")}>
                            이번 발표에서 가장 개선되어야 할 부분이 뭘까?
                        </button>
                        <button type="button" className="chat-suggestion-btn" onClick={() => setChatInput("내용 조직과 표현 전달을 더 잘하려면 어떻게 해야 할까?")}>
                            내용 조직과 표현 전달을 더 잘하려면 어떻게 해야 할까?
                        </button>
                    </div>
                </div>

                <form className="chat-input-form" onSubmit={(event) => event.preventDefault()}>
                    <textarea
                        className="chat-input"
                        placeholder="발표에 대해 궁금한 점을 물어보세요..."
                        value={chatInput}
                        onChange={(event) => setChatInput(event.target.value)}
                        rows={1}
                    />
                    <button type="submit" className="chat-send-btn" disabled={!chatInput.trim()}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                        </svg>
                    </button>
                </form>
            </div>
        </main>
    );
}
