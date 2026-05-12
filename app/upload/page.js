"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/AuthProvider";

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

const saveVideoDB = async (key, data) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(data, key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
};

export default function UploadPage() {
    const router = useRouter();
    const { user, authLoading } = useAuth();
    const fileInputRef = useRef(null);

    const [videoFile, setVideoFile] = useState(null);
    const [dragActive, setDragActive] = useState(false);
    const [uploading, setUploading] = useState(false);
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
        // sessionStorage에서 prepare 데이터 로드
        const savedData = sessionStorage.getItem("prepareData");
        if (savedData) {
            setPrepareData(JSON.parse(savedData));
        }
    }, [authLoading, user]);

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
        setError("");

        try {
            // 비디오 파일을 ArrayBuffer로 변환하여 IndexedDB에 저장
            const arrayBuffer = await videoFile.arrayBuffer();

            await saveVideoDB("pendingVideo", {
                buffer: arrayBuffer,
                name: videoFile.name,
                type: videoFile.type,
                prepareData: {
                    ...prepareData,
                    ownerUid: prepareData.ownerUid || user.uid,
                    ownerEmail: prepareData.ownerEmail || user.email || "",
                }
            });

            // 로딩 페이지로 이동
            router.push("/loading");

        } catch (err) {
            console.error("업로드 오류:", err);
            setError(err.message || "영상 준비 중 오류가 발생했습니다.");
            setUploading(false);
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
                                    <span>분석 준비 중...</span>
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
                        onClick={() => router.push("/prepare")}
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
                        {uploading ? "준비 중..." : "분석 시작하기"}
                    </button>
                </div>
            </div>
        </main>
    );
}
