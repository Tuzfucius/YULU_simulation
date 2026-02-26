/**
 * 仿真状态管理 (Zustand)
 * 完整版：支持图表数据
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
    trajectorySampleInterval: number;
    maxSimulationTime: number;

    // Advanced Traffic Params
    aggressiveRatio: number;
    conservativeRatio: number;
    globalAnomalyStart: number;
    vehicleSafeRunTime: number;
    laneChangeDelay: number;
    impactThreshold: number;
    impactDiscoverDist: number;

    // Anomaly Configuration
    anomalyProbType1: number;
    anomalyProbType2: number;
    anomalyProbType3: number;
    anomalyDurationType1: number;

    // Scenario Params
    flowMode?: string;
    weather?: string;
    speedFactor?: number;
    safeDistFactor?: number;
    visibility?: number;
    platoonProbability?: number;
    platoonSizeRange?: [number, number];
    construction?: boolean;
    closedLanes?: number[];
    speedLimit?: number;
    zoneStart?: number;
    zoneEnd?: number;
    chainCollision?: boolean;
    gradualStop?: boolean;

    // 自定义路径（路网配置组件写入）
    customRoadPath?: string;           // 已选择的自定义路径文件名
    customRoadLengthKm?: number;       // 实际计算的路径总里程
    customGantryPositionsKm?: number[]; // 门架里程位置列表
    customRamps?: any[];               // 自定义路网匝道配置

    // Data Quality & Noise
    enableNoise: boolean;
    speedVariance: number;
    dropRate: number;
}


interface SimulationProgress {
    currentTime: number;
    totalTime: number;
    progress: number;
    activeVehicles: number;
    completedVehicles: number;
    activeAnomalies: number;
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
    anomalyRatio: 0.01, // Default lowered to 1% as requested
    anomalyStartTime: 200,
    simulationDt: 1.0,
    trajectorySampleInterval: 2,
    maxSimulationTime: 3000,

    // Advanced defaults
    aggressiveRatio: 0.20,
    conservativeRatio: 0.20,
    globalAnomalyStart: 200,
    vehicleSafeRunTime: 200,
    laneChangeDelay: 2.0,
    impactThreshold: 0.90,
    impactDiscoverDist: 200,

    // Anomaly Ratios & Durations
    anomalyProbType1: 0.10,
    anomalyProbType2: 0.45,
    anomalyProbType3: 0.45,
    anomalyDurationType1: 120, // 2 mins default

    // Data Quality & Noise Default
    enableNoise: false,
    speedVariance: 5.0,
    dropRate: 0.1,

    customRamps: [],
};

const defaultProgress: SimulationProgress = {
    currentTime: 0,
    totalTime: 3000,
    progress: 0,
    activeVehicles: 0,
    completedVehicles: 0,
    activeAnomalies: 0,
};

interface SimState {
    config: SimulationConfig;
    setConfig: (partial: any) => void;
    resetConfig: () => void;
    isRunning: boolean;
    isPaused: boolean;
    isComplete: boolean;
    turboMode: boolean;
    setRunning: (v: boolean) => void;
    setPaused: (v: boolean) => void;
    setComplete: (v: boolean) => void;
    setTurboMode: (v: boolean) => void;
    progress: any;
    setProgress: (p: any) => void;
    statistics: any;
    setStatistics: (s: any) => void;
    chartData: any;
    setChartData: (d: any) => void;
    logs: any[];
    addLog: (log: any) => void;
    clearLogs: () => void;
    resetAll: () => void;
}

export const useSimStore = create<SimState>()(
    persist(
        (set) => ({
            config: defaultConfig,
            setConfig: (partial: any) =>
                set((state: any) => ({ config: { ...state.config, ...partial } })),
            resetConfig: () => set({ config: defaultConfig }),

            isRunning: false,
            isPaused: false,
            isComplete: false,
            turboMode: true,
            setRunning: (v: boolean) => set({ isRunning: v }),
            setPaused: (v: boolean) => set({ isPaused: v }),
            setComplete: (v: boolean) => set({ isComplete: v }),
            setTurboMode: (v: boolean) => set({ turboMode: v }),

            progress: defaultProgress,
            setProgress: (p: any) => set({ progress: p }),

            statistics: null,
            setStatistics: (s: any) => set({ statistics: s }),

            chartData: null,
            setChartData: (d: any) => set({ chartData: d }),

            logs: [],
            addLog: (log: Record<string, any>) =>
                set((state: any) => ({
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
            version: 1,
            merge: (persistedState: any, currentState) => {
                // Deep merge persisted config with default config to ensure new fields are present
                if (!persistedState || !persistedState.config) {
                    return currentState;
                }
                return {
                    ...currentState,
                    ...persistedState,
                    config: {
                        ...currentState.config,
                        ...persistedState.config,
                    },
                };
            },
        }
    )
);
