/**
 * 仿真引擎
 * 完整移植自 模拟车流.py
 */

import { Vehicle } from './Vehicle';
import {
    SEGMENT_LENGTH_KM,
    NUM_SEGMENTS,
    SIMULATION_DT,
    VEHICLE_TYPE_CONFIG,
    DRIVER_STYLE_CONFIG,
    COLORS,
    type VehicleType,
    type DriverStyle,
    type AnomalyType,
} from './config';
import { useSimStore } from '../stores/simStore';
import {
    buildCurveProfile,
    getCurveRadius,
    type CurveSegment,
} from './CurvatureProfile';

// 异常日志
interface AnomalyLog {
    id: number;
    type: AnomalyType;
    time: number;
    posKm: number;
    segment: number;
}

// 轨迹点
export interface TrajectoryPoint {
    id: number;
    time: number;
    pos: number;
    lane: number;
    speed: number;
    anomalyType: AnomalyType;
    anomalyState: string;
    isAffected: boolean;
}


// 区间速度记录
interface SegmentSpeedRecord {
    time: number;
    segment: number;
    avgSpeed: number;
    density: number;
    vehicleCount: number;
    flow: number; // 流量 = 密度 * 速度
}

// 车道历史记录
interface LaneHistoryRecord {
    time: number;
    counts: Record<string, number>; // lane index -> count
}

// 图表数据
export interface ChartData {
    // 速度分布
    speedDistribution: { range: string; count: number }[];
    // 车辆类型
    vehicleTypeData: { name: string; value: number; color: string }[];
    // 进度曲线
    progressData: { time: number; completed: number; active: number }[];
    // 换道分析
    laneChangeData: {
        byReason: { reason: string; count: number }[];
        byStyle: { style: string; count: number; color: string }[];
    };
    // 异常分布
    anomalyDistribution: { segment: string; type1: number; type2: number; type3: number }[];
    // 区间速度热力图数据
    speedHeatmap: { time: number; segment: number; speed: number }[];
    // 车辆类型速度对比
    typeSpeedComparison: { type: string; avgSpeed: number; color: string }[];
    // 驾驶风格分析
    driverStyleAnalysis: {
        counts: { style: string; count: number; color: string }[];
        avgSpeeds: { style: string; speed: number; color: string }[];
    };
    // 轨迹数据 (采样)
    trajectoryData: TrajectoryPoint[];
    speedProfile: { timeSegment: number; avgSpeed: number; label: string }[];
    simulationTime: number;
}

export class SimulationEngine {
    private vehicles: Vehicle[] = [];
    private finishedVehicles: Vehicle[] = [];
    private vehicleIdCounter: number = 0;
    private currentTime: number = 0;
    private spawnSchedule: number[] = [];
    private spawnIndex: number = 0;

    // 动态路段参数（每次 start() 时根据 simStore 重新计算）
    private segmentLengthKm: number = SEGMENT_LENGTH_KM;
    private numSegments: number = NUM_SEGMENTS;
    /** 区间边界里程（km）数组，长度为 numSegments+1，例如 [0, g1, g2, ..., roadLength] */
    private segmentBoundaries: number[] = [];
    /** 弯道曲率档案（load 自定义路网时构建） */
    private curveProfile: CurveSegment[] = [];

    // 记录数据
    private anomalyLogs: AnomalyLog[] = [];
    private trajectoryData: TrajectoryPoint[] = [];
    private segmentSpeedHistory: SegmentSpeedRecord[] = [];
    private laneHistory: LaneHistoryRecord[] = [];
    private progressHistory: { time: number; completed: number; active: number }[] = [];


    // 统计
    private typeCount: Record<VehicleType, number> = { CAR: 0, TRUCK: 0, BUS: 0 };
    private styleCount: Record<DriverStyle, number> = { aggressive: 0, normal: 0, conservative: 0 };
    private totalLaneChanges: number = 0;
    private laneChangeByReason: { free: number; forced: number } = { free: 0, forced: 0 };
    private laneChangeByStyle: Record<DriverStyle, number> = { aggressive: 0, normal: 0, conservative: 0 };
    private speedHistory: number[] = [];

    constructor() {
    }

