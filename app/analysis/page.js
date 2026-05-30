"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { FEEDBACK_CATEGORIES, ALL_ITEM_IDS } from "../lib/feedbackAreas";

function buildInitialSelections(activeItemIds = ALL_ITEM_IDS) {
    return FEEDBACK_CATEGORIES.reduce((acc, category) => {
        const firstActiveItem = category.items.find((item) => activeItemIds.includes(item.id));
        acc[category.id] = firstActiveItem?.id || category.items[0]?.id || "";
        return acc;
    }, {});
}

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
    const [selectedByCategory, setSelectedByCategory] = useState(() => buildInitialSelections());

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

    useEffect(() => {
        const activeIds = selectedItemIds.length > 0 ? selectedItemIds : ALL_ITEM_IDS;
        setSelectedByCategory((prev) => {
            const next = {};
            FEEDBACK_CATEGORIES.forEach((category) => {
                const activeItems = category.items.filter((item) => activeIds.includes(item.id));
                const currentStillActive = activeItems.some((item) => item.id === prev[category.id]);
                next[category.id] = currentStillActive
                    ? prev[category.id]
                    : activeItems[0]?.id || category.items[0]?.id || "";
            });
            return next;
        });
    }, [selectedItemIds]);

    const { timestamps = [], scores = {}, summary = {}, transcript = null } = analysisData || {};
    const transcriptUtterances = Array.isArray(transcript?.utterances) ? transcript.utterances : [];

    const activeItemIds = selectedItemIds.length > 0 ? selectedItemIds : ALL_ITEM_IDS;

    const activeCategories = useMemo(() => {
        return FEEDBACK_CATEGORIES
            .map((category) => ({
                ...category,
                items: category.items.filter((item) => activeItemIds.includes(item.id)),
            }))
            .filter((category) => category.items.length > 0);
    }, [activeItemIds]);

    const totalFeedbackAreaCount = useMemo(() => {
        return activeCategories.reduce((sum, category) => sum + category.items.length, 0);
    }, [activeCategories]);

    const handleTimestampClick = (timestamp) => {
        setSelectedTimestamp(timestamp);
        if (videoRef.current && timestamp.seconds !== undefined) {
            videoRef.current.currentTime = timestamp.seconds;
            videoRef.current.play();
        }
    };

    const handleTranscriptClick = (utterance, index) => {
        const seconds = utterance.startSec ?? utterance.seconds ?? 0;
        setSelectedTimestamp({ ...utterance, seconds, kind: "transcript", index });
        if (videoRef.current) {
            videoRef.current.currentTime = seconds;
            videoRef.current.play();
        }
    };

    const formatUtteranceRange = (utterance) => {
        const start = utterance.time || formatSecondsForDisplay(utterance.startSec ?? 0);
        if (utterance.endSec == null || utterance.endSec === utterance.startSec) return start;
        return `${start} - ${formatSecondsForDisplay(utterance.endSec)}`;
    };

    const formatSecondsForDisplay = (seconds) => {
        const safeSeconds = Math.max(0, Number(seconds) || 0);
        const mins = Math.floor(safeSeconds / 60);
        const secs = Math.floor(safeSeconds % 60);
        return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
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

    // 항목별로 타임스탬프 매칭 (공백·특수문자 정규화 후 비교)
    const normalizeLabel = (s) => (s || "").replace(/\s+/g, "").replace(/[-–—_]/g, "").toLowerCase();
    const matchTimestampsToItem = (item, categoryLabel) => {
        const norm = normalizeLabel(item.label);
        const normId = item.id.replace(/_/g, "").toLowerCase();
        // 카테고리명이 있으면 같은 카테고리 타임스탬프만 대상으로 하되, 없으면 전체 대상
        const pool = categoryLabel
            ? timestamps.filter((t) => !t.category || normalizeLabel(t.category) === normalizeLabel(categoryLabel))
            : timestamps;
        const matched = pool.filter((t) => {
            if (!t || !t.item) return false;
            const tNorm = normalizeLabel(t.item);
            // 완전 일치 (trim)
            if (t.item.trim() === item.label) return true;
            // 정규화 후 비교 (공백·대시 차이 무시)
            if (tNorm === norm) return true;
            // 포함 관계 (모델이 설명을 붙인 경우 대비)
            if (tNorm.includes(norm) || norm.includes(tNorm)) return true;
            // fallback: item ID 기반 매칭 (모델이 영어 ID를 반환한 경우)
            if (tNorm === normId || tNorm.includes(normId) || normId.includes(tNorm)) return true;
            return false;
        });
        // 카테고리 필터링으로 매칭된 경우를 우선하되, 없으면 전체에서 재시도
        if (matched.length > 0 || !categoryLabel) return matched;
        return timestamps.filter((t) => {
            if (!t || !t.item) return false;
            const tNorm = normalizeLabel(t.item);
            if (t.item.trim() === item.label) return true;
            if (tNorm === norm) return true;
            if (tNorm.includes(norm) || norm.includes(tNorm)) return true;
            if (tNorm === normId || tNorm.includes(normId) || normId.includes(tNorm)) return true;
            return false;
        });
    };

    const getItemSuggestion = (categoryIndex) => {
        const suggestions = summary.suggestions || [];
        if (suggestions.length > 0) return suggestions[categoryIndex % suggestions.length];
        return "선택한 타임스탬프 피드백을 기준으로 다음 연습에서 같은 장면을 다시 확인해보세요.";
    };

    return (
        <main className={`analysis-page-v2 feedback-demo-page ${isChatOpen ? "chat-open" : ""}`}>
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

            <div className="analysis-main-v2 feedback-demo-main">
                <section className="video-summary-section">
                    <div className="video-container-v2">
                        {videoUrl ? (
                            <video ref={videoRef} className="video-player-v2" src={videoUrl} controls>
                                브라우저가 비디오 재생을 지원하지 않습니다.
                            </video>
                        ) : (
                            <div className="video-placeholder-v2 feedback-demo-video">
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
                                <h4>강점</h4>
                                <ul>
                                    {(summary.strengths || []).map((item, idx) => (<li key={idx}>{item}</li>))}
                                </ul>
                            </div>
                            <div className="summary-block suggestions">
                                <h4>개선 제안</h4>
                                <ul>
                                    {(summary.suggestions || []).map((item, idx) => (<li key={idx}>{item}</li>))}
                                </ul>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="bottom-sections-wrapper">
                    {(transcriptUtterances.length > 0 || transcript?.error) && (
                        <section className="transcript-section-v2">
                            <div className="timestamps-header">
                                <h3>발화 기록</h3>
                                <span className="timestamps-count">
                                    {transcriptUtterances.length > 0 ? `${transcriptUtterances.length}개 발화` : "STT 미완료"}
                                </span>
                            </div>

                            {transcript?.error ? (
                                <div className="transcript-error-message">
                                    <span>Chirp STT 처리 실패</span>
                                    <p>{transcript.error}</p>
                                </div>
                            ) : (
                                <div className="transcript-scroll-container">
                                    {transcriptUtterances.map((utterance, index) => {
                                        const isSelected = selectedTimestamp?.kind === "transcript" && selectedTimestamp?.index === index;
                                        return (
                                            <button
                                                key={`${utterance.startSec || 0}-${index}`}
                                                type="button"
                                                className={`transcript-row ${isSelected ? "selected" : ""}`}
                                                onClick={() => handleTranscriptClick(utterance, index)}
                                            >
                                                <span className="transcript-time">{formatUtteranceRange(utterance)}</span>
                                                <span className="transcript-text">{utterance.text}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    )}

                    <section className="detailed-feedback-section feedback-demo-section">
                        <div className="detailed-feedback-header">
                            <h3>영역별 상세 피드백</h3>
                            <span className="timestamps-count">{totalFeedbackAreaCount}개 하위 영역</span>
                        </div>
                        <p className="timestamps-hint-v2">카드 헤더의 하위 영역을 선택하면 해당 피드백 내용이 표시됩니다</p>

                        <div className="feedback-demo-category-row">
                            {activeCategories.map((cat, categoryIndex) => {
                                const selectedItemId = selectedByCategory[cat.id];
                                const selectedItem = cat.items.find((item) => item.id === selectedItemId) || cat.items[0];
                                const itemTimestamps = selectedItem ? matchTimestampsToItem(selectedItem, cat.label) : [];
                                const score = selectedItem ? scores[selectedItem.id] : null;
                                const primaryFeedback = itemTimestamps[0]?.feedback || "이 항목에 대한 타임스탬프 피드백이 아직 없습니다.";
                                const scoreSummary = score != null
                                    ? `${selectedItem.label} 점수는 ${score}/5입니다. ${primaryFeedback}`
                                    : primaryFeedback;

                                return (
                                    <article key={cat.id} className="feedback-demo-card">
                                        <div className="feedback-demo-card-header">
                                            <div className="feedback-category-title feedback-demo-title">
                                                <span className="category-icon">{cat.icon}</span>
                                                <div>
                                                    <h4>{cat.label}</h4>
                                                    <span className="category-short">{cat.shortLabel}</span>
                                                </div>
                                            </div>
                                            <div className="feedback-demo-tabs" aria-label={`${cat.label} 하위 영역`}>
                                                {cat.items.map((item) => (
                                                    <button
                                                        key={item.id}
                                                        type="button"
                                                        className={`feedback-demo-tab ${selectedItem?.id === item.id ? "active" : ""}`}
                                                        onClick={() => setSelectedByCategory((prev) => ({
                                                            ...prev,
                                                            [cat.id]: item.id,
                                                        }))}
                                                    >
                                                        {item.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {selectedItem && (
                                            <div className="feedback-demo-card-body">
                                                <div className="feedback-area-header feedback-demo-active-header">
                                                    <div className="feedback-area-title">
                                                        <h4>{selectedItem.label}</h4>
                                                        <span className="feedback-area-desc">{selectedItem.desc}</span>
                                                    </div>
                                                    {score != null && (
                                                        <div className="score-badge" data-score={score} title={`${score}/5점`}>
                                                            {[1, 2, 3, 4, 5].map((n) => (
                                                                <span key={n} className={`score-dot ${n <= score ? "filled" : ""}`} />
                                                            ))}
                                                            <span className="score-value">{score}<span className="score-max">/5</span></span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="timestamp-card-mini feedback-demo-summary">
                                                    <span className="time-badge-mini">요약</span>
                                                    <p className="timestamp-feedback-mini">{scoreSummary}</p>
                                                </div>

                                                <div className="feedback-demo-evidence-list">
                                                    {itemTimestamps.length > 0 ? (
                                                        itemTimestamps.map((t, index) => {
                                                            const seconds = t.seconds ?? parseTimeToSeconds(t.time);
                                                            const isSelected = selectedTimestamp?.time === t.time
                                                                && selectedTimestamp?.item === t.item
                                                                && selectedTimestamp?.feedback === t.feedback;
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

                                                <div className="feedback-demo-suggestion">
                                                    <strong>개선 제안</strong>
                                                    <p>{getItemSuggestion(categoryIndex)}</p>
                                                </div>
                                            </div>
                                        )}
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
                            <button type="button" className="chat-suggestion-btn" onClick={() => setChatInput("내용 조직과 표현 전달을 더 잘하려면 어떻게 해야 할까?")}>
                                내용 조직과 표현 전달을 더 잘하려면 어떻게 해야 할까?
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
