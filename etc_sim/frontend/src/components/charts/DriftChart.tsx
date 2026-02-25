import { useMemo } from 'react';
import {
    ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell
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

interface DriftChartProps {
    groundTruths: AnomalyData[];
    predictResults: PredictData[];
    height?: number;
}

// 提取路段中间的数字编号用于简单的空间距离估算
const extractSegNum = (segStr: string | number | undefined) => {
    const s = String(segStr ?? '');
    const match = s.match(/\d+/g);
    return match ? parseInt(match[0], 10) : 0;
};

export function DriftChart({ groundTruths, predictResults, height = 250 }: DriftChartProps) {
    const data = useMemo(() => {
        const driftPoints: any[] = [];

        // 过滤出所有有报警的预测点
        const alerts = predictResults.filter(p => p.y_pred > 0);

        alerts.forEach(alert => {
            // 找出最近的 ground truth
            let minTimeDiff = Infinity;
            let closestGt: AnomalyData | null = null;

            groundTruths.forEach(gt => {
                const diff = Math.abs(alert.timestamp - gt.time);
                if (diff < minTimeDiff) {
                    minTimeDiff = diff;
                    closestGt = gt;
                }
            });

            if (closestGt) {
                const tDiff = alert.timestamp - closestGt.time; // 正数表示模型报警晚于事件发生
                const sDiff = extractSegNum(alert.target_segment) - extractSegNum(closestGt.segment);

                driftPoints.push({
                    tDiff,
                    sDiff,
                    level: alert.y_pred,
                    xName: alert.target_segment,
                    tName: closestGt.segment,
                });
            }
        });

        return driftPoints;
    }, [groundTruths, predictResults]);

    if (data.length === 0) return <div className="text-[var(--text-muted)] text-xs p-4 flex justify-center">缺乏对比数据生成漂移分析</div>;

    return (
        <div style={{ width: '100%', height }}>
            <div className="text-xs text-[var(--text-secondary)] mb-2 flex justify-between">
                <span>时空偏移散点分析 (模型 vs 仿真真值)</span>
            </div>
            <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                <ScatterChart margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis type="number" dataKey="tDiff" name="时间滞后(s)"
                        domain={['auto', 'auto']}
                        stroke="var(--text-muted)" fontSize={10}
                        tick={{ fill: 'var(--text-muted)' }} />
                    <YAxis type="number" dataKey="sDiff" name="空间偏移(区界)"
                        domain={[-3, 3]} stroke="var(--text-muted)" fontSize={10} />
                    <ZAxis type="number" dataKey="level" range={[50, 200]} name="危急度" />
                    <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        contentStyle={{ backgroundColor: 'var(--glass-bg)', borderColor: 'var(--glass-border)', fontSize: '12px' }}
                        formatter={(value, name) => [value, name]}
                    />

                    {/* 分界线 */}
                    <ReferenceLine x={0} stroke="rgba(255,255,255,0.2)" />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />

                    <Scatter name="报警漂移" data={data}>
                        {data.map((entry, index) => {
                            // 红色代表晚报/误报远，绿色代表早早精确预警
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
