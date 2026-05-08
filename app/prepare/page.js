"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const AUDIENCE_OPTIONS = [
    "교수님",
    "학생들",
    "학회/세미나 청중",
    "기타",
];

const PRESENTATION_TYPE_OPTIONS = [
    {
        id: "설득",
        label: "설득",
        desc: "청중의 생각이나 행동을 이끌어내는 것이 목적인 발표",
    },
    {
        id: "설명",
        label: "설명",
        desc: "정보나 개념을 청중에게 정확히 전달하는 것이 목적인 발표",
    },
];

export default function PreparePage() {
    const router = useRouter();

    const [topic, setTopic] = useState("");
    const [audience, setAudience] = useState("");
    const [duration, setDuration] = useState("");
    const [presentationMaterial, setPresentationMaterial] = useState(null);

    const [presentationType, setPresentationType] = useState("");
    const [consentAnalysis, setConsentAnalysis] = useState(false);

    const [showNextModal, setShowNextModal] = useState(false);
    const [simulationLoading, setSimulationLoading] = useState(false);
    const [simulationError, setSimulationError] = useState("");

    useEffect(() => {
        const saved = sessionStorage.getItem("prepareData");
        if (saved) {
            try {
                const data = JSON.parse(saved);
                if (data.topic) setTopic(data.topic);
                if (data.audience) setAudience(data.audience);
                if (data.duration) setDuration(data.duration);
                if (data.presentationType) setPresentationType(data.presentationType);
            } catch (err) {
                console.error("prepareData 복원 실패:", err);
            }
        }
    }, []);

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) setPresentationMaterial(file);
    };

    const canProceed = topic.trim() && audience && consentAnalysis && presentationType;

    const buildPrepareData = async () => {
        let materialData = null;
        if (presentationMaterial) {
            const buffer = await presentationMaterial.arrayBuffer();
            const base64 = btoa(
                new Uint8Array(buffer).reduce((d, b) => d + String.fromCharCode(b), "")
            );
            materialData = {
                name: presentationMaterial.name,
                type: presentationMaterial.type,
                base64,
            };
        }

        return {
            topic: topic.trim(),
            audience,
            duration,
            presentationType,
            presentationMaterial: materialData,
        };
    };

    const handleNext = () => {
        if (!canProceed) return;
        setSimulationError("");
        setShowNextModal(true);
    };

    const closeNextModal = () => {
        if (simulationLoading) return;
        setShowNextModal(false);
    };

    const handleVideoUpload = async () => {
        if (!canProceed) return;
        const data = await buildPrepareData();
        sessionStorage.setItem("prepareData", JSON.stringify(data));
        router.push("/upload");
    };

    const handleSimulation = async () => {
        if (!canProceed || simulationLoading) return;
        setSimulationLoading(true);
        try {
            const data = await buildPrepareData();
            sessionStorage.setItem("prepareData", JSON.stringify(data));
            router.push("/simulation/setup");
        } catch (err) {
            console.error("시뮬레이션 준비 실패:", err);
            setSimulationError("준비 중 오류가 발생했습니다. 다시 시도해주세요.");
        } finally {
            setSimulationLoading(false);
        }
    };


    return (
        <main className="prepare-page">
            <div className="prepare-container">
                <header className="prepare-header">
                    <h1>발표 분석 준비</h1>
                    <p>발표 맥락에 맞는 피드백을 제공하기 위해 아래 정보를 입력해주세요.</p>
                </header>

                <section className="prepare-section">
                    <h2>발표 정보</h2>

                    <div className="form-group">
                        <label htmlFor="topic">발표 주제 *</label>
                        <input
                            id="topic"
                            type="text"
                            placeholder="예: 생성형 AI의 교육적 활용 방안"
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label htmlFor="audience">청중 *</label>
                            <select
                                id="audience"
                                value={audience}
                                onChange={(e) => setAudience(e.target.value)}
                            >
                                <option value="">선택하세요</option>
                                {AUDIENCE_OPTIONS.map((a) => (
                                    <option key={a} value={a}>{a}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label htmlFor="duration">발표 시간 (선택)</label>
                            <input
                                id="duration"
                                type="text"
                                placeholder="예: 10분"
                                value={duration}
                                onChange={(e) => setDuration(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>발표 자료 (선택)</label>
                        <div className="file-upload">
                            <input
                                type="file"
                                accept=".pdf"
                                onChange={handleFileChange}
                                id="material"
                            />
                            <label htmlFor="material" className="file-upload-label">
                                {presentationMaterial ? presentationMaterial.name : "PDF 파일만 추가 가능"}
                            </label>
                        </div>
                        <span className="form-hint">발표 자료(PDF)를 업로드하면 자료와 발표 내용의 정합성을 함께 분석합니다.</span>
                    </div>

                </section>

                <section className="prepare-section">
                    <h2>발표 유형 선택 *</h2>
                    <p className="section-desc">발표 유형에 따라 평가 기준과 피드백이 달라집니다!</p>

                    <div className="presentation-type-grid">
                        {PRESENTATION_TYPE_OPTIONS.map((opt) => (
                            <button
                                key={opt.id}
                                type="button"
                                className={`presentation-type-chip ${presentationType === opt.id ? "selected" : ""}`}
                                onClick={() => setPresentationType(opt.id)}
                            >
                                {presentationType === opt.id && (
                                    <span className="chip-check">✓</span>
                                )}
                                <span className="chip-label">{opt.label}</span>
                                <span className="chip-desc">{opt.desc}</span>
                            </button>
                        ))}
                    </div>
                </section>

                <section className="prepare-section consent-section">
                    <h2>개인정보 및 데이터 동의</h2>

                    <div className="consent-box">
                        <label className="consent-item">
                            <input
                                type="checkbox"
                                checked={consentAnalysis}
                                onChange={(e) => setConsentAnalysis(e.target.checked)}
                            />
                            <div className="consent-content">
                                <span className="consent-title">분석 목적 데이터 사용 동의 *</span>
                                <span className="consent-desc">
                                    업로드한 발표 영상은 분석 목적으로만 사용되며, 분석 완료 후 원본 데이터는 즉시 파기됩니다.
                                </span>
                            </div>
                        </label>
                    </div>
                </section>

                <div className="prepare-actions">
                    <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => router.push("/dashboard")}
                    >
                        이전으로
                    </button>
                    <button
                        type="button"
                        className="btn-primary"
                        disabled={!canProceed}
                        onClick={handleNext}
                    >
                        다음 단계로
                    </button>
                </div>
            </div>

            {showNextModal && (
                <div className="next-modal-backdrop" onClick={closeNextModal}>
                    <div
                        className="next-modal"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                    >
                        <h3 className="next-modal-title">분석 방식 선택</h3>
                                <p className="next-modal-desc">
                                    발표를 어떤 방식으로 진행하시겠어요?
                                </p>
                                <div className="next-modal-options">
                                    <button
                                        type="button"
                                        className="next-modal-option"
                                        onClick={handleSimulation}
                                        disabled={simulationLoading}
                                    >
                                        <span className="next-modal-option-icon">🎮</span>
                                        <span className="next-modal-option-title">시뮬레이션</span>
                                        <span className="next-modal-option-desc">
                                            Unity 가상 발표 환경에서 진행합니다.
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        className="next-modal-option"
                                        onClick={handleVideoUpload}
                                        disabled={simulationLoading}
                                    >
                                        <span className="next-modal-option-icon">🎥</span>
                                        <span className="next-modal-option-title">영상 업로드하기</span>
                                        <span className="next-modal-option-desc">
                                            촬영한 발표 영상을 업로드해 분석합니다.
                                        </span>
                                    </button>
                                </div>

                                {simulationLoading && (
                                    <p className="next-modal-status">준비 중…</p>
                                )}
                                {simulationError && (
                                    <p className="next-modal-error">{simulationError}</p>
                                )}

                                <div className="next-modal-footer">
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        onClick={closeNextModal}
                                        disabled={simulationLoading}
                                    >
                                        닫기
                                    </button>
                                </div>
                    </div>
                </div>
            )}
        </main>
    );
}
