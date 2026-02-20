import React, { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { useSimStore } from '../stores/simStore';

export const SegmentInspector: React.FC = () => {
    const statistics = useSimStore(state => state.statistics);
    const config = useSimStore(state => state.config);
    const [selectedSegment, setSelectedSegment] = useState<number>(0);

    // --- 提前提取数据（所有 hooks 必须在任何 return 之前调用）---
    const segmentSpeedHistory: any[] = statistics?.segmentSpeedHistory ?? [];
    const segmentBoundaries: number[] | undefined = statistics?.segmentBoundaries;

    // 准备区间选项列表（在 early return 前调用 useMemo）
    const segmentOptions = useMemo(() => {
        if (segmentBoundaries && segmentBoundaries.length > 1) {
            const options = [];
            for (let i = 0; i < segmentBoundaries.length - 1; i++) {
                const start = segmentBoundaries[i];
                const end = segmentBoundaries[i + 1];
                options.push({
                    value: i,
                    label: `区间 ${i + 1}：${start.toFixed(2)} km — ${end.toFixed(2)} km`
                });
            }
            return options;
        } else {
            // 回退：从历史数据推断 segments 数量
            const maxSeg = segmentSpeedHistory.length > 0
                ? Math.max(...segmentSpeedHistory.map((r: any) => r.segment))
                : 0;
            const numSegments = maxSeg + 1;
            const len = config.roadLengthKm / numSegments;
            const options = [];
            for (let i = 0; i < numSegments; i++) {
                options.push({
                    value: i,
                    label: `区间 ${i + 1}：${(i * len).toFixed(2)} km — ${((i + 1) * len).toFixed(2)} km`
                });
            }
            return options;
        }
    }, [segmentBoundaries, segmentSpeedHistory, config.roadLengthKm]);

    // 过滤并排序当前选中区间的数据
    const chartData = useMemo(() => {
        return segmentSpeedHistory
            .filter((r: any) => r.segment === selectedSegment)
            .sort((a: any, b: any) => a.time - b.time);
    }, [segmentSpeedHistory, selectedSegment]);

    // === 所有 Hooks 调用完毕，现在可以 early return ===
    if (!statistics || segmentSpeedHistory.length === 0) {
        return null;
    }

    // ECharts 配置
    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross' },
            backgroundColor: 'rgba(22, 22, 36, 0.92)',
            borderColor: '#444',
            textStyle: { color: '#EEE', fontSize: 12 }
        },
        legend: {
            data: ['平均速度 (km/h)', '流量 (veh/h)', '密度 (veh/km)'],
            textStyle: { color: '#AAA', fontSize: 12 },
            top: 5
        },
        grid: {
            left: '2%',
            right: '4%',
            bottom: '18%',
            top: '14%',
            containLabel: true
        },
        toolbox: {
            feature: {
                saveAsImage: { title: '保存' },
                restore: { title: '重置' }
            },
            iconStyle: { borderColor: '#666' },
            right: 20
        },
        dataZoom: [
            {
                type: 'slider',
                show: true,
                xAxisIndex: [0],
                bottom: 5,
                start: 0,
                end: 100,
                textStyle: { color: '#999' },
                borderColor: '#444',
                fillerColor: 'rgba(100,100,200,0.15)',
                handleStyle: { color: '#7B61FF' }
            }
            // 故意不添加 inside (mousewheel) 类型以避免 passive event listener 警告
        ],
        xAxis: {
            type: 'category',
            boundaryGap: false,
            data: chartData.map((d: any) => `${Math.round(d.time)}s`),
            name: '时间',
            nameLocation: 'middle',
            nameGap: 28,
            nameTextStyle: { color: '#888' },
            axisLine: { lineStyle: { color: '#555' } },
            axisLabel: { color: '#999', interval: Math.max(0, Math.floor(chartData.length / 12) - 1) }
        },
        yAxis: [
            {
                type: 'value',
                name: '速度\n(km/h)',
                position: 'left',
                alignTicks: true,
                axisLine: { show: true, lineStyle: { color: '#91CC75' } },
                axisLabel: { color: '#91CC75', formatter: '{value}' },
                splitLine: { lineStyle: { color: '#2a2a3a' } }
            },
            {
                type: 'value',
                name: '流量/密度',
                position: 'right',
                alignTicks: true,
                axisLine: { show: true, lineStyle: { color: '#FAC858' } },
                axisLabel: { color: '#FAC858', formatter: '{value}' },
                splitLine: { show: false }
            }
        ],
        series: [
            {
                name: '平均速度 (km/h)',
                type: 'line',
                data: chartData.map((d: any) => (d.avgSpeed * 3.6).toFixed(1)),
                smooth: true,
                showSymbol: false,
                lineStyle: { width: 2, color: '#91CC75' },
                itemStyle: { color: '#91CC75' },
                yAxisIndex: 0,
                areaStyle: { color: 'rgba(145,204,117,0.05)' }
            },
            {
                name: '流量 (veh/h)',
                type: 'line',
                data: chartData.map((d: any) => d.flow.toFixed(0)),
                smooth: true,
                showSymbol: false,
                lineStyle: { width: 2, color: '#FAC858' },
                itemStyle: { color: '#FAC858' },
                yAxisIndex: 1
            },
            {
                name: '密度 (veh/km)',
                type: 'line',
                data: chartData.map((d: any) => d.density.toFixed(1)),
                smooth: true,
                showSymbol: false,
                lineStyle: { width: 2, color: '#5470C6', type: 'dashed' },
                itemStyle: { color: '#5470C6' },
                yAxisIndex: 1
            }
        ]
    };

    return (
        <div className="glass-card overflow-hidden">
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <div className="flex items-center gap-3">
                    <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                        style={{ background: 'linear-gradient(135deg, #5470C622, #5470C655)' }}
                    >
                        🔍
                    </div>
                    <div>
                        <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            区间详细分析
                        </h3>
                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            当前显示：
                            <span style={{ color: '#D0BCFF' }}>
                                {segmentOptions[selectedSegment]?.label ?? `区间 ${selectedSegment + 1}`}
                            </span>
                            <span className="ml-2" style={{ color: '#A1C4A1' }}>
                                · 共 {chartData.length} 个时间点
                            </span>
                        </p>
                    </div>
                </div>

                {/* 区间选择器 */}
                <div className="flex items-center gap-2">
                    <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        选择区间
                    </label>
                    <select
                        value={selectedSegment}
                        onChange={(e) => setSelectedSegment(Number(e.target.value))}
                        style={{
                            background: 'var(--surface-variant)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            padding: '4px 10px',
                            fontSize: '12px',
                            outline: 'none'
                        }}
                    >
                        {segmentOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* 图表 */}
            <div style={{ height: 320, padding: '0 8px 8px' }}>
                {chartData.length === 0 ? (
                    <div className="h-full flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>
                        <span className="text-sm">此区间暂无车辆通过记录</span>
                    </div>
                ) : (
                    <ReactECharts
                        option={option}
                        style={{ height: '100%', width: '100%' }}
                    />
                )}
            </div>

            <p className="text-center pb-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                拖动底部滑块可放大时间轴，查看特定时段的详细车流变化
            </p>
        </div>
    );
};
