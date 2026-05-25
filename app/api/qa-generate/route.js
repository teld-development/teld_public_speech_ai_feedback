// /api/qa-generate
// 발표 청크 배열을 받아 Gemini 로 best 3개 선택 + 청중 캐릭터별 질문 생성 + Google Cloud TTS 로 음성 변환.
//
// 호출: Unity QAFlow.BeginQA() → BackendClient.RequestQAQuestionsBatch(chunks)
//        → POST {webBaseUrl}/api/qa-generate
//
// 입력:
// {
//   sessionId: "...",
//   chunks: [{ index, startSec, endSec, startSlideIndex, endSlideIndex, transcript }, ...],
//   genderMap: ["male","female","male","female","male","female","male","female"]  // 8개 인터랙티브 청중 성별
// }
//
// 출력:
// {
//   questions: [
//     { questionText, audioBase64, targetStudentIndex, chunkIndex }, ...3개
//   ]
// }

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage } from "@langchain/core/messages";

export const maxDuration = 60;

// ── 성인 한국어 voice 풀 ─────────────────────────────────────────────
// ★ Chirp3 HD 우선 — Google 최신 LLM 기반 voice, 사람과 거의 구분 안 됨.
//   Neural2 + Wavenet 을 fallback 으로 함께 보유 (Chirp HD 실패 시 다음 voice 자동 시도).
//   ★ Chirp HD 는 pitch / speakingRate 조정이 부자연스럽거나 무시될 수 있음 →
//      ttsToBase64 에서 Chirp 일 땐 pitch / rate 안 보냄.
//   가격: Chirp HD = $30/M 자 (Neural2 $16 의 약 2배). 무료 한도 1M/월 동일.
const FEMALE_VOICE_POOL = [
    { name: "ko-KR-Chirp3-HD-Achernar", pitch_offset: 0.0, rate: 1.0 },  // 자연스러운 성인 여성 (LLM)
    { name: "ko-KR-Chirp3-HD-Aoede",    pitch_offset: 0.0, rate: 1.0 },
    { name: "ko-KR-Chirp3-HD-Kore",     pitch_offset: 0.0, rate: 1.0 },
    { name: "ko-KR-Chirp3-HD-Sulafat",  pitch_offset: 0.0, rate: 1.0 },
    // fallback (Chirp 사용 불가 시 자동으로 다음 voice 사용 안 됨 — 사용자가 풀에서 빼야 함)
    { name: "ko-KR-Neural2-A",          pitch_offset: 0.0, rate: 1.0 },
    { name: "ko-KR-Neural2-B",          pitch_offset: -0.5, rate: 1.0 },
];
const MALE_VOICE_POOL = [
    { name: "ko-KR-Chirp3-HD-Algieba",  pitch_offset: 0.0, rate: 1.0 },  // 자연스러운 성인 남성 (LLM)
    { name: "ko-KR-Chirp3-HD-Charon",   pitch_offset: 0.0, rate: 1.0 },
    { name: "ko-KR-Chirp3-HD-Puck",     pitch_offset: 0.0, rate: 1.0 },
    { name: "ko-KR-Chirp3-HD-Schedar",  pitch_offset: 0.0, rate: 1.0 },
    // fallback
    { name: "ko-KR-Neural2-C",          pitch_offset: -1.0, rate: 1.0 },
];

function pickVoice(studentIndex, gender) {
    const g = (gender || "neutral").toLowerCase();
    const pool = g === "male" ? MALE_VOICE_POOL
              : g === "female" ? FEMALE_VOICE_POOL
              : [...FEMALE_VOICE_POOL, ...MALE_VOICE_POOL];
    return pool[studentIndex % pool.length];
}

