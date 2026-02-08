/**
 * 车辆类
 * 完整实现 IDM 跟驰模型 + MOBIL 换道模型 + 异常状态机
 * 移植自 模拟车流.py
 */

import {
    VEHICLE_TYPE_CONFIG,
    DRIVER_STYLE_CONFIG,
    LANE_WIDTH,
    LANE_CHANGE_STEPS,
    NUM_LANES,
    IMPACT_SPEED_RATIO,
    SLOWDOWN_RATIO,
    FORCED_CHANGE_DIST,
    COLORS,
    type VehicleType,
    type DriverStyle,
    type AnomalyType,
    type AnomalyState,
} from './config';
import { useSimStore } from '../stores/simStore';

// 工具函数
const kmhToMs = (kmh: number): number => kmh / 3.6;
const msToKmh = (ms: number): number => ms * 3.6;
const randomInRange = (min: number, max: number): number => min + Math.random() * (max - min);

export interface VehicleData {
    id: number;
    pos: number; // 米
    lane: number;
    speed: number; // m/s
    type: VehicleType;
    driverStyle: DriverStyle;
    anomalyType: AnomalyType;
    anomalyState: AnomalyState;
    isAffected: boolean;
    color: string;
    laneChanging: boolean;
    lateral: number;
    laneChangeCount: number;
    laneChangeReason: 'free' | 'forced' | null;
}

export class Vehicle {
    // 基本属性
    id: number;
    pos: number = 0;
    lane: number;
    speed: number; // m/s
    type: VehicleType;
    driverStyle: DriverStyle;
    entryTime: number;

    // IDM 参数
    v0: number;
    aMax: number;
    bDesired: number;
    s0: number;
    T: number;
    delta: number;
    length: number;
    desiredSpeed: number;

    // 驾驶风格参数
    politeness: number;
    aggressiveness: number;

    // 换道状态
    laneChanging: boolean = false;
    laneChangeStep: number = 0;
    laneChangeStartLane: number = 0;
    laneChangeEndLane: number = 0;
    laneChangeStartPos: number = 0;
    laneChangeCooldown: number = 0;
    lateral: number = 0;

    // 统计
    laneChangeCount: number = 0;
    laneChangeReasons: { free: number; forced: number } = { free: 0, forced: 0 };

    // 异常状态
    isPotentialAnomaly: boolean;
    anomalyType: AnomalyType = 0;
    anomalyState: AnomalyState = 'normal';
    anomalyTimer: number = 0;
    anomalyTriggerTime: number | null = null;
    targetSpeedOverride: number | null = null;
    cooldownTimer: number = 0;

    // 影响状态
    isAffected: boolean = false;
    wasAffected: boolean = false; // 永久记录: 是否曾经受影响
    color: string;


    // 记录
    finished: boolean = false;
    currentSegment: number = 0;
    logs: Map<number, { in: number; out: number }> = new Map();

    constructor(
        id: number,
        lane: number,
        entryTime: number,
        isPotentialAnomaly: boolean,
        type: VehicleType,
        driverStyle: DriverStyle
    ) {
        this.id = id;
        this.lane = lane;
        this.entryTime = entryTime;
        this.isPotentialAnomaly = isPotentialAnomaly;
        this.type = type;
        this.driverStyle = driverStyle;

        // 设置 IDM 参数
        const typeConfig = VEHICLE_TYPE_CONFIG[this.type];
        const styleConfig = DRIVER_STYLE_CONFIG[this.driverStyle];

        this.v0 = kmhToMs(typeConfig.v0_kmh);
        this.aMax = typeConfig.a_max;
        this.bDesired = typeConfig.b_desired;
        this.s0 = typeConfig.s0;
        this.T = typeConfig.T;
        this.delta = typeConfig.delta;
        this.length = typeConfig.length;

        this.politeness = randomInRange(...styleConfig.politeness);
        this.aggressiveness = randomInRange(...styleConfig.aggressiveness);

        this.desiredSpeed = this.v0 * this.aggressiveness;
        this.speed = this.desiredSpeed * (0.8 + Math.random() * 0.2);
        this.color = typeConfig.color; // 使用类型颜色作为默认

        // Initialize segment 0 log
        this.logs.set(0, { in: entryTime, out: 0 });
    }

