"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FeedbackCategoryIcon } from "../components/FeedbackAreaIcons";

const VIDEO_URL = "https://firebasestorage.googleapis.com/v0/b/public-speech-feedback.firebasestorage.app/o/recordings%2FPOZ5a41bw2dkXMkdwj6VRtqk0pq2%2Fpresentations%2F6FN9JPhjIBGqnYAep9Ku%2Fattempts%2FMJuO5yhJuUeCt8gpjNe8%2Fraw%2Fsimulation_559132.mp4?alt=media&token=3b56de6c-40e9-4e22-aec1-3ed68109ab94";

const PRESENTATION_SLIDES = [
    { page: 1, seconds: 0, time: "00:00", imageUrl: "https://firebasestorage.googleapis.com/v0/b/public-speech-feedback.firebasestorage.app/o/users%2FPOZ5a41bw2dkXMkdwj6VRtqk0pq2%2Fsimulations%2F559132%2Fslides%2Fslide_001.png?alt=media&token=605a1ee1-c446-44f1-8142-7ec758017c4d" },
    { page: 2, seconds: 31.388916015625, time: "00:31", imageUrl: "https://firebasestorage.googleapis.com/v0/b/public-speech-feedback.firebasestorage.app/o/users%2FPOZ5a41bw2dkXMkdwj6VRtqk0pq2%2Fsimulations%2F559132%2Fslides%2Fslide_002.png?alt=media&token=78430da3-555d-490a-8dc9-7a9459885db9" },
    { page: 3, seconds: 49.27777099609375, time: "00:49", imageUrl: "https://firebasestorage.googleapis.com/v0/b/public-speech-feedback.firebasestorage.app/o/users%2FPOZ5a41bw2dkXMkdwj6VRtqk0pq2%2Fsimulations%2F559132%2Fslides%2Fslide_003.png?alt=media&token=8142b427-a65f-454f-9463-9c05623627d0" },
    { page: 4, seconds: 167.8402099609375, time: "02:47", imageUrl: "https://firebasestorage.googleapis.com/v0/b/public-speech-feedback.firebasestorage.app/o/users%2FPOZ5a41bw2dkXMkdwj6VRtqk0pq2%2Fsimulations%2F559132%2Fslides%2Fslide_004.png?alt=media&token=3d726c44-5884-4525-86ec-a9c18bb386e2" },
    { page: 5, seconds: 220.15948486328125, time: "03:40", imageUrl: "https://firebasestorage.googleapis.com/v0/b/public-speech-feedback.firebasestorage.app/o/users%2FPOZ5a41bw2dkXMkdwj6VRtqk0pq2%2Fsimulations%2F559132%2Fslides%2Fslide_005.png?alt=media&token=469c0575-64d3-4033-839e-912ff33861e6" },
    { page: 6, seconds: 323.24273681640625, time: "05:23", imageUrl: "https://firebasestorage.googleapis.com/v0/b/public-speech-feedback.firebasestorage.app/o/users%2FPOZ5a41bw2dkXMkdwj6VRtqk0pq2%2Fsimulations%2F559132%2Fslides%2Fslide_006.png?alt=media&token=53a5c5e5-e5bc-4d75-b1bc-05d5ac018222" },
    { page: 7, seconds: 424.0067138671875, time: "07:04", imageUrl: "https://firebasestorage.googleapis.com/v0/b/public-speech-feedback.firebasestorage.app/o/users%2FPOZ5a41bw2dkXMkdwj6VRtqk0pq2%2Fsimulations%2F559132%2Fslides%2Fslide_007.png?alt=media&token=68b6c1de-b857-4169-bb56-ae8796757a66" },
    { page: 8, seconds: 449.4024658203125, time: "07:29", imageUrl: "https://firebasestorage.googleapis.com/v0/b/public-speech-feedback.firebasestorage.app/o/users%2FPOZ5a41bw2dkXMkdwj6VRtqk0pq2%2Fsimulations%2F559132%2Fslides%2Fslide_008.png?alt=media&token=21580635-85fa-43b1-b252-cef84794cf99" },
    { page: 9, seconds: 497.59686279296875, time: "08:17", imageUrl: "https://firebasestorage.googleapis.com/v0/b/public-speech-feedback.firebasestorage.app/o/users%2FPOZ5a41bw2dkXMkdwj6VRtqk0pq2%2Fsimulations%2F559132%2Fslides%2Fslide_009.png?alt=media&token=a1762d2b-fa76-4706-b50c-e70bde8f3005" },
    { page: 10, seconds: 567.4302978515625, time: "09:27", imageUrl: "https://firebasestorage.googleapis.com/v0/b/public-speech-feedback.firebasestorage.app/o/users%2FPOZ5a41bw2dkXMkdwj6VRtqk0pq2%2Fsimulations%2F559132%2Fslides%2Fslide_010.png?alt=media&token=c3d9f1ce-b8fe-4751-b52d-918db48a454c" },
    { page: 11, seconds: 607.874755859375, time: "10:07", imageUrl: "https://firebasestorage.googleapis.com/v0/b/public-speech-feedback.firebasestorage.app/o/users%2FPOZ5a41bw2dkXMkdwj6VRtqk0pq2%2Fsimulations%2F559132%2Fslides%2Fslide_011.png?alt=media&token=334928fe-2213-4d75-8b2c-b8195419f307" },
];

