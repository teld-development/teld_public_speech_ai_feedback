"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FEEDBACK_CATEGORIES } from "../../lib/feedbackAreas";

const DUMMY_FEEDBACK = {
    eye_contact: {
        score: 4,
        summary: "발표 초반과 결론부에서 카메라를 안정적으로 응시해 청중과 연결되는 느낌이 잘 살아났습니다.",
        evidence: [
            "핵심 주제를 소개하는 00:18 구간에서 시선이 정면에 머물러 메시지 집중도가 높았습니다.",
            "자료를 확인한 뒤 카메라로 돌아오는 속도가 빠른 편이라 발표 흐름이 끊기지 않았습니다.",
        ],
        suggestion: "설명 자료를 볼 때도 한 문장을 마친 뒤 정면을 다시 바라보는 리듬을 유지해보세요.",
    },
    facial_expression: {
        score: 3,
        summary: "전체적으로 차분한 표정이 유지되었지만, 강조 구간에서 표정 변화가 조금 더 보이면 전달력이 좋아집니다.",
        evidence: [
            "긍정적인 사례를 설명할 때 미소가 짧게 나타나 메시지의 분위기와 잘 맞았습니다.",
            "문제점이나 전환점을 말할 때 표정 변화가 작아 내용의 중요도가 덜 드러났습니다.",
        ],
        suggestion: "핵심어 직전에 눈썹, 미소, 고개 끄덕임 중 하나를 의식적으로 더해보세요.",
    },
    gesture: {
        score: 4,
        summary: "손동작이 발표 내용의 구조를 구분해주는 역할을 했고, 카메라 프레임 안에서도 안정적으로 유지되었습니다.",
        evidence: [
            "첫째, 둘째, 셋째를 나눌 때 손가락으로 순서를 표시해 청중이 흐름을 따라가기 쉬웠습니다.",
            "중요 개념을 설명하는 구간에서 양손을 활용해 범위와 대비를 명확하게 보여주었습니다.",
        ],
        suggestion: "손동작을 멈추는 순간도 함께 설계하면 강조와 휴식의 대비가 더 선명해집니다.",
    },
    verbal_nonverbal_sync: {
        score: 4,
        summary: "주요 키워드와 손동작이 대체로 같은 타이밍에 맞아 메시지가 자연스럽게 강화되었습니다.",
        evidence: [
            "비교를 설명할 때 좌우 손동작이 말의 구조와 함께 움직여 이해를 도왔습니다.",
            "일부 문장 끝에서는 제스처가 늦게 마무리되어 다음 문장과 겹치는 느낌이 있었습니다.",
        ],
        suggestion: "제스처를 문장 끝보다 반 박자 먼저 정리하면 발화 전환이 더 깔끔해집니다.",
    },
    audience_awareness: {
        score: 3,
        summary: "청중을 의식하는 정면 응시는 좋았지만, 반응을 받아들이는 듯한 미세한 표현은 더 보강할 수 있습니다.",
        evidence: [
            "질문을 던지는 문장에서 잠깐 멈추는 호흡이 있어 청중 참여를 유도했습니다.",
            "중간 설명부에서는 고개 끄덕임이나 반응 확인 동작이 적어 일방향 전달처럼 보였습니다.",
        ],
        suggestion: "질문형 문장 뒤에 1초 정도 멈추고 고개를 살짝 끄덕이는 신호를 넣어보세요.",
    },
    no_distraction: {
        score: 5,
        summary: "불필요한 몸 흔들림이나 얼굴을 만지는 습관이 거의 없어 발표 화면이 안정적으로 유지되었습니다.",
        evidence: [
            "대기 자세에서 손이 일정하게 유지되어 산만한 인상이 적었습니다.",
            "슬라이드 전환 중에도 시선과 손동작이 목적 있게 움직였습니다.",
        ],
        suggestion: "현재 안정감이 강점이므로, 긴장되는 구간에서도 같은 자세 루틴을 반복해보세요.",
    },
    facing: {
        score: 4,
        summary: "몸의 방향이 대부분 카메라 정면을 향해 있어 청중과 대면하고 있다는 인상이 잘 형성되었습니다.",
        evidence: [
            "도입과 결론에서 어깨 방향이 정면으로 유지되어 발표자의 존재감이 또렷했습니다.",
            "자료 확인 시 상체가 약간 틀어지는 순간이 있었지만 곧바로 복귀했습니다.",
        ],
        suggestion: "슬라이드 확인용 시선을 짧게 처리하고, 어깨는 정면에 고정하는 연습이 도움이 됩니다.",
    },
    prosody: {
        score: 3,
        summary: "발음과 속도는 안정적이지만, 핵심 문장에서 음성의 높낮이 변화가 더 필요합니다.",
        evidence: [
            "설명 구간의 속도는 일정해 청중이 내용을 따라가기 쉬웠습니다.",
            "중요한 결론을 말할 때도 톤 변화가 작아 강조점이 약하게 전달되었습니다.",
        ],
        suggestion: "핵심 문장은 속도를 10퍼센트 늦추고 마지막 단어에 힘을 싣는 방식으로 연습해보세요.",
    },
    language_choice: {
        score: 4,
        summary: "전문 용어와 쉬운 설명을 균형 있게 사용해 청중의 이해를 돕는 표현 선택이 돋보였습니다.",
        evidence: [
            "추상적인 개념 뒤에 바로 예시를 제시해 설명의 접근성이 높았습니다.",
            "일부 문장은 길게 이어져 핵심 메시지가 뒤로 밀리는 느낌이 있었습니다.",
        ],
        suggestion: "긴 문장은 결론을 먼저 말하고 근거를 덧붙이는 순서로 다듬어보세요.",
    },
    audience_adaptation: {
        score: 3,
        summary: "청중 수준을 고려한 예시는 좋았지만, 반응에 맞춰 설명 밀도를 조절하는 장면은 제한적이었습니다.",
        evidence: [
            "어려운 개념을 생활 속 사례로 바꾸어 말한 점은 효과적이었습니다.",
            "후반부에는 정보량이 늘어 청중이 소화할 시간을 주는 장치가 부족했습니다.",
        ],
        suggestion: "정보가 많은 구간 뒤에는 한 문장 요약을 넣어 청중의 이해를 확인해보세요.",
    },
    media_interaction: {
        score: 4,
        summary: "슬라이드 전환과 화면 공유 흐름이 자연스러워 발표의 전문성이 잘 유지되었습니다.",
        evidence: [
            "화면 전환 직후 바로 다음 설명으로 연결되어 공백이 거의 없었습니다.",
            "포인터나 화면 강조 도구를 더 적극적으로 쓰면 시각적 안내가 강화될 수 있습니다.",
        ],
        suggestion: "복잡한 표나 이미지에서는 말로 설명하기 전에 먼저 볼 위치를 짚어주세요.",
    },
    professional_appearance: {
        score: 4,
        summary: "복장과 배경이 발표 맥락에 잘 맞고, 화면 안에서 발표자의 인상이 단정하게 유지되었습니다.",
        evidence: [
            "배경의 시각적 요소가 적어 발표자와 자료에 집중하기 쉬웠습니다.",
            "조명이 얼굴을 충분히 비춰 표정과 시선 방향이 잘 보였습니다.",
        ],
        suggestion: "카메라 높이를 눈높이에 조금 더 맞추면 대면감이 한층 좋아집니다.",
    },
};

