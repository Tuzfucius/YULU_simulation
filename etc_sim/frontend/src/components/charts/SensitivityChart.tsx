/**
 * 参数敏感性分析图 — 展示不同阈值下的 F1 分数变化曲线
 * 使用 SVG 折线图实现
 */



interface SensitivityPoint {
    paramValue: number;
    f1Score: number;
    precision?: number;
    recall?: number;
}

interface SensitivityChartProps {
    data: SensitivityPoint[];
    paramName: string;
    width?: number;
    height?: number;
    currentValue?: number;  // 当前参数值（高亮标记）
}

export function SensitivityChart({
    data, paramName,
    width = 500, height = 250,
    currentValue,
}: SensitivityChartProps) {
    if (data.length === 0) {
        return (
            <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>暂无数据</span>
            </div>
        );
    }

    const margin = { top: 30, right: 80, bottom: 35, left: 50 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    const xMin = Math.min(...data.map(d => d.paramValue));
    const xMax = Math.max(...data.map(d => d.paramValue));
    const xRange = xMax - xMin || 1;

    const xScale = (v: number) => margin.left + ((v - xMin) / xRange) * plotW;
    const yScale = (v: number) => margin.top + plotH - v * plotH;   // 0-1 范围

    // 折线路径
    const f1Path = data.map((d, i) =>
        `${i === 0 ? 'M' : 'L'} ${xScale(d.paramValue)} ${yScale(d.f1Score)}`
    ).join(' ');

    const precisionPath = data.filter(d => d.precision !== undefined).map((d, i) =>
        `${i === 0 ? 'M' : 'L'} ${xScale(d.paramValue)} ${yScale(d.precision!)}`
    ).join(' ');

    const recallPath = data.filter(d => d.recall !== undefined).map((d, i) =>
        `${i === 0 ? 'M' : 'L'} ${xScale(d.paramValue)} ${yScale(d.recall!)}`
    ).join(' ');

    // Y 轴刻度
    const yTicks = [0, 0.25, 0.5, 0.75, 1.0];

    return (
        <svg width={width} height={height}>
            {/* 标题 */}
            <text x={width / 2} y={16} textAnchor="middle"
                fontSize={12} fontWeight={600} fill="var(--text-primary)">
                参数敏感性: {paramName}
            </text>

            {/* 网格线 */}
            {yTicks.map(y => (
                <g key={y}>
                    <line x1={margin.left} y1={yScale(y)} x2={margin.left + plotW} y2={yScale(y)}
                        stroke="var(--glass-border)" strokeWidth={0.5} />
                    <text x={margin.left - 6} y={yScale(y) + 3}
                        textAnchor="end" fontSize={9} fill="var(--text-muted)">
                        {y.toFixed(2)}
                    </text>
                </g>
            ))}

            {/* F1 曲线 */}
            <path d={f1Path} fill="none" stroke="#a78bfa" strokeWidth={2} />
            {/* Precision 曲线 */}
            {precisionPath && (
                <path d={precisionPath} fill="none" stroke="#60a5fa" strokeWidth={1.5}
                    strokeDasharray="4,3" opacity={0.7} />
            )}
            {/* Recall 曲线 */}
            {recallPath && (
                <path d={recallPath} fill="none" stroke="#34d399" strokeWidth={1.5}
                    strokeDasharray="4,3" opacity={0.7} />
            )}

            {/* 当前值标记 */}
            {currentValue !== undefined && (
                <>
                    <line x1={xScale(currentValue)} y1={margin.top}
                        x2={xScale(currentValue)} y2={margin.top + plotH}
                        stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3,3" />
                    <text x={xScale(currentValue)} y={margin.top - 4}
                        textAnchor="middle" fontSize={9} fill="#f59e0b" fontWeight={600}>
                        当前
                    </text>
                </>
            )}

            {/* 数据点 */}
            {data.map((d, i) => (
                <circle key={i} cx={xScale(d.paramValue)} cy={yScale(d.f1Score)}
                    r={3} fill="#a78bfa" opacity={0.8}>
                    <title>{paramName}={d.paramValue}, F1={d.f1Score.toFixed(3)}</title>
                </circle>
            ))}

            {/* X 轴标签 */}
            <text x={margin.left + plotW / 2} y={height - 4}
                textAnchor="middle" fontSize={10} fill="var(--text-secondary)">
                {paramName}
            </text>

            {/* 图例 */}
            <g transform={`translate(${width - margin.right + 8}, ${margin.top + 10})`}>
                <line x1={0} y1={0} x2={16} y2={0} stroke="#a78bfa" strokeWidth={2} />
                <text x={20} y={3} fontSize={9} fill="var(--text-secondary)">F1</text>

                <line x1={0} y1={16} x2={16} y2={16} stroke="#60a5fa" strokeWidth={1.5} strokeDasharray="4,3" />
                <text x={20} y={19} fontSize={9} fill="var(--text-secondary)">P</text>

                <line x1={0} y1={32} x2={16} y2={32} stroke="#34d399" strokeWidth={1.5} strokeDasharray="4,3" />
                <text x={20} y={35} fontSize={9} fill="var(--text-secondary)">R</text>
            </g>
        </svg>
    );
}
