/**
 * 仿真状态管理 (Zustand)
 * 完整版：支持图表数据
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChartData } from '../engine/SimulationEngine';

// 仿真配置（用于 UI 显示，实际使用引擎配置）
interface SimulationConfig {
    roadLengthKm: number;
    numLanes: number;
    laneWidth: number;
    etcGateIntervalKm: number;
    totalVehicles: number;
    carRatio: number;
    truckRatio: number;
    busRatio: number;
    anomalyRatio: number;
    anomalyStartTime: number;
    simulationDt: number;
    maxSimulationTime: number;

    // Advanced Traffic Params
    aggressiveRatio: number;
    conservativeRatio: number;
    globalAnomalyStart: number;
    vehicleSafeRunTime: number;
    laneChangeDelay: number;
    impactThreshold: number;
    impactDiscoverDist: number;
}

interface SimulationProgress {
    currentTime: number;
    totalTime: number;
    progress: number;
    activeVehicles: number;
    completedVehicles: number;
    activeAnomalies: number;
}

interface SimulationStatistics {
    totalVehicles: number;
    completedVehicles: number;
    avgSpeed: number;
    avgTravelTime: number;
    totalAnomalies: number;
    affectedByAnomaly: number;
    totalLaneChanges: number;
    maxCongestionLength: number;
    simulationTime: number;
}

interface LogEntry {
    id?: string;
    timestamp: number;
    level: 'INFO' | 'WARNING' | 'ERROR';
    category: string;
    message: string;
}

interface SimState {
    // 配置
    config: SimulationConfig;
    setConfig: (partial: Partial<SimulationConfig>) => void;
    resetConfig: () => void;

    // 仿真状态
    isRunning: boolean;
    isPaused: boolean;
    isComplete: boolean;
    turboMode: boolean; // 极速模式：不渲染，全速计算
    setRunning: (v: boolean) => void;
    setPaused: (v: boolean) => void;
    setComplete: (v: boolean) => void;
    setTurboMode: (v: boolean) => void;

    // 进度
    progress: SimulationProgress;
    setProgress: (p: SimulationProgress) => void;

    // 统计
    statistics: SimulationStatistics | null;
    setStatistics: (s: SimulationStatistics | null) => void;

    // 图表数据
    chartData: ChartData | null;
    setChartData: (d: ChartData | null) => void;

    // 日志
    logs: LogEntry[];
    addLog: (log: Omit<LogEntry, 'id'>) => void;
    clearLogs: () => void;

    // 重置
    resetAll: () => void;
}

const defaultConfig: SimulationConfig = {
    roadLengthKm: 10,
    numLanes: 4,
    laneWidth: 3.5,
    etcGateIntervalKm: 2,
    totalVehicles: 1200,
    carRatio: 0.60,
    truckRatio: 0.25,
    busRatio: 0.15,
    anomalyRatio: 0.10,
    anomalyStartTime: 200,
    simulationDt: 1.0,
    maxSimulationTime: 3000,

    // Advanced defaults
    aggressiveRatio: 0.20,
    conservativeRatio: 0.20,
    globalAnomalyStart: 200,
    vehicleSafeRunTime: 200,
    laneChangeDelay: 2.0,
    impactThreshold: 0.90,
    impactDiscoverDist: 150,
};

const defaultProgress: SimulationProgress = {
    currentTime: 0,
    totalTime: 3000,
    progress: 0,
    activeVehicles: 0,
    completedVehicles: 0,
    activeAnomalies: 0,
};

export const useSimStore = create<SimState>()(
    persist(
        (set, get) => ({
            config: defaultConfig,
            setConfig: (partial) =>
                set((state) => ({ config: { ...state.config, ...partial } })),
            resetConfig: () => set({ config: defaultConfig }),

            isRunning: false,
            isPaused: false,
            isComplete: false,
            turboMode: false,
            setRunning: (v) => set({ isRunning: v }),
            setPaused: (v) => set({ isPaused: v }),
            setComplete: (v) => set({ isComplete: v }),
            setTurboMode: (v) => set({ turboMode: v }),

            progress: defaultProgress,
            setProgress: (p) => set({ progress: p }),

            statistics: null,
            setStatistics: (s) => set({ statistics: s }),

            chartData: null,
            setChartData: (d) => set({ chartData: d }),

            logs: [],
            addLog: (log) =>
                set((state) => ({
                    logs: [...state.logs.slice(-199), { ...log, id: Date.now().toString() }],
                })),
            clearLogs: () => set({ logs: [] }),

            resetAll: () =>
                set({
                    isRunning: false,
                    isPaused: false,
                    isComplete: false,
                    progress: defaultProgress,
                    statistics: null,
                    chartData: null,
                    logs: [],
                }),
        }),
        {
            name: 'sim-config',
            partialize: (state) => ({ config: state.config }),
        }
    )
);
