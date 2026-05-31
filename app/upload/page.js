"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytesResumable } from "firebase/storage";
import { useAuth } from "../lib/AuthProvider";
import { storage } from "../lib/firebase";
import {
    buildRecordingUpload,
    createPresentationAttempt,
    createPresentationSession,
    deletePresentationAttempt,
    deletePresentationSession,
    failPresentationAttempt,
    getPresentationSession,
    markAttemptAnalyzing,
} from "../lib/presentations";

function UploadPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, authLoading } = useAuth();
    const fileInputRef = useRef(null);
    const presentationId = searchParams.get("presentationId");

    const [videoFile, setVideoFile] = useState(null);
    const [dragActive, setDragActive] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [error, setError] = useState("");

    // prepare 페이지에서 저장된 정보 가져오기
    const [prepareData, setPrepareData] = useState({
        topic: "",
        audience: "",
        duration: "",
        feedbackItems: [],
        presentationMaterial: null,
        conditions: []
    });

    useEffect(() => {
        if (!authLoading && !user) {
            router.replace("/");
        }
    }, [authLoading, router, user]);

    useEffect(() => {
        if (authLoading || !user) return;

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
                        feedbackItems: [],
                        conditions: [],
                        ownerUid: user.uid,
                        ownerEmail: user.email || "",
                        presentationMaterial: presentation.presentationMaterial || null,
                    });
                })
                .catch((err) => {
                    console.error("[Upload] 발표 세션 로드 실패:", err);
                    router.replace("/dashboard");
                });
            return;
        }

        // sessionStorage에서 prepare 데이터 로드
        const savedData = sessionStorage.getItem("prepareData");
        if (savedData) {
            setPrepareData(JSON.parse(savedData));
        }
    }, [authLoading, presentationId, router, user]);

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith("video/")) {
            setVideoFile(file);
            setError("");
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setVideoFile(file);
            setError("");
        }
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    const handleUpload = async () => {
        if (!videoFile || !user) return;

        setUploading(true);
        setUploadProgress(0);
        setError("");

        let attempt = null;
        let createdAttemptPresentationId = null;
        let createdStandalonePresentationId = null;
        let uploadedStoragePath = null;

        try {
            let recordingUpload = null;

            {
                let targetPresentationId = presentationId;
                let targetPrepareData = prepareData;

                if (!targetPresentationId) {
                    const presentationRef = await createPresentationSession(user, {
                        title: prepareData.topic?.trim() || videoFile.name || "발표",
                        topic: prepareData.topic || "",
                        audience: prepareData.audience || "",
                        dday: prepareData.dday || "",
                        duration: prepareData.duration || "",
                        presentationType: prepareData.presentationType || "",
                        presentationMaterial: prepareData.presentationMaterial || null,
                    });
                    targetPresentationId = presentationRef.id;
                    createdStandalonePresentationId = targetPresentationId;
                    targetPrepareData = {
                        ...prepareData,
                        presentationId: targetPresentationId,
                    };
                }

                createdAttemptPresentationId = targetPresentationId;
                attempt = await createPresentationAttempt(user, targetPresentationId, "upload");
                recordingUpload = buildRecordingUpload({
                    ownerUid: user.uid,
                    presentationId: targetPresentationId,
                    attemptId: attempt.id,
                    sourceType: "upload",
                    fileName: videoFile.name || `upload_${attempt.id}.mp4`,
                    mimeType: videoFile.type || "video/mp4",
                });

                const uploadResult = await new Promise((resolve, reject) => {
                    const ref = storageRef(storage, recordingUpload.rawVideoPath);
                    uploadedStoragePath = recordingUpload.rawVideoPath;
                    const task = uploadBytesResumable(ref, videoFile, {
                        contentType: videoFile.type || recordingUpload.mimeType || "video/mp4",
                        customMetadata: {
                            ownerUid: user.uid,
                            presentationId: targetPresentationId,
                            attemptId: attempt.id,
                            sourceType: "upload",
                        },
                    });

                    task.on(
                        "state_changed",
                        (snapshot) => {
                            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                            setUploadProgress(pct);
                        },
                        reject,
                        async () => {
                            try {
                                const url = await getDownloadURL(task.snapshot.ref);
                                resolve({
                                    url,
                                    storagePath: recordingUpload.rawVideoPath,
                                    fileName: recordingUpload.fileName || videoFile.name,
                                    mimeType: videoFile.type || recordingUpload.mimeType || "video/mp4",
                                });
                            } catch (downloadUrlErr) {
                                reject(downloadUrlErr);
                            }
                        }
                    );
                });

                await markAttemptAnalyzing(user, targetPresentationId, attempt.id, {
                    video: {
                        videoUrl: uploadResult.url,
                        storagePath: uploadResult.storagePath,
                        fileName: uploadResult.fileName,
                        mimeType: uploadResult.mimeType,
                    },
                });

                sessionStorage.setItem("pendingAnalysis", JSON.stringify({
                    blobResult: uploadResult,
                    name: videoFile.name,
                    type: videoFile.type || "video/mp4",
                    presentationId: targetPresentationId,
                    attemptId: attempt.id,
                    attemptNo: attempt.attemptNo,
                    recordingUpload,
                    prepareData: {
                        ...targetPrepareData,
                        presentationId: targetPresentationId,
                        attemptId: attempt.id,
                        attemptNo: attempt.attemptNo,
                        recordingUpload,
                        ownerUid: targetPrepareData.ownerUid || user.uid,
                        ownerEmail: targetPrepareData.ownerEmail || user.email || "",
                    },
                }));

                router.push("/loading");
                return;
            }

        } catch (err) {
            console.error("업로드 오류:", err);
            if (uploadedStoragePath) {
                try {
                    await deleteObject(storageRef(storage, uploadedStoragePath));
                } catch (cleanupErr) {
                    console.warn("[Upload] 실패한 업로드 파일 정리 실패:", cleanupErr);
                }
            }
            if (createdAttemptPresentationId && attempt?.id) {
                try {
                    await deletePresentationAttempt(user, createdAttemptPresentationId, attempt.id);
                } catch (cleanupErr) {
                    console.warn("[Upload] 실패한 업로드 회차 삭제 실패:", cleanupErr);
                    try {
                        await failPresentationAttempt(
                            user,
                            createdAttemptPresentationId,
                            attempt.id,
                            err.message || "영상 업로드 중 오류가 발생했습니다."
                        );
                    } catch (failErr) {
                        console.warn("[Upload] 실패한 업로드 회차 상태 저장 실패:", failErr);
                    }
                }
            }
            if (createdStandalonePresentationId) {
                try {
                    await deletePresentationSession(user, createdStandalonePresentationId);
                } catch (cleanupErr) {
                    console.warn("[Upload] 실패한 단독 업로드 세션 삭제 실패:", cleanupErr);
                }
            }
            setError(err.message || "영상 업로드 중 오류가 발생했습니다.");
            setUploading(false);
            setUploadProgress(0);
        }
    };

    const removeFile = () => {
        setVideoFile(null);
        setError("");
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    if (authLoading || !user) {
        return (
            <main className="upload-page">
                <div className="upload-container">
                    <p className="subtitle">계정 정보를 확인하는 중입니다.</p>
                </div>
            </main>
        );
    }

    return (
        <main className="upload-page">
            <div className="upload-container">
                <header className="upload-header">
                    <h1>발표 영상 업로드</h1>
                    <p>분석할 발표 영상을 업로드해주세요.</p>
                </header>

                {/* 업로드 영역 */}
                <section className="upload-section">
                    {!videoFile ? (
                        <div
                            className={`upload-dropzone ${dragActive ? "active" : ""}`}
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="video/*"
                                onChange={handleFileChange}
                                hidden
                            />
                            <div className="dropzone-icon">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="17 8 12 3 7 8" />
                                    <line x1="12" y1="3" x2="12" y2="15" />
                                </svg>
                            </div>
                            <p className="dropzone-text">
                                <strong>클릭하여 파일 선택</strong> 또는 드래그하여 업로드
                            </p>
                            <p className="dropzone-hint">MP4, MOV, AVI 등 동영상 파일 (최대 2GB)</p>
                        </div>
                    ) : (
                        <div className="upload-preview">
                            <div className="preview-info">
                                <div className="preview-icon">
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                        <polygon points="23 7 16 12 23 17 23 7" />
                                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                                    </svg>
                                </div>
                                <div className="preview-details">
                                    <p className="preview-name">{videoFile.name}</p>
                                    <p className="preview-size">{formatFileSize(videoFile.size)}</p>
                                </div>
                                {!uploading && (
                                    <button type="button" className="preview-remove" onClick={removeFile}>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <line x1="18" y1="6" x2="6" y2="18" />
                                            <line x1="6" y1="6" x2="18" y2="18" />
                                        </svg>
                                    </button>
                                )}
                            </div>

                            {uploading && (
                                <div className="upload-preparing">
                                    <div className="preparing-spinner"></div>
                                    <span>{presentationId ? `영상 업로드 중... ${uploadProgress}%` : "분석 준비 중..."}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {error && (
                        <div className="upload-error">
                            <p>{error}</p>
                        </div>
                    )}
                </section>

                {/* 안내 사항 */}
                <section className="upload-tips">
                    <h3>업로드 전 확인사항</h3>
                    <ul>
                        <li>촬영 각도: 발표자의 상체와 얼굴, 손동작이 보이도록 정면에서 촬영해주세요.</li>
                        <li>음성 품질: 발표자의 목소리가 명확하게 녹음되어야 합니다.</li>
                        <li>영상 길이: 3분~15분 사이의 영상을 권장합니다.</li>
                    </ul>
                </section>

                {/* 하단 버튼 */}
                <div className="upload-actions">
                    <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => router.push(presentationId ? `/presentations/${presentationId}` : "/prepare")}
                        disabled={uploading}
                    >
                        이전으로
                    </button>
                    <button
                        type="button"
                        className="btn-primary"
                        disabled={!videoFile || uploading}
                        onClick={handleUpload}
                    >
                        {uploading ? `업로드 중 ${uploadProgress}%` : "분석 시작하기"}
                    </button>
                </div>
            </div>
        </main>
    );
}

export default function UploadPage() {
    return (
        <Suspense fallback={(
            <main className="upload-page">
                <div className="upload-container">
                    <p className="subtitle">업로드 화면을 불러오는 중입니다.</p>
                </div>
            </main>
        )}>
            <UploadPageContent />
        </Suspense>
    );
}
