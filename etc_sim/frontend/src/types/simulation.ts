/**
 * 前端共享仿真类型
 *
 * 这里不追求和后端逐字一致，而是收敛前端实际运行时会用到的核心结构。
 */

export interface SimulationConfig {
    roadLengthKm: number;
    numLanes: number;
    laneWidth: number;
    etcGateIntervalKm: number;
    totalVehicles: number;
    carRatio: number;
    truckRatio: number;
    busRatio: number;
    aggressiveRatio: number;
    normalRatio: number;
    conservativeRatio: number;
    anomalyRatio: number;
    anomalyStartTime: number;
    simulationDt: number;
    trajectorySampleInterval: number;
    maxSimulationTime: number;
    globalAnomalyStart: number;
    vehicleSafeRunTime: number;
    laneChangeDelay: number;
    impactThreshold: number;
    impactDiscoverDist: number;
    anomalyProbType1: number;
    anomalyProbType2: number;
    anomalyProbType3: number;
    anomalyDurationType1: number;
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
    customRoadPath?: string;
    customRoadLengthKm?: number;
    customGantryPositionsKm?: number[];
    customRamps?: unknown[];
    enableNoise: boolean;
    speedVariance: number;
    dropRate: number;
}

export interface VehicleSnapshot {
    id: number;
    x: number;
    y: number;
    lane: number;
    speed: number;
    vehicleType: 'CAR' | 'TRUCK' | 'BUS';
    driverStyle: 'aggressive' | 'normal' | 'conservative';
    anomalyState: 'none' | 'active' | 'recovered';
    isAffected: boolean;
    length: number;
    color: string;
}

export interface SimulationProgress {
    currentTime: number;
    totalTime: number;
    progress: number;
    activeVehicles: number;
    completedVehicles: number;
    activeAnomalies: number;
}

export interface SimulationStatistics {
    totalVehicles: number;
    completedVehicles: number;
    avgSpeed: number;
    avgTravelTime: number;
    totalAnomalies: number;
    affectedByAnomaly: number;
    totalLaneChanges: number;
    maxCongestionLength: number;
    simulationTime: number;
    etc_transactions_count?: number;
    etc_alerts_count?: number;
    segmentBoundaries?: number[];
    segmentSpeedHistory?: unknown[];
    sampledTrajectory?: unknown[];
    anomalyLogs?: unknown[];
}

export interface SimulationRunStatistics extends SimulationStatistics {
    etc_transactions_count?: number;
    etc_alerts_count?: number;
    segmentBoundaries?: number[];
    segmentSpeedHistory?: unknown[];
    sampledTrajectory?: unknown[];
    anomalyLogs?: unknown[];
    [key: string]: unknown;
}

export interface ETCGateStatistics {
    total_transactions: number;
    avg_speed: number;
}

export interface ETCNoiseStatistics {
    missed_read_count: number;
    duplicate_read_count: number;
    delayed_upload_count: number;
    clock_drift_count: number;
    missed_read_rate_actual: number;
}

export interface ETCAlertSummary {
    type: string;
    gate_id: string;
    timestamp: number;
    severity: string;
    description?: string;
}

export interface ETCDetectionData {
    alerts: ETCAlertSummary[];
    gate_stats: Record<string, ETCGateStatistics>;
    noise_statistics: ETCNoiseStatistics;
    transactions?: unknown[];
}

export interface SimulationRuntimeData {
    config?: SimulationConfig;
    statistics?: SimulationRunStatistics;
    etc_detection?: ETCDetectionData;
    progress?: SimulationProgress;
    chartData?: SimulationChartData | null;
    logs?: SimulationLogEntry[];
    [key: string]: unknown;
}

export interface SimulationChartPoint {
    time: number;
    value: number;
    label?: string;
}

export interface SimulationChartData {
    speedHistory: SimulationChartPoint[];
    flowHistory: SimulationChartPoint[];
    densityHistory: SimulationChartPoint[];
    [key: string]: SimulationChartPoint[];
}

export interface SimulationLogEntry {
    id: string;
    level: 'INFO' | 'WARNING' | 'ERROR';
    message: string;
    timestamp: number;
    category?: string;
}

export interface SimulationLogInput {
    id?: string;
    level: SimulationLogEntry['level'];
    message: string;
    timestamp: number;
    category?: string;
    [key: string]: unknown;
}

export const DEFAULT_CONFIG: SimulationConfig = {
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
