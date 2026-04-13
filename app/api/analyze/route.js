import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { del } from '@vercel/blob';
import { FEEDBACK_CATEGORIES, FEEDBACK_ITEMS_BY_ID, ALL_ITEM_IDS } from "../../lib/feedbackAreas";

// Pro 플랜: 60초 실행 시간
export const maxDuration = 60;

export async function POST(request) {
    let blobUrl = null;

    try {
        console.log("[분석 API] 요청 시작");

        const body = await request.json();
        const {
            blobUrl: videoUrl,
            fileName,
            mimeType,
            topic = "",
            audience = "",
            duration = "",
            feedbackItems = [],
            materialUrl = null,
            conditions = [],
        } = body;

        blobUrl = videoUrl;

        if (!blobUrl) {
            return Response.json({ error: "비디오 URL이 필요합니다." }, { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return Response.json({ error: "GEMINI_API_KEY가 설정되지 않았습니다." }, { status: 500 });
        }
        const cleanApiKey = apiKey.trim();

        // Blob에서 비디오 다운로드
        const videoResponse = await fetch(blobUrl);
        if (!videoResponse.ok) {
            throw new Error("Blob에서 비디오를 가져오지 못했습니다.");
        }
        const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

        const fileManager = new GoogleAIFileManager(cleanApiKey);

        const fs = await import("fs");
        const path = await import("path");
        const os = await import("os");

        const tempDir = os.tmpdir();
        const tempFilePath = path.join(tempDir, `upload_${Date.now()}_${fileName}`);
        fs.writeFileSync(tempFilePath, videoBuffer);

        let uploadResult;
        try {
            uploadResult = await fileManager.uploadFile(tempFilePath, {
                mimeType: mimeType || "video/mp4",
                displayName: fileName,
            });
        } catch (uploadError) {
            fs.unlinkSync(tempFilePath);
            throw new Error("Gemini 업로드 실패: " + uploadError.message);
        }
        fs.unlinkSync(tempFilePath);

        // 파일 처리 대기
        let file = await fileManager.getFile(uploadResult.file.name);
        let waitCount = 0;
        while (file.state === "PROCESSING" && waitCount < 10) {
            await new Promise((r) => setTimeout(r, 3000));
            file = await fileManager.getFile(uploadResult.file.name);
            waitCount++;
        }
        if (file.state === "FAILED") throw new Error("영상 처리에 실패했습니다.");
        if (file.state === "PROCESSING") throw new Error("영상 처리 시간이 초과되었습니다. 더 짧은 영상을 시도해주세요.");

        // 발표 자료 PDF 처리
        let materialFile = null;
        let materialTempPath = null;
        if (materialUrl) {
            try {
                const mRes = await fetch(materialUrl);
                if (mRes.ok) {
                    const mBuffer = Buffer.from(await mRes.arrayBuffer());
                    const mFileName = materialUrl.split('/').pop() || 'presentation_material.pdf';
                    materialTempPath = path.join(tempDir, `mat_${Date.now()}_${mFileName}`);
                    fs.writeFileSync(materialTempPath, mBuffer);

                    const mUpload = await fileManager.uploadFile(materialTempPath, {
                        mimeType: 'application/pdf',
                        displayName: mFileName,
                    });

                    materialFile = await fileManager.getFile(mUpload.file.name);
                    let mWait = 0;
                    while (materialFile.state === "PROCESSING" && mWait < 5) {
                        await new Promise((r) => setTimeout(r, 2000));
                        materialFile = await fileManager.getFile(mUpload.file.name);
                        mWait++;
                    }
                    if (materialFile.state !== "ACTIVE") materialFile = null;
                    fs.unlinkSync(materialTempPath);
                }
            } catch (e) {
                console.warn("[분석 API] 발표 자료 처리 오류:", e.message);
                if (materialTempPath && fs.existsSync(materialTempPath)) fs.unlinkSync(materialTempPath);
            }
        }

        const genAI = new GoogleGenerativeAI(cleanApiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // 선택된 항목 정리 (비어있으면 전체 사용)
        const activeItemIds = feedbackItems.length > 0
            ? feedbackItems.filter((id) => FEEDBACK_ITEMS_BY_ID[id])
            : ALL_ITEM_IDS;

        // 카테고리 구조로 다시 그룹화
        const selectedByCategory = FEEDBACK_CATEGORIES.map((cat) => ({
            ...cat,
            items: cat.items.filter((it) => activeItemIds.includes(it.id)),
        })).filter((cat) => cat.items.length > 0);

        const rubricText = selectedByCategory
            .map((cat) => {
                const itemLines = cat.items
                    .map((it) => `   - ${it.label}: ${it.desc}`)
                    .join("\n");
                return `■ ${cat.label} (${cat.shortLabel})\n${itemLines}`;
            })
            .join("\n\n");

        const categoryLabelsJoined = selectedByCategory.map((c) => c.label).join(" / ");
        const itemLabelsJoined = activeItemIds
            .map((id) => FEEDBACK_ITEMS_BY_ID[id].label)
            .join(", ");

        const materialSection = materialFile ? `

추가 분석 - 발표 자료-발표 정합성:
함께 제공된 발표 자료(PDF)를 참고하여, 자료와 실제 발표 내용의 정합성을 분석해주세요.
응답 JSON에 "materialAnalysis" 필드를 포함하세요:
"materialAnalysis": {
  "overallConsistency": "높음/보통/낮음 중 하나",
  "summary": "발표 자료와 실제 발표의 정합성에 대한 2-3문장 평가",
  "matches": ["자료와 일치한 부분 1", "부분 2"],
  "deviations": ["자료와 달랐던 부분 1 (없으면 빈 배열)"],
  "suggestions": ["자료 활용 개선 제안 1", "제안 2"]
}` : '';

        const conditionsSection = conditions.length > 0 ? `

추가 분석 - 조건 충족 여부:
다음 조건들이 발표 영상에서 충족되었는지 판단해주세요.
${conditions.map((c, i) => `${i + 1}. ${c}`).join('\n')}

응답 JSON에 "conditionsAnalysis" 필드를 추가하세요:
"conditionsAnalysis": [
  { "condition": "조건 내용", "fulfilled": true/false, "evidence": "근거", "timestamp": "MM:SS 또는 null" }
]` : '';

        const prompt = `당신은 발표(프레젠테이션) 분석 전문가입니다. 다음 발표 영상을 분석하고 구체적이고 건설적인 피드백을 제공해주세요.
점수 평가가 아닌, 관찰 기반의 구체적 피드백에 집중해주세요.

발표 정보:
- 주제: ${topic || "미지정"}
- 청중: ${audience || "미지정"}
- 발표 시간: ${duration || "미지정"}

평가 루브릭 (선택된 카테고리/항목만 평가):
${rubricText}

다음 JSON 형식으로만 응답해주세요 (다른 텍스트 없이, 순수 JSON):

{
  "timestamps": [
    {
      "time": "MM:SS",
      "seconds": 초단위숫자,
      "category": "관련 카테고리 (${selectedByCategory.map((c) => c.label).join(" / ")} 중 하나를 정확히 사용)",
      "item": "관련 세부 항목 (${itemLabelsJoined} 중 하나를 정확히 사용)",
      "feedback": "해당 시점에서 관찰된 구체적인 내용과 피드백"
    }
  ],
  "summary": {
    "overall": "전체 발표에 대한 종합 피드백 (3-4문장)",
    "strengths": ["강점 1", "강점 2", "강점 3"],
    "suggestions": ["개선 제안 1", "개선 제안 2", "개선 제안 3"]
  }
}

분석 시 주의사항:
1. timestamps는 영상 전체에서 10-15개 주요 시점을 고르게 선정하세요.
2. seconds 필드는 해당 시점의 초 단위 숫자입니다 (예: "02:30"은 150).
3. ⚠️ 매우 중요: 선택된 모든 세부 항목(${itemLabelsJoined})마다 최소 1개 이상의 타임스탬프 피드백을 포함해야 합니다. 어떤 항목도 빠뜨리지 마세요.
4. category와 item 값은 반드시 위에 명시된 문자열을 그대로 사용하세요 (철자·공백 일치).
5. 피드백은 구체적이고 건설적으로 작성하세요. "잘했습니다" 같은 모호한 표현은 피하세요.
6. 강점과 개선점을 균형있게 제시하세요.
7. 한국어로 응답하세요.${materialSection}${conditionsSection}`;

        const contentParts = [
            { fileData: { mimeType: file.mimeType, fileUri: file.uri } },
        ];
        if (materialFile) {
            contentParts.push({ fileData: { mimeType: materialFile.mimeType, fileUri: materialFile.uri } });
        }
        contentParts.push({ text: prompt });

        const result = await model.generateContent(contentParts);
        const responseText = result.response.text();

        let analysisResult;
        try {
            const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
                responseText.match(/```\s*([\s\S]*?)\s*```/);
            const jsonString = jsonMatch ? jsonMatch[1] : responseText;
            analysisResult = JSON.parse(jsonString.trim());
        } catch (parseError) {
            console.error("[분석 API] JSON 파싱 오류:", parseError);
            analysisResult = {
                timestamps: [],
                summary: {
                    overall: "분석 결과 파싱에 문제가 발생했습니다. 다시 시도해주세요.",
                    strengths: [],
                    suggestions: [],
                },
            };
        }

        // 파일 정리
        try { await fileManager.deleteFile(file.name); } catch (e) {}
        if (materialFile) {
            try { await fileManager.deleteFile(materialFile.name); } catch (e) {}
        }
        try { await del(blobUrl); } catch (e) {}

        return Response.json(analysisResult);

    } catch (error) {
        console.error("[분석 API] 오류:", error);
        if (blobUrl) {
            try { await del(blobUrl); } catch (e) {}
        }
        return Response.json(
            { error: "영상 분석 중 오류가 발생했습니다: " + error.message },
            { status: 500 }
        );
    }
}
