"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/AuthProvider";
import { createPresentationSession } from "../../lib/presentations";
import { uploadPresentationMaterial } from "../../lib/presentationMaterial";

const AUDIENCE_OPTIONS = [
    "교수님",
    "학생들",
    "학회/세미나 청중",
    "기타",
];

const PRESENTATION_TYPE_OPTIONS = ["설득", "설명"];

export default function NewPresentationPage() {
    const router = useRouter();
    const { user, authLoading } = useAuth();

    const [title, setTitle] = useState("발표");
    const [topic, setTopic] = useState("");
    const [audience, setAudience] = useState("");
    const [dday, setDday] = useState("");
    const [duration, setDuration] = useState("");
    const [presentationType, setPresentationType] = useState("");
    const [presentationMaterial, setPresentationMaterial] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!authLoading && !user) {
            router.replace("/");
        }
    }, [authLoading, router, user]);

    const canSubmit = title.trim() && topic.trim() && audience && dday && presentationType && user;

    const handleMaterialChange = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (file.type && file.type !== "application/pdf") {
            setError("발표 자료는 PDF 파일만 업로드할 수 있습니다.");
            event.target.value = "";
            return;
        }

        setPresentationMaterial(file);
        setError("");
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!canSubmit || submitting) return;

        setSubmitting(true);
        setError("");

        try {
            const materialData = presentationMaterial
                ? await uploadPresentationMaterial(presentationMaterial, user)
                : null;

            const ref = await createPresentationSession(user, {
                title,
                topic,
                audience,
                dday,
                duration,
                presentationType,
                presentationMaterial: materialData,
            });

            router.push(`/presentations/${ref.id}`);
        } catch (err) {
            console.error("[NewPresentation] 생성 실패:", err);
            setError(err.message || "발표를 추가하지 못했습니다.");
        } finally {
            setSubmitting(false);
        }
    };

    if (authLoading || !user) {
        return (
            <main className="prepare-page">
                <div className="prepare-container">
                    <p className="subtitle">계정 정보를 확인하는 중입니다.</p>
                </div>
            </main>
        );
    }

    return (
        <main className="prepare-page">
            <form className="prepare-container" onSubmit={handleSubmit}>
                <header className="prepare-header">
                    <button type="button" className="sim-setup-back" onClick={() => router.push("/dashboard")}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
                        </svg>
                        대시보드
                    </button>
                    <h1>발표 추가</h1>
                    <p>하나의 발표 세션 안에서 여러 번의 연습 결과를 관리합니다.</p>
                </header>

                <section className="prepare-section">
                    <h2>발표 세션 정보</h2>

                    <div className="form-group">
                        <label htmlFor="title">세션 이름 *</label>
                        <input
                            id="title"
                            type="text"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            placeholder="예: 중간 발표"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="topic">발표 주제 *</label>
                        <input
                            id="topic"
                            type="text"
                            value={topic}
                            onChange={(event) => setTopic(event.target.value)}
                            placeholder="예: 생성형 AI의 교육적 활용 방안"
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label htmlFor="audience">예상 청중 *</label>
                            <select id="audience" value={audience} onChange={(event) => setAudience(event.target.value)}>
                                <option value="">선택하세요</option>
                                {AUDIENCE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label htmlFor="dday">D-day *</label>
                            <input id="dday" type="date" value={dday} onChange={(event) => setDday(event.target.value)} />
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label htmlFor="presentationType">발표 유형 *</label>
                            <select id="presentationType" value={presentationType} onChange={(event) => setPresentationType(event.target.value)}>
                                <option value="">선택하세요</option>
                                {PRESENTATION_TYPE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label htmlFor="duration">예상 발표 시간</label>
                            <input
                                id="duration"
                                type="text"
                                value={duration}
                                onChange={(event) => setDuration(event.target.value)}
                                placeholder="예: 10분"
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>발표 자료</label>
                        <div className="file-upload">
                            <input type="file" accept=".pdf" onChange={handleMaterialChange} id="material" />
                            <label htmlFor="material" className="file-upload-label">
                                {presentationMaterial ? presentationMaterial.name : "PDF 파일만 추가 가능"}
                            </label>
                        </div>
                        <span className="form-hint">세션에 등록한 자료는 이후 모든 연습 회차에서 기본 자료로 사용됩니다.</span>
                    </div>
                </section>

                {error && <p className="sim-setup-error">{error}</p>}

                <div className="prepare-actions">
                    <button type="button" className="btn-secondary" onClick={() => router.push("/dashboard")} disabled={submitting}>
                        취소
                    </button>
                    <button type="submit" className="btn-primary" disabled={!canSubmit || submitting}>
                        {submitting ? "저장 중..." : "발표 추가"}
                    </button>
                </div>
            </form>
        </main>
    );
}
