/**
 * 时间线图表 — 真值事件 vs 预警事件在时间轴上的对比
 * 使用 SVG 实现
 */



interface TimelineEvent {
    timestamp: number;
    label: string;
    type: 'alert' | 'truth';
    severity?: string;
}

interface TimelineChartProps {
    alerts: TimelineEvent[];
    truths: TimelineEvent[];
    duration: number;       // 总时长（秒）
    width?: number;
    height?: number;
}

const SEVERITY_COLORS: Record<string, string> = {
    low: '#22c55e',
    medium: '#f59e0b',
    high: '#ef4444',
    critical: '#dc2626',
};

export function TimelineChart({
    alerts, truths, duration,
    width = 800, height = 180,
}: TimelineChartProps) {
    if (duration <= 0) duration = 1;

    const margin = { top: 30, right: 20, bottom: 30, left: 60 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    const xScale = (t: number) => margin.left + (t / duration) * plotW;
    const truthY = margin.top + plotH * 0.3;
    const alertY = margin.top + plotH * 0.7;

    // 时间刻度
    const tickCount = Math.min(10, Math.ceil(duration / 60));
    const ticks = Array.from({ length: tickCount + 1 }, (_, i) => (i / tickCount) * duration);

    return (
        <svg width={width} height={height} className="timeline-chart" style={{ userSelect: 'none' }}>
            {/* 背景 */}
            <rect x={margin.left} y={margin.top} width={plotW} height={plotH}
                fill="rgba(255,255,255,0.02)" rx={4} />

            {/* 行标签 */}
            <text x={margin.left - 8} y={truthY + 4} textAnchor="end"
                fontSize={10} fill="var(--text-secondary)">真值</text>
            <text x={margin.left - 8} y={alertY + 4} textAnchor="end"
                fontSize={10} fill="var(--text-secondary)">预警</text>

            {/* 时间轴 */}
            <line x1={margin.left} y1={height - margin.bottom}
                x2={width - margin.right} y2={height - margin.bottom}
                stroke="var(--glass-border)" strokeWidth={1} />
            {ticks.map((t, i) => (
                <g key={i}>
                    <line x1={xScale(t)} y1={height - margin.bottom}
                        x2={xScale(t)} y2={height - margin.bottom + 4}
                        stroke="var(--text-muted)" strokeWidth={0.5} />
                    <text x={xScale(t)} y={height - margin.bottom + 14}
                        textAnchor="middle" fontSize={9} fill="var(--text-muted)">
                        {Math.round(t)}s
                    </text>
                </g>
            ))}

            {/* 真值事件点 */}
            {truths.map((e, i) => (
                <g key={`t${i}`}>
                    <circle cx={xScale(e.timestamp)} cy={truthY} r={5}
                        fill="#22d3ee" opacity={0.8} />
                    <title>{e.label} @ {e.timestamp.toFixed(1)}s</title>
                </g>
            ))}

            {/* 预警事件点 */}
            {alerts.map((e, i) => (
                <g key={`a${i}`}>
                    <circle cx={xScale(e.timestamp)} cy={alertY} r={5}
                        fill={SEVERITY_COLORS[e.severity || 'medium']} opacity={0.8} />
                    <title>{e.label} ({e.severity}) @ {e.timestamp.toFixed(1)}s</title>
                </g>
            ))}

            {/* 匹配连线 — 简单对齐最近的事件 */}
            {alerts.map((a, i) => {
                const closest = truths.reduce((best, t) =>
                    Math.abs(t.timestamp - a.timestamp) < Math.abs(best.timestamp - a.timestamp) ? t : best
                    , truths[0]);
                if (!closest || Math.abs(closest.timestamp - a.timestamp) > duration * 0.1) return null;
                return (
                    <line key={`m${i}`}
                        x1={xScale(a.timestamp)} y1={alertY - 5}
                        x2={xScale(closest.timestamp)} y2={truthY + 5}
                        stroke="rgba(255,255,255,0.1)" strokeWidth={0.5} strokeDasharray="3,3" />
                );
            })}
        </svg>
    );
}
