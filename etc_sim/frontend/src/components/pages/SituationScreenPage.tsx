import { useEffect, useMemo, useState } from 'react';
import { API } from '../../config/api';
import { ScreenAlertList, type ScreenAlertRecord } from '../screen/ScreenAlertList';
import { ScreenHeader } from '../screen/ScreenHeader';
import { ScreenIncidentDetail } from '../screen/ScreenIncidentDetail';
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
    const alertRecords = useMemo<ScreenAlertRecord[]>(() => {
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
    }, [roadData]);
    const selectedAlert = alertRecords.find(alert => alert.id === selectedGantryId) || null;
    const activeStats = {
        avgSpeed: getMetricValue(statMap?.avgSpeed, '--'),
        activeVehicles: getMetricValue(statMap?.activeVehicles, config.totalVehicles),
        totalAlerts: getMetricValue(statMap?.etc_alerts_count, roadData?.gantries.length ?? 0),
        roadLength: getMetricValue(roadData?.meta?.total_length_km ?? selectedRoadMeta?.total_length_km, config.roadLengthKm),
    };

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
                            title="异常态势"
                            aside={<span className="text-xs text-cyan-300/70">{alertRecords.length} 条</span>}
                            className="min-h-[240px]"
                        >
                            <ScreenAlertList
                                alerts={alertRecords}
                                selectedAlertId={selectedGantryId}
                                onSelectAlert={setSelectedGantryId}
                            />
                        </ScreenPanel>

                        <ScreenPanel
                            title="详情卡"
                            aside={<span className="text-xs text-cyan-300/70">Stage 1</span>}
                            className="flex-1"
                        >
                            <ScreenIncidentDetail
                                gantry={selectedGantry}
                                alert={selectedAlert}
                            />
                        </ScreenPanel>
                    </aside>
                </div>
            </div>
        </div>
    );
}
