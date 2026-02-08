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

    // Anomaly Configuration
    anomalyProbType1: number;
    anomalyProbType2: number;
    anomalyProbType3: number;
    anomalyDurationType1: number;
}

// ... (existing interfaces)

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
            turboMode: true,
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
