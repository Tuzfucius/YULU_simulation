import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    AreaChart,
    Area,
    BarChart,
    Bar,
} from 'recharts';

import type { DatasetInfo, HistoryRunItem, ModelInfo } from './WorkflowLibraryPanel';

type SegmentSeriesItem = {
    time: number;
    avg_speed: number;
    density: number;
    flow: number;
    vehicle_count: number;
};

type ReplayAnchor = {
    id: string;
    time: number;
    position: number;
    segment: string;
    event_type: string;
    label: string;
};

export interface RunAnalysisPayload {
    run_id: string;
    summary: {
        total_vehicles?: number;
        total_anomalies?: number;
        simulation_time?: number;
        etc_alerts_count?: number;
        etc_transactions_count?: number;
        ml_samples?: number;
        queue_event_count?: number;
        phantom_jam_event_count?: number;
    };
    charts: {
        speed_timeline: Array<{ time: number; avg_speed: number; avg_density: number; avg_flow: number; vehicle_count: number }>;
        segment_heatmap: Array<{ position: number; time: number; intensity: number }>;
        anomaly_timeline: Array<{ time: number; anomaly_count: number }>;
        event_breakdown: Array<{ name: string; value: number }>;
        segment_series?: Record<string, SegmentSeriesItem[]>;
        anomaly_type_breakdown?: Array<{ name: string; value: number }>;
    };
    meta: {
        time_bins: number;
        max_position: number;
        duration: number;
        anomaly_bucket_size: number;
        segment_options?: Array<{ key: string; label: string }>;
        default_segment?: string | null;
    };
    replay_anchors?: ReplayAnchor[];
}

interface WorkflowAnalysisViewProps {
    activeView: 'run' | 'model' | 'dataset' | 'workflow';
    run: HistoryRunItem | null;
    analysis: RunAnalysisPayload | null;
    model: ModelInfo | null;
    dataset: DatasetInfo | null;
}

type RunImageItem = {
    name: string;
    url: string;
};

