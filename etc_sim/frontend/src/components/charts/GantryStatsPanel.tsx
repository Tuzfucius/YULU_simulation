/**
 * GantryStatsPanel — 门架区间评估统计面板
 *
 * 展示每个 ETC 门架区间的：
 *   - 真实异常车辆数 (GT)
 *   - 预测异常数 (Alert)
 *   - 匹配成功数 (TP)
 *   - 漏报数 (FN) / 误报数 (FP)
 *   - 检测率（带颜色编码条形图）
 */

import type { FC } from 'react';

export interface GantryStat {
    segment_id: number;
    label: string;
    start_km: number;
    end_km: number;
    ground_truth_count: number;
    alert_count: number;
    matched_count: number;
    false_positive_count: number;
    false_negative_count: number;
    detection_rate: number;
}

interface GantryStatsPanelProps {
    stats: GantryStat[];
    segmentBoundaries?: number[];
}

function getRateColor(rate: number): string {
    if (rate >= 0.8) return 'var(--accent-green, #22c55e)';
    if (rate >= 0.5) return '#f59e0b';
    return '#ef4444';
}

function getRateBg(rate: number): string {
    if (rate >= 0.8) return 'rgba(34,197,94,0.12)';
    if (rate >= 0.5) return 'rgba(245,158,11,0.12)';
    return 'rgba(239,68,68,0.12)';
}

function getRateLabel(rate: number): string {
    if (rate >= 0.8) return '良好';
    if (rate >= 0.5) return '一般';
    return '较差';
}

