function summarizeNonJsonBody(text) {
    const compact = String(text || "")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    return compact.slice(0, 180);
}

export async function readJsonResponse(response, fallbackMessage = "요청 처리에 실패했습니다.") {
    const text = await response.text();
    const contentType = response.headers.get("content-type") || "";

    if (!text) {
        if (response.ok) return null;
        throw new Error(`${fallbackMessage} (HTTP ${response.status})`);
    }

    const shouldBeJson = contentType.includes("application/json");

    try {
        return JSON.parse(text);
    } catch (error) {
        if (shouldBeJson) {
            throw new Error(`${fallbackMessage}: 서버 JSON 응답을 해석하지 못했습니다.`);
        }

        const detail = summarizeNonJsonBody(text);
        const statusText = response.statusText ? ` ${response.statusText}` : "";
        const suffix = detail ? `: ${detail}` : "";
        throw new Error(`${fallbackMessage} (HTTP ${response.status}${statusText})${suffix}`);
    }
}
