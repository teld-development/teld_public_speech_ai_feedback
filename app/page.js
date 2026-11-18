"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "./lib/firebase";
import { useAuth } from "./lib/AuthProvider";
import { authErrorMessage } from "./lib/authErrors";

export default function LoginPage() {
  const router = useRouter();
  const { user, authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // 로그인 페이지 진입 시 백엔드 상태 확인
  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "https://34.158.198.43.sslip.io";
    // 결과 무시 (실패해도 사용자 흐름엔 영향 X)
    fetch(`${backendUrl}/ping`, { method: "GET", cache: "no-store" })
      .then((r) => console.log(`[Login] 백엔드 ping 응답: ${r.status}`))
      .catch((e) => console.warn("[Login] 백엔드 ping 실패 (무시):", e?.message));
  }, []);

  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/dashboard");
    }
  }, [authLoading, router, user]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError("");

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.push("/dashboard");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page">
      <section className="card">
        <img src="/logo.png" alt="Logo" className="login-logo" />
        <h1 className="title">AI 기반 발표 피드백 시스템</h1>
        <p className="subtitle">이메일 계정으로 로그인하세요</p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="label" htmlFor="email">
              이메일
            </label>
            <input
              className="input"
              id="email"
              type="email"
              placeholder="name@example.com"
              value={email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="password">
              비밀번호
            </label>
            <input
              className="input"
              id="password"
              type="password"
              placeholder="6자 이상"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <button className="button" type="submit" disabled={submitting || authLoading}>
            {submitting ? "로그인 중..." : "로그인"}
          </button>
          {error ? <p className="error">{error}</p> : null}
        </form>
        <p className="helper">
          계정이 없으신가요?{" "}
          <Link className="auth-link" href="/signup">
            회원가입
          </Link>
        </p>
      </section>
    </main>
  );
}
