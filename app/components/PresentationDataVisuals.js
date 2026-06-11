"use client";

function countSpeechUnits(text) {
    return String(text || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
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
    return utterances
        .map((utterance, index) => {
            const startSec = Number(utterance.startSec ?? utterance.seconds ?? 0);
            const fallbackEndSec = Number(utterance.endSec ?? startSec);
            const endSec = Number.isFinite(fallbackEndSec) && fallbackEndSec > startSec
                ? fallbackEndSec
                : startSec + 1;
            const durationSec = Math.max(1, endSec - startSec);
            const units = countSpeechUnits(utterance.text);
            const wpm = units > 0 ? Math.round(units / (durationSec / 60)) : 0;

            return {
                index,
                utterance,
                startSec,
                endSec,
                timeSec: startSec + durationSec / 2,
                units,
                wpm,
            };
        })
        .filter((point) => point.units > 0 && Number.isFinite(point.wpm));
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
    const maxWpm = Math.max(180, Math.ceil(Math.max(...series.map((point) => point.wpm)) / 20) * 20);
    const minWpm = 0;
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const xFor = (seconds) => padding.left + (Math.max(0, seconds) / maxTime) * plotWidth;
    const yFor = (wpm) => padding.top + (1 - (Math.max(minWpm, wpm) - minWpm) / (maxWpm - minWpm)) * plotHeight;
    const coords = series.map((point) => ({
        x: xFor(point.timeSec),
        y: yFor(point.wpm),
    }));
    const linePath = buildSmoothPath(coords);
    const averageWpm = Math.round(
        series.reduce((sum, point) => sum + point.units, 0)
        / (Math.max(1, series.reduce((sum, point) => sum + (point.endSec - point.startSec), 0)) / 60)
    );
    const yTicks = [0, Math.round(maxWpm / 2), maxWpm];
    const xTicks = [0, maxTime / 2, maxTime];

    return (
        <div className="speech-rate-chart">
            <div className="presentation-data-metric-row">
                <div>
                    <span>평균 말 빠르기</span>
                    <strong>{averageWpm} 어절/분</strong>
                </div>
                <div>
                    <span>최고 구간</span>
                    <strong>{Math.max(...series.map((point) => point.wpm))} 어절/분</strong>
                </div>
            </div>

            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="구간별 말 빠르기 선 그래프">
                <rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} rx="6" className="chart-plot-bg" />
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
                <path d={linePath} fill="none" className="speech-rate-line" />
                {series.map((point, index) => (
                    <circle
                        key={`${point.startSec}-${point.index}`}
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
                        <title>{`${formatClock(point.startSec)} · ${point.wpm} 어절/분`}</title>
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
    const series = buildSpeechRateSeries(utterances);

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
                    <p>전사 구간별 어절/분을 계산해 발표 속도 변화를 표시합니다.</p>
                </header>
                <SpeechRateChart series={series} onPointClick={onRatePointClick} />
            </article>
        </section>
    );
}
