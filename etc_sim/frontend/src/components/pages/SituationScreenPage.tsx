import { useEffect, useMemo, useState } from 'react';
import { API } from '../../config/api';
import { useI18nStore } from '../../stores/i18nStore';
import { useSimStore } from '../../stores/simStore';
import { ScreenAlertList, type ScreenAlertRecord } from '../screen/ScreenAlertList';
import { ScreenHeader } from '../screen/ScreenHeader';
import { ScreenIncidentDetail } from '../screen/ScreenIncidentDetail';
import { ScreenMapStage, type ScreenRoadData } from '../screen/ScreenMapStage';
import { ScreenMetricCard } from '../screen/ScreenMetricCard';
import { ScreenPanel } from '../screen/ScreenPanel';
import { ScreenSummaryTile } from '../screen/ScreenSummaryTile';

type RoadFile = {
    filename: string;
    updated_at: number;
    size: number;
    total_length_km?: number | null;
    num_gantries?: number | null;
};

type OutputFile = {
    name: string;
    path: string;
    size: number;
    modified: string;
    extension: string;
    meta?: Record<string, unknown>;
};

type RoadData = ScreenRoadData & {
    meta?: {
        total_length_km?: number;
        scale_m_per_unit?: number;
        num_gantries?: number;
    };
};

type SimulationDataset = {
    config?: Record<string, unknown>;
    statistics?: Record<string, unknown>;
    anomaly_logs?: Array<Record<string, unknown>>;
    etcGates?: Array<Record<string, unknown>>;
    metadata?: Record<string, unknown>;
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

function getNumericValue(...values: unknown[]) {
    for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'string') {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
    }
    return null;
}

