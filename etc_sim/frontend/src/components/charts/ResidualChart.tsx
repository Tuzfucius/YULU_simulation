import { useMemo } from 'react';
import {
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

interface SpeedData {
    time: number;
    segment: string;
    avg_speed: number;
}

interface PredictData {
    timestamp: number;
    target_segment: string;
    y_true: number;
    y_pred: number;
    prob?: number;
}

interface ResidualPoint {
    time: number;
    timeLabel: string;
    speed?: number;
    alertLevel: number;
    is_anomaly: number;
}

interface ResidualChartProps {
    speedHistory: SpeedData[];
    predictResults: PredictData[];
    targetSegment?: string;
    height?: number;
}

export function ResidualChart({ speedHistory, predictResults, targetSegment, height = 250 }: ResidualChartProps) {
    const data = useMemo<ResidualPoint[]>(() => {
        const segment = targetSegment || predictResults[0]?.target_segment;
        const speeds = speedHistory.filter((item) => !segment || item.segment === segment);
        const predictions = predictResults.filter((item) => !segment || item.target_segment === segment);

        const timeMap = new Map<number, { time: number; speed?: number; y_true?: number; y_pred?: number }>();

        for (const speed of speeds) {
            timeMap.set(speed.time, {
                time: speed.time,
                speed: speed.avg_speed,
                y_true: timeMap.get(speed.time)?.y_true,
                y_pred: timeMap.get(speed.time)?.y_pred,
            });
        }

        for (const prediction of predictions) {
            const current = timeMap.get(prediction.timestamp) || { time: prediction.timestamp };
            current.y_pred = prediction.y_pred;
            current.y_true = prediction.y_true;
            timeMap.set(prediction.timestamp, current);
        }

        return [...timeMap.values()]
            .sort((left, right) => left.time - right.time)
            .map((item) => ({
                time: item.time,
                timeLabel: `T${Math.floor(item.time / 60)}`,
                speed: item.speed,
                alertLevel: item.y_pred ? Math.min(item.y_pred * 30, 100) : 0,
                is_anomaly: item.y_true && item.y_true > 0 ? 100 : 0,
            }));
    }, [predictResults, speedHistory, targetSegment]);

    if (data.length === 0) {
        return <div className="flex justify-center p-4 text-xs text-[var(--text-muted)]">暂无覆盖此时段的速度信息</div>;
    }

    const segmentName = targetSegment || '综合路线';

    return (
        <div style={{ width: '100%', height }}>
            <div className="mb-2 flex justify-between text-xs text-[var(--text-secondary)]">
                <span>{segmentName} 残差分布</span>
                <span>左轴: 速度 km/h，右轴: 异常折算强度</span>
            </div>
            <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                <LineChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="timeLabel" stroke="var(--text-muted)" fontSize={10} tick={{ fill: 'var(--text-muted)' }} />
                    <YAxis yAxisId="left" stroke="var(--text-muted)" fontSize={10} />
                    <YAxis yAxisId="right" orientation="right" stroke="var(--text-muted)" fontSize={10} domain={[0, 100]} />
                    <Tooltip
                        contentStyle={{ backgroundColor: 'var(--glass-bg)', borderColor: 'var(--glass-border)', fontSize: '12px' }}
                        labelStyle={{ color: 'var(--text-secondary)' }}
                        formatter={(value: number | string | undefined, name?: string) => [
                            typeof value === 'number' ? value.toFixed(1) : String(value ?? '--'),
                            name === 'speed' ? '平均车速' : (name === 'alertLevel' ? '预警压力' : '实况异常'),
                        ]}
                    />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                    <Line yAxisId="left" type="monotone" dataKey="speed" name="真实平均速度" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    <Line yAxisId="right" type="stepAfter" dataKey="alertLevel" name="AI预测波峰" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="is_anomaly" name="实际异常(GT)" stroke="#f59e0b" strokeWidth={1} dot={false} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
