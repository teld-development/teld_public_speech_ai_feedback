"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // ★ 로그인 페이지 진입 시 Render 백엔드 미리 깨우기
  //   Render 무료 티어는 15분 무사용 시 슬립. 사용자가 로그인 → 청중 설정 → 시뮬레이션 시작
  //   까지 보통 30~60초 걸리므로, 그 사이에 ping 보내두면 Unity 진입 시점엔 이미 깨어있음
  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "https://xr-zihe.onrender.com";
    // 결과 무시 (실패해도 사용자 흐름엔 영향 X)
    fetch(`${backendUrl}/ping`, { method: "GET", cache: "no-store" })
      .then((r) => console.log(`[Login] 백엔드 ping 응답: ${r.status}`))
      .catch((e) => console.warn("[Login] 백엔드 ping 실패 (무시):", e?.message));
  }, []);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (userId === "1" && password === "1212") {
      setError("");
      router.push("/dashboard");
      return;
    }
    setError("아이디 또는 비밀번호가 올바르지 않습니다.");
  };

  return (
    <main className="page">
      <section className="card">
        <img src="/logo.png" alt="Logo" className="login-logo" />
        <h1 className="title">AI 기반 발표 피드백 시스템</h1>
        <p className="subtitle">프로토타입</p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="label" htmlFor="userId">
              아이디
            </label>
            <input
              className="input"
              id="userId"
              type="text"
              placeholder="Test"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
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
              placeholder="Test1"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <button className="button" type="submit">
            로그인
          </button>
          {error ? <p className="error">{error}</p> : null}
        </form>
        <p className="helper">아이디: 1 / 비밀번호: 1212</p>
      </section>
    </main>
  );
}
