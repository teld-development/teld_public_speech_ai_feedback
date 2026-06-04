/**
 * PDF → PNG 이미지 변환 (브라우저 사이드)
 *
 * 기존 흐름: 웹 → PDF 업로드 → Unity가 PDF 다운로드 → 백엔드로 base64 전송 → 백엔드가 이미지 변환 → Unity가 다시 다운로드
 * 새 흐름: 웹이 PDF 업로드 시점에 바로 이미지로 변환 → 이미지들을 Storage에 업로드 → Unity는 이미지 URL만 다운로드
 *
 * 결과: 라운드트립 완전 제거 → 유니티 시작 속도 대폭 개선
 */
import { storage } from "./firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

/**
 * 일시적 실패(네트워크·렌더 hiccup)에 견디도록 fn 을 최대 tries 번 재시도.
 * 모든 시도 실패 시 마지막 에러를 throw (호출부에서 all-or-nothing 처리).
 */
async function withRetry(fn, { tries = 3, label = "" } = {}) {
    let lastErr;
    for (let attempt = 1; attempt <= tries; attempt++) {
        try {
            return await fn();
        } catch (e) {
            lastErr = e;
            console.warn(`[pdfToImages] ${label} 실패 (시도 ${attempt}/${tries}):`, e?.message || e);
            if (attempt < tries) await new Promise((r) => setTimeout(r, 400 * attempt));
        }
    }
    throw lastErr;
}

/** PDF 한 페이지를 PNG Blob 으로 렌더 (실패 시 throw → withRetry 로 재시도). */
async function renderPageToBlob(pdf, pageNum, scale) {
    const page = await pdf.getPage(pageNum);
    try {
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d", { alpha: false });
        ctx.fillStyle = "#ffffff"; // 흰색 배경 (PDF 투명 처리 방지)
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.92));
        canvas.width = 0; // 메모리 정리
        canvas.height = 0;
        if (!blob) throw new Error("canvas.toBlob 결과가 비어있음(null)");
        return blob;
    } finally {
        page.cleanup();
    }
}

/**
 * PDF 바이트 배열을 PNG 이미지 Blob 배열로 변환.
 * @param {Uint8Array | ArrayBuffer} pdfBytes - PDF 파일 바이트
 * @param {Object} options
 * @param {number} options.scale - 렌더링 배율 (1.5~2.0 권장, 클수록 고화질·느림)
 * @param {(progress: {current: number, total: number}) => void} options.onProgress - 진행 콜백
 * @returns {Promise<Blob[]>} 페이지별 PNG Blob 배열
 */
export async function pdfToImageBlobs(pdfBytes, { scale = 1.5, onProgress } = {}) {
    // ★ 동적 import: Next.js SSR에서 window 참조 에러 방지
    const pdfjsLib = await import("pdfjs-dist/build/pdf.mjs");
    // 워커 경로 설정 (public 폴더에 미리 복사해 둠)
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

    const data = pdfBytes instanceof ArrayBuffer ? new Uint8Array(pdfBytes) : pdfBytes;
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;

    const blobs = [];
    for (let i = 1; i <= totalPages; i++) {
        if (onProgress) onProgress({ current: i - 1, total: totalPages });
        // ★ 페이지별 재시도 — 한 페이지 렌더 hiccup 으로 전체가 실패하지 않게
        const blob = await withRetry(() => renderPageToBlob(pdf, i, scale), {
            tries: 3,
            label: `page ${i} 변환`,
        });
        blobs.push(blob);
    }

    if (onProgress) onProgress({ current: totalPages, total: totalPages });
    pdf.destroy();
    return blobs;
}

/**
 * PDF base64 문자열 → PNG Blob 배열 (편의 함수)
 */
