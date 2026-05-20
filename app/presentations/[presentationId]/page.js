"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthProvider";
import { FEEDBACK_CATEGORIES } from "../../lib/feedbackAreas";

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

function formatScore(value) {
    return typeof value === "number" ? value.toFixed(1) : "-";
}

export default function PresentationDetailPage({ params }) {
    const router = useRouter();
    const { presentationId } = params;
    const { user, authLoading } = useAuth();
    const [presentation, setPresentation] = useState(null);
    const [attempts, setAttempts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

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
        () => attempts.filter((attempt) => attempt.status === "completed"),
        [attempts]
    );

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
        <main className="session-detail-page">
            <div className="session-detail-container">
                <header className="session-detail-header">
                    <button type="button" className="sim-setup-back" onClick={() => router.push("/dashboard")}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
                        </svg>
                        대시보드
                    </button>
                    <div className="session-detail-title-row">
                        <div>
                            <span className="presentation-dday">{ddayText(presentation.dday)}</span>
                            <h1>{presentation.title || "발표"}</h1>
                            <p>{presentation.topic || "주제 미입력"}</p>
                        </div>
                        <div className="session-action-row">
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
                        <span>연습 횟수</span>
                        <strong>{presentation.attemptCount || 0}회</strong>
                    </div>
                    <div className="session-summary-card">
                        <span>최근 평균</span>
                        <strong>{formatScore(presentation.latestScoreAverage)}/5</strong>
                    </div>
                </section>

                <section className="session-panel">
                    <div className="session-panel-header">
                        <h2>D-day까지 {presentation.attemptCount || 0}회 연습</h2>
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
                                <button
                                    key={attempt.id}
                                    type="button"
                                    className="attempt-row"
                                    disabled={attempt.status !== "completed"}
                                    onClick={() => {
                                        if (attempt.analysisResult) {
                                            sessionStorage.setItem("analysisResult", JSON.stringify(attempt.analysisResult));
                                            sessionStorage.setItem("videoUrl", attempt.video?.videoUrl || "");
                                            sessionStorage.setItem("videoName", `${presentation.title || "발표"} ${attempt.attemptNo}회차`);
                                            router.push("/analysis");
                                        }
                                    }}
                                >
                                    <div>
                                        <strong>{attempt.attemptNo}회차</strong>
                                        <span>{attempt.sourceType === "simulation" ? "시뮬레이션" : "영상 업로드"}</span>
                                    </div>
                                    <div>
                                        <strong>{attempt.status === "completed" ? `${formatScore(attempt.scoreAverage)}/5` : attempt.status}</strong>
                                        <span>{formatTimestamp(attempt.completedAt || attempt.createdAt)}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