const FEEDBACK = [
    {
        id: "content-claim",
        categoryId: "content",
        subarea: "발표 내용의 적절성",
        area: "내용",
        title: "연구 질문과 분석 범위",
        time: "00:49",
        seconds: 49,
        summary: "EF EPI 순위에서 두 연구 질문으로 넘어가지만, 순위 자료와 관사 오류 분석의 연결이 설명되지 않아 연구의 출발점이 약합니다.",
        evidence: "EF EPI는 읽기와 듣기 시험이라 발화 자료와 직접 비교하기 어렵다고 밝힌 직후, 두 집단의 관사 사용 질문으로 넘어갑니다.",
        rationale: "비교가 어려운 통계를 제시한 이유와 뒤의 발화 분석에서 확인할 변수를 연결하지 않아, 청중은 순위 자료가 연구 설계에서 어떤 역할을 하는지 판단하기 어렵습니다.",
        suggestion: "순위 자료 뒤에 ‘이 수치는 사례 선정의 출발점이며, 이후에는 관사 정확도와 오류 유형만 비교하겠습니다’라고 분석 범위를 명시하세요.",
    },
    {
        id: "content-example",
        categoryId: "content",
        subarea: "사례와 예시의 적절성",
        area: "내용",
        title: "발화 사례의 분석 기준",
        time: "05:23",
        seconds: 323,
        summary: "여러 발화 사례를 빠르게 나열해 각 표현이 왜 누락, 과잉, 대치에 해당하는지 판단 기준이 충분히 드러나지 않습니다.",
        evidence: "‘Hollywood movie’, ‘movies from United States’, ‘a some kind of world’를 연달아 제시하고 정답 표현과 오류 유형을 짧게 설명합니다.",
        rationale: "원문, 수정 표현, 오류 판정 기준이 같은 형식으로 제시되지 않아 사례 간 차이를 비교하기 어렵습니다.",
        suggestion: "각 사례를 ‘원문 → 수정 표현 → 오류 유형 → 판정 이유’의 네 단계로 통일하고, 집단별 대표 사례는 두 개만 설명하세요.",
    },
    {
        id: "organization-opening",
        categoryId: "organization",
        subarea: "발표 구조의 완결성",
        area: "조직",
        title: "목차와 논증 흐름의 연결",
        time: "00:31",
        seconds: 31,
        summary: "다섯 개 목차를 제시하지만 각 단계가 다음 단계로 이어지는 이유를 설명하지 않아 발표의 논증 흐름이 목록 수준에 머뭅니다.",
        evidence: "연구 주제, 이론적 배경, 자료 분석, 결과 해석, 결론을 차례로 읽은 뒤 바로 연구 주제로 넘어갑니다.",
        rationale: "목차 이름만으로는 이론이 분석 기준이 되고 자료가 결론으로 이어지는 관계가 드러나지 않습니다.",
        suggestion: "목차 뒤에 ‘모국어 전이 개념을 기준으로 실제 발화를 분석한 뒤, 오류의 양과 유형을 나누어 해석하겠습니다’라는 흐름 안내 문장을 추가하세요.",
    },
    {
        id: "organization-closing",
        categoryId: "organization",
        subarea: "단락 간 연결의 유기성",
        area: "조직",
        title: "분석 결과와 결론의 연결",
        time: "09:27",
        seconds: 567,
        summary: "두 연구 질문에 답한 뒤 제시하는 최종 시사점이 앞선 분석 결과와 직접 연결되지 않아 별도의 주장처럼 들립니다.",
        evidence: "관사 정확도와 누락 오류를 각각 정리한 뒤 ‘언어적 거리는 제2언어 습득의 한계를 규정하지 않는다’는 문장으로 마무리합니다.",
        rationale: "정확도 차이, 공통 오류 유형, 교육적 시사점의 인과 관계를 묶지 않아 청중이 최종 결론의 근거를 다시 추론해야 합니다.",
        suggestion: "결론을 ‘정확도 차이 → 공통 누락 유형 → 언어적 거리는 오류 위치를 설명하지만 습득 한계는 결정하지 않음’의 세 문장으로 정리하세요.",
    },
    {
        id: "delivery-eye",
        categoryId: "expression",
        subarea: "비언어적 표현의 효과적 활용",
        area: "표현 및 전달",
        title: "핵심 전환의 시각적 강조",
        time: "03:40",
        seconds: 220,
        summary: "표정과 고개 움직임이 거의 일정해, 분석 방법의 핵심인 ‘오류 개수가 아니라 반복 유형’이라는 전환이 시각적으로 구분되지 않습니다.",
        evidence: "의무적 맥락 분석과 세 오류 유형을 설명하는 동안 얼굴 방향과 자세가 동일하게 유지됩니다.",
        rationale: "정보의 중요도가 바뀌는 지점에도 비언어 표현이 같아 청중이 핵심 기준과 세부 설명을 구분하기 어렵습니다.",
        suggestion: "‘핵심은 오류의 개수가 아니라 유형입니다’라고 말하기 전 1초 멈추고, 정면을 본 상태에서 고개를 가볍게 들어 문장을 강조하세요.",
    },
    {
        id: "delivery-voice",
        categoryId: "expression",
        subarea: "준언어적 표현의 효과적 활용",
        area: "표현 및 전달",
        title: "핵심 해석의 음성 강조",
        time: "08:17",
        seconds: 497,
        summary: "폴란드어, 핀란드어, 한국어의 한정성 표시 방식을 같은 속도와 강세로 이어 말해 세부 비교와 최종 해석의 위계가 들리지 않습니다.",
        evidence: "세 언어의 차이를 연이어 설명한 뒤 핵심 정리 문장까지 같은 속도와 강세로 이어갑니다.",
        rationale: "세 언어 설명과 결론 문장의 음성 패턴이 같아 청중이 반드시 기억해야 할 해석을 구분하기 어렵습니다.",
        suggestion: "‘정리하면’ 앞에서 1초 멈추고, ‘한정성에 가까운 장치’와 ‘한 번 더 생각해야’ 두 구절은 속도를 늦추고 강세를 주세요.",
    },
];

