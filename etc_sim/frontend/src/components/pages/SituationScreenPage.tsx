import { useEffect, useState } from 'react';
import { API } from '../../config/api';
import { ScreenMapStage, type ScreenRoadData } from '../screen/ScreenMapStage';
import { ScreenMetricCard } from '../screen/ScreenMetricCard';
import { ScreenPanel } from '../screen/ScreenPanel';
import { useI18nStore } from '../../stores/i18nStore';
import { useSimStore } from '../../stores/simStore';

type RoadFile = {
    filename: string;
    updated_at: number;
    size: number;
    total_length_km?: number | null;
    num_gantries?: number | null;
};

type RoadData = ScreenRoadData & {
    meta?: {
        total_length_km?: number;
        scale_m_per_unit?: number;
        num_gantries?: number;
    };
};

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
        <div className="screen-shell h-full overflow-hidden text-[var(--text-primary)]">
            <div className="flex h-full flex-col">
                <header className="screen-header-bar px-6 py-4">
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
                                <ScreenMetricCard
                                    key={item.label}
                                    label={item.label}
                                    value={item.value}
                                    unit={item.unit}
                                />
                            ))}
                        </div>

                        <ScreenPanel className="relative min-h-0 flex-1 overflow-hidden p-0">
                            <div className="absolute left-4 top-4 z-10 flex items-center gap-3">
                                <div className="screen-chip rounded-full px-3 py-1 text-xs">
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

                            <div className="screen-map-overlay absolute inset-0" />

                            {loading ? (
                                <div className="flex h-full items-center justify-center text-sm text-cyan-200/70">
                                    正在加载路网数据...
                                </div>
                            ) : (
                                <ScreenMapStage
                                    roadData={roadData}
                                    selectedGantryId={selectedGantryId}
                                    onSelectGantry={setSelectedGantryId}
                                />
                            )}
                        </ScreenPanel>
                    </section>

                    <aside className="flex w-[360px] shrink-0 flex-col gap-4">
                        <ScreenPanel
                            title="路网概览"
                            aside={<span className="text-xs text-cyan-300/70">更新于 {formatTimestamp(selectedRoadMeta?.updated_at)}</span>}
                        >
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
                        </ScreenPanel>

                        <ScreenPanel
                            title="重点门架"
                            aside={<span className="text-xs text-cyan-300/70">{roadData?.gantries.length ?? 0} 个</span>}
                            className="min-h-[240px]"
                        >
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
                        </ScreenPanel>

                        <ScreenPanel
                            title="详情卡"
                            aside={<span className="text-xs text-cyan-300/70">Stage 1</span>}
                            className="flex-1"
                        >
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
                        </ScreenPanel>
                    </aside>
                </div>
            </div>
        </div>
    );
}