    // --- 生成投放计划 ---
    private planSpawns(totalVehicles: number) {
        this.spawnSchedule = [];
        let tCycle = 0;

        // 精确生成目标数量的投放时间戳
        while (this.spawnSchedule.length < totalVehicles) {
            const remaining = totalVehicles - this.spawnSchedule.length;
            const n = Math.min(2 + Math.floor(Math.random() * 5), remaining);
            const timestamps = Array.from({ length: n }, () => tCycle + Math.random() * 10);
            this.spawnSchedule.push(...timestamps);
            tCycle += 10;
        }

        // 确保精确为目标数量
        this.spawnSchedule = this.spawnSchedule.slice(0, totalVehicles).sort((a, b) => a - b);
    }


    // 循环控制
    private timeoutId: any = null;

    // --- 启动仿真 ---
    async start() {
        const store = useSimStore.getState();
        const config = store.config;

        // 动态计算路段参数
        const roadLengthKm = config.roadLengthKm;
        const gantryPositions = config.customGantryPositionsKm;
        if (gantryPositions && gantryPositions.length >= 1) {
            // 自定义路网：按门架位置划分区间，区间数 = 门架数 + 1
            // 边界：[0, g1, g2, ..., gN, roadLength]（含首尾）
            this.segmentBoundaries = [0, ...gantryPositions, roadLengthKm];
            this.numSegments = gantryPositions.length + 1;
            // segmentLengthKm 此时无意义（各区间不等长），置为平均值供兼容
            this.segmentLengthKm = roadLengthKm / this.numSegments;
        } else {
            // 无自定义路网：按 ETC 门架间距均匀划分区间
            const intervalKm = (config.etcGateIntervalKm > 0) ? config.etcGateIntervalKm : 1;
            this.numSegments = Math.max(1, Math.ceil(roadLengthKm / intervalKm));
            this.segmentLengthKm = roadLengthKm / this.numSegments;
            // 均匀分布的边界
            this.segmentBoundaries = Array.from(
                { length: this.numSegments + 1 },
                (_, i) => i * this.segmentLengthKm
            );
        }

        // 重置
        this.vehicles = [];
        this.finishedVehicles = [];
        this.vehicleIdCounter = 0;
        this.currentTime = 0;
        this.spawnIndex = 0;
        this.anomalyLogs = [];
        this.trajectoryData = [];
        this.segmentSpeedHistory = [];
        this.progressHistory = [];
        this.typeCount = { CAR: 0, TRUCK: 0, BUS: 0 };
        this.styleCount = { aggressive: 0, normal: 0, conservative: 0 };
        this.totalLaneChanges = 0;
        this.laneChangeByReason = { free: 0, forced: 0 };
        this.laneChangeByStyle = { aggressive: 0, normal: 0, conservative: 0 };
        this.speedHistory = [];
        this.sampledTrajectoryData = [];

        // 构建弯道曲率档案（仅自定义路网时有效）
        try {
            const customRoadPath = config.customRoadPath;
            if (customRoadPath) {
                const res = await fetch(`http://localhost:8000/api/custom-roads/${customRoadPath}`).catch(() => null);
                if (res && res.ok) {
                    const roadData = await res.json();
                    const nodes = roadData.nodes || [];
                    const scaleM = roadData.meta?.scale_m_per_unit ?? 2;
                    this.curveProfile = buildCurveProfile(nodes, scaleM);
                } else {
                    this.curveProfile = [];
                }
            } else {
                this.curveProfile = [];
            }
        } catch {
            this.curveProfile = [];
        }

        this.planSpawns(config.totalVehicles);

        store.setRunning(true);
        store.setPaused(false);
        store.setComplete(false);
        store.setStatistics(null);
        store.setChartData(null);

        store.addLog({
            timestamp: 0,
            level: 'INFO',
            category: 'SYSTEM',
            message: `Simulation started: ${roadLengthKm.toFixed(1)}km × ${config.numLanes} lanes (${this.numSegments} segments × ${this.segmentLengthKm.toFixed(2)}km), target ${config.totalVehicles} vehicles`,
        });

        // 启动循环
        this.runLoop();
    }

    private runLoop() {
        const store = useSimStore.getState();
        if (!store.isRunning || store.isPaused || store.isComplete) {
            return;
        }

        const isTurbo = store.turboMode;

        if (isTurbo) {
            // 极速模式：批量执行
            // 每次执行 20 次 step (即 100个时间步)，然后让出主线程
            const batchSize = 20;
            for (let i = 0; i < batchSize; i++) {
                // 如果中途停止或完成，立即退出
                const currentStore = useSimStore.getState();
                if (!currentStore.isRunning || currentStore.isPaused || currentStore.isComplete) return;

                this.step(true); // suppress UI updates
            }
            // 批量执行完后更新一次 UI
            this.updateUI();

            // 立即调度下一次
            this.timeoutId = setTimeout(() => this.runLoop(), 0);
        } else {
            // 普通模式：执行一次，等待 100ms
            this.step(false);
            this.timeoutId = setTimeout(() => this.runLoop(), 100);
        }
    }

