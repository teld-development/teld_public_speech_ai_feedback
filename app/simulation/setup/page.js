"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthProvider";
import { convertAndUploadPdfFromUrl } from "../../lib/pdfToImages";
import {
    buildRecordingUpload,
    createPresentationAttempt,
    getPresentationSession,
} from "../../lib/presentations";

const generateSimulationCode = () =>
    String(Math.floor(100000 + Math.random() * 900000));

const DEFAULT_CROWD_SIZE = "large";
const DEFAULT_AUDIENCE_COUNT = 16;

// 5종 청중 성격 - Unity AudienceManager.sessionPersonalities와 매칭
const PERSONALITY_TYPES = [
    { id: "friendly",      label: "우호적",   desc: "관심 갖고 경청",    color: "#22c55e" },
    { id: "normal",        label: "평범함",   desc: "보통 청중",         color: "#3b82f6" },
    { id: "critical",      label: "비판적",   desc: "근거 요구",         color: "#eab308" },
    { id: "sharp",         label: "날카로움", desc: "논리 허점 지적",    color: "#f97316" },
    { id: "disinterested", label: "무관심",   desc: "집중력 낮음",       color: "#94a3b8" },
];

// 발표 환경별 프리셋 - 사용 시나리오 기반으로 설계
const AUDIENCE_PRESETS = [
    {
        id: "supportive",
        label: "협조적 학습자",
        desc: "관심 있고 호의적인 분위기. 처음 발표를 연습할 때 적합합니다.",
        ratios: { friendly: 60, normal: 25, critical: 10, sharp: 5, disinterested: 0 },
    },
    {
        id: "standard",
        label: "표준 강의실",
        desc: "일반적인 수업 환경의 균형 잡힌 분포입니다.",
        ratios: { friendly: 30, normal: 40, critical: 15, sharp: 10, disinterested: 5 },
    },
    {
        id: "diverse",
        label: "다양성 우선",
        desc: "다섯 가지 반응을 골고루 경험하고 싶을 때 선택합니다.",
        ratios: { friendly: 20, normal: 20, critical: 20, sharp: 20, disinterested: 20 },
    },
    {
        id: "evaluation",
        label: "비판적 평가",
        desc: "심사·면접 등 분석적이고 까다로운 청중을 가정한 환경입니다.",
        ratios: { friendly: 10, normal: 20, critical: 35, sharp: 30, disinterested: 5 },
    },
    {
        id: "lowengagement",
        label: "저관여 환경",
        desc: "주의가 산만하고 집중도가 낮은 청중을 다루는 연습에 적합합니다.",
        ratios: { friendly: 10, normal: 30, critical: 15, sharp: 10, disinterested: 35 },
    },
];

// 비율 비교용 - 두 비율 객체가 동일한지
function ratiosMatch(a, b) {
    return PERSONALITY_TYPES.every((p) => (a[p.id] ?? 0) === (b[p.id] ?? 0));
}

// 한글 ↔ 영문 매핑 (Unity 측은 한글 사용)
const PERSONALITY_KR = {
    friendly: "우호적",
    normal: "평범함",
    critical: "비판적",
    sharp: "날카로움",
    disinterested: "무관심",
};

// 비율 → 8명 청중 배열로 변환 (Unity StudentPersona 형식)
function ratioToStudents(ratios) {
    const total = 8; // 백엔드는 8명 기준 (student_index 0~7)
    const students = [];
    let remaining = total;

    // 큰 비율부터 분배
    const sorted = Object.entries(ratios)
        .filter(([, pct]) => pct > 0)
        .sort((a, b) => b[1] - a[1]);

    sorted.forEach(([key, pct], idx) => {
        const isLast = idx === sorted.length - 1;
        const count = isLast ? remaining : Math.round((pct / 100) * total);
        for (let i = 0; i < count && remaining > 0; i++) {
            students.push({
                studentId: `청중${students.length + 1}`,
                personality: PERSONALITY_KR[key],
                extraDetail: "",
            });
            remaining--;
        }
    });

    // 부족하면 평범함으로 채움
    while (students.length < total) {
        students.push({
            studentId: `청중${students.length + 1}`,
            personality: "평범함",
            extraDetail: "",
        });
    }

    return students;
}

function SimulationSetupPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, authLoading } = useAuth();
    const presentationId = searchParams.get("presentationId");

    const [prepareData, setPrepareData] = useState(null);

    // 청중 성격 비율 (합 100%) - 기본값은 표준 강의실 프리셋
    const [ratios, setRatios] = useState({
        friendly: 30,
        normal: 40,
        critical: 15,
        sharp: 10,
        disinterested: 5,
    });

    // 선택된 프리셋 ID (직접 설정 시 "custom")
    const [selectedPreset, setSelectedPreset] = useState("standard");

    // 직접 설정 패널 펼침 여부
    const [showCustom, setShowCustom] = useState(false);

    // 프리셋 클릭 → 비율 일괄 적용
    const applyPreset = (preset) => {
        setRatios({ ...preset.ratios });
        setSelectedPreset(preset.id);
        setShowCustom(false);
    };

    const [loading, setLoading] = useState(false);
    const [loadingMsg, setLoadingMsg] = useState(""); // PDF 변환·업로드 진행 상태
    const [error, setError] = useState("");

    useEffect(() => {
        if (!authLoading && !user) {
            router.replace("/");
        }
    }, [authLoading, router, user]);

    useEffect(() => {
        if (authLoading) return;
        if (!user) return;

        if (presentationId) {
            getPresentationSession(user, presentationId)
                .then((presentation) => {
                    setPrepareData({
                        presentationId: presentation.id,
                        title: presentation.title || "발표",
                        topic: presentation.topic || "",
                        audience: presentation.audience || "",
                        dday: presentation.dday || "",
                        duration: presentation.duration || "",
                        presentationType: presentation.presentationType || "",
                        ownerUid: user.uid,
                        ownerEmail: user.email || "",
                        presentationMaterial: presentation.presentationMaterial || null,
                    });
                })
                .catch((err) => {
                    console.error("[Setup] 발표 세션 로드 실패:", err);
                    router.replace("/dashboard");
                });
            return;
        }

        router.replace("/dashboard");
    }, [authLoading, presentationId, router, user]);

    const totalRatio = Object.values(ratios).reduce((s, v) => s + v, 0);
    const ratiosValid = totalRatio === 100;
    const canStart = ratiosValid && user;

    const handleRatioChange = (key, value) => {
        const num = Math.max(0, Math.min(100, parseInt(value, 10) || 0));
        setRatios((prev) => ({ ...prev, [key]: num }));
        setSelectedPreset("custom"); // 직접 조정 시 프리셋 선택 해제
    };

    const normalizeRatios = () => {
        // 자동으로 100%로 정규화
        if (totalRatio === 0) return;
        const factor = 100 / totalRatio;
        const newRatios = {};
        let sum = 0;
        const keys = Object.keys(ratios);
        keys.forEach((k, i) => {
            if (i === keys.length - 1) {
                newRatios[k] = 100 - sum;
            } else {
                newRatios[k] = Math.round(ratios[k] * factor);
                sum += newRatios[k];
            }
        });
        setRatios(newRatios);
    };

    const handleStart = async () => {
        if (!canStart || loading) return;
        setLoading(true);
        setError("");
        try {
            const code = generateSimulationCode();

            // 1) PDF는 prepare 단계에서 이미 Firebase Storage에 업로드됨.
            //    여기서는 URL을 Firestore에 넘기고, Unity가 쓸 슬라이드 이미지 URL만 선택적으로 생성함.
            let materialMeta = null;
            let pdfUrl = "";
            let slideImageUrls = [];
            if (prepareData?.presentationMaterial?.url) {
                const mat = prepareData.presentationMaterial;
                pdfUrl = mat.url;
                materialMeta = {
                    name: mat.name,
                    type: mat.type,
                    size: mat.size || null,
                    url: mat.url,
                    path: mat.path || "",
                    ownerUid: mat.ownerUid || user.uid,
                    ownerEmail: mat.ownerEmail || user.email || "",
                };

                // ★ PDF → 이미지 변환 + 업로드 (비동기, 1.5x 배율)
                try {
                    setLoadingMsg("PDF를 슬라이드 이미지로 변환 중...");
                    const result = await convertAndUploadPdfFromUrl(mat.url, code, {
                        ownerUid: user.uid,
                        onProgress: (p) => {
                            const phaseKr = p.phase === "convert" ? "변환" : "업로드";
                            setLoadingMsg(`슬라이드 ${phaseKr} 중... (${p.current}/${p.total})`);
                        },
                    });
                    slideImageUrls = result.slideImageUrls;
                    console.log(`[Setup] PDF 이미지 변환 완료: ${slideImageUrls.length}장`);
                    setLoadingMsg("시뮬레이션 준비 중...");
                } catch (convErr) {
                    console.error("[Setup] PDF 이미지 변환 실패 (PDF 원본만 사용):", convErr);
                    // 변환 실패해도 PDF 원본 URL은 있으므로 유니티 측 fallback 가능
                }
            }

            // 2) 비율 → 8명 청중 배열로 변환
            const students = ratioToStudents(ratios);
            const crowdSize = DEFAULT_CROWD_SIZE;
            const audienceCount = DEFAULT_AUDIENCE_COUNT;
            let attempt = null;
            let recordingUpload = null;

            if (presentationId) {
                attempt = await createPresentationAttempt(user, presentationId, "simulation");
                recordingUpload = buildRecordingUpload({
                    ownerUid: user.uid,
                    presentationId,
                    attemptId: attempt.id,
                    code,
                    sourceType: "simulation",
                });
            }

            // 3) Firestore에 시뮬레이션 정보 저장 (Unity가 읽음)
            const { presentationMaterial: _mat, presentationId: _pid, ...meta } = prepareData;
            const simulationPayload = {
                ...meta,
                ownerUid: user.uid,
                ownerEmail: user.email || "",
                presentationId: presentationId || null,
                attemptId: attempt?.id || null,
                attemptNo: attempt?.attemptNo || null,
                sourceType: "simulation",
                presentation: presentationId ? {
                    title: prepareData.title || "발표",
                    topic: prepareData.topic || "",
                    audience: prepareData.audience || "",
                    dday: prepareData.dday || "",
                    duration: prepareData.duration || "",
                    presentationType: prepareData.presentationType || "",
                } : null,
                presentationMaterial: materialMeta,
                simulation: {
                    crowdSize,
                    audienceCount,
                    ratios,
                    students,
                    pdfUrl,
                    // ★ 미리 변환된 슬라이드 이미지 URL 배열 - Unity가 이걸 우선 사용
                    slideImageUrls,
                    slideCount: slideImageUrls.length,
                },
                recordingUpload,
                status: "waiting",
                createdAt: serverTimestamp(),
            };

            await setDoc(doc(db, "simulations", code), {
                ...simulationPayload,
            });

            if (attempt) {
                await setDoc(attempt.ref, {
                    status: "waiting",
                    simulation: {
                        code,
                        crowdSize,
                        audienceCount,
                        ratios,
                    },
                    recordingUpload,
                    updatedAt: serverTimestamp(),
                }, { merge: true });
            }

            // 4) ★ 백엔드 /session/create 호출 — 필수 (Unity 가 코드로 claim 하려면 백엔드 store 에 등록되어 있어야 함)
            //    Render 무료 티어 cold start 대비:
            //    a) ping 으로 미리 깨움 (최대 60초 대기)
            //    b) /session/create 호출 (실패 시 최대 3회 재시도)
            //    c) 모두 실패하면 사용자에게 명확히 안내 (silent fallback 안 함)
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://34.158.198.43:8000";

            // a) 서버 깨우기 — ping (cold start 시 30~60초 걸림)
            try {
                console.log("[Setup] 백엔드 ping 으로 깨우는 중...");
                const pingCtrl = new AbortController();
                const pingTimer = setTimeout(() => pingCtrl.abort(), 75_000);
                const pingRes = await fetch(`${backendUrl}/ping`, { signal: pingCtrl.signal, cache: "no-store" });
                clearTimeout(pingTimer);
                if (!pingRes.ok) {
                    throw new Error(`ping 응답 ${pingRes.status}`);
                }
                console.log("[Setup] 백엔드 깨움 OK");
            } catch (pingErr) {
                console.error("[Setup] 백엔드 ping 실패:", pingErr);
                setError(
                    "서버 연결 실패: 백엔드를 깨우는 데 실패했습니다.\n" +
                    "잠시 후 다시 시도해주세요. (Render 무료 티어 슬립 상태일 수 있음)"
                );
                return;  // session/create 진행 안 함
            }

            // b) /session/create 호출 — 최대 3회 재시도
            const studentId = `web_${code}`;
            const backendPayload = {
                studentId,
                grade: "대학교",
                subject: prepareData.topic || "",
                domain: "발표",
                achievement: "공적 말하기 역량",
                lessonObjective: prepareData.topic || "",
                pdfUrl: pdfUrl || "",
                difficulty: "중급",
                students,
            };

            let backendData = null;
            let backendErrMsg = "";
            for (let attemptNum = 1; attemptNum <= 3; attemptNum++) {
                try {
                    console.log(`[Setup] /session/create 시도 ${attemptNum}/3`);
                    const ctrl = new AbortController();
                    const timer = setTimeout(() => ctrl.abort(), 30_000);
                    const backendRes = await fetch(`${backendUrl}/session/create`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(backendPayload),
                        signal: ctrl.signal,
                    });
                    clearTimeout(timer);
                    if (backendRes.ok) {
                        backendData = await backendRes.json();
                        console.log("[Setup] /session/create 성공:", backendData);
                        break;
                    } else {
                        backendErrMsg = `HTTP ${backendRes.status}: ${await backendRes.text()}`;
                        console.warn(`[Setup] 시도 ${attemptNum} 실패: ${backendErrMsg}`);
                    }
                } catch (e) {
                    backendErrMsg = e?.message || String(e);
                    console.warn(`[Setup] 시도 ${attemptNum} 예외: ${backendErrMsg}`);
                }
                if (attemptNum < 3) await new Promise(r => setTimeout(r, 2000));
            }

            if (!backendData) {
                // 3회 다 실패 — 사용자에게 명확히 안내, silent fallback 안 함
                setError(
                    "서버 연결 실패: /session/create 호출이 3회 모두 실패했습니다.\n" +
                    "Unity 에서 코드 입력 시 \"유효하지 않은 코드\" 오류가 날 수 있습니다.\n" +
                    `(상세: ${backendErrMsg})\n잠시 후 다시 시도해주세요.`
                );
                return;
            }

            // c) accessCode 가 자체 code 와 다르면 백엔드 코드로 Firestore 새 doc 만들기
            if (backendData.accessCode && backendData.accessCode !== code) {
                const backendRecordingUpload = attempt ? buildRecordingUpload({
                    ownerUid: user.uid,
                    presentationId,
                    attemptId: attempt.id,
                    code: backendData.accessCode,
                    sourceType: "simulation",
                }) : null;

                await setDoc(doc(db, "simulations", backendData.accessCode), {
                    ...simulationPayload,
                    recordingUpload: backendRecordingUpload,
                    backendCode: backendData.accessCode,
                    backendSessionId: backendData.sessionId,
                });
                if (attempt) {
                    await setDoc(attempt.ref, {
                        simulation: {
                            code: backendData.accessCode,
                            backendSessionId: backendData.sessionId,
                            crowdSize,
                            audienceCount,
                            ratios,
                        },
                        recordingUpload: backendRecordingUpload,
                        updatedAt: serverTimestamp(),
                    }, { merge: true });
                }
                sessionStorage.setItem("simulationCode", backendData.accessCode);
                router.push(`/simulation/${backendData.accessCode}`);
                return;
            }

            // accessCode 가 같은 경우엔 기존 code 로 진행
            sessionStorage.setItem("simulationCode", code);
            router.push(`/simulation/${code}`);
        } catch (err) {
            console.error("시뮬레이션 시작 실패:", err);
            setError("시뮬레이션 시작 중 오류가 발생했습니다. 다시 시도해주세요.");
        } finally {
            setLoading(false);
        }
    };

    if (!prepareData) {
        return (
            <main className="sim-setup-page">
                <div className="sim-setup-loading">불러오는 중…</div>
            </main>
        );
    }

    return (
        <main className="sim-setup-page">
            <div className="sim-setup-container">

                {/* ── 헤더 ── */}
                <header className="sim-setup-header">
                    <button type="button" className="sim-setup-back" onClick={() => router.back()}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
                        </svg>
                        이전
                    </button>
                    <h1>시뮬레이션 환경 설정</h1>
                    <p>가상 청중의 성격 비율을 설정합니다.</p>
                </header>

                {/* ── 발표 정보 요약 ── */}
                <section className="sim-setup-summary">
                    <div className="sim-summary-grid">
                        <div className="sim-summary-item">
                            <span className="sim-summary-label">주제</span>
                            <span className="sim-summary-val">{prepareData.topic}</span>
                        </div>
                        <div className="sim-summary-item">
                            <span className="sim-summary-label">청중</span>
                            <span className="sim-summary-val">{prepareData.audience}</span>
                        </div>
                        <div className="sim-summary-item">
                            <span className="sim-summary-label">발표 유형</span>
                            <span className="sim-summary-val">{prepareData.presentationType}</span>
                        </div>
                        {prepareData.duration && (
                            <div className="sim-summary-item">
                                <span className="sim-summary-label">발표 시간</span>
                                <span className="sim-summary-val">{prepareData.duration}</span>
                            </div>
                        )}
                        {prepareData.presentationMaterial && (
                            <div className="sim-summary-item">
                                <span className="sim-summary-label">발표 자료</span>
                                <span className="sim-summary-val sim-summary-val--file">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                                    </svg>
                                    {prepareData.presentationMaterial.name}
                                </span>
                            </div>
                        )}
                    </div>
                </section>

                {/* ── 청중 성격 비율 ── */}
                <section className="sim-setup-section">
                    <div className="sim-setup-section-header">
                        <h2>청중 환경 선택</h2>
                        <span className="required-badge">필수</span>
                    </div>
                    <p style={{fontSize: 13, color: "#666", margin: "4px 0 16px"}}>
                        발표 상황에 맞는 청중 구성을 선택하세요. 세부 비율은 직접 조정할 수도 있습니다.
                    </p>

                    {/* ─── 프리셋 카드 ─── */}
                    <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12}}>
                        {AUDIENCE_PRESETS.map((preset) => {
                            const isSelected = selectedPreset === preset.id;
                            return (
                                <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => applyPreset(preset)}
                                    style={{
                                        textAlign: "left",
                                        padding: "16px 18px",
                                        background: isSelected ? "#eef2ff" : "#fff",
                                        border: `2px solid ${isSelected ? "#4f46e5" : "#e5e7eb"}`,
                                        borderRadius: 10,
                                        cursor: "pointer",
                                        transition: "all 0.15s",
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 8,
                                        fontFamily: "inherit",
                                    }}
                                >
                                    <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
                                        <span style={{fontSize: 15, fontWeight: 700, color: "#111"}}>{preset.label}</span>
                                        {isSelected && (
                                            <span style={{fontSize: 11, fontWeight: 600, color: "#4f46e5",
                                                          background: "#fff", padding: "2px 8px", borderRadius: 12,
                                                          border: "1px solid #c7d2fe"}}>
                                                선택됨
                                            </span>
                                        )}
                                    </div>
                                    <p style={{fontSize: 12, color: "#666", lineHeight: 1.5, margin: 0}}>
                                        {preset.desc}
                                    </p>
                                    {/* 비율 시각화 막대 */}
                                    <div style={{display: "flex", height: 8, borderRadius: 4, overflow: "hidden",
                                                 background: "#f3f4f6", marginTop: 4}}>
                                        {PERSONALITY_TYPES.map((p) => {
                                            const v = preset.ratios[p.id] || 0;
                                            if (v === 0) return null;
                                            return (
                                                <div key={p.id} title={`${p.label} ${v}%`}
                                                     style={{flex: v, background: p.color}} />
                                            );
                                        })}
                                    </div>
                                    {/* 비율 텍스트 (작게) */}
                                    <div style={{display: "flex", flexWrap: "wrap", gap: "4px 10px", fontSize: 11, color: "#666"}}>
                                        {PERSONALITY_TYPES.map((p) => {
                                            const v = preset.ratios[p.id] || 0;
                                            if (v === 0) return null;
                                            return (
                                                <span key={p.id} style={{display: "inline-flex", alignItems: "center", gap: 4}}>
                                                    <span style={{width: 8, height: 8, borderRadius: "50%", background: p.color}}/>
                                                    {p.label} {v}%
                                                </span>
                                            );
                                        })}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* ─── 직접 설정 토글 ─── */}
                    <div style={{marginTop: 16}}>
                        <button
                            type="button"
                            onClick={() => setShowCustom((v) => !v)}
                            style={{
                                background: "none",
                                border: "none",
                                color: "#4f46e5",
                                cursor: "pointer",
                                fontSize: 13,
                                fontWeight: 600,
                                padding: "8px 0",
                                fontFamily: "inherit",
                            }}
                        >
                            {showCustom ? "▾ 직접 설정 닫기" : "▸ 직접 설정 (비율 세부 조정)"}
                            {selectedPreset === "custom" && <span style={{marginLeft: 8, color: "#888"}}>· 사용자 정의</span>}
                        </button>
                    </div>

                    {/* ─── 직접 설정 패널 (펼쳤을 때만) ─── */}
                    {showCustom && (
                        <div style={{
                            marginTop: 8,
                            padding: 16,
                            background: "#fafafa",
                            border: "1px solid #e5e7eb",
                            borderRadius: 8,
                        }}>
                            <p style={{fontSize: 12, color: "#666", margin: "0 0 12px"}}>
                                슬라이더로 비율을 직접 조정합니다. 합계가 100%여야 시작할 수 있습니다.
                            </p>
                            <div style={{display: "flex", flexDirection: "column", gap: 10}}>
                                {PERSONALITY_TYPES.map((p) => (
                                    <div key={p.id} style={{display: "flex", alignItems: "center", gap: 12}}>
                                        <div style={{minWidth: 110, display: "flex", alignItems: "center", gap: 6}}>
                                            <span style={{width: 10, height: 10, borderRadius: "50%", background: p.color, flexShrink: 0}}/>
                                            <div>
                                                <div style={{fontWeight: 600, fontSize: 13}}>{p.label}</div>
                                                <div style={{fontSize: 11, color: "#888"}}>{p.desc}</div>
                                            </div>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={ratios[p.id]}
                                            onChange={(e) => handleRatioChange(p.id, e.target.value)}
                                            style={{flex: 1, accentColor: p.color}}
                                        />
                                        <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={ratios[p.id]}
                                            onChange={(e) => handleRatioChange(p.id, e.target.value)}
                                            style={{width: 60, textAlign: "right", padding: "4px 8px",
                                                    border: "1px solid #ccc", borderRadius: 4}}
                                        />
                                        <span style={{minWidth: 14}}>%</span>
                                    </div>
                                ))}
                            </div>
                            <div style={{
                                marginTop: 12,
                                padding: "8px 12px",
                                borderRadius: 6,
                                background: ratiosValid ? "#e8f5e9" : "#ffebee",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                fontSize: 13
                            }}>
                                <span>합계: <strong>{totalRatio}%</strong></span>
                                <div>
                                    {!ratiosValid && (
                                        <button
                                            type="button"
                                            onClick={normalizeRatios}
                                            style={{
                                                padding: "4px 10px",
                                                fontSize: 12,
                                                background: "#1976d2",
                                                color: "white",
                                                border: "none",
                                                borderRadius: 4,
                                                cursor: "pointer"
                                            }}
                                        >
                                            100%로 자동 조정
                                        </button>
                                    )}
                                    {ratiosValid && <span style={{color: "#2e7d32"}}>✓ 합계 100% 유효</span>}
                                </div>
                            </div>
                        </div>
                    )}
                </section>

                {error && <p className="sim-setup-error">{error}</p>}

                <div className="sim-setup-actions">
                    <button type="button" className="btn-secondary" onClick={() => router.back()} disabled={loading}>
                        이전으로
                    </button>
                    <button type="button" className="btn-primary" disabled={!canStart || loading} onClick={handleStart}>
                        {loading ? (
                            <><span className="sim-setup-spinner"></span>{loadingMsg || "코드 발급 중…"}</>
                        ) : "시뮬레이션 시작"}
                    </button>
                </div>
            </div>
        </main>
    );
}

export default function SimulationSetupPage() {
    return (
        <Suspense fallback={(
            <main className="sim-setup-page">
                <div className="sim-setup-loading">불러오는 중...</div>
            </main>
        )}>
            <SimulationSetupPageContent />
        </Suspense>
    );
}
