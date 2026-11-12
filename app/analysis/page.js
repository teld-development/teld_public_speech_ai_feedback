"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/AuthProvider";
import {
    FEEDBACK_CATEGORIES,
    ALL_ITEM_IDS,
    LEGACY_ITEM_ID_TO_CURRENT_ID,
    LEGACY_ITEM_LABELS,
    normalizeFeedbackItemIds,
} from "../lib/feedbackAreas";
import PresentationDataVisuals from "../components/PresentationDataVisuals";
import { engineErrorMessage, engineUrl } from "../lib/engineApi";

const PDFJS_VERSION = "4.10.38";

function FeedbackCategoryIcon({ categoryId }) {
    if (categoryId === "content") {
        return (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11a3 3 0 0 1 3 3v15a3 3 0 0 0-3-3H6.5A2.5 2.5 0 0 0 4 20.5z" />
                <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H14v18a3 3 0 0 1 3-3h.5a2.5 2.5 0 0 1 2.5 2.5z" />
            </svg>
        );
    }
    if (categoryId === "organization") {
        return (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6" cy="5" r="2" />
                <circle cx="18" cy="12" r="2" />
                <circle cx="6" cy="19" r="2" />
                <path d="M8 5h3a3 3 0 0 1 3 3v1a3 3 0 0 0 3 3" />
                <path d="M8 19h3a3 3 0 0 0 3-3v-1a3 3 0 0 1 3-3" />
            </svg>
        );
    }
    if (categoryId === "expression") {
        return (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="3" width="6" height="12" rx="3" />
                <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
                <path d="M12 18v3M9 21h6" />
            </svg>
        );
    }
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
    );
}

function FeedbackItemIcon({ itemId }) {
    let icon;
    switch (itemId) {
        case "topic_relevance":
            icon = <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>;
            break;
        case "presentation_content":
            icon = <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 12h6M9 16h4" /></>;
            break;
        case "examples_appropriateness":
            icon = <><path d="M5 7h5v6H6l-2 3V8a1 1 0 0 1 1-1z" /><path d="M14 7h5a1 1 0 0 1 1 1v5h-4l-2 3z" /></>;
            break;
        case "presentation_structure":
            icon = <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11" /></>;
            break;
        case "paragraph_connection":
            icon = <><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" /></>;
            break;
        case "explanation_method":
            icon = <><circle cx="5" cy="12" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="19" cy="18" r="2" /><path d="M7 12h3a4 4 0 0 0 4-4 2 2 0 0 1 2-2h1M7 12h3a4 4 0 0 1 4 4 2 2 0 0 0 2 2h1" /></>;
            break;
        case "vocabulary_selection":
            icon = <><path d="m4 19 5-14 5 14M6 14h6" /><path d="M16 8h4M18 6v12" /></>;
            break;
        case "paralinguistic_expression":
            icon = <path d="M3 12h2l2-5 3 10 3-12 3 14 2-7h3" />;
            break;
        case "presentation_fluency":
            icon = <><path d="M4 8h10a3 3 0 1 0-3-3" /><path d="M4 12h14a3 3 0 1 1-3 3" /><path d="M4 16h6" /></>;
            break;
        case "nonverbal_expression":
            icon = <><circle cx="12" cy="12" r="9" /><path d="M8 10h.01M16 10h.01M8 15c1 1.3 2.3 2 4 2s3-.7 4-2" /></>;
            break;
        case "eye_contact":
            icon = <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="2.5" /></>;
            break;
        case "presentation_materials":
            icon = <><rect x="3" y="3" width="18" height="14" rx="2" /><path d="M8 21h8M12 17v4M7 13l3-3 2 2 4-5 2 2" /></>;
            break;
        default:
            icon = <><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></>;
    }

    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {icon}
        </svg>
    );
}

const SUMMARY_FEEDBACK_TAG_ALIASES = [
    ...FEEDBACK_CATEGORIES.flatMap((category) => category.items.map((item) => ({
        alias: item.label,
        itemId: item.id,
        label: item.label,
        categoryId: category.id,
    }))),
    ...Object.entries(LEGACY_ITEM_LABELS).map(([legacyId, alias]) => {
        const itemId = LEGACY_ITEM_ID_TO_CURRENT_ID[legacyId];
        const category = FEEDBACK_CATEGORIES.find((candidate) => candidate.items.some((item) => item.id === itemId));
        const item = category?.items.find((candidate) => candidate.id === itemId);
        return {
            alias,
            itemId,
            label: item?.label || alias,
            categoryId: category?.id || "all",
        };
    }),
    {
        alias: "발음/말하기 유창성",
        itemId: "presentation_fluency",
        label: "발표의 유창성",
        categoryId: "expression",
    },
];

function parseSummaryFeedbackItem(value) {
    const text = String(value || "").trim();
    const separatorIndex = text.indexOf(":");
    const heading = separatorIndex >= 0 ? text.slice(0, separatorIndex).trim() : "";
    const tags = [];
    const seenItemIds = new Set();

    if (heading) {
        SUMMARY_FEEDBACK_TAG_ALIASES.forEach((candidate) => {
            if (!candidate.itemId || seenItemIds.has(candidate.itemId) || !heading.includes(candidate.alias)) return;
            seenItemIds.add(candidate.itemId);
            tags.push(candidate);
        });
    }

    if (tags.length === 0 && heading && heading.length <= 40) {
        tags.push({ alias: heading, itemId: null, label: heading, categoryId: "all" });
    }

    return {
        text: tags.length > 0 && separatorIndex >= 0 ? text.slice(separatorIndex + 1).trim() : text,
        tags,
    };
}

function SummaryFeedbackItem({ item }) {
    const { text, tags } = parseSummaryFeedbackItem(item);

    return (
        <li>
            {tags.length > 0 && (
                <div className="summary-feedback-tags">
                    {tags.map((tag) => (
                        <span key={tag.itemId || tag.label} className={`summary-feedback-tag category-${tag.categoryId}`}>
                            {tag.itemId && <FeedbackItemIcon itemId={tag.itemId} />}
                            {tag.label}
                        </span>
                    ))}
                </div>
            )}
            <p>{text}</p>
        </li>
    );
}

function parseQaFeedbackText(value) {
    const text = String(value || "").trim();
    if (!text) return { strength: "", improvement: "", overall: "" };

    const strength = text.match(/잘한\s*점\s*:\s*([\s\S]*?)(?=\s*개선점\s*:|$)/)?.[1]?.trim() || "";
    const improvement = text.match(/개선점\s*:\s*([\s\S]*)$/)?.[1]?.trim() || "";

    return {
        strength,
        improvement,
        overall: strength || improvement ? "" : text,
    };
}

function QaFeedbackIcon({ type }) {
    if (type === "strength") {
        return (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m7 12 3 3 7-7" />
                <circle cx="12" cy="12" r="9" />
            </svg>
        );
    }
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 16.5 9 11l3 3 7-8" />
            <path d="M15 6h4v4" />
        </svg>
    );
}

function QaFeedbackPreview({ feedback, onOpen }) {
    const { strength, improvement, overall } = parseQaFeedbackText(feedback);
    const sections = [
        strength && { type: "strength", label: "잘한 점", text: strength },
        improvement && { type: "improvement", label: "개선점", text: improvement },
        overall && { type: "overall", label: "피드백", text: overall },
    ].filter(Boolean);

    return (
        <div className="qa-feedback-preview">
            {sections.map((section) => (
                <div key={section.type} className={`qa-feedback-preview-item ${section.type}`}>
                    <span className="qa-feedback-preview-icon">
                        <QaFeedbackIcon type={section.type} />
                    </span>
                    <div className="qa-feedback-preview-copy">
                        <strong>{section.label}</strong>
                        <p>{section.text}</p>
                    </div>
                </div>
            ))}
            <button type="button" className="qa-feedback-detail-button" onClick={onOpen}>
                피드백 자세히 보기
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m9 18 6-6-6-6" />
                </svg>
            </button>
        </div>
    );
}