function formatTime(value?: string | number) {
    if (value === undefined || value === null || value === '') {
        return '--';
    }
    if (typeof value === 'number') {
        return new Date(value * 1000).toLocaleString('zh-CN', { hour12: false });
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleString('zh-CN', { hour12: false });
}

function formatDuration(seconds?: number) {
    if (!seconds) {
        return '--';
    }
    if (seconds < 60) {
        return `${seconds.toFixed(0)} 秒`;
    }
    if (seconds < 3600) {
        return `${(seconds / 60).toFixed(1)} 分钟`;
    }
    return `${(seconds / 3600).toFixed(2)} 小时`;
}

function formatSize(size?: number) {
    if (!size) {
        return '--';
    }
    if (size < 1024) {
        return `${size} B`;
    }
    if (size < 1024 * 1024) {
        return `${(size / 1024).toFixed(1)} KB`;
    }
    return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function SummaryCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
    return (
        <div className="rounded-xl border border-[var(--glass-border)] bg-[rgba(255,255,255,0.03)] p-4">
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
            <div className="mt-2 text-2xl font-semibold" style={{ color: accent || 'var(--text-primary)' }}>
                {value}
            </div>
        </div>
    );
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
    return (
        <div className="flex h-full items-center justify-center px-10 text-center">
            <div className="max-w-xl space-y-3">
                <div className="text-xl font-semibold text-[var(--text-primary)]">{title}</div>
                <div className="text-sm leading-6 text-[var(--text-secondary)]">{description}</div>
            </div>
        </div>
    );
}

function SegmentHeatmapGrid({
    data,
    timeBins,
    maxPosition,
}: {
    data: RunAnalysisPayload['charts']['segment_heatmap'];
    timeBins: number;
    maxPosition: number;
}) {
    const positionBins = Math.max(1, Math.ceil(maxPosition));
    const matrix = useMemo(() => {
        const rows = Array.from({ length: positionBins }, () => Array.from({ length: Math.max(timeBins, 1) }, () => 0));
        data.forEach((item) => {
            const row = Math.min(positionBins - 1, Math.max(0, Math.floor(item.position)));
            const col = Math.min(Math.max(timeBins, 1) - 1, Math.max(0, Math.floor(item.time)));
            rows[row][col] = Math.max(rows[row][col], item.intensity);
        });
        return rows;
    }, [data, positionBins, timeBins]);

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                <span>区段拥堵热力</span>
                <span>颜色越亮表示速度越低</span>
            </div>
            <div className="overflow-auto rounded-xl border border-[var(--glass-border)] bg-[rgba(255,255,255,0.02)] p-3">
                <div className="grid gap-1" style={{ gridTemplateColumns: `72px repeat(${Math.max(timeBins, 1)}, minmax(18px, 1fr))` }}>
                    <div />
                    {Array.from({ length: Math.max(timeBins, 1) }, (_, index) => (
                        <div key={`time-${index}`} className="text-center text-[10px] text-[var(--text-muted)]">
                            T{index + 1}
                        </div>
                    ))}
                    {matrix.map((row, rowIndex) => (
                        <React.Fragment key={`row-${rowIndex}`}>
                            <div className="pr-2 text-right text-[10px] text-[var(--text-muted)]">区段 {rowIndex}</div>
                            {row.map((value, colIndex) => (
                                <div
                                    key={`${rowIndex}-${colIndex}`}
                                    className="h-5 rounded-sm border border-black/10"
                                    style={{
                                        background: `rgba(239, 68, 68, ${Math.max(0.08, value)})`,
                                        boxShadow: value > 0.6 ? '0 0 12px rgba(239,68,68,0.18)' : 'none',
                                    }}
                                    title={`区段 ${rowIndex}，时间桶 ${colIndex + 1}，强度 ${value.toFixed(2)}`}
                                />
                            ))}
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </div>
    );
}

function HistoryAnalysisContent({ analysis, run }: { analysis: RunAnalysisPayload | null; run: HistoryRunItem | null }) {
    const navigate = useNavigate();
    const segmentOptions = analysis?.meta.segment_options || [];
    const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
    const [images, setImages] = useState<RunImageItem[]>([]);
    const [imagesLoading, setImagesLoading] = useState(false);

    const effectiveSegment = useMemo(() => {
        if (selectedSegment) {
            return selectedSegment;
        }
        if (analysis?.meta.default_segment) {
            return analysis.meta.default_segment;
        }
        return segmentOptions[0]?.key || null;
    }, [analysis, selectedSegment, segmentOptions]);

    const selectedSegmentSeries = useMemo(() => {
        if (!analysis || !effectiveSegment) {
            return [];
        }
        return analysis.charts.segment_series?.[effectiveSegment] || [];
    }, [analysis, effectiveSegment]);

    useEffect(() => {
        if (!run) {
            setImages([]);
            return;
        }

        let cancelled = false;
        const loadImages = async () => {
            setImagesLoading(true);
            try {
                const response = await fetch(`/api/runs/${encodeURIComponent(run.run_id)}/images`);
                const payload = await response.json();
                if (!response.ok) {
                    throw new Error(payload.detail || '加载历史图像失败');
                }
                if (!cancelled) {
                    setImages(Array.isArray(payload.images) ? payload.images : []);
                }
            } catch {
                if (!cancelled) {
                    setImages([]);
                }
            } finally {
                if (!cancelled) {
                    setImagesLoading(false);
                }
            }
        };

        loadImages();
        return () => {
            cancelled = true;
        };
    }, [run]);

    if (!analysis || !run) {
        return <EmptyPanel title="选择历史数据" description="从左侧文件管理器中点击历史运行，系统会切换到分析视图并展示对应图表。" />;
    }

    const handleReplayJump = (anchor: ReplayAnchor) => {
        const params = new URLSearchParams({
            run: run.run_id,
            time: String(anchor.time),
            segment: String(anchor.segment),
        });
        navigate(`/replay?${params.toString()}`);
    };

    return (
        <div className="h-full space-y-5 overflow-y-auto px-6 py-5">
            <div>
                <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">历史运行分析</div>
                <h2 className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{run.name || run.run_id}</h2>
                <div className="mt-1 text-sm text-[var(--text-secondary)]">
                    运行编号 {run.run_id} · 更新时间 {formatTime(run.modified)}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <SummaryCard label="总车辆数" value={analysis.summary.total_vehicles ?? 0} accent="#60a5fa" />
                <SummaryCard label="异常数量" value={analysis.summary.total_anomalies ?? 0} accent="#f97316" />
                <SummaryCard label="仿真时长" value={formatDuration(analysis.summary.simulation_time)} accent="#34d399" />
                <SummaryCard label="训练样本" value={analysis.summary.ml_samples ?? 0} accent="#a78bfa" />
            </div>

            <div className="rounded-xl border border-[var(--glass-border)] bg-[rgba(255,255,255,0.03)] p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <div className="mr-2 text-sm font-medium text-[var(--text-primary)]">区段切换</div>
                    {segmentOptions.length > 0 ? segmentOptions.map((item, index) => {
                        const active = effectiveSegment === item.key;
                        return (
                            <button
                                key={`${item.key}-${index}`}
                                type="button"
                                onClick={() => setSelectedSegment(item.key)}
                                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                                    active
                                        ? 'bg-[var(--accent-blue)] text-white'
                                        : 'bg-white/5 text-[var(--text-secondary)] hover:bg-white/10'
                                }`}
                            >
                                {item.label}
                            </button>
                        );
                    }) : (
                        <span className="text-xs text-[var(--text-muted)]">当前结果未包含区段级时序</span>
                    )}
                </div>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
                    <div className="h-[320px] rounded-xl border border-[var(--glass-border)] bg-[rgba(255,255,255,0.02)] p-4">
                        <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">
                            {effectiveSegment ? `区段 ${effectiveSegment} 速度与流量` : '区段速度与流量'}
                        </div>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={selectedSegmentSeries}>
                                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                <XAxis dataKey="time" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                                <YAxis yAxisId="left" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                                <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                                <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(148,163,184,0.2)' }} />
                                <Line yAxisId="left" type="monotone" dataKey="avg_speed" name="平均速度" stroke="#60a5fa" strokeWidth={2} dot={false} />
                                <Line yAxisId="right" type="monotone" dataKey="flow" name="流量" stroke="#f59e0b" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="h-[320px] rounded-xl border border-[var(--glass-border)] bg-[rgba(255,255,255,0.02)] p-4">
                        <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">异常类型分布</div>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={analysis.charts.anomaly_type_breakdown || []}
                                layout="vertical"
                                margin={{ left: 8, right: 12, top: 8, bottom: 8 }}
                            >
                                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                                <YAxis dataKey="name" type="category" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} width={96} />
                                <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(148,163,184,0.2)' }} />
                                <Bar dataKey="value" fill="#fb7185" radius={[0, 6, 6, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
                <div className="h-[320px] rounded-xl border border-[var(--glass-border)] bg-[rgba(255,255,255,0.03)] p-4">
                    <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">全局平均速度与车辆规模</div>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={analysis.charts.speed_timeline}>
                            <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                            <XAxis dataKey="time" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                            <YAxis yAxisId="left" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                            <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                            <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(148,163,184,0.2)' }} />
                            <Line yAxisId="left" type="monotone" dataKey="avg_speed" name="平均速度" stroke="#38bdf8" strokeWidth={2} dot={false} />
                            <Line yAxisId="right" type="monotone" dataKey="vehicle_count" name="车辆数" stroke="#a78bfa" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                <div className="h-[320px] rounded-xl border border-[var(--glass-border)] bg-[rgba(255,255,255,0.03)] p-4">
                    <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">异常时间分布</div>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={analysis.charts.anomaly_timeline}>
                            <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                            <XAxis dataKey="time" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} allowDecimals={false} />
                            <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(148,163,184,0.2)' }} />
                            <Area type="monotone" dataKey="anomaly_count" name="异常数" stroke="#fb7185" fill="rgba(244,63,94,0.28)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
                <div className="rounded-xl border border-[var(--glass-border)] bg-[rgba(255,255,255,0.03)] p-4">
                    <SegmentHeatmapGrid data={analysis.charts.segment_heatmap} timeBins={analysis.meta.time_bins} maxPosition={analysis.meta.max_position} />
                </div>
                <div className="h-[320px] rounded-xl border border-[var(--glass-border)] bg-[rgba(255,255,255,0.03)] p-4">
                    <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">事件构成</div>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analysis.charts.event_breakdown} layout="vertical" margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
                            <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                            <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                            <YAxis dataKey="name" type="category" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} width={88} />
                            <Tooltip contentStyle={{ background: 'rgba(15,23,42,0.96)', border: '1px solid rgba(148,163,184,0.2)' }} />
                            <Bar dataKey="value" fill="#a78bfa" radius={[0, 6, 6, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="rounded-xl border border-[var(--glass-border)] bg-[rgba(255,255,255,0.03)] p-4">
                <div className="mb-3 flex items-center justify-between">
                    <div>
                        <div className="text-sm font-medium text-[var(--text-primary)]">联动回放跳转</div>
                        <div className="mt-1 text-xs text-[var(--text-muted)]">选取异常锚点后，会跳转到回放页并自动定位到对应运行与时间附近。</div>
                    </div>
                </div>
                {analysis.replay_anchors && analysis.replay_anchors.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                        {analysis.replay_anchors.map((anchor) => (
                            <button
                                key={anchor.id}
                                type="button"
                                onClick={() => handleReplayJump(anchor)}
                                className="rounded-xl border border-[var(--glass-border)] bg-black/10 p-4 text-left transition-colors hover:bg-white/5"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-sm font-medium text-[var(--text-primary)]">{anchor.label}</div>
                                    <span className="rounded-full bg-[var(--accent-blue)]/12 px-2 py-1 text-[11px] text-[var(--accent-blue)]">
                                        {anchor.event_type}
                                    </span>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--text-secondary)]">
                                    <span>时间 {anchor.time.toFixed(1)}s</span>
                                    <span>区段 {anchor.segment}</span>
                                    <span>位置 {anchor.position.toFixed(1)}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="text-sm text-[var(--text-secondary)]">当前结果没有可用的异常锚点。</div>
                )}
            </div>

            <div className="rounded-xl border border-[var(--glass-border)] bg-[rgba(255,255,255,0.03)] p-4">
                <div className="mb-3 flex items-center justify-between">
                    <div>
                        <div className="text-sm font-medium text-[var(--text-primary)]">历史输出图像</div>
                        <div className="mt-1 text-xs text-[var(--text-muted)]">展示该历史运行目录中已生成的分析图像、热力图和轨迹图。</div>
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                        {imagesLoading ? '加载中...' : `${images.length} 张`}
                    </div>
                </div>
                {images.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                        {images.map((image) => (
                            <a
                                key={image.name}
                                href={image.url}
                                target="_blank"
                                rel="noreferrer"
                                className="overflow-hidden rounded-xl border border-[var(--glass-border)] bg-black/10 transition-colors hover:border-[var(--accent-blue)]/60 hover:bg-white/5"
                            >
                                <div className="aspect-[16/10] overflow-hidden bg-black/20">
                                    <img src={image.url} alt={image.name} className="h-full w-full object-cover" loading="lazy" />
                                </div>
                                <div className="px-3 py-2 text-xs text-[var(--text-secondary)]">{image.name}</div>
                            </a>
                        ))}
                    </div>
                ) : (
                    <div className="text-sm text-[var(--text-secondary)]">当前运行目录没有可展示的历史图像。</div>
                )}
            </div>
        </div>
    );
}

function ModelDetailContent({ model }: { model: ModelInfo | null }) {
    if (!model) {
        return <EmptyPanel title="选择模型文件" description="从左侧文件管理器中点击模型，可以查看训练指标、来源数据集和关键超参数。" />;
    }

    const metrics = model.meta?.metrics || {};
    const sources = model.meta?.source_datasets || [];
    const runs = model.meta?.source_run_ids || model.meta?.source_simulations || [];

    return (
        <div className="h-full space-y-5 overflow-y-auto px-6 py-5">
            <div>
                <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">模型文件</div>
                <h2 className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{model.model_id}</h2>
                <div className="mt-1 text-sm text-[var(--text-secondary)]">
                    文件大小 {formatSize(model.size)} · 创建时间 {formatTime(model.meta?.created_at || model.created_at)}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <SummaryCard label="训练样本" value={model.meta?.trained_samples ?? 0} accent="#60a5fa" />
                <SummaryCard label="验证样本" value={model.meta?.validated_samples ?? 0} accent="#34d399" />
                <SummaryCard label="Accuracy" value={metrics.accuracy !== undefined ? `${(metrics.accuracy * 100).toFixed(1)}%` : '--'} accent="#f59e0b" />
                <SummaryCard label="F1 Macro" value={metrics.f1_macro !== undefined ? `${(metrics.f1_macro * 100).toFixed(1)}%` : '--'} accent="#a78bfa" />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="space-y-3 rounded-xl border border-[var(--glass-border)] bg-[rgba(255,255,255,0.03)] p-4">
                    <div className="text-sm font-medium text-[var(--text-primary)]">训练来源</div>
                    <div>
                        <div className="mb-2 text-xs text-[var(--text-muted)]">数据集</div>
                        <div className="flex flex-wrap gap-2">
                            {sources.length > 0 ? sources.map((item) => (
                                <span key={item} className="rounded-full bg-[var(--accent-blue)]/12 px-3 py-1 text-xs text-[var(--accent-blue)]">{item}</span>
                            )) : <span className="text-xs text-[var(--text-muted)]">无</span>}
                        </div>
                    </div>
                    <div>
                        <div className="mb-2 text-xs text-[var(--text-muted)]">历史运行</div>
                        <div className="flex flex-wrap gap-2">
                            {runs.length > 0 ? runs.map((item) => (
                                <span key={item} className="rounded-full bg-[var(--accent-purple)]/12 px-3 py-1 text-xs text-[var(--accent-purple)]">{item}</span>
                            )) : <span className="text-xs text-[var(--text-muted)]">无</span>}
                        </div>
                    </div>
                </div>

                <div className="space-y-3 rounded-xl border border-[var(--glass-border)] bg-[rgba(255,255,255,0.03)] p-4">
                    <div className="text-sm font-medium text-[var(--text-primary)]">训练配置</div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <div className="text-[var(--text-muted)]">模型类型</div>
                            <div className="mt-1 text-[var(--text-primary)]">{model.meta?.model_type || '--'}</div>
                        </div>
                        {Object.entries(model.meta?.hyperparameters || {}).map(([key, value]) => (
                            <div key={key}>
                                <div className="text-[var(--text-muted)]">{key}</div>
                                <div className="mt-1 text-[var(--text-primary)]">{String(value)}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function DatasetDetailContent({ dataset }: { dataset: DatasetInfo | null }) {
    if (!dataset) {
        return <EmptyPanel title="选择数据集文件" description="从左侧文件管理器中点击数据集，可以查看样本规模、特征维度和提取来源。" />;
    }

    const features = dataset.meta?.feature_names || [];
    const sources = dataset.meta?.source_files || [];

    return (
        <div className="h-full space-y-5 overflow-y-auto px-6 py-5">
            <div>
                <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">训练数据集</div>
                <h2 className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{dataset.name}</h2>
                <div className="mt-1 text-sm text-[var(--text-secondary)]">
                    文件大小 {formatSize(dataset.size)} · 更新时间 {formatTime(dataset.modified)}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <SummaryCard label="样本数" value={dataset.meta?.total_samples ?? 0} accent="#60a5fa" />
                <SummaryCard label="特征数" value={features.length} accent="#34d399" />
                <SummaryCard label="步长" value={dataset.meta?.step_seconds ? `${dataset.meta.step_seconds}s` : '--'} accent="#f59e0b" />
                <SummaryCard label="窗口长度" value={dataset.meta?.window_size_steps ?? '--'} accent="#a78bfa" />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="space-y-3 rounded-xl border border-[var(--glass-border)] bg-[rgba(255,255,255,0.03)] p-4">
                    <div className="text-sm font-medium text-[var(--text-primary)]">特征字段</div>
                    <div className="flex flex-wrap gap-2">
                        {features.length > 0 ? features.map((feature) => (
                            <span key={feature} className="rounded-full bg-[var(--accent-blue)]/12 px-3 py-1 text-xs text-[var(--accent-blue)]">{feature}</span>
                        )) : <span className="text-xs text-[var(--text-muted)]">无</span>}
                    </div>
                </div>
                <div className="space-y-3 rounded-xl border border-[var(--glass-border)] bg-[rgba(255,255,255,0.03)] p-4">
                    <div className="text-sm font-medium text-[var(--text-primary)]">来源历史数据</div>
                    <div className="flex flex-wrap gap-2">
                        {sources.length > 0 ? sources.map((source) => (
                            <span key={source} className="rounded-full bg-[var(--accent-purple)]/12 px-3 py-1 text-xs text-[var(--accent-purple)]">{source}</span>
                        )) : <span className="text-xs text-[var(--text-muted)]">无</span>}
                    </div>
                    <div className="pt-2 text-xs text-[var(--text-muted)]">
                        额外特征: {(dataset.meta?.extra_features || []).join('、') || '无'}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function WorkflowAnalysisView(props: WorkflowAnalysisViewProps) {
    const { activeView, run, analysis, model, dataset } = props;

    if (activeView === 'run') {
        return <HistoryAnalysisContent analysis={analysis} run={run} />;
    }
    if (activeView === 'workflow') {
        return <EmptyPanel title="选择工作流文件" description="在左侧文件管理器中选择工作流后，可以继续编辑、重命名、复制或在文件夹中打开。" />;
    }
    if (activeView === 'model') {
        return <ModelDetailContent model={model} />;
    }
    return <DatasetDetailContent dataset={dataset} />;
}