export const GantryStatsPanel: FC<GantryStatsPanelProps> = ({ stats, segmentBoundaries }) => {
    if (!stats || stats.length === 0) {
        return (
            <div className="text-center py-8 text-sm text-[var(--text-muted)]">
                暂无门架区间统计数据（请先运行评估）
            </div>
        );
    }

    const totalGT = stats.reduce((s, r) => s + r.ground_truth_count, 0);
    const totalAlert = stats.reduce((s, r) => s + r.alert_count, 0);
    const totalMatched = stats.reduce((s, r) => s + r.matched_count, 0);
    const overallRate = totalGT > 0 ? totalMatched / totalGT : 0;

    return (
        <div className="space-y-4">
            {/* 汇总行 */}
            <div className="grid grid-cols-4 gap-3">
                {[
                    { label: '门架区间数', val: stats.length, color: 'var(--accent-blue)' },
                    { label: '真实异常总数', val: totalGT, color: '#ef4444' },
                    { label: '预测异常总数', val: totalAlert, color: '#f59e0b' },
                    { label: '整体检测率', val: `${(overallRate * 100).toFixed(1)}%`, color: getRateColor(overallRate) },
                ].map(({ label, val, color }) => (
                    <div key={label} className="rounded-lg border border-[var(--glass-border)] bg-[rgba(255,255,255,0.03)] p-3 text-center">
                        <p className="text-[10px] text-[var(--text-muted)] mb-1">{label}</p>
                        <p className="text-xl font-bold font-mono" style={{ color }}>{val}</p>
                    </div>
                ))}
            </div>

            {/* 路段可视化条（地图轴） */}
            {segmentBoundaries && segmentBoundaries.length >= 2 && (
                <div className="relative h-10 rounded-lg overflow-hidden border border-[var(--glass-border)] bg-[rgba(0,0,0,0.2)]">
                    <div className="absolute inset-0 flex">
                        {stats.map((seg, i) => {
                            const totalLen = segmentBoundaries[segmentBoundaries.length - 1] - segmentBoundaries[0];
                            const segLen = seg.end_km - seg.start_km;
                            const widthPct = totalLen > 0 ? (segLen / totalLen) * 100 : 100 / stats.length;
                            return (
                                <div
                                    key={i}
                                    className="h-full flex items-center justify-center text-[9px] font-mono border-r border-[var(--glass-border)] last:border-r-0 transition-all"
                                    style={{
                                        width: `${widthPct}%`,
                                        background: getRateBg(seg.detection_rate),
                                        color: getRateColor(seg.detection_rate),
                                    }}
                                    title={`${seg.label}\n检测率: ${(seg.detection_rate * 100).toFixed(1)}%`}
                                >
                                    G{i}~G{i + 1}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 详细表格 */}
            <div className="overflow-x-auto rounded-lg border border-[var(--glass-border)]">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="bg-[rgba(255,255,255,0.04)] text-[var(--text-muted)] border-b border-[var(--glass-border)]">
                            <th className="text-left py-2 px-3 font-medium">区间</th>
                            <th className="text-left py-2 px-3 font-medium">范围</th>
                            <th className="text-center py-2 px-3 font-medium">真实异常<br/><span className="text-[9px] opacity-60">(GT)</span></th>
                            <th className="text-center py-2 px-3 font-medium">预测数<br/><span className="text-[9px] opacity-60">(Alert)</span></th>
                            <th className="text-center py-2 px-3 font-medium">匹配 TP</th>
                            <th className="text-center py-2 px-3 font-medium">漏报 FN</th>
                            <th className="text-center py-2 px-3 font-medium">误报 FP</th>
                            <th className="text-left py-2 px-3 font-medium" style={{ minWidth: 160 }}>检测率</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stats.map((seg) => {
                            const ratePct = (seg.detection_rate * 100).toFixed(1);
                            const barColor = getRateColor(seg.detection_rate);
                            return (
                                <tr
                                    key={seg.segment_id}
                                    className="border-b border-[var(--glass-border)]/50 hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                                >
                                    <td className="py-2 px-3 font-medium text-[var(--text-primary)]">
                                        区间 {seg.segment_id}
                                    </td>
                                    <td className="py-2 px-3 font-mono text-[var(--text-muted)] text-[10px]">
                                        {seg.start_km}~{seg.end_km} km
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                        <span className="font-mono font-bold text-red-400">{seg.ground_truth_count}</span>
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                        <span className="font-mono text-yellow-400">{seg.alert_count}</span>
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                        <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-green-500/15 text-green-400 font-mono font-bold">
                                            {seg.matched_count}
                                        </span>
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                        <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-red-500/15 text-red-400 font-mono">
                                            {seg.false_negative_count}
                                        </span>
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                        <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-yellow-500/15 text-yellow-400 font-mono">
                                            {seg.false_positive_count}
                                        </span>
                                    </td>
                                    <td className="py-2 px-3">
                                        <div className="flex items-center gap-2">
                                            {/* 条形图 */}
                                            <div className="flex-1 h-2 rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-500"
                                                    style={{
                                                        width: `${Math.min(seg.detection_rate * 100, 100)}%`,
                                                        background: barColor,
                                                    }}
                                                />
                                            </div>
                                            <span
                                                className="text-[10px] font-mono font-bold shrink-0"
                                                style={{ color: barColor, minWidth: 40 }}
                                            >
                                                {ratePct}%
                                            </span>
                                            <span
                                                className="text-[9px] px-1.5 py-0.5 rounded shrink-0"
                                                style={{
                                                    background: getRateBg(seg.detection_rate),
                                                    color: barColor,
                                                }}
                                            >
                                                {getRateLabel(seg.detection_rate)}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    {/* 合计行 */}
                    <tfoot>
                        <tr className="bg-[rgba(255,255,255,0.03)] border-t border-[var(--glass-border)] text-[var(--text-secondary)]">
                            <td colSpan={2} className="py-2 px-3 font-medium">合计</td>
                            <td className="py-2 px-3 text-center font-mono font-bold text-red-400">{totalGT}</td>
                            <td className="py-2 px-3 text-center font-mono text-yellow-400">{totalAlert}</td>
                            <td className="py-2 px-3 text-center font-mono font-bold text-green-400">{totalMatched}</td>
                            <td className="py-2 px-3 text-center font-mono text-red-400">
                                {stats.reduce((s, r) => s + r.false_negative_count, 0)}
                            </td>
                            <td className="py-2 px-3 text-center font-mono text-yellow-400">
                                {stats.reduce((s, r) => s + r.false_positive_count, 0)}
                            </td>
                            <td className="py-2 px-3">
                                <span className="text-[11px] font-mono font-bold" style={{ color: getRateColor(overallRate) }}>
                                    {(overallRate * 100).toFixed(1)}%
                                </span>
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};
