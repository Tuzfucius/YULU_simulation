/**
 * 预警评估仪表板
 * 
 * 展示关键指标：Precision/Recall/F1、检测延迟、
 * 混淆矩阵微缩图、按异常类型细分的雷达图。
 */

import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = 'http://localhost:8000/api/evaluation';

interface MetricsData {
    precision: number;
    recall: number;
    f1_score: number;
    total_ground_truths: number;
    total_alerts: number;
    true_positives: number;
    false_positives: number;
    false_negatives: number;
    mean_detection_delay_s: number;
    median_detection_delay_s: number;
    max_detection_delay_s: number;
    mean_position_error_km: number;
}

interface EvalData {
    metrics: MetricsData;
    category_metrics: {
        by_anomaly_type: Record<string, MetricsData>;
        by_severity: Record<string, MetricsData>;
    };
    match_details?: Array<{
        ground_truth: {
            vehicle_id: number;
            anomaly_type: number;
            trigger_time: number;
            position_km: number;
        };
        matched: boolean;
        detection_delay: number | null;
        position_error_km: number | null;
        alert_rule: string | null;
    }>;
}

const ANOMALY_TYPE_NAMES: Record<string, string> = {
    '1': '停车事故',
    '2': '短时缓行',
    '3': '长时缓行',
};

// 单个指标卡
function MetricCard({ label, value, unit, color, large }: {
    label: string;
    value: string | number;
    unit?: string;
    color?: string;
    large?: boolean;
}) {
    return (
        <div className="glass-card p-4 flex flex-col items-center justify-center text-center">
            <span className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1">{label}</span>
            <span
                className={`font-bold ${large ? 'text-3xl' : 'text-2xl'}`}
                style={{ color: color || 'var(--text-primary)' }}
            >
                {value}
            </span>
            {unit && <span className="text-[10px] text-[var(--text-muted)] mt-0.5">{unit}</span>}
        </div>
    );
}

// F1 仪表盘圆弧
function F1Gauge({ value }: { value: number }) {
    const pct = Math.min(value * 100, 100);
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (pct / 100) * circumference;

    const color = pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444';

    return (
        <div className="flex flex-col items-center">
            <svg width="130" height="130" viewBox="-10 -10 130 130">
                <circle
                    cx="55" cy="55" r={radius}
                    fill="none"
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth="10"
                />
                <circle
                    cx="55" cy="55" r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth="10"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    transform="rotate(-90 55 55)"
                    style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                />
                <text x="55" y="52" textAnchor="middle" fill={color} fontSize="24" fontWeight="bold">
                    {(pct).toFixed(1)}
                </text>
                <text x="55" y="70" textAnchor="middle" fill="var(--text-muted)" fontSize="10">
                    F1 Score
                </text>
            </svg>
        </div>
    );
}

// 混淆矩阵微缩图
function ConfusionMatrix({ tp, fp, fn }: { tp: number; fp: number; fn: number }) {
    const total = tp + fp + fn || 1;
    return (
        <div className="glass-card p-4">
            <h4 className="text-xs font-semibold text-[var(--text-secondary)] mb-3">混淆矩阵</h4>
            <div className="grid grid-cols-2 gap-1 text-center text-xs">
                <div className="p-3 rounded-lg" style={{ background: 'rgba(34,197,94,0.12)' }}>
                    <div className="text-lg font-bold" style={{ color: '#22c55e' }}>{tp}</div>
                    <div className="text-[var(--text-muted)]">TP</div>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.12)' }}>
                    <div className="text-lg font-bold" style={{ color: '#ef4444' }}>{fp}</div>
                    <div className="text-[var(--text-muted)]">FP</div>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'rgba(249,115,22,0.12)' }}>
                    <div className="text-lg font-bold" style={{ color: '#f97316' }}>{fn}</div>
                    <div className="text-[var(--text-muted)]">FN</div>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <div className="text-lg font-bold text-[var(--text-secondary)]">{total}</div>
                    <div className="text-[var(--text-muted)]">Total</div>
                </div>
            </div>
        </div>
    );
}

