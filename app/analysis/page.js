"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/AuthProvider";
import { FEEDBACK_CATEGORIES, ALL_ITEM_IDS } from "../lib/feedbackAreas";

function buildInitialSelections(activeItemIds = ALL_ITEM_IDS) {
    return FEEDBACK_CATEGORIES.reduce((acc, category) => {
        const firstActiveItem = category.items.find((item) => activeItemIds.includes(item.id));
        acc[category.id] = firstActiveItem?.id || category.items[0]?.id || "";
        return acc;
    }, {});
}

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

const EMPTY_REFLECTION_FIELDS = REFLECTION_STEPS.reduce((acc, step) => {
    acc[step.id] = "";
    return acc;
}, {});

function buildReflectionNote(fields = EMPTY_REFLECTION_FIELDS) {
    return REFLECTION_STEPS
        .map((step) => {
            const value = String(fields[step.id] || "").trim();
            return value ? `[${step.label}]\n${value}` : "";
        })
        .filter(Boolean)
        .join("\n\n");
}

function normalizeReflectionFields(context = {}) {
    if (context.reflectionFields && typeof context.reflectionFields === "object") {
        return {
            ...EMPTY_REFLECTION_FIELDS,
            ...context.reflectionFields,
        };
    }
    return {
        ...EMPTY_REFLECTION_FIELDS,
        keep: context.reflectionNote || "",
    };
}

function parseExpectedDurationSeconds(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const text = String(value || "").trim();
    if (!text) return null;

    if (text.includes(":")) {
        const parts = text.split(":").map((part) => Number(part.trim()));
        if (parts.length === 2 && parts.every(Number.isFinite)) {
            return parts[0] * 60 + parts[1];
        }
        if (parts.length === 3 && parts.every(Number.isFinite)) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
    }

    const unitPattern = /(\d+(?:\.\d+)?)\s*(시간|hours?|hrs?|h|분|minutes?|mins?|m|초|seconds?|secs?|s)/gi;
    const matches = [...text.matchAll(unitPattern)];
    if (matches.length > 0) {
        return matches.reduce((total, match) => {
            const amount = Number(match[1]);
            const unit = match[2].toLowerCase();
            if (!Number.isFinite(amount)) return total;
            if (/^(시간|hours?|hrs?|h)$/.test(unit)) return total + amount * 3600;
            if (/^(분|minutes?|mins?|m)$/.test(unit)) return total + amount * 60;
            return total + amount;
        }, 0);
    }

    const numeric = Number(text.replace(/[^\d.]/g, ""));
    return Number.isFinite(numeric) && numeric > 0 ? numeric * 60 : null;
}

function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return "-";
    const rounded = Math.max(0, Math.round(seconds));
    const hours = Math.floor(rounded / 3600);
    const mins = Math.floor((rounded % 3600) / 60);
    const secs = rounded % 60;
    if (hours > 0) return `${hours}시간 ${mins}분 ${secs}초`;
    if (mins > 0) return `${mins}분 ${secs}초`;
    return `${secs}초`;
}

function parseTimeToSeconds(timeStr) {
    if (!timeStr) return 0;
    const parts = String(timeStr).split(":").map((part) => Number(part));
    if (parts.length === 2 && parts.every(Number.isFinite)) return parts[0] * 60 + parts[1];
    if (parts.length === 3 && parts.every(Number.isFinite)) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
}

function buildTimingStatus(expectedSeconds, actualSeconds) {
    if (!expectedSeconds) return null;
    if (!Number.isFinite(actualSeconds)) {
        return {
            tone: "pending",
            label: "영상 길이 확인 중",
            differenceLabel: "-",
            message: "영상 메타데이터를 불러오면 예상 시간과 비교합니다.",
        };
    }

    const diff = Math.round(actualSeconds - expectedSeconds);
    const absDiff = Math.abs(diff);
    const tolerance = Math.max(10, Math.round(expectedSeconds * 0.05));

    if (absDiff <= tolerance) {
        return {
            tone: "good",
            label: "시간 적절",
            differenceLabel: "거의 일치",
            message: "입력한 예상 발표 시간과 실제 영상 시간이 거의 일치합니다.",
        };
    }

    if (diff > 0) {
        return {
            tone: diff <= 60 ? "warn" : "danger",
            label: diff <= 60 ? "조금 초과" : "시간 초과",
            differenceLabel: `${formatDuration(diff)} 초과`,
            message: diff <= 60
                ? "예상 시간보다 약간 길었습니다. 핵심 문장 중심으로 마무리를 조금 압축해보세요."
                : "예상 시간보다 많이 길었습니다. 도입, 예시, 결론 중 줄일 구간을 정해보세요.",
        };
    }

    return {
        tone: absDiff <= 60 ? "under" : "warn",
        label: absDiff <= 60 ? "조금 짧음" : "시간 여유 큼",
        differenceLabel: `${formatDuration(absDiff)} 짧음`,
        message: absDiff <= 60
            ? "예상 시간보다 조금 짧았습니다. 결론 정리나 핵심 근거를 한 문장 보강해도 좋습니다."
            : "예상 시간보다 많이 짧았습니다. 주요 근거와 예시를 더 충분히 설명해보세요.",
    };
}