const DUMMY_SUMMARY = {
    overall: "이번 발표는 안정적인 자세와 명확한 구조가 돋보였습니다. 시선 처리와 제스처는 메시지를 보조하는 방향으로 잘 사용되었고, 자료 전환도 발표 흐름을 크게 방해하지 않았습니다. 다만 핵심 문장에서는 음성의 강약과 표정 변화를 조금 더 분명하게 주면 청중의 집중도가 더 높아질 수 있습니다.",
    strengths: [
        "카메라 정면을 자주 바라보며 청중과 연결되는 인상을 만들었습니다.",
        "손동작이 발표 구조를 구분해주어 설명의 흐름을 따라가기 쉬웠습니다.",
        "슬라이드 전환과 화면 공유가 자연스러워 발표의 전문성이 유지되었습니다.",
    ],
    suggestions: [
        "핵심 문장에서는 말의 속도를 조금 늦추고 마지막 단어에 힘을 실어보세요.",
        "중요한 전환점에서 표정 변화나 고개 끄덕임을 더하면 메시지가 선명해집니다.",
        "정보량이 많은 구간 뒤에는 한 문장 요약을 넣어 청중의 이해를 확인해보세요.",
    ],
};

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

    const totalFeedbackCount = useMemo(
        () => FEEDBACK_CATEGORIES.reduce((sum, category) => sum + category.items.length, 0),
        []
    );

    return (
        <main className={`analysis-page-v2 feedback-demo-page ${isChatOpen ? "chat-open" : ""}`}>
            <header className="analysis-header-v2">
                <div className="header-content">
                    <h1>발표 분석 결과</h1>
                    <p>더미 발표 영상.mp4</p>
                </div>
                <div className="header-actions">
                    <button type="button" className="btn-outline" onClick={() => router.push("/analysis/test")}>
                        대시보드
                    </button>
                    <button type="button" className="btn-primary-sm" onClick={() => router.push("/analysis")}>
                        새 영상 분석
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
                        <h3>종합 피드백</h3>
                        <p className="summary-overall">{DUMMY_SUMMARY.overall}</p>

                        <div className="summary-lists">
                            <div className="summary-block strengths">
                                <h4>강점</h4>
                                <ul>
                                    {DUMMY_SUMMARY.strengths.map((item, index) => (
                                        <li key={index}>{item}</li>
                                    ))}
                                </ul>
                            </div>
                            <div className="summary-block suggestions">
                                <h4>개선 제안</h4>
                                <ul>
                                    {DUMMY_SUMMARY.suggestions.map((item, index) => (
                                        <li key={index}>{item}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="bottom-sections-wrapper">
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
                                const feedback = DUMMY_FEEDBACK[selectedItem.id] || DUMMY_FEEDBACK.eye_contact;

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
                </div>
            </div>

            <button
                className={`chat-toggle-btn ${isChatOpen ? "open" : ""}`}
                onClick={() => setIsChatOpen(!isChatOpen)}
                title="AI 성찰 대화"
            >
                {isChatOpen ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                ) : (
                    <>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <span className="chat-toggle-label">AI 성찰</span>
                    </>
                )}
            </button>

            <div className={`reflection-chat-panel ${isChatOpen ? "open" : ""}`}>
                <div className="chat-panel-header">
                    <div className="chat-panel-title">
                        <span className="chat-icon">🤔</span>
                        <h3>AI 발표 성찰 대화</h3>
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
                            <p>시선 처리와 음성 전달을 우선 개선하고 싶어요.</p>
                        </div>
                    </div>
                    <div className="chat-message assistant">
                        <div className="message-avatar">🤖</div>
                        <div className="message-content markdown-content">
                            <p>좋아요. 다음 연습에서는 핵심 문장마다 정면 응시를 2초 유지하고, 결론 문장은 속도를 조금 늦춰 말해보세요.</p>
                        </div>
                    </div>
                </div>

                <div className="chat-suggestions">
                    <p className="chat-suggestions-label">이런 질문을 해보세요</p>
                    <div className="chat-suggestion-buttons">
                        <button type="button" className="chat-suggestion-btn" onClick={() => setChatInput("이번 발표에서 가장 개선되어야 할 부분이 뭘까?")}>
                            이번 발표에서 가장 개선되어야 할 부분이 뭘까?
                        </button>
                        <button type="button" className="chat-suggestion-btn" onClick={() => setChatInput("시선 처리와 제스처를 더 잘하려면 어떻게 해야 할까?")}>
                            시선 처리와 제스처를 더 잘하려면 어떻게 해야 할까?
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
