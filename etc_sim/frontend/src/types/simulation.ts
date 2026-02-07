/**
 * 仿真配置类型定义
 */

// 仿真配置
export interface SimulationConfig {
    // 道路参数
    roadLengthKm: number;
    numLanes: number;
    laneWidth: number;

    // 车辆参数
    totalVehicles: number;
    carRatio: number;
    truckRatio: number;
    busRatio: number;

    // 驾驶风格比例
    aggressiveRatio: number;
    normalRatio: number;
    conservativeRatio: number;

    // 异常参数
    anomalyRatio: number;
    anomalyStartTime: number;

    // 时间参数
    simulationDt: number;
    maxSimulationTime: number;

    // ETC 参数
    etcGateIntervalKm: number;
}

// 车辆快照
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

// 仿真进度
export interface SimulationProgress {
    currentTime: number;
    totalTime: number;
    progress: number;
    activeVehicles: number;
    completedVehicles: number;
    activeAnomalies: number;
}

// 仿真统计结果
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
}

// 日志条目
export interface LogEntry {
    timestamp: number;
    level: 'INFO' | 'WARNING' | 'ERROR';
    category: string;
    message: string;
}

// 默认配置
export const DEFAULT_CONFIG: SimulationConfig = {
    roadLengthKm: 10,
    numLanes: 4,
    laneWidth: 3.5,
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
    maxSimulationTime: 3600,
    etcGateIntervalKm: 2,
};
