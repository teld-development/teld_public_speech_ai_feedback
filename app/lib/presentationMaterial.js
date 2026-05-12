import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

function safeFileName(name) {
    return name
        .replace(/[\\/#?%*:|"<>]/g, "_")
        .replace(/\s+/g, "_")
        .slice(0, 120);
}

export async function uploadPresentationMaterial(file, user) {
    if (!file) return null;
    if (!user?.uid) throw new Error("로그인이 필요합니다.");

    const timestamp = Date.now();
    const fileName = `${timestamp}_${safeFileName(file.name || "presentation.pdf")}`;
    const path = `users/${user.uid}/presentation-materials/${fileName}`;
    const storageRef = ref(storage, path);

    await uploadBytes(storageRef, file, {
        contentType: file.type || "application/pdf",
        customMetadata: {
            ownerUid: user.uid,
            ownerEmail: user.email || "",
            originalName: file.name || "",
        },
    });

    const url = await getDownloadURL(storageRef);

    return {
        name: file.name,
        type: file.type || "application/pdf",
        size: file.size,
        url,
        path,
        ownerUid: user.uid,
        ownerEmail: user.email || "",
        uploadedAt: new Date().toISOString(),
    };
}