export default function AnalysisPage() {
    const router = useRouter();
    const { user } = useAuth();
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
    const [expectedDurationText, setExpectedDurationText] = useState("");
    const [actualVideoSeconds, setActualVideoSeconds] = useState(null);
    const [analysisContext, setAnalysisContext] = useState(null);
    const [reflectionFields, setReflectionFields] = useState(EMPTY_REFLECTION_FIELDS);
    const [savedReflectionFields, setSavedReflectionFields] = useState(EMPTY_REFLECTION_FIELDS);
    const [reflectionOpen, setReflectionOpen] = useState(false);
    const [activeReflectionStep, setActiveReflectionStep] = useState("keep");
    const [savingReflection, setSavingReflection] = useState(false);
    const [reflectionStatus, setReflectionStatus] = useState("");
    const [summaryModal, setSummaryModal] = useState(null);

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

                const savedAnalysisContext = sessionStorage.getItem("analysisContext");
                if (savedAnalysisContext) {
                    const context = JSON.parse(savedAnalysisContext);
                    const fields = normalizeReflectionFields(context);
                    setAnalysisContext(context);
                    setReflectionFields(fields);
                    setSavedReflectionFields(fields);
                }

                const savedPrepareData = sessionStorage.getItem("prepareData");
                if (savedPrepareData) {
                    const prepareData = JSON.parse(savedPrepareData);
                    setSelectedItemIds(prepareData.feedbackItems || []);
                    setExpectedDurationText(prepareData.duration || "");
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
            setError("분석 결과가 없습니다. 대시보드에서 발표 세션을 열고 영상을 먼저 업로드해주세요.");
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
    const expectedDurationSeconds = useMemo(
        () => parseExpectedDurationSeconds(expectedDurationText),
        [expectedDurationText]
    );
    const fallbackActualSeconds = useMemo(() => {
        const utteranceEnds = transcriptUtterances
            .map((utterance) => utterance.endSec ?? utterance.startSec)
            .filter((seconds) => typeof seconds === "number" && Number.isFinite(seconds));
        const timestampSeconds = timestamps
            .map((timestamp) => timestamp.seconds ?? parseTimeToSeconds(timestamp.time))
            .filter((seconds) => typeof seconds === "number" && Number.isFinite(seconds));
        const candidates = [...utteranceEnds, ...timestampSeconds];
        return candidates.length ? Math.max(...candidates) : null;
    }, [timestamps, transcriptUtterances]);
    const displayActualSeconds = Number.isFinite(actualVideoSeconds) ? actualVideoSeconds : fallbackActualSeconds;
    const timingStatus = useMemo(
        () => buildTimingStatus(expectedDurationSeconds, displayActualSeconds),
        [displayActualSeconds, expectedDurationSeconds]
    );

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
                    <button className="btn-primary" onClick={() => router.push("/dashboard")} style={{ marginTop: "1rem" }}>
                        대시보드로 이동
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

    const handleSaveReflection = async () => {
        if (!user || !analysisContext?.presentationId || !analysisContext?.attemptId || savingReflection) return;
        setSavingReflection(true);
        setReflectionStatus("");
        try {
            const note = buildReflectionNote(reflectionFields);
            const attemptRef = doc(
                db,
                "users",
                user.uid,
                "presentations",
                analysisContext.presentationId,
                "attempts",
                analysisContext.attemptId
            );
            await updateDoc(attemptRef, {
                reflectionNote: note,
                reflectionFields,
                reflectionUpdatedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            const nextContext = { ...analysisContext, reflectionNote: note, reflectionFields };
            setAnalysisContext(nextContext);
            setSavedReflectionFields(reflectionFields);
            sessionStorage.setItem("analysisContext", JSON.stringify(nextContext));
            setReflectionStatus("저장되었습니다.");
        } catch (err) {
            console.error("[Analysis] 성찰 노트 저장 실패:", err);
            setReflectionStatus("저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
        } finally {
            setSavingReflection(false);
        }
    };

    const canSaveReflection = Boolean(user && analysisContext?.presentationId && analysisContext?.attemptId);
    const reflectionDirty = buildReflectionNote(reflectionFields) !== buildReflectionNote(savedReflectionFields);
    const activeReflection = REFLECTION_STEPS.find((step) => step.id === activeReflectionStep) || REFLECTION_STEPS[0];
    const sessionPath = analysisContext?.presentationId
        ? `/presentations/${analysisContext.presentationId}`
        : "/dashboard";

    return (
        <main className={`analysis-page-v2 feedback-demo-page ${isChatOpen ? "chat-open" : ""}`}>
            <header className="analysis-header-v2">
                <div className="header-content">
                    <h1>발표 분석 결과</h1>
                    <p>{videoName}</p>
                </div>
                <div className="header-actions">
                    <button className="btn-outline" onClick={() => router.push(sessionPath)}>대시보드</button>
                    <button className="btn-primary-sm" onClick={() => router.push(sessionPath)}>새 연습 시작</button>
                </div>
            </header>

            <div className="analysis-main-v2 feedback-demo-main">
                <section className="video-summary-section">
                    <div className="video-container-v2">
                        {videoUrl ? (
                            <video
                                ref={videoRef}
                                className="video-player-v2"
                                src={videoUrl}
                                controls
                                onLoadedMetadata={(event) => setActualVideoSeconds(event.currentTarget.duration)}
                            >
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
                        {expectedDurationText && timingStatus && (
                            <div className={`duration-check-card duration-check-${timingStatus.tone}`}>
                                <div className="duration-check-main">
                                    <span className="duration-check-kicker">발표 시간</span>
                                    <strong>{timingStatus.differenceLabel}</strong>
                                    <span className="duration-check-status">{timingStatus.label}</span>
                                </div>
                                <div className="duration-check-meta">
                                    <span>예상 {formatDuration(expectedDurationSeconds)}</span>
                                    <span>실제 {formatDuration(displayActualSeconds)}</span>
                                </div>
                            </div>
                        )}
                        <h3>종합 피드백</h3>
                        <p className="summary-overall">{summary.overall}</p>

                        <div className="summary-lists">
                            <button
                                type="button"
                                className="summary-card-trigger strengths"
                                onClick={() => setSummaryModal({ title: "강점", tone: "strengths", items: summary.strengths || [] })}
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
                                onClick={() => setSummaryModal({ title: "개선 제안", tone: "suggestions", items: summary.suggestions || [] })}
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
                                {summaryModal.items.length > 0 ? (
                                    summaryModal.items.map((item, index) => <li key={index}>{item}</li>)
                                ) : (
                                    <li>표시할 내용이 없습니다.</li>
                                )}
                            </ul>
                        </section>
                    </div>
                )}

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

            {reflectionOpen && (
                <div className="reflection-note-modal-backdrop" role="presentation" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setReflectionOpen(false);
                }}>
                    <section className="reflection-note-modal" role="dialog" aria-modal="true" aria-labelledby="reflection-note-modal-title">
                        <header className="reflection-note-modal-header">
                            <div>
                                <h2 id="reflection-note-modal-title">성찰 노트</h2>
                            </div>
                            <button type="button" onClick={() => setReflectionOpen(false)} aria-label="닫기">×</button>
                        </header>

                        <div className="reflection-note-body reflection-note-modal-body">
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

                            <div className="reflection-step-panel">
                                <textarea
                                    value={reflectionFields[activeReflection.id] || ""}
                                    onChange={(event) => {
                                        setReflectionFields((prev) => ({
                                            ...prev,
                                            [activeReflection.id]: event.target.value,
                                        }));
                                        setReflectionStatus("");
                                    }}
                                    placeholder={activeReflection.placeholder}
                                    rows={5}
                                />
                            </div>

                            <div className="reflection-note-actions">
                                <span>
                                    {canSaveReflection
                                        ? reflectionStatus || (reflectionDirty ? "저장되지 않은 변경사항이 있습니다." : "회차 기록에 저장됩니다.")
                                        : "발표 세션에서 열린 분석 결과만 저장할 수 있습니다."}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleSaveReflection}
                                    disabled={!canSaveReflection || savingReflection || !reflectionDirty}
                                >
                                    {savingReflection ? "저장 중..." : "성찰 저장"}
                                </button>
                            </div>
                        </div>
                    </section>
                </div>
            )}

            <button
                type="button"
                className={`reflection-note-toggle-btn ${isChatOpen ? "chat-open" : ""}`}
                onClick={() => setReflectionOpen(true)}
                title="성찰 노트"
            >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                    <path d="M16 13H8" />
                    <path d="M16 17H8" />
                    <path d="M10 9H8" />
                </svg>
                <span className="chat-toggle-label">{buildReflectionNote(reflectionFields) ? "성찰 노트" : "노트 작성"}</span>
            </button>

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
