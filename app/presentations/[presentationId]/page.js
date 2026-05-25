"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthProvider";
import { FEEDBACK_CATEGORIES } from "../../lib/feedbackAreas";
import { deletePresentationAttempt, deletePresentationSession } from "../../lib/presentations";

const WAITING_CLEANUP_MINUTES = 30;

const ATTEMPT_STATUS_META = {
    pending: { label: "준비 중", tone: "muted" },
    waiting: { label: "연결 대기", tone: "waiting" },
    analyzing: { label: "분석 중", tone: "active" },
    completed: { label: "분석 완료", tone: "success" },
    failed: { label: "처리 실패", tone: "danger" },
    cancelled: { label: "취소됨", tone: "muted" },
};

const GROWTH_CHART = {
    width: 640,
    height: 240,
    pad: { top: 24, right: 28, bottom: 42, left: 40 },
};

const CATEGORY_LINE_COLORS = {
    visual: "#2563eb",
    verbal: "#059669",
    media: "#d97706",
};

function getDaysLeft(dday) {
    if (!dday) return null;
    const today = new Date();
    const target = new Date(`${dday}T00:00:00`);
    today.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function ddayText(dday) {
    const daysLeft = getDaysLeft(dday);
    if (daysLeft == null) return "D-day 미정";
    if (daysLeft === 0) return "D-day";
    if (daysLeft > 0) return `D-${daysLeft}`;
    return `D+${Math.abs(daysLeft)}`;
}

function formatDate(value) {
    if (!value) return "미정";
    return value.replaceAll("-", ".");
}

function formatTimestamp(value) {
    const date = value?.toDate?.();
    if (!date) return "";
    return date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function getTimestampMillis(value) {
    const date = value?.toDate?.();
    return date ? date.getTime() : null;
}

function formatScore(value) {
    return typeof value === "number" ? value.toFixed(1) : "-";
}

function sourceLabel(sourceType) {
    return sourceType === "simulation" ? "시뮬레이션" : "영상 업로드";
}

function statusMeta(status) {
    return ATTEMPT_STATUS_META[status] || { label: status || "상태 없음", tone: "muted" };
}

function isWaitingCleanupTarget(attempt) {
    if (!["pending", "waiting"].includes(attempt.status)) return false;
    if (attempt.analysisResult || attempt.video?.videoUrl) return false;
    const createdAt = getTimestampMillis(attempt.createdAt);
    if (!createdAt) return false;
    return Date.now() - createdAt > WAITING_CLEANUP_MINUTES * 60 * 1000;
}

function scoreToChartY(score) {
    const { height, pad } = GROWTH_CHART;
    const chartHeight = height - pad.top - pad.bottom;
    return pad.top + chartHeight - ((score - 1) / 4) * chartHeight;
}

function buildCategoryGrowthSeries(completedAttempts) {
    const { width, pad } = GROWTH_CHART;
    const chartWidth = width - pad.left - pad.right;

    return FEEDBACK_CATEGORIES.map((category) => {
        const points = completedAttempts
            .map((attempt, index) => {
                const score = attempt.categoryAverages?.[category.id];
                if (typeof score !== "number") return null;
                const x = completedAttempts.length === 1
                    ? pad.left + chartWidth / 2
                    : pad.left + (chartWidth * index) / (completedAttempts.length - 1);
                return {
                    x,
                    y: scoreToChartY(score),
                    score,
                    attemptNo: attempt.attemptNo,
                };
            })
            .filter(Boolean);

        return {
            category,
            color: CATEGORY_LINE_COLORS[category.id] || "#111827",
            points,
            polyline: points.map((point) => `${point.x},${point.y}`).join(" "),
        };
    });
}

export default function PresentationDetailPage({ params }) {
    const router = useRouter();
    const { presentationId } = params;
    const { user, authLoading } = useAuth();
    const [accountMenuOpen, setAccountMenuOpen] = useState(false);
    const [presentation, setPresentation] = useState(null);
    const [attempts, setAttempts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [cleanupMessage, setCleanupMessage] = useState("");
    const [deletingPresentation, setDeletingPresentation] = useState(false);
    const cleanedAttemptIdsRef = useRef(new Set());

    useEffect(() => {
        if (!authLoading && !user) {
            router.replace("/");
        }
    }, [authLoading, router, user]);

    useEffect(() => {
        if (authLoading || !user || !presentationId) return undefined;

        const presentationRef = doc(db, "users", user.uid, "presentations", presentationId);
        const attemptsQuery = query(
            collection(presentationRef, "attempts"),
            orderBy("attemptNo", "desc")
        );

        const unsubPresentation = onSnapshot(
            presentationRef,
            (snapshot) => {
                if (!snapshot.exists()) {
                    setError("발표 세션을 찾을 수 없습니다.");
                    setLoading(false);
                    return;
                }
                setPresentation({ id: snapshot.id, ...snapshot.data() });
                setLoading(false);
            },
            (err) => {
                console.error("[PresentationDetail] 세션 로드 실패:", err);
                setError("발표 세션을 불러오지 못했습니다.");
                setLoading(false);
            }
        );

        const unsubAttempts = onSnapshot(attemptsQuery, (snapshot) => {
            setAttempts(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
        });

        return () => {
            unsubPresentation();
            unsubAttempts();
        };
    }, [authLoading, presentationId, user]);

    const completedAttempts = useMemo(
        () => attempts
            .filter((attempt) => attempt.status === "completed" && typeof attempt.scoreAverage === "number")
            .slice()
            .sort((a, b) => (a.attemptNo || 0) - (b.attemptNo || 0)),
        [attempts]
    );

    const activeAttempts = useMemo(
        () => attempts.filter((attempt) => ["pending", "waiting", "analyzing"].includes(attempt.status)),
        [attempts]
    );

    const failedAttempts = useMemo(
        () => attempts.filter((attempt) => ["failed", "cancelled"].includes(attempt.status)),
        [attempts]
    );

    const cleanupTargets = useMemo(
        () => attempts.filter(isWaitingCleanupTarget),
        [attempts]
    );

    const growthSeries = useMemo(
        () => buildCategoryGrowthSeries(completedAttempts),
        [completedAttempts]
    );

    useEffect(() => {
        if (!user || !presentationId || cleanupTargets.length === 0) return;

        const targets = cleanupTargets.filter((attempt) => !cleanedAttemptIdsRef.current.has(attempt.id));
        if (targets.length === 0) return;

        targets.forEach((attempt) => cleanedAttemptIdsRef.current.add(attempt.id));

        (async () => {
            for (const attempt of targets) {
                await deletePresentationAttempt(user, presentationId, attempt.id);
            }
        })()
            .then(() => {
                setCleanupMessage(`${targets.length}개 대기 종료 회차를 정리했습니다.`);
            })
            .catch((err) => {
                console.error("[PresentationDetail] 대기 회차 정리 실패:", err);
                setCleanupMessage("대기 종료 회차 정리에 실패했습니다.");
            });
    }, [cleanupTargets, presentationId, user]);

    const openAttemptAnalysis = (attempt) => {
        if (attempt.status !== "completed" || !attempt.analysisResult) return;
        sessionStorage.setItem("analysisResult", JSON.stringify(attempt.analysisResult));
        sessionStorage.setItem("videoUrl", attempt.video?.videoUrl || "");
        sessionStorage.setItem("videoName", `${presentation.title || "발표"} ${attempt.attemptNo}회차`);
        router.push("/analysis");
    };

    const handleLogout = async () => {
        await signOut(auth);
        router.replace("/");
    };

    const handleDeleteAttempt = async (attempt) => {
        if (!confirm(`${attempt.attemptNo}회차 기록을 삭제하시겠습니까?`)) return;
        try {
            await deletePresentationAttempt(user, presentationId, attempt.id);
            setCleanupMessage(`${attempt.attemptNo}회차 기록을 삭제했습니다.`);
        } catch (err) {
            console.error("[PresentationDetail] 회차 삭제 실패:", err);
            setCleanupMessage("회차 기록을 삭제하지 못했습니다.");
        }
    };

    const handleDeletePresentation = async () => {
        if (!confirm("이 발표와 모든 회차 기록을 삭제하시겠습니까?")) return;
        setDeletingPresentation(true);
        try {
            await deletePresentationSession(user, presentationId);
            router.replace("/dashboard");
        } catch (err) {
            console.error("[PresentationDetail] 발표 삭제 실패:", err);
            setCleanupMessage("발표를 삭제하지 못했습니다.");
            setDeletingPresentation(false);
        }
    };

    if (authLoading || loading || !user) {
        return (
            <main className="sim-setup-page">
                <div className="sim-setup-loading">불러오는 중...</div>
            </main>
        );
    }

    if (error || !presentation) {
        return (
            <main className="sim-setup-page">
                <div className="sim-setup-container">
                    <p className="sim-setup-error">{error || "발표 세션을 불러오지 못했습니다."}</p>
                    <button type="button" className="btn-primary" onClick={() => router.push("/dashboard")}>
                        대시보드로 이동
                    </button>
                </div>
            </main>
        );
    }

    return (
        <div className="db-layout">
            <header className="db-topbar">
                <div className="db-topbar-brand">
                    <img src="/logo.png" alt="Logo" className="db-topbar-logo" />
                    <span className="db-topbar-title">AI 발표 피드백 시스템</span>
                </div>
                <div className="db-topbar-right">
                    <button
                        className="db-account-btn"
                        onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                    >
                        {user.email || "내 계정"}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M6 9l6 6 6-6" />
                        </svg>
                    </button>
                    {accountMenuOpen && (
                        <div className="db-account-menu">
                            <button onClick={handleLogout}>로그아웃</button>
                        </div>
                    )}
                </div>
            </header>

            <main className="session-detail-page">
            <div className="session-detail-container">
                <header className="session-detail-toolbar">
                    <button type="button" className="session-toolbar-back" onClick={() => router.push("/dashboard")}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
                        </svg>
                        대시보드
                    </button>
                    <div className="session-toolbar-title">
                        <span className="presentation-dday">{ddayText(presentation.dday)}</span>
                        <div>
                            <h1>{presentation.title || "발표"}</h1>
                            <p>{presentation.topic || "주제 미입력"}</p>
                        </div>
                    </div>
                    <div className="session-action-row">
                        <button
                            type="button"
                            className="btn-danger"
                            onClick={handleDeletePresentation}
                            disabled={deletingPresentation}
                        >
                            {deletingPresentation ? "삭제 중..." : "발표 삭제"}
                        </button>
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => router.push(`/upload?presentationId=${presentationId}`)}
                        >
                            영상 업로드
                        </button>
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={() => router.push(`/simulation/setup?presentationId=${presentationId}`)}
                        >
                            시뮬레이션
                        </button>
                    </div>
                </header>

                <section className="session-summary-grid">
                    <div className="session-summary-card">
                        <span>D-day</span>
                        <strong>{formatDate(presentation.dday)}</strong>
                    </div>
                    <div className="session-summary-card">
                        <span>예상 청중</span>
                        <strong>{presentation.audience || "미정"}</strong>
                    </div>
                    <div className="session-summary-card">
                        <span>분석 완료</span>
                        <strong>{completedAttempts.length}회</strong>
                    </div>
                    <div className="session-summary-card">
                        <span>최근 평균</span>
                        <strong>{formatScore(presentation.latestScoreAverage)}/5</strong>
                    </div>
                </section>

                <section className="session-panel">
                    <div className="session-panel-header">
                        <h2>세션 관리</h2>
                        <span>{activeAttempts.length}개 진행 중 · {failedAttempts.length}개 확인 필요</span>
                    </div>
                    <div className="session-ops-grid">
                        <div className="session-ops-item">
                            <span>진행 중 회차</span>
                            <strong>{activeAttempts.length}</strong>
                            <p>시뮬레이션 연결 대기와 AI 분석 중인 회차입니다.</p>
                        </div>
                        <div className="session-ops-item">
                            <span>정리 대상</span>
                            <strong>{cleanupTargets.length}</strong>
                            <p>{WAITING_CLEANUP_MINUTES}분 이상 대기 상태로 끝난 회차는 자동 삭제됩니다.</p>
                        </div>
                        <div className="session-ops-item">
                            <span>실패 기록</span>
                            <strong>{failedAttempts.length}</strong>
                            <p>전송 실패나 분석 오류가 발생한 회차입니다.</p>
                        </div>
                    </div>
                    {cleanupMessage && <p className="session-cleanup-note">{cleanupMessage}</p>}
                </section>

                <section className="session-panel">
                    <div className="session-panel-header">
                        <h2>영역별 성장곡선</h2>
                        <span>{completedAttempts.length}개 분석 완료</span>
                    </div>
                    {completedAttempts.length === 0 ? (
                        <div className="attempt-empty">
                            <p>분석 완료된 회차가 생기면 영역별 평균 점수 변화가 여기에 표시됩니다.</p>
                        </div>
                    ) : (
                        <>
                            <div className="growth-legend">
                                {growthSeries.map((series) => (
                                    <span key={series.category.id}>
                                        <i style={{ backgroundColor: series.color }} />
                                        {series.category.shortLabel}
                                    </span>
                                ))}
                            </div>
                            <div className="growth-chart-wrap">
                                <svg
                                    className="growth-chart"
                                    viewBox={`0 0 ${GROWTH_CHART.width} ${GROWTH_CHART.height}`}
                                    role="img"
                                    aria-label="회차별 영역 평균 성장곡선"
                                >
                                    {[1, 2, 3, 4, 5].map((score) => {
                                        const y = scoreToChartY(score);
                                        return (
                                            <g key={score}>
                                                <line x1="40" y1={y} x2="612" y2={y} className="growth-grid-line" />
                                                <text x="16" y={y + 4} className="growth-axis-label">{score}</text>
                                            </g>
                                        );
                                    })}
                                    {completedAttempts.map((attempt, index) => {
                                        const x = completedAttempts.length === 1
                                            ? GROWTH_CHART.pad.left + (GROWTH_CHART.width - GROWTH_CHART.pad.left - GROWTH_CHART.pad.right) / 2
                                            : GROWTH_CHART.pad.left + ((GROWTH_CHART.width - GROWTH_CHART.pad.left - GROWTH_CHART.pad.right) * index) / (completedAttempts.length - 1);
                                        return (
                                            <text key={attempt.id} x={x} y="224" textAnchor="middle" className="growth-axis-label">
                                                {attempt.attemptNo}회
                                            </text>
                                        );
                                    })}
                                    {growthSeries.map((series) => (
                                        <g key={series.category.id}>
                                            {series.polyline && (
                                                <polyline
                                                    points={series.polyline}
                                                    className="growth-line"
                                                    style={{ stroke: series.color }}
                                                />
                                            )}
                                            {series.points.map((point) => (
                                                <circle
                                                    key={`${series.category.id}-${point.attemptNo}`}
                                                    cx={point.x}
                                                    cy={point.y}
                                                    r="5"
                                                    className="growth-point"
                                                    style={{ stroke: series.color }}
                                                >
                                                    <title>{`${series.category.shortLabel} ${point.attemptNo}회차 ${point.score.toFixed(1)}/5`}</title>
                                                </circle>
                                            ))}
                                        </g>
                                    ))}
                                </svg>
                            </div>
                        </>
                    )}
                </section>

                <section className="session-panel">
                    <div className="session-panel-header">
                        <h2>영역별 최근 평균</h2>
                        <span>{completedAttempts.length}개 분석 완료</span>
                    </div>
                    <div className="category-average-grid">
                        {FEEDBACK_CATEGORIES.map((category) => (
                            <div key={category.id} className="category-average">
                                <div>
                                    <span className="category-average-icon">{category.icon}</span>
                                    <strong>{category.shortLabel}</strong>
                                </div>
                                <span>{formatScore(presentation.categoryAverages?.[category.id])}/5</span>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="session-panel">
                    <div className="session-panel-header">
                        <h2>회차별 연습 기록</h2>
                        <span>{attempts.length}개 회차</span>
                    </div>

                    {attempts.length === 0 ? (
                        <div className="attempt-empty">
                            <p>아직 연습 기록이 없습니다. 시뮬레이션이나 영상 업로드로 첫 회차를 시작하세요.</p>
                        </div>
                    ) : (
                        <div className="attempt-list">
                            {attempts.map((attempt) => (
                                <div
                                    key={attempt.id}
                                    className={`attempt-row attempt-row-${statusMeta(attempt.status).tone}`}
                                >
                                    <button
                                        type="button"
                                        className="attempt-row-main"
                                        disabled={attempt.status !== "completed"}
                                        onClick={() => openAttemptAnalysis(attempt)}
                                    >
                                        <div>
                                            <strong>{attempt.attemptNo}회차</strong>
                                            <span>{sourceLabel(attempt.sourceType)}</span>
                                        </div>
                                        <div className="attempt-status-block">
                                            <span className={`attempt-status-badge attempt-status-${statusMeta(attempt.status).tone}`}>
                                                {statusMeta(attempt.status).label}
                                            </span>
                                            <strong>
                                                {attempt.status === "completed"
                                                    ? `${formatScore(attempt.scoreAverage)}/5`
                                                    : attempt.errorMessage || ""}
                                            </strong>
                                            <span>{formatTimestamp(attempt.completedAt || attempt.failedAt || attempt.createdAt)}</span>
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        className="attempt-delete-btn"
                                        onClick={() => handleDeleteAttempt(attempt)}
                                    >
                                        삭제
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
            </main>
        </div>
    );
}
