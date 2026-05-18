"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { adaptUnityResultToAnalysis } from "../../lib/unityResultAdapter";

const STATUS_LABEL = {
    waiting: "Unity 시뮬레이션 연결 대기 중",
    in_progress: "시뮬레이션 진행 중",
    analysis: "AI 분석 준비 중...",
    analyzing: "AI 분석 중... (1~2분 소요)",
    completed: "분석 결과 처리 중",
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

    // simulations 문서 데이터로 /api/analyze 호출 → 결과를 Firestore 에 completed 기록
    const runAnalysis = async (data) => {
        try {
            console.log("[Simulation] /api/analyze 분석 시작");
            // ★ 'analyzing' 으로 선점 — 새로고침/타 기기에서 중복 Gemini 호출 방지
            await updateDoc(doc(db, "simulations", code), { status: "analyzing" });

            const res = await fetch("/api/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    blobUrl: data.videoUrl,
                    fileName: `simulation_${code}.mp4`,
                    mimeType: "video/mp4",
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
            console.log("[Simulation] 분석 완료 → Firestore 에 completed 기록");

            // ★ 결과 + completed 를 Firestore 에 기록 (다른 기기/새로고침해도 유지)
            await updateDoc(doc(db, "simulations", code), {
                status: "completed",
                result: analysisResult,
                resultSource: "web", // adaptUnityResultToAnalysis 안 거치도록 표시
            });
            // 이후 onSnapshot 이 completed 감지 → /analysis 이동
        } catch (e) {
            console.error("[Simulation] 분석 실패:", e);
            setError(`AI 분석 중 오류가 발생했습니다: ${e.message}`);
            analyzeTriggeredRef.current = false; // 재시도 가능하도록 가드 해제
            // 상태를 'analysis' 로 되돌려 재시도 가능하게
            try {
                await updateDoc(doc(db, "simulations", code), { status: "analysis" });
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
                // ★ status='analysis' : Unity 가 영상 업로드 + 상태만 바꾸고 떠난 상태.
                //   웹이 /api/analyze (Gemini) 분석을 트리거하고 결과를 Firestore 에 기록.
                // ─────────────────────────────────────────────
                if (
                    data.status === "analysis" &&
                    data.videoUrl &&
                    !analyzeTriggeredRef.current
                ) {
                    analyzeTriggeredRef.current = true; // 중복 호출 방지
                    runAnalysis(data);
                    return;
                }

                // ─────────────────────────────────────────────
                // ★ status='completed' : 결과 준비됨 → 분석 페이지로 이동
                // ─────────────────────────────────────────────
                if (data.status === "completed" && data.result) {
                    let analysisData;
                    if (data.resultSource === "web") {
                        // 웹 /api/analyze 결과 — 이미 분석 페이지 형식. 변환 불필요.
                        analysisData = data.result;
                    } else {
                        // 레거시: Unity raw 결과 → 어댑터로 변환 (하위 호환)
                        analysisData = adaptUnityResultToAnalysis(data.result);
                    }
                    sessionStorage.setItem("analysisResult", JSON.stringify(analysisData));
                    sessionStorage.setItem("videoName", `시뮬레이션 (${code})`);
                    const vUrl = data.videoUrl || data.result?.videoUrl;
                    if (vUrl) {
                        sessionStorage.setItem("videoUrl", vUrl);
                    } else {
                        sessionStorage.removeItem("videoUrl");
                    }
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
