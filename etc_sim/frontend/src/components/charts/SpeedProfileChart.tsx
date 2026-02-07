/**
 * 车流速度画像图 - 展示平均速度随时间的变化
 * 参考 模拟车流.py 的 SpeedProfilePlotter
 */

import React from 'react';
import { SimpleLineChart } from './SimpleLineChart';

interface SpeedProfileChartProps {
    data: Array<{ timeSegment: number; avgSpeed: number; label?: string }>;
    height?: number;
}

export const SpeedProfileChart: React.FC<SpeedProfileChartProps> = ({ data, height = 300 }) => {
    if (!data || data.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-[var(--text-tertiary)]">
                无数据可用
            </div>
        );
    }

    // 转换为 SimpleLineChart 所需格式
    const chartData = data.map(d => ({
        time: d.timeSegment,
        value: d.avgSpeed,
        label: `${d.label || d.timeSegment}: ${d.avgSpeed.toFixed(1)} km/h`,
    }));

    // 计算统计信息
    const avgSpeed = data.reduce((sum, d) => sum + d.avgSpeed, 0) / data.length;
    const maxSpeed = Math.max(...data.map(d => d.avgSpeed));
    const minSpeed = Math.min(...data.map(d => d.avgSpeed));

    return (
        <div className="space-y-4">
            {/* 统计信息 */}
            <div className="flex gap-6 text-sm">
                <div>
                    <span className="text-[var(--text-tertiary)]">平均: </span>
                    <span className="text-[var(--accent)] font-medium">{avgSpeed.toFixed(1)} km/h</span>
                </div>
                <div>
                    <span className="text-[var(--text-tertiary)]">最大: </span>
                    <span className="text-[var(--success)] font-medium">{maxSpeed.toFixed(1)} km/h</span>
                </div>
                <div>
                    <span className="text-[var(--text-tertiary)]">最小: </span>
                    <span className="text-[var(--warning)] font-medium">{minSpeed.toFixed(1)} km/h</span>
                </div>
            </div>

            {/* 图表 */}
            <SimpleLineChart
                data={chartData}
                height={height}
                color="var(--accent)"
                fillColor="var(--accent-light)"
            />

            {/* X 轴标签 */}
            <div className="flex justify-between text-xs text-[var(--text-tertiary)] px-2">
                <span>起点</span>
                <span>时间段</span>
                <span>终点</span>
            </div>
        </div>
    );
};
