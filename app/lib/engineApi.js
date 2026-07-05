import { readJsonResponse } from "./httpResponse";

export const ENGINE_API_BASE = (
    process.env.NEXT_PUBLIC_AI_API_BASE_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "http://34.158.198.43:8000"
).replace(/\/+$/, "");

export function engineUrl(path) {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${ENGINE_API_BASE}${cleanPath}`;
}

export async function engineAuthHeaders(user, headers = {}) {
    const token = user ? await user.getIdToken() : "";
    return {
        ...headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

export async function postEngineJson(path, body, { user, fallbackMessage = "요청 처리에 실패했습니다." } = {}) {
    const response = await fetch(engineUrl(path), {
        method: "POST",
        headers: await engineAuthHeaders(user, {
            "Content-Type": "application/json",
        }),
        body: JSON.stringify(body || {}),
    });
    const payload = await readJsonResponse(response, fallbackMessage);
    if (!response.ok) {
        throw new Error(payload?.detail || payload?.error || `${fallbackMessage} (HTTP ${response.status})`);
    }
    return payload;
}

export function engineErrorMessage(payload, fallback = "요청 처리에 실패했습니다.") {
    return payload?.detail || payload?.error || fallback;
}