    // --- 单步仿真 ---
    private step(suppressUI: boolean = false) {
        const store = useSimStore.getState();
        const config = store.config;

        // 每次 step 模拟 5 个时间步 (5 * simulationDt)
        for (let i = 0; i < 5; i++) {
            this.currentTime += SIMULATION_DT;

            // 生成车辆
            this.spawnVehicles(config);

            // 更新车辆
            this.updateVehicles();

            // 记录轨迹（每10秒采样）
            if (Math.floor(this.currentTime) % 10 === 0) {
                this.recordTrajectory();
            }

            // 记录区间速度（每30秒）
            if (Math.floor(this.currentTime) % 30 === 0) {
                this.recordSegmentSpeed();
            }
        }

        // 更新 UI (仅在不抑制时更新)
        if (!suppressUI) {
            this.updateUI();
        }

        // 检查完成条件
        // 修复：如果还有活跃车辆，允许延长仿真时间，直到所有车辆完成或达到 2倍最大时间
        // 这解决了 "Completed Vehicles" 远小于 "Target" 的问题
        const activeVehiclesCount = this.vehicles.length;
        const allSpawned = this.spawnIndex >= this.spawnSchedule.length;
        const hardTimeLimit = config.maxSimulationTime * 2; // 2x buffer

        if (allSpawned && activeVehiclesCount === 0) {
            this.complete('Simulation completed normally (All finished)');
        } else if (this.currentTime >= hardTimeLimit) {
            this.complete('Simulation stopped (Hard time limit reached)');
        } else if (this.currentTime >= config.maxSimulationTime) {
            // 超过预期时间，但还有车辆
            if (activeVehiclesCount > 0) {
                // 继续运行，但在 log 中提示 (可选)
                if (Math.floor(this.currentTime) % 100 === 0) {
                    // store.addLog(...) // Optional: log extension
                }
            } else {
                if (allSpawned) this.complete('Simulation completed (Time limit reached)');
            }
        }
    }

    // --- 生成车辆 ---
    private spawnVehicles(config: any) {
        // 检查是否还有需要投放的车辆且当前时间已到
        while (this.spawnIndex < this.spawnSchedule.length && this.spawnSchedule[this.spawnIndex] <= this.currentTime) {
            // 检查是否已达到目标数量
            if (this.vehicleIdCounter >= config.totalVehicles) {
                this.spawnIndex = this.spawnSchedule.length; // 跳过剩余
                break;
            }

            const laneChoices = Array.from({ length: config.numLanes }, (_, i) => i).sort(() => Math.random() - 0.5);

            for (const lane of laneChoices) {
                let clear = true;
                for (const v of this.vehicles) {
                    if (v.lane === lane && v.pos < 50) {
                        clear = false;
                        break;
                    }
                }

                if (clear) {
                    const isPotentialAnomaly = Math.random() < config.anomalyRatio;

                    // 确定车辆类型
                    const typeRand = Math.random();
                    let type: VehicleType = 'CAR';
                    if (typeRand < config.carRatio) type = 'CAR';
                    else if (typeRand < config.carRatio + config.truckRatio) type = 'TRUCK';
                    else type = 'BUS';

                    // 确定驾驶风格
                    const styleRand = Math.random();
                    let style: DriverStyle = 'normal';
                    if (styleRand < config.aggressiveRatio) style = 'aggressive';
                    else if (styleRand < config.aggressiveRatio + config.conservativeRatio) style = 'conservative';
                    else style = 'normal';

                    const vehicle = new Vehicle(
                        this.vehicleIdCounter++,
                        lane,
                        this.currentTime,
                        isPotentialAnomaly,
                        type,
                        style
                    );
                    this.vehicles.push(vehicle);

                    // 统计
                    this.typeCount[vehicle.type]++;
                    this.styleCount[vehicle.driverStyle]++;
                    this.speedHistory.push(vehicle.speed * 3.6);

                    break;
                }
            }

            // 无论是否放置成功，都移动到下一个投放时间（避免无限循环）
            this.spawnIndex++;
        }
    }