    // --- IDM 跟驰模型 ---
    idmCalcAcceleration(leader: Vehicle | null, currentSpeed: number): number {
        const v = currentSpeed;
        const v0 = this.v0 * this.aggressiveness;
        const aMax = this.aMax * this.aggressiveness;
        const b = this.bDesired;

        if (leader === null) {
            return aMax * (1 - Math.pow(v / v0, this.delta));
        }

        // 前车异常静止时紧急制动
        if (leader.anomalyType === 1 && leader.anomalyState === 'active') {
            return -aMax * 2;
        }

        const deltaV = v - leader.speed;
        const dist = leader.pos - this.pos;
        const s = Math.max(dist - this.length / 2 - leader.length / 2, 0.5);

        const sStar = this.s0 + v * this.T + (v * deltaV) / (2 * Math.sqrt(aMax * b));

        const ratioV = Math.pow(v / v0, this.delta);
        const ratioS = Math.pow(sStar / s, 2);

        const accel = aMax * (1 - ratioV - ratioS);

        return Math.max(-5.0, Math.min(aMax * 1.5, accel));
    }

    // --- MOBIL 换道决策 ---
    mobilDecision(vehiclesNearby: Vehicle[], blockedLanes: Set<number>): { targetLane: number | null; reason: 'free' | 'forced' | null } {
        if (this.laneChanging || this.laneChangeCooldown > 0) {
            return { targetLane: null, reason: null };
        }

        const leader = this.findLeader(vehiclesNearby);

        // 检查是否需要强制换道（前方有静止异常车辆）
        if (leader) {
            if (leader.anomalyType === 1 && leader.pos - this.pos < FORCED_CHANGE_DIST) {
                const forced = this.tryForcedLaneChange(vehiclesNearby, blockedLanes);
                if (forced !== null) {
                    return { targetLane: forced, reason: 'forced' };
                }
            }
        }

        // 计算当前车道收益
        const currentGain = this.calcLaneGain(this.lane, vehiclesNearby, leader);

        let bestGain = currentGain;
        let targetLane: number | null = null;

        // 检查相邻车道
        for (const candidate of [this.lane - 1, this.lane + 1]) {
            if (candidate >= 0 && candidate < NUM_LANES) {
                if (this.canChangeTo(candidate, vehiclesNearby, blockedLanes)) {
                    const gain = this.calcLaneGain(candidate, vehiclesNearby, leader);
                    if (gain > bestGain + 0.1) {
                        bestGain = gain;
                        targetLane = candidate;
                    }
                }
            }
        }

        if (targetLane !== null) {
            return { targetLane, reason: 'free' };
        }
        return { targetLane: null, reason: null };
    }

    private tryForcedLaneChange(vehiclesNearby: Vehicle[], blockedLanes: Set<number>): number | null {
        for (const candidate of [this.lane - 1, this.lane + 1]) {
            if (candidate >= 0 && candidate < NUM_LANES) {
                if (this.canChangeTo(candidate, vehiclesNearby, blockedLanes)) {
                    return candidate;
                }
            }
        }
        return null;
    }

    private calcLaneGain(targetLane: number, vehiclesNearby: Vehicle[], currentLeader: Vehicle | null): number {
        const leader = this.findLeaderInLane(targetLane, vehiclesNearby);

        if (leader === null) {
            return 1.0; // 无前车，最大收益
        }

        const aCurrent = currentLeader ? this.idmCalcAcceleration(currentLeader, this.speed) : this.aMax;
        const aNew = this.idmCalcAcceleration(leader, this.speed);

        return aNew - aCurrent;
    }

    private canChangeTo(targetLane: number, vehiclesNearby: Vehicle[], blockedLanes: Set<number>): boolean {
        if (blockedLanes.has(targetLane)) return false;

        const safeGapForward = this.speed * 1.5 + this.s0;
        const safeGapBackward = 20;

        for (const v of vehiclesNearby) {
            if (v.lane === targetLane) {
                const dist = v.pos - this.pos;
                if (dist > 0 && dist < safeGapForward) return false;
                if (dist < 0 && Math.abs(dist) < safeGapBackward) return false;
            }
        }
        return true;
    }

