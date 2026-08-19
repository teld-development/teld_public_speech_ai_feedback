"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { FeedbackCategoryIcon, FeedbackItemIcon } from "../components/FeedbackAreaIcons";

const VIDEO_URL = "https://firebasestorage.googleapis.com/v0/b/public-speech-feedback.firebasestorage.app/o/recordings%2FPOZ5a41bw2dkXMkdwj6VRtqk0pq2%2Fpresentations%2FDTRTRGm4jhb759BLfBcT%2Fattempts%2FIoPOcn2JwGQsHRdHSvLC%2Fraw%2FVideo_Project_5.mp4?alt=media&token=f1f1e2f9-9628-45d7-a15c-ab28190474b8";

const FEEDBACK = [
    {
        id: "organization",
        categoryId: "organization",
        itemId: "explanation_method",
        area: "조직",
        title: "문장 완결성 및 명료성",
        time: "05:07",
        seconds: 307,
        evidenceLabel: "원문 발화",
        criterion: "발표 내용을 완결성 있고 명료한 문장으로 전달한다.",
        comment: "발화 중간에 멈칫하거나 ‘산업을 활용, 어, 산업 사용할 수 있고’처럼 말을 고치는 부분이 여러 차례 나타나, 문장의 완결성과 청중의 이해도를 저해합니다. 스크립트에 의존하기보다는 내용을 충분히 숙지하고 자연스럽게 전달하는 연습이 필요합니다.",
        evidence: "이러한 사태 이후 쿠팡으로 쿠팡 같은 경우에는 많은 이용자들이 많이 빠져나갔지만 현재는 사고 이전의 수준을 회복한 모습을 살펴볼 수 있습니다.",
        suggestion: "한 문장에는 하나의 핵심 정보만 담고, 전략별 핵심 문장을 소리 내어 미리 연습해보세요.",
    },
    {
        id: "delivery",
        categoryId: "expression",
        itemId: "eye_contact",
        area: "전달 및 표현",
        title: "시선 처리",
        time: "00:41",
        seconds: 41,
        evidenceLabel: "영상 관찰",
        criterion: "청중과 골고루 시선 접촉을 유지한다.",
        comment: "발표 내내 시선이 카메라(청중)를 향하기보다는 아래쪽의 자료를 읽는 데 집중되어 있습니다. 간혹 카메라를 보지만 짧게 스쳐 지나가 청중과의 연결감이 부족합니다.",
        evidence: "00:41부터 핵심 자원과 역량을 설명하는 동안 시선이 아래쪽 자료에 머물고, 카메라를 바라보는 시간은 짧습니다.",
        suggestion: "핵심 자원 세 가지를 말할 때마다 자료에서 시선을 떼고 카메라를 2초 이상 바라보세요.",
    },
    {
        id: "content",
        categoryId: "content",
        itemId: "presentation_content",
        area: "내용",
        title: "문법 및 언어 정확성",
        time: "03:47",
        seconds: 227,
        evidenceLabel: "원문 발화",
        criterion: "문법에 맞고 의미가 분명한 표현으로 발표 내용을 전달한다.",
        comment: "문장이 지나치게 길고 ‘이러한’과 같은 표현이 반복되어 의미 전달이 모호하고 집중을 방해했습니다. 간결한 문장으로 다듬을 필요가 있습니다.",
        evidence: "쿠팡과 같은 경우에는 이런 인지 탐색 부분이 모두 약하기 때문에 이러한 쇼핑의 여정의 소비 단계를 빼앗기면 물류 강점이 있어도 트래픽 자체를 잃을 위험을 가지고 있다고 볼 수 있습니다.",
        suggestion: "반복되는 ‘이러한’, ‘같은 경우에는’을 덜어내고 원인과 결과를 두 문장으로 나누어 말해보세요.",
    },
];

const OPTIONS = [
    { id: "accept", label: "수용", description: "근거와 일치함" },
    { id: "adjust", label: "수정 수용", description: "일부만 타당함" },
    { id: "hold", label: "보류", description: "근거가 부족함" },
    { id: "reject", label: "거부", description: "근거와 불일치함" },
];

function PlayIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z" /></svg>;
}

function CheckIcon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>;
}

