import React, { useState } from 'react';

const SCALE_M_PER_UNIT = 2; // 1 画布单位 = 2 米

interface PathNode {
    x: number;
    y: number;
    radius?: number;
}

interface PreciseInputProps {
    lastNode: PathNode;
    onAddSegment: (node: PathNode) => void;
}

export function PreciseInput({ lastNode, onAddSegment }: PreciseInputProps) {
    const [length, setLength] = useState(200);   // 米
    const [angle, setAngle] = useState(0);        // 度
    const [radius, setRadius] = useState(0);      // 圆弧半径（米），0=尖角

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // 将米转换为画布单位
        const lengthUnits = length / SCALE_M_PER_UNIT;
        const rad = (angle * Math.PI) / 180;
        const dx = lengthUnits * Math.cos(rad);
        const dy = lengthUnits * Math.sin(rad);

        onAddSegment({
            x: lastNode.x + dx,
            y: lastNode.y + dy,
            radius: radius > 0 ? radius : undefined
        });
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="glass-card p-4 rounded-lg shadow-xl border border-[var(--glass-border)] bg-[rgba(20,20,35,0.92)] backdrop-blur w-64"
        >
            <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase mb-3">精确输入</h3>

            <div className="space-y-2.5">
                <div className="flex justify-between items-center">
                    <label className="text-sm text-[var(--text-secondary)]">长度 (m)</label>
                    <input
                        type="number"
                        min={1}
                        value={length}
                        onChange={e => setLength(Number(e.target.value))}
                        className="w-24 bg-[rgba(0,0,0,0.3)] border border-[var(--glass-border)] rounded px-2 py-1 text-right text-sm focus:border-[var(--accent-blue)] outline-none"
                    />
                </div>

                <div className="flex justify-between items-center">
                    <label className="text-sm text-[var(--text-secondary)]">角度 (°)</label>
                    <input
                        type="number"
                        value={angle}
                        onChange={e => setAngle(Number(e.target.value))}
                        className="w-24 bg-[rgba(0,0,0,0.3)] border border-[var(--glass-border)] rounded px-2 py-1 text-right text-sm focus:border-[var(--accent-blue)] outline-none"
                    />
                </div>

                <div className="flex justify-between items-center">
                    <label className="text-sm text-[var(--text-secondary)]">
                        圆弧半径 (m)
                        <span className="text-[10px] text-[var(--text-muted)] ml-1">0=尖角</span>
                    </label>
                    <input
                        type="number"
                        min={0}
                        value={radius}
                        onChange={e => setRadius(Number(e.target.value))}
                        className="w-24 bg-[rgba(0,0,0,0.3)] border border-[var(--glass-border)] rounded px-2 py-1 text-right text-sm focus:border-[var(--accent-blue)] outline-none"
                    />
                </div>

                <button
                    type="submit"
                    className="w-full bg-[var(--accent-blue)] hover:bg-blue-600 text-white rounded py-1.5 text-sm font-medium transition-colors mt-1"
                >
                    添加节点 ⏎
                </button>
            </div>

            <div className="mt-2 text-[10px] text-[var(--text-muted)] text-center">
                0° = 右, 90° = 下 | 1格 = 100m
            </div>
        </form>
    );
}