export function SituationScreenPage() {
    const { lang } = useI18nStore();
    const { config, statistics } = useSimStore();
    const [roadFiles, setRoadFiles] = useState<RoadFile[]>([]);
    const [selectedRoadFile, setSelectedRoadFile] = useState<string>(config.customRoadPath || '');
    const [historyFiles, setHistoryFiles] = useState<OutputFile[]>([]);
    const [selectedHistoryPath, setSelectedHistoryPath] = useState('');
    const [historyData, setHistoryData] = useState<SimulationDataset | null>(null);
    const [roadData, setRoadData] = useState<RoadData | null>(null);
    const [loading, setLoading] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
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
        const loadHistoryFiles = async () => {
            try {
                const response = await fetch('/api/files/output-files');
                if (!response.ok) return;
                const payload = await response.json();
                const files: OutputFile[] = (payload.files || []).filter((file: OutputFile) => file.extension === '.json');
                setHistoryFiles(files);
                if (!selectedHistoryPath && files.length > 0) {
                    const preferred = files.find(file => file.name === 'data.json') ?? files[0];
                    setSelectedHistoryPath(preferred.path);
                }
            } catch (error) {
                console.error('Failed to load history files', error);
            }
        };

        loadHistoryFiles();
    }, [selectedHistoryPath]);

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

    useEffect(() => {
        if (!selectedHistoryPath) {
            setHistoryData(null);
            return;
        }

        const loadHistoryData = async () => {
            setHistoryLoading(true);
            try {
                const response = await fetch(`/api/files/output-file?path=${encodeURIComponent(selectedHistoryPath)}`);
                if (!response.ok) return;
                const result = await response.json();
                if (result.type === 'json' && result.data) {
                    setHistoryData(result.data as SimulationDataset);
                }
            } catch (error) {
                console.error('Failed to load history json', error);
            } finally {
                setHistoryLoading(false);
            }
        };

        loadHistoryData();
    }, [selectedHistoryPath]);

    const selectedRoadMeta = roadFiles.find(file => file.filename === selectedRoadFile);
    const selectedHistoryMeta = historyFiles.find(file => file.path === selectedHistoryPath) || null;
    const selectedGantry = roadData?.gantries.find(gantry => gantry.id === selectedGantryId) || null;
    const statMap = (historyData?.statistics as Record<string, unknown> | undefined)
        ?? (statistics as Record<string, unknown> | null)
        ?? null;

    const alertRecords = useMemo<ScreenAlertRecord[]>(() => {
        const anomalyLogs = historyData?.anomaly_logs ?? [];
        if (anomalyLogs.length > 0) {
            return anomalyLogs.slice(0, 8).map((log, index) => {
                const gateId = String(log.gate_id ?? log.gantry_id ?? log.segment ?? `A${index + 1}`);
                const level = index === 0 ? 'high' : index < 3 ? 'medium' : 'low';
                const timeValue = log.time ?? log.timestamp ?? log.start_time ?? `T+${(index + 1) * 2} min`;
                return {
                    id: gateId,
                    title: String(log.type_name ?? log.description ?? log.event ?? `异常事件 ${index + 1}`),
                    level,
                    timeLabel: String(timeValue),
                    locationLabel: `门架 ${gateId}`,
                };
            });
        }

        return (roadData?.gantries ?? []).map((gantry, index) => {
            const level = index === 0 ? 'high' : index < 3 ? 'medium' : 'low';
            return {
                id: gantry.id,
                title: `${gantry.name || gantry.id} 状态预警`,
                level,
                timeLabel: `T+${(index + 1) * 2} min`,
                locationLabel: `门架 ${gantry.id}`,
            };
        });
    }, [historyData?.anomaly_logs, roadData]);

    const selectedAlert = alertRecords.find(alert => alert.id === selectedGantryId) || null;
    const activeStats = {
        avgSpeed: getMetricValue(statMap?.avgSpeed, '--'),
        activeVehicles: getMetricValue(statMap?.activeVehicles ?? statMap?.total_vehicles, config.totalVehicles),
        totalAlerts: getMetricValue(statMap?.etc_alerts_count ?? historyData?.anomaly_logs?.length, roadData?.gantries.length ?? 0),
        roadLength: getMetricValue(
            roadData?.meta?.total_length_km
            ?? selectedRoadMeta?.total_length_km
            ?? historyData?.config?.custom_road_length_km
            ?? historyData?.config?.road_length_km,
            config.roadLengthKm
        ),
    };

    const roadLengthValue = getNumericValue(
        roadData?.meta?.total_length_km,
        selectedRoadMeta?.total_length_km,
        historyData?.config?.custom_road_length_km,
        historyData?.config?.road_length_km,
        config.roadLengthKm
    );
    const avgSpeedValue = getNumericValue(statMap?.avgSpeed);
    const laneCountValue = getNumericValue(historyData?.config?.num_lanes, config.numLanes);
    const simulationTimeValue = getNumericValue(
        statMap?.simulationTime,
        statMap?.simulation_time,
        historyData?.statistics?.simulationTime,
        historyData?.statistics?.simulation_time
    );
    const estimatedMinutes = roadLengthValue && avgSpeedValue && avgSpeedValue > 0
        ? (roadLengthValue / avgSpeedValue) * 60
        : null;
    const rightSummaryItems = [
        {
            label: '区间距离',
            value: roadLengthValue ? `${roadLengthValue.toFixed(1)} km` : '--',
            hint: '按当前导入路网计算',
        },
        {
            label: '仿真车道',
            value: laneCountValue ? `${laneCountValue}` : '--',
            hint: '来自历史 JSON 或当前配置',
        },
        {
            label: '建议驶出时间',
            value: estimatedMinutes ? `${Math.max(1, Math.round(estimatedMinutes))} 分钟` : '--',
            hint: '根据路长与平均速度估算',
        },
        {
            label: '仿真时长',
            value: simulationTimeValue ? `${Math.round(simulationTimeValue)} 秒` : '--',
            hint: '历史数据优先',
        },
    ];

    const historySummaryItems = [
        {
            label: '总车辆数',
            value: getMetricValue(statMap?.total_vehicles ?? statMap?.activeVehicles, '--'),
            hint: '历史运行统计',
        },
        {
            label: 'ETC 交易数',
            value: getMetricValue(statMap?.etc_transactions_count, '--'),
            hint: '来自历史记录',
        },
        {
            label: '规则告警数',
            value: getMetricValue(statMap?.etc_alerts_count ?? historyData?.anomaly_logs?.length, '--'),
            hint: '异常与告警综合',
        },
        {
            label: '平均速度',
            value: avgSpeedValue ? `${avgSpeedValue.toFixed(1)} km/h` : '--',
            hint: '历史统计优先',
        },
        {
            label: '仿真时长',
            value: simulationTimeValue ? `${Math.round(simulationTimeValue)} 秒` : '--',
            hint: '运行总时长',
        },
        {
            label: '当前选中门架',
            value: selectedGantry?.name || selectedGantry?.id || '--',
            hint: '与详情卡联动',
        },
    ];

    return (
        <div className="screen-shell h-full overflow-hidden text-[var(--text-primary)]">
            <div className="flex h-full flex-col">
                <ScreenHeader
                    title={lang === 'en' ? 'Highway Situation Screen' : '高速态势感知大屏'}
                    subtitle="Expressway Screen"
                    selectedRoadFile={selectedRoadFile || '未选择路网'}
                    timestampLabel={new Date().toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                    })}
                />

                <div className="flex min-h-0 flex-1 gap-4 p-4">
                    <section className="flex min-w-0 flex-1 flex-col gap-4">
                        <div className="grid grid-cols-4 gap-3">
                            {[
                                { label: '路网长度', value: activeStats.roadLength, unit: 'km' },
                                { label: '平均速度', value: activeStats.avgSpeed, unit: 'km/h' },
                                { label: '在途车辆', value: activeStats.activeVehicles, unit: '辆' },
                                { label: '异常数量', value: activeStats.totalAlerts, unit: '条' },
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
                                <select
                                    value={selectedHistoryPath}
                                    onChange={(event) => setSelectedHistoryPath(event.target.value)}
                                    className="max-w-[320px] rounded-full border border-cyan-300/20 bg-[rgba(2,10,24,0.92)] px-3 py-1.5 text-xs text-cyan-50 outline-none"
                                >
                                    {historyFiles.length === 0 && <option value="">暂无历史 JSON</option>}
                                    {historyFiles.map(file => (
                                        <option key={file.path} value={file.path}>
                                            {file.path}
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

                        <ScreenPanel
                            title="历史统计详情"
                            aside={<span className="text-xs text-cyan-300/70">地图下方联动区域</span>}
                            className="shrink-0 min-h-[320px]"
                        >
                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr_1fr]">
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-3">
                                        {historySummaryItems.map(item => (
                                            <ScreenSummaryTile
                                                key={item.label}
                                                label={item.label}
                                                value={item.value}
                                                hint={item.hint}
                                            />
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 text-sm text-cyan-50/85">
                                        <div className="rounded-2xl border border-cyan-400/10 bg-[rgba(2,10,24,0.5)] px-4 py-3">
                                            <div className="text-xs text-cyan-300/65">历史数据文件</div>
                                            <div className="mt-2 truncate">{selectedHistoryMeta?.path ?? '--'}</div>
                                        </div>
                                        <div className="rounded-2xl border border-cyan-400/10 bg-[rgba(2,10,24,0.5)] px-4 py-3">
                                            <div className="text-xs text-cyan-300/65">异常记录条数</div>
                                            <div className="mt-2">{historyData?.anomaly_logs?.length ?? 0}</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="min-h-[260px] rounded-2xl border border-cyan-400/10 bg-[rgba(2,10,24,0.5)] p-3">
                                    <div className="mb-3 flex items-center justify-between">
                                        <span className="text-sm text-cyan-100">异常态势</span>
                                        <span className="text-xs text-cyan-300/70">{alertRecords.length} 条</span>
                                    </div>
                                    <ScreenAlertList
                                        alerts={alertRecords}
                                        selectedAlertId={selectedGantryId}
                                        onSelectAlert={setSelectedGantryId}
                                    />
                                </div>

                                <div className="min-h-[260px] rounded-2xl border border-cyan-400/10 bg-[rgba(2,10,24,0.5)] p-3">
                                    <div className="mb-3 flex items-center justify-between">
                                        <span className="text-sm text-cyan-100">事件详情</span>
                                        <span className="text-xs text-cyan-300/70">历史模式</span>
                                    </div>
                                    <ScreenIncidentDetail
                                        gantry={selectedGantry}
                                        alert={selectedAlert}
                                    />
                                </div>
                            </div>
                        </ScreenPanel>
                    </section>

                    <aside className="relative z-10 flex min-h-0 w-[360px] shrink-0 flex-col gap-4 overflow-y-auto pr-1">
                        <ScreenPanel
                            title="路网概览"
                            aside={<span className="text-xs text-cyan-300/70">更新于 {formatTimestamp(selectedRoadMeta?.updated_at)}</span>}
                            className="shrink-0"
                        >
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between gap-4 text-cyan-50/85">
                                    <span className="text-cyan-300/65">历史数据</span>
                                    <span className="max-w-[180px] truncate">{selectedHistoryMeta?.path ?? '--'}</span>
                                </div>
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
                                    <span>{historyData?.config?.num_lanes ?? config.numLanes}</span>
                                </div>
                                {historyLoading ? <div className="text-xs text-cyan-300/65">正在载入历史数据...</div> : null}
                            </div>
                        </ScreenPanel>

                        <ScreenPanel
                            title="区间态势"
                            aside={<span className="text-xs text-cyan-300/70">历史统计映射</span>}
                            className="shrink-0"
                        >
                            <div className="grid grid-cols-2 gap-3">
                                {rightSummaryItems.map(item => (
                                    <ScreenSummaryTile
                                        key={item.label}
                                        label={item.label}
                                        value={item.value}
                                        hint={item.hint}
                                    />
                                ))}
                            </div>
                        </ScreenPanel>
                    </aside>
                </div>
            </div>
        </div>
    );
}
