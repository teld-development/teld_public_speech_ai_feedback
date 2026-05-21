"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { adaptUnityResultToAnalysis } from "../../lib/unityResultAdapter";

const STATUS_LABEL = {
    waiting: "Unity 시뮬레이션 연결 대기 중",
    in_progress: "시뮬레이션 진행 중",
    analysis: "AI 분석 준비 중...",         // 레거시
    analyzing: "AI 분석 중... (1~2분 소요)", // 레거시
    completed: "AI 분석 중... (1~2분 소요)", // Unity 업로드 완료 → 웹이 Gemini 트리거
    upload_failed: "업로드 실패",
    failed: "업로드 실패",
};

export default function SimulationWaitingPage({ params }) {
    const router = useRouter();
    const { code } = params;

    const [status, setStatus] = useState("waiting");
    const [error, setError] = useState("");
    const [elapsed, setElapsed] = useState(0);
    const [copyStatus, setCopyStatus] = useState("");

    // /api/analyze 중복 호출 방지 가드 (onSnapshot 은 문서 변경마다 발화)
    const analyzeTriggeredRef = useRef(false);

    useEffect(() => {
        const timer = setInterval(() => setElapsed((p) => p + 1), 1000);
        return () => clearInterval(timer);
    }, []);

    // /api/analyze 호출 → 결과를 별도 필드 analysisData 에 저장 (status·result 불변)
    const runAnalysis = async (data) => {
        try {
            console.log("[Simulation] /api/analyze 분석 시작");
            // ★ analysisInProgress 선점 — 새로고침/타 기기 중복 Gemini 호출 방지
            await updateDoc(doc(db, "simulations", code), { analysisInProgress: true });

            // Unity 새 흐름: 영상 정보는 data.result 안에 있음
            // 레거시: data.videoUrl 직접
            const videoInfo = data.result || {};
            const videoUrl = videoInfo.videoUrl || data.videoUrl;
            const fileName = videoInfo.fileName || `simulation_${code}.mp4`;
            const mimeType = videoInfo.mimeType || "video/mp4";

            const res = await fetch("/api/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    blobUrl: videoUrl,
                    fileName,
                    mimeType,
                    topic: data.topic || "",
                    audience: data.audience || "",
                    duration: data.duration || "",
                    feedbackItems: data.feedbackItems || [],
                    materialUrl: data.presentationMaterial?.url || null,
                    conditions: data.conditions || [],
                }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `분석 API 오류 (HTTP ${res.status})`);
            }

            const analysisResult = await res.json();
            console.log("[Simulation] 분석 완료 → analysisData 기록");

            // ★ 분석 결과는 별도 필드 analysisData 에 저장.
            //   status('completed') 와 result(영상 정보) 는 Unity 가 쓴 그대로 보존.
            await updateDoc(doc(db, "simulations", code), {
                analysisData: analysisResult,
                analysisInProgress: false,
            });
            // 이후 onSnapshot 이 analysisData 감지 → /analysis 이동
        } catch (e) {
            console.error("[Simulation] 분석 실패:", e);
            setError(`AI 분석 중 오류가 발생했습니다: ${e.message}`);
            // analyzeTriggeredRef 는 true 유지 (무한 재시도 방지). 페이지 새로고침으로 재시도 가능.
            try {
                await updateDoc(doc(db, "simulations", code), { analysisInProgress: false });
            } catch (_) { }
        }
    };

    useEffect(() => {
        if (!code) return;

        const ref = doc(db, "simulations", code);
        const unsub = onSnapshot(
            ref,
            (snap) => {
                if (!snap.exists()) {
                    setError("해당 코드의 시뮬레이션 정보를 찾을 수 없습니다.");
                    return;
                }
                const data = snap.data();
                setStatus(data.status || "waiting");

                // ─────────────────────────────────────────────
                // 1. 업로드/처리 실패
                // ─────────────────────────────────────────────
                if (data.status === "upload_failed" || data.status === "failed") {
                    setError(`업로드 실패: ${data.errorMessage || "알 수 없는 오류"}`);
                    return;
                }

                // ─────────────────────────────────────────────
                // 2. 분석 결과(analysisData) 준비됨 → 분석 페이지로 이동
                // ─────────────────────────────────────────────
                if (data.analysisData) {
                    sessionStorage.setItem("analysisResult", JSON.stringify(data.analysisData));
                    sessionStorage.setItem("videoName", `시뮬레이션 (${code})`);
                    const vUrl = data.result?.videoUrl || data.videoUrl;
                    if (vUrl) sessionStorage.setItem("videoUrl", vUrl);
                    else sessionStorage.removeItem("videoUrl");
                    router.push("/analysis");
                    return;
                }

                // ─────────────────────────────────────────────
                // 3. 신규 흐름: Unity 가 status='completed' + result.videoUrl 기록
                //    → 웹이 Gemini 분석 트리거 (analysisInProgress 로 중복 방지)
                // ─────────────────────────────────────────────
                if (
                    data.status === "completed" &&
                    data.result?.videoUrl &&
                    !data.analysisInProgress &&
                    !analyzeTriggeredRef.current
                ) {
                    analyzeTriggeredRef.current = true;
                    runAnalysis(data);
                    return;
                }

                // ─────────────────────────────────────────────
                // 4. 레거시: status='analysis' (이전 Unity 흐름) — 하위 호환
                // ─────────────────────────────────────────────
                if (
                    data.status === "analysis" &&
                    data.videoUrl &&
                    !analyzeTriggeredRef.current
                ) {
                    analyzeTriggeredRef.current = true;
                    runAnalysis(data);
                    return;
                }

                // ─────────────────────────────────────────────
                // 5. 레거시: status='completed' + result 에 분석 데이터 직접 포함
                //    (이전 Unity raw 흐름 or 이전 웹 result 흐름)
                // ─────────────────────────────────────────────
                if (data.status === "completed" && data.result) {
                    const hasAnalysisFields =
                        data.result.timestamps !== undefined ||
                        data.result.scores !== undefined ||
                        data.result.summary !== undefined ||
                        data.result.feedbackText !== undefined;
                    if (!hasAnalysisFields) return; // 영상 정보만 있음 → 3번이 곧 트리거

                    let analysisData;
                    if (data.resultSource === "web" || data.result.timestamps !== undefined) {
                        analysisData = data.result;
                    } else {
                        analysisData = adaptUnityResultToAnalysis(data.result);
                    }
                    sessionStorage.setItem("analysisResult", JSON.stringify(analysisData));
                    sessionStorage.setItem("videoName", `시뮬레이션 (${code})`);
                    const vUrl = data.result?.videoUrl || data.videoUrl;
                    if (vUrl) sessionStorage.setItem("videoUrl", vUrl);
                    else sessionStorage.removeItem("videoUrl");
                    router.push("/analysis");
                }
            },
            (err) => {
                console.error("[Simulation] 구독 실패:", err);
                setError("실시간 연결에 실패했습니다. 네트워크를 확인해주세요.");
            }
        );

        return () => unsub();
    }, [code, router]);

    const formatTime = (s) => {
        const m = Math.floor(s / 60);
        const sec = (s % 60).toString().padStart(2, "0");
        return `${m}:${sec}`;
    };

    const copyCode = async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopyStatus("복사됨");
            setTimeout(() => setCopyStatus(""), 1500);
        } catch {
            setCopyStatus("복사 실패");
        }
    };

    const cancelSimulation = async () => {
        if (!confirm("시뮬레이션을 취소하시겠습니까?")) return;
        try {
            await updateDoc(doc(db, "simulations", code), { status: "cancelled" });
        } catch (err) {
            console.error("[Simulation] 취소 실패:", err);
        }
        router.push("/dashboard");
    };

    if (error) {
        return (
            <main className="sim-wait-page">
                <div className="sim-wait-content">
                    <div className="sim-wait-error-icon">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                    </div>
                    <h1 className="sim-wait-title">연결 오류</h1>
                    <p className="sim-wait-error">{error}</p>
                    <button className="btn-primary" onClick={() => router.push("/prepare")}>
                        다시 시도하기
                    </button>
                </div>
            </main>
        );
    }

    return (
        <main className="sim-wait-page">
            <div className="sim-wait-content">
                <div className="sim-wait-code-block">
                    <span className="sim-wait-code-label">시뮬레이션 코드</span>
                    <div className="sim-wait-code-row">
                        <span className="sim-wait-code">{code}</span>
                        <button type="button" className="sim-wait-copy" onClick={copyCode}>
                            {copyStatus || "복사"}
                        </button>
                    </div>
                    <p className="sim-wait-code-hint">
                        Unity 시뮬레이션에서 위 코드를 입력하면 발표 정보가 전달됩니다.
                    </p>
                </div>

                <div className="sim-wait-spinner-container">
                    <div className="spinner-ring"></div>
                </div>

                <h1 className="sim-wait-title">{STATUS_LABEL[status] || "대기 중"}</h1>
                <p className="sim-wait-subtitle">
                    시뮬레이션이 종료되면 자동으로 분석 결과 화면으로 이동합니다.
                </p>

                <div className="sim-wait-time">경과 시간: {formatTime(elapsed)}</div>

                <div className="sim-wait-steps">
                    <div className={`sim-wait-step ${status !== "waiting" ? "completed" : "active"}`}>
                        <div className="step-indicator">
                            {status !== "waiting" ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            ) : (
                                <div className="step-spinner"></div>
                            )}
                        </div>
                        <span className="step-label">Unity 시뮬레이션 연결</span>
                    </div>
                    <div
                        className={`sim-wait-step ${["completed", "analysis", "analyzing"].includes(status) ? "completed" : status === "in_progress" ? "active" : ""
                            }`}
                    >
                        <div className="step-indicator">
                            {["completed", "analysis", "analyzing"].includes(status) ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            ) : status === "in_progress" ? (
                                <div className="step-spinner"></div>
                            ) : (
                                <span>2</span>
                            )}
                        </div>
                        <span className="step-label">발표 진행 및 데이터 수집</span>
                    </div>
                    <div className={`sim-wait-step ${["completed", "analysis", "analyzing"].includes(status) ? "active" : ""}`}>
                        <div className="step-indicator">
                            {["completed", "analysis", "analyzing"].includes(status) ? <div className="step-spinner"></div> : <span>3</span>}
                        </div>
                        <span className="step-label">분석 결과 수신</span>
                    </div>
                </div>

                <button type="button" className="sim-wait-cancel" onClick={cancelSimulation}>
                    시뮬레이션 취소
                </button>
            </div>
        </main>
    );
}
