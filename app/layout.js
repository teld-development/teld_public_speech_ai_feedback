import "./globals.css";
import { domExtensionPatch } from "./dom-extension-patch";
import { AuthProvider } from "./lib/AuthProvider";

export const metadata = {
  title: "AI 기반 발표 피드백 시스템",
  description: "AI-powered presentation feedback system"
};

export default function RootLayout({ children }) {
  return (
    // ★ translate="no" : 브라우저 번역 확장 (Google Translate, Papago 등) 차단
    // ★ notranslate class : 추가 보호
    // ★ suppressHydrationWarning : 확장이 DOM 변경 시 hydration 경고 숨김
    <html lang="ko" translate="no" className="notranslate" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
        {/* ★ DOM 메서드 패치 — 확장이 노드를 옮겨도 React removeChild 에러 무력화
            반드시 React 코드보다 먼저 실행되어야 하므로 inline script 로 head 에 주입 */}
        <script
          dangerouslySetInnerHTML={{ __html: domExtensionPatch }}
        />
      </head>
      <body suppressHydrationWarning>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
