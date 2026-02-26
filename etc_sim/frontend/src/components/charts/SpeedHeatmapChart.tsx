
import React, { useMemo } from 'react';
import { ResponsiveContainer, Tooltip } from 'recharts';

interface SpeedHeatmapProps {
    data: { time: number; segment: number; speed: number }[];
    maxTime: number; // minutes
    numSegments: number;
}

export const SpeedHeatmapChart: React.FC<SpeedHeatmapProps> = ({ data, maxTime, numSegments }) => {
    // Config
    const height = 220;
    const margin = { top: 10, right: 10, bottom: 20, left: 30 };

    // Color scale function: Green (80+) -> Yellow (40) -> Red (0)
    const getColor = (speed: number) => {
        if (speed >= 80) return `rgba(76, 175, 80, ${0.4 + (speed - 80) / 40 * 0.6})`; // Green
        if (speed >= 40) return `rgba(255, 193, 7, ${0.6 + (speed - 40) / 40 * 0.4})`; // Yellow/Orange
        return `rgba(244, 67, 54, ${1 - speed / 40})`; // Red
    };

    const processedData = useMemo(() => {
        if (!data || data.length === 0) return [];

        // Group by segment and time bin
        const cellSizeX = 100 / (maxTime || 1);
        const cellSizeY = 100 / (numSegments || 1);

        return data.map((d) => ({
            ...d,
            color: getColor(d.speed),
            opacity: 0.8,
            x: (d.time / maxTime) * 100, // percentage
            y: ((numSegments - 1 - d.segment) / numSegments) * 100, // percentage, inverted Y
            width: cellSizeX,
            height: cellSizeY
        }));
    }, [data, maxTime, numSegments]);

    if (!data || data.length === 0) {
        return (
            <div className="h-[220px] flex items-center justify-center text-[var(--text-secondary)]">
                No heatmap data available
            </div>
        );
    }

    return (
        <div className="relative w-full h-[220px] select-none">
            {/* Labels */}
            <div className="absolute left-0 top-0 h-full w-[30px] flex flex-col justify-between text-[10px] text-[var(--text-secondary)] py-2">
                <span>{numSegments * 1}km</span>
                <span>0km</span>
            </div>
            <div className="absolute left-[30px] bottom-0 w-[calc(100%-30px)] flex justify-between text-[10px] text-[var(--text-secondary)] px-1">
                <span>0m</span>
                <span>{maxTime}m</span>
            </div>

            {/* Grid */}
            <div className="absolute left-[30px] top-0 w-[calc(100%-30px)] h-[calc(100%-20px)] bg-[var(--glass-bg)] border border-[var(--glass-border)] ml-1 overflow-hidden rounded-lg">
                {processedData.map((cell, idx) => (
                    <div
                        key={idx}
                        className="absolute transition-all duration-500"
                        style={{
                            left: `${cell.x}%`,
                            top: `${cell.y}%`,
                            width: `${Math.max(cell.width, 1)}%`,
                            height: `${Math.max(cell.height, 1)}%`,
                            backgroundColor: cell.color,
                        }}
                        title={`Time: ${cell.time}m, Seg: ${cell.segment}km, Speed: ${cell.speed.toFixed(1)}km/h`}
                    />
                ))}
            </div>

            {/* Legend */}
            <div className="absolute right-2 top-2 flex flex-col gap-1 bg-black/40 p-2 rounded text-[10px] text-white">
                <div className="flex items-center gap-1"><div className="w-2 h-2 bg-green-500 rounded-full"></div> &gt;80km/h</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 bg-yellow-500 rounded-full"></div> 40-80</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500 rounded-full"></div> &lt;40</div>
            </div>
        </div>
    );
};
