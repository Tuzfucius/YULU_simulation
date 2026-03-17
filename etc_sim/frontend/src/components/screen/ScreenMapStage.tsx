import { useMemo } from 'react';
import type { GantryTrafficProfile } from './ScreenTrafficProfilePanel';

export type ScreenRoadNode = {
    x: number;
    y: number;
};

export type ScreenGantry = {
    id: string;
    x: number;
    y: number;
    name?: string;
    segment?: number;
    positionKm?: number;
    positionM?: number;
};

export type ScreenRamp = {
    id: string;
    type: 'on_ramp' | 'off_ramp';
    x: number;
    y: number;
    flowRate?: number;
    totalVehicles?: number;
};

export type ScreenRoadData = {
    nodes: ScreenRoadNode[];
    gantries: ScreenGantry[];
    ramps?: ScreenRamp[];
};

type ScreenMapStageProps = {
    roadData: ScreenRoadData | null;
    selectedGantryId: string | null;
    hoveredGantryId?: string | null;
    trafficProfiles?: Record<string, GantryTrafficProfile>;
    onSelectGantry: (id: string) => void;
    onHoverGantry?: (id: string | null) => void;
};

export function ScreenMapStage({
    roadData,
    selectedGantryId,
    hoveredGantryId,
    trafficProfiles,
    onSelectGantry,
    onHoverGantry,
}: ScreenMapStageProps) {
    const geometry = useMemo(() => {
        if (!roadData || roadData.nodes.length < 2) return null;

        const allPoints = [...roadData.nodes, ...roadData.gantries, ...(roadData.ramps ?? [])];
        const xs = allPoints.map(point => point.x);
        const ys = allPoints.map(point => point.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const width = Math.max(1, maxX - minX);
        const height = Math.max(1, maxY - minY);
        const padX = width * 0.14 + 40;
        const padY = height * 0.18 + 40;

        const toPoint = (point: { x: number; y: number }) => ({
            x: point.x - minX + padX,
            y: point.y - minY + padY,
        });

        return {
            width: width + padX * 2,
            height: height + padY * 2,
            roadPath: roadData.nodes.map(toPoint),
            gantries: roadData.gantries.map(gantry => ({ ...gantry, ...toPoint(gantry) })),
            ramps: (roadData.ramps ?? []).map(ramp => ({ ...ramp, ...toPoint(ramp) })),
        };
    }, [roadData]);

    if (!geometry) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
                请先在路径编辑器中创建并选择一条自定义路网
            </div>
        );
    }

    const roadPathData = geometry.roadPath
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
        .join(' ');

    const hoveredGantry = hoveredGantryId
        ? geometry.gantries.find(gantry => gantry.id === hoveredGantryId) ?? null
        : null;
    const hoveredProfile = hoveredGantry ? (trafficProfiles?.[hoveredGantry.id] ?? null) : null;

    const toSparklinePath = (values: number[], x: number, y: number, width: number, height: number) => {
        if (values.length === 0) return '';
        if (values.length === 1) {
            const midY = y + height / 2;
            return `M ${x} ${midY} L ${x + width} ${midY}`;
        }

        const minValue = Math.min(...values);
        const maxValue = Math.max(...values);
        const range = Math.max(1, maxValue - minValue);

        return values
            .map((value, index) => {
                const ratioX = index / (values.length - 1);
                const ratioY = (value - minValue) / range;
                const px = x + ratioX * width;
                const py = y + (1 - ratioY) * height;
                return `${index === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
            })
            .join(' ');
    };

    const tooltipWidth = 220;
    const tooltipHeight = 126;
    const tooltipX = hoveredGantry
        ? Math.min(Math.max(12, hoveredGantry.x + 18), geometry.width - tooltipWidth - 12)
        : 0;
    const tooltipY = hoveredGantry
        ? Math.min(Math.max(12, hoveredGantry.y - tooltipHeight - 14), geometry.height - tooltipHeight - 12)
        : 0;
    const flowSeries = hoveredProfile?.series.map(point => point.flow) ?? [];
    const speedSeries = hoveredProfile?.series.map(point => point.avgSpeed) ?? [];
    const flowPath = toSparklinePath(flowSeries, tooltipX + 14, tooltipY + 56, tooltipWidth - 28, 24);
    const speedPath = toSparklinePath(speedSeries, tooltipX + 14, tooltipY + 92, tooltipWidth - 28, 20);

    return (
        <svg
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            className="h-full w-full"
            preserveAspectRatio="xMidYMid meet"
            onMouseLeave={() => onHoverGantry?.(null)}
        >
            <defs>
                <linearGradient id="screen-road-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#59d3ff" />
                    <stop offset="55%" stopColor="#4f83ff" />
                    <stop offset="100%" stopColor="#7ef9ff" />
                </linearGradient>
                <filter id="screen-road-glow">
                    <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                    <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            <rect width={geometry.width} height={geometry.height} fill="#020812" />

            {Array.from({ length: 9 }).map((_, idx) => (
                <line
                    key={`grid-h-${idx}`}
                    x1="0"
                    y1={(geometry.height / 8) * idx}
                    x2={geometry.width}
                    y2={(geometry.height / 8) * idx}
                    stroke="rgba(77,149,255,0.08)"
                    strokeWidth="1"
                />
            ))}

            {Array.from({ length: 13 }).map((_, idx) => (
                <line
                    key={`grid-v-${idx}`}
                    x1={(geometry.width / 12) * idx}
                    y1="0"
                    x2={(geometry.width / 12) * idx}
                    y2={geometry.height}
                    stroke="rgba(77,149,255,0.06)"
                    strokeWidth="1"
                />
            ))}

            <path
                d={roadPathData}
                stroke="rgba(73,142,255,0.24)"
                strokeWidth="18"
                fill="none"
                strokeLinecap="round"
                filter="url(#screen-road-glow)"
            />
            <path
                d={roadPathData}
                stroke="url(#screen-road-gradient)"
                strokeWidth="5"
                fill="none"
                strokeLinecap="round"
            />

            {geometry.roadPath.map((point, index) => {
                if (index !== 0 && index !== geometry.roadPath.length - 1 && index % 2 !== 0) return null;
                return (
                    <circle
                        key={`road-point-${index}`}
                        cx={point.x}
                        cy={point.y}
                        r={index === 0 || index === geometry.roadPath.length - 1 ? 7 : 4}
                        fill={index === 0 ? '#4fe0ff' : index === geometry.roadPath.length - 1 ? '#ff8f6b' : '#b4d8ff'}
                    />
                );
            })}

            {geometry.gantries.map((gantry, index) => {
                const active = gantry.id === selectedGantryId;
                const labelY = gantry.y - (index % 2 === 0 ? 31 : -32);
                const rectY = gantry.y - (index % 2 === 0 ? 44 : -20);

                return (
                    <g
                        key={gantry.id}
                        className="cursor-pointer"
                        onClick={() => onSelectGantry(gantry.id)}
                        onMouseEnter={() => onHoverGantry?.(gantry.id)}
                        onFocus={() => onHoverGantry?.(gantry.id)}
                        onBlur={() => onHoverGantry?.(null)}
                        tabIndex={0}
                        role="button"
                        aria-label={`查看 ${gantry.name || gantry.id} 门架流量详情`}
                    >
                        <line
                            x1={gantry.x}
                            y1={gantry.y - 26}
                            x2={gantry.x}
                            y2={gantry.y + 26}
                            stroke={active ? '#ffd166' : 'rgba(130,200,255,0.85)'}
                            strokeDasharray="4 4"
                        />
                        <circle
                            cx={gantry.x}
                            cy={gantry.y}
                            r={active ? 9 : 7}
                            fill={active ? '#ff9f43' : '#57d2ff'}
                            stroke="#dbf3ff"
                            strokeWidth="1.5"
                        />
                        <rect
                            x={gantry.x - 34}
                            y={rectY}
                            width="68"
                            height="18"
                            rx="4"
                            fill="rgba(3,16,38,0.92)"
                            stroke={active ? '#ffd166' : 'rgba(88,186,255,0.45)'}
                        />
                        <text
                            x={gantry.x}
                            y={labelY}
                            textAnchor="middle"
                            fill={active ? '#ffd166' : '#9fd8ff'}
                            fontSize="10"
                        >
                            {gantry.name || gantry.id}
                        </text>
                    </g>
                );
            })}

            {geometry.ramps.map(ramp => (
                <g key={ramp.id}>
                    <circle
                        cx={ramp.x}
                        cy={ramp.y}
                        r="6"
                        fill={ramp.type === 'on_ramp' ? '#53ffa8' : '#ff7d7d'}
                        stroke="#d6f3ff"
                        strokeWidth="1.5"
                    />
                    <text
                        x={ramp.x + 10}
                        y={ramp.y - 10}
                        fill="rgba(211,237,255,0.85)"
                        fontSize="10"
                    >
                        {ramp.type === 'on_ramp' ? '入口' : '出口'}
                    </text>
                </g>
            ))}

            {hoveredGantry ? (
                <g pointerEvents="none">
                    <rect
                        x={tooltipX}
                        y={tooltipY}
                        width={tooltipWidth}
                        height={tooltipHeight}
                        rx="10"
                        fill="rgba(2, 10, 24, 0.93)"
                        stroke="rgba(103, 232, 249, 0.35)"
                    />
                    <text x={tooltipX + 14} y={tooltipY + 24} fill="#d8f4ff" fontSize="12" fontWeight="600">
                        {hoveredGantry.name || hoveredGantry.id}
                    </text>
                    <text x={tooltipX + 14} y={tooltipY + 40} fill="rgba(186,230,253,0.68)" fontSize="10">
                        {hoveredProfile?.segmentLabel || '无区间映射'}
                    </text>
                    <text x={tooltipX + 14} y={tooltipY + 52} fill="rgba(103,232,249,0.7)" fontSize="9">
                        流量时序
                    </text>
                    <path d={flowPath} stroke="#22d3ee" strokeWidth="2" fill="none" strokeLinecap="round" />
                    <text x={tooltipX + 14} y={tooltipY + 88} fill="rgba(251,191,36,0.75)" fontSize="9">
                        速度时序
                    </text>
                    <path d={speedPath} stroke="#fbbf24" strokeWidth="2" fill="none" strokeLinecap="round" />
                    <text x={tooltipX + tooltipWidth - 14} y={tooltipY + 112} textAnchor="end" fill="rgba(186,230,253,0.65)" fontSize="9">
                        点位 {hoveredProfile?.series.length ?? 0}
                    </text>
                </g>
            ) : null}
        </svg>
    );
}
