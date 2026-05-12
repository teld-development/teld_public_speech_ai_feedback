"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "../lib/AuthProvider";
import { FEEDBACK_CATEGORIES } from "../lib/feedbackAreas";

const DUMMY_FEEDBACK = {
    eye_contact: "카메라 렌즈 응시가 전반적으로 양호합니다. 중요 포인트에서 더 길게 시선을 고정해보세요.",
    facial_expression: "설명 내용에 맞춰 자연스러운 미소와 눈썹 움직임이 나타납니다.",
    gesture: "프레임 내에서 손동작이 안정적입니다. 핵심 강조 시 더 분명한 제스처를 활용해보세요.",
    verbal_nonverbal_sync: "말의 강조점과 손동작의 타이밍이 잘 맞습니다.",
    audience_awareness: "청중 반응을 의식하는 고갯짓이 가끔 나타납니다. 조금 더 빈번하면 좋겠습니다.",
    no_distraction: "몸을 흔들거나 머리를 만지는 습관이 일부 관찰됩니다.",
    facing: "상체가 전반적으로 카메라 정면을 향해 있습니다.",
    prosody: "속도가 일정하여 안정적이나, 톤의 변화를 더 주면 몰입도가 올라갑니다.",
    language_choice: "전문 용어 사용이 적절합니다. 청중 수준에 맞춘 풀어쓰기를 병행해보세요.",
    audience_adaptation: "사전 준비된 스크립트 위주이며, 실시간 반응에 따른 조정은 제한적입니다.",
    media_interaction: "슬라이드 전환이 매끄럽습니다. 화면 공유 지연은 보이지 않습니다.",
    professional_appearance: "복장과 배경이 발표 맥락에 부합합니다.",
};

export default function DashboardPage() {
    const router = useRouter();
    const { user, authLoading } = useAuth();
    const [accountMenuOpen, setAccountMenuOpen] = useState(false);

    useEffect(() => {
        if (!authLoading && !user) {
            router.replace("/");
        }
    }, [authLoading, router, user]);

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
                <div className="db-inner">

                    <div className="db-welcome">
                        <h2>대시보드</h2>
                        <p>발표 영상을 업로드하고 12개 역량 항목에 대한 AI 피드백을 확인하세요</p>
                    </div>

                    <div className="db-cta" onClick={() => router.push("/prepare")}>
                        <div className="db-cta-icon">
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <polygon points="23 7 16 12 23 17 23 7" />
                                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                            </svg>
                        </div>
                        <div className="db-cta-text">
                            <h3>새 발표 영상 분석하기</h3>
                            <p>영상을 업로드하면 시각·음성·매체 역량을 종합 분석합니다</p>
                        </div>
                        <div className="db-cta-arrow">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                        </div>
                    </div>

                    <section className="db-feedback-section">
                        <div className="db-section-header">
                            <h3>최근 분석 결과</h3>
                            <span className="db-date-badge">2026.04.10</span>
                        </div>

                        {FEEDBACK_CATEGORIES.map((cat) => (
                            <div key={cat.id} className="db-category">
                                <div className="db-category-header">
                                    <span className="db-category-icon">{cat.icon}</span>
                                    <div className="db-category-meta">
                                        <span className="db-category-label">{cat.label}</span>
                                        <span className="db-category-short">{cat.shortLabel}</span>
                                    </div>
                                </div>
                                <div className="db-items">
                                    {cat.items.map((item) => (
                                        <div key={item.id} className="db-item">
                                            <div className="db-item-name">{item.label}</div>
                                            <p className="db-item-feedback">{DUMMY_FEEDBACK[item.id]}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </section>

                </div>
            </main>
        </div>
    );
}
