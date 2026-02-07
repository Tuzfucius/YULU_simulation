/**
 * 简单的折线图组件 - 纯 HTML/CSS 实现
 */

import React from 'react';

interface SimpleLineChartProps {
    data: Array<{ time: number; value: number; label?: string }>;
    height?: number;
    color?: string;
    fillColor?: string;
}

export const SimpleLineChart: React.FC<SimpleLineChartProps> = ({
    data,
    height = 200,
    color = '#D0BCFF',
    fillColor = 'rgba(208, 188, 255, 0.2)'
}) => {
    if (!data || data.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-[#938F99]">
                No data available
            </div>
        );
    }

    const maxValue = Math.max(...data.map(d => d.value), 1);
    const points = data.map((d, i) => {
        const x = (i / (data.length - 1)) * 100;
        const y = 100 - (d.value / maxValue) * 80; // 留 20% 空间
        return `${x},${y}`;
    }).join(' ');

    const fillPoints = `0,100 ${points} 100,100`;

    return (
        <div className="w-full relative" style={{ height: `${height}px` }}>
            <svg width="100%" height="100%" className="overflow-visible">
                {/* 填充区域 */}
                <polygon
                    points={fillPoints}
                    fill={fillColor}
                    className="transition-all duration-500"
                />
                {/* 线条 */}
                <polyline
                    points={points}
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    className="transition-all duration-500"
                />
                {/* 数据点 */}
                {data.map((d, i) => {
                    const x = (i / (data.length - 1)) * 100;
                    const y = 100 - (d.value / maxValue) * 80;
                    return (
                        <circle
                            key={i}
                            cx={`${x}%`}
                            cy={`${y}%`}
                            r="3"
                            fill={color}
                            className="transition-all duration-500"
                        >
                            <title>{d.label || d.value}</title>
                        </circle>
                    );
                })}
            </svg>
        </div>
    );
};
