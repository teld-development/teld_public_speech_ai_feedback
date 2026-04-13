"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { FEEDBACK_CATEGORIES, FEEDBACK_ITEMS_BY_ID, ALL_ITEM_IDS } from "../lib/feedbackAreas";

export default function AnalysisPage() {
    const router = useRouter();
    const videoRef = useRef(null);
    const chatEndRef = useRef(null);

    const [isLoading, setIsLoading] = useState(true);
    const [analysisData, setAnalysisData] = useState(null);
    const [videoUrl, setVideoUrl] = useState(null);
    const [videoName, setVideoName] = useState("");
    const [selectedTimestamp, setSelectedTimestamp] = useState(null);
    const [error, setError] = useState("");

    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState("");
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [selectedItemIds, setSelectedItemIds] = useState([]);

    useEffect(() => {
        const savedResult = sessionStorage.getItem("analysisResult");
        const savedVideoUrl = sessionStorage.getItem("videoUrl");
        const savedVideoName = sessionStorage.getItem("videoName");

        if (savedResult) {
            try {
                const result = JSON.parse(savedResult);
                setAnalysisData(result);
                setVideoUrl(savedVideoUrl);
                setVideoName(savedVideoName || "업로드된 영상");

                const savedPrepareData = sessionStorage.getItem("prepareData");
                if (savedPrepareData) {
                    const prepareData = JSON.parse(savedPrepareData);
                    setSelectedItemIds(prepareData.feedbackItems || []);
                }

                setTimeout(() => setIsLoading(false), 300);

                setChatMessages([{
                    role: "assistant",
                    content: "안녕하세요! 이번 발표에 대해 함께 성찰해볼까요? 🎤\n\n분석 결과를 바탕으로 궁금한 점이나 더 깊이 이야기하고 싶은 부분이 있으시면 말씀해주세요."
                }]);
            } catch (err) {
                setError("분석 결과를 불러오는 데 실패했습니다.");
                setIsLoading(false);
            }
        } else {
            setError("분석 결과가 없습니다. 영상을 먼저 업로드해주세요.");
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [chatMessages]);

    const handleTimestampClick = (timestamp) => {
        setSelectedTimestamp(timestamp);
        if (videoRef.current && timestamp.seconds !== undefined) {
            videoRef.current.currentTime = timestamp.seconds;
            videoRef.current.play();
        }
    };

    const parseTimeToSeconds = (timeStr) => {
        if (!timeStr) return 0;
        const parts = timeStr.split(":");
        if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        return 0;
    };

    const handleChatSubmit = async (e) => {
        e.preventDefault();
        if (!chatInput.trim() || isChatLoading) return;

        const userMessage = chatInput.trim();
        setChatInput("");
        const updatedMessages = [...chatMessages, { role: "user", content: userMessage }];
        setChatMessages(updatedMessages);
        setIsChatLoading(true);

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: userMessage,
                    chatHistory: chatMessages,
                    analysisContext: analysisData
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "응답 생성 실패");
            setChatMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
        } catch (err) {
            console.error("Chat error:", err);
            setChatMessages((prev) => [...prev, {
                role: "assistant",
                content: "죄송합니다. 응답을 생성하는 데 문제가 발생했습니다. 다시 시도해주세요."
            }]);
        } finally {
            setIsChatLoading(false);
        }
    };

    if (isLoading) {
        return (
            <main className="analysis-page-v2">
                <div className="loading-container">
                    <div className="loading-spinner"><div className="spinner"></div></div>
                    <h2 className="loading-title">분석 결과 불러오는 중...</h2>
                </div>
            </main>
        );
    }

    if (error) {
        return (
            <main className="analysis-page-v2">
                <div className="loading-container">
                    <h2 className="loading-title">오류</h2>
                    <p className="loading-desc">{error}</p>
                    <button className="btn-primary" onClick={() => router.push("/upload")} style={{ marginTop: "1rem" }}>
                        영상 업로드하기
                    </button>
                </div>
            </main>
        );
    }

    const { timestamps = [], summary = {}, materialAnalysis = null, conditionsAnalysis = null } = analysisData || {};

    const activeItemIds = selectedItemIds.length > 0 ? selectedItemIds : ALL_ITEM_IDS;

    // 항목별로 타임스탬프 매칭 (item 또는 category 문자열 비교)
    const matchTimestampsToItem = (itemLabel) => {
        return timestamps.filter((t) => {
            if (!t) return false;
            if (t.item && t.item.trim() === itemLabel) return true;
            return false;
        });
    };

    return (
        <main className={`analysis-page-v2 ${isChatOpen ? "chat-open" : ""}`}>
            <header className="analysis-header-v2">
                <div className="header-content">
                    <h1>발표 분석 결과</h1>
                    <p>{videoName}</p>
                </div>
                <div className="header-actions">
                    <button className="btn-outline" onClick={() => router.push("/dashboard")}>대시보드</button>
                    <button className="btn-primary-sm" onClick={() => router.push("/prepare")}>새 영상 분석</button>
                </div>
            </header>

            <div className="analysis-main-v2">
                <section className="video-summary-section">
                    <div className="video-container-v2">
                        {videoUrl ? (
                            <video ref={videoRef} className="video-player-v2" src={videoUrl} controls>
                                브라우저가 비디오 재생을 지원하지 않습니다.
                            </video>
                        ) : (
                            <div className="video-placeholder-v2">
                                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                                <p>영상을 불러올 수 없습니다</p>
                            </div>
                        )}
                    </div>

                    <div className="summary-container-v2">
                        <h3>종합 피드백</h3>
                        <p className="summary-overall">{summary.overall}</p>

                        <div className="summary-lists">
                            <div className="summary-block strengths">
                                <h4>💪 강점</h4>
                                <ul>
                                    {(summary.strengths || []).map((item, idx) => (<li key={idx}>{item}</li>))}
                                </ul>
                            </div>
                            <div className="summary-block suggestions">
                                <h4>💡 개선 제안</h4>
                                <ul>
                                    {(summary.suggestions || []).map((item, idx) => (<li key={idx}>{item}</li>))}
                                </ul>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="bottom-sections-wrapper">
                    <section className="detailed-feedback-section">
                        <div className="detailed-feedback-header">
                            <h3>📝 영역별 상세 피드백</h3>
                            <span className="timestamps-count">{timestamps.length}개 피드백</span>
                        </div>
                        <p className="timestamps-hint-v2">타임스탬프를 클릭하면 해당 위치로 영상이 이동합니다</p>

                        {FEEDBACK_CATEGORIES.map((cat) => {
                            const catItems = cat.items.filter((it) => activeItemIds.includes(it.id));
                            if (catItems.length === 0) return null;

                            return (
                                <div key={cat.id} className="feedback-category-block">
                                    <div className="feedback-category-title">
                                        <span className="category-icon">{cat.icon}</span>
                                        <div>
                                            <h4>{cat.label}</h4>
                                            <span className="category-short">{cat.shortLabel}</span>
                                        </div>
                                    </div>
                                    <div className="feedback-areas-grid">
                                        {catItems.map((item) => {
                                            const itemTimestamps = matchTimestampsToItem(item.label);
                                            return (
                                                <div key={item.id} className="feedback-area-container">
                                                    <div className="feedback-area-header">
                                                        <div className="feedback-area-title">
                                                            <h4>{item.label}</h4>
                                                            <span className="feedback-area-desc">{item.desc}</span>
                                                        </div>
                                                        <span className="feedback-area-count">{itemTimestamps.length}개</span>
                                                    </div>

                                                    <div className="feedback-area-content">
                                                        {itemTimestamps.length > 0 ? (
                                                            itemTimestamps.map((t, index) => {
                                                                const seconds = t.seconds ?? parseTimeToSeconds(t.time);
                                                                const isSelected = selectedTimestamp === t;
                                                                return (
                                                                    <div
                                                                        key={index}
                                                                        className={`timestamp-card-mini ${isSelected ? "selected" : ""}`}
                                                                        onClick={() => handleTimestampClick({ ...t, seconds })}
                                                                    >
                                                                        <span className="time-badge-mini">{t.time}</span>
                                                                        <p className="timestamp-feedback-mini">{t.feedback}</p>
                                                                    </div>
                                                                );
                                                            })
                                                        ) : (
                                                            <div className="no-feedback-message">
                                                                <span>이 항목에 대한 피드백이 없습니다</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </section>

                    {materialAnalysis && (
                        <section className="lesson-plan-section">
                            <div className="lesson-plan-header">
                                <span className="lesson-plan-icon">📄</span>
                                <h3>발표 자료-발표 정합성 분석</h3>
                                <span className={`consistency-badge ${materialAnalysis.overallConsistency === '높음' ? 'high' : materialAnalysis.overallConsistency === '보통' ? 'medium' : 'low'}`}>
                                    {materialAnalysis.overallConsistency}
                                </span>
                            </div>
                            <p className="lesson-plan-summary">{materialAnalysis.summary}</p>

                            <div className="lesson-plan-details">
                                <div className="lp-block matches">
                                    <h4>✅ 자료와 일치한 부분</h4>
                                    <ul>
                                        {(materialAnalysis.matches || []).map((item, idx) => (<li key={idx}>{item}</li>))}
                                    </ul>
                                </div>

                                {materialAnalysis.deviations && materialAnalysis.deviations.length > 0 && (
                                    <div className="lp-block deviations">
                                        <h4>⚠️ 자료와 다르게 진행된 부분</h4>
                                        <ul>
                                            {materialAnalysis.deviations.map((item, idx) => (<li key={idx}>{item}</li>))}
                                        </ul>
                                    </div>
                                )}

                                <div className="lp-block suggestions">
                                    <h4>💡 자료 활용 개선 제안</h4>
                                    <ul>
                                        {(materialAnalysis.suggestions || []).map((item, idx) => (<li key={idx}>{item}</li>))}
                                    </ul>
                                </div>
                            </div>
                        </section>
                    )}

                    {conditionsAnalysis && conditionsAnalysis.length > 0 && (
                        <section className="conditions-analysis-section">
                            <div className="conditions-analysis-header">
                                <span className="conditions-analysis-icon">🎯</span>
                                <h3>조건 충족 분석</h3>
                                <span className="conditions-count-badge">
                                    {conditionsAnalysis.filter((c) => c.fulfilled).length}/{conditionsAnalysis.length} 충족
                                </span>
                            </div>
                            <p className="conditions-analysis-desc">입력하신 조건들의 충족 여부를 분석한 결과입니다.</p>

                            <div className="conditions-analysis-list">
                                {conditionsAnalysis.map((item, idx) => (
                                    <div key={idx} className={`condition-result-card ${item.fulfilled ? 'fulfilled' : 'unfulfilled'}`}>
                                        <div className="condition-result-header">
                                            <span className={`condition-status-icon ${item.fulfilled ? 'fulfilled' : 'unfulfilled'}`}>
                                                {item.fulfilled ? '✓' : '✗'}
                                            </span>
                                            <span className="condition-text">{item.condition}</span>
                                            {item.timestamp && (<span className="condition-timestamp">{item.timestamp}</span>)}
                                        </div>
                                        <p className="condition-evidence">{item.evidence}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
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
                    {chatMessages.map((msg, idx) => (
                        <div key={idx} className={`chat-message ${msg.role}`}>
                            {msg.role === "assistant" && (<div className="message-avatar">🤖</div>)}
                            <div className="message-content markdown-content">
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                        </div>
                    ))}
                    {isChatLoading && (
                        <div className="chat-message assistant">
                            <div className="message-avatar">🤖</div>
                            <div className="message-content loading">
                                <div className="typing-indicator"><span></span><span></span><span></span></div>
                            </div>
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>

                {chatMessages.length <= 1 && (
                    <div className="chat-suggestions">
                        <p className="chat-suggestions-label">💡 이런 질문을 해보세요</p>
                        <div className="chat-suggestion-buttons">
                            <button type="button" className="chat-suggestion-btn" onClick={() => setChatInput("이번 발표에서 가장 개선되어야 할 부분이 뭘까?")}>
                                이번 발표에서 가장 개선되어야 할 부분이 뭘까?
                            </button>
                            <button type="button" className="chat-suggestion-btn" onClick={() => setChatInput("시선 처리와 제스처를 더 잘하려면 어떻게 해야 할까?")}>
                                시선 처리와 제스처를 더 잘하려면 어떻게 해야 할까?
                            </button>
                            <button type="button" className="chat-suggestion-btn" onClick={() => setChatInput("다음 발표에서 바로 적용할 수 있는 팁을 알려줘")}>
                                다음 발표에서 바로 적용할 수 있는 팁을 알려줘
                            </button>
                        </div>
                    </div>
                )}

                <form className="chat-input-form" onSubmit={handleChatSubmit}>
                    <textarea
                        className="chat-input"
                        placeholder="발표에 대해 궁금한 점을 물어보세요..."
                        value={chatInput}
                        onChange={(e) => {
                            setChatInput(e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if (chatInput.trim() && !isChatLoading) handleChatSubmit(e);
                            }
                        }}
                        disabled={isChatLoading}
                        rows={1}
                    />
                    <button type="submit" className="chat-send-btn" disabled={!chatInput.trim() || isChatLoading}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                        </svg>
                    </button>
                </form>
            </div>
        </main>
    );
}
