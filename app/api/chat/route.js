import { GoogleGenerativeAI } from "@google/generative-ai";
import { FEEDBACK_CATEGORIES } from "../../lib/feedbackAreas";

export async function POST(request) {
    try {
        const body = await request.json();
        const { message, chatHistory = [], analysisContext = {} } = body;

        if (!message) {
            return Response.json({ error: "메시지가 필요합니다." }, { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return Response.json({ error: "GEMINI_API_KEY가 설정되지 않았습니다." }, { status: 500 });
        }

        const genAI = new GoogleGenerativeAI(apiKey.trim());
        const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash" });

        // 분석 결과 컨텍스트 구성
        const { summary = {}, timestamps = [] } = analysisContext;
        const contextInfo = `
## 발표 분석 결과 요약
- 종합 피드백: ${summary.overall || "없음"}
- 강점: ${(summary.strengths || []).join(", ") || "없음"}
- 개선 제안: ${(summary.suggestions || []).join(", ") || "없음"}
- 타임스탬프 피드백 수: ${timestamps.length}개
`;
        const feedbackAreaInfo = FEEDBACK_CATEGORIES
            .map((category) => `- ${category.label} (${category.items.map((item) => item.label).join(", ")})`)
            .join("\n");

        // 시스템 프롬프트
        const systemPrompt = `당신은 발표(프레젠테이션) 성찰을 돕는 전문 AI 멘토입니다.
사용자의 발표 영상 분석 결과를 바탕으로 건설적이고 따뜻한 대화를 나눕니다.

역할:
1. 사용자가 자신의 발표를 깊이 성찰할 수 있도록 개방형 질문을 활용하세요.
2. 분석 결과의 강점을 인정하고 격려하면서, 개선점에 대해서는 구체적인 실천 방안을 함께 고민해주세요.
3. 이론적 지식보다는 다음 발표에 바로 적용할 수 있는 실천 팁을 제공하세요.
4. 사용자의 성장 가능성을 믿고 긍정적인 태도를 유지하세요.

피드백이 다루는 3대 영역:
${feedbackAreaInfo}

대화 스타일:
- 친근하고 공감적인 톤 (존댓말 사용)
- 간결하고 명확한 응답 (2-4문장 권장)
- 이모지를 적절히 활용 (과하지 않게)
- 후속 질문으로 대화를 이어가기

조언 시 유의사항:
- 분석 결과에서 관찰된 구체적인 장면/행동을 인용해 피드백하세요.
- 다음 발표에서 즉시 적용할 수 있는 구체적인 행동 지침을 제공하세요.
- 막연한 격려보다 실질적 개선 방법 중심으로 답하세요.

${contextInfo}

위 분석 결과를 참고하여 사용자와 발표 성찰 대화를 나누세요.`;

        // 채팅 히스토리 구성
        const contents = [];

        // 이전 대화 히스토리 추가 (첫 메시지가 user여야 함)
        let foundFirstUser = false;
        for (const msg of chatHistory) {
            const role = msg.role === "assistant" ? "model" : "user";

            // 첫 번째 user 메시지를 찾을 때까지 model 메시지는 건너뜀
            if (!foundFirstUser && role === "model") {
                continue;
            }
            foundFirstUser = true;

            contents.push({
                role: role,
                parts: [{ text: msg.content }]
            });
        }

        // 채팅 시작 (히스토리가 비어있으면 빈 배열로)
        const chat = model.startChat({
            history: contents,
            systemInstruction: {
                role: "user",
                parts: [{ text: systemPrompt }]
            },
        });

        // 응답 생성
        const result = await chat.sendMessage(message);
        const responseText = result.response.text();

        return Response.json({
            response: responseText,
            success: true
        });

    } catch (error) {
        console.error("[Chat API] 오류:", error);
        return Response.json(
            { error: "응답 생성 중 오류가 발생했습니다: " + error.message },
            { status: 500 }
        );
    }
}
