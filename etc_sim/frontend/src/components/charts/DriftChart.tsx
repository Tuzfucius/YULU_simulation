import { useMemo } from 'react';
import {
    CartesianGrid,
    Cell,
    ReferenceLine,
    ResponsiveContainer,
    Scatter,
    ScatterChart,
    Tooltip,
    XAxis,
    YAxis,
    ZAxis,
} from 'recharts';

interface AnomalyData {
    time: number;
    segment: string;
    type: number;
}

interface PredictData {
    timestamp: number;
    target_segment: string;
    y_true: number;
    y_pred: number;
}

interface DriftPoint {
    tDiff: number;
    sDiff: number;
    level: number;
    xName: string;
    tName: string;
}

interface DriftChartProps {
    groundTruths: AnomalyData[];
    predictResults: PredictData[];
    height?: number;
}

const extractSegNum = (segStr: string | number | undefined) => {
    const value = String(segStr ?? '');
    const match = value.match(/\d+/);
    return match ? Number.parseInt(match[0], 10) : 0;
};

export function DriftChart({ groundTruths, predictResults, height = 250 }: DriftChartProps) {
    const data = useMemo<DriftPoint[]>(() => {
        const alerts = predictResults.filter((item) => item.y_pred > 0);

        return alerts.flatMap((alert) => {
            let closestGroundTruth: AnomalyData | null = null;
            let minTimeDiff = Number.POSITIVE_INFINITY;

            for (const groundTruth of groundTruths) {
                const diff = Math.abs(alert.timestamp - groundTruth.time);
                if (diff < minTimeDiff) {
                    minTimeDiff = diff;
                    closestGroundTruth = groundTruth;
                }
            }

            if (!closestGroundTruth) {
                return [];
            }

            return [{
                tDiff: alert.timestamp - closestGroundTruth.time,
                sDiff: extractSegNum(alert.target_segment) - extractSegNum(closestGroundTruth.segment),
                level: alert.y_pred,
                xName: alert.target_segment,
                tName: closestGroundTruth.segment,
            }];
        });
    }, [groundTruths, predictResults]);

    if (data.length === 0) {
        return <div className="flex justify-center p-4 text-xs text-[var(--text-muted)]">缺乏对比数据生成漂移分析</div>;
    }

    return (
        <div style={{ width: '100%', height }}>
            <div className="mb-2 flex justify-between text-xs text-[var(--text-secondary)]">
                <span>时空偏移散点分析（模型 vs 仿真真值）</span>
            </div>
            <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                <ScatterChart margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis
                        type="number"
                        dataKey="tDiff"
                        name="时间滞后(s)"
                        domain={['auto', 'auto']}
                        stroke="var(--text-muted)"
                        fontSize={10}
                        tick={{ fill: 'var(--text-muted)' }}
                    />
                    <YAxis
                        type="number"
                        dataKey="sDiff"
                        name="空间偏移(区间)"
                        domain={[-3, 3]}
                        stroke="var(--text-muted)"
                        fontSize={10}
                    />
                    <ZAxis type="number" dataKey="level" range={[50, 200]} name="严重度" />
                    <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        contentStyle={{
                            backgroundColor: 'var(--glass-bg)',
                            borderColor: 'var(--glass-border)',
                            fontSize: '12px',
                        }}
                        formatter={(value, name) => [value, name]}
                    />
                    <ReferenceLine x={0} stroke="rgba(255,255,255,0.2)" />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                    <Scatter name="报警漂移" data={data}>
                        {data.map((entry, index) => {
                            const isGood = entry.tDiff <= 0 && entry.sDiff === 0;
                            const color = isGood ? '#10b981' : (entry.tDiff > 60 ? '#ef4444' : '#f59e0b');
                            return <Cell key={`cell-${index}`} fill={color} fillOpacity={0.7} />;
                        })}
                    </Scatter>
                </ScatterChart>
            </ResponsiveContainer>
        </div>
    );
}