    findLeader(vehiclesNearby: Vehicle[]): Vehicle | null {
        let minDist = Infinity;
        let leader: Vehicle | null = null;
        for (const v of vehiclesNearby) {
            if (v.lane === this.lane && v.pos > this.pos) {
                const dist = v.pos - this.pos;
                if (dist < minDist) {
                    minDist = dist;
                    leader = v;
                }
            }
        }
        return leader;
    }

    private findLeaderInLane(lane: number, vehiclesNearby: Vehicle[]): Vehicle | null {
        let minDist = Infinity;
        let leader: Vehicle | null = null;
        for (const v of vehiclesNearby) {
            if (v.lane === lane && v.pos > this.pos) {
                const dist = v.pos - this.pos;
                if (dist < minDist) {
                    minDist = dist;
                    leader = v;
                }
            }
        }
        return leader;
    }

    // --- 换道执行 ---
    startLaneChange(targetLane: number, reason: 'free' | 'forced') {
        this.laneChanging = true;
        this.laneChangeStep = 0;
        this.laneChangeStartLane = this.lane;
        this.laneChangeEndLane = targetLane;
        this.laneChangeStartPos = this.pos;
        this.laneChangeCount++;
        this.laneChangeReasons[reason]++;
    }

    updateLaneChange(dt: number) {
        if (!this.laneChanging) return;

        this.laneChangeStep++;
        const t = this.laneChangeStep / LANE_CHANGE_STEPS;

        const laneDiff = this.laneChangeEndLane - this.laneChangeStartLane;
        this.lateral = (laneDiff * LANE_WIDTH / 2) * (1 - Math.cos(Math.PI * t));
        this.pos = this.laneChangeStartPos + this.speed * dt * t;

        if (this.laneChangeStep >= LANE_CHANGE_STEPS) {
            this.lane = this.laneChangeEndLane;
            this.laneChanging = false;
            this.laneChangeCooldown = 5.0;
            this.lateral = laneDiff * LANE_WIDTH / 2;
        }
    }

    // --- 异常触发 ---
    triggerAnomaly(currentTime: number): { type: AnomalyType; time: number; posKm: number } | null {
        if (!this.isPotentialAnomaly) return null;
        if (this.anomalyState === 'active') return null;

        if (this.anomalyState === 'cooling') {
            this.cooldownTimer--;
            if (this.cooldownTimer <= 0) {
                this.anomalyState = 'normal';
            } else {
                return null;
            }
        }

        const config = useSimStore.getState().config;
        if (currentTime < config.globalAnomalyStart) return null;
        if (currentTime - this.entryTime < config.vehicleSafeRunTime) return null;

        let trigger = false;

        if (this.anomalyType === 0) {
            if (Math.random() < 0.005) { // 每次检查0.5%概率触发
                trigger = true;
                const r = Math.random();

                // Normalizing probabilities
                const p1 = config.anomalyProbType1;
                const p2 = config.anomalyProbType2;
                const p3 = config.anomalyProbType3;
                const total = p1 + p2 + p3;

                const threshold1 = p1 / total;
                const threshold2 = (p1 + p2) / total;

                if (r < threshold1) this.anomalyType = 1;
                else if (r < threshold2) this.anomalyType = 2;
                else this.anomalyType = 3;
            }
        } else if (this.anomalyType === 2 || this.anomalyType === 3) {
            if (Math.random() < 0.3) {
                trigger = true;
            }
        }

        if (trigger) {
            this.anomalyState = 'active';
            this.anomalyTriggerTime = currentTime;

            if (this.anomalyType === 1) {
                this.targetSpeedOverride = 0;
                this.color = COLORS.TYPE1;
                // 修复：使用配置的持续时间，不再是 999999
                this.anomalyTimer = config.anomalyDurationType1;
            } else if (this.anomalyType === 2) {
                this.targetSpeedOverride = kmhToMs(Math.random() * 40);
                this.anomalyTimer = 10;
                this.color = COLORS.TYPE2;
            } else if (this.anomalyType === 3) {
                this.targetSpeedOverride = kmhToMs(Math.random() * 40);
                this.anomalyTimer = 20;
                this.color = COLORS.TYPE3;
            }

            return {
                type: this.anomalyType,
                time: currentTime,
                posKm: this.pos / 1000,
            };
        }
        return null;
    }

