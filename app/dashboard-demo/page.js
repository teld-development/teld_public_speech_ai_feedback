"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const CATEGORY_META = [
    { id: "content", label: "내용", color: "#2563eb" },
    { id: "organization", label: "조직", color: "#059669" },
    { id: "expression", label: "표현 및 전달", color: "#d97706" },
];

const GROWTH_CHART = {
    width: 360,
    height: 220,
    pad: { top: 24, right: 18, bottom: 38, left: 38 },
};

const DEMO_ATTEMPTS = [
    {
        id: "attempt-1",
        attemptNo: 1,
        sourceType: "영상 업로드",
        completedAt: "2026.06.02",
        scoreAverage: 3.1,
        categoryAverages: { content: 3.2, organization: 2.8, expression: 3.3 },
        reflectionScore: 3.0,
        reflectionFields: {
            keep: "도입에서 발표 목적을 먼저 말한 점은 좋았다.",
            improve: "본론으로 넘어갈 때 연결 문장이 부족해서 흐름이 끊겼다.",
            next: "소주제마다 전환 문장을 한 문장씩 미리 적어두고 연습하기.",
        },
    },
    {
        id: "attempt-2",
        attemptNo: 2,
        sourceType: "시뮬레이션",
        completedAt: "2026.06.09",
        scoreAverage: 3.6,
        categoryAverages: { content: 3.6, organization: 3.4, expression: 3.7 },
        reflectionScore: 3.5,
        reflectionFields: {
            keep: "사례를 붙여 설명하니 청중이 이해하기 쉬운 느낌이었다.",
            improve: "결론에서 핵심 메시지를 다시 묶는 문장이 아직 약하다.",
            next: "마지막 30초 결론만 따로 녹화하고 핵심 문장 2개로 줄이기.",
        },
    },
    {
        id: "attempt-3",
        attemptNo: 3,
        sourceType: "영상 업로드",
        completedAt: "2026.06.16",
        scoreAverage: 4.0,
        categoryAverages: { content: 4.1, organization: 3.8, expression: 4.0 },
        reflectionScore: 4.0,
        reflectionFields: {
            keep: "도입-전개-마무리 구조가 훨씬 분명해졌다.",
            improve: "중요한 결론 문장에서 억양 변화가 더 필요하다.",
            next: "결론 문장만 속도를 늦추고 마지막 단어에 힘을 싣는 연습하기.",
        },
    },
];

const REFLECTION_LABELS = {
    keep: "유지할 점",
    improve: "바꿀 점",
    next: "다음 실행",
};

function formatScore(value) {
    return typeof value === "number" ? value.toFixed(1) : "-";
}

function scoreToChartY(score) {
    const clamped = Math.max(1, Math.min(5, Number(score) || 1));
    const chartHeight = GROWTH_CHART.height - GROWTH_CHART.pad.top - GROWTH_CHART.pad.bottom;
    return GROWTH_CHART.pad.top + ((5 - clamped) / 4) * chartHeight;
}

function buildSeries(attempts) {
    return CATEGORY_META.map((category) => {
        const points = attempts.map((attempt, index) => {
            const x = attempts.length === 1
                ? GROWTH_CHART.pad.left + (GROWTH_CHART.width - GROWTH_CHART.pad.left - GROWTH_CHART.pad.right) / 2
                : GROWTH_CHART.pad.left + ((GROWTH_CHART.width - GROWTH_CHART.pad.left - GROWTH_CHART.pad.right) * index) / (attempts.length - 1);
            const score = attempt.categoryAverages[category.id];
            return {
                attemptNo: attempt.attemptNo,
                score,
                x,
                y: scoreToChartY(score),
            };
        });

        return {
            category,
            points,
            polyline: points.map((point) => `${point.x},${point.y}`).join(" "),
        };
    });
}

