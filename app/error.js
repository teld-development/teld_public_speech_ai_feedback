"use client";

import { useEffect } from "react";

/**
 * Next.js 글로벌 에러 핸들러.
 * DOM 패치가 대부분의 확장 간섭 에러를 막아주지만, 그래도 잡히는 에러를 사용자에게 표시.
 * ★ 자동 reset 은 무한 루프 위험이 있어서 제거. 사용자가 직접 버튼 클릭.
 */
export default function GlobalError({ error, reset }) {
    useEffect(() => {
        // 콘솔에만 기록
        if (error) {
            console.error("[ErrorBoundary]", error);
        }
    }, [error]);

    const msg = error?.message || "알 수 없는 오류";
    const isDomError =
        msg.includes("removeChild") ||
        msg.includes("not a child") ||
        msg.includes("insertBefore");

    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            fontFamily: "sans-serif",
            padding: "24px",
            textAlign: "center",
            background: "#f8f8f8",
        }}>
            <h1 style={{ fontSize: 22, marginBottom: 12, color: "#333" }}>
                {isDomError ? "화면을 다시 그리는 중 문제가 발생했어요" : "오류가 발생했습니다"}
            </h1>
            {isDomError && (
                <p style={{ color: "#666", marginBottom: 16, fontSize: 14, maxWidth: 480, lineHeight: 1.6 }}>
                    크롬 확장프로그램(번역기, Grammarly 등)이 페이지를 수정하면서 생긴 일시적 오류입니다.
                </p>
            )}
            <p style={{ color: "#999", marginBottom: 20, fontSize: 12, maxWidth: 480 }}>
                {msg}
            </p>
            <button
                onClick={() => {
                    try { reset(); }
                    catch { window.location.reload(); }
                }}
                style={{
                    padding: "10px 24px",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#fff",
                    background: "#2563eb",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                }}
            >
                다시 시도
            </button>
        </div>
    );
}