    // --- 更新车辆 ---
    private updateVehicles() {
        const store = useSimStore.getState();
        const roadLengthM = store.config.roadLengthKm * 1000;
        const blockedLanes = new Set<number>();
        const completedIds: number[] = [];

        // 准备路段边界（米），用于 Vehicle.update 修正区间统计
        const boundariesM = this.segmentBoundaries.map(k => k * 1000);

        // 更新每辆车
        for (const v of this.vehicles) {
            // 每帧注入弯道半径（加错返回 Infinity）
            v.currentCurveRadius = getCurveRadius(v.pos / 1000, this.curveProfile);

            // 尝试触发异常
            const anomalyResult = v.triggerAnomaly(this.currentTime);
            if (anomalyResult) {
                // 修复：直接使用车辆当前维护的 segment，保证与统计逻辑一致
                const segmentIdx = v.currentSegment;
                this.anomalyLogs.push({
                    id: v.id,
                    type: anomalyResult.type,
                    time: anomalyResult.time,
                    posKm: anomalyResult.posKm,
                    segment: segmentIdx,
                });

                store.addLog({
                    timestamp: this.currentTime,
                    level: 'WARNING',
                    category: `ANOMALY_T${anomalyResult.type}`,
                    message: `Vehicle #${v.id} triggered Type${anomalyResult.type} at ${anomalyResult.posKm.toFixed(2)}km`,
                });
            }

            // 更新物理状态
            v.update(SIMULATION_DT, this.vehicles, blockedLanes, this.currentTime, boundariesM);

            // 检查完成
            if (v.pos >= roadLengthM) {
                completedIds.push(v.id);
                this.finishedVehicles.push(v);
                this.speedHistory.push(v.speed * 3.6);

                // 统计换道
                this.totalLaneChanges += v.laneChangeCount;
                this.laneChangeByReason.free += v.laneChangeReasons.free;
                this.laneChangeByReason.forced += v.laneChangeReasons.forced;
                this.laneChangeByStyle[v.driverStyle] += v.laneChangeCount;
            }
        }

        // 移除完成车辆
        this.vehicles = this.vehicles.filter(v => !completedIds.includes(v.id));
    }

    // --- 记录轨迹 ---
    private recordTrajectory() {
        for (const v of this.vehicles) {
            this.trajectoryData.push({
                id: v.id,
                time: this.currentTime,
                pos: v.pos,
                lane: v.lane,
                speed: v.speed,
                anomalyType: v.anomalyType,
                anomalyState: v.anomalyState,
                isAffected: v.isAffected,
            });
        }
    }

    // --- 记录区间速度 ---
    private recordSegmentSpeed() {
        const store = useSimStore.getState();
        const config = store.config;

        for (let seg = 0; seg < this.numSegments; seg++) {
            const segStartM = (this.segmentBoundaries[seg] ?? seg * this.segmentLengthKm) * 1000;
            const segEndM = (this.segmentBoundaries[seg + 1] ?? (seg + 1) * this.segmentLengthKm) * 1000;
            const segLenM = segEndM - segStartM;
            const vehiclesInSeg = this.vehicles.filter(v => v.pos >= segStartM && v.pos < segEndM);

            if (vehiclesInSeg.length > 0) {
                const avgSpeed = vehiclesInSeg.reduce((sum, v) => sum + v.speed, 0) / vehiclesInSeg.length;
                const density = (vehiclesInSeg.length / Math.max(segLenM, 1)) * 1000 * config.numLanes;
                const flow = density * avgSpeed; // 流量公式: q = k * v

                this.segmentSpeedHistory.push({
                    time: this.currentTime,
                    segment: seg,
                    avgSpeed,
                    density,
                    vehicleCount: vehiclesInSeg.length,
                    flow,
                });
            }
        }

        // 记录车道分布
        const laneCounts: Record<string, number> = {};
        for (let lane = 0; lane < config.numLanes; lane++) {
            laneCounts[String(lane)] = this.vehicles.filter(v => v.lane === lane).length;
        }
        this.laneHistory.push({ time: this.currentTime, counts: laneCounts });

        // 记录进度历史
        if (this.progressHistory.length < 200) {
            this.progressHistory.push({
                time: this.currentTime,
                completed: this.finishedVehicles.length,
                active: this.vehicles.length,
            });
        }
    }

