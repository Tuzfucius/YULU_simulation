/**
 * 评估页面 — 增强版
 *
 * 保留所有原有图表，新增：
 *  - 仿真概况信息卡
 *  - 强化混淆矩阵（四格热图 + TN + MCC/Specificity）
 *  - 门架区间评估统计（GantryStatsPanel）
 *  - 按异常类型可视化柱状图
 */

import { useState, useEffect, useCallback } from 'react';
import { TimelineChart } from '../charts/TimelineChart';
import { HeatmapChart } from '../charts/HeatmapChart';
import { SensitivityChart } from '../charts/SensitivityChart';
import { GantryStatsPanel, type GantryStat } from '../charts/GantryStatsPanel';
import { ContextMenu, type ContextMenuState } from '../charts/ContextMenu';

const API_BASE = '/api/evaluation';
const FILES_API = '/api/files';

// ==================== 类型定义 ====================

interface EvalMetrics {
    precision: number;
    recall: number;
    f1_score: number;
    specificity?: number;
    mcc?: number;
    fpr?: number;
    detection_delay_avg: number;
    detection_delay_max: number;
    true_positives: number;
    false_positives: number;
    false_negatives: number;
    true_negatives?: number;
    total_alerts: number;
    total_ground_truths: number;
    total_vehicles?: number;
    segment_boundaries?: number[];
    gantry_stats?: GantryStat[];
    match_details?: any[];
    type_metrics?: Record<string, any>;
}

interface OutputFile {
    name: string;
    path: string;
    size: number;
    modified: string;
    extension: string;
    meta?: Record<string, any>;
}

const DEFAULT_METRICS: EvalMetrics = {
    precision: 0, recall: 0, f1_score: 0,
    detection_delay_avg: 0, detection_delay_max: 0,
    true_positives: 0, false_positives: 0, false_negatives: 0,
    total_alerts: 0, total_ground_truths: 0,
};

// ==================== 辅助组件 ====================

/** 混淆矩阵单格 */
function CMCell({ value, label, colorClass, bgClass }: {
    value: number | string;
    label: string;
    colorClass: string;
    bgClass: string;
}) {
    return (
        <div className={`rounded-xl p-4 flex flex-col items-center justify-center gap-1 ${bgClass}`}>
            <span className={`text-3xl font-bold font-mono ${colorClass}`}>{value}</span>
            <span className="text-[10px] text-[var(--text-muted)]">{label}</span>
        </div>
        <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
    );
}

/** 小型指标卡片 */
function MiniMetric({ label, value, color }: { label: string; value: string; color?: string }) {
    return (
        <div className="rounded-lg border border-[var(--glass-border)] p-3 text-center bg-[rgba(255,255,255,0.02)]">
            <p className="text-[9px] text-[var(--text-muted)] mb-0.5">{label}</p>
            <p className="text-sm font-bold font-mono" style={{ color: color || 'var(--text-primary)' }}>{value}</p>
        </div>
    );
}

/** 异常类型名称 */
const ANOMALY_TYPE_NAMES: Record<string, string> = {
    '1': '停车', '2': '缓行（短）', '3': '缓行（长）',
};

// ==================== 主页面 ====================

