"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { useAuth } from "../lib/AuthProvider";
import { deletePresentationSession } from "../lib/presentations";
import PresentationSessionForm from "../components/PresentationSessionForm";
import "./dashboard.css";

const URGENT_DAYS = 3;

const FILTERS = [
    { id: "remaining", label: "남은 발표" },
    { id: "past", label: "지난 발표" },
    { id: "all", label: "전체" },
];

const FILTER_EMPTY_TEXT = {
    remaining: "남은 발표가 없습니다. 새 발표를 등록해 보세요.",
    past: "아직 지난 발표가 없습니다.",
};

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
});

function getDaysLeft(dday) {
    if (!dday) return null;
    const target = new Date(`${dday}T00:00:00`);
    if (Number.isNaN(target.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function ddayLabel(daysLeft) {
    if (daysLeft == null) return "D-day 미정";
    if (daysLeft === 0) return "D-day";
    if (daysLeft > 0) return `D-${daysLeft}`;
    return `D+${Math.abs(daysLeft)}`;
}

function ddayTone(daysLeft) {
    if (daysLeft == null || daysLeft < 0) return "is-muted";
    if (daysLeft <= URGENT_DAYS) return "is-urgent";
    return "";
}

function formatDate(dday) {
    if (!dday) return "";
    const date = new Date(`${dday}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "";
    return dateFormatter.format(date);
}

function formatScore(value) {
    return typeof value === "number" ? value.toFixed(1) : null;
}

function practiceLabel(attemptCount) {
    return attemptCount ? `연습 ${attemptCount}회` : "연습 전";
}

function PlusIcon({ size = 14 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            <path d="M7 2v10M2 7h10" />
        </svg>
    );
}

export default function DashboardPage() {
    const router = useRouter();
    const { user, authLoading } = useAuth();
    const accountRef = useRef(null);
    const [accountMenuOpen, setAccountMenuOpen] = useState(false);
    const [presentations, setPresentations] = useState([]);
    const [loadingPresentations, setLoadingPresentations] = useState(true);
    const [deletingPresentationId, setDeletingPresentationId] = useState("");
    const [sessionModal, setSessionModal] = useState(null);
    const [error, setError] = useState("");
    const [filter, setFilter] = useState("remaining");

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

    // 계정 메뉴는 바깥 클릭 · Esc 로 닫는다.
    useEffect(() => {
        if (!accountMenuOpen) return undefined;
        const handlePointerDown = (event) => {
            if (accountRef.current && !accountRef.current.contains(event.target)) setAccountMenuOpen(false);
        };
        const handleKeyDown = (event) => {
            if (event.key === "Escape") setAccountMenuOpen(false);
        };
        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [accountMenuOpen]);

    // 다가오는 발표(가까운 순) → 날짜 미정 → 지난 발표(최근 순)
    const { cards, remaining, past, nextUp } = useMemo(() => {
        const items = presentations
            .filter((item) => item.status !== "archived")
            .map((item) => ({ ...item, daysLeft: getDaysLeft(item.dday) }));

        const upcoming = items
            .filter((item) => item.daysLeft != null && item.daysLeft >= 0)
            .sort((a, b) => a.daysLeft - b.daysLeft);
        const undated = items.filter((item) => item.daysLeft == null);
        const past = items
            .filter((item) => item.daysLeft != null && item.daysLeft < 0)
            .sort((a, b) => b.daysLeft - a.daysLeft);

        return {
            cards: [...upcoming, ...undated, ...past],
            remaining: [...upcoming, ...undated],
            past,
            nextUp: upcoming[0] || null,
        };
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

    const accountLabel = user.email || "내 계정";
    const hasCards = cards.length > 0;
    const filteredCards = filter === "remaining" ? remaining : filter === "past" ? past : cards;
    const showAddCard = filter !== "past";

    const renderNextPanel = () => {
        if (nextUp) {
            const score = formatScore(nextUp.latestScoreAverage);
            return (
                <section className="dh-next" aria-label="가장 가까운 발표">
                    <span className="dh-next-dday">{ddayLabel(nextUp.daysLeft)}</span>
                    <div className="dh-next-body">
                        <span className="dh-next-label">가장 가까운 발표</span>
                        <h2 className="dh-next-title">{nextUp.title || "발표"}</h2>
                        <p className="dh-next-meta">
                            <span>{formatDate(nextUp.dday)}</span>
                            {nextUp.audience && <span>{nextUp.audience}</span>}
                            <span>{practiceLabel(nextUp.attemptCount)}</span>
                            {score && <span>최근 {score}/5</span>}
                        </p>
                    </div>
                    <button type="button" className="dh-btn-light" onClick={() => openPresentation(nextUp.id)}>
                        {nextUp.attemptCount ? "이어서 연습" : "연습 시작"}
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M2.5 7h9M8 3.5 11.5 7 8 10.5" />
                        </svg>
                    </button>
                </section>
            );
        }

        if (hasCards) {
            return (
                <section className="dh-next is-blank" aria-label="가장 가까운 발표">
                    <div className="dh-next-body">
                        <span className="dh-next-label">가장 가까운 발표</span>
                        <h2 className="dh-next-title">예정된 발표가 없습니다</h2>
                        <p className="dh-next-meta">
                            <span>새 발표를 등록하거나, 기존 발표에 날짜를 정하면 여기에 D-day가 표시됩니다.</span>
                        </p>
                    </div>
                    <button type="button" className="dh-btn-light" onClick={openCreateModal}>새 발표 등록</button>
                </section>
            );
        }

        return (
            <section className="dh-next is-blank" aria-label="시작하기">
                <div className="dh-next-body">
                    <span className="dh-next-label">시작하기</span>
                    <h2 className="dh-next-title">첫 발표를 등록해 보세요</h2>
                    <p className="dh-next-meta">
                        <span>주제와 발표 날짜를 등록하면 D-day, 연습 기록, AI 피드백 점수가 이곳에 쌓입니다.</span>
                    </p>
                </div>
                <button type="button" className="dh-btn-light" onClick={openCreateModal}>첫 발표 등록</button>
            </section>
        );
    };

    const renderCard = (presentation) => {
        const title = presentation.title || "발표";
        const score = formatScore(presentation.latestScoreAverage);
        const deleting = deletingPresentationId === presentation.id;
        const isPast = presentation.daysLeft != null && presentation.daysLeft < 0;
        const date = formatDate(presentation.dday);

        return (
            <li key={presentation.id}>
                <div
                    role="button"
                    tabIndex={0}
                    className={`dh-card${isPast ? " is-past" : ""}${deleting ? " is-deleting" : ""}`}
                    onClick={() => openPresentation(presentation.id)}
                    onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openPresentation(presentation.id);
                        }
                    }}
                >
                    <div className="dh-card-top">
                        <span className={`dh-dday ${ddayTone(presentation.daysLeft)}`}>{ddayLabel(presentation.daysLeft)}</span>
                        {date && <span className="dh-card-date">{date}</span>}
                    </div>

                    <div className="dh-card-actions">
                        <button
                            type="button"
                            className="dh-icon-btn"
                            aria-label={`${title} 정보 수정`}
                            title="정보 수정"
                            onClick={(event) => openEditModal(event, presentation)}
                        >
                            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M10.6 2.9l2.5 2.5M2.8 13.2l.6-3 7.6-7.6a1 1 0 0 1 1.4 0l1 1a1 1 0 0 1 0 1.4l-7.6 7.6-3 .6z" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            className="dh-icon-btn is-danger"
                            aria-label={`${title} 삭제`}
                            title="삭제"
                            disabled={deleting}
                            onClick={(event) => handleDeletePresentation(event, presentation)}
                        >
                            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M2.8 4.2h10.4M6.2 4.2V2.8h3.6v1.4M4.2 4.2l.6 9h6.4l.6-9M6.6 6.8v4M9.4 6.8v4" />
                            </svg>
                        </button>
                    </div>

                    <h3 className="dh-card-title">{title}</h3>
                    <p className="dh-card-topic">{presentation.topic || "주제 미입력"}</p>
                    <div className="dh-card-spacer" />

                    <div className="dh-card-foot">
                        <span className="dh-meta">
                            <span>{presentation.audience || "청중 미정"}</span>
                            <span>{practiceLabel(presentation.attemptCount)}</span>
                        </span>
                        {score ? (
                            <span className="dh-score">{score}<small>/5</small></span>
                        ) : (
                            <span className="dh-score is-empty">점수 없음</span>
                        )}
                    </div>
                </div>
            </li>
        );
    };

    return (
        <>
            <div className="dh">
                <header className="dh-topbar">
                    <div className="dh-wrap">
                        <div className="dh-brand">
                            <img src="/logo.png" alt="" />
                            <span>AI 발표 피드백 시스템</span>
                        </div>
                        <div className="dh-account" ref={accountRef}>
                            <button
                                type="button"
                                className="dh-account-btn"
                                aria-haspopup="menu"
                                aria-expanded={accountMenuOpen}
                                onClick={() => setAccountMenuOpen((open) => !open)}
                            >
                                <span className="dh-avatar" aria-hidden="true">{accountLabel.charAt(0).toUpperCase()}</span>
                                <span className="dh-account-email">{accountLabel}</span>
                            </button>
                            {accountMenuOpen && (
                                <div className="dh-account-menu" role="menu">
                                    <button type="button" role="menuitem" onClick={handleLogout}>로그아웃</button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <main className="dh-wrap dh-page">
                    <div className="dh-top">
                        <div className="dh-top-row">
                            <h1>
                                내 발표
                                {!loadingPresentations && hasCards && <span>{cards.length}</span>}
                            </h1>
                            <button type="button" className="dh-btn-primary" onClick={openCreateModal}>
                                <PlusIcon />
                                새 발표
                            </button>
                        </div>

                        {error && <p className="dh-error" role="alert">{error}</p>}

                        {loadingPresentations ? (
                            <div className="dh-skeleton is-panel" aria-label="발표 목록을 불러오는 중" />
                        ) : (
                            renderNextPanel()
                        )}
                    </div>

                    {loadingPresentations ? (
                        <ul className="dh-grid" aria-hidden="true">
                            <li><div className="dh-skeleton" /></li>
                            <li><div className="dh-skeleton" /></li>
                            <li><div className="dh-skeleton" /></li>
                        </ul>
                    ) : hasCards && (
                        <section className="dh-list" aria-label="발표 목록">
                            <div className="dh-filter" role="tablist" aria-label="발표 필터">
                                {FILTERS.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={filter === item.id}
                                        className="dh-filter-btn"
                                        onClick={() => setFilter(item.id)}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>

                            {filteredCards.length === 0 && !showAddCard ? (
                                <p className="dh-filter-empty">{FILTER_EMPTY_TEXT[filter]}</p>
                            ) : (
                                <ul className="dh-grid">
                                    {filteredCards.map(renderCard)}
                                    {showAddCard && (
                                        <li>
                                            <button type="button" className="dh-card-add" onClick={openCreateModal}>
                                                <span className="dh-card-add-plus"><PlusIcon size={16} /></span>
                                                새 발표 추가
                                            </button>
                                        </li>
                                    )}
                                </ul>
                            )}
                        </section>
                    )}
                </main>
            </div>

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
        </>
    );
}
