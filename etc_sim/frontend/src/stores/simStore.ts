/**
 * 仿真状态管理
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
    SimulationChartData,
    SimulationConfig,
    SimulationConnectionStatus,
    SimulationLogEntry,
    SimulationLogInput,
    SimulationProgress,
    SimulationRuntimeData,
    SimulationServerEvent,
    SimulationStatistics,
} from '../types/simulation';
import { DEFAULT_CONFIG } from '../types/simulation';
import {
    normalizeRuntimeData,
    normalizeStatistics,
    reduceSimulationServerEvent,
} from '../services/simulationSession';

const defaultConfig: SimulationConfig = DEFAULT_CONFIG;

const defaultProgress: SimulationProgress = {
    currentTime: 0,
    totalTime: defaultConfig.maxSimulationTime,
    progress: 0,
    activeVehicles: 0,
    completedVehicles: 0,
    activeAnomalies: 0,
};

interface SimState {
    config: SimulationConfig;
    setConfig: (partial: Partial<SimulationConfig>) => void;
    resetConfig: () => void;
    sessionId: string | null;
    connectionStatus: SimulationConnectionStatus;
    lastError: string | null;
    setSession: (sessionId: string | null) => void;
    setConnectionStatus: (status: SimulationConnectionStatus) => void;
    isRunning: boolean;
    isPaused: boolean;
    isComplete: boolean;
    turboMode: boolean;
    setRunning: (value: boolean) => void;
    setPaused: (value: boolean) => void;
    setComplete: (value: boolean) => void;
    setTurboMode: (value: boolean) => void;
    progress: SimulationProgress;
    setProgress: (progress: SimulationProgress) => void;
    statistics: SimulationStatistics | null;
    setStatistics: (statistics: SimulationStatistics | Record<string, unknown> | null) => void;
    simulationData: SimulationRuntimeData | null;
    setSimulationData: (data: SimulationRuntimeData | Record<string, unknown> | null) => void;
    chartData: SimulationChartData | null;
    setChartData: (data: SimulationChartData | null) => void;
    logs: SimulationLogEntry[];
    addLog: (log: SimulationLogInput) => void;
    clearLogs: () => void;
    resetRuntimeState: () => void;
    resetAll: () => void;
    applyServerEvent: (event: SimulationServerEvent) => void;
}

function appendLog(logs: SimulationLogEntry[], log: SimulationLogInput): SimulationLogEntry[] {
    const level = String(log.level).toUpperCase();
    return [
        ...logs.slice(-199),
        {
            id: log.id ?? `${Date.now()}`,
            level: level === 'ERROR' ? 'ERROR' : (level === 'WARN' || level === 'WARNING' ? 'WARNING' : 'INFO'),
            message: log.message,
            timestamp: log.timestamp,
            category: log.category,
        },
    ];
}

function buildRuntimeReset(state: Pick<SimState, 'config' | 'sessionId'>) {
    const progress = {
        ...defaultProgress,
        totalTime: state.config.maxSimulationTime,
    };

    return {
        isRunning: false,
        isPaused: false,
        isComplete: false,
        progress,
        statistics: null,
        simulationData: state.sessionId ? { sessionId: state.sessionId, config: state.config, progress } : null,
        chartData: null,
        logs: [] as SimulationLogEntry[],
        lastError: null,
    };
}

export const useSimStore = create<SimState>()(
    persist(
        (set) => ({
            config: defaultConfig,
            setConfig: (partial) => set((state) => ({
                config: { ...state.config, ...partial },
                progress: state.isRunning || state.isPaused
                    ? state.progress
                    : { ...state.progress, totalTime: partial.maxSimulationTime ?? state.config.maxSimulationTime },
            })),
            resetConfig: () => set({ config: defaultConfig, progress: { ...defaultProgress, totalTime: defaultConfig.maxSimulationTime } }),
            sessionId: null,
            connectionStatus: 'disconnected',
            lastError: null,
            setSession: (sessionId) => set({ sessionId }),
            setConnectionStatus: (status) => set({ connectionStatus: status }),
            isRunning: false,
            isPaused: false,
            isComplete: false,
            turboMode: true,
            setRunning: (value) => set({ isRunning: value }),
            setPaused: (value) => set({ isPaused: value }),
            setComplete: (value) => set({ isComplete: value }),
            setTurboMode: (value) => set({ turboMode: value }),
            progress: defaultProgress,
            setProgress: (progress) => set({ progress }),
            statistics: null,
            setStatistics: (statistics) => set({ statistics: normalizeStatistics(statistics) }),
            simulationData: null,
            setSimulationData: (data) => set((state) => ({ simulationData: normalizeRuntimeData(data, state.config) })),
            chartData: null,
            setChartData: (data) => set({ chartData: data }),
            logs: [],
            addLog: (log) => set((state) => ({ logs: appendLog(state.logs, log) })),
            clearLogs: () => set({ logs: [] }),
            resetRuntimeState: () => set((state) => buildRuntimeReset(state)),
            resetAll: () => set((state) => ({
                ...buildRuntimeReset(state),
                config: defaultConfig,
                sessionId: state.sessionId,
                connectionStatus: state.connectionStatus,
            })),
            applyServerEvent: (event) => set((state) => reduceSimulationServerEvent(state, event)),
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