const CATEGORY_META = [
    { id: "content", label: "내용" },
    { id: "organization", label: "조직" },
    { id: "expression", label: "표현 및 전달" },
];

const DECISION_OPTIONS = [
    { id: "apply", label: "다음 발표에 반영", shortLabel: "반영", description: "다음 발표의 실천 계획으로 가져갑니다." },
    { id: "review", label: "검토 필요", shortLabel: "검토 필요", description: "AI 코치와 근거를 더 논의합니다." },
    { id: "dismiss", label: "다음 발표에 미반영", shortLabel: "미반영", description: "이유를 남기고 이번 계획에서 제외합니다." },
];

const INITIAL_MESSAGES = Object.fromEntries(
    FEEDBACK.map((item) => [
        item.id,
        [{
            id: `${item.id}-intro`,
            role: "coach",
            text: `이 피드백은 ${item.time} 구간의 관찰과 발표 평가 기준을 함께 고려한 결과입니다. 판단하기 어려운 부분을 편하게 물어보세요.`,
        }],
    ])
);

function CheckIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>;
}

function ArrowIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}

function SendIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 8-16 8 3-8-3-8Z" /><path d="M7 12h13" /></svg>;
}

function ChevronIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>;
}

function StageNavigation({ stage, canOpenDiscussion, canOpenPlan, onNavigate }) {
    const steps = [
        { id: 1, label: "피드백 분류" },
        { id: 2, label: "피드백 검토" },
        { id: 3, label: "반영 계획" },
    ];

    return (
        <nav className="e2a-stage-nav" aria-label="피드백 활용 단계">
            {steps.map((step, index) => {
                const disabled = (step.id === 2 && !canOpenDiscussion) || (step.id === 3 && !canOpenPlan);
                const complete = step.id < stage;
                return (
                    <div className="e2a-stage-item" key={step.id}>
                        {index > 0 && <i aria-hidden="true" />}
                        <button type="button" className={step.id === stage ? "active" : complete ? "complete" : ""} disabled={disabled} onClick={() => onNavigate(step.id)} aria-current={step.id === stage ? "step" : undefined}>
                            <span>{complete ? <CheckIcon /> : step.id}</span>
                            <strong>{step.label}</strong>
                        </button>
                    </div>
                );
            })}
        </nav>
    );
}

