"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "../lib/AuthProvider";
import { authErrorMessage } from "../lib/authErrors";
import { engineUrl } from "../lib/engineApi";
import { readJsonResponse } from "../lib/httpResponse";

// 엔진 POST /auth/signup 의 검증 규칙과 같은 값으로 유지한다
const MIN_PASSWORD_LENGTH = 6;
const MAX_NAME_LENGTH = 50;

export default function SignupPage() {
  const router = useRouter();
  const { user, authLoading } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // 가입 후 로그인까지 끝나면(submitting 해제) 대시보드로 이동
  useEffect(() => {
    if (!authLoading && user && !submitting) {
      router.replace("/dashboard");
    }
  }, [authLoading, router, submitting, user]);

  const passwordLongEnough = password.length >= MIN_PASSWORD_LENGTH;
  const confirmStatus = !passwordConfirm ? "idle" : password === passwordConfirm ? "met" : "unmet";

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedCode = signupCode.trim();

    if (!auth) {
      setError("인증 설정을 불러오지 못했습니다. 관리자에게 문의해주세요.");
      return;
    }
    if (!trimmedName) {
      setError("이름을 입력해주세요.");
      return;
    }
    if (trimmedName.length > MAX_NAME_LENGTH) {
      setError(`이름은 ${MAX_NAME_LENGTH}자 이하로 입력해주세요.`);
      return;
    }
    if (!trimmedCode) {
      setError("인증코드를 입력해주세요.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상으로 설정해주세요.`);
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호가 서로 일치하지 않습니다.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      // 계정 생성은 엔진 서버가 인증코드를 확인한 뒤 Firebase Admin으로 처리한다
      let response;
      try {
        response = await fetch(engineUrl("/auth/signup"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            email: trimmedEmail,
            password,
            signupCode: trimmedCode,
          }),
        });
      } catch {
        setError("서버에 연결하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해주세요.");
        return;
      }

      let payload = null;
      try {
        payload = await readJsonResponse(response, "회원가입에 실패했습니다.");
      } catch (parseError) {
        if (response.ok) throw parseError;
      }
      if (!response.ok) {
        setError(
          typeof payload?.detail === "string"
            ? payload.detail
            : `회원가입에 실패했습니다. 잠시 후 다시 시도해주세요. (HTTP ${response.status})`
        );
        return;
      }

      try {
        await signInWithEmailAndPassword(auth, trimmedEmail, password);
      } catch (signInError) {
        setError(`가입은 완료됐지만 자동 로그인에 실패했습니다. 로그인 화면에서 다시 로그인해주세요. (${authErrorMessage(signInError)})`);
      }
    } catch (err) {
      setError(err?.message || "회원가입 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page">
      <section className="card">
        <img src="/logo.png" alt="Logo" className="login-logo" />
        <h1 className="title">회원가입</h1>
        <p className="subtitle">이메일로 새 계정을 만드세요</p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="label" htmlFor="name">
              이름
            </label>
            <input
              className="input"
              id="name"
              type="text"
              placeholder="홍길동"
              value={name}
              autoComplete="name"
              maxLength={MAX_NAME_LENGTH}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
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
              placeholder={`${MIN_PASSWORD_LENGTH}자 이상`}
              value={password}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              aria-describedby="password-rule"
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <p id="password-rule" className={`field-hint ${password ? (passwordLongEnough ? "met" : "unmet") : ""}`}>
              <span aria-hidden="true">{passwordLongEnough ? "✓" : "•"}</span>
              {MIN_PASSWORD_LENGTH}자 이상 ({password.length}/{MIN_PASSWORD_LENGTH})
            </p>
          </div>
          <div className="field">
            <label className="label" htmlFor="password-confirm">
              비밀번호 확인
            </label>
            <input
              className="input"
              id="password-confirm"
              type="password"
              placeholder="비밀번호를 한 번 더 입력하세요"
              value={passwordConfirm}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              aria-describedby="password-confirm-status"
              onChange={(event) => setPasswordConfirm(event.target.value)}
              required
            />
            <p
              id="password-confirm-status"
              className={`field-hint ${confirmStatus === "idle" ? "" : confirmStatus}`}
              aria-live="polite"
            >
              <span aria-hidden="true">{confirmStatus === "met" ? "✓" : "•"}</span>
              {confirmStatus === "unmet" ? "비밀번호가 일치하지 않습니다" : "위 비밀번호와 일치"}
            </p>
          </div>
          <div className="field">
            <label className="label" htmlFor="signup-code">
              인증코드
            </label>
            <input
              className="input"
              id="signup-code"
              type="text"
              placeholder="안내받은 인증코드를 입력하세요"
              value={signupCode}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => setSignupCode(event.target.value)}
              required
            />
          </div>
          <button className="button" type="submit" disabled={submitting || authLoading}>
            {submitting ? "가입 중..." : "회원가입"}
          </button>
          {error ? <p className="error">{error}</p> : null}
        </form>
        <p className="helper">
          이미 계정이 있으신가요?{" "}
          <Link className="auth-link" href="/">
            로그인
          </Link>
        </p>
      </section>
    </main>
  );
}
