import { useMemo } from 'react';

interface SpeedHeatmapProps {
    data: { time: number; segment: number; speed: number }[];
    maxTime: number;
    numSegments: number;
}

export const SpeedHeatmapChart = ({ data, maxTime, numSegments }: SpeedHeatmapProps) => {
    const getColor = (speed: number) => {
        if (speed >= 80) {
            return `rgba(76, 175, 80, ${0.4 + ((speed - 80) / 40) * 0.6})`;
        }
        if (speed >= 40) {
            return `rgba(255, 193, 7, ${0.6 + ((speed - 40) / 40) * 0.4})`;
        }
        return `rgba(244, 67, 54, ${1 - speed / 40})`;
    };

    const processedData = useMemo(() => {
        if (data.length === 0) {
            return [];
        }

        const cellSizeX = 100 / (maxTime || 1);
        const cellSizeY = 100 / (numSegments || 1);

        return data.map((item) => ({
            ...item,
            color: getColor(item.speed),
            x: (item.time / maxTime) * 100,
            y: ((numSegments - 1 - item.segment) / numSegments) * 100,
            width: cellSizeX,
            height: cellSizeY,
        }));
    }, [data, maxTime, numSegments]);

    if (data.length === 0) {
        return (
            <div className="flex h-[220px] items-center justify-center text-[var(--text-secondary)]">
                No heatmap data available
            </div>
        );
    }

    return (
        <div className="relative h-[220px] w-full select-none">
            <div className="absolute left-0 top-0 flex h-full w-[30px] flex-col justify-between py-2 text-[10px] text-[var(--text-secondary)]">
                <span>{numSegments}km</span>
                <span>0km</span>
            </div>
            <div className="absolute bottom-0 left-[30px] flex w-[calc(100%-30px)] justify-between px-1 text-[10px] text-[var(--text-secondary)]">
                <span>0m</span>
                <span>{maxTime}m</span>
            </div>

            <div className="absolute left-[30px] top-0 ml-1 h-[calc(100%-20px)] w-[calc(100%-30px)] overflow-hidden rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)]">
                {processedData.map((cell, index) => (
                    <div
                        key={index}
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

            <div className="absolute right-2 top-2 flex flex-col gap-1 rounded bg-black/40 p-2 text-[10px] text-white">
                <div className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-green-500" /> &gt;80km/h</div>
                <div className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-yellow-500" /> 40-80</div>
                <div className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-red-500" /> &lt;40</div>
            </div>
        </div>
    );
};