export default function E2ADemoPage() {
    const videoRef = useRef(null);
    const [stage, setStage] = useState("review");
    const [activeIndex, setActiveIndex] = useState(0);
    const [decisions, setDecisions] = useState({
        organization: { value: "accept", reason: "05:07 전후로 같은 표현을 반복하거나 문장을 다시 시작하는 장면이 확인되므로 수용한다." },
        delivery: { value: "adjust", reason: "자료를 보는 시간이 긴 점은 맞지만, 핵심 항목을 제시할 때는 잠시 카메라를 바라보므로 수정 수용한다." },
        content: { value: "", reason: "" },
    });
    const [selectedActionId, setSelectedActionId] = useState("organization");
    const [plan, setPlan] = useState("다음 발표에서는 전략 하나를 설명할 때 핵심 정보를 한 문장에 하나씩 담고, 문장을 끝낸 뒤 1초 쉬고 다음 내용으로 넘어가겠다.");
    const [recording, setRecording] = useState("idle");

    const active = FEEDBACK[activeIndex];
    const completed = Object.values(decisions).filter((decision) => decision.value && decision.reason.trim()).length;
    const usableFeedback = useMemo(() => FEEDBACK.filter((item) => ["accept", "adjust"].includes(decisions[item.id]?.value)), [decisions]);
    const selectedAction = usableFeedback.find((item) => item.id === selectedActionId) || usableFeedback[0];
    const planReady = plan.trim().length >= 20;

    function changeDecision(value) {
        setDecisions((current) => ({ ...current, [active.id]: { ...current[active.id], value } }));
    }

    function changeReason(reason) {
        setDecisions((current) => ({ ...current, [active.id]: { ...current[active.id], reason } }));
    }

    function seekToFeedback(item, shouldPlay = true) {
        if (!videoRef.current) return;
        videoRef.current.currentTime = item.seconds;
        if (shouldPlay) videoRef.current.play().catch(() => {});
    }

    function selectFeedback(index) {
        setActiveIndex(index);
        window.requestAnimationFrame(() => seekToFeedback(FEEDBACK[index], false));
    }

    function openActionStage() {
        if (usableFeedback[0]) setSelectedActionId(usableFeedback[0].id);
        setStage("action");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function returnToEvidence(item) {
        setActiveIndex(FEEDBACK.findIndex((feedback) => feedback.id === item.id));
        setStage("review");
        window.setTimeout(() => seekToFeedback(item), 0);
    }

    function startRehearsal() {
        if (!planReady || recording === "recording") return;
        setRecording("recording");
        window.setTimeout(() => setRecording("done"), 1200);
    }

    return (
        <main className={`analysis-page-v2 e2a-review-page ${stage === "review" ? "is-review" : "is-action"}`}>
            <header className="analysis-header-v2 e2a-review-header">
                <Link href="/dashboard-demo" className="db-topbar-brand e2a-review-brand">
                    <img src="/logo.png" alt="" className="db-topbar-logo" />
                    <span className="db-topbar-title">AI 발표 피드백 시스템</span>
                </Link>
                <nav className="e2a-review-stage-nav" aria-label="피드백 활용 단계">
                    <button type="button" className={stage === "review" ? "active" : "complete"} onClick={() => setStage("review")}>
                        <span>{stage === "action" ? <CheckIcon /> : "1"}</span><strong>피드백 판단</strong>
                    </button>
                    <i />
                    <button type="button" className={stage === "action" ? "active" : ""} onClick={openActionStage} disabled={!usableFeedback.length}>
                        <span>2</span><strong>개선 행동</strong>
                    </button>
                </nav>
                <div className="header-actions"><Link className="btn-outline e2a-review-back" href="/analysis/feedback-demo">전체 분석 보기</Link></div>
            </header>

            <div className="analysis-main-v2 e2a-review-main">
                {stage === "review" ? (
                    <section className="e2a-review-workbench">
                            <div className="e2a-review-feedback-list" role="tablist" aria-label="검토할 피드백">
                                {FEEDBACK.map((item, index) => {
                                    const isComplete = Boolean(decisions[item.id]?.value && decisions[item.id]?.reason.trim());
                                    return (
                                        <button key={item.id} type="button" role="tab" aria-selected={index === activeIndex} className={index === activeIndex ? "active" : ""} onClick={() => selectFeedback(index)}>
                                            <span className={`e2a-feedback-area-icon category-${item.categoryId} ${isComplete ? "complete" : ""}`}><FeedbackCategoryIcon categoryId={item.categoryId} /></span>
                                            <div>
                                                <small>{index + 1}번 피드백</small>
                                                <strong><span>대영역</span><em>{item.area}</em><i>›</i><b className={`e2a-feedback-subarea-icon category-${item.categoryId}`}><FeedbackItemIcon itemId={item.itemId} /></b><span>소영역</span><em>{item.title}</em></strong>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="e2a-review-media">
                                <div className="e2a-review-video" aria-label={`발표 영상 ${active.time} 구간`}>
                                    <video ref={videoRef} src={VIDEO_URL} controls preload="metadata" playsInline />
                                    <div className="e2a-review-video-meta"><span>실제 발표 영상</span><strong>쿠팡 이종업계 진입의 대응전략</strong></div>
                                </div>
                            </div>

                            <div className="e2a-review-form">
                                <header>
                                    <div><span>{active.area} 피드백</span><h3>{active.title}</h3></div>
                                    <small><strong>{completed}</strong> / {FEEDBACK.length} 검토</small>
                                </header>
                                <div className="e2a-review-evidence">
                                    <div className="e2a-review-evidence-heading">
                                        <div><small>영상 근거</small><strong>확인된 장면 <time>{active.time}</time></strong></div>
                                        <button type="button" onClick={() => seekToFeedback(active)}>구간 재생</button>
                                    </div>
                                    <blockquote><span>{active.evidenceLabel}</span>{active.evidence}</blockquote>
                                </div>
                                <div className="e2a-review-criterion">
                                    <div><small>판단 기준</small><p>{active.criterion}</p></div>
                                </div>
                                <div className="e2a-review-ai-copy">
                                    <small>AI 피드백</small>
                                    <p>{active.comment}</p>
                                    <div className="e2a-review-suggestion"><strong>개선 제안</strong><p>{active.suggestion}</p></div>
                                </div>
                            </div>

                            <form className="e2a-review-judgment" onSubmit={(event) => event.preventDefault()}>
                                <fieldset className="e2a-review-options">
                                    <legend>판단 결과</legend>
                                    {OPTIONS.map((option) => (
                                        <button key={option.id} type="button" className={decisions[active.id]?.value === option.id ? "active" : ""} onClick={() => changeDecision(option.id)}>
                                            <span>{decisions[active.id]?.value === option.id && <CheckIcon />}</span>
                                            <div><strong>{option.label}</strong><small>{option.description}</small></div>
                                        </button>
                                    ))}
                                </fieldset>

                                <label className="e2a-review-reason">
                                    <span>판단 근거</span>
                                    <textarea rows={5} value={decisions[active.id]?.reason || ""} onChange={(event) => changeReason(event.target.value)} placeholder="영상의 어떤 장면이 AI 피드백과 일치하거나 일치하지 않는지 적어보세요." />
                                </label>

                                <footer className="e2a-review-form-actions">
                                    {activeIndex > 0 ? <button type="button" className="e2a-review-secondary" onClick={() => selectFeedback(activeIndex - 1)}>이전 피드백</button> : <span />}
                                    {activeIndex === FEEDBACK.length - 1
                                        ? <button type="button" className="btn-primary-sm" onClick={openActionStage} disabled={!usableFeedback.length}>개선 행동 선택</button>
                                        : <span />}
                                </footer>
                            </form>
                    </section>
                ) : (
                    <section className="e2a-action-workbench">
                            <aside className="e2a-action-selection">
                                <h3>선택한 피드백</h3>
                                <div className="e2a-action-feedback-list">
                                    {usableFeedback.map((item) => (
                                        <button key={item.id} type="button" className={selectedAction?.id === item.id ? "active" : ""} onClick={() => { setSelectedActionId(item.id); setRecording("idle"); }}>
                                            <span><CheckIcon /></span><div><small>{decisions[item.id]?.value === "accept" ? "수용" : "수정 수용"} / {item.area}</small><strong>{item.title}</strong></div>
                                        </button>
                                    ))}
                                </div>
                                {selectedAction && (
                                    <div className="e2a-action-context">
                                        <div className="e2a-action-clip">
                                            <button type="button" aria-label={`${selectedAction.time} 구간 재생`} onClick={() => returnToEvidence(selectedAction)}><PlayIcon /></button>
                                            <div><span>근거 영상 {selectedAction.time}</span><strong>{selectedAction.title}</strong></div>
                                        </div>
                                        <p>{selectedAction.comment}</p>
                                        <blockquote>{selectedAction.evidence}</blockquote>
                                        <dl><dt>평가기준</dt><dd>{selectedAction.criterion}</dd></dl>
                                    </div>
                                )}
                            </aside>

                            <div className="e2a-action-form">
                                <header>
                                    <div><h3>다음 발표에서 바꿀 한 가지</h3><p>영상에서 확인할 수 있는 행동으로 적어보세요.</p></div>
                                    <button type="button" className="e2a-review-secondary" onClick={() => setStage("review")}>판단 수정</button>
                                </header>
                                <label>
                                    <span>나의 계획</span>
                                    <textarea rows={5} value={plan} onChange={(event) => { setPlan(event.target.value); setRecording("idle"); }} placeholder="예: 결론의 핵심 문장을 말하기 전 1초 멈춘 뒤 마지막 핵심어를 천천히 말하겠다." />
                                    <small>{planReady ? "실행할 수 있는 구체적인 계획입니다." : "상황과 행동이 드러나도록 조금 더 구체적으로 적어보세요."}</small>
                                </label>
                                <div className="e2a-action-rehearsal">
                                    <div><strong>{selectedAction?.time} 구간 재수행</strong><p>계획한 행동을 적용해 해당 구간만 다시 발표합니다.</p></div>
                                    <button type="button" className="btn-primary-sm" disabled={!planReady || recording === "recording"} onClick={startRehearsal}>{recording === "recording" ? "녹화 중…" : recording === "done" ? "재수행 완료" : "구간 다시 녹화"}</button>
                                </div>
                                {recording === "done" && <div className="e2a-action-complete" role="status"><CheckIcon /><p><strong>재수행을 완료했습니다.</strong><span>다음에는 수정 전후 영상을 같은 기준으로 비교할 수 있습니다.</span></p></div>}
                            </div>
                    </section>
                )}
            </div>
        </main>
    );
}
