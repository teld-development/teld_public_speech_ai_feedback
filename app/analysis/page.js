"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/AuthProvider";
import { FEEDBACK_CATEGORIES, ALL_ITEM_IDS } from "../lib/feedbackAreas";
import PresentationDataVisuals from "../components/PresentationDataVisuals";
import { engineErrorMessage, engineUrl } from "../lib/engineApi";

const PDFJS_VERSION = "4.10.38";

async function loadPdfJs() {
    const pdfjsLib = await import(/* webpackIgnore: true */ `/pdf.min.mjs?v=${PDFJS_VERSION}`);
    pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${PDFJS_VERSION}`;
    return pdfjsLib;
}

function buildInitialSelections(activeItemIds = ALL_ITEM_IDS) {
    return FEEDBACK_CATEGORIES.reduce((acc, category) => {
        const firstActiveItem = category.items.find((item) => activeItemIds.includes(item.id));
        acc[category.id] = firstActiveItem?.id || category.items[0]?.id || "";
        return acc;
    }, {});
}

const REFLECTION_STEPS = [
    {
        id: "keep",
        label: "잘한점",
        title: "오늘 발표에서 계속 가져갈 점",
        desc: "잘 작동했던 표현, 구성, 태도, 자료 활용을 적어두세요.",
        placeholder: "예: 도입에서 발표 목적을 먼저 말해서 흐름이 분명했다.",
    },
    {
        id: "improve",
        label: "개선점",
        title: "다음 회차에서 조정할 점",
        desc: "분석 결과를 보고 가장 먼저 고치고 싶은 한두 가지를 정리하세요.",
        placeholder: "예: 결론에서 핵심 문장을 더 짧고 분명하게 말해야겠다.",
    },
    {
        id: "next",
        label: "다음 계획",
        title: "다음 연습에서 실제로 할 행동",
        desc: "다음 회차 전에 바로 실행할 수 있는 연습 계획을 적어두세요.",
        placeholder: "예: 마지막 30초 결론부만 따로 3번 녹화해보기.",
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
            ...EMPTY_REFLECTION_FIELDS,
            ...context.reflectionFields,
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
    const [selectedByCategory, setSelectedByCategory] = useState(() => buildInitialSelections());
    const [expectedDurationText, setExpectedDurationText] = useState("");
    const [actualVideoSeconds, setActualVideoSeconds] = useState(null);
    const [analysisContext, setAnalysisContext] = useState(null);
    const [reflectionFields, setReflectionFields] = useState(EMPTY_REFLECTION_FIELDS);
    const [savedReflectionFields, setSavedReflectionFields] = useState(EMPTY_REFLECTION_FIELDS);
    const [reflectionOpen, setReflectionOpen] = useState(false);
    const [activeReflectionStep, setActiveReflectionStep] = useState("keep");
    const [savingReflection, setSavingReflection] = useState(false);
    const [reflectionStatus, setReflectionStatus] = useState("");
    const [summaryModal, setSummaryModal] = useState(null);
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
                    setSelectedItemIds(prepareData.feedbackItems || []);
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
        const activeIds = selectedItemIds.length > 0 ? selectedItemIds : ALL_ITEM_IDS;
        setSelectedByCategory((prev) => {
            const next = {};
            FEEDBACK_CATEGORIES.forEach((category) => {
                const activeItems = category.items.filter((item) => activeIds.includes(item.id));
                const currentStillActive = activeItems.some((item) => item.id === prev[category.id]);
                next[category.id] = currentStillActive
                    ? prev[category.id]
                    : activeItems[0]?.id || category.items[0]?.id || "";
            });
            return next;
        });
    }, [selectedItemIds]);

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

    const totalFeedbackAreaCount = useMemo(() => {
        return activeCategories.reduce((sum, category) => sum + category.items.length, 0);
    }, [activeCategories]);

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
        const norm = normalizeLabel(item.label);
        const normId = item.id.replace(/_/g, "").toLowerCase();
        // 카테고리명이 있으면 같은 카테고리 타임스탬프만 대상으로 하되, 없으면 전체 대상
        const pool = categoryLabel
            ? timestamps.filter((t) => !t.category || normalizeLabel(t.category) === normalizeLabel(categoryLabel))
            : timestamps;
        const matched = pool.filter((t) => {
            if (!t || !t.item) return false;
            const tNorm = normalizeLabel(t.item);
            // 완전 일치 (trim)
            if (t.item.trim() === item.label) return true;
            // 정규화 후 비교 (공백·대시 차이 무시)
            if (tNorm === norm) return true;
            // 포함 관계 (모델이 설명을 붙인 경우 대비)
            if (tNorm.includes(norm) || norm.includes(tNorm)) return true;
            // fallback: item ID 기반 매칭 (모델이 영어 ID를 반환한 경우)
            if (tNorm === normId || tNorm.includes(normId) || normId.includes(tNorm)) return true;
            return false;
        });
        // 카테고리 필터링으로 매칭된 경우를 우선하되, 없으면 전체에서 재시도
        if (matched.length > 0 || !categoryLabel) return matched;
        return timestamps.filter((t) => {
            if (!t || !t.item) return false;
            const tNorm = normalizeLabel(t.item);
            if (t.item.trim() === item.label) return true;
            if (tNorm === norm) return true;
            if (tNorm.includes(norm) || norm.includes(tNorm)) return true;
            if (tNorm === normId || tNorm.includes(normId) || normId.includes(tNorm)) return true;
            return false;
        });
    };

    const getItemSuggestion = (categoryIndex) => {
        const suggestions = summary.suggestions || [];
        if (suggestions.length > 0) return suggestions[categoryIndex % suggestions.length];
        return "선택한 타임스탬프 피드백을 기준으로 다음 연습에서 같은 장면을 다시 확인해보세요.";
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
    const activeReflection = REFLECTION_STEPS.find((step) => step.id === activeReflectionStep) || REFLECTION_STEPS[0];
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

                    <div className="summary-container-v2">
                        <h3>종합 피드백</h3>
                        <p className="summary-overall">{summary.overall}</p>

                        <div className="summary-detail-grid">
                            <section className={`slide-sync-panel ${hasSyncedMaterial ? "" : "empty"}`}>
                                <div className="slide-sync-header">
                                    <div>
                                        <span>발표자료</span>
                                        <strong>{currentSlide ? `${currentSlide.page}페이지` : "발표자료 없음"}</strong>
                                    </div>
                                    {currentSlide && (
                                        <time>{currentSlide.timeFormatted || formatSecondsForDisplay(currentSlide.t)}</time>
                                    )}
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
                                    <span>
                                        <strong>강점 확인</strong>
                                        <small>잘된 부분 모아보기</small>
                                    </span>
                                    <i aria-hidden="true">→</i>
                                </button>
                                <button
                                    type="button"
                                    className="summary-card-trigger suggestions"
                                    onClick={() => setSummaryModal({ title: "개선 제안", tone: "suggestions", items: summary.suggestions || [] })}
                                >
                                    <span>
                                        <strong>개선점 확인</strong>
                                        <small>다음 연습 포인트 보기</small>
                                    </span>
                                    <i aria-hidden="true">→</i>
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
                                    summaryModal.items.map((item, index) => <li key={index}>{item}</li>)
                                ) : (
                                    <li>표시할 내용이 없습니다.</li>
                                )}
                            </ul>
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
                                        onRatePointClick={(point) => handleTranscriptClick(point.utterance, point.index)}
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
                                                    <p className={item.answerTranscript ? "" : "qa-placeholder"}>
                                                        {item.answerTranscript || "응답 전사 자료가 아직 없습니다."}
                                                    </p>
                                                </div>

                                                <div className="qa-feedback-block">
                                                    <span>AI 피드백</span>
                                                    <p className={item.aiFeedback ? "" : "qa-placeholder"}>
                                                        {item.aiFeedback || "AI 피드백은 아직 생성되지 않았습니다."}
                                                    </p>
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
                    <section className="detailed-feedback-section feedback-demo-section">
                        <div className="feedback-demo-category-row">
                            {activeCategories.map((cat, categoryIndex) => {
                                const selectedItemId = selectedByCategory[cat.id];
                                const selectedItem = cat.items.find((item) => item.id === selectedItemId) || cat.items[0];
                                const itemTimestamps = selectedItem ? matchTimestampsToItem(selectedItem, cat.label) : [];
                                const score = selectedItem ? scores[selectedItem.id] : null;
                                const primaryFeedback = itemTimestamps[0]?.feedback || "이 항목에 대한 타임스탬프 피드백이 아직 없습니다.";
                                const scoreSummary = score != null
                                    ? `${selectedItem.label} 점수는 ${score}/5입니다. ${primaryFeedback}`
                                    : primaryFeedback;

                                return (
                                    <article key={cat.id} className="feedback-demo-card">
                                        <div className="feedback-demo-card-header">
                                            <div className="feedback-category-title feedback-demo-title">
                                                <span className="category-icon">{cat.icon}</span>
                                                <div>
                                                    <h4>{cat.label}</h4>
                                                    <span className="category-short">{cat.shortLabel}</span>
                                                </div>
                                            </div>
                                            <div className="feedback-demo-tabs" aria-label={`${cat.label} 하위 영역`}>
                                                {cat.items.map((item) => (
                                                    <button
                                                        key={item.id}
                                                        type="button"
                                                        className={`feedback-demo-tab ${selectedItem?.id === item.id ? "active" : ""}`}
                                                        onClick={() => setSelectedByCategory((prev) => ({
                                                            ...prev,
                                                            [cat.id]: item.id,
                                                        }))}
                                                    >
                                                        {item.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {selectedItem && (
                                            <div className="feedback-demo-card-body">
                                                <div className="feedback-area-header feedback-demo-active-header">
                                                    <div className="feedback-area-title">
                                                        <h4>{selectedItem.label}</h4>
                                                        <span className="feedback-area-desc">{selectedItem.desc}</span>
                                                    </div>
                                                    {score != null && (
                                                        <div className="score-badge" data-score={score} title={`${score}/5점`}>
                                                            {[1, 2, 3, 4, 5].map((n) => (
                                                                <span key={n} className={`score-dot ${n <= score ? "filled" : ""}`} />
                                                            ))}
                                                            <span className="score-value">{score}<span className="score-max">/5</span></span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="timestamp-card-mini feedback-demo-summary">
                                                    <span className="time-badge-mini">요약</span>
                                                    <p className="timestamp-feedback-mini">{scoreSummary}</p>
                                                </div>

                                                <div className="feedback-demo-evidence-list">
                                                    {itemTimestamps.length > 0 ? (
                                                        itemTimestamps.map((t, index) => {
                                                            const seconds = t.seconds ?? parseTimeToSeconds(t.time);
                                                            const isSelected = selectedTimestamp?.time === t.time
                                                                && selectedTimestamp?.item === t.item
                                                                && selectedTimestamp?.feedback === t.feedback;
                                                            return (
                                                                <div
                                                                    key={index}
                                                                    className={`timestamp-card-mini ${isSelected ? "selected" : ""}`}
                                                                    onClick={() => handleTimestampClick({ ...t, seconds })}
                                                                >
                                                                    <span className="time-badge-mini">{t.time}</span>
                                                                    <p className="timestamp-feedback-mini">{t.feedback}</p>
                                                                </div>
                                                            );
                                                        })
                                                    ) : (
                                                        <div className="no-feedback-message">
                                                            <span>이 항목에 대한 피드백이 없습니다</span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="feedback-demo-suggestion">
                                                    <strong>개선 제안</strong>
                                                    <p>{getItemSuggestion(categoryIndex)}</p>
                                                </div>
                                            </div>
                                        )}
                                    </article>
                                );
                            })}
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
                            <div className="reflection-step-tabs" role="tablist" aria-label="성찰 항목">
                                {REFLECTION_STEPS.map((step) => (
                                    <button
                                        key={step.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={activeReflectionStep === step.id}
                                        className={activeReflectionStep === step.id ? "active" : ""}
                                        onClick={() => setActiveReflectionStep(step.id)}
                                    >
                                        <span>{step.label}</span>
                                        {reflectionFields[step.id]?.trim() && <i aria-label="작성됨">✓</i>}
                                    </button>
                                ))}
                            </div>

                            <div className="reflection-step-panel">
                                <textarea
                                    value={reflectionFields[activeReflection.id] || ""}
                                    onChange={(event) => {
                                        setReflectionFields((prev) => ({
                                            ...prev,
                                            [activeReflection.id]: event.target.value,
                                        }));
                                        setReflectionStatus("");
                                    }}
                                    placeholder={activeReflection.placeholder}
                                    rows={5}
                                />
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
