import "./globals.css";

export const metadata = {
  title: "AI 기반 발표 피드백 시스템",
  description: "AI-powered presentation feedback system"
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