    // --- 更新 UI ---
    private updateUI() {
        const store = useSimStore.getState();
        const config = store.config;

        // 修复进度条计算：如果超时运行，动态延长总时间，避免提前满格
        // 保持至少 10秒 或 5% 的缓冲，让用户知道仿真还在进行
        const isOvertime = this.currentTime >= config.maxSimulationTime;
        const activeVehicles = this.vehicles.length;

        // 动态总时间：如果超时且有车，总时间 = 当前时间 + 缓冲
        const displayTotalTime = (isOvertime && activeVehicles > 0)
            ? this.currentTime + 30
            : config.maxSimulationTime;

        const progress = Math.min((this.currentTime / displayTotalTime) * 100, 100);

        const avgSpeed = this.speedHistory.length > 0
            ? this.speedHistory.reduce((a, b) => a + b, 0) / this.speedHistory.length
            : 0;

        store.setProgress({
            currentTime: this.currentTime,
            totalTime: displayTotalTime, // 传给 UI 显示动态总时间
            progress,
            activeVehicles: this.vehicles.length,
            completedVehicles: this.finishedVehicles.length,
            activeAnomalies: this.vehicles.filter(v => v.anomalyState === 'active').length,
        });

        // 实时更新统计
        store.setStatistics({
            totalVehicles: this.vehicleIdCounter,
            completedVehicles: this.finishedVehicles.length,
            avgSpeed,
            avgTravelTime: this.finishedVehicles.length > 0
                ? (config.roadLengthKm * 1000) / ((avgSpeed / 3.6) || 1)
                : 0,
            totalAnomalies: this.anomalyLogs.length,
            // 修复：仅统计当前活跃受影响车辆（实时量）
            affectedByAnomaly: this.vehicles.filter(v => v.isAffected).length,
            totalLaneChanges: this.totalLaneChanges,
            maxCongestionLength: 0, // TODO
            simulationTime: this.currentTime,
        });
    }

    // --- 生成图表数据 ---
    private generateChartData(): ChartData {
        // 速度分布
        const speedBins = [0, 20, 40, 60, 80, 100, 120, 140];
        const speedDistribution = speedBins.slice(0, -1).map((min, i) => {
            const max = speedBins[i + 1];
            const count = this.speedHistory.filter(s => s >= min && s < max).length;
            return { range: `${min}-${max}`, count };
        });

        // 车辆类型
        const vehicleTypeData = [
            { name: 'Car', value: this.typeCount.CAR, color: COLORS.CAR },
            { name: 'Truck', value: this.typeCount.TRUCK, color: COLORS.TRUCK },
            { name: 'Bus', value: this.typeCount.BUS, color: COLORS.BUS },
        ];

        // 进度曲线
        const progressData = this.progressHistory.map(p => ({
            time: Math.floor(p.time),
            completed: p.completed,
            active: p.active,
        }));

        // 换道分析
        const laneChangeData = {
            byReason: [
                { reason: 'Free Flow', count: this.laneChangeByReason.free },
                { reason: 'Forced', count: this.laneChangeByReason.forced },
            ],
            byStyle: [
                { style: 'Aggressive', count: this.laneChangeByStyle.aggressive, color: COLORS.AGGRESSIVE },
                { style: 'Normal', count: this.laneChangeByStyle.normal, color: COLORS.NORMAL_DRIVER },
                { style: 'Conservative', count: this.laneChangeByStyle.conservative, color: COLORS.CONSERVATIVE },
            ],
            distribution: this.calcLaneChangeDistribution(),
        };

        // 异常分布
        const anomalyDistribution = Array.from({ length: this.numSegments }, (_, i) => ({
            segment: `${(i * this.segmentLengthKm).toFixed(1)}-${((i + 1) * this.segmentLengthKm).toFixed(1)}km`,
            type1: this.anomalyLogs.filter(a => a.segment === i && a.type === 1).length,
            type2: this.anomalyLogs.filter(a => a.segment === i && a.type === 2).length,
            type3: this.anomalyLogs.filter(a => a.segment === i && a.type === 3).length,
        }));

        // 速度热力图数据
        const speedHeatmap = this.segmentSpeedHistory.map(r => ({
            time: Math.floor(r.time / 60), // 分钟
            segment: r.segment,
            speed: r.avgSpeed * 3.6,
        }));

        // 车辆类型速度对比
        const typeSpeedComparison = (['CAR', 'TRUCK', 'BUS'] as VehicleType[]).map(type => {
            const speeds = this.finishedVehicles.filter(v => v.type === type).map(v => v.speed * 3.6);
            const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
            return {
                type: VEHICLE_TYPE_CONFIG[type].name,
                avgSpeed,
                color: VEHICLE_TYPE_CONFIG[type].color,
            };
        });

        // 驾驶风格分析
        const driverStyleAnalysis = {
            counts: (['aggressive', 'normal', 'conservative'] as DriverStyle[]).map(style => ({
                style: DRIVER_STYLE_CONFIG[style].name,
                count: this.styleCount[style],
                color: DRIVER_STYLE_CONFIG[style].color,
            })),
            avgSpeeds: (['aggressive', 'normal', 'conservative'] as DriverStyle[]).map(style => {
                const vehicles = this.finishedVehicles.filter(v => v.driverStyle === style);
                const avgSpeed = vehicles.length > 0
                    ? vehicles.reduce((sum, v) => sum + v.speed * 3.6, 0) / vehicles.length
                    : 0;
                return {
                    style: DRIVER_STYLE_CONFIG[style].name,
                    speed: avgSpeed,
                    color: DRIVER_STYLE_CONFIG[style].color,
                };
            }),
        };

        // 轨迹数据 (下采样以提高性能，限制最大点数)
        // 假设最大显示 5000 个点，随机采样或均匀采样
        const maxPoints = 5000;
        const samplingRate = Math.max(1, Math.floor(this.trajectoryData.length / maxPoints));
        const trajectoryData = this.trajectoryData.filter((_, i) => i % samplingRate === 0);

        // 车流速度画像 - 按时间段统计平均速度
        const SEGMENT_DURATION = 30; // 30秒一段
        const speedProfile: { timeSegment: number; avgSpeed: number; label: string }[] = [];
        const maxTime = this.currentTime;

        for (let t = 0; t < maxTime; t += SEGMENT_DURATION) {
            const speedsInSegment: number[] = [];

            // 从轨迹数据中提取该时间段的速度
            for (const point of this.trajectoryData) {
                if (point.time >= t && point.time < t + SEGMENT_DURATION) {
                    speedsInSegment.push(point.speed);
                }
            }

            if (speedsInSegment.length > 0) {
                const avgSpeed = speedsInSegment.reduce((a, b) => a + b, 0) / speedsInSegment.length;
                speedProfile.push({
                    timeSegment: Math.floor(t / SEGMENT_DURATION),
                    avgSpeed,
                    label: `${t}s-${t + SEGMENT_DURATION}s`,
                });
            }
        }

        return {
            speedDistribution,
            vehicleTypeData,
            progressData,
            laneChangeData,
            anomalyDistribution,
            speedHeatmap,
            typeSpeedComparison,
            driverStyleAnalysis,
            trajectoryData,
            speedProfile,
            simulationTime: this.currentTime,
        };
    }