    // --- 异常影响计算 ---
    calcImpactMultiplier(vehiclesNearby: Vehicle[]): number {
        let nDownstream = 0;
        let nUpstream = 0;

        for (const v of vehiclesNearby) {
            if (v !== this && v.anomalyState === 'active') {
                const dist = v.pos - this.pos;
                const config = useSimStore.getState().config;
                if (Math.abs(dist) < config.impactDiscoverDist) {
                    if (dist > 0) nDownstream++;
                    else nUpstream++;
                }
            }
        }

        return Math.pow(SLOWDOWN_RATIO, nDownstream) * Math.pow(0.92, nUpstream);
    }

    // --- 物理更新 ---
    update(dt: number, vehiclesNearby: Vehicle[], blockedLanes: Set<number>, currentTime: number) {
        if (this.finished) return;

        this.laneChangeCooldown -= dt;

        // 换道更新
        if (this.laneChanging) {
            this.updateLaneChange(dt);
            return;
        }

        // 异常状态更新
        if (this.anomalyState === 'active') {
            this.anomalyTimer -= dt;
            if (this.anomalyTimer <= 0 && this.anomalyType !== 1) {
                this.anomalyState = 'cooling';
                this.cooldownTimer = 30;
                this.targetSpeedOverride = null;
                this.color = COLORS.NORMAL;
            }
        }

        // 找前车
        const leader = this.findLeader(vehiclesNearby);
        const dist = leader ? leader.pos - this.pos : Infinity;

        // 计算影响系数
        const impactMultiplier = this.calcImpactMultiplier(vehiclesNearby);

        // MOBIL 换道决策
        const { targetLane, reason } = this.mobilDecision(vehiclesNearby, blockedLanes);
        if (targetLane !== null && reason !== null) {
            this.startLaneChange(targetLane, reason);
        }

        // 计算加速度
        let accel: number;
        if (this.anomalyState === 'active' && this.targetSpeedOverride !== null) {
            accel = (this.targetSpeedOverride - this.speed) / dt;
            accel = Math.max(-4.0, Math.min(3.0, accel));
        } else {
            accel = this.idmCalcAcceleration(leader, this.speed);
            accel *= impactMultiplier;
        }

        // 更新速度和位置
        this.speed += accel * dt;
        this.speed = Math.max(0, Math.min(this.v0 * 1.1, this.speed));

        if (!this.laneChanging) {
            this.pos += this.speed * dt;
        }

        // --- 区间日志记录 ---
        const SEGMENT_LENGTH_M = 1000; // 1 km segment
        const newSegment = Math.floor(this.pos / SEGMENT_LENGTH_M);
        if (newSegment !== this.currentSegment) {
            // Exit old segment
            if (this.logs.has(this.currentSegment)) {
                const log = this.logs.get(this.currentSegment)!;
                if (log.out === 0) {
                    log.out = currentTime;
                }
            }
            // Enter new segment
            this.logs.set(newSegment, { in: currentTime, out: 0 });
            this.currentSegment = newSegment;
        }

        // 更新影响状态
        if (this.anomalyState !== 'active') {
            const config = useSimStore.getState().config;
            const speedRatio = this.desiredSpeed > 0 ? this.speed / this.desiredSpeed : 1.0;
            const isImpacted =
                impactMultiplier < config.impactThreshold ||
                speedRatio < IMPACT_SPEED_RATIO ||
                (leader && dist < 40 && this.speed < kmhToMs(20));

            if (isImpacted) {
                this.color = COLORS.IMPACTED;
                this.isAffected = true;
                this.wasAffected = true; // 一旦受影响，永不重置
            } else {
                this.color = COLORS.NORMAL;
                this.isAffected = false;
            }
        }
    }


    // --- 导出数据 ---
    toData(): VehicleData {
        return {
            id: this.id,
            pos: this.pos,
            lane: this.lane,
            speed: this.speed,
            type: this.type,
            driverStyle: this.driverStyle,
            anomalyType: this.anomalyType,
            anomalyState: this.anomalyState,
            isAffected: this.isAffected,
            color: this.color,
            laneChanging: this.laneChanging,
            lateral: this.lateral,
            laneChangeCount: this.laneChangeCount,
            laneChangeReason: this.laneChangeReasons.forced > 0 ? 'forced' : this.laneChangeReasons.free > 0 ? 'free' : null,
        };
    }
}
