/**
 * 局部回放区间选择器
 * 
 * 提供路段范围（km）和时间范围（s）的双滑块选择 UI。
 * 支持滑块拖拽和数值直接输入。
 */

import React, { useCallback } from 'react';
import type { LocalRange } from './replayRenderers';

interface RangeSelectorProps {
    range: LocalRange;
    onChange: (range: LocalRange) => void;
    maxKm: number;         // 道路总长（km）
    maxTime: number;       // 最大时间（s）
    vehicleCount?: number; // 当前区间内车辆数
    isEn: boolean;
    collapsed?: boolean;
    onToggleCollapse?: () => void;
}

export const RangeSelector: React.FC<RangeSelectorProps> = ({
    range, onChange, maxKm, maxTime, vehicleCount, isEn, collapsed, onToggleCollapse,
}) => {
    const update = useCallback((field: keyof LocalRange, value: number) => {
        const next = { ...range, [field]: value };
        // 确保 start <= end
        if (field === 'startKm' && value > next.endKm) next.endKm = value;
        if (field === 'endKm' && value < next.startKm) next.startKm = value;
        if (field === 'startTime' && value > next.endTime) next.endTime = value;
        if (field === 'endTime' && value < next.startTime) next.startTime = value;
        onChange(next);
    }, [range, onChange]);

    if (collapsed) {
        return (
            <button
                onClick={onToggleCollapse}
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
                <span>▶</span>
                <span>{isEn ? 'Range Settings' : '区间设置'}</span>
                <span className="text-[10px] opacity-60">
                    {range.startKm.toFixed(1)}-{range.endKm.toFixed(1)}km | {range.startTime.toFixed(0)}-{range.endTime.toFixed(0)}s
                </span>
            </button>
        );
    }

    const sliderStyle = "w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[var(--accent-blue)]";
    const inputStyle = "w-16 px-1.5 py-0.5 text-xs text-center rounded bg-[rgba(255,255,255,0.05)] border border-[var(--glass-border)] text-[var(--text-primary)] focus:border-[var(--accent-blue)] focus:outline-none transition-colors";

    return (
        <div className="border-t border-[var(--glass-border)] bg-[var(--glass-bg)]">
            {/* 头部 */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--glass-border)]/50">
                <div className="flex items-center gap-2">
                    <span className="text-sm">🎯</span>
                    <span className="text-xs font-medium text-[var(--text-primary)]">
                        {isEn ? 'Range Settings' : '区间设置'}
                    </span>
                    {vehicleCount !== undefined && (
                        <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]">
                            {vehicleCount} {isEn ? 'vehicles' : '辆车'}
                        </span>
                    )}
                </div>
                {onToggleCollapse && (
                    <button
                        onClick={onToggleCollapse}
                        className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >▼</button>
                )}
            </div>

            {/* 路段范围 */}
            <div className="px-4 py-2.5">
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] text-[var(--text-muted)] w-14 shrink-0">
                        {isEn ? 'Road' : '路段'} (km)
                    </span>
                    <input
                        type="number"
                        value={range.startKm}
                        step={0.1}
                        min={0}
                        max={range.endKm}
                        onChange={e => update('startKm', Math.max(0, Number(e.target.value)))}
                        className={inputStyle}
                    />
                    <div className="flex-1 relative px-1">
                        {/* 双滑块用两个 range input 叠加实现 */}
                        <input
                            type="range"
                            min={0}
                            max={maxKm}
                            step={0.1}
                            value={range.startKm}
                            onChange={e => update('startKm', Number(e.target.value))}
                            className={`${sliderStyle} absolute inset-0`}
                            style={{ zIndex: 2, background: 'transparent' }}
                        />
                        <input
                            type="range"
                            min={0}
                            max={maxKm}
                            step={0.1}
                            value={range.endKm}
                            onChange={e => update('endKm', Number(e.target.value))}
                            className={sliderStyle}
                        />
                        {/* 高亮区间条 */}
                        <div
                            className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-[var(--accent-blue)]/30 rounded-full pointer-events-none"
                            style={{
                                left: `${(range.startKm / maxKm) * 100}%`,
                                width: `${((range.endKm - range.startKm) / maxKm) * 100}%`,
                            }}
                        />
                    </div>
                    <input
                        type="number"
                        value={range.endKm}
                        step={0.1}
                        min={range.startKm}
                        max={maxKm}
                        onChange={e => update('endKm', Math.min(maxKm, Number(e.target.value)))}
                        className={inputStyle}
                    />
                </div>

                {/* 时间范围 */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--text-muted)] w-14 shrink-0">
                        {isEn ? 'Time' : '时间'} (s)
                    </span>
                    <input
                        type="number"
                        value={range.startTime}
                        step={1}
                        min={0}
                        max={range.endTime}
                        onChange={e => update('startTime', Math.max(0, Number(e.target.value)))}
                        className={inputStyle}
                    />
                    <div className="flex-1 relative px-1">
                        <input
                            type="range"
                            min={0}
                            max={maxTime}
                            step={1}
                            value={range.startTime}
                            onChange={e => update('startTime', Number(e.target.value))}
                            className={`${sliderStyle} absolute inset-0`}
                            style={{ zIndex: 2, background: 'transparent' }}
                        />
                        <input
                            type="range"
                            min={0}
                            max={maxTime}
                            step={1}
                            value={range.endTime}
                            onChange={e => update('endTime', Number(e.target.value))}
                            className={sliderStyle}
                        />
                        <div
                            className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-[var(--accent-blue)]/30 rounded-full pointer-events-none"
                            style={{
                                left: `${(range.startTime / maxTime) * 100}%`,
                                width: `${((range.endTime - range.startTime) / maxTime) * 100}%`,
                            }}
                        />
                    </div>
                    <input
                        type="number"
                        value={range.endTime}
                        step={1}
                        min={range.startTime}
                        max={maxTime}
                        onChange={e => update('endTime', Math.min(maxTime, Number(e.target.value)))}
                        className={inputStyle}
                    />
                </div>
            </div>
        </div>
    );
};
