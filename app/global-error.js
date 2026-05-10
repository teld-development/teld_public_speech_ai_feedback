"use client";

/**
 * Next.js 루트 레이아웃 에러 핸들러.
 * layout.js 자체에서 발생한 에러도 잡음 (error.js 가 못 잡는 경우).
 */
export default function GlobalError({ error, reset }) {
    const msg = error?.message || "알 수 없는 오류";

    return (
        <html lang="ko">
            <body style={{ fontFamily: "sans-serif", margin: 0 }}>
                <div style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: "100vh",
                    padding: "24px",
                    textAlign: "center",
                    background: "#f8f8f8",
                }}>
                    <h1 style={{ fontSize: 22, marginBottom: 12, color: "#333" }}>
                        앱 오류가 발생했습니다
                    </h1>
                    <p style={{ color: "#666", marginBottom: 16, fontSize: 14, maxWidth: 480, lineHeight: 1.6 }}>
                        크롬 확장프로그램(번역기, Grammarly 등)이 페이지를 수정하면서 생긴 문제일 수 있습니다.
                    </p>
                    <p style={{ color: "#999", marginBottom: 20, fontSize: 12, maxWidth: 480 }}>
                        {msg}
                    </p>
                    <div style={{ display: "flex", gap: 10 }}>
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
                        <button
                            onClick={() => window.location.reload()}
                            style={{
                                padding: "10px 24px",
                                fontSize: 14,
                                fontWeight: 600,
                                color: "#333",
                                background: "#fff",
                                border: "1px solid #ddd",
                                borderRadius: 8,
                                cursor: "pointer",
                            }}
                        >
                            새로고침
                        </button>
                    </div>
                </div>
            </body>
        </html>
    );
}
