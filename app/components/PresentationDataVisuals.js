"use client";

import { useMemo } from "react";

const STANDARD_SYLLABLES_PER_MINUTE_MIN = 210;
const STANDARD_SYLLABLES_PER_MINUTE_MAX = 270;
const STANDARD_SYLLABLES_PER_MINUTE_CENTER = 240;

function countKoreanSyllables(text) {
    return String(text || "").match(/[가-힣]/g)?.length || 0;
}

function formatClock(seconds) {
    const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
    const mins = Math.floor(safeSeconds / 60);
    const secs = safeSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatDurationLabel(seconds) {
    if (!Number.isFinite(seconds)) return "-";
    const safeSeconds = Math.max(0, Math.round(seconds));
    const mins = Math.floor(safeSeconds / 60);
    const secs = safeSeconds % 60;
    if (mins > 0 && secs > 0) return `${mins}분 ${secs}초`;
    if (mins > 0) return `${mins}분`;
    return `${secs}초`;
}

function buildSpeechRateSeries(utterances = []) {
    const segments = utterances
        .map((utterance, index) => {
            const startSec = Number(utterance.startSec ?? utterance.seconds ?? 0);
            const fallbackEndSec = Number(utterance.endSec ?? startSec);
            const endSec = Number.isFinite(fallbackEndSec) && fallbackEndSec > startSec
                ? fallbackEndSec
                : startSec + 1;
            const durationSec = Math.max(1, endSec - startSec);
            const syllables = countKoreanSyllables(utterance.text);

            return {
                index,
                utterance,
                startSec,
                endSec,
                durationSec,
                syllables,
            };
        })
        .filter((segment) => segment.syllables > 0 && Number.isFinite(segment.startSec) && Number.isFinite(segment.endSec));

    if (!segments.length) return [];

    const maxTime = Math.max(...segments.map((segment) => segment.endSec));
    const minuteCount = Math.max(1, Math.ceil(maxTime / 60));

    return Array.from({ length: minuteCount }, (_, index) => {
        const startSec = index * 60;
        const endSec = Math.min(startSec + 60, maxTime);
        const durationSec = Math.max(1, endSec - startSec);
        const overlappingSegments = segments.filter((segment) => segment.endSec > startSec && segment.startSec < endSec);
        const syllables = overlappingSegments.reduce((total, segment) => {
            const overlapStart = Math.max(startSec, segment.startSec);
            const overlapEnd = Math.min(endSec, segment.endSec);
            const overlapRatio = Math.max(0, overlapEnd - overlapStart) / segment.durationSec;
            return total + segment.syllables * overlapRatio;
        }, 0);
        const representative = overlappingSegments[0] || segments[0];

        return {
            index,
            utterance: representative.utterance,
            startSec,
            endSec,
            durationSec,
            timeSec: startSec + durationSec / 2,
            syllables,
            syllablesPerMinute: Math.round(syllables / (durationSec / 60)),
        };
    });
}

function getSpeechRateDeviation(rate) {
    if (rate < STANDARD_SYLLABLES_PER_MINUTE_MIN) {
        return {
            tone: "slow",
            label: `${STANDARD_SYLLABLES_PER_MINUTE_MIN - rate}음절/분 느림`,
        };
    }
    if (rate > STANDARD_SYLLABLES_PER_MINUTE_MAX) {
        return {
            tone: "fast",
            label: `${rate - STANDARD_SYLLABLES_PER_MINUTE_MAX}음절/분 빠름`,
        };
    }
    return { tone: "good", label: "권장 범위 내" };
}

function buildSmoothPath(coords) {
    if (!coords.length) return "";
    if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;

    const path = [`M ${coords[0].x} ${coords[0].y}`];
    for (let i = 0; i < coords.length - 1; i += 1) {
        const p0 = coords[Math.max(0, i - 1)];
        const p1 = coords[i];
        const p2 = coords[i + 1];
        const p3 = coords[Math.min(coords.length - 1, i + 2)];
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        path.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`);
    }
    return path.join(" ");
}

function getDurationStatus(expectedSeconds, actualSeconds) {
    if (!Number.isFinite(expectedSeconds) || !Number.isFinite(actualSeconds)) {
        return { tone: "empty", label: "시간 정보 부족", diffText: "예상 시간과 실제 시간이 모두 필요합니다." };
    }

    const diff = Math.round(actualSeconds - expectedSeconds);
    const absDiff = Math.abs(diff);
    const direction = diff === 0 ? "일치" : diff > 0 ? "초과" : "짧음";
    const diffText = diff === 0 ? "예상 시간과 일치" : `${formatDurationLabel(absDiff)} ${direction}`;

    if (absDiff <= 60) return { tone: "good", label: "양호", diffText };
    if (absDiff <= 240) return { tone: "warn", label: "주의", diffText };
    return { tone: "danger", label: "연습필요", diffText };
}

function SpeechRateChart({ series, onPointClick }) {
    if (!series.length) {
        return (
            <div className="presentation-data-empty">
                말 빠르기를 계산할 전사 구간이 없습니다.
            </div>
        );
    }

    const width = 520;
    const height = 210;
    const padding = { top: 16, right: 20, bottom: 34, left: 42 };
    const maxTime = Math.max(...series.map((point) => point.endSec), 1);
    const observedRates = series.map((point) => point.syllablesPerMinute);
    const observedMinRate = Math.min(...observedRates);
    const observedMaxRate = Math.max(...observedRates);
    const minRate = Math.max(
        0,
        Math.floor((Math.min(observedMinRate, STANDARD_SYLLABLES_PER_MINUTE_MIN) - 30) / 30) * 30
    );
    const maxRate = Math.max(
        minRate + 120,
        Math.ceil((Math.max(observedMaxRate, STANDARD_SYLLABLES_PER_MINUTE_MAX) + 30) / 30) * 30
    );
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const xFor = (seconds) => padding.left + (Math.max(0, seconds) / maxTime) * plotWidth;
    const yFor = (rate) => {
        const boundedRate = Math.min(maxRate, Math.max(minRate, rate));
        return padding.top + (1 - (boundedRate - minRate) / (maxRate - minRate)) * plotHeight;
    };
    const coords = series.map((point) => ({
        x: xFor(point.timeSec),
        y: yFor(point.syllablesPerMinute),
    }));
    const linePath = buildSmoothPath(coords);
    const averageRate = Math.round(
        series.reduce((sum, point) => sum + point.syllables, 0)
        / (Math.max(1, series.reduce((sum, point) => sum + point.durationSec, 0)) / 60)
    );
    const deviation = getSpeechRateDeviation(averageRate);
    const yTicks = [...new Set([
        minRate,
        STANDARD_SYLLABLES_PER_MINUTE_MIN,
        STANDARD_SYLLABLES_PER_MINUTE_MAX,
        maxRate,
    ])].sort((a, b) => a - b);
    const xTicks = [0, maxTime / 2, maxTime];

    return (
        <div className="speech-rate-chart">
            <div className="presentation-data-metric-row">
                <div>
                    <span>평균 말 빠르기</span>
                    <strong>{averageRate} 음절/분</strong>
                </div>
                <div>
                    <span>권장 범위</span>
                    <strong>210~270 음절/분</strong>
                </div>
                <div className={`speech-rate-deviation ${deviation.tone}`}>
                    <span>표준 범위와 차이</span>
                    <strong>{deviation.label}</strong>
                </div>
            </div>

            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="분당 음절 수와 권장 말하기 속도 비교 그래프">
                <rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} rx="6" className="chart-plot-bg" />
                <rect
                    x={padding.left}
                    y={yFor(STANDARD_SYLLABLES_PER_MINUTE_MAX)}
                    width={plotWidth}
                    height={yFor(STANDARD_SYLLABLES_PER_MINUTE_MIN) - yFor(STANDARD_SYLLABLES_PER_MINUTE_MAX)}
                    className="speech-rate-standard-band"
                />
                {yTicks.map((tick) => (
                    <g key={`y-${tick}`}>
                        <line x1={padding.left} x2={width - padding.right} y1={yFor(tick)} y2={yFor(tick)} className="chart-grid-line" />
                        <text x={padding.left - 10} y={yFor(tick) + 4} textAnchor="end" className="chart-axis-label">{tick}</text>
                    </g>
                ))}
                {xTicks.map((tick) => (
                    <text key={`x-${tick}`} x={xFor(tick)} y={height - 10} textAnchor="middle" className="chart-axis-label">
                        {formatClock(tick)}
                    </text>
                ))}
                <line
                    x1={padding.left}
                    x2={width - padding.right}
                    y1={yFor(STANDARD_SYLLABLES_PER_MINUTE_CENTER)}
                    y2={yFor(STANDARD_SYLLABLES_PER_MINUTE_CENTER)}
                    className="speech-rate-standard-line"
                />
                <text
                    x={width - padding.right - 6}
                    y={yFor(STANDARD_SYLLABLES_PER_MINUTE_CENTER) - 6}
                    textAnchor="end"
                    className="speech-rate-standard-label"
                >
                    표준 240
                </text>
                <path d={linePath} fill="none" className="speech-rate-line" />
                {series.map((point, index) => (
                    <circle
                        key={`minute-${point.index}`}
                        cx={coords[index].x}
                        cy={coords[index].y}
                        r="4"
                        className="speech-rate-point"
                        role="button"
                        tabIndex="0"
                        onClick={() => onPointClick?.(point)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") onPointClick?.(point);
                        }}
                    >
                        <title>{`${formatClock(point.startSec)}~${formatClock(point.endSec)} · ${point.syllablesPerMinute} 음절/분`}</title>
                    </circle>
                ))}
            </svg>
        </div>
    );
}

function DurationComplianceChart({ expectedSeconds, actualSeconds }) {
    const expected = Number(expectedSeconds);
    const actual = Number(actualSeconds);
    const status = getDurationStatus(expected, actual);

    if (!Number.isFinite(expected) || !Number.isFinite(actual)) {
        return (
            <div className="presentation-data-empty">
                발표 시간 준수 여부를 계산하려면 예상 시간과 실제 영상 길이가 필요합니다.
            </div>
        );
    }

    const width = 520;
    const height = 88;
    const padX = 34;
    const axisY = 38;
    const min = Math.max(0, Math.min(expected - 300, actual - 60));
    const max = Math.max(expected + 300, actual + 60, min + 60);
    const xFor = (seconds) => padX + ((seconds - min) / (max - min)) * (width - padX * 2);
    const segments = [
        { start: min, end: Math.min(expected - 240, max), tone: "danger" },
        { start: Math.max(min, expected - 240), end: Math.min(expected - 60, max), tone: "warn" },
        { start: Math.max(min, expected - 60), end: Math.min(expected + 60, max), tone: "good" },
        { start: Math.max(min, expected + 60), end: Math.min(expected + 240, max), tone: "warn" },
        { start: Math.max(min, expected + 240), end: max, tone: "danger" },
    ].filter((segment) => segment.end > segment.start);

    return (
        <div className={`duration-compliance-card ${status.tone}`}>
            <div className="duration-compliance-topline">
                <div className="duration-compliance-stat">
                    <span>예상</span>
                    <strong>{formatDurationLabel(expected)}</strong>
                </div>
                <div className="duration-compliance-stat">
                    <span>실제 발표시간</span>
                    <strong>{formatDurationLabel(actual)}</strong>
                </div>
                <div className="duration-compliance-stat">
                    <span>초과시간</span>
                    <strong>{status.diffText}</strong>
                </div>
                <em>{status.label}</em>
            </div>

            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="발표 시간 준수 시각화">
                <line x1={padX} x2={width - padX} y1={axisY} y2={axisY} className="duration-track-base" />
                {segments.map((segment) => (
                    <line
                        key={`${segment.tone}-${segment.start}-${segment.end}`}
                        x1={xFor(segment.start)}
                        x2={xFor(segment.end)}
                        y1={axisY}
                        y2={axisY}
                        className={`duration-zone duration-zone-${segment.tone}`}
                    />
                ))}
                <line x1={xFor(expected)} x2={xFor(expected)} y1={axisY - 18} y2={axisY + 18} className="duration-expected-line" />
                <text x={xFor(expected)} y={axisY - 24} textAnchor="middle" className="chart-axis-label">예상</text>
                <g className="duration-actual-marker" transform={`translate(${xFor(actual)} ${axisY})`}>
                    <line x1="0" x2="0" y1="-21" y2="19" />
                    <circle cx="0" cy="0" r="6" />
                    <text y="32" textAnchor="middle">실제</text>
                </g>
                <text x={xFor(Math.max(min, expected - 240))} y={axisY + 31} textAnchor="middle" className="chart-axis-label">-4분</text>
                <text x={xFor(Math.max(min, expected - 60))} y={axisY + 31} textAnchor="middle" className="chart-axis-label">-1분</text>
                <text x={xFor(Math.min(max, expected + 60))} y={axisY + 31} textAnchor="middle" className="chart-axis-label">+1분</text>
                <text x={xFor(Math.min(max, expected + 240))} y={axisY + 31} textAnchor="middle" className="chart-axis-label">+4분</text>
            </svg>
        </div>
    );
}

export default function PresentationDataVisuals({
    utterances = [],
    expectedSeconds,
    actualSeconds,
    onRatePointClick,
}) {
    const series = useMemo(() => buildSpeechRateSeries(utterances), [utterances]);

    return (
        <section className="presentation-data-section">
            <article className="presentation-data-card presentation-data-card-compact">
                <header>
                    <h3>발표 시간 판단</h3>
                </header>
                <DurationComplianceChart expectedSeconds={expectedSeconds} actualSeconds={actualSeconds} />
            </article>

            <article className="presentation-data-card">
                <header>
                    <h3>말속도</h3>
                    <p>발표를 1분 단위로 나누어 한글 음절 수를 집계하고 권장 속도(210~270음절/분)와 비교합니다.</p>
                </header>
                <SpeechRateChart series={series} onPointClick={onRatePointClick} />
            </article>
        </section>
    );
}