function DecisionControl({ value, onChange, compact = false }) {
    return (
        <div className={`e2a-decision-control ${compact ? "compact" : ""}`} aria-label="피드백 분류">
            {DECISION_OPTIONS.filter((option) => !compact || option.id !== "review").map((option) => (
                <button key={option.id} type="button" className={`${option.id} ${value === option.id ? "active" : ""}`} onClick={(event) => { event.stopPropagation(); onChange(option.id); }} aria-pressed={value === option.id}>
                    {value === option.id && <CheckIcon />}
                    {option.label}
                </button>
            ))}
        </div>
    );
}

function DecisionDropdown({ itemId, value, reason, isOpen, onToggle, onChange, onReasonChange }) {
    const selected = DECISION_OPTIONS.find((option) => option.id === value);
    const reasonReady = reason.trim().length >= 5;

    return (
        <div className={`e2a-decision-dropdown ${isOpen ? "open" : ""}`} data-decision-menu onClick={(event) => event.stopPropagation()}>
            <button type="button" className={`e2a-decision-trigger ${value || "empty"}`} onClick={() => onToggle(!isOpen)} aria-expanded={isOpen} aria-controls={`decision-menu-${itemId}`}>
                {value ? <span className="e2a-status-dot" /> : null}
                <strong>{selected?.shortLabel || "활용 방법 선택"}</strong>
                <ChevronIcon />
            </button>
            {isOpen ? (
                <div className="e2a-decision-popover" id={`decision-menu-${itemId}`}>
                    <span className="e2a-popover-title">이 피드백을 어떻게 활용할까요?</span>
                    <div className="e2a-popover-options">
                        {DECISION_OPTIONS.map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                className={`${option.id} ${value === option.id ? "active" : ""}`}
                                onClick={() => {
                                    onChange(option.id);
                                    if (option.id !== "dismiss") onToggle(false);
                                }}
                            >
                                <span>{value === option.id ? <CheckIcon /> : null}</span>
                                <div><strong>{option.label}</strong><small>{option.description}</small></div>
                            </button>
                        ))}
                    </div>
                    {value === "dismiss" ? (
                        <div className="e2a-popover-reason">
                            <label htmlFor={`dismiss-reason-${itemId}`}>미반영 이유</label>
                            <textarea id={`dismiss-reason-${itemId}`} rows={2} value={reason} onChange={(event) => onReasonChange(event.target.value)} placeholder="반영하지 않는 이유를 적어 주세요." />
                            <button type="button" disabled={!reasonReady} onClick={() => onToggle(false)}>미반영 확정</button>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

export default function E2ADemoPage() {
    const videoRef = useRef(null);
    const [stage, setStage] = useState(1);
    const [activeId, setActiveId] = useState(FEEDBACK[0].id);
    const [decisions, setDecisions] = useState(() => Object.fromEntries(FEEDBACK.map((item) => [item.id, ""])));
    const [dismissReasons, setDismissReasons] = useState(() => Object.fromEntries(FEEDBACK.map((item) => [item.id, ""])));
    const [reviewQueue, setReviewQueue] = useState([]);
    const [messages, setMessages] = useState(INITIAL_MESSAGES);
    const [drafts, setDrafts] = useState(() => Object.fromEntries(FEEDBACK.map((item) => [item.id, ""])));
    const [plans, setPlans] = useState(() => Object.fromEntries(FEEDBACK.map((item) => [item.id, ""])));
    const [saved, setSaved] = useState(false);
    const [openMenuId, setOpenMenuId] = useState(null);
    const [videoSeconds, setVideoSeconds] = useState(0);

    useEffect(() => {
        function closeDecisionMenu(event) {
            if (!event.target.closest("[data-decision-menu]")) setOpenMenuId(null);
        }
        document.addEventListener("pointerdown", closeDecisionMenu);
        return () => document.removeEventListener("pointerdown", closeDecisionMenu);
    }, []);

    useEffect(() => {
        window.scrollTo({ top: 0, behavior: "auto" });
    }, [stage]);

    const activeFeedback = FEEDBACK.find((item) => item.id === activeId) || FEEDBACK[0];
    const classifiedCount = FEEDBACK.filter((item) => decisions[item.id]).length;
    const dismissReasonsReady = FEEDBACK.every((item) => decisions[item.id] !== "dismiss" || dismissReasons[item.id].trim().length >= 5);
    const stageOneReady = classifiedCount === FEEDBACK.length && dismissReasonsReady;
    const queuedFeedback = reviewQueue.map((id) => FEEDBACK.find((item) => item.id === id)).filter(Boolean);
    const resolvedQueueCount = queuedFeedback.filter((item) => decisions[item.id] !== "review").length;
    const discussionReady = queuedFeedback.every((item) => decisions[item.id] !== "review" && (decisions[item.id] !== "dismiss" || dismissReasons[item.id].trim().length >= 5));
    const appliedFeedback = useMemo(() => FEEDBACK.filter((item) => decisions[item.id] === "apply"), [decisions]);
    const planReady = appliedFeedback.length > 0 && appliedFeedback.every((item) => plans[item.id].trim().length >= 10);
    const currentSlide = useMemo(() => {
        let matchedSlide = PRESENTATION_SLIDES[0];
        for (const slide of PRESENTATION_SLIDES) {
            if (slide.seconds <= videoSeconds + 0.75) matchedSlide = slide;
            else break;
        }
        return matchedSlide;
    }, [videoSeconds]);

    function seekToFeedback(item, shouldPlay = true) {
        setActiveId(item.id);
        setOpenMenuId(null);
        if (!videoRef.current) return;
        videoRef.current.currentTime = item.seconds;
        setVideoSeconds(item.seconds);
        if (shouldPlay) videoRef.current.play().catch(() => {});
    }

    function updateDecision(id, value) {
        setDecisions((current) => ({ ...current, [id]: value }));
        setSaved(false);
    }

    function openDiscussion() {
        if (!stageOneReady) return;
        const nextQueue = FEEDBACK.filter((item) => decisions[item.id] === "review").map((item) => item.id);
        setReviewQueue(nextQueue);
        setActiveId(nextQueue[0] || FEEDBACK.find((item) => decisions[item.id] === "apply")?.id || FEEDBACK[0].id);
        setStage(2);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function openPlan() {
        if (!discussionReady) return;
        setStage(3);
        setActiveId(appliedFeedback[0]?.id || FEEDBACK[0].id);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function navigateStage(nextStage) {
        if (nextStage === 1) setStage(1);
        if (nextStage === 2 && stageOneReady) {
            if (stage === 1) openDiscussion();
            else setStage(2);
        }
        if (nextStage === 3 && discussionReady) setStage(3);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function coachReply(item, question) {
        if (/왜|근거|판단/.test(question)) return `${item.time} 구간에서 ${item.evidence} 이 관찰이 ‘${item.title}’ 평가 기준과 직접 연결되어 피드백으로 제시했습니다.`;
        if (/어떻게|연습|방법|반영/.test(question)) return `${item.suggestion} 다음 발표에서는 이 행동 한 가지를 우선 적용하고, 녹화 영상에서 실행 여부를 확인하세요.`;
        return `${item.rationale} 해결 방법은 다음과 같습니다. ${item.suggestion}`;
    }

    function sendMessage(event) {
        event.preventDefault();
        const question = drafts[activeFeedback.id]?.trim();
        if (!question) return;
        const stamp = Date.now();
        setMessages((current) => ({
            ...current,
            [activeFeedback.id]: [
                ...current[activeFeedback.id],
                { id: `${stamp}-user`, role: "user", text: question },
                { id: `${stamp}-coach`, role: "coach", text: coachReply(activeFeedback, question) },
            ],
        }));
        setDrafts((current) => ({ ...current, [activeFeedback.id]: "" }));
    }

    function handlePlanSave() {
        if (!planReady) return;
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2600);
    }

    return (
        <main className={`analysis-page-v2 e2a-page stage-${stage}`}>
            <header className="analysis-header-v2 e2a-header">
                <Link href="/dashboard-demo" className="db-topbar-brand e2a-brand">
                    <Image src="/logo.png" alt="" width={116} height={28} className="db-topbar-logo" priority />
                    <span className="db-topbar-title">AI 발표 피드백 시스템</span>
                </Link>
                <StageNavigation stage={stage} canOpenDiscussion={stageOneReady} canOpenPlan={stage > 2 || (stage >= 2 && discussionReady)} onNavigate={navigateStage} />
                <div className="header-actions"><Link className="btn-outline e2a-analysis-link" href="/analysis/feedback-demo">전체 분석 보기</Link></div>
            </header>

            {stage === 1 && (
                <div className="e2a-shell e2a-classify-shell">
                    <div className="e2a-classify-layout">
                        <aside className="e2a-video-panel">
                            <div className="e2a-video-frame"><video ref={videoRef} src={VIDEO_URL} controls preload="metadata" playsInline onLoadedMetadata={(event) => setVideoSeconds(event.currentTarget.currentTime || 0)} onTimeUpdate={(event) => setVideoSeconds(event.currentTarget.currentTime || 0)} onSeeked={(event) => setVideoSeconds(event.currentTarget.currentTime || 0)} /></div>
                            <div className="e2a-video-caption"><div><span>공태윤 학생 발표 영상</span><strong>모어의 관사 유무 차이</strong></div><time>{activeFeedback.time}</time></div>
                            <section className="e2a-slide-sync" aria-live="polite" aria-label="영상과 동기화된 발표자료">
                                <header>
                                    <div><span>발표자료</span><strong>{currentSlide.page} / {PRESENTATION_SLIDES.length} 페이지</strong></div>
                                    <time>{currentSlide.time}</time>
                                </header>
                                <div className="e2a-slide-preview"><img src={currentSlide.imageUrl} alt={`공태윤 학생 발표자료 ${currentSlide.page}페이지`} /></div>
                            </section>
                        </aside>

                        <section className="e2a-feedback-board" aria-label="분류할 피드백">
                            {CATEGORY_META.map((category) => (
                                <section className={`e2a-category-group category-${category.id}`} key={category.id}>
                                    <header><span><FeedbackCategoryIcon categoryId={category.id} /></span><h2>{category.label}</h2></header>
                                    <div className="e2a-category-cards">
                                        {FEEDBACK.filter((item) => item.categoryId === category.id).map((item) => (
                                            <article key={item.id} className={`e2a-feedback-card ${activeId === item.id ? "active" : ""} ${decisions[item.id] ? "classified" : ""}`} onClick={() => seekToFeedback(item)} aria-current={activeId === item.id ? "true" : undefined}>
                                                <button type="button" className="e2a-card-main" onClick={(event) => { event.stopPropagation(); seekToFeedback(item); }}>
                                                    <div className="e2a-feedback-card-header">
                                                        <strong>{item.subarea}</strong>
                                                        <div className="e2a-card-state">{activeId === item.id ? <span><CheckIcon /> 선택됨</span> : null}<time>{item.time}</time></div>
                                                    </div>
                                                    <div className="e2a-card-content"><h3>{item.title}</h3><p>{item.summary} 따라서 {item.suggestion}</p></div>
                                                </button>
                                                <div className="e2a-card-footer">
                                                    <DecisionDropdown
                                                        itemId={item.id}
                                                        value={decisions[item.id]}
                                                        reason={dismissReasons[item.id]}
                                                        isOpen={openMenuId === item.id}
                                                        onToggle={(open) => setOpenMenuId(open ? item.id : null)}
                                                        onChange={(value) => updateDecision(item.id, value)}
                                                        onReasonChange={(reason) => setDismissReasons((current) => ({ ...current, [item.id]: reason }))}
                                                    />
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </section>
                    </div>

                    <footer className="e2a-sticky-action">
                        <p>{stageOneReady ? "모든 피드백을 분류했습니다." : dismissReasonsReady ? `${FEEDBACK.length - classifiedCount}개의 피드백을 더 분류해 주세요.` : "미반영 피드백의 이유를 입력해 주세요."}</p>
                        <button type="button" className="e2a-primary-button" disabled={!stageOneReady} onClick={openDiscussion}>다음 <ArrowIcon /></button>
                    </footer>
                </div>
            )}

            {stage === 2 && (
                <div className="e2a-shell e2a-discussion-shell">
                    {queuedFeedback.length ? (
                        <div className="e2a-discussion-layout">
                            <aside className="e2a-review-queue">
                                <div className="e2a-queue-heading"><h2>검토할 피드백</h2><span>{queuedFeedback.length}</span></div>
                                <div className="e2a-queue-list">
                                    {queuedFeedback.map((item) => (
                                        <button type="button" key={item.id} className={activeId === item.id ? "active" : ""} onClick={() => setActiveId(item.id)}>
                                            <span className={`e2a-queue-icon category-${item.categoryId}`}><FeedbackCategoryIcon categoryId={item.categoryId} /></span>
                                            <div><small>{item.subarea} / {item.time}</small><strong>{item.title}</strong></div>
                                            <em className={decisions[item.id]}>{decisions[item.id] === "apply" ? "반영" : decisions[item.id] === "dismiss" ? "미반영" : "검토 중"}</em>
                                        </button>
                                    ))}
                                </div>
                                <div className="e2a-queue-detail">
                                    <div className="e2a-queue-detail-title"><span>피드백</span><button type="button" onClick={() => { setStage(1); window.setTimeout(() => seekToFeedback(activeFeedback), 0); }}>{activeFeedback.time} 근거 보기</button></div>
                                    <h3>{activeFeedback.summary}</h3>
                                    <blockquote>{activeFeedback.evidence}</blockquote>
                                    <div className="e2a-queue-guidance"><p>{activeFeedback.rationale} 따라서 {activeFeedback.suggestion}</p></div>
                                </div>
                                <div className="e2a-queue-decision">
                                    <span>논의 후 결정</span>
                                    <DecisionControl compact value={decisions[activeFeedback.id]} onChange={(value) => updateDecision(activeFeedback.id, value)} />
                                    {decisions[activeFeedback.id] === "dismiss" && (
                                        <label className="e2a-dismiss-reason"><span>미반영 이유 <em>필수</em></span><textarea rows={2} value={dismissReasons[activeFeedback.id]} onChange={(event) => setDismissReasons((current) => ({ ...current, [activeFeedback.id]: event.target.value }))} placeholder="논의 결과를 바탕으로 이유를 적어 주세요." /></label>
                                    )}
                                </div>
                            </aside>

                            <section className="e2a-chat-panel">
                                <header><div className="e2a-coach-avatar">코치</div><div><h2>AI 피드백 코치</h2><p>{activeFeedback.title}에 대해 대화 중</p></div></header>
                                <div className="e2a-chat-messages" aria-live="polite">
                                    {messages[activeFeedback.id].map((message) => (
                                        <div key={message.id} className={`e2a-message ${message.role}`}><span>{message.role === "coach" ? "피드백 코치" : "나"}</span><p>{message.text}</p></div>
                                    ))}
                                </div>
                                <div className="e2a-quick-prompts">
                                    {["이 피드백의 근거를 더 설명해 주세요.", "다음 발표에 어떻게 반영할 수 있나요?"].map((prompt) => <button type="button" key={prompt} onClick={() => setDrafts((current) => ({ ...current, [activeFeedback.id]: prompt }))}>{prompt}</button>)}
                                </div>
                                <form className="e2a-chat-form" onSubmit={sendMessage}>
                                    <label htmlFor="e2a-chat-input">메시지 입력</label>
                                    <textarea id="e2a-chat-input" rows={3} value={drafts[activeFeedback.id]} onChange={(event) => setDrafts((current) => ({ ...current, [activeFeedback.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(event); } }} placeholder="근거가 궁금한 점이나 다른 해석을 입력해 보세요." />
                                    <button type="submit" disabled={!drafts[activeFeedback.id]?.trim()} aria-label="메시지 보내기"><SendIcon /></button>
                                </form>
                            </section>
                        </div>
                    ) : (
                        <section className="e2a-empty-review"><span><CheckIcon /></span><h2>추가로 검토할 피드백이 없습니다</h2><p>분류한 내용을 바탕으로 다음 발표의 반영 계획을 작성할 수 있습니다.</p></section>
                    )}

                    <footer className="e2a-sticky-action">
                        <button type="button" className="e2a-text-button" onClick={() => setStage(1)}>이전</button>
                        <p>{discussionReady ? "검토가 끝났습니다. 반영 계획을 작성해 보세요." : `${queuedFeedback.length - resolvedQueueCount}개의 피드백을 결정해 주세요.`}</p>
                        <button type="button" className="e2a-primary-button" disabled={!discussionReady} onClick={openPlan}>다음 <ArrowIcon /></button>
                    </footer>
                </div>
            )}

            {stage === 3 && (
                <div className="e2a-shell e2a-plan-shell">
                    {appliedFeedback.length ? (
                        <section className="e2a-plan-list" aria-label="피드백 반영 계획">
                            {appliedFeedback.map((item, index) => (
                                <article className={`e2a-plan-card category-${item.categoryId}`} key={item.id}>
                                    <header><span className="e2a-plan-number">{String(index + 1).padStart(2, "0")}</span><div className="e2a-plan-title"><small>{item.subarea}</small><h2>{item.title}</h2></div><button type="button" onClick={() => { setStage(1); window.setTimeout(() => seekToFeedback(item), 0); }}>{item.time} 근거 보기</button></header>
                                    <div className="e2a-plan-content">
                                        <div className="e2a-plan-feedback"><span>반영할 내용</span><p>{item.suggestion}</p></div>
                                        <label><span>나의 실천 계획</span><textarea rows={4} value={plans[item.id]} onChange={(event) => { setPlans((current) => ({ ...current, [item.id]: event.target.value })); setSaved(false); }} placeholder="예: 결론을 시작하기 전 1초 멈추고, 가장 중요한 전략과 이유를 두 문장으로 말하겠다." /><small>{plans[item.id].trim().length >= 10 ? "실천 행동이 구체적으로 작성되었습니다." : "언제, 무엇을, 어떻게 할지 드러나도록 작성해 주세요."}</small></label>
                                    </div>
                                </article>
                            ))}
                        </section>
                    ) : (
                        <section className="e2a-empty-review"><h2>반영하기로 한 피드백이 없습니다</h2><p>이전 단계로 돌아가 피드백 분류를 다시 확인해 주세요.</p><button type="button" className="e2a-primary-button" onClick={() => setStage(1)}>분류 다시 보기</button></section>
                    )}

                    <footer className="e2a-sticky-action">
                        <button type="button" className="e2a-text-button" onClick={() => setStage(2)}>이전</button>
                        <p>{planReady ? "반영 계획을 모두 작성했습니다." : `${appliedFeedback.filter((item) => plans[item.id].trim().length < 10).length}개의 실천 계획을 더 작성해 주세요.`}</p>
                        <button type="button" className="e2a-primary-button" disabled={!planReady} onClick={handlePlanSave}>계획 저장</button>
                    </footer>
                </div>
            )}

            {saved && <div className="e2a-toast" role="status"><CheckIcon /><span><strong>반영 계획을 저장했습니다.</strong> 다음 발표 준비에서 다시 확인할 수 있습니다.</span></div>}
        </main>
    );
}