    private calcLaneChangeDistribution(): { changes: number; count: number }[] {
        const counts: Map<number, number> = new Map();
        for (const v of this.finishedVehicles) {
            const c = v.laneChangeCount;
            counts.set(c, (counts.get(c) || 0) + 1);
        }
        return Array.from(counts.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([changes, count]) => ({ changes, count }));
    }

    // 当前主题
    private currentTheme: 'light' | 'dark' = 'dark';

    setTheme(theme: 'light' | 'dark') {
        this.currentTheme = theme;
    }

    // --- 上传数据到后端生成图表 ---
    private async uploadData() {
        const store = useSimStore.getState();
        const config = store.config;

        console.log("Uploading simulation data to backend...");
        store.addLog({
            timestamp: this.currentTime,
            level: 'INFO',
            category: 'SYSTEM',
            message: 'Uploading data for chart generation...',
        });

        // 1. 准备车辆信息映射 (用于补全轨迹数据)
        const vehicleInfoMap = new Map<number, { type: string; style: string }>();
        this.finishedVehicles.forEach(v => vehicleInfoMap.set(v.id, { type: v.type, style: v.driverStyle }));
        this.vehicles.forEach(v => vehicleInfoMap.set(v.id, { type: v.type, style: v.driverStyle }));

        // 2. 转换 finishedValues (camelCase -> snake_case)
        const snakeVehicles = this.finishedVehicles.map(v => {
            const logsObj: Record<string, any> = {};
            v.logs.forEach((val, key) => { logsObj[key.toString()] = val; });

            return {
                id: v.id,
                pos: v.pos,
                lane: v.lane,
                speed: v.speed,
                vehicle_type: v.type,       // camel -> snake
                driver_style: v.driverStyle,// camel -> snake
                anomaly_type: v.anomalyType,// camel -> snake
                anomaly_state: v.anomalyState,// camel -> snake
                is_affected: v.isAffected,  // camel -> snake (当前状态)
                was_affected: v.wasAffected, // 永久记录：是否曾经受影响
                lane_changes: v.laneChangeCount,
                lane_change_reasons: v.laneChangeReasons,
                logs: logsObj,
                entry_time: v.entryTime,
                v0: v.v0,
                desired_speed: v.desiredSpeed, // 用于计算延误
                // 这里假设 Vehicle 类里可能有这些字段但 VehicleData 接口没暴露，或者就留空
                etc_detection_time: (v as any).etcDetectionTime,
                anomaly_response_times: (v as any).anomalyResponseTimes,
            };
        });


        // 3. 采样并转换轨迹数据 (现在统一在 complete 中处理，这里直接使用)
        const sampledTrajectory = this.sampledTrajectoryData; // 使用已缓存的数据

        console.log(`Trajectory points: ${this.trajectoryData.length} -> ${sampledTrajectory.length}`);

        // 4. 转换其他数据
        const snakeAnomalyLogs = this.anomalyLogs.map(l => ({
            id: l.id,
            type: l.type,
            time: l.time,
            pos_km: l.posKm, // camel -> snake
            segment: l.segment
        }));

        const snakeSpeedHistory = this.segmentSpeedHistory.map(r => ({
            time: r.time,
            segment: r.segment,
            avg_speed: r.avgSpeed, // camel -> snake
            density: r.density,
            vehicle_count: r.vehicleCount, // camel -> snake
            flow: r.flow // 流量
        }));


        const snakeConfig = {
            road_length_km: config.roadLengthKm,
            num_lanes: config.numLanes,
            segment_length_km: this.segmentLengthKm,
            num_segments: this.numSegments,
            segment_boundaries: this.segmentBoundaries,  // 区间边界里程，含首尾
            total_vehicles: config.totalVehicles
        };

        // 弯道曲率档案（供后端绘图分析）
        const snakeCurveProfile = this.curveProfile.map(seg => ({
            start_m: seg.startM,
            end_m: seg.endM,
            radius_m: isFinite(seg.radiusM) ? seg.radiusM : null, // null 表示直道
        }));

        // 采样 lane_history (每10秒一条，加快载入速度)
        const laneHistoryStep = Math.max(1, Math.floor(10 / (store.config.simulationDt || 1)));
        const snakeLaneHistory = this.laneHistory
            .filter((_, i) => i % laneHistoryStep === 0)
            .map(r => ({ time: r.time, counts: r.counts }));

        // 后端绘图不需要 10万点，从 Store 的高精度数据中再抽样 (例如 1万点)
        // 解决 fetch timeout 问题
        const backendTrajectoryStep = 10;
        const backendTrajectory = this.sampledTrajectoryData.filter((_, i) => i % backendTrajectoryStep === 0);

        const payload = {
            config: snakeConfig,
            finished_vehicles: snakeVehicles,
            anomaly_logs: snakeAnomalyLogs,
            trajectory_data: backendTrajectory, // 使用更稀疏的数据传给后端
            segment_speed_history: snakeSpeedHistory,
            lane_history: snakeLaneHistory,
            curve_profile: snakeCurveProfile, // 弯道曲率档案
            theme: this.currentTheme, // Pass current theme
        };


        try {
            const response = await fetch('http://localhost:8000/api/charts/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const resData = await response.json();
                console.log("Chart generation started.", resData);

                // 显示保存位置提示 (Requested feature)
                if (resData.output_path) {
                    // 使用 confirm 让用户不得不看到，或者 alert
                    // alert 会阻塞 UI，但如果是仿真结束时，也许可以接受。
                    // 更好的方式是用 addLog 强调，以及 ChartsPanel 的通知。
                    // 但用户明确要求 "弹出提示"。
                    // 为了不阻塞太久，我们只 Log，然后尝试非阻塞通知如果可能。
                    // 由于这是后台逻辑，alert 是最直接的“弹出”。
                    // 但如果在自动跑大量仿真，alert 会很烦。
                    // 我们可以只在 SimulationEngine 中 log，并在 UI 侧处理。
                    // 但 UI侧不知道何时结束。
                    // 还是弹个 alert 吧，简单直接。如果是 Turbo 模式可能会有点烦，加个判断？
                    if (!store.turboMode) {
                        alert(`Charts generation started.\nSaved to: ${resData.output_path}`);
                    }
                }

                store.addLog({
                    timestamp: this.currentTime,
                    level: 'INFO',
                    category: 'SYSTEM',
                    message: `Chart generation started. Path: ${resData.output_path || 'unknown'}`,
                });
            } else {
                const errText = await response.text();
                console.error("Chart generation failed:", errText);
                store.addLog({
                    timestamp: this.currentTime,
                    level: 'ERROR',
                    category: 'SYSTEM',
                    message: `Chart generation failed: ${errText.slice(0, 50)}...`,
                });
            }
        } catch (error) {
            console.error("Upload error:", error);
            store.addLog({
                timestamp: this.currentTime,
                level: 'ERROR',
                category: 'SYSTEM',
                message: 'Failed to upload data to backend.',
            });
        }
    }

