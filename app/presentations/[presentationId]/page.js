"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytesResumable } from "firebase/storage";
import { auth, db } from "../../lib/firebase";
import { storage } from "../../lib/firebase";
import { useAuth } from "../../lib/AuthProvider";
import { FEEDBACK_CATEGORIES } from "../../lib/feedbackAreas";
import { convertAndUploadPdfFromUrl } from "../../lib/pdfToImages";
import PresentationSessionForm from "../../components/PresentationSessionForm";
import {
    buildRecordingUpload,
    createPresentationAttempt,
    deletePresentationAttempt,
    deletePresentationSession,
    failPresentationAttempt,
    markAttemptAnalyzing,
} from "../../lib/presentations";

const WAITING_CLEANUP_MINUTES = 30;
const CROWD_SIZE_OPTIONS = [
    { id: "small", label: "소집단", desc: "5명", count: 5 },
    { id: "medium", label: "중집단", desc: "10명", count: 10 },
    { id: "large", label: "대집단", desc: "16명", count: 16 },
];

const PERSONALITY_TYPES = [
    { id: "friendly", label: "우호적", desc: "관심 갖고 경청", color: "#22c55e" },
    { id: "normal", label: "평범함", desc: "보통 청중", color: "#3b82f6" },
    { id: "critical", label: "비판적", desc: "근거 요구", color: "#eab308" },
    { id: "sharp", label: "날카로움", desc: "논리 허점 지적", color: "#f97316" },
    { id: "disinterested", label: "무관심", desc: "집중력 낮음", color: "#94a3b8" },
];

const PERSONALITY_KR = {
    friendly: "우호적",
    normal: "평범함",
    critical: "비판적",
    sharp: "날카로움",
    disinterested: "무관심",
};

const AUDIENCE_PRESETS = [
    {
        id: "supportive",
        label: "협조적 학습자",
        desc: "호의적 분위기에서 발표 흐름을 먼저 확인합니다.",
        ratios: { friendly: 60, normal: 25, critical: 10, sharp: 5, disinterested: 0 },
    },
    {
        id: "standard",
        label: "표준 강의실",
        desc: "일반적인 수업 환경의 균형 잡힌 청중입니다.",
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
        desc: "심사나 면접처럼 까다로운 청중을 가정합니다.",
        ratios: { friendly: 10, normal: 20, critical: 35, sharp: 30, disinterested: 5 },
    },
    {
        id: "lowengagement",
        label: "저관여 환경",
        desc: "주의가 산만한 청중 앞에서 집중을 유지합니다.",
        ratios: { friendly: 10, normal: 30, critical: 15, sharp: 10, disinterested: 35 },
    },
];

const generateSimulationCode = () =>
    String(Math.floor(100000 + Math.random() * 900000));

const ATTEMPT_STATUS_META = {
    pending: { label: "준비 중", tone: "muted" },
    waiting: { label: "연결 대기", tone: "waiting" },
    analyzing: { label: "분석 중", tone: "active" },
    completed: { label: "분석 완료", tone: "success" },
    failed: { label: "처리 실패", tone: "danger" },
    cancelled: { label: "취소됨", tone: "muted" },
};

const GROWTH_CHART = {
    width: 640,
    height: 240,
    pad: { top: 24, right: 28, bottom: 42, left: 40 },
};

const CATEGORY_LINE_COLORS = {
    content: "#2563eb",
    organization: "#059669",
    expression: "#d97706",
};

