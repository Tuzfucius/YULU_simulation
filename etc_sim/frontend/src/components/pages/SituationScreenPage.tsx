import { useEffect, useMemo, useState } from 'react';
import { API } from '../../config/api';
import { useI18nStore } from '../../stores/i18nStore';
import { useSimStore } from '../../stores/simStore';

type RoadFile = {
    filename: string;
    updated_at: number;
    size: number;
    total_length_km?: number | null;
    num_gantries?: number | null;
};

type RoadNode = {
    x: number;
    y: number;
};

type Gantry = {
    id: string;
    x: number;
    y: number;
    name?: string;
};

type Ramp = {
    id: string;
    type: 'on_ramp' | 'off_ramp';
    x: number;
    y: number;
    flowRate?: number;
    totalVehicles?: number;
};

type RoadData = {
    nodes: RoadNode[];
    gantries: Gantry[];
    ramps?: Ramp[];
    meta?: {
        total_length_km?: number;
        scale_m_per_unit?: number;
        num_gantries?: number;
    };
};

const panelClass =
    'rounded-2xl border border-[var(--glass-border)] bg-[rgba(8,15,28,0.82)] shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-md';

function formatTimestamp(epochSeconds?: number) {
    if (!epochSeconds) return '--';
    return new Date(epochSeconds * 1000).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function getMetricValue(input: unknown, fallback: string | number = '--') {
    if (typeof input === 'number' && Number.isFinite(input)) {
        return input.toLocaleString();
    }
    if (typeof input === 'string' && input.trim()) {
        return input;
    }
    return typeof fallback === 'number' ? fallback.toLocaleString() : fallback;
}

function ScreenMap({
    roadData,
    selectedGantryId,
    onSelectGantry,
}: {
    roadData: RoadData | null;
    selectedGantryId: string | null;
    onSelectGantry: (id: string) => void;
}) {
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

export function SituationScreenPage() {
    const { lang } = useI18nStore();
    const { config, statistics } = useSimStore();
    const [roadFiles, setRoadFiles] = useState<RoadFile[]>([]);
    const [selectedRoadFile, setSelectedRoadFile] = useState<string>(config.customRoadPath || '');
    const [roadData, setRoadData] = useState<RoadData | null>(null);
    const [loading, setLoading] = useState(false);
    const [selectedGantryId, setSelectedGantryId] = useState<string | null>(null);

    useEffect(() => {
        const loadRoadFiles = async () => {
            try {
                const response = await fetch(`${API.BASE}/custom-roads/`);
                if (!response.ok) return;
                const files: RoadFile[] = await response.json();
                setRoadFiles(files);
                if (!selectedRoadFile && files.length > 0) {
                    const preferred = config.customRoadPath ? files.find(file => file.filename === config.customRoadPath) : undefined;
                    const nextFile = preferred ?? files[0];
                    setSelectedRoadFile(nextFile.filename);
                }
            } catch (error) {
                console.error('Failed to load road files', error);
            }
        };

        loadRoadFiles();
    }, [config.customRoadPath, selectedRoadFile]);

    useEffect(() => {
        if (!selectedRoadFile) {
            setRoadData(null);
            return;
        }

        const loadRoadData = async () => {
            setLoading(true);
            try {
                const response = await fetch(`${API.BASE}/custom-roads/${selectedRoadFile}`);
                if (!response.ok) return;
                const data: RoadData = await response.json();
                setRoadData(data);
                setSelectedGantryId(data.gantries?.[0]?.id || null);
            } catch (error) {
                console.error('Failed to load road data', error);
            } finally {
                setLoading(false);
            }
        };

        loadRoadData();
    }, [selectedRoadFile]);

    const selectedRoadMeta = roadFiles.find(file => file.filename === selectedRoadFile);
    const selectedGantry = roadData?.gantries.find(gantry => gantry.id === selectedGantryId) || null;
    const statMap = statistics as Record<string, unknown> | null;
    const activeStats = {
        avgSpeed: getMetricValue(statMap?.avgSpeed, '--'),
        activeVehicles: getMetricValue(statMap?.activeVehicles, config.totalVehicles),
        totalAlerts: getMetricValue(statMap?.etc_alerts_count, roadData?.gantries.length ?? 0),
        roadLength: getMetricValue(roadData?.meta?.total_length_km ?? selectedRoadMeta?.total_length_km, config.roadLengthKm),
    };

    return (
        <div className="h-full overflow-hidden bg-[#030913] text-[var(--text-primary)]">
            <div className="flex h-full flex-col">
                <header className="border-b border-[rgba(78,154,255,0.25)] bg-[linear-gradient(180deg,rgba(4,18,45,0.98),rgba(2,11,26,0.94))] px-6 py-4 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">Expressway Screen</div>
                            <h1 className="mt-1 text-3xl font-semibold tracking-[0.18em] text-cyan-200">
                                {lang === 'en' ? 'Highway Situation Screen' : '高速态势感知大屏'}
                            </h1>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-cyan-100/85">
                            <div className="rounded-full border border-cyan-400/30 px-4 py-1.5">
                                {selectedRoadFile || '未选择路网'}
                            </div>
                            <div className="rounded-full border border-cyan-400/20 px-4 py-1.5">
                                {new Date().toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN', {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                })}
                            </div>
                        </div>
                    </div>
                </header>

                <div className="flex min-h-0 flex-1 gap-4 p-4">
                    <section className="flex min-w-0 flex-1 flex-col gap-4">
                        <div className="grid grid-cols-4 gap-3">
                            {[
                                { label: '路网长度', value: activeStats.roadLength, unit: 'km' },
                                { label: '平均速度', value: activeStats.avgSpeed, unit: 'km/h' },
                                { label: '在途车辆', value: activeStats.activeVehicles, unit: '辆' },
                                { label: '重点门架', value: activeStats.totalAlerts, unit: '处' },
                            ].map(item => (
                                <div key={item.label} className={`${panelClass} px-4 py-3`}>
                                    <div className="text-xs tracking-[0.22em] text-cyan-200/65">{item.label}</div>
                                    <div className="mt-2 flex items-end gap-2">
                                        <div className="text-3xl font-semibold text-cyan-100">{item.value}</div>
                                        <div className="pb-1 text-xs uppercase tracking-[0.22em] text-cyan-300/70">{item.unit}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className={`${panelClass} relative min-h-0 flex-1 overflow-hidden`}>
                            <div className="absolute left-4 top-4 z-10 flex items-center gap-3">
                                <div className="rounded-full border border-cyan-300/25 bg-[rgba(3,14,34,0.8)] px-3 py-1 text-xs text-cyan-100/85">
                                    地图主舞台
                                </div>
                                <select
                                    value={selectedRoadFile}
                                    onChange={(event) => setSelectedRoadFile(event.target.value)}
                                    className="rounded-full border border-cyan-300/20 bg-[rgba(2,10,24,0.92)] px-3 py-1.5 text-xs text-cyan-50 outline-none"
                                >
                                    {roadFiles.length === 0 && <option value="">暂无路网</option>}
                                    {roadFiles.map(file => (
                                        <option key={file.filename} value={file.filename}>
                                            {file.filename}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(31,101,224,0.16),transparent_30%),radial-gradient(circle_at_bottom,rgba(0,212,255,0.12),transparent_30%)]" />

                            {loading ? (
                                <div className="flex h-full items-center justify-center text-sm text-cyan-200/70">
                                    正在加载路网数据...
                                </div>
                            ) : (
                                <ScreenMap
                                    roadData={roadData}
                                    selectedGantryId={selectedGantryId}
                                    onSelectGantry={setSelectedGantryId}
                                />
                            )}
                        </div>
                    </section>

                    <aside className="flex w-[360px] shrink-0 flex-col gap-4">
                        <div className={`${panelClass} p-4`}>
                            <div className="mb-3 flex items-center justify-between">
                                <h2 className="text-sm font-medium tracking-[0.18em] text-cyan-100">路网概览</h2>
                                <span className="text-xs text-cyan-300/70">
                                    更新于 {formatTimestamp(selectedRoadMeta?.updated_at)}
                                </span>
                            </div>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between text-cyan-50/85">
                                    <span className="text-cyan-300/65">已选路径</span>
                                    <span>{selectedRoadFile || '--'}</span>
                                </div>
                                <div className="flex justify-between text-cyan-50/85">
                                    <span className="text-cyan-300/65">门架数量</span>
                                    <span>{roadData?.gantries.length ?? selectedRoadMeta?.num_gantries ?? 0}</span>
                                </div>
                                <div className="flex justify-between text-cyan-50/85">
                                    <span className="text-cyan-300/65">匝道数量</span>
                                    <span>{roadData?.ramps?.length ?? 0}</span>
                                </div>
                                <div className="flex justify-between text-cyan-50/85">
                                    <span className="text-cyan-300/65">仿真车道</span>
                                    <span>{config.numLanes}</span>
                                </div>
                            </div>
                        </div>

                        <div className={`${panelClass} min-h-[240px] p-4`}>
                            <div className="mb-3 flex items-center justify-between">
                                <h2 className="text-sm font-medium tracking-[0.18em] text-cyan-100">重点门架</h2>
                                <span className="text-xs text-cyan-300/70">{roadData?.gantries.length ?? 0} 个</span>
                            </div>
                            <div className="space-y-2 overflow-y-auto pr-1">
                                {(roadData?.gantries ?? []).map((gantry, index) => {
                                    const active = gantry.id === selectedGantryId;
                                    return (
                                        <button
                                            key={gantry.id}
                                            onClick={() => setSelectedGantryId(gantry.id)}
                                            className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                                                active
                                                    ? 'border-cyan-300/45 bg-cyan-400/12'
                                                    : 'border-[rgba(81,143,255,0.18)] bg-[rgba(4,13,30,0.72)] hover:bg-[rgba(8,28,56,0.9)]'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="text-sm font-medium text-cyan-50">
                                                    {gantry.name || gantry.id}
                                                </div>
                                                <div className="text-[10px] tracking-[0.2em] text-cyan-300/65">
                                                    G-{index + 1}
                                                </div>
                                            </div>
                                            <div className="mt-2 text-xs text-cyan-100/70">
                                                坐标 ({gantry.x.toFixed(0)}, {gantry.y.toFixed(0)})
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className={`${panelClass} flex-1 p-4`}>
                            <div className="mb-3 flex items-center justify-between">
                                <h2 className="text-sm font-medium tracking-[0.18em] text-cyan-100">详情卡</h2>
                                <span className="text-xs text-cyan-300/70">Stage 1</span>
                            </div>
                            {selectedGantry ? (
                                <div className="space-y-4">
                                    <div className="rounded-2xl border border-amber-300/35 bg-[linear-gradient(135deg,rgba(102,38,14,0.7),rgba(63,17,17,0.22))] p-4">
                                        <div className="text-xs tracking-[0.24em] text-amber-200/75">重点关注门架</div>
                                        <div className="mt-2 text-2xl font-semibold text-amber-100">
                                            {selectedGantry.name || selectedGantry.id}
                                        </div>
                                        <div className="mt-2 text-sm text-amber-50/80">
                                            该门架已接入地图主舞台联动，下一阶段将接入异常事件、时间窗口和区间速度详情。
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="rounded-xl border border-cyan-300/20 bg-[rgba(4,13,30,0.76)] p-3">
                                            <div className="text-xs text-cyan-300/65">门架坐标</div>
                                            <div className="mt-2 text-lg text-cyan-50">
                                                {selectedGantry.x.toFixed(0)} / {selectedGantry.y.toFixed(0)}
                                            </div>
                                        </div>
                                        <div className="rounded-xl border border-cyan-300/20 bg-[rgba(4,13,30,0.76)] p-3">
                                            <div className="text-xs text-cyan-300/65">关联状态</div>
                                            <div className="mt-2 text-lg text-cyan-50">在线</div>
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-cyan-300/20 bg-[rgba(4,13,30,0.76)] p-3">
                                        <div className="mb-2 text-xs text-cyan-300/65">后续接入计划</div>
                                        <ul className="space-y-2 text-sm text-cyan-50/80">
                                            <li>接入异常列表与门架联动</li>
                                            <li>接入区间速度散点图和时间窗</li>
                                            <li>接入中央事件详情弹层</li>
                                        </ul>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex h-full items-center justify-center text-sm text-cyan-200/65">
                                    选择一个门架查看详情
                                </div>
                            )}
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
}
