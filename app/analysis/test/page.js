"use client";

/**
 * analysis 페이지 단독 테스트용
 * → http://localhost:3000/analysis/test 접속하면 가짜 데이터를 sessionStorage에 주입하고 /analysis 로 이동
 *
 * 실제 Unity·웹 흐름 안 거치고 디자인·레이아웃만 빠르게 확인할 때 사용.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ALL_ITEM_IDS, FEEDBACK_CATEGORIES } from "../../lib/feedbackAreas";

const PROFILES = {
    short: {
        label: "짧은 데이터 (정상 길이)",
        data: {
            source: "unity",
            feedbackText: "전반적으로 차분하고 안정적인 발표였습니다. 청중과의 시선 교환이 좋았으며, 슬라이드 전환도 매끄러웠습니다. 다만 음성의 톤 변화가 다소 단조로워 청중의 집중을 유지하기 어려운 구간이 있었습니다.",
            refinedTranscript: "안녕하세요. 오늘은 인공지능의 미래에 대해 발표하겠습니다.",
            pscrScoresJson: JSON.stringify({
                content: 76, organization: 74, expression: 78,
            }),
            logsJson: JSON.stringify([
                { text: "안녕하세요, 발표를 시작하겠습니다.", durationSec: 6, speedStatus: "보통", volumeRatio: 1.0, silenceDuration: 1 },
                { text: "오늘 주제는 인공지능과 미래 사회입니다.", durationSec: 8, speedStatus: "느림", volumeRatio: 0.9, silenceDuration: 2 },
                { text: "인공지능의 발전은 매우 빠르게 진행되고 있습니다.", durationSec: 10, speedStatus: "보통", volumeRatio: 1.1, silenceDuration: 1 },
                { text: "특히 의료 분야에서 큰 발전이 있었습니다.", durationSec: 7, speedStatus: "빠름", volumeRatio: 1.3, emphasizeStatus: "강조", silenceDuration: 1 },
            ]),
            timelineEventsJson: JSON.stringify([
                { time: 0, type: "slide_change", label: "슬라이드 1: 표지" },
                { time: 30, type: "slide_change", label: "슬라이드 2: 서론" },
                { time: 65, type: "slide_change", label: "슬라이드 3: 본론" },
                { time: 110, type: "slide_change", label: "슬라이드 4: 결론" },
            ]),
            totalScore: 76,
            audioUrl: "",
            videoUrl: "",
            motionSummary: "발표 내내 정면을 향한 자세 유지\n제스처 사용 빈도 양호 (분당 8회)\n흔들림이나 산만한 동작 거의 없음\n청중 끄덕임에 미소로 반응함",
        },
    },
    long: {
        label: "긴 종합 피드백 (스크롤 테스트)",
        data: {
            source: "unity",
            feedbackText: `이번 발표는 전반적으로 매우 인상적이었습니다. 발표자는 주제에 대한 깊은 이해를 바탕으로 청중에게 명확하고 체계적인 메시지를 전달하는 데 성공했습니다.

특히 도입부에서 사용한 시선 처리는 매우 효과적이었으며, 청중과의 라포 형성에 큰 도움이 되었습니다. 다만, 본론으로 넘어가면서 다소 톤의 변화가 단조로워지는 경향이 있었습니다. 이를 개선하기 위해서는 핵심 키워드를 강조하는 연습이 필요할 것으로 보입니다.

또한 슬라이드 전환 시점이 발표 내용의 흐름과 잘 맞아떨어졌으며, 시각 자료의 활용도가 높았습니다. 손동작 또한 적절한 빈도로 사용되어 메시지 강조에 기여했습니다.

청중과의 상호작용 측면에서는 비언어적 반응(끄덕임, 미소)에 대한 인지가 비교적 늦은 편이었습니다. 청중의 미세한 반응에 더 빠르게 대응한다면, 발표의 역동성이 더욱 향상될 것입니다.

음성 측면에서는 전반적으로 명료한 발음을 유지했으나, 일부 구간에서 발음의 빠르기가 너무 빠르거나 느려지는 등 일관성이 흔들리는 부분이 관찰되었습니다. 특히 30-45초 구간과 1분 20초 부근에서 청중이 내용을 따라가기 어려웠을 가능성이 있습니다.

종합적으로 이번 발표는 80점 이상의 우수한 수준이며, 위에서 언급한 부분들을 보완한다면 더욱 완성도 높은 발표가 가능할 것으로 기대됩니다. 다음 발표에서는 특히 톤 조절과 청중 반응에 대한 즉각적 대응 능력을 길러보시기 바랍니다.`,
            refinedTranscript: "안녕하세요. 오늘 발표할 주제는 인공지능과 미래 사회입니다. 본 발표에서는 다음 세 가지를 중심으로 살펴보겠습니다...",
            pscrScoresJson: JSON.stringify({
                content: 82, organization: 80, expression: 83,
            }),
            logsJson: JSON.stringify([
                { text: "안녕하세요, 오늘 발표를 시작하겠습니다.", durationSec: 6, speedStatus: "보통", volumeRatio: 1.0 },
                { text: "본 주제는 인공지능과 미래 사회의 변화입니다.", durationSec: 8, speedStatus: "느림", volumeRatio: 0.9 },
                { text: "첫째, 인공지능의 정의에 대해 살펴보겠습니다.", durationSec: 9, speedStatus: "보통", volumeRatio: 1.0, emphasizeStatus: "강조" },
                { text: "둘째, 의료 분야의 응용 사례입니다.", durationSec: 7, speedStatus: "빠름", volumeRatio: 1.3 },
                { text: "셋째, 윤리적 고려사항을 짚어보겠습니다.", durationSec: 8, speedStatus: "느림", volumeRatio: 0.85 },
                { text: "마지막으로 결론과 향후 전망입니다.", durationSec: 6, speedStatus: "보통", volumeRatio: 1.0 },
            ]),
            timelineEventsJson: JSON.stringify([
                { time: 0, type: "slide_change", label: "슬라이드 1: 표지" },
                { time: 25, type: "slide_change", label: "슬라이드 2: 목차" },
                { time: 55, type: "slide_change", label: "슬라이드 3: AI 정의" },
                { time: 90, type: "slide_change", label: "슬라이드 4: 의료 응용" },
                { time: 130, type: "slide_change", label: "슬라이드 5: 윤리" },
                { time: 165, type: "slide_change", label: "슬라이드 6: 결론" },
            ]),
            totalScore: 82,
            audioUrl: "",
            videoUrl: "",
            motionSummary: "발표 내내 일관된 정면 자세 유지\n제스처 사용 빈도 적절 (분당 10회)\n양손 활용 균형 양호\n청중의 비언어적 반응에 미소로 응답\n슬라이드 전환 시 손짓으로 강조하는 모습 관찰됨\n흔들리거나 산만한 동작 거의 없음",
        },
    },
    minimal: {
        label: "최소 데이터 (빈 화면 테스트)",
        data: {
            source: "unity",
            feedbackText: "발표 분석이 완료되었습니다.",
            totalScore: 60,
            audioUrl: "",
            videoUrl: "",
        },
    },
    manyTimestamps: {
        label: "한 카드에 타임스탬프 많음 (카드 내부 스크롤 테스트)",
        data: {
            source: "unity",
            feedbackText: "제스처와 시선 처리에 대한 상세 모션 분석이 다수 기록되었습니다.",
            totalScore: 70,
            audioUrl: "",
            videoUrl: "",
            // motionSummary에 '제스처' 키워드를 의도적으로 많이 넣어 한 항목으로 몰리게 함
            motionSummary: [
                "제스처: 양손을 활용한 자연스러운 손동작 관찰됨",
                "제스처 횟수: 분당 12회로 적정 범위",
                "제스처 다양성: 강조형·설명형 균형 양호",
                "제스처 범위: 카메라 프레임 내에서 적절",
                "제스처: 손바닥 보이는 개방형 비율 65%",
                "제스처: 가리키는 동작은 슬라이드 전환 시 사용",
                "제스처: 양손 대칭 사용 시간 80%",
                "제스처: 어깨 위로 올라가는 손동작은 강조 구간에 집중",
                "제스처와 발화 동기화 양호 - 키워드와 손동작이 동시 발생",
                "제스처: 후반부로 갈수록 빈도 감소 추세",
                "제스처 휴식 구간: 자료 가리키는 동작과 자연스럽게 전환",
            ].join("\n"),
            logsJson: JSON.stringify([
                { text: "안녕하세요, 발표를 시작하겠습니다.", durationSec: 6, speedStatus: "보통", volumeRatio: 1.0 },
                { text: "오늘 주제는 효과적인 발표 기법입니다.", durationSec: 8, speedStatus: "느림", volumeRatio: 0.95 },
            ]),
            timelineEventsJson: JSON.stringify([
                { time: 0, type: "slide_change", label: "슬라이드 1: 표지" },
                { time: 30, type: "slide_change", label: "슬라이드 2: 본론" },
            ]),
        },
    },
};

export default function AnalysisTestPage() {
    const router = useRouter();
    const [selected, setSelected] = useState("long");

    const handleStart = (key) => {
        const profile = PROFILES[key];
        if (!profile) return;
        const scores = ALL_ITEM_IDS.reduce((acc, itemId, index) => {
            acc[itemId] = 3 + (index % 3);
            return acc;
        }, {});
        const timestamps = FEEDBACK_CATEGORIES.flatMap((category, categoryIndex) =>
            category.items.slice(0, 3).map((item, itemIndex) => {
                const seconds = 20 + categoryIndex * 80 + itemIndex * 24;
                return {
                    time: `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`,
                    seconds,
                    category: category.label,
                    item: item.label,
                    feedback: `${item.label}과 관련해 ${item.desc} 현재 발표에서는 대체로 안정적이지만, 다음 연습에서 더 명확하게 드러내면 좋습니다.`,
                };
            })
        );
        sessionStorage.setItem("analysisResult", JSON.stringify({
            ...profile.data,
            timestamps,
            scores,
            summary: {
                overall: "테스트 발표는 내용, 조직, 표현의 세 영역이 전반적으로 균형 있게 구성되었습니다. 주제와 청중을 고려한 설명은 안정적이었고, 발표 흐름도 비교적 분명했습니다. 다만 결론의 마무리와 핵심 문장의 음성 강조를 더 선명하게 만들면 전달력이 높아질 수 있습니다.",
                strengths: [
                    "주제와 청중을 고려한 설명 방식이 안정적입니다.",
                    "도입과 본론의 흐름이 비교적 자연스럽습니다.",
                    "태도와 매체 활용이 발표 상황에 잘 맞습니다.",
                ],
                suggestions: [
                    "결론에서 핵심 논지를 한 문장으로 다시 정리해보세요.",
                    "내용 전환부마다 연결 표현을 넣어 흐름을 강화해보세요.",
                    "중요 문장은 속도와 강세를 조절해 강조해보세요.",
                ],
            },
        }));
        sessionStorage.setItem("videoName", `테스트: ${profile.label}`);
        sessionStorage.setItem("prepareData", JSON.stringify({
            topic: "테스트 발표",
            feedbackItems: ALL_ITEM_IDS,
        }));
        router.push("/analysis");
    };

    const handleClear = () => {
        sessionStorage.removeItem("analysisResult");
        sessionStorage.removeItem("videoName");
        sessionStorage.removeItem("videoUrl");
        sessionStorage.removeItem("prepareData");
        alert("sessionStorage 초기화 완료");
    };

    return (
        <main style={{
            minHeight: "100vh",
            background: "#f8f8f8",
            padding: "60px 24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
        }}>
            <div style={{
                maxWidth: 720, width: "100%",
                background: "#fff",
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 16,
                padding: "32px 36px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
            }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                    🧪 Analysis 페이지 단독 테스트
                </h1>
                <p style={{ color: "#666", marginBottom: 28, fontSize: 14 }}>
                    Unity·시뮬레이션 안 거치고 가짜 데이터로 분석 페이지 디자인을 확인합니다.
                </p>

                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>프로필 선택</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
                    {Object.entries(PROFILES).map(([key, p]) => (
                        <label key={key} style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "12px 16px",
                            background: selected === key ? "#eff6ff" : "#f8fafc",
                            border: `1px solid ${selected === key ? "#3b82f6" : "#e2e8f0"}`,
                            borderRadius: 8,
                            cursor: "pointer",
                            transition: "all 0.15s",
                        }}>
                            <input
                                type="radio"
                                name="profile"
                                value={key}
                                checked={selected === key}
                                onChange={(e) => setSelected(e.target.value)}
                            />
                            <span style={{ fontWeight: 500 }}>{p.label}</span>
                        </label>
                    ))}
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                    <button
                        onClick={() => handleStart(selected)}
                        style={{
                            flex: 1,
                            padding: "12px 20px",
                            fontSize: 15,
                            fontWeight: 600,
                            color: "#fff",
                            background: "#2563eb",
                            border: "none",
                            borderRadius: 8,
                            cursor: "pointer",
                        }}
                    >
                        분석 페이지 열기 →
                    </button>
                    <button
                        onClick={handleClear}
                        style={{
                            padding: "12px 20px",
                            fontSize: 14,
                            fontWeight: 500,
                            color: "#666",
                            background: "#fff",
                            border: "1px solid #ddd",
                            borderRadius: 8,
                            cursor: "pointer",
                        }}
                    >
                        sessionStorage 초기화
                    </button>
                </div>

                <hr style={{ margin: "28px 0 20px", border: 0, borderTop: "1px solid #eee" }} />
                <details style={{ fontSize: 13, color: "#666" }}>
                    <summary style={{ cursor: "pointer", fontWeight: 500 }}>📌 사용 안내</summary>
                    <ul style={{ marginTop: 10, paddingLeft: 20, lineHeight: 1.7 }}>
                        <li><b>짧은 데이터</b>: 일반적인 분석 결과 - 정상 길이로 모든 영역 표시</li>
                        <li><b>긴 종합 피드백</b>: 종합 피드백 박스가 스크롤 되는지 테스트</li>
                        <li><b>최소 데이터</b>: 데이터가 거의 없을 때 fallback 동작 확인</li>
                        <li>실제 Unity 결과를 보려면 대시보드에서 발표 세션을 열고 시뮬레이션을 시작한 뒤, 6자리 코드를 유니티에서 입력해 진행해야 합니다.</li>
                    </ul>
                </details>
            </div>
        </main>
    );
}
