"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../lib/firebase";

const generateSimulationCode = () =>
    String(Math.floor(100000 + Math.random() * 900000));

const CROWD_SIZE_OPTIONS = [
    { id: "medium", label: "중규모", desc: "10~15명" },
    { id: "large",  label: "대규모", desc: "25명 이상" },
];

const CROWD_ATTITUDE_OPTIONS = [
    { id: "friendly",   label: "우호적", desc: "관심을 갖고 경청하는 청중" },
    { id: "neutral",    label: "중립적", desc: "특별한 반응 없이 듣는 청중" },
    { id: "critical",   label: "비판적", desc: "날카로운 질문을 하는 청중" },
    { id: "distracted", label: "산만한", desc: "집중력이 낮고 잡담하는 청중" },
];

export default function SimulationSetupPage() {
    const router = useRouter();

    const [prepareData, setPrepareData] = useState(null);
    const [crowdSize, setCrowdSize] = useState("");
    const [crowdAttitude, setCrowdAttitude] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const saved = sessionStorage.getItem("prepareData");
        if (!saved) { router.replace("/prepare"); return; }
        try { setPrepareData(JSON.parse(saved)); }
        catch { router.replace("/prepare"); }
    }, [router]);

    const canStart = crowdSize && crowdAttitude;

    const handleStart = async () => {
        if (!canStart || loading) return;
        setLoading(true);
        setError("");
        try {
            const code = generateSimulationCode();

            let materialMeta = null;
            if (prepareData?.presentationMaterial?.base64) {
                const mat = prepareData.presentationMaterial;
                const byteChars = atob(mat.base64);
                const bytes = new Uint8Array(byteChars.length);
                for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
                const blob = new Blob([bytes], { type: mat.type });
                const storageRef = ref(storage, `simulations/${code}/${mat.name}`);
                await uploadBytes(storageRef, blob);
                materialMeta = { name: mat.name, type: mat.type, url: await getDownloadURL(storageRef) };
            }

            const { presentationMaterial: _mat, ...meta } = prepareData;
            await setDoc(doc(db, "simulations", code), {
                ...meta,
                presentationMaterial: materialMeta,
                simulation: { crowdSize, crowdAttitude },
                status: "waiting",
                createdAt: serverTimestamp(),
            });

            sessionStorage.setItem("simulationCode", code);
            router.push(`/simulation/${code}`);
        } catch (err) {
            console.error("시뮬레이션 시작 실패:", err);
            setError("시뮬레이션 시작 중 오류가 발생했습니다. 다시 시도해주세요.");
        } finally {
            setLoading(false);
        }
    };

    if (!prepareData) {
        return (
            <main className="sim-setup-page">
                <div className="sim-setup-loading">불러오는 중…</div>
            </main>
        );
    }

    return (
        <main className="sim-setup-page">
            <div className="sim-setup-container">

                {/* ── 헤더 ── */}
                <header className="sim-setup-header">
                    <button type="button" className="sim-setup-back" onClick={() => router.back()}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
                        </svg>
                        이전
                    </button>
                    <h1>시뮬레이션 환경 설정</h1>
                    <p>가상 발표 환경을 구성합니다. 설정에 따라 시뮬레이션의 난이도와 분위기가 달라집니다.</p>
                </header>

                {/* ── 발표 정보 요약 ── */}
                <section className="sim-setup-summary">
                    <div className="sim-summary-grid">
                        <div className="sim-summary-item">
                            <span className="sim-summary-label">주제</span>
                            <span className="sim-summary-val">{prepareData.topic}</span>
                        </div>
                        <div className="sim-summary-item">
                            <span className="sim-summary-label">청중</span>
                            <span className="sim-summary-val">{prepareData.audience}</span>
                        </div>
                        <div className="sim-summary-item">
                            <span className="sim-summary-label">발표 유형</span>
                            <span className="sim-summary-val">{prepareData.presentationType}</span>
                        </div>
                        {prepareData.duration && (
                            <div className="sim-summary-item">
                                <span className="sim-summary-label">발표 시간</span>
                                <span className="sim-summary-val">{prepareData.duration}</span>
                            </div>
                        )}
                        {prepareData.presentationMaterial && (
                            <div className="sim-summary-item">
                                <span className="sim-summary-label">발표 자료</span>
                                <span className="sim-summary-val sim-summary-val--file">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                                    </svg>
                                    {prepareData.presentationMaterial.name}
                                </span>
                            </div>
                        )}
                    </div>
                </section>

                {/* ── 군중 규모 ── */}
                <section className="sim-setup-section">
                    <div className="sim-setup-section-header">
                        <h2>군중 규모</h2>
                        <span className="required-badge">필수</span>
                    </div>
                    <div className="sim-setup-chips-row">
                        {CROWD_SIZE_OPTIONS.map((opt) => (
                            <button
                                key={opt.id}
                                type="button"
                                className={`sim-setup-chip ${crowdSize === opt.id ? "selected" : ""}`}
                                onClick={() => setCrowdSize(opt.id)}
                            >
                                <span className="sim-chip-label">{opt.label}</span>
                                <span className="sim-chip-desc">{opt.desc}</span>
                            </button>
                        ))}
                    </div>
                </section>

                {/* ── 군중 태도 ── */}
                <section className="sim-setup-section">
                    <div className="sim-setup-section-header">
                        <h2>군중 태도</h2>
                        <span className="required-badge">필수</span>
                    </div>
                    <div className="sim-setup-chips-row">
                        {CROWD_ATTITUDE_OPTIONS.map((opt) => (
                            <button
                                key={opt.id}
                                type="button"
                                className={`sim-setup-chip ${crowdAttitude === opt.id ? "selected" : ""}`}
                                onClick={() => setCrowdAttitude(opt.id)}
                            >
                                <span className="sim-chip-label">{opt.label}</span>
                                <span className="sim-chip-desc">{opt.desc}</span>
                            </button>
                        ))}
                    </div>
                </section>

                {error && <p className="sim-setup-error">{error}</p>}

                <div className="sim-setup-actions">
                    <button type="button" className="btn-secondary" onClick={() => router.back()} disabled={loading}>
                        이전으로
                    </button>
                    <button type="button" className="btn-primary" disabled={!canStart || loading} onClick={handleStart}>
                        {loading ? (
                            <><span className="sim-setup-spinner"></span>코드 발급 중…</>
                        ) : "시뮬레이션 시작"}
                    </button>
                </div>
            </div>
        </main>
    );
}
