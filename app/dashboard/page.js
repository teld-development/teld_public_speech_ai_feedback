"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { useAuth } from "../lib/AuthProvider";

function formatDate(value) {
    if (!value) return "미정";
    return value.replaceAll("-", ".");
}

function getDaysLeft(dday) {
    if (!dday) return null;
    const today = new Date();
    const target = new Date(`${dday}T00:00:00`);
    today.setHours(0, 0, 0, 0);
    const diff = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
}

function ddayLabel(dday) {
    const daysLeft = getDaysLeft(dday);
    if (daysLeft == null) return "D-day 미정";
    if (daysLeft === 0) return "D-day";
    if (daysLeft > 0) return `D-${daysLeft}`;
    return `D+${Math.abs(daysLeft)}`;
}

function scoreLabel(score) {
    return typeof score === "number" ? `${score.toFixed(1)}/5` : "아직 없음";
}

export default function DashboardPage() {
    const router = useRouter();
    const { user, authLoading } = useAuth();
    const [accountMenuOpen, setAccountMenuOpen] = useState(false);
    const [presentations, setPresentations] = useState([]);
    const [loadingPresentations, setLoadingPresentations] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!authLoading && !user) {
            router.replace("/");
        }
    }, [authLoading, router, user]);

    useEffect(() => {
        if (authLoading || !user) return undefined;

        setLoadingPresentations(true);
        const presentationsQuery = query(
            collection(db, "users", user.uid, "presentations"),
            orderBy("updatedAt", "desc")
        );

        const unsubscribe = onSnapshot(
            presentationsQuery,
            (snapshot) => {
                setPresentations(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
                setLoadingPresentations(false);
            },
            (err) => {
                console.error("[Dashboard] 발표 세션 로드 실패:", err);
                setError("발표 목록을 불러오지 못했습니다.");
                setLoadingPresentations(false);
            }
        );

        return () => unsubscribe();
    }, [authLoading, user]);

    const stats = useMemo(() => {
        const totalAttempts = presentations.reduce((sum, item) => sum + (item.attemptCount || 0), 0);
        const activeCount = presentations.filter((item) => item.status !== "archived").length;
        return { totalAttempts, activeCount };
    }, [presentations]);

    const handleLogout = async () => {
        await signOut(auth);
        router.replace("/");
    };

    if (authLoading || !user) {
        return (
            <main className="page">
                <section className="card">
                    <p className="subtitle">계정 정보를 확인하는 중입니다.</p>
                </section>
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

            <main className="db-main">
                <div className="session-home">
                    <section className="session-home-header">
                        <div>
                            <p className="session-eyebrow">발표 세션</p>
                            <h1>연습할 발표를 선택하세요</h1>
                            <p>발표별로 D-day와 회차별 연습 결과를 따로 관리합니다.</p>
                        </div>
                        <button type="button" className="btn-primary" onClick={() => router.push("/presentations/new")}>
                            발표 추가
                        </button>
                    </section>

                    <section className="session-stat-grid">
                        <div className="session-stat">
                            <span>관리 중인 발표</span>
                            <strong>{stats.activeCount}</strong>
                        </div>
                        <div className="session-stat">
                            <span>누적 연습 횟수</span>
                            <strong>{stats.totalAttempts}</strong>
                        </div>
                    </section>

                    {error && <p className="session-error">{error}</p>}

                    {loadingPresentations ? (
                        <section className="session-empty">
                            <p>발표 목록을 불러오는 중입니다.</p>
                        </section>
                    ) : presentations.length === 0 ? (
                        <section className="session-empty">
                            <h2>아직 발표가 없습니다</h2>
                            <p>발표 추가를 눌러 주제, 예상 청중, D-day를 먼저 설정하세요.</p>
                        </section>
                    ) : (
                        <section className="presentation-grid">
                            {presentations.map((presentation) => (
                                <button
                                    key={presentation.id}
                                    type="button"
                                    className="presentation-card"
                                    onClick={() => router.push(`/presentations/${presentation.id}`)}
                                >
                                    <div className="presentation-card-top">
                                        <span className="presentation-dday">{ddayLabel(presentation.dday)}</span>
                                        <span className="presentation-date">{formatDate(presentation.dday)}</span>
                                    </div>
                                    <h2>{presentation.title || "발표"}</h2>
                                    <p>{presentation.topic || "주제 미입력"}</p>
                                    <div className="presentation-meta-row">
                                        <span>{presentation.audience || "청중 미정"}</span>
                                        <span>{presentation.attemptCount || 0}회 연습</span>
                                    </div>
                                    <div className="presentation-score-row">
                                        <span>최근 평균</span>
                                        <strong>{scoreLabel(presentation.latestScoreAverage)}</strong>
                                    </div>
                                </button>
                            ))}
                        </section>
                    )}
                </div>
            </main>
        </div>
    );
}
