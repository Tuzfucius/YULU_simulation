/**
 * 仿真状态管理 (Zustand)
 * 将共享类型与运行态拆开，避免组件和 store 之间字段漂移。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
    SimulationConfig,
    SimulationProgress,
    SimulationStatistics,
    SimulationChartData,
    SimulationLogEntry,
    SimulationLogInput,
    SimulationRuntimeData,
} from '../types/simulation';

const defaultConfig: SimulationConfig = {
    roadLengthKm: 10,
    numLanes: 4,
    laneWidth: 3.5,
    etcGateIntervalKm: 2,
    totalVehicles: 1200,
    carRatio: 0.60,
    truckRatio: 0.25,
    busRatio: 0.15,
    aggressiveRatio: 0.20,
    normalRatio: 0.60,
    conservativeRatio: 0.20,
    anomalyRatio: 0.01,
    anomalyStartTime: 200,
    simulationDt: 1.0,
    trajectorySampleInterval: 2,
    maxSimulationTime: 3000,
    globalAnomalyStart: 200,
    vehicleSafeRunTime: 200,
    laneChangeDelay: 2.0,
    impactThreshold: 0.90,
    impactDiscoverDist: 200,
    anomalyProbType1: 0.10,
    anomalyProbType2: 0.45,
    anomalyProbType3: 0.45,
    anomalyDurationType1: 120,
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
    setConfig: (partial: Partial<SimulationConfig>) => void;
    resetConfig: () => void;
    isRunning: boolean;
    isPaused: boolean;
    isComplete: boolean;
    turboMode: boolean;
    setRunning: (v: boolean) => void;
    setPaused: (v: boolean) => void;
    setComplete: (v: boolean) => void;
    setTurboMode: (v: boolean) => void;
    progress: SimulationProgress;
    setProgress: (p: SimulationProgress) => void;
    statistics: SimulationStatistics | null;
    setStatistics: (s: SimulationStatistics | Record<string, unknown> | null) => void;
    simulationData: SimulationRuntimeData | null;
    setSimulationData: (d: SimulationRuntimeData | Record<string, unknown> | null) => void;
    chartData: SimulationChartData | null;
    setChartData: (d: SimulationChartData | null) => void;
    logs: SimulationLogEntry[];
    addLog: (log: SimulationLogInput) => void;
    clearLogs: () => void;
    resetAll: () => void;
}

function normalizeStatistics(
    value: SimulationStatistics | Record<string, unknown> | null,
): SimulationStatistics | null {
    if (!value) {
        return null;
    }

    return {
        totalVehicles: Number(value.totalVehicles ?? 0),
        completedVehicles: Number(value.completedVehicles ?? 0),
        avgSpeed: Number(value.avgSpeed ?? 0),
        avgTravelTime: Number(value.avgTravelTime ?? 0),
        totalAnomalies: Number(value.totalAnomalies ?? 0),
        affectedByAnomaly: Number(value.affectedByAnomaly ?? 0),
        totalLaneChanges: Number(value.totalLaneChanges ?? 0),
        maxCongestionLength: Number(value.maxCongestionLength ?? 0),
        simulationTime: Number(value.simulationTime ?? 0),
        etc_transactions_count: value.etc_transactions_count === undefined
            ? undefined
            : Number(value.etc_transactions_count),
        etc_alerts_count: value.etc_alerts_count === undefined
            ? undefined
            : Number(value.etc_alerts_count),
        segmentBoundaries: value.segmentBoundaries as number[] | undefined,
        segmentSpeedHistory: value.segmentSpeedHistory as unknown[] | undefined,
        sampledTrajectory: value.sampledTrajectory as unknown[] | undefined,
        anomalyLogs: value.anomalyLogs as unknown[] | undefined,
    };
}

function normalizeSimulationData(
    value: SimulationRuntimeData | Record<string, unknown> | null,
): SimulationRuntimeData | null {
    if (!value) {
        return null;
    }

    const rawStatistics = value.statistics ? (value.statistics as Record<string, unknown>) : null;
    const normalizedStatistics = rawStatistics ? normalizeStatistics(rawStatistics) : null;

    return {
        ...value,
        statistics: normalizedStatistics ? {
            ...normalizedStatistics,
            etc_transactions_count: Number(rawStatistics?.etc_transactions_count ?? 0),
            etc_alerts_count: Number(rawStatistics?.etc_alerts_count ?? 0),
            segmentBoundaries: rawStatistics?.segmentBoundaries as number[] | undefined,
            segmentSpeedHistory: rawStatistics?.segmentSpeedHistory as unknown[] | undefined,
            sampledTrajectory: rawStatistics?.sampledTrajectory as unknown[] | undefined,
            anomalyLogs: rawStatistics?.anomalyLogs as unknown[] | undefined,
        } : undefined,
    };
}

export const useSimStore = create<SimState>()(
    persist(
        (set) => ({
            config: defaultConfig,
            setConfig: (partial: Partial<SimulationConfig>) =>
                set((state: SimState) => ({ config: { ...state.config, ...partial } })),
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
            setProgress: (p: SimulationProgress) => set({ progress: p }),

            statistics: null,
            setStatistics: (s) => set({ statistics: normalizeStatistics(s) }),

            simulationData: null,
            setSimulationData: (d) => set({ simulationData: normalizeSimulationData(d) }),

            chartData: null,
            setChartData: (d: SimulationChartData | null) => set({ chartData: d }),

            logs: [],
            addLog: (log: SimulationLogInput) =>
                set((state: SimState) => ({
                    logs: [...state.logs.slice(-199), { ...log, id: log.id ?? Date.now().toString() } as SimulationLogEntry],
                })),
            clearLogs: () => set({ logs: [] }),

            resetAll: () =>
                set({
                    isRunning: false,
                    isPaused: false,
                    isComplete: false,
                    progress: defaultProgress,
                    statistics: null,
                    simulationData: null,
                    chartData: null,
                    logs: [],
                }),
        }),
        {
            name: 'sim-config',
            partialize: (state) => ({ config: state.config }),
            version: 1,
            merge: (persistedState: unknown, currentState) => {
                const persisted = persistedState as Partial<SimState> | null;
                if (!persisted || !persisted.config) {
                    return currentState;
                }
                return {
                    ...currentState,
                    ...persisted,
                    config: {
                        ...currentState.config,
                        ...persisted.config,
                    },
                };
            },
        },
    ),
);