// ── Google Cloud TTS REST 호출 ────────────────────────────────────────────
async function ttsToBase64(text, studentIndex, gender, apiKey) {
    if (!apiKey) return "";
    const voice = pickVoice(studentIndex, gender);
    const isChirp = voice.name.includes("Chirp");

    const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;

    // ★ Chirp HD voices: pitch / speakingRate 보내면 부자연스러워지거나 무시됨 → audioEncoding + volumeGainDb 만
    // ★ Neural2 / Wavenet: 기존대로 pitch / rate 미세 변동 (캐릭터별 다양성)
    const audioConfig = isChirp
        ? {
            audioEncoding: "MP3",
            volumeGainDb: 1.0,
        }
        : (() => {
            const finalPitch = voice.pitch_offset + (Math.random() * 0.4 - 0.2);
            const finalRate = voice.rate + (Math.random() * 0.04 - 0.02);
            return {
                audioEncoding: "MP3",
                speakingRate: Math.round(finalRate * 100) / 100,
                pitch: Math.round(finalPitch * 10) / 10,
                volumeGainDb: 1.0,
            };
        })();

    const payload = {
        input: { text },
        voice: { languageCode: "ko-KR", name: voice.name },
        audioConfig,
    };

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) {
            console.error(`[qa-generate] TTS HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
            return "";
        }
        const data = await res.json();
        console.log(`[qa-generate] TTS 변환 완료 (${voice.name} | ${gender}): '${text.slice(0, 30)}...'`);
        return data.audioContent || "";
    } catch (e) {
        console.error(`[qa-generate] TTS 예외: ${e.message}`);
        return "";
    }
}

// ── JSON 추출 — 코드 블록 / 산문 사이 끼어있는 JSON 까지 모두 보수적으로 추출 ──
function extractJSON(text) {
    if (!text) return "";
    // 1) ```json ... ``` 또는 ``` ... ``` 코드블록
    const fenced = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
    if (fenced) return fenced[1];
    // 2) 첫 '{' 와 마지막 '}' 사이 (가장 흔한 케이스: 산문 안에 JSON 끼어있음)
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        return text.slice(firstBrace, lastBrace + 1);
    }
    // 3) 그래도 못 찾으면 원본 그대로 (호출자가 파싱 실패 처리)
    return text;
}

// ── 빈약한 transcript 일 때 사용할 fallback 질문 (Gemini 호출 우회) ──
function buildFallbackQuestions(totalQuestions) {
    const pool = [
        { type: "clarification", question: "발표 도입부에서 다루신 주제를 좀 더 구체적으로 설명해주실 수 있을까요?" },
        { type: "evidence",      question: "발표의 핵심 메시지를 뒷받침하는 사례나 근거가 있다면 한 가지만 더 들려주실 수 있나요?" },
        { type: "application",   question: "이 주제가 실제 상황에서 어떻게 적용될 수 있을지 궁금합니다." },
        { type: "clarification", question: "발표 중 가장 강조하고 싶으셨던 부분은 어떤 것이었나요?" },
        { type: "evidence",      question: "이 주제에 대한 발표자님의 견해를 한 번 더 정리해주실 수 있을까요?" },
    ];
    return pool.slice(0, totalQuestions).map((q, i) => ({ chunkIndex: 0, type: q.type, question: q.question }));
}

// ── 메인 핸들러 ────────────────────────────────────────────────────────────
export async function POST(request) {
    try {
        const body = await request.json();
        const {
            sessionId = "",
            chunks = [],
            genderMap = [],
            personalityMap = [],
            totalQuestions = 3,
            firstStudentHint = -1,
        } = body;

        // ★ critical 질문 비율 — 비판적/날카로움 청중 수에 따라 0/1/2 결정
        //   3명 이상 → 2개, 1~2명 → 1개, 0명 → 0개 (절대 3개는 안 함 — 너무 공격적)
        const criticalAudienceCount = (personalityMap || []).filter(
            (p) => p === "critical" || p === "sharp"
        ).length;
        let criticalCount;
        if (criticalAudienceCount >= 3) criticalCount = 2;
        else if (criticalAudienceCount >= 1) criticalCount = 1;
        else criticalCount = 0;
        console.log(`[qa-generate] 청중 비판적/날카로움 ${criticalAudienceCount}명 → critical 질문 ${criticalCount}개`);

        const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            return Response.json({ error: "GEMINI_API_KEY 가 설정되지 않았습니다." }, { status: 500 });
        }
        const cleanApiKey = apiKey.trim();
        const ttsApiKey = (process.env.GOOGLE_TTS_API_KEY || process.env.GOOGLE_API_KEY || apiKey).trim();

        if (!Array.isArray(chunks) || chunks.length === 0) {
            return Response.json({ error: "chunks 가 비어있습니다." }, { status: 400 });
        }

        console.log(`[qa-generate] 시작 — sessionId=${sessionId}, 청크 ${chunks.length}개`);

        // ★ 빈약한 transcript 가드 — Gemini 가 거부 응답 ("발표 내용 부족...") 보낼 위험 회피
        //   총 transcript 가 200자 미만이면 Gemini 호출 우회하고 fallback 질문 사용 (메인 흐름 그대로 타기)
        const totalTranscriptLen = chunks.reduce((s, c) => s + ((c.transcript || "").length), 0);
        const useTranscriptFallback = totalTranscriptLen < 200;
        if (useTranscriptFallback) {
            console.warn(`[qa-generate] transcript 빈약 (${totalTranscriptLen}자 < 200) → Gemini 우회, fallback 질문 사용`);
        }

        // Gemini 한 번 호출로 best N 청크 선택 + 청크별 질문 생성
        const model = new ChatGoogleGenerativeAI({
            model: "gemini-2.5-flash",
            apiKey: cleanApiKey,
        });

        // 프롬프트용 청크 요약 (transcript 가 너무 길면 잘라서)
        // ★ 500 → 1500자: 5분 청크 후반부 누락 방지. gemini-2.5-flash 컨텍스트 충분.
        //   머리/꼬리 분리 cap 으로 핵심 정보 유지 (앞 1000 + 뒤 500 = 1500자)
        const TRANSCRIPT_HEAD_MAX = 1000;
        const TRANSCRIPT_TAIL_MAX = 500;
        const chunkDigest = chunks.map((c, i) => {
            const full = c.transcript || "";
            let t;
            if (full.length <= TRANSCRIPT_HEAD_MAX + TRANSCRIPT_TAIL_MAX) {
                t = full;
            } else {
                t = full.slice(0, TRANSCRIPT_HEAD_MAX) + "\n... [중간 생략] ...\n" + full.slice(-TRANSCRIPT_TAIL_MAX);
            }
            return `[청크 ${i}] (${Math.round(c.startSec)}~${Math.round(c.endSec)}초, 슬라이드 ${c.startSlideIndex}~${c.endSlideIndex})\n${t}`;
        }).join("\n\n");

        const prompt = `당신은 발표를 들은 대학교 학부생 청중입니다. 발표 transcript 가 청크 단위로 정리되어 있습니다.
가장 질문할 만한 ${totalQuestions}개의 청크를 골라 각각에 대해 학부생이 던질 만한 질문을 생성하세요.

[발표 청크들]
${chunkDigest}

[지침]
1. 가능하면 시간 분포가 고르게 (앞·중간·뒤). 단 모든 청크가 비슷한 가치라면 다양한 주제 위주.
2. 질문은 한 문장 ~ 두 문장. 명확하고 짧게.
3. ★ 청중 톤 — 반드시 "대학교 학부생" 수준:
   - 화자: 전공자 또는 인접 분야 학부생. 진지하지만 격식적이지 않음.
   - 어조: 정중한 의문형. "~인지 궁금합니다", "~는 어떻게 적용되나요?", "~의 근거는 무엇인가요?", "혹시 ~한 사례도 있나요?"
   - 어휘: 전공 용어 OK. 학술 단어 한두 개 섞여도 자연스러움 (프레임워크, 패러다임, 메커니즘, 트레이드오프 등).
   - 동기: 발표 내용을 더 깊이 이해하거나, 약점/대안/적용 한계를 확인하려는 학생적 호기심.
   - ★ 금지: 어린아이/유치원생 톤 ("그래서요?", "이게 뭐예요?", "왜요?"), 너무 전문가 톤 (논문 reviewer 어투), 단순 칭찬/감탄.
4. 발표 내용에 직접 근거한 질문. 발표에서 다룬 내용/주장/예시에 대해서만 질문.

5. ★★ 절대 금지 — 발표에서 다루지 않은 외부 지식/일반 상식/추측 기반 질문:
   - 발표가 "딥러닝 기초"인데 transformer 질문 (안 나왔으면) X
   - 발표가 짧거나 빈약하면, 새 주제 끌어오지 말고 "이 부분을 좀 더 구체적으로 설명해주실 수 있나요?" 식의 명확화 질문으로만.
   - 발표자가 언급한 단어/개념만 다시 활용해서 질문 구성.

6. ★★ ${totalQuestions}개 질문 type 분배 (청중에 비판적·날카로움 ${criticalAudienceCount}명 → critical 질문 ${criticalCount}개):
${
    criticalCount === 0
        ? `   - 1개: type="clarification" — 개념·정의 명확화 ("X 라고 하셨는데 정확히 어떤 의미인가요?", "Y 와 Z 의 차이는?")
   - 1개: type="evidence" — 근거·자료·사례 요청 ("X 라는 주장의 근거는 무엇인가요?", "구체 사례가 있나요?")
   - 1개: type="application" — 한계·확장·적용 ("X 가 다른 상황에서도 적용되나요?", "예외 케이스는?")
   (청중이 우호적·평범한 편 → 두루뭉술하지 않게 구체적으로, 다만 직설적 비판은 피함)`
        : criticalCount === 1
        ? `   - 1개: type="clarification" — 개념·정의 명확화
   - 1개: type="evidence" 또는 type="application" 중 택1 (발표 내용에 맞는 쪽)
   - 1개: type="critical" — ★ 발표의 허점/논리 약한 부분/보완할 점을 직접 지적
     · "X 주장의 근거가 약해 보이는데, 추가 데이터가 있나요?"
     · "Y 부분에서 A 측면도 함께 고려해야 할 것 같은데 어떻게 생각하시나요?"
     · "Z 라고 하셨는데 반대 입장 가능성은 검토하셨나요?"
     · 발표에서 빠진 부분, 검증 안 된 가정, 균형 없는 주장 등을 짚어줌
     · 학구적 비판 톤 유지 (인신공격/무례 X)`
        : `   - 1개: type="clarification" 또는 type="evidence" 중 택1
   - 2개: type="critical" — ★ 발표의 허점/논리 약한 부분/보완할 점을 직접 지적
     · 두 critical 질문은 서로 다른 청크/주제에 대해 (같은 표현 반복 X)
     · "X 주장의 근거가 약해 보이는데..." / "Y 부분에서 A 도 고려해야 할 것 같은데..."
     · "Z 의 한계가 명확한데 이를 어떻게 보완할 수 있을지 궁금합니다."
     · 발표에서 빠진 부분, 검증 안 된 가정, 균형 없는 주장 등을 짚어줌
     · 학구적 비판 톤 유지 (인신공격/무례 X). 청중이 날카로운 편이라 직설적 OK`
}
   동일 표현/의도 반복 금지. 모든 질문은 두루뭉술하지 않고 발표 안의 구체적 단어/주장을 인용해서 작성.

7. 한국어로.

[출력 — 순수 JSON 만, 다른 텍스트 없이]
{
  "questions": [
    { "chunkIndex": 0, "type": "${criticalCount === 2 ? "critical" : "clarification"}", "question": "질문 내용" },
    { "chunkIndex": 3, "type": "${criticalCount >= 1 ? "critical" : "evidence"}",      "question": "질문 내용" },
    { "chunkIndex": 6, "type": "${criticalCount === 0 ? "application" : "clarification"}",   "question": "질문 내용" }
  ]
}`;

        let rawQuestions = [];

        if (useTranscriptFallback) {
            // ★ Gemini 호출 자체 우회
            rawQuestions = buildFallbackQuestions(totalQuestions);
        } else {
            // 정상 흐름: Gemini 호출
            try {
                const message = new HumanMessage({ content: [{ type: "text", text: prompt }] });
                const response = await model.invoke([message]);
                const rawText = typeof response.content === "string" ? response.content : (response.content[0]?.text ?? "");
                const json = extractJSON(rawText).trim();
                console.log(`[qa-generate] Gemini 원시 응답 (앞 400자): ${json.slice(0, 400)}`);

                try {
                    const parsed = JSON.parse(json);
                    rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
                } catch (e) {
                    console.error(`[qa-generate] JSON 파싱 실패 → fallback 질문 사용: ${e.message}`);
                    // ★ 파싱 실패해도 죽지 않고 fallback 질문으로 진행 (Q&A 흐름 보존)
                }
            } catch (geminiErr) {
                console.error(`[qa-generate] Gemini 호출 실패 → fallback 질문 사용: ${geminiErr.message}`);
            }
        }

        if (rawQuestions.length === 0) {
            console.warn(`[qa-generate] 질문 0개 → fallback 질문 사용`);
            rawQuestions = buildFallbackQuestions(totalQuestions);
        }

        // 캐릭터 선택 — 매번 다른 인덱스 (genderMap 길이 안에서)
        // ★ 첫 질문(i=0)은 firstStudentHint 가 있으면 그 인덱스로 강제 (Unity 가 미리 표시한 캐릭터와 일치시키기 위해)
        const characterCount = Math.max(1, genderMap.length || 8);
        const usedChars = new Set();
        const pickChar = (i) => {
            // 첫 질문: hint 가 유효하면 그걸 우선 (단, 성별이 male/female 인 경우만)
            if (i === 0 && Number.isInteger(firstStudentHint) && firstStudentHint >= 0 && firstStudentHint < characterCount) {
                const hintGender = (genderMap[firstStudentHint] || "").toLowerCase();
                if (hintGender === "male" || hintGender === "female") {
                    if (!usedChars.has(firstStudentHint)) {
                        usedChars.add(firstStudentHint);
                        console.log(`[qa-generate] 첫 질문 hint 적용: idx=${firstStudentHint} (${hintGender})`);
                        return firstStudentHint;
                    }
                }
            }
            // 나머지: 기존 라운드로빈 + offset 3
            for (let attempt = 0; attempt < characterCount; attempt++) {
                const idx = (i + attempt * 3) % characterCount;
                if (!usedChars.has(idx)) {
                    usedChars.add(idx);
                    return idx;
                }
            }
            return i % characterCount;
        };

        // 각 질문에 대해 캐릭터 할당 + TTS 생성 (병렬)
        // ★ 성별-음성 매칭 보장: genderMap[targetIdx] 가 "male"/"female" 이어야 함.
        //   "neutral" / 빈 값 / undefined 면 그 인덱스는 스킵하고 다음 후보로 (캐릭터 ID 가 b/g prefix 인 한 정확함)
        const ttsTasks = rawQuestions.slice(0, totalQuestions).map(async (q, i) => {
            // pickChar 가 반환한 인덱스의 gender 가 유효하지 않으면 유효한 인덱스를 찾을 때까지 추가 시도
            let targetIdx = pickChar(i);
            let gender = (genderMap[targetIdx] || "").toLowerCase();
            let attempts = 0;
            while ((gender !== "male" && gender !== "female") && attempts < characterCount) {
                console.warn(`[qa-generate] targetIdx=${targetIdx} 성별 미정의(${gender || "empty"}) → 재선택`);
                targetIdx = pickChar(i + attempts + 1); // 다음 후보
                gender = (genderMap[targetIdx] || "").toLowerCase();
                attempts++;
            }
            // 그래도 못 찾으면 최후의 fallback (그래도 male/female 확정 — neutral 절대 안 보냄)
            if (gender !== "male" && gender !== "female") {
                gender = targetIdx % 2 === 0 ? "female" : "male";
                console.warn(`[qa-generate] genderMap 전체 비정상 — fallback gender=${gender} (idx=${targetIdx})`);
            }

            const questionText = q.question || "";
            const qType = q.type || "?";
            const audio = await ttsToBase64(questionText, targetIdx, gender, ttsApiKey);
            console.log(`[qa-generate] Q${i + 1} [${qType}] → studentIdx=${targetIdx} (${gender}): "${questionText.slice(0, 50)}..."`);
            return {
                questionText,
                audioBase64: audio,
                targetStudentIndex: targetIdx,
                chunkIndex: typeof q.chunkIndex === "number" ? q.chunkIndex : -1,
            };
        });

        const questions = await Promise.all(ttsTasks);
        console.log(`[qa-generate] 완료 — ${questions.length}개 질문 생성, 캐릭터 ${[...usedChars].join(",")}`);

        return Response.json({ questions });

    } catch (error) {
        console.error("[qa-generate] 오류:", error);
        return Response.json(
            { error: "Q&A 질문 생성 중 오류: " + error.message },
            { status: 500 }
        );
    }
}
