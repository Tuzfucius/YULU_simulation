
import React, { useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrajectoryPoint } from '../../engine/SimulationEngine';

interface TrajectoryChartProps {
    data: TrajectoryPoint[];
}

export const TrajectoryChart: React.FC<TrajectoryChartProps> = ({ data }) => {
    // Config
    // We only take a subset if data is too large, handled by parent

    // Custom tooltip
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const d = payload[0].payload;
            return (
                <div className="bg-[var(--glass-bg)] border border-white/10 rounded-lg p-2 text-xs text-[var(--text-primary)]">
                    <p>Time: {d.time.toFixed(1)}s</p>
                    <p>Pos: {(d.pos / 1000).toFixed(2)}km</p>
                    <p>Speed: {(d.speed * 3.6).toFixed(1)}km/h</p>
                    <p>Lane: {d.lane}</p>
                    <p>ID: {d.id}</p>
                    {d.isAffected && <p className="text-red-400">Affected</p>}
                </div>
            );
        }
        return null;
    };

    if (!data || data.length === 0) {
        return (
            <div className="h-[300px] flex items-center justify-center text-[var(--text-secondary)]">
                No trajectory data available
            </div>
        );
    }

    return (
        <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#49454F" />
                <XAxis
                    type="number"
                    dataKey="time"
                    name="Time"
                    unit="s"
                    stroke="#CAC4D0"
                    fontSize={11}
                    domain={['dataMin', 'dataMax']}
                />
                <YAxis
                    type="number"
                    dataKey="pos"
                    name="Position"
                    unit="m"
                    stroke="#CAC4D0"
                    fontSize={11}
                    tickFormatter={(val) => (val / 1000).toFixed(1) + 'km'}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                <Scatter name="Vehicles" data={data} fill="#D0BCFF" shape="circle">
                    {data.map((entry, index) => (
                        <Cell
                            key={`cell-${index}`}
                            fill={entry.isAffected ? '#FF5252' : (entry.anomalyState === 'active' ? '#FFD740' : '#D0BCFF')}
                            r={1.5} // Small radius for dense points
                        />
                    ))}
                </Scatter>
            </ScatterChart>
        </ResponsiveContainer>
    );
};
