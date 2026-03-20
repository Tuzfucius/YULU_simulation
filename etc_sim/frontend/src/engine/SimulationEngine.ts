/**
 * 浠跨湡寮曟搸
 * 瀹屾暣绉绘鑷?妯℃嫙杞︽祦.py
 */

import { Vehicle } from './Vehicle';
import {
    SEGMENT_LENGTH_KM,
    NUM_SEGMENTS,
    SIMULATION_DT,
    TRAJECTORY_SAMPLE_INTERVAL,
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

// 寮傚父鏃ュ織
interface AnomalyLog {
    id: number;
    type: AnomalyType;
    time: number;
    posKm: number;
    segment: number;
}

// 杞ㄨ抗鐐?
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


// 鍖洪棿閫熷害璁板綍
interface SegmentSpeedRecord {
    time: number;
    segment: number;
    avgSpeed: number;
    density: number;
    vehicleCount: number;
    flow: number; // 娴侀噺 = 瀵嗗害 * 閫熷害
}

// 杞﹂亾鍘嗗彶璁板綍
interface LaneHistoryRecord {
    time: number;
    counts: Record<string, number>; // lane index -> count
}

// 鍥捐〃鏁版嵁
export interface ChartData {
    // 閫熷害鍒嗗竷
    speedDistribution: { range: string; count: number }[];
    // 杞﹁締绫诲瀷
    vehicleTypeData: { name: string; value: number; color: string }[];
    // 杩涘害鏇茬嚎
    progressData: { time: number; completed: number; active: number }[];
    // 鎹㈤亾鍒嗘瀽
    laneChangeData: {
        byReason: { reason: string; count: number }[];
        byStyle: { style: string; count: number; color: string }[];
    };
    // 寮傚父鍒嗗竷
    anomalyDistribution: { segment: string; type1: number; type2: number; type3: number }[];
    // 鍖洪棿閫熷害鐑姏鍥炬暟鎹?
    speedHeatmap: { time: number; segment: number; speed: number }[];
    // 杞﹁締绫诲瀷閫熷害瀵规瘮
    typeSpeedComparison: { type: string; avgSpeed: number; color: string }[];
    // 椹鹃┒椋庢牸鍒嗘瀽
    driverStyleAnalysis: {
        counts: { style: string; count: number; color: string }[];
        avgSpeeds: { style: string; speed: number; color: string }[];
    };
    // 杞ㄨ抗鏁版嵁 (閲囨牱)
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

    // 鍔ㄦ€佽矾娈靛弬鏁帮紙姣忔 start() 鏃舵牴鎹?simStore 閲嶆柊璁＄畻锛?
    private segmentLengthKm: number = SEGMENT_LENGTH_KM;
    private numSegments: number = NUM_SEGMENTS;
    /** 鍖洪棿杈圭晫閲岀▼锛坘m锛夋暟缁勶紝闀垮害涓?numSegments+1锛屼緥濡?[0, g1, g2, ..., roadLength] */
    private segmentBoundaries: number[] = [];
    /** 寮亾鏇茬巼妗ｆ锛坙oad 鑷畾涔夎矾缃戞椂鏋勫缓锛?*/
    private curveProfile: CurveSegment[] = [];

    // 璁板綍鏁版嵁
    private anomalyLogs: AnomalyLog[] = [];
    private trajectoryData: TrajectoryPoint[] = [];
    private segmentSpeedHistory: SegmentSpeedRecord[] = [];
    private laneHistory: LaneHistoryRecord[] = [];
    private progressHistory: { time: number; completed: number; active: number }[] = [];


    // 缁熻
    private typeCount: Record<VehicleType, number> = { CAR: 0, TRUCK: 0, BUS: 0 };
    private styleCount: Record<DriverStyle, number> = { aggressive: 0, normal: 0, conservative: 0 };
    private totalLaneChanges: number = 0;
    private laneChangeByReason: { free: number; forced: number } = { free: 0, forced: 0 };
    private laneChangeByStyle: Record<DriverStyle, number> = { aggressive: 0, normal: 0, conservative: 0 };
    private speedHistory: number[] = [];
    private sampledTrajectoryData: TrajectoryPoint[] = [];

    // 鍖濋亾閰嶇疆涓庣疮鍔犲櫒
    private ramps: any[] = [];
    private onRampAccumulator: Map<string, number> = new Map();

    constructor() {
    }

    // --- 鐢熸垚鎶曟斁璁″垝 ---
    private planSpawns(totalVehicles: number) {
        this.spawnSchedule = [];
        let tCycle = 0;

        // 绮剧‘鐢熸垚鐩爣鏁伴噺鐨勬姇鏀炬椂闂存埑
        while (this.spawnSchedule.length < totalVehicles) {
            const remaining = totalVehicles - this.spawnSchedule.length;
            const n = Math.min(2 + Math.floor(Math.random() * 5), remaining);
            const timestamps = Array.from({ length: n }, () => tCycle + Math.random() * 10);
            this.spawnSchedule.push(...timestamps);
            tCycle += 10;
        }

        // 纭繚绮剧‘涓虹洰鏍囨暟閲?
        this.spawnSchedule = this.spawnSchedule.slice(0, totalVehicles).sort((a, b) => a - b);
    }


    // 寰幆鎺у埗
    private timeoutId: any = null;

    // --- 鍚姩浠跨湡 ---
    async start() {
        const store = useSimStore.getState();
        const config = store.config;

        // 鍔ㄦ€佽绠楄矾娈靛弬鏁?
        const roadLengthKm = config.roadLengthKm;
        const gantryPositions = config.customGantryPositionsKm;
        if (gantryPositions && gantryPositions.length >= 1) {
            // 鑷畾涔夎矾缃戯細鎸夐棬鏋朵綅缃垝鍒嗗尯闂达紝鍖洪棿鏁?= 闂ㄦ灦鏁?+ 1
            // 杈圭晫锛歔0, g1, g2, ..., gN, roadLength]锛堝惈棣栧熬锛?
            this.segmentBoundaries = [0, ...gantryPositions, roadLengthKm];
            this.numSegments = gantryPositions.length + 1;
            // segmentLengthKm 姝ゆ椂鏃犳剰涔夛紙鍚勫尯闂翠笉绛夐暱锛夛紝缃负骞冲潎鍊间緵鍏煎
            this.segmentLengthKm = roadLengthKm / this.numSegments;
        } else {
            // 鏃犺嚜瀹氫箟璺綉锛氭寜 ETC 闂ㄦ灦闂磋窛鍧囧寑鍒掑垎鍖洪棿
            const intervalKm = (config.etcGateIntervalKm > 0) ? config.etcGateIntervalKm : 1;
            this.numSegments = Math.max(1, Math.ceil(roadLengthKm / intervalKm));
            this.segmentLengthKm = roadLengthKm / this.numSegments;
            // 鍧囧寑鍒嗗竷鐨勮竟鐣?
            this.segmentBoundaries = Array.from(
                { length: this.numSegments + 1 },
                (_, i) => i * this.segmentLengthKm
            );
        }

        // 閲嶇疆
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

        // 鍒濆鍖栧対閬?
        this.ramps = [...(config.customRamps || [])];
        this.onRampAccumulator.clear();

        // 鏋勫缓寮亾鏇茬巼妗ｆ锛堜粎鑷畾涔夎矾缃戞椂鏈夋晥锛?
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
            message: `Simulation started: ${roadLengthKm.toFixed(1)}km 脳 ${config.numLanes} lanes (${this.numSegments} segments 脳 ${this.segmentLengthKm.toFixed(2)}km), target ${config.totalVehicles} vehicles`,
        });

        // 鍚姩寰幆
        this.runLoop();
    }

    private runLoop() {
        const store = useSimStore.getState();
        if (!store.isRunning || store.isPaused || store.isComplete) {
            return;
        }

        const isTurbo = store.turboMode;

        if (isTurbo) {
            // 鏋侀€熸ā寮忥細鎵归噺鎵ц
            // 姣忔鎵ц 20 娆?step (鍗?100涓椂闂存)锛岀劧鍚庤鍑轰富绾跨▼
            const batchSize = 20;
            for (let i = 0; i < batchSize; i++) {
                // 濡傛灉涓€斿仠姝㈡垨瀹屾垚锛岀珛鍗抽€€鍑?
                const currentStore = useSimStore.getState();
                if (!currentStore.isRunning || currentStore.isPaused || currentStore.isComplete) return;

                this.step(true); // suppress UI updates
            }
            // 鎵归噺鎵ц瀹屽悗鏇存柊涓€娆?UI
            this.updateUI();

            // 绔嬪嵆璋冨害涓嬩竴娆?
            this.timeoutId = setTimeout(() => this.runLoop(), 0);
        } else {
            // 鏅€氭ā寮忥細鎵ц涓€娆★紝绛夊緟 100ms
            this.step(false);
            this.timeoutId = setTimeout(() => this.runLoop(), 100);
        }
    }

    // --- 鍗曟浠跨湡 ---
    private step(suppressUI: boolean = false) {
        const store = useSimStore.getState();
        const config = store.config;

        // 姣忔 step 妯℃嫙 5 涓椂闂存 (5 * simulationDt)
        for (let i = 0; i < 5; i++) {
            this.currentTime += SIMULATION_DT;

            // 鐢熸垚杞﹁締
            this.spawnVehicles(config);

            // 澶勭悊鍖濋亾娴侀噺
            this.processRamps(config, SIMULATION_DT);

            // 鏇存柊杞﹁締
            this.updateVehicles();

            // 璁板綍杞ㄨ抗锛堝彲閰嶇疆閲囨牱闂撮殧锛屼粠杩愯鏃堕厤缃鍙栵級
            const sampleInterval = config.trajectorySampleInterval ?? TRAJECTORY_SAMPLE_INTERVAL;
            if (Math.floor(this.currentTime) % sampleInterval === 0) {
                this.recordTrajectory();
                // 瑙﹀彂涓€娆¤建杩瑰悜涓嬮噰鏍凤紝浠ヤ緵鍓嶇鐑洿鏂?
                this.prepareTrajectorySamples();
            }

            // 璁板綍鍖洪棿閫熷害锛堟瘡30绉掞級
            if (Math.floor(this.currentTime) % 30 === 0) {
                this.recordSegmentSpeed();
            }
        }

        // 鏇存柊 UI (浠呭湪涓嶆姂鍒舵椂鏇存柊)
        if (!suppressUI) {
            this.updateUI();
        }

        // 妫€鏌ュ畬鎴愭潯浠?
        // 淇锛氬鏋滆繕鏈夋椿璺冭溅杈嗭紝鍏佽寤堕暱浠跨湡鏃堕棿锛岀洿鍒版墍鏈夎溅杈嗗畬鎴愭垨杈惧埌 2鍊嶆渶澶ф椂闂?
        // 杩欒В鍐充簡 "Completed Vehicles" 杩滃皬浜?"Target" 鐨勯棶棰?
        const activeVehiclesCount = this.vehicles.length;
        const allSpawned = this.spawnIndex >= this.spawnSchedule.length;
        const hardTimeLimit = config.maxSimulationTime * 2; // 2x buffer

        if (allSpawned && activeVehiclesCount === 0) {
            this.complete('Simulation completed normally (All finished)');
        } else if (this.currentTime >= hardTimeLimit) {
            this.complete('Simulation stopped (Hard time limit reached)');
        } else if (this.currentTime >= config.maxSimulationTime) {
            // 瓒呰繃棰勬湡鏃堕棿锛屼絾杩樻湁杞﹁締
            if (activeVehiclesCount > 0) {
                // 缁х画杩愯锛屼絾鍦?log 涓彁绀?(鍙€?
                if (Math.floor(this.currentTime) % 100 === 0) {
                    // store.addLog(...) // Optional: log extension
                }
            } else {
                if (allSpawned) this.complete('Simulation completed (Time limit reached)');
            }
        }
    }

    // --- 鐢熸垚杞﹁締 ---
    private spawnVehicles(config: any) {
        // 妫€鏌ユ槸鍚﹁繕鏈夐渶瑕佹姇鏀剧殑杞﹁締涓斿綋鍓嶆椂闂村凡鍒?
        while (this.spawnIndex < this.spawnSchedule.length && this.spawnSchedule[this.spawnIndex] <= this.currentTime) {
            // 妫€鏌ユ槸鍚﹀凡杈惧埌鐩爣鏁伴噺
            if (this.vehicleIdCounter >= config.totalVehicles) {
                this.spawnIndex = this.spawnSchedule.length; // 璺宠繃鍓╀綑
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

                    // 纭畾杞﹁締绫诲瀷
                    const typeRand = Math.random();
                    let type: VehicleType = 'CAR';
                    if (typeRand < config.carRatio) type = 'CAR';
                    else if (typeRand < config.carRatio + config.truckRatio) type = 'TRUCK';
                    else type = 'BUS';

                    // 纭畾椹鹃┒椋庢牸
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

                    // 缁熻
                    this.typeCount[vehicle.type]++;
                    this.styleCount[vehicle.driverStyle]++;
                    this.speedHistory.push(vehicle.speed * 3.6);

                    break;
                }
            }

            // 鏃犺鏄惁鏀剧疆鎴愬姛锛岄兘绉诲姩鍒颁笅涓€涓姇鏀炬椂闂达紙閬垮厤鏃犻檺寰幆锛?
            this.spawnIndex++;
        }
    }

    // --- 鍖濋亾澶勭悊 ---
    private processRamps(config: any, dt: number) {
        if (!this.ramps || this.ramps.length === 0) return;

        // 1. 鍏ュ彛鍖濋亾 (On-Ramps)
        const onRamps = this.ramps.filter(r => r.type === 'on_ramp');
        for (const ramp of onRamps) {
            // flowRate 涓?veh/h锛岃浆鎹负 veh/s
            const ratePerSec = ramp.flowRate / 3600;
            const prob = ratePerSec * dt;

            let accum = this.onRampAccumulator.get(ramp.id) || 0;
            accum += prob;

            while (accum >= 1) {
                // 妫€鏌ユ€绘暟闄愬埗
                if (ramp.totalVehicles !== undefined && ramp.totalVehicles !== null) {
                    const spawnedCount = ramp._spawnedCount || 0;
                    if (spawnedCount >= ramp.totalVehicles) {
                        accum = 0;
                        break;
                    }
                    ramp._spawnedCount = spawnedCount + 1;
                }

                // 灏濊瘯鍦ㄦ渶澶栦晶杞﹂亾鐢熸垚杞﹁締
                const targetLane = config.numLanes - 1;
                const spawnPos = ramp.position_km * 1000;

                // 妫€鏌ョ┖闂达紙鍓嶅悗 15 绫虫棤杞︼級
                const isSpaceFree = !this.vehicles.some(v =>
                    v.lane === targetLane &&
                    Math.abs(v.pos - spawnPos) < 15
                );

                if (isSpaceFree) {
                    const isPotentialAnomaly = Math.random() < config.anomalyRatio;

                    // 杞﹁締绫诲瀷
                    const typeRand = Math.random();
                    let type: VehicleType = 'CAR';
                    if (typeRand < config.carRatio) type = 'CAR';
                    else if (typeRand < config.carRatio + config.truckRatio) type = 'TRUCK';
                    else type = 'BUS';

                    // 椹鹃┒椋庢牸
                    const styleRand = Math.random();
                    let style: DriverStyle = 'normal';
                    if (styleRand < config.aggressiveRatio) style = 'aggressive';
                    else if (styleRand < config.aggressiveRatio + config.conservativeRatio) style = 'conservative';
                    else style = 'normal';

                    const v = new Vehicle(
                        this.vehicleIdCounter++,
                        targetLane,
                        this.currentTime,
                        isPotentialAnomaly,
                        type,
                        style
                    );
                    v.pos = spawnPos;
                    // 鍏ュ彛鍖濋亾姹囧叆杞﹁締閫熷害鐣ヤ綆锛屽亣璁?30km/h (绾?8.3m/s)
                    v.speed = 8.3;
                    v.color = '#10b981'; // 鐗规畩娑傝锛氱豢鑹茶〃绀烘槸浠庡叆鍙ｈ繘鏉ョ殑

                    this.vehicles.push(v);

                    this.typeCount[v.type]++;
                    this.styleCount[v.driverStyle]++;
                    this.speedHistory.push(v.speed * 3.6);

                    accum -= 1;
                } else {
                    // 绌洪棿涓嶈冻锛岀瓑寰呬笅涓€甯?
                    break;
                }
            }
            this.onRampAccumulator.set(ramp.id, accum);
        }

        // 2. 鍑哄彛鍖濋亾 (Off-Ramps)
        const offRamps = this.ramps.filter(r => r.type === 'off_ramp');
        for (const ramp of offRamps) {
            const rampPosM = ramp.position_km * 1000;
            const ratePerSec = ramp.flowRate / 3600;
            const targetExitProb = ratePerSec * dt;

            let accum = this.onRampAccumulator.get(ramp.id) || 0;
            accum += targetExitProb;

            // 鍊掑簭閬嶅巻杞﹁締锛屾柟渚垮垹闄?
            for (let i = this.vehicles.length - 1; i >= 0; i--) {
                const v = this.vehicles[i];
                // 濡傛灉杞﹁締鍦ㄦ渶澶栦晶杞﹂亾锛屼笖閫斿緞鍑哄彛鍖濋亾闄勮繎鍖洪棿锛?/- 15绫筹級
                if (accum >= 1 && v.lane === config.numLanes - 1 && Math.abs(v.pos - rampPosM) < 15) {

                    if (ramp.totalVehicles !== undefined && ramp.totalVehicles !== null) {
                        const despawnedCount = ramp._despawnedCount || 0;
                        if (despawnedCount >= ramp.totalVehicles) {
                            accum = 0;
                            break;
                        }
                        ramp._despawnedCount = despawnedCount + 1;
                    }

                    // 杞﹁締椹跺嚭璺綉
                    this.finishedVehicles.push(v);
                    this.vehicles.splice(i, 1);
                    accum -= 1;
                }
            }
            this.onRampAccumulator.set(ramp.id, accum);
        }
    }

    // --- 鏇存柊杞﹁締 ---
    private updateVehicles() {
        const store = useSimStore.getState();
        const roadLengthM = store.config.roadLengthKm * 1000;
        const blockedLanes = new Set<number>();
        const completedIds: number[] = [];

        // 鍑嗗璺杈圭晫锛堢背锛夛紝鐢ㄤ簬 Vehicle.update 淇鍖洪棿缁熻
        const boundariesM = this.segmentBoundaries.map(k => k * 1000);

        // 鏇存柊姣忚締杞?
        for (const v of this.vehicles) {
            // 姣忓抚娉ㄥ叆寮亾鍗婂緞锛堝姞閿欒繑鍥?Infinity锛?
            v.currentCurveRadius = getCurveRadius(v.pos / 1000, this.curveProfile);

            // 灏濊瘯瑙﹀彂寮傚父
            const anomalyResult = v.triggerAnomaly(this.currentTime);
            if (anomalyResult) {
                // 淇锛氱洿鎺ヤ娇鐢ㄨ溅杈嗗綋鍓嶇淮鎶ょ殑 segment锛屼繚璇佷笌缁熻閫昏緫涓€鑷?
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

            // 鏇存柊鐗╃悊鐘舵€?
            v.update(SIMULATION_DT, this.vehicles, blockedLanes, this.currentTime, boundariesM);

            // 妫€鏌ュ畬鎴?
            if (v.pos >= roadLengthM) {
                completedIds.push(v.id);
                this.finishedVehicles.push(v);
                this.speedHistory.push(v.speed * 3.6);

                // 缁熻鎹㈤亾
                this.totalLaneChanges += v.laneChangeCount;
                this.laneChangeByReason.free += v.laneChangeReasons.free;
                this.laneChangeByReason.forced += v.laneChangeReasons.forced;
                this.laneChangeByStyle[v.driverStyle] += v.laneChangeCount;
            }
        }

        // 绉婚櫎瀹屾垚杞﹁締
        this.vehicles = this.vehicles.filter(v => !completedIds.includes(v.id));
    }

    // --- 璁板綍杞ㄨ抗 ---
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

    // --- 璁板綍鍖洪棿閫熷害 ---
    private recordSegmentSpeed() {
        const store = useSimStore.getState();
        const config = store.config;

        // 璇诲彇绉戠爺鍣０閰嶇疆
        const enableNoise = config.enableNoise || false;
        const stdDev = config.speedVariance || 0; // 瑙嗕负鏍囧噯宸?km/h
        const dropRate = config.dropRate || 0;

        for (let seg = 0; seg < this.numSegments; seg++) {
            const segStartM = (this.segmentBoundaries[seg] ?? seg * this.segmentLengthKm) * 1000;
            const segEndM = (this.segmentBoundaries[seg + 1] ?? (seg + 1) * this.segmentLengthKm) * 1000;
            const segLenM = segEndM - segStartM;

            let vehiclesInSeg = this.vehicles.filter(v => v.pos >= segStartM && v.pos < segEndM);

            // 1. 妯℃嫙闂ㄦ灦涓㈠寘 (闅忔満涓㈠純璁板綍)
            if (enableNoise && dropRate > 0) {
                vehiclesInSeg = vehiclesInSeg.filter(() => Math.random() >= dropRate);
            }

            if (vehiclesInSeg.length > 0) {
                // 2. 妯℃嫙楂樻柉娴嬮€熸紓绉昏宸?
                let speedSum = 0;
                for (const v of vehiclesInSeg) {
                    let vSpeedKmH = v.speed * 3.6;
                    if (enableNoise && stdDev > 0) {
                        // Box-Muller 鐢熸垚鏍囧噯姝ｆ€佸垎甯冮殢鏈烘暟
                        const u1 = Math.max(Number.MIN_VALUE, Math.random());
                        const u2 = Math.random();
                        const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
                        vSpeedKmH += z0 * stdDev;
                        vSpeedKmH = Math.max(0, vSpeedKmH); // 闃叉閫熷害涓鸿礋
                    }
                    speedSum += vSpeedKmH / 3.6;
                }

                const avgSpeed = speedSum / vehiclesInSeg.length;
                const density = (vehiclesInSeg.length / Math.max(segLenM, 1)) * 1000 * config.numLanes;
                const flow = density * avgSpeed; // 娴侀噺鍏紡: q = k * v

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

        // 璁板綍杞﹂亾鍒嗗竷
        const laneCounts: Record<string, number> = {};
        for (let lane = 0; lane < config.numLanes; lane++) {
            laneCounts[String(lane)] = this.vehicles.filter(v => v.lane === lane).length;
        }
        this.laneHistory.push({ time: this.currentTime, counts: laneCounts });

        // 璁板綍杩涘害鍘嗗彶
        if (this.progressHistory.length < 200) {
            this.progressHistory.push({
                time: this.currentTime,
                completed: this.finishedVehicles.length,
                active: this.vehicles.length,
            });
        }
    }

    // --- 鏇存柊 UI ---
    private updateUI() {
        const store = useSimStore.getState();
        const config = store.config;

        // 淇杩涘害鏉¤绠楋細濡傛灉瓒呮椂杩愯锛屽姩鎬佸欢闀挎€绘椂闂达紝閬垮厤鎻愬墠婊℃牸
        // 淇濇寔鑷冲皯 10绉?鎴?5% 鐨勭紦鍐诧紝璁╃敤鎴风煡閬撲豢鐪熻繕鍦ㄨ繘琛?
        const isOvertime = this.currentTime >= config.maxSimulationTime;
        const activeVehicles = this.vehicles.length;

        // 鍔ㄦ€佹€绘椂闂达細濡傛灉瓒呮椂涓旀湁杞︼紝鎬绘椂闂?= 褰撳墠鏃堕棿 + 缂撳啿
        const displayTotalTime = (isOvertime && activeVehicles > 0)
            ? this.currentTime + 30
            : config.maxSimulationTime;

        const progress = Math.min((this.currentTime / displayTotalTime) * 100, 100);

        const avgSpeed = this.speedHistory.length > 0
            ? this.speedHistory.reduce((a, b) => a + b, 0) / this.speedHistory.length
            : 0;

        store.setProgress({
            currentTime: this.currentTime,
            totalTime: displayTotalTime, // 浼犵粰 UI 鏄剧ず鍔ㄦ€佹€绘椂闂?
            progress,
            activeVehicles: this.vehicles.length,
            completedVehicles: this.finishedVehicles.length,
            activeAnomalies: this.vehicles.filter(v => v.anomalyState === 'active').length,
        });

        // 瀹炴椂鏇存柊缁熻
        store.setStatistics({
            totalVehicles: this.vehicleIdCounter,
            completedVehicles: this.finishedVehicles.length,
            avgSpeed,
            avgTravelTime: this.finishedVehicles.length > 0
                ? (config.roadLengthKm * 1000) / ((avgSpeed / 3.6) || 1)
                : 0,
            totalAnomalies: this.anomalyLogs.length,
            // 淇锛氫粎缁熻褰撳墠娲昏穬鍙楀奖鍝嶈溅杈嗭紙瀹炴椂閲忥級
            affectedByAnomaly: this.vehicles.filter(v => v.isAffected).length,
            totalLaneChanges: this.totalLaneChanges,
            maxCongestionLength: 0, // TODO
            simulationTime: this.currentTime,
            // 灏嗘暟鎹疄鏃舵姏缁欏墠绔緵鍥捐〃娓叉煋
            segmentSpeedHistory: [...this.segmentSpeedHistory],
            segmentBoundaries: this.segmentBoundaries,
            sampledTrajectory: this.sampledTrajectoryData,
        });
    }

    // --- 鐢熸垚鍥捐〃鏁版嵁 ---
    private generateChartData(): ChartData {
        // 閫熷害鍒嗗竷
        const speedBins = [0, 20, 40, 60, 80, 100, 120, 140];
        const speedDistribution = speedBins.slice(0, -1).map((min, i) => {
            const max = speedBins[i + 1];
            const count = this.speedHistory.filter(s => s >= min && s < max).length;
            return { range: `${min}-${max}`, count };
        });

        // 杞﹁締绫诲瀷
        const vehicleTypeData = [
            { name: 'Car', value: this.typeCount.CAR, color: COLORS.CAR },
            { name: 'Truck', value: this.typeCount.TRUCK, color: COLORS.TRUCK },
            { name: 'Bus', value: this.typeCount.BUS, color: COLORS.BUS },
        ];

        // 杩涘害鏇茬嚎
        const progressData = this.progressHistory.map(p => ({
            time: Math.floor(p.time),
            completed: p.completed,
            active: p.active,
        }));

        // 鎹㈤亾鍒嗘瀽
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

        // 寮傚父鍒嗗竷
        const anomalyDistribution = Array.from({ length: this.numSegments }, (_, i) => ({
            segment: `${(i * this.segmentLengthKm).toFixed(1)}-${((i + 1) * this.segmentLengthKm).toFixed(1)}km`,
            type1: this.anomalyLogs.filter(a => a.segment === i && a.type === 1).length,
            type2: this.anomalyLogs.filter(a => a.segment === i && a.type === 2).length,
            type3: this.anomalyLogs.filter(a => a.segment === i && a.type === 3).length,
        }));

        // 閫熷害鐑姏鍥炬暟鎹?
        const speedHeatmap = this.segmentSpeedHistory.map(r => ({
            time: Math.floor(r.time / 60), // 鍒嗛挓
            segment: r.segment,
            speed: r.avgSpeed * 3.6,
        }));

        // 杞﹁締绫诲瀷閫熷害瀵规瘮
        const typeSpeedComparison = (['CAR', 'TRUCK', 'BUS'] as VehicleType[]).map(type => {
            const speeds = this.finishedVehicles.filter(v => v.type === type).map(v => v.speed * 3.6);
            const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
            return {
                type: VEHICLE_TYPE_CONFIG[type].name,
                avgSpeed,
                color: VEHICLE_TYPE_CONFIG[type].color,
            };
        });

        // 椹鹃┒椋庢牸鍒嗘瀽
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

        // 杞ㄨ抗鏁版嵁 (涓嬮噰鏍蜂互鎻愰珮鎬ц兘锛岄檺鍒舵渶澶х偣鏁?
        // 鍋囪鏈€澶ф樉绀?5000 涓偣锛岄殢鏈洪噰鏍锋垨鍧囧寑閲囨牱
        const maxPoints = 5000;
        const samplingRate = Math.max(1, Math.floor(this.trajectoryData.length / maxPoints));
        const trajectoryData = this.trajectoryData.filter((_, i) => i % samplingRate === 0);

        // 杞︽祦閫熷害鐢诲儚 - 鎸夋椂闂存缁熻骞冲潎閫熷害
        const SEGMENT_DURATION = 30; // 30绉掍竴娈?
        const speedProfile: { timeSegment: number; avgSpeed: number; label: string }[] = [];
        const maxTime = this.currentTime;

        for (let t = 0; t < maxTime; t += SEGMENT_DURATION) {
            const speedsInSegment: number[] = [];

            // 浠庤建杩规暟鎹腑鎻愬彇璇ユ椂闂存鐨勯€熷害
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

    // 当前主题（仅支持 light / dark）
    private currentTheme: string = 'dark';

    setTheme(theme: string) {
        this.currentTheme = theme;
    }

    // --- 涓婁紶鏁版嵁鍒板悗绔敓鎴愬浘琛?---
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

        // 1. 鍑嗗杞﹁締淇℃伅鏄犲皠 (鐢ㄤ簬琛ュ叏杞ㄨ抗鏁版嵁)
        const vehicleInfoMap = new Map<number, { type: string; style: string }>();
        this.finishedVehicles.forEach(v => vehicleInfoMap.set(v.id, { type: v.type, style: v.driverStyle }));
        this.vehicles.forEach(v => vehicleInfoMap.set(v.id, { type: v.type, style: v.driverStyle }));

        // 2. 杞崲 finishedValues (camelCase -> snake_case)
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
                is_affected: v.isAffected,  // camel -> snake (褰撳墠鐘舵€?
                was_affected: v.wasAffected, // 姘镐箙璁板綍锛氭槸鍚︽浘缁忓彈褰卞搷
                lane_changes: v.laneChangeCount,
                lane_change_reasons: v.laneChangeReasons,
                logs: logsObj,
                entry_time: v.entryTime,
                v0: v.v0,
                desired_speed: v.desiredSpeed, // 鐢ㄤ簬璁＄畻寤惰
                // 杩欓噷鍋囪 Vehicle 绫婚噷鍙兘鏈夎繖浜涘瓧娈典絾 VehicleData 鎺ュ彛娌℃毚闇诧紝鎴栬€呭氨鐣欑┖
                etc_detection_time: (v as any).etcDetectionTime,
                anomaly_response_times: (v as any).anomalyResponseTimes,
            };
        });


        // 3. 閲囨牱骞惰浆鎹㈣建杩规暟鎹?(鐜板湪缁熶竴鍦?complete 涓鐞嗭紝杩欓噷鐩存帴浣跨敤)
        const sampledTrajectory = this.sampledTrajectoryData; // 浣跨敤宸茬紦瀛樼殑鏁版嵁

        console.log(`Trajectory points: ${this.trajectoryData.length} -> ${sampledTrajectory.length}`);

        // 4. 杞崲鍏朵粬鏁版嵁
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
            flow: r.flow // 娴侀噺
        }));


        const snakeConfig = {
            road_length_km: config.roadLengthKm,
            num_lanes: config.numLanes,
            segment_length_km: this.segmentLengthKm,
            num_segments: this.numSegments,
            segment_boundaries: this.segmentBoundaries,  // 鍖洪棿杈圭晫閲岀▼锛屽惈棣栧熬
            total_vehicles: config.totalVehicles
        };

        // 寮亾鏇茬巼妗ｆ锛堜緵鍚庣缁樺浘鍒嗘瀽锛?
        const snakeCurveProfile = this.curveProfile.map(seg => ({
            start_m: seg.startM,
            end_m: seg.endM,
            radius_m: isFinite(seg.radiusM) ? seg.radiusM : null, // null 琛ㄧず鐩撮亾
        }));

        // 閲囨牱 lane_history (姣?0绉掍竴鏉★紝鍔犲揩杞藉叆閫熷害)
        const laneHistoryStep = Math.max(1, Math.floor(10 / (store.config.simulationDt || 1)));
        const snakeLaneHistory = this.laneHistory
            .filter((_, i) => i % laneHistoryStep === 0)
            .map(r => ({ time: r.time, counts: r.counts }));

        // 鍚庣缁樺浘涓嶉渶瑕?10涓囩偣锛屼粠 Store 鐨勯珮绮惧害鏁版嵁涓啀鎶芥牱 (渚嬪 1涓囩偣)
        // 瑙ｅ喅 fetch timeout 闂
        const backendTrajectoryStep = 10;
        const backendTrajectory = this.sampledTrajectoryData.filter((_, i) => i % backendTrajectoryStep === 0);

        const payload = {
            config: snakeConfig,
            finished_vehicles: snakeVehicles,
            anomaly_logs: snakeAnomalyLogs,
            trajectory_data: backendTrajectory, // 浣跨敤鏇寸█鐤忕殑鏁版嵁浼犵粰鍚庣
            segment_speed_history: snakeSpeedHistory,
            lane_history: snakeLaneHistory,
            curve_profile: snakeCurveProfile, // 寮亾鏇茬巼妗ｆ
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

                // 鏄剧ず淇濆瓨浣嶇疆鎻愮ず (Requested feature)
                if (resData.output_path) {
                    // 浣跨敤 confirm 璁╃敤鎴蜂笉寰椾笉鐪嬪埌锛屾垨鑰?alert
                    // alert 浼氶樆濉?UI锛屼絾濡傛灉鏄豢鐪熺粨鏉熸椂锛屼篃璁稿彲浠ユ帴鍙椼€?
                    // 鏇村ソ鐨勬柟寮忔槸鐢?addLog 寮鸿皟锛屼互鍙?ChartsPanel 鐨勯€氱煡銆?
                    // 浣嗙敤鎴锋槑纭姹?"寮瑰嚭鎻愮ず"銆?
                    // 涓轰簡涓嶉樆濉炲お涔咃紝鎴戜滑鍙?Log锛岀劧鍚庡皾璇曢潪闃诲閫氱煡濡傛灉鍙兘銆?
                    // 鐢变簬杩欐槸鍚庡彴閫昏緫锛宎lert 鏄渶鐩存帴鐨勨€滃脊鍑衡€濄€?
                    // 浣嗗鏋滃湪鑷姩璺戝ぇ閲忎豢鐪燂紝alert 浼氬緢鐑︺€?
                    // 鎴戜滑鍙互鍙湪 SimulationEngine 涓?log锛屽苟鍦?UI 渚у鐞嗐€?
                    // 浣?UI渚т笉鐭ラ亾浣曟椂缁撴潫銆?
                    // 杩樻槸寮逛釜 alert 鍚э紝绠€鍗曠洿鎺ャ€傚鏋滄槸 Turbo 妯″紡鍙兘浼氭湁鐐圭儲锛屽姞涓垽鏂紵
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

    // --- 瀹屾垚浠跨湡 ---
    private complete(reason: string) {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }

        const store = useSimStore.getState();

        const avgSpeed = this.speedHistory.length > 0
            ? this.speedHistory.reduce((a, b) => a + b, 0) / this.speedHistory.length
            : 0;

        // 棰勫厛鐢熸垚閲囨牱杞ㄨ抗鏁版嵁
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
            // 鏆撮湶鍘熷鏁版嵁渚涘墠绔缁嗗垎鏋愬浘琛ㄤ娇鐢?
            segmentSpeedHistory: this.segmentSpeedHistory,
            segmentBoundaries: this.segmentBoundaries,
            sampledTrajectory: this.sampledTrajectoryData,
            anomalyLogs: this.anomalyLogs, // 澧炲姞閫忎紶
        });
        store.setChartData(this.generateChartData());

        store.addLog({
            timestamp: this.currentTime,
            level: 'INFO',
            category: 'COMPLETE',
            message: `${reason} | Completed: ${this.finishedVehicles.length} | Anomalies: ${this.anomalyLogs.length} | Lane Changes: ${this.totalLaneChanges}`,
        });

        // 瑙﹀彂鍚庣鍥捐〃鐢熸垚
        this.uploadData();
    }

    // --- 鍑嗗杞ㄨ抗閲囨牱鏁版嵁 ---
    private prepareTrajectorySamples() {
        // 鏋勫缓杞﹁締淇℃伅鏄犲皠琛?(ID -> Info)
        const vehicleInfoMap = new Map<number, { type: string, style: string }>();
        // 鍖呮嫭鎵€鏈夎溅杈嗭紙瀹屾垚鐨?+ 娲昏穬鐨勶級
        [...this.finishedVehicles, ...this.vehicles].forEach(v => {
            vehicleInfoMap.set(v.id, { type: v.type, style: v.driverStyle });
        });

        const totalPoints = this.trajectoryData.length;
        const targetPoints = 100000;
        const step = Math.max(1, Math.ceil(totalPoints / targetPoints));

        // 鐢熸垚閲囨牱鏁版嵁骞剁紦瀛?
        this.sampledTrajectoryData = (step > 1
            ? this.trajectoryData.filter((_, i) => i % step === 0)
            : this.trajectoryData).map(p => ({
                id: p.id,
                time: p.time,
                pos: p.pos,
                lane: p.lane,
                speed: p.speed,
                anomaly_type: p.anomalyType,   // camel -> snake (鍓嶇涔熺敤 snake 鍏煎)
                anomaly_state: p.anomalyState,
                is_affected: p.isAffected,
                // 琛ュ叏杞﹁締绫诲瀷鍜岄鏍?
                vehicle_type: vehicleInfoMap.get(p.id)?.type || 'CAR',
                driver_style: vehicleInfoMap.get(p.id)?.style || 'normal',
            }));
    }

    // 閲嶆瀯 step锛屽湪姣忚繃涓€瀹氭椂闂存垨杈惧埌鐗瑰畾鏉′欢鏃惰皟鐢ㄧ紦瀛橀噸鏋?
    // 浠ユ敮鎾戝墠绔疄鏃剁儹娓叉煋
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

// 瀵煎嚭鍗曚緥
export const engine = new SimulationEngine();