export function EvaluationPage() {
    const [metrics, setMetrics] = useState<EvalMetrics>(DEFAULT_METRICS);
    const [loading, setLoading] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');

    // 参数调节
    const [timeWindow, setTimeWindow] = useState(60);
    const [distWindow, setDistWindow] = useState(2.0);

    // 敏感性分析数据
    const [sensitivityData, setSensitivityData] = useState<any[]>([]);

    // 文件选择
    const [outputFiles, setOutputFiles] = useState<OutputFile[]>([]);
    const [loadingFiles, setLoadingFiles] = useState(false);
    const [selectedFile, setSelectedFile] = useState('');
    const [fileInfo, setFileInfo] = useState<any>(null);
    const [showFilePanel, setShowFilePanel] = useState(true);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

    // 加载 output 文件列表
    const refreshOutputFiles = useCallback(async () => {
        setLoadingFiles(true);
        try {
            const res = await fetch(`${FILES_API}/output-files`);
            if (res.ok) {
                const data = await res.json();
                setOutputFiles((data.files || []).filter((f: OutputFile) => f.extension === '.json'));
            }
        } catch { /* 后端未启动 */ }
        setLoadingFiles(false);
    }, []);

    const deriveRunId = useCallback((file: OutputFile) => {
        const normalized = file.path.replace(/\\/g, '/');
        return normalized.split('/')[0] || file.name.replace(/\.json$/i, '');
    }, []);

    const showFileMenu = useCallback((event: React.MouseEvent, file: OutputFile) => {
        event.preventDefault();
        const runId = deriveRunId(file);
        setContextMenu({
            x: event.clientX,
            y: event.clientY,
            items: [
                {
                    label: '重命名',
                    icon: '✏️',
                    onClick: async () => {
                        const nextName = prompt('请输入新的历史记录名称', runId);
                        if (!nextName || nextName.trim() === '' || nextName.trim() === runId) return;
                        const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/rename`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ new_name: nextName.trim() }),
                        });
                        const data = await res.json();
                        if (!data.success) throw new Error(data.detail || '重命名失败');
                        await refreshOutputFiles();
                    },
                },
                {
                    label: '复制',
                    icon: '📄',
                    onClick: async () => {
                        const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/copy`, { method: 'POST' });
                        const data = await res.json();
                        if (!data.success) throw new Error(data.detail || '复制失败');
                        await refreshOutputFiles();
                    },
                },
                {
                    label: '删除',
                    icon: '🗑️',
                    danger: true,
                    onClick: async () => {
                        if (!confirm(`确认删除 "${runId}"？此操作不可恢复。`)) return;
                        const res = await fetch(`/api/runs/${encodeURIComponent(runId)}`, { method: 'DELETE' });
                        const data = await res.json();
                        if (!data.success) throw new Error(data.detail || '删除失败');
                        await refreshOutputFiles();
                    },
                },
                {
                    label: '在文件夹中打开',
                    icon: '📂',
                    onClick: async () => {
                        await fetch(`/api/runs/${encodeURIComponent(runId)}/open-folder`, { method: 'POST' });
                    },
                },
            ],
        });
    }, [deriveRunId, refreshOutputFiles]);

    const fetchMetrics = useCallback(async () => {
        setLoading(true);
        try {
            const resp = await fetch(`${API_BASE}/metrics`);
            const data = await resp.json();
            if (data.success) {
                setMetrics(data.data || DEFAULT_METRICS);
            }
        } catch (err) {
            setStatusMsg(`加载失败: ${err}`);
        } finally {
            setLoading(false);
        }
    }, []);

    /** 从文件运行评估（后端处理大文件） */
    const evaluateFromFile = useCallback(async (filePath: string) => {
        setLoading(true);
        setStatusMsg('正在从文件加载并评估...');
        try {
            const resp = await fetch(`${API_BASE}/evaluate-file`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_path: filePath,
                    time_window_s: timeWindow,
                    distance_window_km: distWindow,
                }),
            });
            const data = await resp.json();
            if (data.success) {
                setMetrics(data.data || DEFAULT_METRICS);
                setFileInfo(data.file_info || null);
                setStatusMsg(`✅ 文件评估完成${data.message ? ` — ${data.message}` : ''}`);
            } else {
                setStatusMsg(`❌ ${data.detail || '评估失败'}`);
            }
        } catch (err) {
            setStatusMsg(`❌ 请求失败: ${err}`);
        } finally {
            setLoading(false);
        }
    }, [timeWindow, distWindow]);

    const runEvaluation = useCallback(async () => {
        if (selectedFile) {
            await evaluateFromFile(selectedFile);
            return;
        }

        setLoading(true);
        setStatusMsg('正在运行评估...');
        try {
            const resp = await fetch(`${API_BASE}/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    time_window_s: timeWindow,
                    distance_window_km: distWindow,
                }),
            });
            const data = await resp.json();
            if (data.success) {
                setMetrics(data.data || DEFAULT_METRICS);
                setStatusMsg('✅ 评估完成');
            } else {
                setStatusMsg(`❌ ${data.detail || '评估失败'}`);
            }
        } catch (err) {
            setStatusMsg(`❌ 请求失败: ${err}`);
        } finally {
            setLoading(false);
        }
    }, [timeWindow, distWindow, selectedFile, evaluateFromFile]);

    const fetchSensitivity = useCallback(async () => {
        try {
            const resp = await fetch(`${API_BASE}/sensitivity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ param_name: 'time_window', range: [10, 120, 10] }),
            });
            const data = await resp.json();
            if (data.success) {
                setSensitivityData(data.data || []);
            }
        } catch {
            const mock = Array.from({ length: 12 }, (_, i) => {
                const t = 10 + i * 10;
                const f1 = 0.4 + 0.4 * Math.exp(-((t - 60) ** 2) / 2000);
                return {
                    paramValue: t,
                    f1Score: f1,
                    precision: f1 + 0.05 * Math.random(),
                    recall: f1 - 0.05 * Math.random(),
                };
            });
            setSensitivityData(mock);
        }
    }, []);

    useEffect(() => {
        fetchMetrics();
        fetchSensitivity();
        refreshOutputFiles();
    }, [fetchMetrics, fetchSensitivity, refreshOutputFiles]);

    // 工具函数
    const fmtSize = (b: number) => b < 1024 ? `${b}B` : b < 1048576 ? `${(b / 1024).toFixed(1)}KB` : `${(b / 1048576).toFixed(1)}MB`;
    const fmtTime = (iso: string) => { try { return new Date(iso).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };

    // 构建时间线数据
    const timelineAlerts = (metrics.match_details || []).map((m: any) => ({
        timestamp: m.alert_time || 0,
        label: m.rule_name || 'alert',
        type: 'alert' as const,
        severity: m.severity || 'medium',
    }));
    const timelineTruths = (metrics.match_details || []).filter((m: any) => m.truth_time).map((m: any) => ({
        timestamp: m.truth_time || 0,
        label: m.event_type || 'truth',
        type: 'truth' as const,
    }));

    // 构建热力图数据
    const heatmapData = (metrics.match_details || []).map((m: any) => ({
        position: m.position_km || Math.random() * 10,
        time: Math.floor((m.alert_time || 0) / 60),
        intensity: m.severity === 'critical' ? 1 : m.severity === 'high' ? 0.7 : 0.4,
    }));

    const f1Color = metrics.f1_score >= 0.7 ? '#22c55e' : metrics.f1_score >= 0.4 ? '#f59e0b' : '#ef4444';
    const tn = metrics.true_negatives ?? 'N/A';
    const mcc = metrics.mcc !== undefined ? metrics.mcc.toFixed(3) : '-';
    const specificity = metrics.specificity !== undefined ? `${(metrics.specificity * 100).toFixed(1)}%` : '-';

    // 按异常类型柱状图数据
    const typeMetricsEntries = Object.entries(metrics.type_metrics || {});

    return (
        <div className="flex h-full bg-[var(--bg-base)]">
            {/* ===== 左侧文件选择面板 ===== */}
            {showFilePanel && (
                <div className="w-72 flex flex-col border-r border-[var(--glass-border)] bg-[var(--glass-bg)] shrink-0">
                    <div className="px-4 py-3 border-b border-[var(--glass-border)] flex items-center justify-between">
                        <h3 className="text-sm font-medium text-[var(--text-primary)]">📂 数据文件</h3>
                        <div className="flex gap-2">
                            <button onClick={refreshOutputFiles} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">🔄</button>
                            <button onClick={() => setShowFilePanel(false)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto scrollbar-thin">
                        {loadingFiles ? (
                            <div className="py-8 text-center text-sm text-[var(--text-muted)]">加载中...</div>
                        ) : outputFiles.length === 0 ? (
                            <div className="py-8 text-center text-sm text-[var(--text-muted)]">
                                <p>未找到数据文件</p>
                                <p className="text-[10px] mt-1">请先运行仿真</p>
                            </div>
                        ) : (
                            <div className="py-1">
                                {outputFiles.map(file => (
                                    <button
                                        key={file.path}
                                        onContextMenu={(e) => showFileMenu(e, file)}
                                        onClick={() => {
                                            setSelectedFile(file.path);
                                            evaluateFromFile(file.path);
                                        }}
                                        disabled={loading}
                                        className={`w-full text-left px-4 py-2.5 hover:bg-[rgba(255,255,255,0.05)] transition-colors border-b border-[var(--glass-border)]/50 group ${selectedFile === file.path ? 'bg-[var(--accent-blue)]/10 border-l-2 border-l-[var(--accent-blue)]' : ''}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm">{selectedFile === file.path ? '✅' : '📄'}</span>
                                            <span className="text-xs text-[var(--text-primary)] truncate flex-1 group-hover:text-[var(--accent-blue)]">
                                                {file.name}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 mt-0.5 ml-6 text-[10px] text-[var(--text-muted)]">
                                            <span>{fmtSize(file.size)}</span>
                                            <span>{fmtTime(file.modified)}</span>
                                        </div>
                                        {file.meta && Object.keys(file.meta).length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1 ml-6">
                                                {file.meta.vehicles && <span className="px-1.5 py-0.5 text-[9px] rounded bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]">{file.meta.vehicles}辆</span>}
                                                {file.meta.anomalies && <span className="px-1.5 py-0.5 text-[9px] rounded bg-red-500/10 text-red-400">{file.meta.anomalies}异常</span>}
                                                {file.meta.sim_time && <span className="px-1.5 py-0.5 text-[9px] rounded bg-green-500/10 text-green-400">{file.meta.sim_time}s</span>}
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 文件数据摘要 */}
                    {fileInfo && (
                        <div className="p-3 border-t border-[var(--glass-border)] bg-[rgba(0,0,0,0.1)]">
                            <p className="text-[10px] font-medium text-[var(--text-secondary)] mb-1">📊 文件数据摘要</p>
                            <div className="grid grid-cols-2 gap-1 text-[9px] text-[var(--text-muted)]">
                                <span>轨迹记录: {fileInfo.trajectory_records?.toLocaleString()}</span>
                                <span>异常日志: {fileInfo.anomaly_logs}</span>
                                {fileInfo.config?.total_vehicles && <span>总车辆: {fileInfo.config.total_vehicles}</span>}
                                {fileInfo.config?.num_segments && <span>门架区间: {fileInfo.config.num_segments}</span>}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ===== 右侧主内容 ===== */}
            <div className="flex-1 flex flex-col overflow-y-auto scrollbar-thin">
                {/* 顶部工具栏 */}
                <div className="h-12 flex items-center justify-between px-4 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md shrink-0 sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        {!showFilePanel && <button onClick={() => setShowFilePanel(true)} className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">📂</button>}
                        <span className="text-lg">📊</span>
                        <span className="text-sm font-medium text-[var(--text-primary)]">预警评估</span>
                        {selectedFile && <span className="text-[10px] text-[var(--accent-blue)] font-mono bg-[var(--accent-blue)]/10 px-2 py-0.5 rounded">{selectedFile.split('/').pop()}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                        {statusMsg && <span className="text-[10px] text-[var(--text-muted)] max-w-[200px] truncate">{statusMsg}</span>}
                        <button
                            onClick={fetchMetrics}
                            disabled={loading}
                            className="text-[11px] px-3 py-1.5 rounded-md bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/25 disabled:opacity-50 transition-colors"
                        >
                            刷新
                        </button>
                        <button
                            onClick={runEvaluation}
                            disabled={loading}
                            className="text-[11px] px-3 py-1.5 rounded-md bg-green-500/15 text-green-400 hover:bg-green-500/25 disabled:opacity-50 transition-colors"
                        >
                            {loading ? '分析中...' : '运行评估'}
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-6 max-w-[1400px] mx-auto w-full">

                    {/* ===== §1 仿真概况信息卡 ===== */}
                    {(metrics.total_vehicles || fileInfo) && (
                        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md p-4">
                            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">🚗 仿真概况</h3>
                            <div className="grid grid-cols-6 gap-3">
                                {[
                                    { label: '总车辆数', val: metrics.total_vehicles?.toLocaleString() ?? fileInfo?.config?.total_vehicles ?? '-', color: 'var(--accent-blue)' },
                                    { label: '门架区间数', val: fileInfo?.config?.num_segments ?? (metrics.segment_boundaries ? metrics.segment_boundaries.length - 1 : '-'), color: 'var(--text-primary)' },
                                    { label: '真实异常数', val: metrics.total_ground_truths || '-', color: '#ef4444' },
                                    { label: '预警触发数', val: metrics.total_alerts || '-', color: '#f59e0b' },
                                    { label: '成功匹配(TP)', val: metrics.true_positives || '-', color: '#22c55e' },
                                    { label: '路段长度', val: fileInfo?.config?.road_length_km ? `${fileInfo.config.road_length_km} km` : '-', color: 'var(--text-secondary)' },
                                ].map(({ label, val, color }) => (
                                    <div key={label} className="rounded-lg bg-[rgba(255,255,255,0.03)] border border-[var(--glass-border)]/50 p-3 text-center">
                                        <p className="text-[9px] text-[var(--text-muted)] mb-1">{label}</p>
                                        <p className="text-lg font-bold font-mono" style={{ color }}>{val}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ===== §2 核心指标卡片 ===== */}
                    <div className="grid grid-cols-5 gap-3">
                        {[
                            { label: 'Precision', val: metrics.precision, fmt: (v: number) => `${(v * 100).toFixed(1)}%` },
                            { label: 'Recall', val: metrics.recall, fmt: (v: number) => `${(v * 100).toFixed(1)}%` },
                            { label: 'F1-Score', val: metrics.f1_score, fmt: (v: number) => v.toFixed(3), color: f1Color },
                            { label: '平均延迟', val: metrics.detection_delay_avg, fmt: (v: number) => `${v.toFixed(1)}s` },
                            { label: '最大延迟', val: metrics.detection_delay_max, fmt: (v: number) => `${v.toFixed(1)}s` },
                        ].map(({ label, val, fmt, color }) => (
                            <div key={label}
                                className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md p-4 text-center">
                                <p className="text-[10px] text-[var(--text-muted)] mb-1">{label}</p>
                                <p className="text-2xl font-bold" style={{ color: color || 'var(--text-primary)' }}>
                                    {fmt(val)}
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* ===== §3 参数调节 + 强化混淆矩阵 ===== */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* 参数调节面板 */}
                        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md p-4">
                            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">⚙️ 匹配参数</h3>
                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between text-[11px] text-[var(--text-secondary)] mb-1">
                                        <span>时间窗口</span>
                                        <span className="font-mono">{timeWindow}s</span>
                                    </div>
                                    <input type="range" min={5} max={180} step={5} value={timeWindow}
                                        onChange={e => setTimeWindow(Number(e.target.value))}
                                        className="w-full h-1.5 rounded-full appearance-none bg-[var(--glass-border)] accent-[var(--accent-blue)]"
                                    />
                                </div>
                                <div>
                                    <div className="flex justify-between text-[11px] text-[var(--text-secondary)] mb-1">
                                        <span>距离窗口</span>
                                        <span className="font-mono">{distWindow.toFixed(1)} km</span>
                                    </div>
                                    <input type="range" min={0.5} max={10} step={0.5} value={distWindow}
                                        onChange={e => setDistWindow(Number(e.target.value))}
                                        className="w-full h-1.5 rounded-full appearance-none bg-[var(--glass-border)] accent-[var(--accent-blue)]"
                                    />
                                </div>
                                <p className="text-[10px] text-[var(--text-muted)]">
                                    调整参数后点击「运行评估」以更新结果
                                </p>
                            </div>
                        </div>

                        {/* 强化混淆矩阵 */}
                        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md p-4">
                            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">🔢 混淆矩阵 & 扩展指标</h3>
                            <div className="grid grid-cols-2 gap-2 mb-3">
                                <CMCell value={metrics.true_positives} label="TP · 正确检测" colorClass="text-green-400" bgClass="bg-green-500/10 border border-green-500/20 rounded-lg" />
                                <CMCell value={metrics.false_negatives} label="FN · 漏报" colorClass="text-red-400" bgClass="bg-red-500/10 border border-red-500/20 rounded-lg" />
                                <CMCell value={metrics.false_positives} label="FP · 误报" colorClass="text-yellow-400" bgClass="bg-yellow-500/10 border border-yellow-500/20 rounded-lg" />
                                <CMCell value={tn} label="TN · 正确无报" colorClass="text-[var(--text-secondary)]" bgClass="bg-[rgba(255,255,255,0.04)] border border-[var(--glass-border)] rounded-lg" />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <MiniMetric label="MCC" value={mcc} color={Number(mcc) > 0.5 ? '#22c55e' : Number(mcc) > 0.2 ? '#f59e0b' : '#ef4444'} />
                                <MiniMetric label="Specificity" value={specificity} />
                                <MiniMetric label="FPR" value={metrics.fpr !== undefined ? `${(metrics.fpr * 100).toFixed(1)}%` : '-'} color="#f59e0b" />
                            </div>
                        </div>
                    </div>

                    {/* ===== §4 可视化图表（原有） ===== */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md p-4">
                            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">📈 事件时间线</h3>
                            <TimelineChart
                                alerts={timelineAlerts}
                                truths={timelineTruths}
                                duration={Math.max(300, ...[...timelineAlerts, ...timelineTruths].map(e => e.timestamp))}
                                width={520}
                                height={160}
                            />
                        </div>

                        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md p-4">
                            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">🗺️ 预警分布热力图</h3>
                            <HeatmapChart
                                data={heatmapData}
                                maxPosition={10}
                                timeBins={10}
                                width={520}
                                height={200}
                                title=""
                            />
                        </div>
                    </div>

                    {/* 敏感性分析（原有） */}
                    <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md p-4">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">📐 参数敏感性分析</h3>
                        <div className="flex justify-center">
                            <SensitivityChart
                                data={sensitivityData}
                                paramName="时间窗口 (s)"
                                width={700}
                                height={250}
                                currentValue={timeWindow}
                            />
                        </div>
                    </div>

                    {/* ===== §5 门架区间评估 ===== */}
                    <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md p-4">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">🛣️ 门架区间评估统计</h3>
                        <GantryStatsPanel
                            stats={metrics.gantry_stats || []}
                            segmentBoundaries={metrics.segment_boundaries}
                        />
                    </div>

                    {/* ===== §6 按异常类型可视化 ===== */}
                    {typeMetricsEntries.length > 0 && (
                        <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md p-4">
                            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">📋 按异常类型评估</h3>
                            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${typeMetricsEntries.length}, 1fr)` }}>
                                {typeMetricsEntries.map(([typeKey, m]: [string, any]) => {
                                    const typeName = ANOMALY_TYPE_NAMES[typeKey] || `类型${typeKey}`;
                                    const bars = [
                                        { key: 'Precision', val: m.precision ?? 0, color: 'var(--accent-blue)' },
                                        { key: 'Recall', val: m.recall ?? 0, color: '#22c55e' },
                                        { key: 'F1', val: m.f1_score ?? 0, color: '#f59e0b' },
                                    ];
                                    return (
                                        <div key={typeKey} className="rounded-lg border border-[var(--glass-border)]/50 bg-[rgba(255,255,255,0.02)] p-3">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-xs font-medium text-[var(--text-primary)]">{typeName}</span>
                                                <span className="text-[9px] text-[var(--text-muted)] bg-[rgba(255,255,255,0.06)] px-2 py-0.5 rounded">
                                                    {m.count ?? 0} 辆
                                                </span>
                                            </div>
                                            <div className="space-y-2">
                                                {bars.map(({ key, val, color }) => (
                                                    <div key={key}>
                                                        <div className="flex justify-between text-[9px] text-[var(--text-muted)] mb-0.5">
                                                            <span>{key}</span>
                                                            <span className="font-mono" style={{ color }}>{(val * 100).toFixed(1)}%</span>
                                                        </div>
                                                        <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
                                                            <div
                                                                className="h-full rounded-full transition-all duration-700"
                                                                style={{ width: `${Math.min(val * 100, 100)}%`, background: color }}
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* 原有纯文字表格（保留，作为数据参考） */}
                            <div className="mt-4 overflow-x-auto">
                                <table className="w-full text-xs text-[var(--text-muted)]">
                                    <thead>
                                        <tr className="border-b border-[var(--glass-border)]">
                                            <th className="text-left py-1.5 px-2">类型</th>
                                            <th className="text-center py-1.5 px-2">Precision</th>
                                            <th className="text-center py-1.5 px-2">Recall</th>
                                            <th className="text-center py-1.5 px-2">F1</th>
                                            <th className="text-center py-1.5 px-2">数量</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {typeMetricsEntries.map(([type, m]: [string, any]) => (
                                            <tr key={type} className="border-b border-[var(--glass-border)]/30">
                                                <td className="py-1.5 px-2">{ANOMALY_TYPE_NAMES[type] || `类型${type}`}</td>
                                                <td className="text-center py-1.5 px-2 font-mono">{(m.precision * 100).toFixed(1)}%</td>
                                                <td className="text-center py-1.5 px-2 font-mono">{(m.recall * 100).toFixed(1)}%</td>
                                                <td className="text-center py-1.5 px-2 font-mono font-bold">{m.f1_score?.toFixed(3) || '-'}</td>
                                                <td className="text-center py-1.5 px-2 font-mono">{m.count || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
