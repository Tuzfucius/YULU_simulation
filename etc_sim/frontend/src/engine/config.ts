/**
 * 仿真配置常量
 * 完整移植自 模拟车流.py
 */

// --- 道路配置 ---
export const ROAD_LENGTH_KM = 10;
export const SEGMENT_LENGTH_KM = 1;
export const NUM_SEGMENTS = Math.floor(ROAD_LENGTH_KM / SEGMENT_LENGTH_KM);
export const NUM_LANES = 4;
export const LANE_WIDTH = 3.5;

// --- 车辆目标 ---
export const TOTAL_VEHICLES_TARGET = 1200;
export const SIMULATION_DT = 1.0;
export const TRAJECTORY_SAMPLE_INTERVAL = 2; // 轨迹采样间隔（秒），可调：1/2/5/10

// --- 仿真时间计算 ---
// 60km/h 跑完 ROAD_LENGTH_KM 所需时间（秒）
export const RUN_TIME_60KMH = (ROAD_LENGTH_KM / 60) * 3600;
// 最后发车时间估计：每10秒投放一批
export const LAST_SPAWN_TIME = (TOTAL_VEHICLES_TARGET / 5) * 10;
// 最大模拟时间 = 最后发车时间 + 行驶时间 + 5分钟缓冲
export const MAX_SIMULATION_TIME = Math.floor(LAST_SPAWN_TIME + RUN_TIME_60KMH + 300);

// --- 异常配置 ---
export const GLOBAL_ANOMALY_START = 200; // 秒
export const VEHICLE_SAFE_RUN_TIME = 60; // 安全运行时间
export const IMPACT_DISCOVER_DIST = 200; // 异常影响发现距离（米）- Default, can be overridden
export const IMPACT_THRESHOLD = 0.90; // 受影响阈值
export const IMPACT_SPEED_RATIO = 0.70; // 速度低于期望的70%视为受影响
export const SLOWDOWN_RATIO = 0.85; // 每个下游异常减速系数
export const FORCED_CHANGE_DIST = 400; // 强制换道距离（米）

// New Anomaly Defaults
export const ANOMALY_PROBABILITIES = {
    TYPE1: 0.10, // 事故/停车 (Low prob)
    TYPE2: 0.45, // 减速
    TYPE3: 0.45  // 波动
};

export const ANOMALY_DURATIONS = {
    TYPE1: 120, // 事故持续时间 (s) - Auto clear
    TYPE2: 10,
    TYPE3: 20
};

// --- 换道配置 ---
export const LANE_CHANGE_STEPS = 5; // 换道平滑步数
export const LANE_CHANGE_DURATION = 2.5; // 换道持续时间（秒）

// --- 颜色定义 ---
export const COLORS = {
    NORMAL: '#1f77b4',
    IMPACTED: '#ff7f0e',
    TYPE1: '#8b0000', // 完全静止
    TYPE2: '#9400d3', // 短暂波动
    TYPE3: '#8b4513', // 长时波动
    CAR: '#3b82f6',
    TRUCK: '#f97316',
    BUS: '#22c55e',
    AGGRESSIVE: '#ef4444',
    NORMAL_DRIVER: '#3b82f6',
    CONSERVATIVE: '#22c55e',
};

// --- 车辆类型配置 ---
export const VEHICLE_TYPE_CONFIG = {
    CAR: {
        weight: 0.60,
        v0_kmh: 120,
        a_max: 3.0,
        b_desired: 3.5,
        s0: 2.0,
        T: 1.5,
        delta: 4.0,
        length: 4.5,
        reactionTime: [0.8, 1.2] as [number, number],
        color: COLORS.CAR,
        name: 'Car',
    },
    TRUCK: {
        weight: 0.25,
        v0_kmh: 100,
        a_max: 2.0,
        b_desired: 2.5,
        s0: 2.5,
        T: 1.8,
        delta: 4.0,
        length: 12.0,
        reactionTime: [1.0, 1.5] as [number, number],
        color: COLORS.TRUCK,
        name: 'Truck',
    },
    BUS: {
        weight: 0.15,
        v0_kmh: 90,
        a_max: 1.8,
        b_desired: 2.2,
        s0: 2.2,
        T: 1.6,
        delta: 4.0,
        length: 10.0,
        reactionTime: [0.9, 1.3] as [number, number],
        color: COLORS.BUS,
        name: 'Bus',
    },
};

// --- 驾驶风格配置 ---
export const DRIVER_STYLE_CONFIG = {
    aggressive: {
        weight: 0.20,
        politeness: [0.15, 0.30] as [number, number],
        aggressiveness: [1.10, 1.20] as [number, number],
        color: COLORS.AGGRESSIVE,
        name: 'Aggressive',
    },
    normal: {
        weight: 0.60,
        politeness: [0.40, 0.60] as [number, number],
        aggressiveness: [0.95, 1.05] as [number, number],
        color: COLORS.NORMAL_DRIVER,
        name: 'Normal',
    },
    conservative: {
        weight: 0.20,
        politeness: [0.70, 0.90] as [number, number],
        aggressiveness: [0.80, 0.90] as [number, number],
        color: COLORS.CONSERVATIVE,
        name: 'Conservative',
    },
};

export type VehicleType = keyof typeof VEHICLE_TYPE_CONFIG;
export type DriverStyle = keyof typeof DRIVER_STYLE_CONFIG;
export type AnomalyType = 0 | 1 | 2 | 3;
export type AnomalyState = 'normal' | 'active' | 'cooling';
