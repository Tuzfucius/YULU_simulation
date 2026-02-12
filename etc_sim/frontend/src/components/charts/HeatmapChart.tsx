/**
 * 热力图组件 — 按路段位置和时间显示预警密度
 * 使用 SVG canvas 实现
 */

import { useMemo } from 'react';

interface HeatmapData {
    position: number;   // 位置（km）
    time: number;       // 时间段索引
    intensity: number;  // 强度 0-1
}

interface HeatmapChartProps {
    data: HeatmapData[];
    maxPosition: number;    // 最大位置 km
    timeBins: number;       // 时间分组数
    width?: number;
    height?: number;
    title?: string;
}

function intensityToColor(v: number): string {
    // 0 -> 透明暗蓝, 0.5 -> 黄色, 1 -> 红色
    v = Math.max(0, Math.min(1, v));
    if (v < 0.25) {
        const t = v / 0.25;
        return `rgba(30, 60, 120, ${0.1 + t * 0.3})`;
    } else if (v < 0.5) {
        const t = (v - 0.25) / 0.25;
        const r = Math.round(30 + t * 220);
        const g = Math.round(60 + t * 180);
        return `rgba(${r}, ${g}, 50, ${0.5 + t * 0.2})`;
    } else if (v < 0.75) {
        const t = (v - 0.5) / 0.25;
        const r = Math.round(250);
        const g = Math.round(240 - t * 140);
        return `rgba(${r}, ${g}, 30, ${0.7 + t * 0.15})`;
    } else {
        const t = (v - 0.75) / 0.25;
        const g = Math.round(100 - t * 80);
        return `rgba(240, ${g}, 20, ${0.85 + t * 0.15})`;
    }
}

export function HeatmapChart({
    data, maxPosition, timeBins,
    width = 600, height = 300, title = '预警热力图',
}: HeatmapChartProps) {
    const margin = { top: 35, right: 60, bottom: 30, left: 50 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    // 生成网格
    const positionBins = Math.max(1, Math.ceil(maxPosition));
    const cellW = plotW / timeBins;
    const cellH = plotH / positionBins;

    // 数据映射到网格
    const grid = useMemo(() => {
        const g: number[][] = Array.from({ length: positionBins }, () =>
            Array(timeBins).fill(0)
        );
        for (const d of data) {
            const pi = Math.min(positionBins - 1, Math.max(0, Math.floor(d.position)));
            const ti = Math.min(timeBins - 1, Math.max(0, d.time));
            g[pi][ti] = Math.max(g[pi][ti], d.intensity);
        }
        return g;
    }, [data, positionBins, timeBins]);

    return (
        <svg width={width} height={height}>
            {/* 标题 */}
            <text x={width / 2} y={18} textAnchor="middle"
                fontSize={12} fontWeight={600} fill="var(--text-primary)">
                {title}
            </text>

            {/* 热力图格子 */}
            {grid.map((row, pi) =>
                row.map((val, ti) => (
                    <rect
                        key={`${pi}-${ti}`}
                        x={margin.left + ti * cellW}
                        y={margin.top + pi * cellH}
                        width={cellW + 0.5}
                        height={cellH + 0.5}
                        fill={intensityToColor(val)}
                        rx={1}
                    >
                        <title>位置: {pi}km, 时段: {ti}, 强度: {val.toFixed(2)}</title>
                    </rect>
                ))
            )}

            {/* Y 轴标签 */}
            <text x={margin.left - 8} y={margin.top + plotH / 2}
                textAnchor="end" fontSize={10} fill="var(--text-secondary)"
                transform={`rotate(-90, ${margin.left - 24}, ${margin.top + plotH / 2})`}>
                位置 (km)
            </text>
            {[0, Math.floor(positionBins / 2), positionBins - 1].map(pi => (
                <text key={pi} x={margin.left - 4} y={margin.top + pi * cellH + cellH / 2 + 3}
                    textAnchor="end" fontSize={9} fill="var(--text-muted)">
                    {pi}
                </text>
            ))}

            {/* X 轴标签 */}
            {[0, Math.floor(timeBins / 2), timeBins - 1].map(ti => (
                <text key={ti} x={margin.left + ti * cellW + cellW / 2}
                    y={height - margin.bottom + 14}
                    textAnchor="middle" fontSize={9} fill="var(--text-muted)">
                    T{ti}
                </text>
            ))}

            {/* 图例 */}
            <defs>
                <linearGradient id="heatGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(240,20,20,0.9)" />
                    <stop offset="50%" stopColor="rgba(250,200,30,0.7)" />
                    <stop offset="100%" stopColor="rgba(30,60,120,0.2)" />
                </linearGradient>
            </defs>
            <rect x={width - margin.right + 10} y={margin.top} width={12} height={plotH}
                fill="url(#heatGrad)" rx={3} />
            <text x={width - margin.right + 30} y={margin.top + 8}
                fontSize={8} fill="var(--text-muted)">高</text>
            <text x={width - margin.right + 30} y={margin.top + plotH}
                fontSize={8} fill="var(--text-muted)">低</text>
        </svg>
    );
}
