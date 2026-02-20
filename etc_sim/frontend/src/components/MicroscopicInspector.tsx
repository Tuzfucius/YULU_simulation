import React, { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { useSimStore } from '../stores/simStore';

type ColorMode = 'speed' | 'status' | 'lane';

export const MicroscopicInspector: React.FC = () => {
    const statistics = useSimStore(state => state.statistics);
    const config = useSimStore(state => state.config);
    const [selectedSegment, setSelectedSegment] = useState<number>(0);
    const [colorMode, setColorMode] = useState<ColorMode>('speed');

    // --- Data Extraction (Before Return) ---
    const sampledTrajectory: any[] = statistics?.sampledTrajectory ?? [];
    const segmentBoundaries: number[] | undefined = statistics?.segmentBoundaries;

    // --- Prepare Segment Options ---
    const segmentOptions = useMemo(() => {
        if (segmentBoundaries && segmentBoundaries.length > 1) {
            const options = [];
            for (let i = 0; i < segmentBoundaries.length - 1; i++) {
                const start = segmentBoundaries[i];
                const end = segmentBoundaries[i + 1];
                options.push({
                    value: i,
                    label: `区间 ${i + 1}：${start.toFixed(2)} km — ${end.toFixed(2)} km`,
                    startM: start * 1000,
                    endM: end * 1000
                });
            }
            return options;
        } else {
            // Fallback estimation
            const numSegments = Math.max(1, Math.floor(config.roadLengthKm)); // Default 1km segments if no boundaries
            // Actually, we should try to match SegmentInspector's fallback logic.
            // But here we need METERS boundaries.

            const options = [];
            const lenKm = config.roadLengthKm / numSegments;
            for (let i = 0; i < numSegments; i++) {
                options.push({
                    value: i,
                    label: `区间 ${i + 1}：${(i * lenKm).toFixed(2)} km — ${((i + 1) * lenKm).toFixed(2)} km`,
                    startM: i * lenKm * 1000,
                    endM: (i + 1) * lenKm * 1000
                });
            }
            return options;
        }
    }, [segmentBoundaries, sampledTrajectory, config.roadLengthKm]);

    // --- Filter Chart Data ---
    const currentSegmentBounds = segmentOptions[selectedSegment] || { startM: 0, endM: 100000 };

    // 我们需要构建一个适合 ECharts Scatter 的数据数组
    // [time, speed, colorValue, ...info]
    const chartData = useMemo(() => {
        if (!sampledTrajectory || sampledTrajectory.length === 0) return [];

        const startM = currentSegmentBounds.startM;
        const endM = currentSegmentBounds.endM;

        // Filter points in this segment
        const filtered = sampledTrajectory.filter((p: any) => p.pos >= startM && p.pos < endM);

        // Map to format
        // speed: p.speed (m/s) -> km/h
        // status: 0=normal, 1=affected, 2=anomaly?
        // Let's use string or number for VisualMap.
        return filtered.map((p: any) => {
            const speedKmh = p.speed * 3.6;

            // Determine color value based on mode
            let styleVal = 0;
            if (colorMode === 'lane') styleVal = p.lane;
            else if (colorMode === 'status') {
                if (p.anomaly_state !== 'none') styleVal = 2; // Anomaly Source
                else if (p.is_affected) styleVal = 1; // Affected
                else styleVal = 0; // Normal
            } else {
                styleVal = speedKmh; // Speed
            }

            return [
                p.time,       // 0: X (Time)
                speedKmh,     // 1: Y (Speed)
                styleVal,     // 2: Color Dimension
                p.id,         // 3: ID
                p.lane,       // 4: Lane
                p.vehicle_type, // 5: Type
                p.is_affected // 6: Affected
            ];
        });
    }, [sampledTrajectory, selectedSegment, currentSegmentBounds, colorMode]);

    // --- Calculate dynamic range for VisualMap ---
    const speedRange = useMemo(() => {
        if (chartData.length === 0) return { min: 0, max: 120 };
        let min = 1000;
        let max = 0;
        chartData.forEach((d: any) => {
            const s = d[1]; // speed
            if (s < min) min = s;
            if (s > max) max = s;
        });
        // Add some padding
        return {
            min: Math.floor(Math.max(0, min - 5)),
            max: Math.ceil(max + 5)
        };
    }, [chartData]);

    // --- Early Return ---
    if (!statistics || sampledTrajectory.length === 0) {
        return null;
    }

    // --- ECharts Visual Map Configuration ---
    let visualMap: any = null;

    if (colorMode === 'speed') {
        visualMap = {
            type: 'continuous',
            dimension: 1, // Y axis speed
            min: speedRange.min,
            max: speedRange.max,
            inRange: {
                color: ['#d94e5d', '#eac736', '#50a3ba'].reverse() // Red(Slow) -> Yellow -> Blue(Fast)
            },
            text: ['High', 'Low'],
            textStyle: { color: '#ccc' },
            calculable: true,
            right: 10,
            top: 40,
            itemWidth: 10,
            itemHeight: 100
        };
    } else if (colorMode === 'status') {
        visualMap = {
            type: 'piecewise',
            dimension: 2, // styleVal
            categories: [0, 1, 2],
            pieces: [
                { value: 0, label: '正常行驶', color: '#5470C6' },   // Blue
                { value: 1, label: '受影响/减速', color: '#FAC858' }, // Yellow/Orange
                { value: 2, label: '异常源/事故', color: '#FF4D4D' }  // Red
            ],
            textStyle: { color: '#ccc' },
            right: 10,
            top: 40
        };
    } else if (colorMode === 'lane') {
        visualMap = {
            type: 'piecewise',
            dimension: 4, // Lane index
            categories: [0, 1, 2, 3], // dynamic?
            inRange: {
                color: ['#5470C6', '#91CC75', '#FAC858', '#EE6666']
            },
            textStyle: { color: '#ccc' },
            right: 10,
            top: 40
        };
    }

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'item',
            backgroundColor: 'rgba(22, 22, 36, 0.95)',
            borderColor: '#555',
            textStyle: { color: '#EEE' },
            formatter: (params: any) => {
                const d = params.data;
                // [time, speed, val, id, lane, type, isAffected]
                return `
                    <div style="font-weight:bold; margin-bottom:4px">车辆 ID: ${d[3]}</div>
                    <div>类型: ${d[5]}</div>
                    <div>时间: ${d[0].toFixed(1)} s</div>
                    <div>速度: <span style="color:${d[1] < 40 ? '#ff4d4d' : '#91cc75'}">${d[1].toFixed(1)} km/h</span></div>
                    <div>车道: Lane ${d[4]}</div>
                    <div>状态: ${d[6] ? '<span style="color:#ffcc00">受影响</span>' : '正常'}</div>
                `;
            }
        },
        grid: {
            left: '4%',
            right: '12%', // Leave room for visualMap
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
            right: '12%'
        },
        dataZoom: [
            {
                type: 'slider',
                show: true,
                xAxisIndex: [0],
                bottom: 5,
                textStyle: { color: '#999' },
                borderColor: '#444',
                height: 20,
                handleSize: '80%',
                fillerColor: 'rgba(123, 97, 255, 0.15)',
                handleStyle: { color: '#7B61FF' }
            }
        ],
        xAxis: {
            type: 'value',
            name: '时间 (s)',
            scale: true,
            axisLine: { lineStyle: { color: '#555' } },
            axisLabel: { color: '#999' },
            splitLine: { show: false }
        },
        yAxis: {
            type: 'value',
            name: '速度 (km/h)',
            scale: true,
            axisLine: { show: true, lineStyle: { color: '#555' } },
            axisLabel: { color: '#999' },
            splitLine: { lineStyle: { color: '#333', type: 'dashed' } }
        },
        visualMap: visualMap,
        series: [
            {
                name: '车辆样本',
                type: 'scatter',
                symbolSize: 3,
                large: true, // Optimize for large data
                data: chartData,
                itemStyle: {
                    opacity: 0.8
                }
            }
        ]
    };

    return (
        <div className="glass-card overflow-hidden mt-4">
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <div className="flex items-center gap-3">
                    <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                        style={{ background: 'linear-gradient(135deg, #FF9F4322, #FF9F4355)' }}
                    >
                        🔬
                    </div>
                    <div>
                        <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            单车微观分析
                        </h3>
                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            样本数：<span style={{ color: '#FF9F43' }}>{chartData.length}</span>
                        </p>
                    </div>
                </div>

                {/* 控件组 */}
                <div className="flex items-center gap-4">
                    {/* 着色模式 */}
                    <div className="flex items-center gap-2">
                        <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            着色：
                        </label>
                        <select
                            value={colorMode}
                            onChange={(e) => setColorMode(e.target.value as ColorMode)}
                            style={{
                                background: 'var(--surface-variant)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                padding: '4px 8px',
                                fontSize: '12px',
                                outline: 'none'
                            }}
                        >
                            <option value="speed">按速度</option>
                            <option value="status">按状态 (正常/受影响)</option>
                            <option value="lane">按车道</option>
                        </select>
                    </div>

                    {/* 区间选择 */}
                    <div className="flex items-center gap-2">
                        <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            区间：
                        </label>
                        <select
                            value={selectedSegment}
                            onChange={(e) => setSelectedSegment(Number(e.target.value))}
                            style={{
                                background: 'var(--surface-variant)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                padding: '4px 8px',
                                fontSize: '12px',
                                outline: 'none',
                                maxWidth: '140px'
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
            </div>

            {/* 图表 */}
            <div style={{ height: 320, padding: '0 8px 8px' }}>
                <ReactECharts
                    option={option}
                    style={{ height: '100%', width: '100%' }}
                />
            </div>

            <p className="text-center pb-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                展示每一辆车的采样点。切换【着色模式】可快速识别拥堵(红)或受事故影响的车辆。
            </p>
        </div>
    );
};