function getDaysLeft(dday) {
    if (!dday) return null;
    const today = new Date();
    const target = new Date(`${dday}T00:00:00`);
    today.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function ddayText(dday) {
    const daysLeft = getDaysLeft(dday);
    if (daysLeft == null) return "D-day 미정";
    if (daysLeft === 0) return "D-day";
    if (daysLeft > 0) return `D-${daysLeft}`;
    return `D+${Math.abs(daysLeft)}`;
}

function formatDate(value) {
    if (!value) return "미정";
    return value.replaceAll("-", ".");
}

function formatTimestamp(value) {
    const date = value?.toDate?.();
    if (!date) return "";
    return date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function getTimestampMillis(value) {
    const date = value?.toDate?.();
    return date ? date.getTime() : null;
}

function formatScore(value) {
    return typeof value === "number" ? value.toFixed(1) : "-";
}

function sourceLabel(sourceType) {
    return sourceType === "simulation" ? "시뮬레이션" : "영상 업로드";
}

function statusMeta(status) {
    return ATTEMPT_STATUS_META[status] || { label: status || "상태 없음", tone: "muted" };
}

function isWaitingCleanupTarget(attempt) {
    if (!["pending", "waiting"].includes(attempt.status)) return false;
    if (attempt.analysisResult || attempt.video?.videoUrl) return false;
    const createdAt = getTimestampMillis(attempt.createdAt);
    if (!createdAt) return false;
    return Date.now() - createdAt > WAITING_CLEANUP_MINUTES * 60 * 1000;
}

function scoreToChartY(score) {
    const { height, pad } = GROWTH_CHART;
    const chartHeight = height - pad.top - pad.bottom;
    return pad.top + chartHeight - ((score - 1) / 4) * chartHeight;
}

function buildCategoryGrowthSeries(completedAttempts) {
    const { width, pad } = GROWTH_CHART;
    const chartWidth = width - pad.left - pad.right;

    return FEEDBACK_CATEGORIES.map((category) => {
        const points = completedAttempts
            .map((attempt, index) => {
                const score = attempt.categoryAverages?.[category.id];
                if (typeof score !== "number") return null;
                const x = completedAttempts.length === 1
                    ? pad.left + chartWidth / 2
                    : pad.left + (chartWidth * index) / (completedAttempts.length - 1);
                return {
                    x,
                    y: scoreToChartY(score),
                    score,
                    attemptNo: attempt.attemptNo,
                };
            })
            .filter(Boolean);

        return {
            category,
            color: CATEGORY_LINE_COLORS[category.id] || "#111827",
            points,
            polyline: points.map((point) => `${point.x},${point.y}`).join(" "),
        };
    });
}

function ratioToStudents(ratios) {
    const total = 8;
    const students = [];
    let remaining = total;
    const sorted = Object.entries(ratios)
        .filter(([, pct]) => pct > 0)
        .sort((a, b) => b[1] - a[1]);

    sorted.forEach(([key, pct], idx) => {
        const isLast = idx === sorted.length - 1;
        const count = isLast ? remaining : Math.round((pct / 100) * total);
        for (let i = 0; i < count && remaining > 0; i += 1) {
            students.push({
                studentId: `청중${students.length + 1}`,
                personality: PERSONALITY_KR[key],
                extraDetail: "",
            });
            remaining -= 1;
        }
    });

    while (students.length < total) {
        students.push({
            studentId: `청중${students.length + 1}`,
            personality: "평범함",
            extraDetail: "",
        });
    }

    return students;
}

function formatFileSize(bytes) {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default function PresentationDetailPage({ params }) {
    const router = useRouter();
    const { presentationId } = params;
    const { user, authLoading } = useAuth();
    const fileInputRef = useRef(null);
    const [accountMenuOpen, setAccountMenuOpen] = useState(false);
    const [presentation, setPresentation] = useState(null);
    const [attempts, setAttempts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [cleanupMessage, setCleanupMessage] = useState("");
    const [deletingPresentation, setDeletingPresentation] = useState(false);
    const [activeModal, setActiveModal] = useState("");
    const [videoFile, setVideoFile] = useState(null);
    const [dragActive, setDragActive] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [modalError, setModalError] = useState("");
    const [crowdSize, setCrowdSize] = useState("medium");
    const [ratios, setRatios] = useState(AUDIENCE_PRESETS[1].ratios);
    const [selectedPreset, setSelectedPreset] = useState("standard");
    const [showCustomAudience, setShowCustomAudience] = useState(false);
    const [startingSimulation, setStartingSimulation] = useState(false);
    const [simulationStatus, setSimulationStatus] = useState("");
    const cleanedAttemptIdsRef = useRef(new Set());

    useEffect(() => {
        if (!authLoading && !user) {
            router.replace("/");
        }
    }, [authLoading, router, user]);

    useEffect(() => {
        if (authLoading || !user || !presentationId) return undefined;

        const presentationRef = doc(db, "users", user.uid, "presentations", presentationId);
        const attemptsQuery = query(
            collection(presentationRef, "attempts"),
            orderBy("attemptNo", "desc")
        );

        const unsubPresentation = onSnapshot(
            presentationRef,
            (snapshot) => {
                if (!snapshot.exists()) {
                    setError("발표 세션을 찾을 수 없습니다.");
                    setLoading(false);
                    return;
                }
                setPresentation({ id: snapshot.id, ...snapshot.data() });
                setLoading(false);
            },
            (err) => {
                console.error("[PresentationDetail] 세션 로드 실패:", err);
                setError("발표 세션을 불러오지 못했습니다.");
                setLoading(false);
            }
        );

        const unsubAttempts = onSnapshot(attemptsQuery, (snapshot) => {
            setAttempts(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
        });

        return () => {
            unsubPresentation();
            unsubAttempts();
        };
    }, [authLoading, presentationId, user]);

    const completedAttempts = useMemo(
        () => attempts
            .filter((attempt) => attempt.status === "completed" && attempt.analysisResult)
            .slice()
            .sort((a, b) => (a.attemptNo || 0) - (b.attemptNo || 0)),
        [attempts]
    );

    const scoredAttempts = useMemo(
        () => completedAttempts.filter((attempt) => typeof attempt.scoreAverage === "number"),
        [completedAttempts]
    );

    const cleanupTargets = useMemo(
        () => attempts.filter(isWaitingCleanupTarget),
        [attempts]
    );

    const growthSeries = useMemo(
        () => buildCategoryGrowthSeries(scoredAttempts),
        [scoredAttempts]
    );

    const totalRatio = useMemo(
        () => Object.values(ratios).reduce((sum, value) => sum + value, 0),
        [ratios]
    );

    const ratiosValid = totalRatio === 100;

    const selectedAudienceDetail = useMemo(() => {
        if (selectedPreset === "custom") {
            return {
                label: "사용자 정의",
                desc: "직접 설정한 청중 성격 비율입니다.",
                ratios,
            };
        }
        return AUDIENCE_PRESETS.find((preset) => preset.id === selectedPreset) || AUDIENCE_PRESETS[1];
    }, [ratios, selectedPreset]);

    useEffect(() => {
        if (!user || !presentationId || cleanupTargets.length === 0) return;

        const targets = cleanupTargets.filter((attempt) => !cleanedAttemptIdsRef.current.has(attempt.id));
        if (targets.length === 0) return;

        targets.forEach((attempt) => cleanedAttemptIdsRef.current.add(attempt.id));

        (async () => {
            for (const attempt of targets) {
                await deletePresentationAttempt(user, presentationId, attempt.id);
            }
        })()
            .then(() => {
                setCleanupMessage(`${targets.length}개 대기 종료 회차를 정리했습니다.`);
            })
            .catch((err) => {
                console.error("[PresentationDetail] 대기 회차 정리 실패:", err);
                setCleanupMessage("대기 종료 회차 정리에 실패했습니다.");
            });
    }, [cleanupTargets, presentationId, user]);

    const openAttemptAnalysis = (attempt) => {
        if (attempt.status !== "completed" || !attempt.analysisResult) return;
        sessionStorage.setItem("analysisResult", JSON.stringify(attempt.analysisResult));
        sessionStorage.setItem("videoUrl", attempt.video?.videoUrl || "");
        sessionStorage.setItem("videoName", `${presentation.title || "발표"} ${attempt.attemptNo}회차`);
        sessionStorage.setItem("prepareData", JSON.stringify({
            duration: presentation.duration || "",
            feedbackItems: attempt.analysisResult?.feedbackItems || [],
        }));
        sessionStorage.setItem("analysisContext", JSON.stringify({
            presentationId,
            attemptId: attempt.id,
            attemptNo: attempt.attemptNo || null,
            reflectionNote: attempt.reflectionNote || "",
            reflectionFields: attempt.reflectionFields || null,
        }));
        router.push("/analysis");
    };

    const handleLogout = async () => {
        await signOut(auth);
        router.replace("/");
    };

    const closeModal = () => {
        if (uploading || startingSimulation) return;
        setActiveModal("");
        setVideoFile(null);
        setDragActive(false);
        setUploadProgress(0);
        setModalError("");
        setSimulationStatus("");
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const openModal = (mode) => {
        setModalError("");
        setSimulationStatus("");
        setUploadProgress(0);
        setActiveModal(mode);
    };

    const handleDrag = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.type === "dragenter" || event.type === "dragover") {
            setDragActive(true);
        } else if (event.type === "dragleave") {
            setDragActive(false);
        }
    };

    const selectVideoFile = (file) => {
        if (!file) return;
        if (!file.type.startsWith("video/")) {
            setModalError("동영상 파일만 업로드할 수 있습니다.");
            return;
        }
        setVideoFile(file);
        setModalError("");
    };

    const handleDrop = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragActive(false);
        selectVideoFile(event.dataTransfer.files?.[0]);
    };

    const handleFileChange = (event) => {
        selectVideoFile(event.target.files?.[0]);
    };

    const handleUploadVideo = async () => {
        if (!videoFile || !user || !presentation) return;
        setUploading(true);
        setUploadProgress(0);
        setModalError("");

        let attempt = null;
        let uploadedStoragePath = null;

        try {
            attempt = await createPresentationAttempt(user, presentationId, "upload");
            const recordingUpload = buildRecordingUpload({
                ownerUid: user.uid,
                presentationId,
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
                        presentationId,
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

            await markAttemptAnalyzing(user, presentationId, attempt.id, {
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
                presentationId,
                attemptId: attempt.id,
                attemptNo: attempt.attemptNo,
                recordingUpload,
                prepareData: {
                    presentationId,
                    attemptId: attempt.id,
                    attemptNo: attempt.attemptNo,
                    recordingUpload,
                    title: presentation.title || "발표",
                    topic: presentation.topic || "",
                    audience: presentation.audience || "",
                    dday: presentation.dday || "",
                    duration: presentation.duration || "",
                    presentationType: presentation.presentationType || "",
                    ownerUid: user.uid,
                    ownerEmail: user.email || "",
                    presentationMaterial: presentation.presentationMaterial || null,
                },
            }));

            router.push("/loading");
        } catch (err) {
            console.error("[PresentationDetail] 영상 업로드 준비 실패:", err);
            if (uploadedStoragePath) {
                try {
                    await deleteObject(storageRef(storage, uploadedStoragePath));
                } catch (cleanupErr) {
                    console.warn("[PresentationDetail] 실패한 업로드 파일 정리 실패:", cleanupErr);
                }
            }
            if (attempt?.id) {
                try {
                    await deletePresentationAttempt(user, presentationId, attempt.id);
                } catch (cleanupErr) {
                    console.warn("[PresentationDetail] 실패한 업로드 회차 삭제 실패:", cleanupErr);
                    try {
                        await failPresentationAttempt(
                            user,
                            presentationId,
                            attempt.id,
                            err.message || "영상 업로드 중 오류가 발생했습니다."
                        );
                    } catch (failErr) {
                        console.warn("[PresentationDetail] 실패한 업로드 회차 상태 저장 실패:", failErr);
                    }
                }
            }
            setModalError(err.message || "영상 업로드 중 오류가 발생했습니다.");
            setUploading(false);
            setUploadProgress(0);
        }
    };

    const applyPreset = (preset) => {
        setRatios({ ...preset.ratios });
        setSelectedPreset(preset.id);
        setShowCustomAudience(false);
    };

    const handleRatioChange = (key, value) => {
        const num = Math.max(0, Math.min(100, parseInt(value, 10) || 0));
        setRatios((prev) => ({ ...prev, [key]: num }));
        setSelectedPreset("custom");
    };

    const normalizeRatios = () => {
        if (totalRatio === 0) return;
        const factor = 100 / totalRatio;
        const keys = Object.keys(ratios);
        let sum = 0;
        const nextRatios = {};
        keys.forEach((key, index) => {
            if (index === keys.length - 1) {
                nextRatios[key] = 100 - sum;
            } else {
                nextRatios[key] = Math.round(ratios[key] * factor);
                sum += nextRatios[key];
            }
        });
        setRatios(nextRatios);
    };

    const handleStartSimulation = async () => {
        if (!user || !presentation || !crowdSize || !ratiosValid || startingSimulation) return;
        setStartingSimulation(true);
        setModalError("");

        try {
            const code = generateSimulationCode();
            let materialMeta = null;
            let pdfUrl = "";
            let slideImageUrls = [];

            if (presentation.presentationMaterial?.url) {
                const mat = presentation.presentationMaterial;
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

                try {
                    setSimulationStatus("PDF를 슬라이드 이미지로 변환 중...");
                    const result = await convertAndUploadPdfFromUrl(mat.url, code, {
                        ownerUid: user.uid,
                        onProgress: (progress) => {
                            const phaseKr = progress.phase === "convert" ? "변환" : "업로드";
                            setSimulationStatus(`슬라이드 ${phaseKr} 중... (${progress.current}/${progress.total})`);
                        },
                    });
                    slideImageUrls = result.slideImageUrls;
                } catch (convErr) {
                    console.warn("[PresentationDetail] PDF 이미지 변환 실패, 원본 PDF로 진행:", convErr);
                }
            }

            setSimulationStatus("시뮬레이션 세션을 생성 중...");
            const students = ratioToStudents(ratios);
            const crowdSizeOpt = CROWD_SIZE_OPTIONS.find((option) => option.id === crowdSize);
            const audienceCount = crowdSizeOpt?.count || 10;
            const attempt = await createPresentationAttempt(user, presentationId, "simulation");
            const recordingUpload = buildRecordingUpload({
                ownerUid: user.uid,
                presentationId,
                attemptId: attempt.id,
                code,
                sourceType: "simulation",
            });

            const simulationPayload = {
                title: presentation.title || "발표",
                topic: presentation.topic || "",
                audience: presentation.audience || "",
                dday: presentation.dday || "",
                duration: presentation.duration || "",
                presentationType: presentation.presentationType || "",
                ownerUid: user.uid,
                ownerEmail: user.email || "",
                presentationId,
                attemptId: attempt.id,
                attemptNo: attempt.attemptNo,
                sourceType: "simulation",
                presentation: {
                    title: presentation.title || "발표",
                    topic: presentation.topic || "",
                    audience: presentation.audience || "",
                    dday: presentation.dday || "",
                    duration: presentation.duration || "",
                    presentationType: presentation.presentationType || "",
                },
                presentationMaterial: materialMeta,
                simulation: {
                    crowdSize,
                    audienceCount,
                    ratios,
                    students,
                    pdfUrl,
                    slideImageUrls,
                    slideCount: slideImageUrls.length,
                },
                recordingUpload,
                status: "waiting",
                createdAt: serverTimestamp(),
            };

            await setDoc(doc(db, "simulations", code), simulationPayload);
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

            try {
                const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "https://xr-zihe.onrender.com";
                const backendRes = await fetch(`${backendUrl}/session/create`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        studentId: `web_${code}`,
                        grade: "대학교",
                        subject: presentation.topic || "",
                        domain: "발표",
                        achievement: "공적 말하기 역량",
                        lessonObjective: presentation.topic || "",
                        pdfUrl: pdfUrl || "",
                        difficulty: "중급",
                        students,
                    }),
                });
                if (backendRes.ok) {
                    const backendData = await backendRes.json();
                    if (backendData.accessCode && backendData.accessCode !== code) {
                        const backendRecordingUpload = buildRecordingUpload({
                            ownerUid: user.uid,
                            presentationId,
                            attemptId: attempt.id,
                            code: backendData.accessCode,
                            sourceType: "simulation",
                        });
                        await setDoc(doc(db, "simulations", backendData.accessCode), {
                            ...simulationPayload,
                            recordingUpload: backendRecordingUpload,
                            backendCode: backendData.accessCode,
                            backendSessionId: backendData.sessionId,
                        });
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
                        sessionStorage.setItem("simulationCode", backendData.accessCode);
                        router.push(`/simulation/${backendData.accessCode}`);
                        return;
                    }
                }
            } catch (backendErr) {
                console.warn("[PresentationDetail] 백엔드 연결 실패, Firestore-only 모드:", backendErr);
            }

            sessionStorage.setItem("simulationCode", code);
            router.push(`/simulation/${code}`);
        } catch (err) {
            console.error("[PresentationDetail] 시뮬레이션 시작 실패:", err);
            setModalError("시뮬레이션 시작 중 오류가 발생했습니다. 다시 시도해주세요.");
            setStartingSimulation(false);
        }
    };

    const handleDeleteAttempt = async (attempt) => {
        if (!confirm(`${attempt.attemptNo}회차 기록을 삭제하시겠습니까?`)) return;
        try {
            await deletePresentationAttempt(user, presentationId, attempt.id);
            setCleanupMessage(`${attempt.attemptNo}회차 기록을 삭제했습니다.`);
        } catch (err) {
            console.error("[PresentationDetail] 회차 삭제 실패:", err);
            setCleanupMessage("회차 기록을 삭제하지 못했습니다.");
        }
    };

    const handleDeletePresentation = async () => {
        if (!confirm("이 발표와 모든 회차 기록을 삭제하시겠습니까?")) return;
        setDeletingPresentation(true);
        try {
            await deletePresentationSession(user, presentationId);
            router.replace("/dashboard");
        } catch (err) {
            console.error("[PresentationDetail] 발표 삭제 실패:", err);
            setCleanupMessage("발표를 삭제하지 못했습니다.");
            setDeletingPresentation(false);
        }
    };

    if (authLoading || loading || !user) {
        return (
            <main className="sim-setup-page">
                <div className="sim-setup-loading">불러오는 중...</div>
            </main>
        );
    }

    if (error || !presentation) {
        return (
            <main className="sim-setup-page">
                <div className="sim-setup-container">
                    <p className="sim-setup-error">{error || "발표 세션을 불러오지 못했습니다."}</p>
                    <button type="button" className="btn-primary" onClick={() => router.push("/dashboard")}>
                        대시보드로 이동
                    </button>
                </div>
            </main>
        );
    }

    return (
        <div className="db-layout">
            <header className="db-topbar">
                <div className="db-topbar-brand">
                    <img src="/logo.png" alt="Logo" className="db-topbar-logo" />
                    <span className="db-topbar-title">AI 발표 피드백 시스템</span>
                </div>
                <div className="db-topbar-right">
                    <button
                        className="db-account-btn"
                        onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                    >
                        {user.email || "내 계정"}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M6 9l6 6 6-6" />
                        </svg>
                    </button>
                    {accountMenuOpen && (
                        <div className="db-account-menu">
                            <button onClick={handleLogout}>로그아웃</button>
                        </div>
                    )}
                </div>
            </header>

            <main className="session-detail-page">
            <div className="session-detail-container">
                <header className="session-detail-toolbar">
                    <button type="button" className="session-toolbar-back" onClick={() => router.push("/dashboard")}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
                        </svg>
                        대시보드
                    </button>
                    <div className="session-toolbar-title">
                        <span className="presentation-dday">{ddayText(presentation.dday)}</span>
                        <div>
                            <h1>{presentation.title || "발표"}</h1>
                            <p>{presentation.topic || "주제 미입력"}</p>
                        </div>
                    </div>
                    <div className="session-action-row">
                        <div className="session-run-actions" aria-label="발표 진행 작업">
                            <button
                                type="button"
                                className="session-edit-action"
                                onClick={() => openModal("edit")}
                            >
                                정보 수정
                            </button>
                            <button
                                type="button"
                                className="session-upload-action"
                                onClick={() => openModal("upload")}
                            >
                                영상 업로드
                            </button>
                            <button
                                type="button"
                                className="session-simulation-action"
                                onClick={() => openModal("simulation")}
                            >
                                시뮬레이션
                            </button>
                        </div>
                        <div className="session-danger-actions" aria-label="위험 작업">
                            <button
                                type="button"
                                className="session-delete-action"
                                onClick={handleDeletePresentation}
                                disabled={deletingPresentation}
                            >
                                {deletingPresentation ? "삭제 중..." : "발표 삭제"}
                            </button>
                        </div>
                    </div>
                </header>

                <section className="session-summary-grid">
                    <div className="session-summary-card">
                        <span>D-day</span>
                        <strong>{formatDate(presentation.dday)}</strong>
                    </div>
                    <div className="session-summary-card">
                        <span>예상 청중</span>
                        <strong>{presentation.audience || "미정"}</strong>
                    </div>
                    <div className="session-summary-card">
                        <span>분석 완료</span>
                        <strong>{completedAttempts.length}회</strong>
                    </div>
                    <div className="session-summary-card">
                        <span>최근 평균</span>
                        <strong>{formatScore(presentation.latestScoreAverage)}/5</strong>
                    </div>
                </section>

                <section className="session-panel">
                    <div className="session-panel-header">
                        <h2>영역별 성장곡선</h2>
                        <span>{scoredAttempts.length}개 점수 산출</span>
                    </div>
                    {scoredAttempts.length === 0 ? (
                        <div className="attempt-empty">
                            <p>점수가 산출된 회차가 생기면 영역별 평균 점수 변화가 여기에 표시됩니다.</p>
                        </div>
                    ) : (
                        <>
                            <div className="growth-legend">
                                {growthSeries.map((series) => (
                                    <span key={series.category.id}>
                                        <i style={{ backgroundColor: series.color }} />
                                        {series.category.label}
                                    </span>
                                ))}
                            </div>
                            <div className="growth-chart-wrap">
                                <svg
                                    className="growth-chart"
                                    viewBox={`0 0 ${GROWTH_CHART.width} ${GROWTH_CHART.height}`}
                                    role="img"
                                    aria-label="회차별 영역 평균 성장곡선"
                                >
                                    {[1, 2, 3, 4, 5].map((score) => {
                                        const y = scoreToChartY(score);
                                        return (
                                            <g key={score}>
                                                <line x1="40" y1={y} x2="612" y2={y} className="growth-grid-line" />
                                                <text x="16" y={y + 4} className="growth-axis-label">{score}</text>
                                            </g>
                                        );
                                    })}
                                    {scoredAttempts.map((attempt, index) => {
                                        const x = scoredAttempts.length === 1
                                            ? GROWTH_CHART.pad.left + (GROWTH_CHART.width - GROWTH_CHART.pad.left - GROWTH_CHART.pad.right) / 2
                                            : GROWTH_CHART.pad.left + ((GROWTH_CHART.width - GROWTH_CHART.pad.left - GROWTH_CHART.pad.right) * index) / (scoredAttempts.length - 1);
                                        return (
                                            <text key={attempt.id} x={x} y="224" textAnchor="middle" className="growth-axis-label">
                                                {attempt.attemptNo}회
                                            </text>
                                        );
                                    })}
                                    {growthSeries.map((series) => (
                                        <g key={series.category.id}>
                                            {series.polyline && (
                                                <polyline
                                                    points={series.polyline}
                                                    className="growth-line"
                                                    style={{ stroke: series.color }}
                                                />
                                            )}
                                            {series.points.map((point) => (
                                                <circle
                                                    key={`${series.category.id}-${point.attemptNo}`}
                                                    cx={point.x}
                                                    cy={point.y}
                                                    r="5"
                                                    className="growth-point"
                                                    style={{ stroke: series.color }}
                                                >
                                                    <title>{`${series.category.label} ${point.attemptNo}회차 ${point.score.toFixed(1)}/5`}</title>
                                                </circle>
                                            ))}
                                        </g>
                                    ))}
                                </svg>
                            </div>
                        </>
                    )}
                </section>

                <section className="session-panel">
                    <div className="session-panel-header">
                        <h2>영역별 최근 평균</h2>
                        <span>{completedAttempts.length}개 분석 완료</span>
                    </div>
                    <div className="category-average-grid">
                        {FEEDBACK_CATEGORIES.map((category) => (
                            <div key={category.id} className="category-average">
                                <div>
                                    <span className="category-average-icon">{category.icon}</span>
                                    <strong>{category.label}</strong>
                                </div>
                                <span>{formatScore(presentation.categoryAverages?.[category.id])}/5</span>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="session-panel">
                    <div className="session-panel-header">
                        <h2>회차별 연습 기록</h2>
                        <span>{attempts.length}개 회차</span>
                    </div>
                    {cleanupMessage && <p className="session-cleanup-note">{cleanupMessage}</p>}

                    {attempts.length === 0 ? (
                        <div className="attempt-empty">
                            <p>아직 연습 기록이 없습니다. 시뮬레이션이나 영상 업로드로 첫 회차를 시작하세요.</p>
                        </div>
                    ) : (
                        <div className="attempt-list">
                            {attempts.map((attempt) => (
                                <div
                                    key={attempt.id}
                                    className={`attempt-row attempt-row-${statusMeta(attempt.status).tone}`}
                                >
                                    <div className="attempt-row-top">
                                        <button
                                            type="button"
                                            className="attempt-row-main"
                                            disabled={attempt.status !== "completed"}
                                            onClick={() => openAttemptAnalysis(attempt)}
                                        >
                                            <div>
                                                <strong>{attempt.attemptNo}회차</strong>
                                                <span>{sourceLabel(attempt.sourceType)}</span>
                                            </div>
                                            <div className="attempt-status-block">
                                                <span className={`attempt-status-badge attempt-status-${statusMeta(attempt.status).tone}`}>
                                                    {statusMeta(attempt.status).label}
                                                </span>
                                                <strong>
                                                    {attempt.status === "completed"
                                                        ? `${formatScore(attempt.scoreAverage)}/5`
                                                        : attempt.errorMessage || ""}
                                                </strong>
                                                <span>{formatTimestamp(attempt.completedAt || attempt.failedAt || attempt.createdAt)}</span>
                                            </div>
                                        </button>
                                        <button
                                            type="button"
                                            className="attempt-delete-btn"
                                            onClick={() => handleDeleteAttempt(attempt)}
                                        >
                                            삭제
                                        </button>
                                    </div>
                                    {attempt.reflectionNote && (
                                        <button
                                            type="button"
                                            className="attempt-reflection-preview"
                                            onClick={() => openAttemptAnalysis(attempt)}
                                        >
                                            <span>성찰</span>
                                            <p>{attempt.reflectionNote}</p>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>

            {activeModal === "upload" && (
                <div className="next-modal-backdrop" role="presentation" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) closeModal();
                }}>
                    <section className="session-flow-modal" role="dialog" aria-modal="true" aria-labelledby="upload-modal-title">
                        <header className="session-flow-modal-header">
                            <div>
                                <p>영상 업로드</p>
                                <h2 id="upload-modal-title">분석할 발표 영상을 선택하세요</h2>
                            </div>
                            <button type="button" className="session-flow-close" onClick={closeModal} disabled={uploading} title="닫기" aria-label="닫기">×</button>
                        </header>

                        <div className="session-flow-body">
                            {!videoFile ? (
                                <div
                                    className={`session-upload-dropzone ${dragActive ? "active" : ""}`}
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
                                    <span className="session-upload-icon">↑</span>
                                    <strong>파일 선택 또는 드래그</strong>
                                    <p>MP4, MOV, AVI 등 발표 영상 파일을 사용할 수 있습니다.</p>
                                </div>
                            ) : (
                                <div className="session-selected-file">
                                    <div>
                                        <strong>{videoFile.name}</strong>
                                        <span>{formatFileSize(videoFile.size)}</span>
                                    </div>
                                    {!uploading && (
                                        <button type="button" onClick={() => setVideoFile(null)}>다시 선택</button>
                                    )}
                                </div>
                            )}

                            {modalError && <p className="session-flow-error">{modalError}</p>}
                            {uploading && <p className="session-flow-status">영상 업로드 중... {uploadProgress}%</p>}
                        </div>

                        <footer className="session-flow-actions">
                            <button type="button" className="btn-secondary" onClick={closeModal} disabled={uploading}>취소</button>
                            <button type="button" className="btn-primary" onClick={handleUploadVideo} disabled={!videoFile || uploading}>
                                {uploading ? `업로드 중 ${uploadProgress}%` : "분석 시작"}
                            </button>
                        </footer>
                    </section>
                </div>
            )}

            {activeModal === "edit" && (
                <div className="next-modal-backdrop" role="presentation" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) closeModal();
                }}>
                    <section className="session-flow-modal session-edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-modal-title">
                        <header className="session-flow-modal-header">
                            <div>
                                <p>발표 정보 수정</p>
                                <h2 id="edit-modal-title">발표 세션 정보를 수정하세요</h2>
                            </div>
                            <button type="button" className="session-flow-close" onClick={closeModal} title="닫기" aria-label="닫기">×</button>
                        </header>

                        <div className="session-flow-body">
                            <PresentationSessionForm
                                user={user}
                                mode="edit"
                                presentation={presentation}
                                formId={`detail-edit-${presentation.id}`}
                                onCancel={closeModal}
                                onSaved={closeModal}
                            />
                        </div>
                    </section>
                </div>
            )}

            {activeModal === "simulation" && (
                <div className="next-modal-backdrop" role="presentation" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) closeModal();
                }}>
                    <section className="session-flow-modal session-flow-modal-wide" role="dialog" aria-modal="true" aria-labelledby="simulation-modal-title">
                        <header className="session-flow-modal-header">
                            <div>
                                <p>시뮬레이션 설정</p>
                                <h2 id="simulation-modal-title">청중 규모와 분위기를 선택하세요</h2>
                            </div>
                            <button type="button" className="session-flow-close" onClick={closeModal} disabled={startingSimulation} title="닫기" aria-label="닫기">×</button>
                        </header>

                        <div className="session-flow-body">
                            <div className="session-modal-section">
                                <h3>청중 규모</h3>
                                <div className="session-choice-row">
                                    {CROWD_SIZE_OPTIONS.map((option) => (
                                        <button
                                            key={option.id}
                                            type="button"
                                            className={`session-choice ${crowdSize === option.id ? "selected" : ""}`}
                                            onClick={() => setCrowdSize(option.id)}
                                        >
                                            <strong>{option.label}</strong>
                                            <span>{option.desc}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="session-modal-section">
                                <h3>청중 환경</h3>
                                <p className="session-modal-help">발표 상황에 맞는 청중 구성을 선택하세요. 세부 비율은 직접 조정할 수도 있습니다.</p>
                                <div className="session-preset-grid">
                                    {AUDIENCE_PRESETS.map((preset) => (
                                        <button
                                            key={preset.id}
                                            type="button"
                                            className={`session-preset-card ${selectedPreset === preset.id ? "selected" : ""}`}
                                            onClick={() => applyPreset(preset)}
                                        >
                                            <div>
                                                <strong>{preset.label}</strong>
                                                {selectedPreset === preset.id && <span>선택됨</span>}
                                            </div>
                                            <p>{preset.desc}</p>
                                        </button>
                                    ))}
                                </div>

                                <div className="session-selected-ratio-panel">
                                    <div className="session-selected-ratio-header">
                                        <div>
                                            <strong>{selectedAudienceDetail.label}</strong>
                                            <span>{selectedAudienceDetail.desc}</span>
                                        </div>
                                        <b>{totalRatio}%</b>
                                    </div>
                                    <div className="session-ratio-bar">
                                        {PERSONALITY_TYPES.map((type) => {
                                            const value = selectedAudienceDetail.ratios[type.id] || 0;
                                            if (!value) return null;
                                            return <i key={type.id} style={{ flex: value, backgroundColor: type.color }} title={`${type.label} ${value}%`} />;
                                        })}
                                    </div>
                                    <div className="session-ratio-list">
                                        {PERSONALITY_TYPES.map((type) => {
                                            const value = selectedAudienceDetail.ratios[type.id] || 0;
                                            if (!value) return null;
                                            return (
                                                <span key={type.id}>
                                                    <i style={{ backgroundColor: type.color }} />
                                                    {type.label} {value}%
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    className="session-custom-toggle"
                                    onClick={() => setShowCustomAudience((value) => !value)}
                                >
                                    {showCustomAudience ? "직접 설정 닫기" : "직접 설정 (비율 세부 조정)"}
                                    {selectedPreset === "custom" && <span>사용자 정의</span>}
                                </button>

                                {showCustomAudience && (
                                    <div className="session-custom-panel">
                                        <p>슬라이더로 비율을 직접 조정합니다. 합계가 100%여야 시작할 수 있습니다.</p>
                                        <div className="session-ratio-controls">
                                            {PERSONALITY_TYPES.map((type) => (
                                                <div key={type.id} className="session-ratio-control">
                                                    <div className="session-ratio-label">
                                                        <i style={{ backgroundColor: type.color }} />
                                                        <div>
                                                            <strong>{type.label}</strong>
                                                            <span>{type.desc}</span>
                                                        </div>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="100"
                                                        value={ratios[type.id]}
                                                        onChange={(event) => handleRatioChange(type.id, event.target.value)}
                                                        style={{ accentColor: type.color }}
                                                    />
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        value={ratios[type.id]}
                                                        onChange={(event) => handleRatioChange(type.id, event.target.value)}
                                                    />
                                                    <span>%</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className={`session-ratio-total ${ratiosValid ? "valid" : "invalid"}`}>
                                            <span>합계: <strong>{totalRatio}%</strong></span>
                                            {!ratiosValid ? (
                                                <button type="button" onClick={normalizeRatios}>100%로 자동 조정</button>
                                            ) : (
                                                <span>합계 100% 유효</span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {modalError && <p className="session-flow-error">{modalError}</p>}
                            {simulationStatus && <p className="session-flow-status">{simulationStatus}</p>}
                        </div>

                        <footer className="session-flow-actions">
                            <button type="button" className="btn-secondary" onClick={closeModal} disabled={startingSimulation}>취소</button>
                            <button type="button" className="btn-primary" onClick={handleStartSimulation} disabled={!crowdSize || !ratiosValid || startingSimulation}>
                                {startingSimulation ? "준비 중..." : "시뮬레이션 시작"}
                            </button>
                        </footer>
                    </section>
                </div>
            )}
            </main>
        </div>
    );
}
