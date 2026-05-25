"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { useAuth } from "../lib/AuthProvider";
import { deletePresentationSession } from "../lib/presentations";
import PresentationSessionForm from "../components/PresentationSessionForm";

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

function sessionStateLabel(presentation) {
    if (presentation.status === "archived") return "보관됨";
    if (typeof presentation.latestScoreAverage === "number") return "분석 있음";
    return "준비 중";
}

export default function DashboardPage() {
    const router = useRouter();
    const { user, authLoading } = useAuth();
    const [accountMenuOpen, setAccountMenuOpen] = useState(false);
    const [presentations, setPresentations] = useState([]);
    const [loadingPresentations, setLoadingPresentations] = useState(true);
    const [deletingPresentationId, setDeletingPresentationId] = useState("");
    const [sessionModal, setSessionModal] = useState(null);
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

    const visiblePresentations = useMemo(() => {
        return presentations.filter((item) => item.status !== "archived");
    }, [presentations]);

    const handleLogout = async () => {
        await signOut(auth);
        router.replace("/");
    };

    const openPresentation = (presentationId) => {
        router.push(`/presentations/${presentationId}`);
    };

    const openCreateModal = () => {
        setError("");
        setSessionModal({ mode: "create", presentation: null });
    };

    const openEditModal = (event, presentation) => {
        event.stopPropagation();
        setError("");
        setSessionModal({ mode: "edit", presentation });
    };

    const closeSessionModal = () => {
        setSessionModal(null);
    };

    const handleDeletePresentation = async (event, presentation) => {
        event.stopPropagation();
        if (!confirm(`"${presentation.title || "발표"}" 세션을 삭제하시겠습니까?`)) return;
        setDeletingPresentationId(presentation.id);
        try {
            await deletePresentationSession(user, presentation.id);
        } catch (err) {
            console.error("[Dashboard] 발표 삭제 실패:", err);
            setError("발표 세션을 삭제하지 못했습니다.");
        } finally {
            setDeletingPresentationId("");
        }
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
                    <section className="dashboard-hero" aria-label="AI 발표 피드백 대시보드">
                        <img src="/images/dashboard-banner.png" alt="" />
                        <div className="dashboard-hero-content">
                            <p className="session-eyebrow">연습하기</p>
                            <h1>발표를 준비하세요</h1>
                            <p>예정된 발표 날짜를 정하고, 그 날짜까지 AI와 함께 실력을 향상시켜보세요!</p>
                            <button type="button" className="btn-primary dashboard-hero-action" onClick={openCreateModal}>
                                발표 추가
                            </button>
                        </div>
                    </section>

                    <section className="session-list-heading">
                        <div>
                            <p>내 발표 세션</p>
                            <h2>진행 중인 발표</h2>
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
                    ) : visiblePresentations.length === 0 ? (
                        <section className="session-empty">
                            <h2>표시할 세션이 없습니다</h2>
                            <p>새 발표 세션을 추가해 연습을 시작하세요.</p>
                        </section>
                    ) : (
                        <section className="presentation-grid">
                            {visiblePresentations.map((presentation) => (
                                <div
                                    key={presentation.id}
                                    role="button"
                                    tabIndex={0}
                                    className="presentation-card"
                                    onClick={() => openPresentation(presentation.id)}
                                    onKeyDown={(event) => {
                                        if (event.target !== event.currentTarget) return;
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            openPresentation(presentation.id);
                                        }
                                    }}
                                >
                                    <div className="presentation-card-top">
                                        <div className="presentation-badge-row">
                                            <span className="presentation-dday">{ddayLabel(presentation.dday)}</span>
                                            <span className="presentation-state">{sessionStateLabel(presentation)}</span>
                                        </div>
                                        <span className="presentation-date">{formatDate(presentation.dday)}</span>
                                    </div>
                                    <h2>{presentation.title || "발표"}</h2>
                                    <p>{presentation.topic || "주제 미입력"}</p>
                                    <div className="presentation-meta-row">
                                        <span>{presentation.audience || "청중 미정"}</span>
                                        <span className="presentation-open-label">세션 열기</span>
                                    </div>
                                    <div className="presentation-card-actions">
                                        <button
                                            type="button"
                                            className="presentation-edit-btn"
                                            onClick={(event) => openEditModal(event, presentation)}
                                        >
                                            수정
                                        </button>
                                        <button
                                            type="button"
                                            className="presentation-delete-btn"
                                            onClick={(event) => handleDeletePresentation(event, presentation)}
                                            disabled={deletingPresentationId === presentation.id}
                                        >
                                            {deletingPresentationId === presentation.id ? "삭제 중" : "삭제"}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </section>
                    )}
                </div>
            </main>

            {sessionModal && (
                <div className="next-modal-backdrop" role="presentation" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) closeSessionModal();
                }}>
                    <section className="session-flow-modal session-edit-modal" role="dialog" aria-modal="true" aria-labelledby="presentation-session-modal-title">
                        <header className="session-flow-modal-header">
                            <div>
                                <p>{sessionModal.mode === "edit" ? "발표 정보 수정" : "발표 추가"}</p>
                                <h2 id="presentation-session-modal-title">
                                    {sessionModal.mode === "edit" ? "발표 세션 정보를 수정하세요" : "새 발표 세션을 추가하세요"}
                                </h2>
                            </div>
                            <button type="button" className="session-flow-close" onClick={closeSessionModal} title="닫기" aria-label="닫기">×</button>
                        </header>
                        <div className="session-flow-body">
                            <PresentationSessionForm
                                user={user}
                                mode={sessionModal.mode}
                                presentation={sessionModal.presentation}
                                formId={`dashboard-${sessionModal.mode}-${sessionModal.presentation?.id || "new"}`}
                                onCancel={closeSessionModal}
                                onSaved={(savedPresentation) => {
                                    closeSessionModal();
                                    if (sessionModal.mode === "create") {
                                        router.push(`/presentations/${savedPresentation.id}`);
                                    }
                                }}
                            />
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}
