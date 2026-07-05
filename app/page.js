"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "./lib/firebase";
import { useAuth } from "./lib/AuthProvider";

function authErrorMessage(error) {
  switch (error?.code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "이메일 또는 비밀번호가 올바르지 않습니다.";
    case "auth/invalid-email":
      return "이메일 형식을 확인해주세요.";
    default:
      return error?.message || "인증 중 오류가 발생했습니다.";
  }
}

export default function LoginPage() {
  const router = useRouter();
  const { user, authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // 로그인 페이지 진입 시 백엔드 상태 확인
  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://34.158.198.43:8000";
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
        <p className="subtitle">제공된 테스트 계정으로 로그인하세요</p>
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
        <p className="helper">PDF와 시뮬레이션 데이터는 테스트 계정 기준으로 저장됩니다.</p>
      </section>
    </main>
  );
}
