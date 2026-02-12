/**
 * 评估页面 — 增强版
 *
 * 包含：
 *  - 核心指标卡片（P/R/F1/漏报/延迟）
 *  - 参数调节面板（时间窗口 / 距离窗口滑块）
 *  - 混淆矩阵
 *  - 时间线图表
 *  - 热力图
 *  - 参数敏感性图
 */

import { useState, useEffect, useCallback } from 'react';
import { TimelineChart } from '../charts/TimelineChart';
import { HeatmapChart } from '../charts/HeatmapChart';
import { SensitivityChart } from '../charts/SensitivityChart';

const API_BASE = 'http://localhost:8000/api/evaluation';

interface EvalMetrics {
    precision: number;
    recall: number;
    f1_score: number;
    detection_delay_avg: number;
    detection_delay_max: number;
    true_positives: number;
    false_positives: number;
    false_negatives: number;
    total_alerts: number;
    total_ground_truths: number;
    match_details?: any[];
    type_metrics?: Record<string, any>;
}

const DEFAULT_METRICS: EvalMetrics = {
    precision: 0, recall: 0, f1_score: 0,
    detection_delay_avg: 0, detection_delay_max: 0,
    true_positives: 0, false_positives: 0, false_negatives: 0,
    total_alerts: 0, total_ground_truths: 0,
};

export function EvaluationPage() {
    const [metrics, setMetrics] = useState<EvalMetrics>(DEFAULT_METRICS);
    const [loading, setLoading] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');

    // 参数调节
    const [timeWindow, setTimeWindow] = useState(60);
    const [distWindow, setDistWindow] = useState(2.0);

    // 敏感性分析数据 (mock or fetched)
    const [sensitivityData, setSensitivityData] = useState<any[]>([]);

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

    const runEvaluation = useCallback(async () => {
        setLoading(true);
        setStatusMsg('正在运行评估...');
        try {
            const resp = await fetch(`${API_BASE}/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    time_window: timeWindow,
                    distance_window: distWindow,
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
    }, [timeWindow, distWindow]);

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
            // 生成模拟数据
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
    }, [fetchMetrics, fetchSensitivity]);

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

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-[var(--bg-base)] scrollbar-thin">
            {/* 顶部工具栏 */}
            <div className="h-12 flex items-center justify-between px-4 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md shrink-0 sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <span className="text-lg">📊</span>
                    <span className="text-sm font-medium text-[var(--text-primary)]">预警评估</span>
                </div>
                <div className="flex items-center gap-2">
                    {statusMsg && <span className="text-[10px] text-[var(--text-muted)]">{statusMsg}</span>}
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

            <div className="p-6 space-y-6 max-w-[1200px] mx-auto w-full">
                {/* ===== 指标卡片 ===== */}
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

                {/* ===== 参数调节 / 混淆矩阵 ===== */}
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
                                调整参数后点击"运行评估"以更新结果
                            </p>
                        </div>
                    </div>

                    {/* 混淆矩阵 */}
                    <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md p-4">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">🔢 混淆矩阵</h3>
                        <table className="w-full text-xs">
                            <thead>
                                <tr>
                                    <th className="text-left text-[var(--text-muted)] pb-2"></th>
                                    <th className="text-center text-[var(--text-muted)] pb-2">预测为异常</th>
                                    <th className="text-center text-[var(--text-muted)] pb-2">预测为正常</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="text-[var(--text-secondary)] py-2">实际异常</td>
                                    <td className="text-center">
                                        <span className="inline-block px-3 py-1 rounded bg-green-500/15 text-green-400 font-mono font-bold">
                                            {metrics.true_positives}
                                        </span>
                                    </td>
                                    <td className="text-center">
                                        <span className="inline-block px-3 py-1 rounded bg-red-500/15 text-red-400 font-mono font-bold">
                                            {metrics.false_negatives}
                                        </span>
                                    </td>
                                </tr>
                                <tr>
                                    <td className="text-[var(--text-secondary)] py-2">实际正常</td>
                                    <td className="text-center">
                                        <span className="inline-block px-3 py-1 rounded bg-yellow-500/15 text-yellow-400 font-mono font-bold">
                                            {metrics.false_positives}
                                        </span>
                                    </td>
                                    <td className="text-center">
                                        <span className="inline-block px-3 py-1 rounded bg-[rgba(255,255,255,0.05)] text-[var(--text-muted)] font-mono">
                                            N/A
                                        </span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        <div className="flex gap-4 mt-3 text-[10px] text-[var(--text-muted)]">
                            <span>总预警: {metrics.total_alerts}</span>
                            <span>总真值: {metrics.total_ground_truths}</span>
                        </div>
                    </div>
                </div>

                {/* ===== 可视化图表 ===== */}
                <div className="grid grid-cols-2 gap-4">
                    {/* 时间线 */}
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

                    {/* 热力图 */}
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

                {/* 敏感性分析 */}
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

                {/* 按异常类型指标 */}
                {metrics.type_metrics && Object.keys(metrics.type_metrics).length > 0 && (
                    <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md p-4">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">📋 按异常类型指标</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="text-[var(--text-muted)] border-b border-[var(--glass-border)]">
                                        <th className="text-left py-2 px-2">类型</th>
                                        <th className="text-center py-2 px-2">Precision</th>
                                        <th className="text-center py-2 px-2">Recall</th>
                                        <th className="text-center py-2 px-2">F1</th>
                                        <th className="text-center py-2 px-2">数量</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(metrics.type_metrics).map(([type, m]: [string, any]) => (
                                        <tr key={type} className="border-b border-[var(--glass-border)]/50">
                                            <td className="py-2 px-2 text-[var(--text-secondary)]">{type}</td>
                                            <td className="text-center py-2 px-2 font-mono">{(m.precision * 100).toFixed(1)}%</td>
                                            <td className="text-center py-2 px-2 font-mono">{(m.recall * 100).toFixed(1)}%</td>
                                            <td className="text-center py-2 px-2 font-mono font-bold">{m.f1_score?.toFixed(3) || '-'}</td>
                                            <td className="text-center py-2 px-2 font-mono">{m.count || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
