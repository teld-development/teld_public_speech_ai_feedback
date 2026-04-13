"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FEEDBACK_CATEGORIES, ALL_ITEM_IDS } from "../lib/feedbackAreas";

const AUDIENCE_OPTIONS = [
    "일반 대중",
    "전문가/업계 관계자",
    "학생/교육 대상",
    "임원/의사결정자",
    "내부 동료",
    "기타",
];

export default function PreparePage() {
    const router = useRouter();

    const [topic, setTopic] = useState("");
    const [audience, setAudience] = useState("");
    const [duration, setDuration] = useState("");
    const [presentationMaterial, setPresentationMaterial] = useState(null);
    const [conditions, setConditions] = useState([]);

    const [selectedItems, setSelectedItems] = useState([]);
    const [consentAnalysis, setConsentAnalysis] = useState(false);

    useEffect(() => {
        const saved = sessionStorage.getItem("prepareData");
        if (saved) {
            try {
                const data = JSON.parse(saved);
                if (data.topic) setTopic(data.topic);
                if (data.audience) setAudience(data.audience);
                if (data.duration) setDuration(data.duration);
                if (data.feedbackItems) setSelectedItems(data.feedbackItems);
                if (data.conditions) setConditions(data.conditions);
            } catch (err) {
                console.error("prepareData 복원 실패:", err);
            }
        }
    }, []);

    const toggleItem = (id) => {
        setSelectedItems((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    };

    const toggleCategory = (categoryId) => {
        const cat = FEEDBACK_CATEGORIES.find((c) => c.id === categoryId);
        const ids = cat.items.map((i) => i.id);
        const allSelected = ids.every((id) => selectedItems.includes(id));
        setSelectedItems((prev) =>
            allSelected ? prev.filter((x) => !ids.includes(x)) : [...new Set([...prev, ...ids])]
        );
    };

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) setPresentationMaterial(file);
    };

    const addCondition = () => {
        if (conditions.length < 6) setConditions([...conditions, ""]);
    };
    const removeCondition = (i) => setConditions(conditions.filter((_, idx) => idx !== i));
    const updateCondition = (i, v) => {
        const next = [...conditions];
        next[i] = v;
        setConditions(next);
    };

    const canProceed = topic.trim() && audience && consentAnalysis && selectedItems.length > 0;

    const handleNext = async () => {
        if (!canProceed) return;

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

        const validConditions = conditions.filter((c) => c.trim() !== "");
        sessionStorage.setItem(
            "prepareData",
            JSON.stringify({
                topic: topic.trim(),
                audience,
                duration,
                feedbackItems: selectedItems,
                presentationMaterial: materialData,
                conditions: validConditions,
            })
        );
        router.push("/upload");
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

                    <div className="form-group">
                        <div className="conditions-header">
                            <label>분석 조건 (선택)</label>
                            {conditions.length < 6 && (
                                <button type="button" className="btn-add-condition" onClick={addCondition}>
                                    + 조건 추가
                                </button>
                            )}
                        </div>
                        <span className="form-hint">발표에서 확인하고 싶은 특정 조건의 충족 여부를 분석합니다. (최대 6개)</span>

                        {conditions.length > 0 && (
                            <div className="conditions-list">
                                {conditions.map((condition, index) => (
                                    <div key={index} className="condition-item">
                                        <span className="condition-number">{index + 1}</span>
                                        <input
                                            type="text"
                                            placeholder="예: 핵심 메시지를 세 번 이상 반복했는가"
                                            value={condition}
                                            onChange={(e) => updateCondition(index, e.target.value)}
                                            className="condition-input"
                                        />
                                        <button
                                            type="button"
                                            className="btn-remove-condition"
                                            onClick={() => removeCondition(index)}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </section>

                <section className="prepare-section">
                    <h2>피드백 영역 선택 *</h2>
                    <p className="section-desc">피드백 받고 싶은 항목을 선택해주세요. (1개 이상)</p>

                    {FEEDBACK_CATEGORIES.map((cat) => {
                        const ids = cat.items.map((i) => i.id);
                        const allSelected = ids.every((id) => selectedItems.includes(id));
                        return (
                            <div key={cat.id} className="feedback-category-block">
                                <div className="feedback-category-title">
                                    <span className="category-icon">{cat.icon}</span>
                                    <div>
                                        <h4>{cat.label}</h4>
                                        <span className="category-short">{cat.shortLabel}</span>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn-category-toggle"
                                        onClick={() => toggleCategory(cat.id)}
                                    >
                                        {allSelected ? "전체 해제" : "전체 선택"}
                                    </button>
                                </div>
                                <div className="feedback-grid">
                                    {cat.items.map((item) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            className={`feedback-chip ${selectedItems.includes(item.id) ? "selected" : ""}`}
                                            onClick={() => toggleItem(item.id)}
                                            title={item.desc}
                                        >
                                            {selectedItems.includes(item.id) && (
                                                <span className="chip-check">✓</span>
                                            )}
                                            <span className="chip-label">{item.label}</span>
                                            <span className="chip-desc">{item.desc}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
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
                        다음: 영상 업로드
                    </button>
                </div>
            </div>
        </main>
    );
}
