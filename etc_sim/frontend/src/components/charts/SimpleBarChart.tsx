/**
 * 简单的条形图组件 - 纯 HTML/CSS 实现
 */

import React from 'react';

interface SimpleBarChartProps {
    data: Array<{ name: string; value: number; color?: string }>;
    height?: number;
    showValues?: boolean;
}

export const SimpleBarChart: React.FC<SimpleBarChartProps> = ({
    data,
    height = 200,
    showValues = true
}) => {
    if (!data || data.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-[#938F99]">
                No data available
            </div>
        );
    }

    const maxValue = Math.max(...data.map(d => d.value), 1);

    return (
        <div className="w-full" style={{ height: `${height}px` }}>
            <div className="flex flex-col gap-3 h-full justify-around py-2">
                {data.map((item, index) => {
                    const percentage = (item.value / maxValue) * 100;
                    return (
                        <div key={index} className="flex items-center gap-3">
                            <div className="w-24 text-right text-xs text-[#CAC4D0] truncate" title={item.name}>
                                {item.name}
                            </div>
                            <div className="flex-1 bg-[#36343B] rounded-full h-6 relative overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                                    style={{
                                        width: `${Math.max(percentage, 2)}%`,
                                        backgroundColor: item.color || '#D0BCFF'
                                    }}
                                >
                                    {showValues && percentage > 15 && (
                                        <span className="text-xs font-medium text-white">
                                            {item.value}
                                        </span>
                                    )}
                                </div>
                            </div>
                            {showValues && percentage <= 15 && (
                                <div className="w-12 text-xs text-[#CAC4D0]">
                                    {item.value}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
