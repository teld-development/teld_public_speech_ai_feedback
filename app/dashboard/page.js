"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FEEDBACK_CATEGORIES } from "../lib/feedbackAreas";

// 더미 피드백: 항목별 최근 피드백 텍스트
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
    const [accountMenuOpen, setAccountMenuOpen] = useState(false);

    const handleLogout = () => {
        router.push("/");
    };

    return (
        <div className="dashboard-v2">
            <header className="topbar-v2">
                <div className="topbar-left">
                    <img src="/logo.png" alt="Logo" className="topbar-logo" />
                    <h1 className="topbar-title">AI 발표 피드백 시스템</h1>
                </div>
                <div className="topbar-account">
                    <button
                        className="account-btn"
                        onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                    >
                        내 계정
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 9l6 6 6-6" />
                        </svg>
                    </button>
                    {accountMenuOpen && (
                        <div className="account-dropdown">
                            <button onClick={handleLogout}>로그아웃</button>
                        </div>
                    )}
                </div>
            </header>

            <main className="dashboard-content-v2">
                <section className="feature-cards">
                    <div className="feature-card primary-card" onClick={() => router.push("/prepare")}>
                        <div className="card-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <polygon points="23 7 16 12 23 17 23 7" />
                                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                            </svg>
                        </div>
                        <div className="card-content">
                            <h3>발표 영상 분석하기</h3>
                            <p>발표 영상을 업로드하고 AI 피드백을 받아보세요</p>
                        </div>
                        <div className="card-arrow">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                        </div>
                    </div>

                    <div className="feedback-areas-grid">
                        <div className="feedback-areas-header">
                            <h3>📋 영역별 최근 피드백</h3>
                            <span className="last-updated">최근 분석: 2026.04.10</span>
                        </div>

                        {FEEDBACK_CATEGORIES.map((cat) => (
                            <div key={cat.id} className="feedback-category-block">
                                <div className="feedback-category-title">
                                    <span className="category-icon">{cat.icon}</span>
                                    <div>
                                        <h4>{cat.label}</h4>
                                        <span className="category-short">{cat.shortLabel}</span>
                                    </div>
                                </div>
                                <div className="areas-grid-v2">
                                    {cat.items.map((item) => (
                                        <div key={item.id} className="area-feedback-card">
                                            <div className="area-header">
                                                <span className="area-name-v2">{item.label}</span>
                                            </div>
                                            <p className="area-feedback-text">{DUMMY_FEEDBACK[item.id]}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </main>
        </div>
    );
}
