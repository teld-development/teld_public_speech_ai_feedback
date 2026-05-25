"use client";

import { useEffect, useState } from "react";
import { createPresentationSession, updatePresentationSession } from "../lib/presentations";
import { uploadPresentationMaterial } from "../lib/presentationMaterial";

const AUDIENCE_OPTIONS = [
    "교수님",
    "학생들",
    "학회/세미나 청중",
    "기타",
];

const PRESENTATION_TYPE_OPTIONS = ["설득", "설명"];

function initialValue(presentation) {
    return {
        title: presentation?.title || "발표",
        topic: presentation?.topic || "",
        audience: presentation?.audience || "",
        dday: presentation?.dday || "",
        duration: presentation?.duration || "",
        presentationType: presentation?.presentationType || "",
        presentationMaterial: presentation?.presentationMaterial || null,
    };
}

export default function PresentationSessionForm({
    user,
    mode = "create",
    presentation = null,
    onCancel,
    onSaved,
    formId = "presentation-session",
}) {
    const [values, setValues] = useState(() => initialValue(presentation));
    const [presentationMaterial, setPresentationMaterial] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        setValues(initialValue(presentation));
        setPresentationMaterial(null);
        setError("");
    }, [presentation]);

    const canSubmit = values.title.trim() && values.topic.trim() && values.audience && values.dday && values.presentationType && user;
    const isEditing = mode === "edit";
    const fieldId = (name) => `${formId}-${name}`;

    const updateValue = (name, value) => {
        setValues((prev) => ({ ...prev, [name]: value }));
    };

    const handleMaterialChange = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        if (!isPdf) {
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
                : values.presentationMaterial;

            const payload = {
                title: values.title,
                topic: values.topic,
                audience: values.audience,
                dday: values.dday,
                duration: values.duration,
                presentationType: values.presentationType,
                presentationMaterial: materialData || null,
            };

            if (isEditing) {
                await updatePresentationSession(user, presentation.id, payload);
                onSaved?.({ id: presentation.id, ...payload });
            } else {
                const ref = await createPresentationSession(user, payload);
                onSaved?.({ id: ref.id, ...payload });
            }
        } catch (err) {
            console.error("[PresentationSessionForm] 저장 실패:", err);
            setError(err.message || (isEditing ? "발표 정보를 수정하지 못했습니다." : "발표를 추가하지 못했습니다."));
        } finally {
            setSubmitting(false);
        }
    };

    const materialLabel = presentationMaterial?.name
        || values.presentationMaterial?.name
        || "PDF 파일만 추가 가능";

    return (
        <form className="presentation-session-form" onSubmit={handleSubmit}>
            <section className="prepare-section presentation-session-form-section">
                <h2>발표 세션 정보</h2>

                <div className="form-group">
                    <label htmlFor={fieldId("title")}>세션 이름 *</label>
                    <input
                        id={fieldId("title")}
                        type="text"
                        value={values.title}
                        onChange={(event) => updateValue("title", event.target.value)}
                        placeholder="예: 중간 발표"
                    />
                </div>

                <div className="form-group">
                    <label htmlFor={fieldId("topic")}>발표 주제 *</label>
                    <input
                        id={fieldId("topic")}
                        type="text"
                        value={values.topic}
                        onChange={(event) => updateValue("topic", event.target.value)}
                        placeholder="예: 생성형 AI의 교육적 활용 방안"
                    />
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label htmlFor={fieldId("audience")}>예상 청중 *</label>
                        <select id={fieldId("audience")} value={values.audience} onChange={(event) => updateValue("audience", event.target.value)}>
                            <option value="">선택하세요</option>
                            {AUDIENCE_OPTIONS.map((option) => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label htmlFor={fieldId("dday")}>D-day *</label>
                        <input id={fieldId("dday")} type="date" value={values.dday} onChange={(event) => updateValue("dday", event.target.value)} />
                    </div>
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label htmlFor={fieldId("presentationType")}>발표 유형 *</label>
                        <select id={fieldId("presentationType")} value={values.presentationType} onChange={(event) => updateValue("presentationType", event.target.value)}>
                            <option value="">선택하세요</option>
                            {PRESENTATION_TYPE_OPTIONS.map((option) => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label htmlFor={fieldId("duration")}>예상 발표 시간</label>
                        <input
                            id={fieldId("duration")}
                            type="text"
                            value={values.duration}
                            onChange={(event) => updateValue("duration", event.target.value)}
                            placeholder="예: 10분"
                        />
                    </div>
                </div>

                <div className="form-group">
                    <label>발표 자료</label>
                    <div className="file-upload">
                        <input type="file" accept=".pdf,application/pdf" onChange={handleMaterialChange} id={fieldId("material")} />
                        <label htmlFor={fieldId("material")} className="file-upload-label">
                            {materialLabel}
                        </label>
                    </div>
                    <span className="form-hint">
                        {isEditing ? "새 PDF를 선택하면 기존 발표 자료가 교체됩니다." : "세션에 등록한 자료는 이후 모든 연습 회차에서 기본 자료로 사용됩니다."}
                    </span>
                </div>
            </section>

            {error && <p className="sim-setup-error">{error}</p>}

            <div className="prepare-actions presentation-session-form-actions">
                <button type="button" className="btn-secondary" onClick={onCancel} disabled={submitting}>
                    취소
                </button>
                <button type="submit" className="btn-primary" disabled={!canSubmit || submitting}>
                    {submitting ? "저장 중..." : (isEditing ? "수정 완료" : "발표 추가")}
                </button>
            </div>
        </form>
    );
}