function QaFeedbackDetail({ feedback }) {
    const { strength, improvement, overall } = parseQaFeedbackText(feedback);

    if (overall) {
        return (
            <section className="qa-feedback-detail-section overall">
                <div className="qa-feedback-detail-heading">
                    <span className="qa-feedback-preview-icon"><QaFeedbackIcon type="overall" /></span>
                    <h3>AI 피드백</h3>
                </div>
                <p>{overall}</p>
            </section>
        );
    }

    return (
        <div className="qa-feedback-detail-sections">
            {strength && (
                <section className="qa-feedback-detail-section strength">
                    <div className="qa-feedback-detail-heading">
                        <span className="qa-feedback-preview-icon"><QaFeedbackIcon type="strength" /></span>
                        <h3>잘한 점</h3>
                    </div>
                    <p>{strength}</p>
                </section>
            )}
            {improvement && (
                <section className="qa-feedback-detail-section improvement">
                    <div className="qa-feedback-detail-heading">
                        <span className="qa-feedback-preview-icon"><QaFeedbackIcon type="improvement" /></span>
                        <h3>개선점</h3>
                    </div>
                    <p>{improvement}</p>
                </section>
            )}
        </div>
    );
}

async function loadPdfJs() {
    const pdfjsLib = await import(/* webpackIgnore: true */ `/pdf.min.mjs?v=${PDFJS_VERSION}`);
    pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${PDFJS_VERSION}`;
    return pdfjsLib;
}

const REFLECTION_STEPS = [
    {
        id: "keep",
        label: "우수점",
        title: "이번 발표에서 우수했던 점",
        desc: "효과적이었던 표현, 구성, 태도, 자료 활용을 적어두세요.",
        placeholder: "예: 도입에서 발표 목적을 먼저 말해서 흐름이 분명했다.",
    },
    {
        id: "improve",
        label: "개선점",
        title: "다음 회차에서 조정할 점",
        desc: "분석 결과를 보고 가장 먼저 고치고 싶은 한두 가지를 정리하세요.",
        placeholder: "예: 결론에서 핵심 문장을 더 짧고 분명하게 말해야겠다.",
    },
];

const EMPTY_REFLECTION_FIELDS = REFLECTION_STEPS.reduce((acc, step) => {
    acc[step.id] = "";
    return acc;
}, {});

function buildReflectionNote(fields = EMPTY_REFLECTION_FIELDS) {
    return REFLECTION_STEPS
        .map((step) => {
            const value = String(fields[step.id] || "").trim();
            return value ? `[${step.label}]\n${value}` : "";
        })
        .filter(Boolean)
        .join("\n\n");
}

function normalizeReflectionFields(context = {}) {
    if (context.reflectionFields && typeof context.reflectionFields === "object") {
        return {
            keep: context.reflectionFields.keep || "",
            improve: context.reflectionFields.improve || "",
        };
    }
    return {
        ...EMPTY_REFLECTION_FIELDS,
        keep: context.reflectionNote || "",
    };
}

function parseExpectedDurationSeconds(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const text = String(value || "").trim();
    if (!text) return null;

    if (text.includes(":")) {
        const parts = text.split(":").map((part) => Number(part.trim()));
        if (parts.length === 2 && parts.every(Number.isFinite)) {
            return parts[0] * 60 + parts[1];
        }
        if (parts.length === 3 && parts.every(Number.isFinite)) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
    }

    const unitPattern = /(\d+(?:\.\d+)?)\s*(시간|hours?|hrs?|h|분|minutes?|mins?|m|초|seconds?|secs?|s)/gi;
    const matches = [...text.matchAll(unitPattern)];
    if (matches.length > 0) {
        return matches.reduce((total, match) => {
            const amount = Number(match[1]);
            const unit = match[2].toLowerCase();
            if (!Number.isFinite(amount)) return total;
            if (/^(시간|hours?|hrs?|h)$/.test(unit)) return total + amount * 3600;
            if (/^(분|minutes?|mins?|m)$/.test(unit)) return total + amount * 60;
            return total + amount;
        }, 0);
    }

    const numeric = Number(text.replace(/[^\d.]/g, ""));
    return Number.isFinite(numeric) && numeric > 0 ? numeric * 60 : null;
}

function parseTimeToSeconds(timeStr) {
    if (!timeStr) return 0;
    const parts = String(timeStr).split(":").map((part) => Number(part));
    if (parts.length === 2 && parts.every(Number.isFinite)) return parts[0] * 60 + parts[1];
    if (parts.length === 3 && parts.every(Number.isFinite)) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
}

function parseTimelineTimeToSeconds(value) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
    const text = String(value || "").trim();
    if (!text) return null;
    const parts = text.split(":").map((part) => Number(part.trim()));
    if (parts.length === 2 && parts.every(Number.isFinite)) return Math.max(0, parts[0] * 60 + parts[1]);
    if (parts.length === 3 && parts.every(Number.isFinite)) return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
    return null;
}

function parseSlideTimeline(value) {
    let timeline = value;
    if (typeof timeline === "string") {
        const trimmed = timeline.trim();
        if (!trimmed) return [];
        try {
            timeline = JSON.parse(trimmed);
        } catch (err) {
            console.warn("[Analysis] slideTimeline JSON 파싱 실패:", err);
            return [];
        }
    }

    const rawSlides = Array.isArray(timeline?.slides)
        ? timeline.slides
        : Array.isArray(timeline)
            ? timeline
            : [];

    return rawSlides
        .map((slide) => {
            const seconds = parseTimelineTimeToSeconds(slide?.t ?? slide?.timeFormatted);
            const page = Number.parseInt(slide?.page, 10);
            if (seconds == null || !Number.isFinite(page) || page < 1) return null;
            return {
                t: seconds,
                timeFormatted: String(slide?.timeFormatted || "").trim(),
                page,
                content: String(slide?.content || "").trim(),
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.t - b.t);
}

function buildSlideDeckFromSimulation(simulation = {}) {
    const nested = simulation?.simulation && typeof simulation.simulation === "object"
        ? simulation.simulation
        : {};
    const slideImageCandidates = [
        nested.slideImageUrls,
        simulation?.slideImageUrls,
        simulation?.slideImages,
    ];
    const slideImageUrls = slideImageCandidates.find((candidate) =>
        Array.isArray(candidate) && candidate.some((url) => typeof url === "string" && url.trim())
    ) || [];
    const pdfUrl = nested.pdfUrl
        || simulation?.pdfUrl
        || simulation?.presentationMaterial?.url
        || "";
    return {
        slides: parseSlideTimeline(simulation?.slideTimeline ?? nested.slideTimeline),
        slideImageUrls: slideImageUrls.filter(Boolean),
        pdfUrl,
        loading: false,
        error: "",
    };
}

function parseMaybeJson(value) {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
        return JSON.parse(trimmed);
    } catch {
        return value;
    }
}

function firstText(...values) {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) return value.trim();
        if (typeof value === "number" && Number.isFinite(value)) return String(value);
    }
    return "";
}

function cleanQaTranscriptText(value) {
    return String(value || "")
        .split(/\n+/)
        .map((line) => line
            .replace(/^\s*\[\d+\s*번\]\s*/g, "")
            .replace(/^\s*\d+\s*[.)]\s*/g, "")
            .replace(/\s*속도\s*:\s*[-+]?\d+(?:\.\d+)?\s*(?:\([^)]*\))?\s*$/g, "")
            .replace(/\[(?:두근|웃음|박수|침묵|무음|소음|잡음|기침|한숨|숨소리|호흡|음악|효과음)[^\]]*\]/g, "")
            .replace(/^["“”']+|["“”']+$/g, "")
            .replace(/\s+/g, " ")
            .trim())
        .filter(Boolean)
        .join("\n");
}

function formatTranscriptValue(value) {
    const parsed = parseMaybeJson(value);
    if (!parsed) return "";
    if (typeof parsed === "string") return cleanQaTranscriptText(parsed);
    if (Array.isArray(parsed)) {
        return parsed
            .map((entry) => {
                if (typeof entry === "string") return cleanQaTranscriptText(entry);
                if (!entry || typeof entry !== "object") return "";
                const speaker = firstText(entry.speaker, entry.role, entry.name);
                const text = cleanQaTranscriptText(firstText(
                    entry.text,
                    entry.transcript,
                    entry.content,
                    entry.answer,
                    entry.answerText,
                    entry.response
                ));
                return speaker && text ? `${speaker}: ${text}` : text;
            })
            .filter(Boolean)
            .join("\n");
    }
    if (typeof parsed === "object") {
        return cleanQaTranscriptText(firstText(
            parsed.text,
            parsed.transcript,
            parsed.answerTranscript,
            parsed.answerText,
            parsed.answer,
            parsed.content,
            parsed.response
        ));
    }
    return "";
}

function formatTranscriptForReading(value) {
    return String(value || "")
        .split(/\n+/)
        .map((part) => part.trim())
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeQaItem(item = {}, index = 0, companion = {}) {
    const answerSource = item.answer && typeof item.answer === "object" ? item.answer : {};
    const feedbackSource = item.feedback && typeof item.feedback === "object" ? item.feedback : {};
    return {
        id: firstText(item.id, item.questionId, companion.id) || `qa-${index}`,
        index: index + 1,
        question: firstText(
            item.questionText,
            item.question,
            item.question_text,
            item.q,
            companion.questionText,
            companion.question
        ),
        answerTranscript: formatTranscriptValue(
            item.answerTranscript
            ?? item.answer_transcript
            ?? item.responseTranscript
            ?? item.transcriptText
            ?? item.answerText
            ?? item.response
            ?? item.answer
            ?? item.transcript
            ?? answerSource.transcript
            ?? answerSource.text
            ?? answerSource.content
            ?? companion.answerTranscript
            ?? companion.answerText
            ?? companion.answer
        ),
        aiFeedback: firstText(
            item.aiFeedback,
            item.feedbackText,
            item.feedback,
            item.evaluation,
            item.comment,
            feedbackSource.text,
            feedbackSource.summary,
            companion.aiFeedback,
            companion.feedbackText,
            companion.feedback
        ),
        type: firstText(item.type, item.questionType, companion.type),
        target: firstText(item.targetStudentIndex, item.studentIndex, item.studentId, companion.targetStudentIndex),
        chunkIndex: firstText(item.chunkIndex, companion.chunkIndex),
    };
}

function normalizeQaResults(rawQaResults) {
    const parsed = parseMaybeJson(rawQaResults);
    if (!parsed) return [];

    let rows = [];
    let answers = [];
    let feedbacks = [];

    if (Array.isArray(parsed)) {
        rows = parsed;
    } else if (typeof parsed === "object") {
        rows = parsed.items
            || parsed.results
            || parsed.qa
            || parsed.qas
            || parsed.records
            || parsed.questions
            || [];
        answers = Array.isArray(parsed.answers) ? parsed.answers : [];
        feedbacks = Array.isArray(parsed.feedbacks) ? parsed.feedbacks : [];

        if (!Array.isArray(rows)) {
            rows = [];
        }

        if (rows.length === 0) {
            rows = Object.entries(parsed)
                .filter(([key, value]) => /^q(?:uestion)?\d+$/i.test(key) || (value && typeof value === "object"))
                .map(([, value]) => value);
        }
    }

    return rows
        .slice(0, 3)
        .map((item, index) => {
            const parsedItem = parseMaybeJson(item);
            const safeItem = typeof parsedItem === "string" ? { questionText: parsedItem } : (parsedItem || {});
            const companion = {
                ...(answers[index] && typeof answers[index] === "object" ? answers[index] : { answer: answers[index] }),
                ...(feedbacks[index] && typeof feedbacks[index] === "object" ? feedbacks[index] : { feedback: feedbacks[index] }),
            };
            return normalizeQaItem(safeItem, index, companion);
        })
        .filter((item) => item.question || item.answerTranscript || item.aiFeedback);
}

function mergeSlideDecks(primary, fallback) {
    return {
        slides: primary.slides.length > 0 ? primary.slides : fallback.slides,
        slideImageUrls: primary.slideImageUrls.length > 0 ? primary.slideImageUrls : fallback.slideImageUrls,
        pdfUrl: primary.pdfUrl || fallback.pdfUrl,
        loading: false,
        error: primary.error || fallback.error || "",
    };
}

async function loadPdfDocument(pdfjsLib, sourceUrl) {
    const proxyResponse = await fetch(engineUrl(`/pdf-proxy?url=${encodeURIComponent(sourceUrl)}`), {
        cache: "force-cache",
    });

    if (proxyResponse.ok) {
        const pdfBytes = new Uint8Array(await proxyResponse.arrayBuffer());
        return pdfjsLib.getDocument({ data: pdfBytes }).promise;
    }

    let detail = "";
    try {
        const body = await proxyResponse.json();
        detail = body?.error ? `: ${body.error}` : "";
    } catch {
        detail = "";
    }

    try {
        return await pdfjsLib.getDocument({
            url: sourceUrl,
            disableAutoFetch: true,
            disableRange: true,
            disableStream: true,
        }).promise;
    } catch (directError) {
        throw new Error(
            `PDF 파일을 불러오지 못했습니다. (프록시 HTTP ${proxyResponse.status}${detail}, 직접 로딩: ${directError.message})`
        );
    }
}

async function renderPdfPageToDataUrl(pdfUrl, pageNumber) {
    const sourceUrl = String(pdfUrl || "").split("#")[0];
    const safePage = Number.parseInt(pageNumber, 10);
    if (!sourceUrl || !Number.isFinite(safePage) || safePage < 1) {
        throw new Error("PDF 페이지 정보가 올바르지 않습니다.");
    }

    const pdfjsLib = await loadPdfJs();
    const pdf = await loadPdfDocument(pdfjsLib, sourceUrl);

    try {
        const page = await pdf.getPage(Math.min(safePage, pdf.numPages));
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("PDF 페이지 렌더링 컨텍스트를 만들 수 없습니다.");
        }
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        await page.render({ canvasContext: context, viewport }).promise;
        return canvas.toDataURL("image/png");
    } finally {
        await pdf.destroy();
    }
}

export default function AnalysisPage() {
    const router = useRouter();
    const { user } = useAuth();
    const videoRef = useRef(null);
    const chatEndRef = useRef(null);
    const pdfRenderCacheRef = useRef(new Map());

    const [isLoading, setIsLoading] = useState(true);
    const [analysisData, setAnalysisData] = useState(null);
    const [videoUrl, setVideoUrl] = useState(null);
    const [videoName, setVideoName] = useState("");
    const [selectedTimestamp, setSelectedTimestamp] = useState(null);
    const [error, setError] = useState("");

    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState("");
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [selectedItemIds, setSelectedItemIds] = useState([]);
    const [feedbackCategoryFilter, setFeedbackCategoryFilter] = useState("all");
    const [feedbackFilter, setFeedbackFilter] = useState("all");
    const [expectedDurationText, setExpectedDurationText] = useState("");
    const [actualVideoSeconds, setActualVideoSeconds] = useState(null);
    const [analysisContext, setAnalysisContext] = useState(null);
    const [reflectionFields, setReflectionFields] = useState(EMPTY_REFLECTION_FIELDS);
    const [savedReflectionFields, setSavedReflectionFields] = useState(EMPTY_REFLECTION_FIELDS);
    const [reflectionOpen, setReflectionOpen] = useState(false);
    const [savingReflection, setSavingReflection] = useState(false);
    const [reflectionStatus, setReflectionStatus] = useState("");
    const [summaryModal, setSummaryModal] = useState(null);
    const [qaTranscriptModal, setQaTranscriptModal] = useState(null);
    const [qaFeedbackModal, setQaFeedbackModal] = useState(null);
    const [isSlideExpanded, setIsSlideExpanded] = useState(false);
    const [bottomTab, setBottomTab] = useState("data");
    const [videoCurrentSeconds, setVideoCurrentSeconds] = useState(0);
    const [slideDeck, setSlideDeck] = useState(() => buildSlideDeckFromSimulation());
    const [qaPanel, setQaPanel] = useState({ items: [], loading: false, error: "" });

    useEffect(() => {
        const savedResult = sessionStorage.getItem("analysisResult");
        const savedVideoUrl = sessionStorage.getItem("videoUrl");
        const savedVideoName = sessionStorage.getItem("videoName");

        if (savedResult) {
            try {
                const result = JSON.parse(savedResult);
                setAnalysisData(result);
                setVideoUrl(savedVideoUrl);
                setVideoName(savedVideoName || "업로드된 영상");

                const savedAnalysisContext = sessionStorage.getItem("analysisContext");
                if (savedAnalysisContext) {
                    const context = JSON.parse(savedAnalysisContext);
                    const fields = normalizeReflectionFields(context);
                    setAnalysisContext(context);
                    setReflectionFields(fields);
                    setSavedReflectionFields(fields);
                }

                const savedPrepareData = sessionStorage.getItem("prepareData");
                if (savedPrepareData) {
                    const prepareData = JSON.parse(savedPrepareData);
                    setSelectedItemIds(normalizeFeedbackItemIds(prepareData.feedbackItems));
                    setExpectedDurationText(prepareData.duration || "");
                }

                setTimeout(() => setIsLoading(false), 300);

                setChatMessages([{
                    role: "assistant",
                    content: "안녕하세요! 이번 발표에 대해 함께 성찰해볼까요?\n\n분석 결과를 바탕으로 궁금한 점이나 더 깊이 이야기하고 싶은 부분이 있으시면 말씀해주세요."
                }]);
            } catch (err) {
                setError("분석 결과를 불러오는 데 실패했습니다.");
                setIsLoading(false);
            }
        } else {
            setError("분석 결과가 없습니다. 대시보드에서 발표 세션을 열고 영상을 먼저 업로드해주세요.");
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [chatMessages]);

    useEffect(() => {
        const simulation = analysisContext?.simulation || null;
        const localDeck = buildSlideDeckFromSimulation(simulation || {});
        const localQaItems = normalizeQaResults(simulation?.qaResults);
        const simulationCode = simulation?.code;

        if (!simulationCode) {
            setSlideDeck(localDeck);
            setQaPanel({ items: localQaItems, loading: false, error: "" });
            return undefined;
        }

        let cancelled = false;
        setSlideDeck({ ...localDeck, loading: true, error: "" });
        setQaPanel({ items: localQaItems, loading: true, error: "" });

        (async () => {
            try {
                const simulationSnap = await getDoc(doc(db, "simulations", simulationCode));
                if (cancelled) return;
                const remoteData = simulationSnap.exists() ? simulationSnap.data() : {};
                const remoteDeck = simulationSnap.exists()
                    ? buildSlideDeckFromSimulation(remoteData)
                    : buildSlideDeckFromSimulation();
                const remoteQaItems = normalizeQaResults(remoteData?.qaResults);
                setSlideDeck(mergeSlideDecks(remoteDeck, localDeck));
                setQaPanel({
                    items: remoteQaItems.length > 0 ? remoteQaItems : localQaItems,
                    loading: false,
                    error: "",
                });
            } catch (err) {
                console.warn("[Analysis] 발표자료 timeline 조회 실패:", err);
                if (!cancelled) {
                    setSlideDeck({ ...localDeck, loading: false, error: "발표자료를 불러오지 못했습니다." });
                    setQaPanel({
                        items: localQaItems,
                        loading: false,
                        error: "질의응답 자료를 불러오지 못했습니다.",
                    });
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [analysisContext]);

    const { timestamps = [], scores = {}, summary = {}, transcript = null } = analysisData || {};
    const transcriptUtterances = Array.isArray(transcript?.utterances) ? transcript.utterances : [];
    const expectedDurationSeconds = useMemo(
        () => parseExpectedDurationSeconds(expectedDurationText),
        [expectedDurationText]
    );
    const fallbackActualSeconds = useMemo(() => {
        const utteranceEnds = transcriptUtterances
            .map((utterance) => utterance.endSec ?? utterance.startSec)
            .filter((seconds) => typeof seconds === "number" && Number.isFinite(seconds));
        const timestampSeconds = timestamps
            .map((timestamp) => timestamp.seconds ?? parseTimeToSeconds(timestamp.time))
            .filter((seconds) => typeof seconds === "number" && Number.isFinite(seconds));
        const candidates = [...utteranceEnds, ...timestampSeconds];
        return candidates.length ? Math.max(...candidates) : null;
    }, [timestamps, transcriptUtterances]);
    const displayActualSeconds = Number.isFinite(actualVideoSeconds) ? actualVideoSeconds : fallbackActualSeconds;
    const currentSlide = useMemo(() => {
        if (!slideDeck.slides.length) return null;
        let activeSlide = slideDeck.slides[0];
        for (const slide of slideDeck.slides) {
            if (slide.t <= videoCurrentSeconds + 0.1) activeSlide = slide;
            else break;
        }
        return activeSlide;
    }, [slideDeck.slides, videoCurrentSeconds]);
    const currentSlideImageUrl = currentSlide
        ? slideDeck.slideImageUrls[currentSlide.page - 1] || ""
        : "";
    const pdfRenderKey = currentSlide && !currentSlideImageUrl && slideDeck.pdfUrl
        ? `${slideDeck.pdfUrl}::${currentSlide.page}`
        : "";
    const [renderedPdfSlide, setRenderedPdfSlide] = useState({
        key: "",
        url: "",
        loading: false,
        error: "",
    });

    useEffect(() => {
        if (!pdfRenderKey || !currentSlide) {
            setRenderedPdfSlide({ key: "", url: "", loading: false, error: "" });
            return undefined;
        }

        const cachedUrl = pdfRenderCacheRef.current.get(pdfRenderKey);
        if (cachedUrl) {
            setRenderedPdfSlide({ key: pdfRenderKey, url: cachedUrl, loading: false, error: "" });
            return undefined;
        }

        let cancelled = false;
        setRenderedPdfSlide({ key: pdfRenderKey, url: "", loading: true, error: "" });

        (async () => {
            try {
                const dataUrl = await renderPdfPageToDataUrl(slideDeck.pdfUrl, currentSlide.page);
                if (cancelled) return;
                pdfRenderCacheRef.current.set(pdfRenderKey, dataUrl);
                setRenderedPdfSlide({ key: pdfRenderKey, url: dataUrl, loading: false, error: "" });
            } catch (err) {
                console.warn("[Analysis] PDF 페이지 렌더링 실패:", err);
                if (!cancelled) {
                    setRenderedPdfSlide({
                        key: pdfRenderKey,
                        url: "",
                        loading: false,
                        error: `현재 페이지를 이미지로 렌더링하지 못했습니다. (${err.message || "원인 불명"})`,
                    });
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [pdfRenderKey, slideDeck.pdfUrl, currentSlide]);

    const renderedPdfSlideUrl = renderedPdfSlide.key === pdfRenderKey ? renderedPdfSlide.url : "";
    const isRenderingPdfSlide = renderedPdfSlide.key === pdfRenderKey && renderedPdfSlide.loading;
    const hasSyncedMaterial = Boolean(currentSlide && (currentSlideImageUrl || renderedPdfSlideUrl || isRenderingPdfSlide));

    const activeItemIds = selectedItemIds.length > 0 ? selectedItemIds : ALL_ITEM_IDS;

    const activeCategories = useMemo(() => {
        return FEEDBACK_CATEGORIES
            .map((category) => ({
                ...category,
                items: category.items.filter((item) => activeItemIds.includes(item.id)),
            }))
            .filter((category) => category.items.length > 0);
    }, [activeItemIds]);

    const handleTimestampClick = (timestamp) => {
        setSelectedTimestamp(timestamp);
        if (videoRef.current && timestamp.seconds !== undefined) {
            videoRef.current.currentTime = timestamp.seconds;
            setVideoCurrentSeconds(timestamp.seconds);
            videoRef.current.play();
        }
    };

    const handleTranscriptClick = (utterance, index) => {
        const seconds = utterance.startSec ?? utterance.seconds ?? 0;
        setSelectedTimestamp({ ...utterance, seconds, kind: "transcript", index });
        if (videoRef.current) {
            videoRef.current.currentTime = seconds;
            setVideoCurrentSeconds(seconds);
            videoRef.current.play();
        }
    };

    const formatUtteranceRange = (utterance) => {
        const start = utterance.time || formatSecondsForDisplay(utterance.startSec ?? 0);
        if (utterance.endSec == null || utterance.endSec === utterance.startSec) return start;
        return `${start} - ${formatSecondsForDisplay(utterance.endSec)}`;
    };

    const formatSecondsForDisplay = (seconds) => {
        const safeSeconds = Math.max(0, Number(seconds) || 0);
        const mins = Math.floor(safeSeconds / 60);
        const secs = Math.floor(safeSeconds % 60);
        return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    };

    const handleChatSubmit = async (e) => {
        e.preventDefault();
        if (!chatInput.trim() || isChatLoading) return;

        const userMessage = chatInput.trim();
        setChatInput("");
        const updatedMessages = [...chatMessages, { role: "user", content: userMessage }];
        setChatMessages(updatedMessages);
        setIsChatLoading(true);

        try {
            const response = await fetch(engineUrl("/chat"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: userMessage,
                    chatHistory: chatMessages,
                    analysisContext: analysisData
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(engineErrorMessage(data, "응답 생성 실패"));
            setChatMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
        } catch (err) {
            console.error("Chat error:", err);
            setChatMessages((prev) => [...prev, {
                role: "assistant",
                content: "죄송합니다. 응답을 생성하는 데 문제가 발생했습니다. 다시 시도해주세요."
            }]);
        } finally {
            setIsChatLoading(false);
        }
    };

    if (isLoading) {
        return (
            <main className="analysis-page-v2">
                <div className="loading-container">
                    <div className="loading-spinner"><div className="spinner"></div></div>
                    <h2 className="loading-title">분석 결과 불러오는 중...</h2>
                </div>
            </main>
        );
    }

    if (error) {
        return (
            <main className="analysis-page-v2">
                <div className="loading-container">
                    <h2 className="loading-title">오류</h2>
                    <p className="loading-desc">{error}</p>
                    <button className="btn-primary" onClick={() => router.push("/dashboard")} style={{ marginTop: "1rem" }}>
                        대시보드로 이동
                    </button>
                </div>
            </main>
        );
    }

    // 항목별로 타임스탬프 매칭 (공백·특수문자 정규화 후 비교)
    const normalizeLabel = (s) => (s || "").replace(/\s+/g, "").replace(/[-–—_]/g, "").toLowerCase();
    const matchTimestampsToItem = (item, categoryLabel) => {
        const legacyIds = Object.entries(LEGACY_ITEM_ID_TO_CURRENT_ID)
            .filter(([, currentId]) => currentId === item.id)
            .map(([legacyId]) => legacyId);
        const candidateLabels = [item.label, ...legacyIds.map((legacyId) => LEGACY_ITEM_LABELS[legacyId])]
            .filter(Boolean)
            .map(normalizeLabel);
        const candidateIds = [item.id, ...legacyIds]
            .map((id) => id.replace(/_/g, "").toLowerCase());
        // 카테고리명이 있으면 같은 카테고리 타임스탬프만 대상으로 하되, 없으면 전체 대상
        const pool = categoryLabel
            ? timestamps.filter((t) => !t.category || normalizeLabel(t.category) === normalizeLabel(categoryLabel))
            : timestamps;
        const matched = pool.filter((t) => {
            if (!t || !t.item) return false;
            const tNorm = normalizeLabel(t.item);
            // 완전 일치 (trim)
            if (t.item.trim() === item.label) return true;
            return candidateLabels.some((label) => tNorm === label || tNorm.includes(label) || label.includes(tNorm))
                || candidateIds.some((id) => tNorm === id || tNorm.includes(id) || id.includes(tNorm));
        });
        // 카테고리 필터링으로 매칭된 경우를 우선하되, 없으면 전체에서 재시도
        if (matched.length > 0 || !categoryLabel) return matched;
        return timestamps.filter((t) => {
            if (!t || !t.item) return false;
            const tNorm = normalizeLabel(t.item);
            if (t.item.trim() === item.label) return true;
            return candidateLabels.some((label) => tNorm === label || tNorm.includes(label) || label.includes(tNorm))
                || candidateIds.some((id) => tNorm === id || tNorm.includes(id) || id.includes(tNorm));
        });
    };

    const getFeedbackScore = (itemId) => {
        const legacyIds = Object.entries(LEGACY_ITEM_ID_TO_CURRENT_ID)
            .filter(([, currentId]) => currentId === itemId)
            .map(([legacyId]) => legacyId);
        const values = [itemId, ...legacyIds]
            .map((id) => scores[id])
            .filter((score) => typeof score === "number" && Number.isFinite(score));
        return values.length
            ? Number((values.reduce((sum, score) => sum + score, 0) / values.length).toFixed(1))
            : null;
    };

    const getFeedbackScoreTone = (score) => {
        if (score == null) return "empty";
        if (score >= 3.5) return "high";
        if (score >= 2.5) return "mid";
        return "low";
    };

    const feedbackAreaItems = activeCategories.flatMap((category) =>
        category.items.map((item) => ({ item, category }))
    );
    const activeFeedbackCategoryFilter = activeCategories.some((category) => category.id === feedbackCategoryFilter)
        ? feedbackCategoryFilter
        : "all";
    const activeFeedbackFilter = feedbackAreaItems.some(({ item }) => item.id === feedbackFilter)
        ? feedbackFilter
        : "all";
    const visibleFeedbackAreaItems = activeFeedbackCategoryFilter === "all"
        ? []
        : feedbackAreaItems.filter(({ category }) => category.id === activeFeedbackCategoryFilter);
    const timelineFeedback = feedbackAreaItems
        .flatMap(({ item, category }) => matchTimestampsToItem(item, category.label).map((timestamp, index) => ({
            ...timestamp,
            item,
            category,
            seconds: timestamp.seconds ?? parseTimeToSeconds(timestamp.time),
            key: `${item.id}-${timestamp.time || ""}-${index}-${timestamp.feedback || ""}`,
        })))
        .filter((timestamp) => (
            activeFeedbackCategoryFilter === "all" || timestamp.category.id === activeFeedbackCategoryFilter
        ))
        .filter((timestamp) => activeFeedbackFilter === "all" || timestamp.item.id === activeFeedbackFilter)
        .sort((a, b) => a.seconds - b.seconds);

    const handleFeedbackCategoryChange = (categoryId) => {
        setFeedbackCategoryFilter(categoryId);
        setFeedbackFilter("all");
    };

    const handleSaveReflection = async () => {
        if (!user || !analysisContext?.presentationId || !analysisContext?.attemptId || savingReflection) return;
        setSavingReflection(true);
        setReflectionStatus("");
        try {
            const note = buildReflectionNote(reflectionFields);
            const attemptRef = doc(
                db,
                "users",
                user.uid,
                "presentations",
                analysisContext.presentationId,
                "attempts",
                analysisContext.attemptId
            );
            await updateDoc(attemptRef, {
                reflectionNote: note,
                reflectionFields,
                reflectionUpdatedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            const nextContext = { ...analysisContext, reflectionNote: note, reflectionFields };
            setAnalysisContext(nextContext);
            setSavedReflectionFields(reflectionFields);
            sessionStorage.setItem("analysisContext", JSON.stringify(nextContext));
            setReflectionStatus("저장되었습니다.");
        } catch (err) {
            console.error("[Analysis] 성찰 노트 저장 실패:", err);
            setReflectionStatus("저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
        } finally {
            setSavingReflection(false);
        }
    };

    const canSaveReflection = Boolean(user && analysisContext?.presentationId && analysisContext?.attemptId);
    const reflectionDirty = buildReflectionNote(reflectionFields) !== buildReflectionNote(savedReflectionFields);
    const sessionPath = analysisContext?.presentationId
        ? `/presentations/${analysisContext.presentationId}`
        : "/dashboard";

    return (
        <main className={`analysis-page-v2 feedback-demo-page ${isChatOpen ? "chat-open" : ""}`}>
            <header className="analysis-header-v2">
                <div className="header-content">
                    <h1>발표 분석 결과</h1>
                    <p>{videoName}</p>
                </div>
                <div className="header-reflection-actions" aria-label="성찰 도구">
                    <button
                        type="button"
                        className="analysis-tool-btn note"
                        onClick={() => setReflectionOpen(true)}
                    >
                        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <path d="M14 2v6h6" />
                            <path d="M16 13H8" />
                            <path d="M16 17H8" />
                            <path d="M10 9H8" />
                        </svg>
                        <span>{buildReflectionNote(reflectionFields) ? "성찰 노트" : "노트 작성"}</span>
                    </button>
                    <button
                        type="button"
                        className={`analysis-tool-btn ai ${isChatOpen ? "active" : ""}`}
                        onClick={() => setIsChatOpen((value) => !value)}
                    >
                        {isChatOpen ? (
                            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                        ) : (
                            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                        )}
                        <span>{isChatOpen ? "AI 닫기" : "AI 성찰"}</span>
                    </button>
                </div>
                <div className="header-actions">
                    <button className="btn-outline" onClick={() => router.push(sessionPath)}>대시보드</button>
                    <button className="btn-primary-sm" onClick={() => router.push(sessionPath)}>새 연습 시작</button>
                </div>
            </header>

            <div className="analysis-main-v2 feedback-demo-main">
                <section className="video-summary-section">
                    <div className="video-container-v2">
                        {videoUrl ? (
                            <video
                                ref={videoRef}
                                className="video-player-v2"
                                src={videoUrl}
                                controls
                                onLoadedMetadata={(event) => {
                                    setActualVideoSeconds(event.currentTarget.duration);
                                    setVideoCurrentSeconds(event.currentTarget.currentTime || 0);
                                }}
                                onTimeUpdate={(event) => setVideoCurrentSeconds(event.currentTarget.currentTime || 0)}
                            >
                                브라우저가 비디오 재생을 지원하지 않습니다.
                            </video>
                        ) : (
                            <div className="video-placeholder-v2 feedback-demo-video">
                                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                                <p>영상을 불러올 수 없습니다</p>
                            </div>
                        )}
                    </div>

                    <div className={`summary-container-v2 ${isSlideExpanded ? "slide-expanded" : ""}`}>
                        <h3>종합 피드백</h3>
                        <p className="summary-overall">{summary.overall}</p>

                        <div className="summary-detail-grid">
                            <section className={`slide-sync-panel ${hasSyncedMaterial ? "" : "empty"}`}>
                                <div className="slide-sync-header">
                                    <div className="slide-sync-heading">
                                        <span>발표자료</span>
                                        <strong>{currentSlide ? `${currentSlide.page}페이지` : "발표자료 없음"}</strong>
                                    </div>
                                    <div className="slide-sync-header-actions">
                                        {currentSlide && (
                                            <time>{currentSlide.timeFormatted || formatSecondsForDisplay(currentSlide.t)}</time>
                                        )}
                                        <button
                                            type="button"
                                            className="slide-expand-button"
                                            aria-label={isSlideExpanded ? "발표자료 축소" : "발표자료 확장"}
                                            aria-pressed={isSlideExpanded}
                                            title={isSlideExpanded ? "원래 크기로" : "발표자료 크게 보기"}
                                            disabled={!hasSyncedMaterial}
                                            onClick={() => setIsSlideExpanded((expanded) => !expanded)}
                                        >
                                            {isSlideExpanded ? (
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                    <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
                                                </svg>
                                            ) : (
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                    <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                </div>
                                <div className="slide-sync-preview">
                                    {slideDeck.loading ? (
                                        <div className="slide-sync-empty">발표자료 확인 중...</div>
                                    ) : hasSyncedMaterial ? (
                                        currentSlideImageUrl ? (
                                            <img src={currentSlideImageUrl} alt={`발표자료 ${currentSlide.page}페이지`} />
                                        ) : renderedPdfSlideUrl ? (
                                            <img src={renderedPdfSlideUrl} alt={`발표자료 ${currentSlide.page}페이지`} />
                                        ) : (
                                            <div className="slide-sync-empty">현재 페이지 렌더링 중...</div>
                                        )
                                ) : (
                                    <div className="slide-sync-empty">발표자료 없음</div>
                                )}
                            </div>
                        </section>

                            <div className="summary-lists summary-lists-stack">
                                <button
                                    type="button"
                                    className="summary-card-trigger strengths"
                                    onClick={() => setSummaryModal({ title: "강점", tone: "strengths", items: summary.strengths || [] })}
                                >
                                    <span className="summary-action-icon" aria-hidden="true">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="m6 12 4 4 8-9" />
                                            <circle cx="12" cy="12" r="9" />
                                        </svg>
                                    </span>
                                    <span className="summary-action-copy">
                                        <strong>강점 확인</strong>
                                    </span>
                                    <i aria-hidden="true">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="m9 18 6-6-6-6" />
                                        </svg>
                                    </i>
                                </button>
                                <button
                                    type="button"
                                    className="summary-card-trigger suggestions"
                                    onClick={() => setSummaryModal({ title: "개선 제안", tone: "suggestions", items: summary.suggestions || [] })}
                                >
                                    <span className="summary-action-icon" aria-hidden="true">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M4 17 10 11l4 4 6-8" />
                                            <path d="M15 7h5v5" />
                                        </svg>
                                    </span>
                                    <span className="summary-action-copy">
                                        <strong>개선점 확인</strong>
                                    </span>
                                    <i aria-hidden="true">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="m9 18 6-6-6-6" />
                                        </svg>
                                    </i>
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                {summaryModal && (
                    <div className="summary-modal-backdrop" role="presentation" onMouseDown={(event) => {
                        if (event.target === event.currentTarget) setSummaryModal(null);
                    }}>
                        <section className={`summary-modal summary-modal-${summaryModal.tone}`} role="dialog" aria-modal="true" aria-labelledby="summary-modal-title">
                            <header>
                                <div>
                                    <span>종합 피드백</span>
                                    <h2 id="summary-modal-title">{summaryModal.title}</h2>
                                </div>
                                <button type="button" onClick={() => setSummaryModal(null)} aria-label="닫기">×</button>
                            </header>
                            <ul>
                                {summaryModal.items.length > 0 ? (
                                    summaryModal.items.map((item, index) => <SummaryFeedbackItem key={index} item={item} />)
                                ) : (
                                    <li>표시할 내용이 없습니다.</li>
                                )}
                            </ul>
                        </section>
                    </div>
                )}

                {qaTranscriptModal && (
                    <div className="qa-transcript-modal-backdrop" role="presentation" onMouseDown={(event) => {
                        if (event.target === event.currentTarget) setQaTranscriptModal(null);
                    }}>
                        <section className="qa-transcript-modal" role="dialog" aria-modal="true" aria-labelledby="qa-transcript-modal-title">
                            <header>
                                <div>
                                    <span>Q{qaTranscriptModal.index}</span>
                                    <h2 id="qa-transcript-modal-title">응답 전사 전체보기</h2>
                                </div>
                                <button type="button" onClick={() => setQaTranscriptModal(null)} aria-label="닫기">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                                        <path d="m6 6 12 12M18 6 6 18" />
                                    </svg>
                                </button>
                            </header>
                            <div className="qa-transcript-modal-body">
                                <div className="qa-transcript-question-context">
                                    <span>질문</span>
                                    <p>{qaTranscriptModal.question || "질문 내용이 없습니다."}</p>
                                </div>
                                <div className="qa-transcript-full-text">
                                    <span>전체 응답</span>
                                    <p>{formatTranscriptForReading(qaTranscriptModal.transcript)}</p>
                                </div>
                            </div>
                        </section>
                    </div>
                )}

                {qaFeedbackModal && (
                    <div className="qa-transcript-modal-backdrop" role="presentation" onMouseDown={(event) => {
                        if (event.target === event.currentTarget) setQaFeedbackModal(null);
                    }}>
                        <section className="qa-transcript-modal qa-feedback-modal" role="dialog" aria-modal="true" aria-labelledby="qa-feedback-modal-title">
                            <header>
                                <div>
                                    <span>Q{qaFeedbackModal.index}</span>
                                    <h2 id="qa-feedback-modal-title">AI 피드백 자세히 보기</h2>
                                </div>
                                <button type="button" onClick={() => setQaFeedbackModal(null)} aria-label="닫기">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                                        <path d="m6 6 12 12M18 6 6 18" />
                                    </svg>
                                </button>
                            </header>
                            <div className="qa-transcript-modal-body">
                                <div className="qa-transcript-question-context">
                                    <span>질문</span>
                                    <p>{qaFeedbackModal.question || "질문 내용이 없습니다."}</p>
                                </div>
                                <QaFeedbackDetail feedback={qaFeedbackModal.feedback} />
                            </div>
                        </section>
                    </div>
                )}

                <div className="bottom-sections-wrapper">
                    <div className="bottom-tabs-header" role="tablist" aria-label="분석 자료 보기">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={bottomTab === "data"}
                            className={bottomTab === "data" ? "active" : ""}
                            onClick={() => setBottomTab("data")}
                        >
                            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 3v18h18" />
                                <path d="M7 15l4-4 3 3 5-7" />
                            </svg>
                            <span>발표 데이터</span>
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={bottomTab === "qa"}
                            className={bottomTab === "qa" ? "active" : ""}
                            onClick={() => setBottomTab("qa")}
                        >
                            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 14a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                                <path d="M8 8h8" />
                                <path d="M8 12h5" />
                            </svg>
                            <span>질의응답</span>
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={bottomTab === "feedback"}
                            className={bottomTab === "feedback" ? "active" : ""}
                            onClick={() => setBottomTab("feedback")}
                        >
                            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M9 11l3 3L22 4" />
                                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                            </svg>
                            <span>영역별 피드백 보기</span>
                        </button>
                    </div>

                    <div className="bottom-tabs-panel">
                        {bottomTab === "data" ? (
                            <section className="presentation-data-combined">
                                <article className="transcript-data-card">
                                    <header className="transcript-data-card-header">
                                        <h3>발표 전사문</h3>
                                    </header>
                                    {transcript?.error ? (
                                        <div className="transcript-error-message">
                                            <span>Chirp STT 처리 실패</span>
                                            <p>{transcript.error}</p>
                                        </div>
                                    ) : transcriptUtterances.length > 0 ? (
                                        <div className="transcript-prose-container">
                                            <p className="transcript-prose">
                                                {transcriptUtterances.map((utterance, index) => {
                                                    const isSelected = selectedTimestamp?.kind === "transcript" && selectedTimestamp?.index === index;
                                                    return (
                                                        <button
                                                            key={`${utterance.startSec || 0}-${index}`}
                                                            type="button"
                                                            className={`transcript-prose-segment ${isSelected ? "selected" : ""}`}
                                                            onClick={() => handleTranscriptClick(utterance, index)}
                                                            data-tooltip={formatUtteranceRange(utterance)}
                                                            title={formatUtteranceRange(utterance)}
                                                            aria-label={`${formatUtteranceRange(utterance)} 발화로 이동`}
                                                        >
                                                            {utterance.text}
                                                        </button>
                                                    );
                                                })}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="no-feedback-message">
                                            <span>표시할 전사 자료가 없습니다</span>
                                        </div>
                                    )}
                                </article>
                                <div className="presentation-data-visuals-column">
                                    <PresentationDataVisuals
                                        utterances={transcriptUtterances}
                                        expectedSeconds={expectedDurationSeconds}
                                        actualSeconds={displayActualSeconds}
                                        onRatePointClick={(point) => handleTranscriptClick({
                                            ...point.utterance,
                                            startSec: point.startSec,
                                            seconds: point.startSec,
                                        }, point.index)}
                                    />
                                </div>
                            </section>
                        ) : bottomTab === "qa" ? (
                            <section className="qa-review-section">
                                <header className="qa-review-header">
                                    <div>
                                        <span>시뮬레이션 질의응답</span>
                                        <h3>질문별 응답 전사와 피드백</h3>
                                    </div>
                                    <b>{qaPanel.items.length || 0}/3</b>
                                </header>

                                {qaPanel.loading ? (
                                    <div className="qa-empty-state">
                                        <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                                            <path d="M8 8h8" />
                                            <path d="M8 12h5" />
                                        </svg>
                                        <span>질의응답 자료를 확인 중입니다.</span>
                                    </div>
                                ) : qaPanel.items.length > 0 ? (
                                    <div className="qa-card-grid">
                                        {qaPanel.items.map((item) => (
                                            <article key={item.id} className="qa-review-card">
                                                <header className="qa-card-header">
                                                    <span className="qa-index">Q{item.index}</span>
                                                    <div className="qa-card-meta">
                                                        {item.type && <small>{item.type}</small>}
                                                        {item.target && <small>청중 {item.target}</small>}
                                                    </div>
                                                </header>

                                                <div className="qa-question-block">
                                                    <span>질문</span>
                                                    <p>{item.question || "질문 내용이 아직 없습니다."}</p>
                                                </div>

                                                <div className="qa-answer-block">
                                                    <span>응답 전사</span>
                                                    {item.answerTranscript ? (
                                                        <div className="qa-answer-preview-shell">
                                                            <p className="qa-answer-preview">{item.answerTranscript}</p>
                                                            <button
                                                                type="button"
                                                                className="qa-transcript-open-button"
                                                                onClick={() => setQaTranscriptModal({
                                                                    index: item.index,
                                                                    question: item.question,
                                                                    transcript: item.answerTranscript,
                                                                })}
                                                            >
                                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                                    <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
                                                                </svg>
                                                                전체 전사 보기
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <p className="qa-placeholder">응답 전사 자료가 아직 없습니다.</p>
                                                    )}
                                                </div>

                                                <div className="qa-feedback-block">
                                                    <span>AI 피드백</span>
                                                    {item.aiFeedback ? (
                                                        <QaFeedbackPreview
                                                            feedback={item.aiFeedback}
                                                            onOpen={() => setQaFeedbackModal({
                                                                index: item.index,
                                                                question: item.question,
                                                                feedback: item.aiFeedback,
                                                            })}
                                                        />
                                                    ) : (
                                                        <p className="qa-placeholder">AI 피드백은 아직 생성되지 않았습니다.</p>
                                                    )}
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="qa-empty-state">
                                        <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M21 14a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                                            <path d="M8 8h8" />
                                            <path d="M8 12h5" />
                                        </svg>
                                        <span>{qaPanel.error || "저장된 질의응답 자료가 아직 없습니다."}</span>
                                    </div>
                                )}
                            </section>
                        ) : (
                            <section className="detailed-feedback-section feedback-timeline-section">
                                <header className="feedback-timeline-header">
                                    <div>
                                        <span>평가 영역</span>
                                        <h3>영역별 피드백</h3>
                                    </div>
                                    <p>영역을 선택하면 해당 장면의 피드백만 볼 수 있습니다.</p>
                                </header>

                                <div className="feedback-category-filter" aria-label="피드백 대영역 선택">
                                    <button
                                        type="button"
                                        className={`feedback-category-filter-card ${activeFeedbackCategoryFilter === "all" ? "active" : ""}`}
                                        aria-pressed={activeFeedbackCategoryFilter === "all"}
                                        onClick={() => handleFeedbackCategoryChange("all")}
                                    >
                                        <span className="feedback-category-filter-icon category-all" aria-hidden="true">
                                            <FeedbackCategoryIcon categoryId="all" />
                                        </span>
                                        <span><strong>전체</strong></span>
                                        <i aria-hidden="true">✓</i>
                                    </button>

                                    {activeCategories.map((category) => {
                                        const categoryScores = category.items
                                            .map((item) => getFeedbackScore(item.id))
                                            .filter((score) => score != null);
                                        const categoryScore = categoryScores.length
                                            ? Number((categoryScores.reduce((sum, score) => sum + score, 0) / categoryScores.length).toFixed(1))
                                            : null;
                                        const isActive = activeFeedbackCategoryFilter === category.id;
                                        return (
                                            <button
                                                key={category.id}
                                                type="button"
                                                className={`feedback-category-filter-card ${isActive ? "active" : ""}`}
                                                aria-pressed={isActive}
                                                onClick={() => handleFeedbackCategoryChange(category.id)}
                                            >
                                                <span className={`feedback-category-filter-icon category-${category.id}`} aria-hidden="true">
                                                    <FeedbackCategoryIcon categoryId={category.id} />
                                                </span>
                                                <span>
                                                    <strong>{category.label}</strong>
                                                </span>
                                                <b className={`feedback-score-tone-${getFeedbackScoreTone(categoryScore)}`}>
                                                    {categoryScore ?? "-"}{categoryScore != null && <small>/ 4</small>}
                                                </b>
                                            </button>
                                        );
                                    })}
                                </div>

                                {activeFeedbackCategoryFilter !== "all" && (
                                    <div className="feedback-score-grid feedback-subarea-list" aria-label="피드백 소영역 선택">
                                        {visibleFeedbackAreaItems.map(({ item, category }) => {
                                            const score = getFeedbackScore(item.id);
                                            const isActive = activeFeedbackFilter === item.id;
                                            return (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    className={`feedback-score-card ${isActive ? "active" : ""}`}
                                                    aria-pressed={isActive}
                                                    onClick={() => setFeedbackFilter(isActive ? "all" : item.id)}
                                                >
                                                    <span className={`feedback-score-icon category-${category.id}`} aria-hidden="true">
                                                        <FeedbackItemIcon itemId={item.id} />
                                                    </span>
                                                    <span className="feedback-score-copy">
                                                        <strong>{item.label}</strong>
                                                        <small>{item.desc}</small>
                                                    </span>
                                                    <span className={`feedback-score-value feedback-score-tone-${getFeedbackScoreTone(score)}`}>
                                                        {score ?? "-"}{score != null && <small>/ 4</small>}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                <div className="feedback-timeline-container">
                                    {timelineFeedback.length > 0 ? (
                                        <div className="feedback-timeline">
                                            {timelineFeedback.map((timestamp) => {
                                                const isSelected = selectedTimestamp?.time === timestamp.time
                                                    && selectedTimestamp?.item === timestamp.item.label
                                                    && selectedTimestamp?.feedback === timestamp.feedback;
                                                return (
                                                    <button
                                                        key={timestamp.key}
                                                        type="button"
                                                        className={`feedback-timeline-card ${isSelected ? "selected" : ""}`}
                                                        onClick={() => handleTimestampClick({
                                                            ...timestamp,
                                                            item: timestamp.item.label,
                                                            category: timestamp.category.label,
                                                        })}
                                                    >
                                                        <span className="feedback-timeline-meta">
                                                            <time>{timestamp.time || "00:00"}</time>
                                                            <span className={`feedback-category-tag category-${timestamp.category.id}`}>
                                                                <span aria-hidden="true"><FeedbackItemIcon itemId={timestamp.item.id} /></span>
                                                                {timestamp.item.label}
                                                            </span>
                                                        </span>
                                                        <span className="feedback-timeline-text">{timestamp.feedback}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="feedback-timeline-empty">
                                            선택한 영역에 표시할 피드백이 없습니다.
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}
                    </div>

                </div>
            </div>

            {reflectionOpen && (
                <div className="reflection-note-modal-backdrop" role="presentation" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setReflectionOpen(false);
                }}>
                    <section className="reflection-note-modal" role="dialog" aria-modal="true" aria-labelledby="reflection-note-modal-title">
                        <header className="reflection-note-modal-header">
                            <div>
                                <h2 id="reflection-note-modal-title">성찰 노트</h2>
                            </div>
                            <button type="button" onClick={() => setReflectionOpen(false)} aria-label="닫기">×</button>
                        </header>

                        <div className="reflection-note-body reflection-note-modal-body">
                            <div className="reflection-editor-grid">
                                {REFLECTION_STEPS.map((step) => (
                                    <div key={step.id} className="reflection-editor-row">
                                        <label htmlFor={`reflection-field-${step.id}`}>
                                            <strong>{step.label}</strong>
                                            <span>{step.title}</span>
                                            <small
                                                className={reflectionFields[step.id]?.trim() ? "is-visible" : ""}
                                                aria-hidden={!reflectionFields[step.id]?.trim()}
                                            >
                                                작성됨
                                            </small>
                                        </label>
                                        <textarea
                                            id={`reflection-field-${step.id}`}
                                            value={reflectionFields[step.id] || ""}
                                            onChange={(event) => {
                                                setReflectionFields((prev) => ({
                                                    ...prev,
                                                    [step.id]: event.target.value,
                                                }));
                                                setReflectionStatus("");
                                            }}
                                            placeholder={step.placeholder}
                                            rows={4}
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="reflection-note-actions">
                                <span>
                                    {canSaveReflection
                                        ? reflectionStatus || (reflectionDirty ? "저장되지 않은 변경사항이 있습니다." : "회차 기록에 저장됩니다.")
                                        : "발표 세션에서 열린 분석 결과만 저장할 수 있습니다."}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleSaveReflection}
                                    disabled={!canSaveReflection || savingReflection || !reflectionDirty}
                                >
                                    {savingReflection ? "저장 중..." : "성찰 저장"}
                                </button>
                            </div>
                        </div>
                    </section>
                </div>
            )}

            <div className={`reflection-chat-panel ${isChatOpen ? "open" : ""}`}>
                <div className="chat-panel-header">
                    <div className="chat-panel-title">
                        <span className="chat-icon" aria-hidden="true">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                <path d="M8 9h8" />
                                <path d="M8 13h5" />
                            </svg>
                        </span>
                        <h3>AI 발표 성찰 대화</h3>
                        <button type="button" className="chat-panel-close" onClick={() => setIsChatOpen(false)} aria-label="AI 성찰 닫기">×</button>
                    </div>
                    <p className="chat-panel-desc">AI와 함께 발표를 되돌아보며 성찰해보세요</p>
                </div>

                <div className="chat-messages">
                    {chatMessages.map((msg, idx) => (
                        <div key={idx} className={`chat-message ${msg.role}`}>
                            {msg.role === "assistant" && (
                                <div className="message-avatar" aria-hidden="true">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="5" y="7" width="14" height="12" rx="2" />
                                        <path d="M12 3v4" />
                                        <path d="M9 12h.01" />
                                        <path d="M15 12h.01" />
                                        <path d="M9 16h6" />
                                    </svg>
                                </div>
                            )}
                            <div className="message-content markdown-content">
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                        </div>
                    ))}
                    {isChatLoading && (
                        <div className="chat-message assistant">
                            <div className="message-avatar" aria-hidden="true">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="5" y="7" width="14" height="12" rx="2" />
                                    <path d="M12 3v4" />
                                    <path d="M9 12h.01" />
                                    <path d="M15 12h.01" />
                                    <path d="M9 16h6" />
                                </svg>
                            </div>
                            <div className="message-content loading">
                                <div className="typing-indicator"><span></span><span></span><span></span></div>
                            </div>
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>

                {chatMessages.length <= 1 && (
                    <div className="chat-suggestions">
                        <p className="chat-suggestions-label">
                            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M9 18h6" />
                                <path d="M10 22h4" />
                                <path d="M12 2a7 7 0 0 0-4 12.74V17h8v-2.26A7 7 0 0 0 12 2Z" />
                            </svg>
                            <span>이런 질문을 해보세요</span>
                        </p>
                        <div className="chat-suggestion-buttons">
                            <button type="button" className="chat-suggestion-btn" onClick={() => setChatInput("이번 발표에서 가장 개선되어야 할 부분이 뭘까?")}>
                                이번 발표에서 가장 개선되어야 할 부분이 뭘까?
                            </button>
                            <button type="button" className="chat-suggestion-btn" onClick={() => setChatInput("내용 조직과 표현 전달을 더 잘하려면 어떻게 해야 할까?")}>
                                내용 조직과 표현 전달을 더 잘하려면 어떻게 해야 할까?
                            </button>
                            <button type="button" className="chat-suggestion-btn" onClick={() => setChatInput("다음 발표에서 바로 적용할 수 있는 팁을 알려줘")}>
                                다음 발표에서 바로 적용할 수 있는 팁을 알려줘
                            </button>
                        </div>
                    </div>
                )}

                <form className="chat-input-form" onSubmit={handleChatSubmit}>
                    <textarea
                        className="chat-input"
                        placeholder="발표에 대해 궁금한 점을 물어보세요..."
                        value={chatInput}
                        onChange={(e) => {
                            setChatInput(e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if (chatInput.trim() && !isChatLoading) handleChatSubmit(e);
                            }
                        }}
                        disabled={isChatLoading}
                        rows={1}
                    />
                    <button type="submit" className="chat-send-btn" disabled={!chatInput.trim() || isChatLoading}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                        </svg>
                    </button>
                </form>
            </div>
        </main>
    );
}