    // --- 完成仿真 ---
    private complete(reason: string) {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }

        const store = useSimStore.getState();

        const avgSpeed = this.speedHistory.length > 0
            ? this.speedHistory.reduce((a, b) => a + b, 0) / this.speedHistory.length
            : 0;

        // 预先生成采样轨迹数据
        this.prepareTrajectorySamples();

        store.setRunning(false);
        store.setComplete(true);
        store.setStatistics({
            totalVehicles: this.vehicleIdCounter,
            completedVehicles: this.finishedVehicles.length,
            avgSpeed,
            avgTravelTime: this.finishedVehicles.length > 0
                ? (store.config.roadLengthKm * 1000) / ((avgSpeed / 3.6) || 1)
                : 0,
            totalAnomalies: this.anomalyLogs.length,
            affectedByAnomaly: this.finishedVehicles.filter(v => v.isAffected).length,
            totalLaneChanges: this.totalLaneChanges,
            maxCongestionLength: 0,
            simulationTime: this.currentTime,
            // 暴露原始数据供前端详细分析图表使用
            segmentSpeedHistory: this.segmentSpeedHistory,
            segmentBoundaries: this.segmentBoundaries,
            sampledTrajectory: this.sampledTrajectoryData, // 新增：暴露微观采样数据
        });
        store.setChartData(this.generateChartData());