// 检测延迟柱状图
function DelayBar({ label, value, max }: { label: string; value: number; max: number }) {
    const pct = max > 0 ? (value / max) * 100 : 0;
    const color = value <= 30 ? '#22c55e' : value <= 60 ? '#f59e0b' : '#ef4444';
    return (
        <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--text-muted)] w-10 text-right">{label}</span>
            <div className="flex-1 h-4 rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(pct, 100)}%`, background: color }}
                />
            </div>
            <span className="text-[10px] font-medium text-[var(--text-secondary)] w-12">{value.toFixed(1)}s</span>
        </div>
    );
}

export function EvaluationPage() {
    const [evalData, setEvalData] = useState<EvalData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const resp = await fetch(`${API_BASE}/metrics`);
            const json = await resp.json();
            if (json.success && json.data) {
                setEvalData(json.data);
            } else {
                setEvalData(null);
            }
        } catch (e) {
            setError(`加载失败: ${e}`);
        } finally {
            setLoading(false);
        }
    }, []);

    const runEvaluation = useCallback(async () => {
        setLoading(true);
        try {
            const resp = await fetch(`${API_BASE}/evaluate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ time_window_s: 120, distance_window_km: 2.0 }),
            });
            const json = await resp.json();
            if (json.success && json.data) {
                setEvalData(json.data);
            }
        } catch (e) {
            setError(`评估失败: ${e}`);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const m = evalData?.metrics;

    return (
        <div className="h-full overflow-y-auto">
            <div className="max-w-[1400px] mx-auto p-6 space-y-6">
                {/* 页面标题 */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                            <span>📊</span> 预警评估仪表板
                        </h1>
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                            对比规则引擎输出与仿真真值，量化评估预警性能
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={fetchData}
                            disabled={loading}
                            className="text-xs px-3 py-1.5 rounded-lg bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/25 transition-colors disabled:opacity-50"
                        >
                            刷新
                        </button>
                        <button
                            onClick={runEvaluation}
                            disabled={loading}
                            className="text-xs px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors disabled:opacity-50"
                        >
                            重新评估
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="glass-card p-3 border-l-2 border-red-500 text-red-400 text-xs">{error}</div>
                )}

                {!m ? (
                    <div className="glass-card p-12 text-center">
                        <span className="text-4xl block mb-3">🔍</span>
                        <p className="text-sm text-[var(--text-muted)]">
                            {loading ? '加载中...' : '暂无评估数据，请先完成一次仿真'}
                        </p>
                    </div>
                ) : (
                    <>
                        {/* 核心指标行 */}
                        <div className="grid grid-cols-5 gap-4">
                            <div className="col-span-1 glass-card p-4 flex items-center justify-center">
                                <F1Gauge value={m.f1_score} />
                            </div>
                            <MetricCard
                                label="Precision"
                                value={(m.precision * 100).toFixed(1) + '%'}
                                color={m.precision >= 0.7 ? '#22c55e' : '#f59e0b'}
                            />
                            <MetricCard
                                label="Recall"
                                value={(m.recall * 100).toFixed(1) + '%'}
                                color={m.recall >= 0.7 ? '#22c55e' : '#f59e0b'}
                            />
                            <MetricCard label="真值事件" value={m.total_ground_truths} unit="个" />
                            <MetricCard label="预警事件" value={m.total_alerts} unit="个" />
                        </div>

                        {/* 第二行 */}
                        <div className="grid grid-cols-3 gap-4">
                            <ConfusionMatrix tp={m.true_positives} fp={m.false_positives} fn={m.false_negatives} />

                            {/* 检测延迟 */}
                            <div className="glass-card p-4 col-span-1">
                                <h4 className="text-xs font-semibold text-[var(--text-secondary)] mb-3">检测延迟</h4>
                                <div className="space-y-2">
                                    <DelayBar label="平均" value={m.mean_detection_delay_s} max={m.max_detection_delay_s || 120} />
                                    <DelayBar label="中位" value={m.median_detection_delay_s} max={m.max_detection_delay_s || 120} />
                                    <DelayBar label="最大" value={m.max_detection_delay_s} max={m.max_detection_delay_s || 120} />
                                </div>
                                <div className="mt-3 text-center">
                                    <span className="text-xs text-[var(--text-muted)]">
                                        位置误差: {m.mean_position_error_km.toFixed(3)} km
                                    </span>
                                </div>
                            </div>

                            {/* 按异常类型细分 */}
                            <div className="glass-card p-4 col-span-1">
                                <h4 className="text-xs font-semibold text-[var(--text-secondary)] mb-3">按异常类型</h4>
                                <div className="space-y-2">
                                    {Object.entries(evalData?.category_metrics?.by_anomaly_type || {}).map(([typeKey, typeMetrics]) => {
                                        const tm = typeMetrics as MetricsData;
                                        return (
                                            <div key={typeKey} className="flex items-center gap-2 text-xs">
                                                <span className="flex-1 text-[var(--text-secondary)]">
                                                    {ANOMALY_TYPE_NAMES[typeKey] || `类型 ${typeKey}`}
                                                </span>
                                                <span className="text-[var(--text-muted)]">
                                                    GT:{tm.total_ground_truths}
                                                </span>
                                                <span
                                                    className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                                                    style={{
                                                        background: tm.recall >= 0.7 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                                                        color: tm.recall >= 0.7 ? '#22c55e' : '#ef4444',
                                                    }}
                                                >
                                                    R:{(tm.recall * 100).toFixed(0)}%
                                                </span>
                                                <span className="text-[var(--text-muted)]">
                                                    d̄:{tm.mean_detection_delay_s.toFixed(0)}s
                                                </span>
                                            </div>
                                        );
                                    })}
                                    {Object.keys(evalData?.category_metrics?.by_anomaly_type || {}).length === 0 && (
                                        <p className="text-[var(--text-muted)] text-center py-2">暂无数据</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 匹配详情表格 */}
                        {evalData?.match_details && evalData.match_details.length > 0 && (
                            <div className="glass-card p-4">
                                <h4 className="text-xs font-semibold text-[var(--text-secondary)] mb-3">
                                    匹配详情（前 {Math.min(evalData.match_details.length, 20)} 条）
                                </h4>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="text-[var(--text-muted)] border-b border-[var(--glass-border)]">
                                                <th className="py-2 px-2 text-left">车辆 ID</th>
                                                <th className="py-2 px-2 text-left">异常类型</th>
                                                <th className="py-2 px-2 text-right">触发时间</th>
                                                <th className="py-2 px-2 text-right">位置 (km)</th>
                                                <th className="py-2 px-2 text-center">匹配</th>
                                                <th className="py-2 px-2 text-right">检测延迟</th>
                                                <th className="py-2 px-2 text-left">规则</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {evalData.match_details.slice(0, 20).map((d, i) => (
                                                <tr
                                                    key={i}
                                                    className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)]"
                                                >
                                                    <td className="py-1.5 px-2 text-[var(--text-secondary)]">{d.ground_truth.vehicle_id}</td>
                                                    <td className="py-1.5 px-2">
                                                        <span
                                                            className="px-1.5 py-0.5 rounded text-[10px]"
                                                            style={{
                                                                background: d.ground_truth.anomaly_type === 1 ? 'rgba(239,68,68,0.15)' :
                                                                    d.ground_truth.anomaly_type === 2 ? 'rgba(249,115,22,0.15)' : 'rgba(251,191,36,0.15)',
                                                                color: d.ground_truth.anomaly_type === 1 ? '#ef4444' :
                                                                    d.ground_truth.anomaly_type === 2 ? '#f97316' : '#fbbf24',
                                                            }}
                                                        >
                                                            {ANOMALY_TYPE_NAMES[String(d.ground_truth.anomaly_type)] || `T${d.ground_truth.anomaly_type}`}
                                                        </span>
                                                    </td>
                                                    <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{d.ground_truth.trigger_time.toFixed(0)}s</td>
                                                    <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{d.ground_truth.position_km.toFixed(2)}</td>
                                                    <td className="py-1.5 px-2 text-center">
                                                        {d.matched ? (
                                                            <span className="text-green-400">✓</span>
                                                        ) : (
                                                            <span className="text-red-400">✗</span>
                                                        )}
                                                    </td>
                                                    <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">
                                                        {d.detection_delay != null ? `${d.detection_delay.toFixed(1)}s` : '—'}
                                                    </td>
                                                    <td className="py-1.5 px-2 text-[var(--text-secondary)] truncate max-w-[150px]">{d.alert_rule || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