function CategoryIcon({ categoryId }) {
    const commonProps = {
        width: 18,
        height: 18,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": "true",
    };

    if (categoryId === "organization") {
        return (
            <span className="category-average-icon">
                <svg {...commonProps}>
                    <circle cx="12" cy="12" r="9" />
                    <path d="m15.5 8.5-2.2 5-4.8 2 2.2-5 4.8-2Z" />
                    <circle cx="12" cy="12" r="1" />
                </svg>
            </span>
        );
    }

    if (categoryId === "expression") {
        return (
            <span className="category-average-icon">
                <svg {...commonProps}>
                    <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                    <path d="M12 18v3" />
                    <path d="M8 21h8" />
                </svg>
            </span>
        );
    }

    return (
        <span className="category-average-icon">
            <svg {...commonProps}>
                <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H7a3 3 0 0 0-3 3V5.5Z" />
                <path d="M4 19a3 3 0 0 1 3-3h13" />
                <path d="M8 7h8" />
                <path d="M8 11h6" />
            </svg>
        </span>
    );
}

export default function DashboardDemoPage() {
    const [activeRecordTab, setActiveRecordTab] = useState("scores");
    const attemptsAsc = useMemo(() => [...DEMO_ATTEMPTS].sort((a, b) => a.attemptNo - b.attemptNo), []);
    const attemptsDesc = useMemo(() => [...DEMO_ATTEMPTS].sort((a, b) => b.attemptNo - a.attemptNo), []);
    const latestAttempt = attemptsDesc[0];
    const growthSeries = useMemo(() => buildSeries(attemptsAsc), [attemptsAsc]);
    const recentCategoryAverages = useMemo(() => {
        return CATEGORY_META.reduce((acc, category) => {
            const scores = attemptsAsc.map((attempt) => attempt.categoryAverages[category.id]).filter((score) => typeof score === "number");
            acc[category.id] = scores.reduce((sum, score) => sum + score, 0) / Math.max(scores.length, 1);
            return acc;
        }, {});
    }, [attemptsAsc]);

    return (
        <div className="db-layout dashboard-demo-page">
            <header className="db-topbar">
                <div className="db-topbar-brand">
                    <img src="/logo.png" alt="Logo" className="db-topbar-logo" />
                    <span className="db-topbar-title">AI 발표 피드백 시스템</span>
                </div>
                <div className="db-topbar-right">
                    <Link className="db-account-btn dashboard-demo-link" href="/analysis/feedback_reflection_demo">
                        피드백 데모 보기
                    </Link>
                </div>
            </header>

            <main className="db-main">
                <div className="session-home dashboard-demo-home">
                    <section className="dashboard-hero dashboard-demo-hero" aria-label="AI 발표 피드백 대시보드 데모">
                        <img src="/images/dashboard-banner.png" alt="" />
                        <div className="dashboard-hero-content">
                            <p className="session-eyebrow">데모 대시보드</p>
                            <h1>누적 발표 기록</h1>
                            <p>3회차 발표 분석과 학생 성찰이 함께 쌓였을 때 보이는 대시보드 예시입니다.</p>
                        </div>
                    </section>

                    <section className="session-list-heading">
                        <div>
                            <p>내 발표 세션</p>
                            <h2>진행 중인 발표</h2>
                        </div>
                    </section>

                    <section className="presentation-grid dashboard-demo-presentation-grid">
                        <article className="presentation-card dashboard-demo-presentation-card">
                            <div className="presentation-card-top">
                                <div className="presentation-badge-row">
                                    <span className="presentation-dday">D+2</span>
                                    <span className="presentation-state">분석 있음</span>
                                </div>
                                <span className="presentation-date">2026.06.14</span>
                            </div>
                            <h2>생성형 AI의 수업 활용 발표</h2>
                            <p>예상 청중에게 생성형 AI 활용의 가능성과 주의점을 설명하는 3분 발표입니다.</p>
                            <div className="presentation-score-row">
                                <span>최근 평균</span>
                                <strong>{formatScore(latestAttempt.scoreAverage)}/5</strong>
                            </div>
                            <div className="attempt-reflection-preview dashboard-demo-card-reflection">
                                <div className="attempt-reflection-head">
                                    <span>{latestAttempt.attemptNo}회차 성찰</span>
                                    <i>자기평가 {formatScore(latestAttempt.reflectionScore)}/5</i>
                                </div>
                                <div className="attempt-reflection-grid">
                                    {Object.entries(REFLECTION_LABELS).map(([key, label]) => (
                                        <div key={key} className="attempt-reflection-item">
                                            <strong>{label}</strong>
                                            <p>{latestAttempt.reflectionFields[key]}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="presentation-meta-row">
                                <span>중학교 2학년 학생</span>
                                <span className="presentation-open-label">누적 기록 확인</span>
                            </div>
                        </article>
                    </section>

                    <section className="session-summary-grid dashboard-demo-summary-grid">
                        <div className="session-summary-card">
                            <span>D-day</span>
                            <strong>2026.06.14</strong>
                        </div>
                        <div className="session-summary-card">
                            <span>예상 청중</span>
                            <strong>중학교 2학년</strong>
                        </div>
                        <div className="session-summary-card">
                            <span>분석 완료</span>
                            <strong>{DEMO_ATTEMPTS.length}회</strong>
                        </div>
                        <div className="session-summary-card">
                            <span>최근 평균</span>
                            <strong>{formatScore(latestAttempt.scoreAverage)}/5</strong>
                        </div>
                    </section>

                    <section className="session-panel">
                        <div className="session-panel-header">
                            <h2>회차별 연습 기록</h2>
                            <span>{attemptsDesc.length}개 회차</span>
                        </div>
                        <div className="attempt-list">
                            {attemptsDesc.map((attempt) => (
                                <div key={attempt.id} className="attempt-row attempt-row-success dashboard-demo-attempt-row">
                                    <div className="attempt-row-top">
                                        <div className="attempt-row-main">
                                            <div>
                                                <strong>{attempt.attemptNo}회차</strong>
                                                <span>{attempt.sourceType}</span>
                                            </div>
                                            <div className="attempt-status-block">
                                                <span className="attempt-status-badge attempt-status-success">분석 완료</span>
                                                <strong>{formatScore(attempt.scoreAverage)}/5</strong>
                                                <span>{attempt.completedAt}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="attempt-reflection-preview dashboard-demo-attempt-reflection">
                                        <div className="attempt-reflection-head">
                                            <span>성찰 노트</span>
                                            <i>자기평가 {formatScore(attempt.reflectionScore)}/5</i>
                                        </div>
                                        <div className="attempt-reflection-grid">
                                            {Object.entries(REFLECTION_LABELS).map(([key, label]) => (
                                                <div key={key} className="attempt-reflection-item">
                                                    <strong>{label}</strong>
                                                    <p>{attempt.reflectionFields[key]}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="session-panel">
                        <div className="session-record-tabs" role="tablist" aria-label="회차 기록 보기">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={activeRecordTab === "scores"}
                                className={activeRecordTab === "scores" ? "active" : ""}
                                onClick={() => setActiveRecordTab("scores")}
                            >
                                점수 기록
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={activeRecordTab === "reflections"}
                                className={activeRecordTab === "reflections" ? "active" : ""}
                                onClick={() => setActiveRecordTab("reflections")}
                            >
                                성찰기록
                            </button>
                        </div>

                        {activeRecordTab === "scores" ? (
                            <div className="record-tab-panel" role="tabpanel">
                                <div className="session-panel-header">
                                    <h2>영역별 성장곡선</h2>
                                    <span>{attemptsAsc.length}개 점수 산출</span>
                                </div>
                                <div className="growth-card-grid">
                                    {growthSeries.map((series) => (
                                        <article key={series.category.id} className="growth-card">
                                            <header className="growth-card-header">
                                                <div>
                                                    <CategoryIcon categoryId={series.category.id} />
                                                    <strong>{series.category.label}</strong>
                                                </div>
                                                <span>
                                                    최근 3회 평균
                                                    <b>{formatScore(recentCategoryAverages[series.category.id])}/5</b>
                                                </span>
                                            </header>
                                            <div className="growth-chart-wrap growth-chart-wrap-compact">
                                                <svg
                                                    className="growth-chart growth-chart-compact"
                                                    viewBox={`0 0 ${GROWTH_CHART.width} ${GROWTH_CHART.height}`}
                                                    role="img"
                                                    aria-label={`${series.category.label} 영역 회차별 평균 성장곡선`}
                                                >
                                                    {[1, 2, 3, 4, 5].map((score) => {
                                                        const y = scoreToChartY(score);
                                                        return (
                                                            <g key={score}>
                                                                <line
                                                                    x1={GROWTH_CHART.pad.left}
                                                                    y1={y}
                                                                    x2={GROWTH_CHART.width - GROWTH_CHART.pad.right}
                                                                    y2={y}
                                                                    className="growth-grid-line"
                                                                />
                                                                <text x={GROWTH_CHART.pad.left - 18} y={y + 4} className="growth-axis-label">{score}</text>
                                                            </g>
                                                        );
                                                    })}
                                                    {attemptsAsc.map((attempt, index) => {
                                                        const x = attemptsAsc.length === 1
                                                            ? GROWTH_CHART.pad.left + (GROWTH_CHART.width - GROWTH_CHART.pad.left - GROWTH_CHART.pad.right) / 2
                                                            : GROWTH_CHART.pad.left + ((GROWTH_CHART.width - GROWTH_CHART.pad.left - GROWTH_CHART.pad.right) * index) / (attemptsAsc.length - 1);
                                                        return (
                                                            <text key={attempt.id} x={x} y={GROWTH_CHART.height - 12} textAnchor="middle" className="growth-axis-label">
                                                                {attempt.attemptNo}회
                                                            </text>
                                                        );
                                                    })}
                                                    <polyline
                                                        points={series.polyline}
                                                        className="growth-line"
                                                        style={{ stroke: series.category.color }}
                                                    />
                                                    {series.points.map((point) => (
                                                        <circle
                                                            key={`${series.category.id}-${point.attemptNo}`}
                                                            cx={point.x}
                                                            cy={point.y}
                                                            r="5"
                                                            className="growth-point"
                                                            style={{ stroke: series.category.color }}
                                                        >
                                                            <title>{`${series.category.label} ${point.attemptNo}회차 ${point.score.toFixed(1)}/5`}</title>
                                                        </circle>
                                                    ))}
                                                </svg>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="record-tab-panel" role="tabpanel">
                                <div className="session-panel-header">
                                    <h2>성찰기록</h2>
                                    <span>{attemptsDesc.length}개 회차</span>
                                </div>
                                <div className="reflection-record-list">
                                    {attemptsDesc.map((attempt) => (
                                        <article key={attempt.id} className="reflection-record-card reflection-record-card-success">
                                            <div className="reflection-record-head">
                                                <div>
                                                    <strong>{attempt.attemptNo}회차</strong>
                                                    <span>{attempt.sourceType} · {attempt.completedAt}</span>
                                                </div>
                                                <div>
                                                    <span className="attempt-status-badge attempt-status-success">분석 완료</span>
                                                    <b className="dashboard-demo-reflection-score">자기평가 {formatScore(attempt.reflectionScore)}/5</b>
                                                </div>
                                            </div>
                                            <div className="attempt-reflection-grid reflection-record-grid">
                                                {Object.entries(REFLECTION_LABELS).map(([key, label]) => (
                                                    <div key={key} className="attempt-reflection-item">
                                                        <strong>{label}</strong>
                                                        <p>{attempt.reflectionFields[key]}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            </main>
        </div>
    );
}
