/**
 * 时间段过滤器组件
 * 用于选择时间区间进行细节分析
 */

import React, { useState } from 'react';

interface TimeRangeFilterProps {
    totalTime: number;
    onFilterChange: (start: number, end: number) => void;
    disabled?: boolean;
}

export const TimeRangeFilter: React.FC<TimeRangeFilterProps> = ({
    totalTime,
    onFilterChange,
    disabled
}) => {
    const [startTime, setStartTime] = useState(0);
    const [endTime, setEndTime] = useState(totalTime);

    const handleStartChange = (value: number) => {
        const newStart = Math.min(value, endTime - 10);
        setStartTime(newStart);
        onFilterChange(newStart, endTime);
    };

    const handleEndChange = (value: number) => {
        const newEnd = Math.max(value, startTime + 10);
        setEndTime(newEnd);
        onFilterChange(startTime, newEnd);
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="p-4 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)]">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-[var(--text-secondary)]">⏱️ 时间段过滤</h4>
                <button
                    onClick={() => {
                        setStartTime(0);
                        setEndTime(totalTime);
                        onFilterChange(0, totalTime);
                    }}
                    disabled={disabled}
                    className="text-xs px-2 py-1 rounded bg-[var(--glass-bg-hover)] hover:bg-[rgba(255,255,255,0.1)] transition-colors"
                >
                    重置
                </button>
            </div>

            <div className="space-y-3">
                {/* 起始时间 */}
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <label className="text-xs text-[var(--text-muted)]">起始时间</label>
                        <span className="text-xs font-mono text-[var(--accent-blue)]">{formatTime(startTime)}</span>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={totalTime}
                        value={startTime}
                        onChange={e => handleStartChange(+e.target.value)}
                        disabled={disabled}
                        className="w-full"
                    />
                </div>

                {/* 结束时间 */}
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <label className="text-xs text-[var(--text-muted)]">结束时间</label>
                        <span className="text-xs font-mono text-[var(--accent-purple)]">{formatTime(endTime)}</span>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={totalTime}
                        value={endTime}
                        onChange={e => handleEndChange(+e.target.value)}
                        disabled={disabled}
                        className="w-full"
                    />
                </div>

                {/* 时长显示 */}
                <div className="pt-2 border-t border-[var(--glass-border)] flex items-center justify-between text-xs">
                    <span className="text-[var(--text-muted)]">选中时长</span>
                    <span className="text-[var(--accent-green)] font-medium">{formatTime(endTime - startTime)}</span>
                </div>
            </div>
        </div>
    );
};
