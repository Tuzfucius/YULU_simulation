import { useMemo } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
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

interface ResidualChartProps {
    speedHistory: SpeedData[];
    predictResults: PredictData[];
    targetSegment?: string;
    height?: number;
}

export function ResidualChart({ speedHistory, predictResults, targetSegment, height = 250 }: ResidualChartProps) {
    const data = useMemo(() => {
        // 如果未指定路段，找一条数据最多的
        let seg = targetSegment;
        if (!seg && predictResults.length > 0) {
            seg = predictResults[0].target_segment;
        }

        // 过滤
        const speeds = speedHistory.filter(s => !seg || s.segment === seg);
        const preds = predictResults.filter(p => !seg || p.target_segment === seg);

        // 按时间合并
        const timeMap = new Map<number, any>();
        speeds.forEach(s => {
            timeMap.set(s.time, { time: s.time, speed: s.avg_speed, has_truth: false, truth_level: 0 });
        });
        preds.forEach(p => {
            const existing = timeMap.get(p.timestamp) || { time: p.timestamp };
            existing.y_pred = p.y_pred;
            existing.y_true = p.y_true;
            // 为了和速度画在一起，我们可以把分类 (0-3) 按比例展示，或者只是做竖线
            // 这里我们把 y_pred 放大来做个相对展示，假设速度 120km/h，y_pred=3 代表严重拥堵 (用倒数比例画在右轴)
            timeMap.set(p.timestamp, existing);
        });

        const merged = Array.from(timeMap.values()).sort((a, b) => a.time - b.time);

        let baselineFound = false;
        let baselineSpeed = 100;

        return merged.map(d => {
            if (!baselineFound && d.speed) {
                baselineSpeed = d.speed;
                baselineFound = true;
            }
            // 计算所谓的预测概率或预警危急度 (数值越大越红)
            const alertIntensity = d.y_pred ? Math.min(d.y_pred * 30, 100) : 0;
            return {
                time: d.time,
                timeLabel: `T${Math.floor(d.time / 60)}`,
                speed: d.speed,
                alertLevel: alertIntensity,
                is_anomaly: d.y_true > 0 ? 100 : 0
            };
        });
    }, [speedHistory, predictResults, targetSegment]);

    if (data.length === 0) return <div className="text-[var(--text-muted)] text-xs p-4 flex justify-center">暂无覆盖此时段的速度信息</div>;

    const segName = targetSegment || '综合路线';

    return (
        <div style={{ width: '100%', height }}>
            <div className="text-xs text-[var(--text-secondary)] mb-2 flex justify-between">
                <span>{segName} 残差分布</span>
                <span>(左轴: 流速 km/h, 右轴: 异常置信折算)</span>
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
                        formatter={(val: number, name: string) => [val.toFixed(1), name === 'speed' ? '平均车速' : (name === 'alertLevel' ? '预警压力' : '实况异常')]}
                    />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: '11px' }} />

                    <Line yAxisId="left" type="monotone" dataKey="speed" name="真实平均速度" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    <Line yAxisId="right" type="stepAfter" dataKey="alertLevel" name="AI预测波峰" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="is_anomaly" name="实际拥堵(GT)" stroke="#f59e0b" strokeWidth={1} fillOpacity={0.2} dot={false} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
