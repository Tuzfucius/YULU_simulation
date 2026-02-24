import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { useTheme } from '../../utils/useTheme';

interface TestDetail {
    sample_id: string;
    timestamp: number;
    target_segment: string;
    y_true: number;
    y_pred: number;
}

interface PredictionHeatmapProps {
    data: TestDetail[];
    title?: string;
}

/**
 * 预测结果时空热力对比图
 * 横轴：时间 (Time steps)
 * 纵轴：空间区间 (Segments)
 * 颜色区块表示：
 *  - 🟢 True Negative (真正常): 极淡绿(或不染色) [实际 0, 预测 0]
 *  - 🔴 True Positive (真异常): 深红 [实际 >0, 预测 >0]
 *  - 🟨 False Negative (漏报) : 金黄高亮 [实际 >0, 预测 =0]
 *  - 🟦 False Positive (误报) : 蓝色高亮 [实际 =0, 预测 >0]
 */
export function PredictionHeatmap({ data, title = '时空预测对仗图 (Spatio-Temporal Performance)' }: PredictionHeatmapProps) {
    const chartRef = useRef<HTMLDivElement>(null);
    const chartInstance = useRef<echarts.ECharts | null>(null);
    const { theme } = useTheme();

    useEffect(() => {
        if (!chartRef.current) return;

        if (!chartInstance.current) {
            chartInstance.current = echarts.init(chartRef.current, theme === 'dark' ? 'dark' : undefined);
        }

        // 数据按时间排序并去重获取所有的时间点和空间段
        const times = Array.from(new Set(data.map(d => d.timestamp))).sort((a, b) => a - b);
        const segments = Array.from(new Set(data.map(d => d.target_segment))).sort();

        // 构建热力图需要的 [x_index, y_index, value(类别)] 数据结构
        /*
          类标定:
          0 = True Negative (TN)
          1 = True Positive (TP)
          2 = False Negative (FN) - 漏报
          3 = False Positive (FP) - 误报
        */
        const heatmapData = data.map(item => {
            const tIdx = times.indexOf(item.timestamp);
            const sIdx = segments.indexOf(item.target_segment);

            let stateCat = 0;
            if (item.y_true === 0 && item.y_pred === 0) stateCat = 0; // TN
            else if (item.y_true > 0 && item.y_pred > 0) stateCat = 1; // TP
            else if (item.y_true > 0 && item.y_pred === 0) stateCat = 2; // FN (漏报)
            else if (item.y_true === 0 && item.y_pred > 0) stateCat = 3; // FP (误报)

            return [tIdx, sIdx, stateCat, item.y_true, item.y_pred];
        });

        // 格式化时间为可见文本 (假设 baseline 某种便宜转换)
        const timeLabels = times.map(t => {
            const d = new Date(t * 1000);
            return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
        });

        const isDark = theme === 'dark';
        const textColor = isDark ? '#EEE' : '#333';

        // 自定义颜色映射
        const pieces = [
            { value: 0, label: '正常 (TN)', color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0,0,0,0.02)' },
            { value: 1, label: '命中 (TP)', color: '#ef4444' }, // Red
            { value: 2, label: '漏报 (FN)', color: '#eab308' }, // Yellow
            { value: 3, label: '误报 (FP)', color: '#3b82f6' }, // Blue
        ];

        const option: echarts.EChartsOption = {
            backgroundColor: 'transparent',
            title: {
                text: title,
                textStyle: { color: textColor, fontSize: 14, fontWeight: 'normal' },
                top: 0
            },
            tooltip: {
                position: 'top',
                formatter: function (params: any) {
                    const val = params.data[2];
                    const tr = params.data[3];
                    const pr = params.data[4];
                    let statusLabel = pieces[val].label;
                    return `
            <b>${segments[params.data[1]]}</b><br/>
            时间: ${timeLabels[params.data[0]]}<br/>
            状况: <span style="color:${pieces[val].color};font-weight:bold">${statusLabel}</span><br/>
            [真值: ${tr}, 预测: ${pr}]
           `;
                }
            },
            animation: false,
            grid: {
                top: 60,
                bottom: 40,
                left: 80,
                right: 20
            },
            xAxis: {
                type: 'category',
                data: timeLabels,
                splitArea: { show: true },
                axisLabel: { color: isDark ? '#9ca3af' : '#4b5563', fontSize: 10 },
                axisLine: { lineStyle: { color: isDark ? '#4b5563' : '#d1d5db' } }
            },
            yAxis: {
                type: 'category',
                data: segments,
                splitArea: { show: true },
                axisLabel: { color: isDark ? '#9ca3af' : '#4b5563', fontSize: 10 },
                axisLine: { lineStyle: { color: isDark ? '#4b5563' : '#d1d5db' } }
            },
            visualMap: {
                type: 'piecewise',
                orient: 'horizontal',
                left: 'center',
                bottom: 0,
                pieces: pieces,
                textStyle: { color: isDark ? '#9ca3af' : '#4b5563' }
            },
            series: [
                {
                    name: 'Forecast Errors',
                    type: 'heatmap',
                    data: heatmapData,
                    label: { show: false },
                    itemStyle: {
                        borderWidth: 1,
                        borderColor: isDark ? '#1f2937' : '#f3f4f6'
                    },
                    emphasis: {
                        itemStyle: {
                            shadowBlur: 10,
                            shadowColor: 'rgba(0, 0, 0, 0.5)'
                        }
                    }
                }
            ]
        };

        chartInstance.current.setOption(option);

        const handleResize = () => chartInstance.current?.resize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [data, theme, title]);

    return <div ref={chartRef} className="w-full h-full" style={{ minHeight: '300px' }} />;
}
