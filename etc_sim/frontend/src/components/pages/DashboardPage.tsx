/**
 * ETC 预警仪表盘页面
 * 
 * 功能：
 * - 门架健康度面板（红/黄/绿状态）
 * - 异常事件实时推送列表
 * - 拥堵指数实时曲线
 * - 预警响应时间统计
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import ReactEChartsCore from 'echarts-for-react';

// 类型定义
interface GateStatus {
    gateId: string;
    name: string;
    positionKm: number;
    status: 'normal' | 'warning' | 'critical';
    avgSpeed: number;
    flowRate: number;
    congestionIndex: number;
    lastUpdate: number;
}

interface AlertEvent {
    id: string;
    time: number;
    gateId: string;
    type: 'congestion' | 'accident' | 'anomaly' | 'equipment';
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    acknowledged: boolean;
}

interface CongestionPoint {
    time: number;
    value: number;
}

const SEVERITY_COLORS = {
    low: '#60a5fa',
    medium: '#f59e0b',
    high: '#f97316',
    critical: '#ef4444',
};

const STATUS_COLORS = {
    normal: '#34d399',
    warning: '#f59e0b',
    critical: '#ef4444',
};

export const DashboardPage: React.FC = () => {
    const [gates, setGates] = useState<GateStatus[]>([]);
    const [alerts, setAlerts] = useState<AlertEvent[]>([]);
    const [congestionHistory, setCongestionHistory] = useState<CongestionPoint[]>([]);
    const [selectedGate, setSelectedGate] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    // 模拟数据生成（实际项目中从 WebSocket/API 获取）
    useEffect(() => {
        // 模拟门架数据
        const mockGates: GateStatus[] = Array.from({ length: 10 }, (_, i) => ({
            gateId: `G${i + 1}`,
            name: `门架 ${i + 1}`,
            positionKm: (i + 1) * 2,
            status: (['normal', 'normal', 'normal', 'warning', 'normal', 'normal', 'critical', 'normal', 'normal', 'normal'] as const)[i],
            avgSpeed: 80 + Math.random() * 40,
            flowRate: 120 + Math.random() * 60,
            congestionIndex: Math.random() * 1.5,
            lastUpdate: Date.now(),
        }));
        setGates(mockGates);

        // 模拟预警事件
        const mockAlerts: AlertEvent[] = [
            { id: '1', time: Date.now() - 30000, gateId: 'G7', type: 'congestion', severity: 'high', message: 'G7门架区间拥堵指数超过阈值 (1.8)', acknowledged: false },
            { id: '2', time: Date.now() - 60000, gateId: 'G4', type: 'anomaly', severity: 'medium', message: 'G4门架检测到异常车辆停驶', acknowledged: false },
            { id: '3', time: Date.now() - 120000, gateId: 'G2', type: 'equipment', severity: 'low', message: 'G2门架 OBU 通信延迟超过 500ms', acknowledged: true },
        ];
        setAlerts(mockAlerts);

        // 模拟拥堵指数历史
        const history = Array.from({ length: 60 }, (_, i) => ({
            time: Date.now() - (60 - i) * 60000,
            value: 0.5 + Math.sin(i * 0.1) * 0.3 + Math.random() * 0.2,
        }));
        setCongestionHistory(history);
        setIsConnected(true);
    }, []);

    // 拥堵指数图表配置
    const congestionChartOption = {
        grid: { top: 30, right: 20, bottom: 30, left: 50 },
        tooltip: { trigger: 'axis' as const },
        xAxis: {
            type: 'time' as const,
            axisLabel: { color: '#a0aec0', fontSize: 10 },
            axisLine: { lineStyle: { color: '#4a5568' } },
        },
        yAxis: {
            type: 'value' as const,
            name: '拥堵指数',
            nameTextStyle: { color: '#a0aec0', fontSize: 11 },
            axisLabel: { color: '#a0aec0', fontSize: 10 },
            axisLine: { lineStyle: { color: '#4a5568' } },
            splitLine: { lineStyle: { color: '#2d374833' } },
        },
        series: [{
            type: 'line',
            data: congestionHistory.map(p => [p.time, p.value.toFixed(2)]),
            smooth: true,
            lineStyle: { color: '#60a5fa', width: 2 },
            areaStyle: {
                color: {
                    type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [
                        { offset: 0, color: 'rgba(96,165,250,0.3)' },
                        { offset: 1, color: 'rgba(96,165,250,0.02)' },
                    ],
                },
            },
            markLine: {
                data: [
                    { yAxis: 1.0, label: { formatter: '预警线', color: '#f59e0b' }, lineStyle: { color: '#f59e0b', type: 'dashed' } },
                    { yAxis: 1.5, label: { formatter: '危险线', color: '#ef4444' }, lineStyle: { color: '#ef4444', type: 'dashed' } },
                ],
            },
        }],
    };

    const acknowledgeAlert = (id: string) => {
        setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));
    };

    return (
        <div className="flex flex-col h-full bg-[var(--bg-base)] overflow-y-auto">
            {/* 顶部标题栏 */}
            <div className="h-14 flex items-center justify-between px-6 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md shrink-0">
                <div className="flex items-center gap-3">
                    <h2 className="text-lg font-medium text-[var(--text-primary)]">📊 ETC 预警仪表盘</h2>
                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                        {isConnected ? '数据连接正常' : '连接断开'}
                    </div>
                </div>
            </div>

            {/* 主要内容 */}
            <div className="flex-1 p-6 space-y-6 max-w-[1600px] mx-auto w-full">

                {/* 门架健康度面板 */}
                <div className="glass-card p-5">
                    <h3 className="text-base font-medium text-[var(--text-primary)] mb-4">🚦 门架健康状态</h3>
                    <div className="grid grid-cols-5 gap-3">
                        {gates.map(gate => (
                            <button
                                key={gate.gateId}
                                onClick={() => setSelectedGate(gate.gateId)}
                                className={`p-3 rounded-xl border transition-all hover:scale-105 ${selectedGate === gate.gateId ? 'ring-2 ring-[var(--accent-blue)]' : ''
                                    } ${gate.status === 'critical' ? 'border-red-500/50 bg-red-500/10' : gate.status === 'warning' ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-[var(--glass-border)] bg-[var(--glass-bg)]'}`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-[var(--text-primary)]">{gate.gateId}</span>
                                    <div className={`w-3 h-3 rounded-full`} style={{ backgroundColor: STATUS_COLORS[gate.status] }} />
                                </div>
                                <div className="text-xs text-[var(--text-muted)]">
                                    <div>速度: {gate.avgSpeed.toFixed(0)} km/h</div>
                                    <div>流量: {gate.flowRate.toFixed(0)} 辆/h</div>
                                    <div>拥堵: <span style={{ color: gate.congestionIndex > 1.0 ? '#f59e0b' : '#34d399' }}>{gate.congestionIndex.toFixed(2)}</span></div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* 拥堵指数曲线 + 预警事件 */}
                <div className="grid grid-cols-3 gap-6">
                    {/* 拥堵指数趋势 */}
                    <div className="col-span-2 glass-card p-5">
                        <h3 className="text-base font-medium text-[var(--text-primary)] mb-3">📈 拥堵指数趋势</h3>
                        <ReactEChartsCore
                            option={congestionChartOption}
                            style={{ height: 280 }}
                            opts={{ renderer: 'canvas' }}
                        />
                    </div>

                    {/* 预警事件列表 */}
                    <div className="glass-card p-5 flex flex-col">
                        <h3 className="text-base font-medium text-[var(--text-primary)] mb-3">
                            🔔 实时预警
                            <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400">
                                {alerts.filter(a => !a.acknowledged).length}
                            </span>
                        </h3>
                        <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin">
                            {alerts.map(alert => (
                                <div
                                    key={alert.id}
                                    className={`p-3 rounded-lg border transition-all ${alert.acknowledged ? 'opacity-50 border-[var(--glass-border)]' : 'border-l-4'
                                        }`}
                                    style={{ borderLeftColor: alert.acknowledged ? undefined : SEVERITY_COLORS[alert.severity] }}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-medium" style={{ color: SEVERITY_COLORS[alert.severity] }}>
                                            {alert.type === 'congestion' ? '🚗 拥堵' : alert.type === 'accident' ? '💥 事故' : alert.type === 'anomaly' ? '⚠️ 异常' : '🔧 设备'}
                                        </span>
                                        <span className="text-[10px] text-[var(--text-muted)]">
                                            {new Date(alert.time).toLocaleTimeString()}
                                        </span>
                                    </div>
                                    <p className="text-xs text-[var(--text-secondary)] mb-2">{alert.message}</p>
                                    {!alert.acknowledged && (
                                        <button
                                            onClick={() => acknowledgeAlert(alert.id)}
                                            className="text-[10px] px-2 py-0.5 rounded bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/30"
                                        >
                                            确认
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 门架统计概览 */}
                <div className="glass-card p-5">
                    <h3 className="text-base font-medium text-[var(--text-primary)] mb-4">📋 预警响应统计</h3>
                    <div className="grid grid-cols-4 gap-4">
                        {[
                            { label: '今日预警总数', value: alerts.length.toString(), icon: '📊', color: '#60a5fa' },
                            { label: '未处理预警', value: alerts.filter(a => !a.acknowledged).length.toString(), icon: '⚠️', color: '#f59e0b' },
                            { label: '平均响应时间', value: '2.3s', icon: '⏱️', color: '#34d399' },
                            { label: '系统可用率', value: '99.7%', icon: '✅', color: '#a78bfa' },
                        ].map((stat, i) => (
                            <div key={i} className="p-4 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]">
                                <div className="text-2xl mb-2">{stat.icon}</div>
                                <div className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</div>
                                <div className="text-xs text-[var(--text-muted)] mt-1">{stat.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
