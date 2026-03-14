import { useMemo } from 'react';

export type ScreenRoadNode = {
    x: number;
    y: number;
};

export type ScreenGantry = {
    id: string;
    x: number;
    y: number;
    name?: string;
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
    onSelectGantry: (id: string) => void;
};

export function ScreenMapStage({
    roadData,
    selectedGantryId,
    onSelectGantry,
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
        const padX = width * 0.1 + 30;
        const padY = height * 0.14 + 30;

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

    return (
        <svg
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            className="h-full w-full"
            preserveAspectRatio="xMidYMid meet"
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
                return (
                    <g
                        key={gantry.id}
                        className="cursor-pointer"
                        onClick={() => onSelectGantry(gantry.id)}
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
                            y={gantry.y - (index % 2 === 0 ? 44 : -20)}
                            width="68"
                            height="18"
                            rx="4"
                            fill="rgba(3,16,38,0.92)"
                            stroke={active ? '#ffd166' : 'rgba(88,186,255,0.45)'}
                        />
                        <text
                            x={gantry.x}
                            y={gantry.y - (index % 2 === 0 ? 31 : -32)}
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
        </svg>
    );
}
