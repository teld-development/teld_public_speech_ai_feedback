"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/AuthProvider";
import { doc, getDoc } from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { db, functions, storage } from "../lib/firebase";
import { completePresentationAttempt, failPresentationAttempt, markAttemptAnalyzing } from "../lib/presentations";
import { readJsonResponse } from "../lib/httpResponse";

// IndexedDB 유틸리티
const DB_NAME = "VideoAnalysisDB";
const STORE_NAME = "pendingVideos";

const openDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
};

const getVideoDB = async (key) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
};

const deleteVideoDB = async (key) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
};

const ANALYSIS_STEPS = [
    { id: "upload", label: "클라우드에 업로드 중" },
    { id: "transfer", label: "Gemini로 전송 중" },
    { id: "analyze", label: "AI 분석 진행 중" },
    { id: "generate", label: "피드백 생성 중" },
];
const ANALYSIS_POLL_INTERVAL_MS = 10000;
const ANALYSIS_POLL_MAX_MS = 2 * 60 * 60 * 1000;

async function getAttemptAnalysisResult(user, presentationId, attemptId) {
    if (!user?.uid || !presentationId || !attemptId) return null;
    const attemptRef = doc(db, "users", user.uid, "presentations", presentationId, "attempts", attemptId);
    const attemptSnap = await getDoc(attemptRef);
    if (!attemptSnap.exists()) return null;
    const attempt = attemptSnap.data();
    return extractAnalysisResult(attempt);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isAnalysisResult(value) {
    return Boolean(
        value &&
        typeof value === "object" &&
        (
            Array.isArray(value.timestamps) ||
            value.scores ||
            value.summary
        )
    );
}

function extractAnalysisResult(payload) {
    if (!payload || typeof payload !== "object") return null;
    // 아직 분석 중인 attempt 문서는 결과로 반환하지 않음
    if (payload.status && payload.status !== "completed") return null;
    if (isAnalysisResult(payload.analysisResult)) return payload.analysisResult;
    if (isAnalysisResult(payload.result)) return payload.result;
    if (isAnalysisResult(payload.data?.analysisResult)) return payload.data.analysisResult;
    if (isAnalysisResult(payload)) return payload;
    return null;
}

async function resolveStorageFunctionAnalysis(user, presentationId, attemptId, initialData, onPending) {
    let payload = initialData || {};
    const startedAt = Date.now();
    let pollCount = 0;
    const resumeAnalysis = httpsCallable(functions, "resumePresentationAnalysis", {
        timeout: 540000,
    });

    while (Date.now() - startedAt < ANALYSIS_POLL_MAX_MS) {
        const payloadResult = extractAnalysisResult(payload);
        if (payloadResult) return payloadResult;

        const storedResult = await getAttemptAnalysisResult(user, presentationId, attemptId);
        if (storedResult) return storedResult;

        onPending?.(payload, pollCount);
        await sleep(ANALYSIS_POLL_INTERVAL_MS);
        const resumed = await resumeAnalysis({ presentationId, attemptId });
        payload = resumed.data || {};
        pollCount += 1;
    }

    const storedResult = await getAttemptAnalysisResult(user, presentationId, attemptId);
    if (storedResult) return storedResult;

    throw new Error("분석이 아직 처리 중입니다. 발표 기록에서 완료 상태를 확인하거나 잠시 후 다시 열어주세요.");
}

export default function LoadingPage() {
    const router = useRouter();
    const { user, authLoading } = useAuth();
    const [currentStep, setCurrentStep] = useState(0);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState("");
    const [elapsedTime, setElapsedTime] = useState(0);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [retryPath, setRetryPath] = useState("/dashboard");

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            router.replace("/");
            return;
        }

        // 시간 카운터
        const timer = setInterval(() => {
            setElapsedTime((prev) => prev + 1);
        }, 1000);

        const startAnalysis = async () => {
            let activeAttempt = null;
            let usedPendingAnalysis = false;
            try {
                const pendingAnalysisRaw = sessionStorage.getItem("pendingAnalysis");
                let pendingAnalysis = null;
                if (pendingAnalysisRaw) {
                    try {
                        pendingAnalysis = JSON.parse(pendingAnalysisRaw);
                        usedPendingAnalysis = true;
                    } catch (parseErr) {
                        console.warn("[Loading] pendingAnalysis 파싱 실패:", parseErr);
                        sessionStorage.removeItem("pendingAnalysis");
                    }
                }

                // IndexedDB 또는 사전 업로드된 영상 데이터 가져오기
                const videoData = pendingAnalysis || await getVideoDB("pendingVideo");

                if (!videoData) {
                    setError("분석할 데이터가 없습니다. 대시보드에서 발표 세션을 열고 영상을 다시 업로드해주세요.");
                    clearInterval(timer);
                    return;
                }

                const { buffer, name, type, prepareData, presentationId, attemptId, recordingUpload, blobResult: preuploadedBlobResult } = videoData;
                activeAttempt = { presentationId, attemptId };
                setRetryPath(presentationId ? `/presentations/${presentationId}` : "/dashboard");

                // ArrayBuffer를 Blob으로 변환
                const blob = buffer ? new Blob([buffer], { type }) : null;
                const file = blob ? new File([blob], name, { type }) : null;

                // ===== Step 1: API 경유 서버 업로드 (CORS 우회) =====
                setCurrentStep(0);
                setProgress(5);

                console.log(preuploadedBlobResult?.url ? "[Loading] 사전 업로드된 영상 사용" : "[Loading] 서버 경유 업로드 시작...");

                let blobResult = preuploadedBlobResult || null;
                try {
                    if (blobResult?.url) {
                        setUploadProgress(100);
                        setProgress(30);
                    } else if (recordingUpload?.rawVideoPath) {
                        if (!file) throw new Error("업로드할 영상 파일을 찾을 수 없습니다.");
                        blobResult = await new Promise((resolve, reject) => {
                            const ref = storageRef(storage, recordingUpload.rawVideoPath);
                            const task = uploadBytesResumable(ref, file, {
                                contentType: file.type || recordingUpload.mimeType || "video/mp4",
                                customMetadata: {
                                    ownerUid: user.uid,
                                    presentationId: presentationId || "",
                                    attemptId: attemptId || "",
                                    sourceType: "upload",
                                },
                            });

                            task.on(
                                "state_changed",
                                (snapshot) => {
                                    const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                                    setUploadProgress(pct);
                                    setProgress(Math.min(5 + Math.round(pct * 0.2), 25));
                                },
                                reject,
                                async () => {
                                    const url = await getDownloadURL(task.snapshot.ref);
                                    resolve({
                                        url,
                                        storagePath: recordingUpload.rawVideoPath,
                                        fileName: recordingUpload.fileName || file.name,
                                        mimeType: file.type || recordingUpload.mimeType || "video/mp4",
                                    });
                                }
                            );
                        });
                    } else {
                        if (!file) throw new Error("업로드할 영상 파일을 찾을 수 없습니다.");
                        blobResult = await new Promise((resolve, reject) => {
                            const xhr = new XMLHttpRequest();
                            xhr.open('POST', `/api/upload-blob?filename=${encodeURIComponent(file.name)}`);
                            xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
                            xhr.upload.addEventListener('progress', (e) => {
                                if (e.lengthComputable) {
                                    const pct = Math.round((e.loaded / e.total) * 100);
                                    setUploadProgress(pct);
                                    setProgress(Math.min(5 + Math.round(pct * 0.2), 25));
                                }
                            });
                            xhr.onload = () => {
                                if (xhr.status >= 200 && xhr.status < 300) {
                                    try {
                                        resolve(JSON.parse(xhr.responseText));
                                    } catch (parseErr) {
                                        reject(new Error("업로드 서버 응답을 해석하지 못했습니다."));
                                    }
                                } else {
                                    let msg = `HTTP ${xhr.status}`;
                                    try { msg = JSON.parse(xhr.responseText).error || msg; } catch (_) {}
                                    reject(new Error(msg));
                                }
                            };
                            xhr.onerror = () => reject(new Error('네트워크 오류가 발생했습니다.'));
                            xhr.send(file);
                        });
                    }
                } catch (uploadError) {
                    console.error("[Loading] 업로드 실패:", uploadError);
                    throw new Error("영상 업로드에 실패했습니다: " + uploadError.message);
                }

                console.log("[Loading] 업로드 완료:", blobResult.url);
                if (!preuploadedBlobResult?.url && presentationId && attemptId) {
                    await markAttemptAnalyzing(user, presentationId, attemptId, {
                        video: {
                            videoUrl: blobResult.url,
                            storagePath: blobResult.storagePath || recordingUpload?.rawVideoPath || "",
                            fileName: blobResult.fileName || name,
                            mimeType: blobResult.mimeType || type || "video/mp4",
                        },
                    });
                }

                // ===== 발표 자료 업로드 (있는 경우만) =====
                let materialUrl = null;
                if (prepareData.presentationMaterial?.url) {
                    materialUrl = prepareData.presentationMaterial.url;
                    console.log("[Loading] 발표 자료 Firebase Storage URL 사용:", materialUrl);
                } else if (prepareData.presentationMaterial?.base64) {
                    console.log("[Loading] 발표 자료 업로드 시작...");
                    try {
                        const binaryString = atob(prepareData.presentationMaterial.base64);
                        const bytes = new Uint8Array(binaryString.length);
                        for (let i = 0; i < binaryString.length; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                        }
                        const materialBlob = new Blob([bytes], { type: prepareData.presentationMaterial.type });
                        const materialFile = new File([materialBlob], prepareData.presentationMaterial.name, { type: prepareData.presentationMaterial.type });

                        const matResponse = await fetch(
                            `/api/upload-blob?filename=${encodeURIComponent(materialFile.name)}`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': materialFile.type || 'application/pdf' },
                                body: materialFile,
                            }
                        );
                        const materialResult = await readJsonResponse(matResponse, "발표 자료 업로드에 실패했습니다.");
                        if (!matResponse.ok) throw new Error(materialResult?.error || `HTTP ${matResponse.status}`);
                        materialUrl = materialResult.url;
                        console.log("[Loading] 발표 자료 업로드 완료:", materialUrl);
                    } catch (lpError) {
                        console.warn("[Loading] 발표 자료 업로드 실패 (계속 진행):", lpError.message);
                    }
                }

                setProgress(30);
                setCurrentStep(1);

                // ===== Step 2: 분석 API 호출 =====
                console.log("[Loading] 분석 API 호출 시작...");

                // 진행률 시뮬레이션
                let simulatedProgress = 30;
                const progressInterval = setInterval(() => {
                    simulatedProgress += 1;
                    if (simulatedProgress <= 85) {
                        setProgress(simulatedProgress);
                        if (simulatedProgress === 50) setCurrentStep(2);
                        if (simulatedProgress === 75) setCurrentStep(3);
                    }
                }, 1000);

                const storagePath = blobResult.storagePath || recordingUpload?.rawVideoPath || "";
                const canUseStorageFunction = Boolean(functions && presentationId && attemptId && storagePath);
                let analysisResult = null;
                let analysisCompletedByFunction = false;

                if (canUseStorageFunction) {
                    const analyzeFromStorage = httpsCallable(functions, "analyzePresentationFromStorage", {
                        timeout: 540000,
                    });
                    const callableResult = await analyzeFromStorage({
                        presentationId,
                        attemptId,
                        video: {
                            bucket: recordingUpload?.bucket || blobResult.bucket || "",
                            storagePath,
                            videoUrl: blobResult.url,
                            fileName: blobResult.fileName || name,
                            mimeType: blobResult.mimeType || type || "video/mp4",
                        },
                        material: prepareData.presentationMaterial?.path
                            ? {
                                bucket: recordingUpload?.bucket || blobResult.bucket || "",
                                storagePath: prepareData.presentationMaterial.path,
                                mimeType: prepareData.presentationMaterial.type || "application/pdf",
                            }
                            : null,
                        topic: prepareData.topic || "",
                        audience: prepareData.audience || "",
                        duration: prepareData.duration || "",
                        feedbackItems: prepareData.feedbackItems || [],
                        conditions: prepareData.conditions || [],
                    });
                    analysisResult = await resolveStorageFunctionAnalysis(
                        user,
                        presentationId,
                        attemptId,
                        callableResult.data || {},
                        (payload, pollCount) => {
                            if (payload.stage === "transcribing") {
                                setCurrentStep(2);
                                setProgress(Math.min(85, 50 + Math.floor(pollCount / 2)));
                            }
                        }
                    );
                    analysisCompletedByFunction = true;
                } else {
                    const analyzeResponse = await fetch("/api/analyze", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            blobUrl: blobResult.url,
                            fileName: name,
                            mimeType: type,
                            topic: prepareData.topic || "",
                            audience: prepareData.audience || "",
                            duration: prepareData.duration || "",
                            feedbackItems: prepareData.feedbackItems || [],
                            materialUrl: materialUrl,
                            conditions: prepareData.conditions || [],
                            bucket: recordingUpload?.bucket || blobResult.bucket || "",
                            storagePath: blobResult.storagePath || recordingUpload?.rawVideoPath || "",
                        }),
                    });

                    analysisResult = await readJsonResponse(analyzeResponse, "분석에 실패했습니다.");
                    if (!analyzeResponse.ok) {
                        throw new Error(analysisResult?.error || "분석에 실패했습니다.");
                    }
                }

                clearInterval(progressInterval);
                setProgress(90);
                setCurrentStep(3);
                console.log("[Loading] 분석 완료");

                setProgress(95);

                if (!analysisResult && presentationId && attemptId) {
                    analysisResult = await getAttemptAnalysisResult(user, presentationId, attemptId);
                }

                if (!analysisResult) {
                    throw new Error("분석은 완료되었지만 결과 데이터를 불러오지 못했습니다. 잠시 후 발표 기록에서 다시 확인해주세요.");
                }

                if (presentationId && attemptId && !analysisCompletedByFunction) {
                    await completePresentationAttempt(user, presentationId, attemptId, analysisResult, {
                        video: {
                            videoUrl: blobResult.url,
                            storagePath: blobResult.storagePath || recordingUpload?.rawVideoPath || "",
                            fileName: blobResult.fileName || name,
                            mimeType: blobResult.mimeType || type || "video/mp4",
                        },
                    });
                }

                // 결과 저장
                sessionStorage.setItem("analysisResult", JSON.stringify(analysisResult));
                sessionStorage.setItem("prepareData", JSON.stringify({
                    duration: prepareData.duration || "",
                    feedbackItems: prepareData.feedbackItems || [],
                }));
                if (presentationId && attemptId) {
                    sessionStorage.setItem("analysisContext", JSON.stringify({
                        presentationId,
                        attemptId,
                        attemptNo: videoData.attemptNo || null,
                        reflectionNote: "",
                        reflectionFields: {},
                    }));
                }

                // 비디오 URL 저장 (재생용)
                const videoUrl = blob ? URL.createObjectURL(blob) : blobResult.url;
                sessionStorage.setItem("videoUrl", videoUrl);
                sessionStorage.setItem("videoName", name);

                // 임시 데이터 정리
                if (usedPendingAnalysis) {
                    sessionStorage.removeItem("pendingAnalysis");
                } else {
                    await deleteVideoDB("pendingVideo");
                }

                setProgress(100);

                // 잠시 대기 후 결과 페이지로 이동
                await new Promise((resolve) => setTimeout(resolve, 800));
                router.push("/analysis");

            } catch (err) {
                console.error("[Loading] 분석 오류:", err);
                if (activeAttempt?.presentationId && activeAttempt?.attemptId) {
                    try {
                        await failPresentationAttempt(
                            user,
                            activeAttempt.presentationId,
                            activeAttempt.attemptId,
                            err.message || "영상 분석 중 오류가 발생했습니다."
                        );
                    } catch (failErr) {
                        console.error("[Loading] 회차 실패 상태 저장 실패:", failErr);
                    }
                }
                if (usedPendingAnalysis) {
                    sessionStorage.removeItem("pendingAnalysis");
                }
                setError(err.message || "영상 분석 중 오류가 발생했습니다.");
                clearInterval(timer);
            }
        };

        startAnalysis();

        return () => clearInterval(timer);
    }, [authLoading, router, user]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    if (error) {
        return (
            <main className="loading-page">
                <div className="loading-content">
                    <div className="loading-error-icon">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                    </div>
                    <h1 className="loading-title">분석 오류</h1>
                    <p className="loading-error-message">{error}</p>
                    <button className="btn-primary" onClick={() => router.push(retryPath)}>
                        발표 세션으로 이동
                    </button>
                </div>
            </main>
        );
    }

    return (
        <main className="loading-page">
            <div className="loading-content">
                {/* 스피너 */}
                <div className="loading-spinner-container">
                    <div className="spinner-ring"></div>
                    <div className="spinner-percent">{progress}%</div>
                </div>

                {/* 제목 */}
                <h1 className="loading-title">발표 영상 분석 중</h1>
                <p className="loading-subtitle">AI가 영상을 분석하고 있습니다. 약 1~2분 정도 소요됩니다.</p>

                {/* 경과 시간 */}
                <div className="loading-time">
                    <span>경과 시간: {formatTime(elapsedTime)}</span>
                </div>

                {/* 전체 진행바 */}
                <div className="loading-progress-container">
                    <div className="loading-progress-bar">
                        <div
                            className="loading-progress-fill"
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                </div>

                {/* 업로드 진행률 (첫 번째 단계에서만 표시) */}
                {currentStep === 0 && uploadProgress > 0 && (
                    <div className="upload-progress-detail">
                        업로드 진행률: {uploadProgress}%
                    </div>
                )}

                {/* 단계별 상태 */}
                <div className="loading-steps">
                    {ANALYSIS_STEPS.map((step, index) => (
                        <div
                            key={step.id}
                            className={`loading-step-item ${index < currentStep ? "completed" :
                                index === currentStep ? "active" : ""
                                }`}
                        >
                            <div className="step-indicator">
                                {index < currentStep ? (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                ) : index === currentStep ? (
                                    <div className="step-spinner"></div>
                                ) : (
                                    <span>{index + 1}</span>
                                )}
                            </div>
                            <span className="step-label">{step.label}</span>
                        </div>
                    ))}
                </div>

                {/* 안내 메시지 */}
                <p className="loading-hint">
                    페이지를 닫지 마세요. 분석이 완료되면 자동으로 이동합니다.
                </p>
            </div>
        </main>
    );
}
