"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthProvider";
import { adaptUnityResultToAnalysis } from "../../lib/unityResultAdapter";

const STATUS_LABEL = {
    waiting: "Unity 시뮬레이션 연결 대기 중",
    in_progress: "시뮬레이션 진행 중",
    completed: "분석 결과 처리 중",
};

export default function SimulationWaitingPage({ params }) {
    const router = useRouter();
    const { code } = params;
    const { user, authLoading } = useAuth();

    const [status, setStatus] = useState("waiting");
    const [error, setError] = useState("");
    const [elapsed, setElapsed] = useState(0);
    const [copyStatus, setCopyStatus] = useState("");

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
            (snap) => {
                if (!snap.exists()) {
                    setError("해당 코드의 시뮬레이션 정보를 찾을 수 없습니다.");
                    return;
                }
                const data = snap.data();
                setStatus(data.status || "waiting");

                if (data.status === "completed" && data.result) {
                    // ★ Unity 결과를 원본 analysis 페이지가 기대하는 형식으로 어댑팅
                    //   분석 페이지 자체는 절대 수정하지 않고, 데이터만 변환
                    const unityRaw = data.result;
                    const adapted = adaptUnityResultToAnalysis(unityRaw);
                    sessionStorage.setItem("analysisResult", JSON.stringify(adapted));
                    sessionStorage.setItem("videoName", `시뮬레이션 (${code})`);
                    // Unity 결과 videoUrl 저장 (Firebase Storage URL)
                    if (unityRaw.videoUrl) {
                        sessionStorage.setItem("videoUrl", unityRaw.videoUrl);
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
