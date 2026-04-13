"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

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
