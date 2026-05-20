import {
    addDoc,
    collection,
    doc,
    getDoc,
    increment,
    runTransaction,
    serverTimestamp,
    updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { FEEDBACK_CATEGORIES } from "./feedbackAreas";

export const RECORDINGS_BUCKET = "public-speech-feedback.firebasestorage.app";

export function calculateCategoryAverages(scores = {}) {
    return FEEDBACK_CATEGORIES.reduce((acc, category) => {
        const values = category.items
            .map((item) => scores[item.id])
            .filter((score) => typeof score === "number" && Number.isFinite(score));

        acc[category.id] = values.length
            ? Number((values.reduce((sum, score) => sum + score, 0) / values.length).toFixed(2))
            : null;

        return acc;
    }, {});
}

export function calculateScoreAverage(scores = {}) {
    const values = Object.values(scores).filter((score) => typeof score === "number" && Number.isFinite(score));
    if (!values.length) return null;
    return Number((values.reduce((sum, score) => sum + score, 0) / values.length).toFixed(2));
}

function compactPathPart(value, fallback) {
    return String(value || fallback)
        .replace(/[^a-zA-Z0-9_.-]/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 120);
}

export function buildRecordingUpload({ ownerUid, presentationId, attemptId, code, sourceType = "simulation", fileName, mimeType = "video/mp4" }) {
    const uploadFileName = fileName
        ? compactPathPart(fileName, `${sourceType}_${code || attemptId}.mp4`)
        : `${sourceType}_${compactPathPart(code || attemptId, "recording")}.mp4`;
    const basePath = [
        "recordings",
        compactPathPart(ownerUid, "unknown-user"),
        "presentations",
        compactPathPart(presentationId, "unknown-presentation"),
        "attempts",
        compactPathPart(attemptId, "unknown-attempt"),
    ].join("/");

    return {
        bucket: RECORDINGS_BUCKET,
        basePath,
        rawVideoPath: `${basePath}/raw/${uploadFileName}`,
        fileName: uploadFileName,
        mimeType,
    };
}

export async function createPresentationSession(user, data) {
    if (!user?.uid) throw new Error("로그인이 필요합니다.");

    const payload = {
        title: data.title?.trim() || "발표",
        topic: data.topic?.trim() || "",
        audience: data.audience || "",
        dday: data.dday || "",
        duration: data.duration?.trim() || "",
        presentationType: data.presentationType || "",
        presentationMaterial: data.presentationMaterial || null,
        status: "active",
        attemptCount: 0,
        latestAttemptId: null,
        latestScoreAverage: null,
        categoryAverages: {
            visual: null,
            verbal: null,
            media: null,
        },
        ownerUid: user.uid,
        ownerEmail: user.email || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    };

    return addDoc(collection(db, "users", user.uid, "presentations"), payload);
}

export async function getPresentationSession(user, presentationId) {
    if (!user?.uid) throw new Error("로그인이 필요합니다.");
    const ref = doc(db, "users", user.uid, "presentations", presentationId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("발표 세션을 찾을 수 없습니다.");
    return { id: snap.id, ...snap.data() };
}

export async function createPresentationAttempt(user, presentationId, sourceType) {
    if (!user?.uid) throw new Error("로그인이 필요합니다.");

    const presentationRef = doc(db, "users", user.uid, "presentations", presentationId);
    const attemptRef = doc(collection(presentationRef, "attempts"));

    const attemptNo = await runTransaction(db, async (transaction) => {
        const presentationSnap = await transaction.get(presentationRef);
        if (!presentationSnap.exists()) throw new Error("발표 세션을 찾을 수 없습니다.");

        const nextAttemptNo = (presentationSnap.data().attemptCount || 0) + 1;
        transaction.set(attemptRef, {
            attemptNo: nextAttemptNo,
            sourceType,
            status: "pending",
            scoreAverage: null,
            categoryAverages: {
                visual: null,
                verbal: null,
                media: null,
            },
            analysisResult: null,
            video: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        transaction.update(presentationRef, {
            attemptCount: nextAttemptNo,
            updatedAt: serverTimestamp(),
        });

        return nextAttemptNo;
    });

    return { id: attemptRef.id, ref: attemptRef, attemptNo };
}

export async function markAttemptAnalyzing(user, presentationId, attemptId, patch = {}) {
    if (!user?.uid) throw new Error("로그인이 필요합니다.");
    const attemptRef = doc(db, "users", user.uid, "presentations", presentationId, "attempts", attemptId);
    await updateDoc(attemptRef, {
        ...patch,
        status: "analyzing",
        updatedAt: serverTimestamp(),
    });
}

export async function completePresentationAttempt(user, presentationId, attemptId, analysisResult, patch = {}) {
    if (!user?.uid) throw new Error("로그인이 필요합니다.");

    const scores = analysisResult?.scores || {};
    const scoreAverage = calculateScoreAverage(scores);
    const categoryAverages = calculateCategoryAverages(scores);
    const presentationRef = doc(db, "users", user.uid, "presentations", presentationId);
    const attemptRef = doc(presentationRef, "attempts", attemptId);

    await updateDoc(attemptRef, {
        ...patch,
        status: "completed",
        analysisResult,
        scoreAverage,
        categoryAverages,
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });

    await updateDoc(presentationRef, {
        latestAttemptId: attemptId,
        latestScoreAverage: scoreAverage,
        categoryAverages,
        updatedAt: serverTimestamp(),
    });
}
