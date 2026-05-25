"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { db, storage } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthProvider";
import {
    completePresentationAttempt,
    deletePresentationAttempt,
    failPresentationAttempt,
    markAttemptAnalyzing,
} from "../../lib/presentations";

const STATUS_LABEL = {
    waiting: "Unity 시뮬레이션 연결 대기 중",
    in_progress: "시뮬레이션 진행 중",
    completed: "AI 분석 진행 중",
};

export default function SimulationWaitingPage({ params }) {
    const router = useRouter();
    const { code } = params;
    const { user, authLoading } = useAuth();

    const [status, setStatus] = useState("waiting");
    const [error, setError] = useState("");
    const [elapsed, setElapsed] = useState(0);
    const [copyStatus, setCopyStatus] = useState("");
    const [simulationData, setSimulationData] = useState(null);
    const analysisStartedRef = useRef(false);

    useEffect(() => {
        const timer = setInterval(() => setElapsed((p) => p + 1), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            router.replace("/");
            return;
        }
        if (!code) return;

        const ref = doc(db, "simulations", code);
        const unsub = onSnapshot(
            ref,
            async (snap) => {
                if (!snap.exists()) {
                    setError("해당 코드의 시뮬레이션 정보를 찾을 수 없습니다.");
                    return;
                }
                const data = snap.data();
                setSimulationData(data);
                setStatus(data.status || "waiting");

                if (data.status === "completed" && data.result && !analysisStartedRef.current) {
                    analysisStartedRef.current = true;
                    const unityRaw = data.result;
                    let videoUrl = unityRaw.videoUrl;

                    if (!videoUrl && unityRaw.storagePath) {
                        try {
                            videoUrl = await getDownloadURL(storageRef(storage, unityRaw.storagePath));
                        } catch (urlErr) {
                            console.error("[Simulation] Storage URL 조회 실패:", urlErr);
                        }
                    }

                    if (!videoUrl) {
                        if (data.presentationId && data.attemptId) {
                            await failPresentationAttempt(user, data.presentationId, data.attemptId, "Unity 결과에 영상 URL이 없습니다.");
                        }
                        setError("Unity 결과에 영상 URL이 없어 AI 분석을 실행할 수 없습니다.");
                        return;
                    }

                    (async () => {
                        try {
                            if (data.presentationId && data.attemptId) {
                                await markAttemptAnalyzing(user, data.presentationId, data.attemptId, {
                                    video: {
                                        videoUrl,
                                        storagePath: unityRaw.storagePath || "",
                                        fileName: unityRaw.fileName || `simulation_${code}.mp4`,
                                        mimeType: unityRaw.mimeType || unityRaw.videoMimeType || "video/mp4",
                                    },
                                });
                            }

                            const analyzeResponse = await fetch("/api/analyze", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    blobUrl: videoUrl,
                                    fileName: unityRaw.fileName || `simulation_${code}.mp4`,
                                    mimeType: unityRaw.mimeType || unityRaw.videoMimeType || "video/mp4",
                                    topic: data.topic || "",
                                    audience: data.audience || "",
                                    duration: data.duration || "",
                                    feedbackItems: data.feedbackItems || [],
                                    materialUrl: data.presentationMaterial?.url || data.simulation?.pdfUrl || null,
                                    conditions: data.conditions || [],
                                }),
                            });

                            if (!analyzeResponse.ok) {
                                let message = "분석에 실패했습니다.";
                                try {
                                    const errorData = await analyzeResponse.json();
                                    message = errorData.error || message;
                                } catch { }
                                throw new Error(message);
                            }

                            const analysisResult = await analyzeResponse.json();

                            if (data.presentationId && data.attemptId) {
                                await completePresentationAttempt(user, data.presentationId, data.attemptId, analysisResult, {
                                    video: {
                                        videoUrl,
                                        storagePath: unityRaw.storagePath || "",
                                        fileName: unityRaw.fileName || `simulation_${code}.mp4`,
                                        mimeType: unityRaw.mimeType || unityRaw.videoMimeType || "video/mp4",
                                    },
                                    simulation: {
                                        code,
                                        backendSessionId: data.backendSessionId || "",
                                    },
                                });
                            }

                            sessionStorage.setItem("analysisResult", JSON.stringify(analysisResult));
                            sessionStorage.setItem("videoName", `시뮬레이션 (${code})`);
                            sessionStorage.setItem("videoUrl", videoUrl);
                            if (data.feedbackItems) {
                                sessionStorage.setItem("prepareData", JSON.stringify({
                                    feedbackItems: data.feedbackItems || [],
                                }));
                            }
                            router.push("/analysis");
                        } catch (err) {
                            console.error("[Simulation] AI 분석 실패:", err);
                            if (data.presentationId && data.attemptId) {
                                try {
                                    await failPresentationAttempt(user, data.presentationId, data.attemptId, err.message || "AI 분석 중 오류가 발생했습니다.", {
                                        simulation: {
                                            code,
                                            backendSessionId: data.backendSessionId || "",
                                        },
                                    });
                                } catch (failErr) {
                                    console.error("[Simulation] 회차 실패 상태 저장 실패:", failErr);
                                }
                            }
                            analysisStartedRef.current = false;
                            setError(err.message || "AI 분석 중 오류가 발생했습니다.");
                        }
                    })();
                }
            },
            (err) => {
                console.error("[Simulation] 구독 실패:", err);
                setError("실시간 연결에 실패했습니다. 네트워크를 확인해주세요.");
            }
        );

        return () => unsub();
    }, [authLoading, code, router, user]);

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
            if (simulationData?.presentationId && simulationData?.attemptId) {
                if ((simulationData.status || "waiting") === "waiting") {
                    await deletePresentationAttempt(user, simulationData.presentationId, simulationData.attemptId);
                } else {
                    await failPresentationAttempt(user, simulationData.presentationId, simulationData.attemptId, "사용자가 시뮬레이션을 취소했습니다.");
                }
            }
        } catch (err) {
            console.error("[Simulation] 취소 실패:", err);
        }
        router.push(simulationData?.presentationId ? `/presentations/${simulationData.presentationId}` : "/dashboard");
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
                        className={`sim-wait-step ${status === "completed" ? "completed" : status === "in_progress" ? "active" : ""
                            }`}
                    >
                        <div className="step-indicator">
                            {status === "completed" ? (
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
                    <div className={`sim-wait-step ${status === "completed" ? "active" : ""}`}>
                        <div className="step-indicator">
                            {status === "completed" ? <div className="step-spinner"></div> : <span>3</span>}
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