        store.addLog({
            timestamp: this.currentTime,
            level: 'INFO',
            category: 'COMPLETE',
            message: `${reason} | Completed: ${this.finishedVehicles.length} | Anomalies: ${this.anomalyLogs.length} | Lane Changes: ${this.totalLaneChanges}`,
        });

        // 触发后端图表生成
        this.uploadData();
    }

    // --- 准备轨迹采样数据 ---
    private prepareTrajectorySamples() {
        // 构建车辆信息映射表 (ID -> Info)
        const vehicleInfoMap = new Map<number, { type: string, style: string }>();
        // 包括所有车辆（完成的 + 活跃的）
        [...this.finishedVehicles, ...this.vehicles].forEach(v => {
            vehicleInfoMap.set(v.id, { type: v.type, style: v.style });
        });

        const totalPoints = this.trajectoryData.length;
        const targetPoints = 100000;
        const step = Math.max(1, Math.ceil(totalPoints / targetPoints));

        // 生成采样数据并缓存
        this.sampledTrajectoryData = (step > 1
            ? this.trajectoryData.filter((_, i) => i % step === 0)
            : this.trajectoryData).map(p => ({
                id: p.id,
                time: p.time,
                pos: p.pos,
                lane: p.lane,
                speed: p.speed,
                anomaly_type: p.anomalyType,   // camel -> snake (前端也用 snake 兼容)
                anomaly_state: p.anomalyState,
                is_affected: p.isAffected,
                // 补全车辆类型和风格
                vehicle_type: vehicleInfoMap.get(p.id)?.type || 'CAR',
                driver_style: vehicleInfoMap.get(p.id)?.style || 'normal',
            }));
    }

    pause() {
        const store = useSimStore.getState();
        store.setPaused(true);
        store.addLog({
            timestamp: this.currentTime,
            level: 'INFO',
            category: 'SYSTEM',
            message: 'Simulation paused',
        });
    }

    resume() {
        const store = useSimStore.getState();
        store.setPaused(false);
        store.addLog({
            timestamp: this.currentTime,
            level: 'INFO',
            category: 'SYSTEM',
            message: 'Simulation resumed',
        });
        this.runLoop();
    }

    stop() {
        this.complete('Simulation stopped by user');
    }

    reset() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        useSimStore.getState().resetAll();
    }
}

// 导出单例
export const engine = new SimulationEngine();