export async function pdfBase64ToImageBlobs(base64, options) {
    const byteChars = atob(base64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
    return pdfToImageBlobs(bytes, options);
}

export async function pdfUrlToImageBlobs(url, options) {
    // ★ PDF 다운로드 재시도 — 일시적 네트워크 실패 흡수
    const buffer = await withRetry(async () => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`PDF 다운로드 실패: HTTP ${response.status}`);
        return response.arrayBuffer();
    }, { tries: 3, label: "PDF 다운로드" });
    return pdfToImageBlobs(buffer, options);
}

/**
 * PDF Blob 배열을 Firebase Storage에 업로드하고 다운로드 URL 배열을 반환.
 * 유니티가 이 URL 배열을 받아 직접 다운로드 → 변환 라운드트립 불필요.
 *
 * ★ 순서 보장: blob[i]를 slide_(i+1).png로 업로드, urls[i]에 해당 URL 저장.
 *   Promise.all + map으로 병렬 업로드해도 결과 배열 인덱스는 입력 인덱스와 일치하므로 순서 안전.
 *
 * @param {Blob[]} blobs - PNG Blob 배열 (인덱스 i = 페이지 i+1)
 * @param {string} simulationCode - 시뮬레이션 코드 (Storage 경로용)
 * @param {(progress: {current: number, total: number}) => void} onProgress
 * @returns {Promise<string[]>} 다운로드 URL 배열 (페이지 순서 그대로)
 */
export async function uploadSlideImages(blobs, simulationCode, optionsOrProgress) {
    const options = typeof optionsOrProgress === "function"
        ? { onProgress: optionsOrProgress }
        : optionsOrProgress || {};
    const { ownerUid, onProgress } = options;
    const total = blobs.length;
    let done = 0;
    if (onProgress) onProgress({ current: 0, total });
    const basePath = ownerUid
        ? `users/${ownerUid}/simulations/${simulationCode}/slides`
        : `simulations/${simulationCode}/slides`;

    // 병렬 업로드 — Promise.all 결과 배열 순서는 입력 순서와 동일 (페이지 순서 보존)
    const urls = await Promise.all(
        blobs.map(async (blob, i) => {
            const pageNum = i + 1;
            const fileName = `slide_${String(pageNum).padStart(3, "0")}.png`;
            const storageRef = ref(storage, `${basePath}/${fileName}`);
            const metadata = { contentType: "image/png" };
            if (ownerUid) metadata.customMetadata = { ownerUid };
            // ★ 업로드/URL 발급 재시도 — 일시적 네트워크 실패 흡수
            await withRetry(() => uploadBytes(storageRef, blob, metadata), { tries: 3, label: `slide ${pageNum} 업로드` });
            const url = await withRetry(() => getDownloadURL(storageRef), { tries: 3, label: `slide ${pageNum} URL` });
            done += 1;
            if (onProgress) onProgress({ current: done, total });
            return url;
        })
    );

    return urls;
}

/**
 * 통합 헬퍼: PDF base64 → 이미지 Blob → Firebase Storage 업로드 → URL 배열 반환
 * setup 페이지에서 한 줄 호출로 끝남.
 */
export async function convertAndUploadPdf(pdfBase64, simulationCode, onProgress) {
    const blobs = await pdfBase64ToImageBlobs(pdfBase64, {
        scale: 1.5,
        onProgress: (p) => onProgress?.({ phase: "convert", ...p }),
    });
    const urls = await uploadSlideImages(blobs, simulationCode, (p) =>
        onProgress?.({ phase: "upload", ...p })
    );
    return { slideImageUrls: urls, pageCount: urls.length };
}

export async function convertAndUploadPdfFromUrl(pdfUrl, simulationCode, options = {}) {
    const { ownerUid, onProgress } = options;
    const blobs = await pdfUrlToImageBlobs(pdfUrl, {
        scale: 1.5,
        onProgress: (p) => onProgress?.({ phase: "convert", ...p }),
    });
    const urls = await uploadSlideImages(blobs, simulationCode, {
        ownerUid,
        onProgress: (p) => onProgress?.({ phase: "upload", ...p }),
    });
    return { slideImageUrls: urls, pageCount: urls.length };
}
