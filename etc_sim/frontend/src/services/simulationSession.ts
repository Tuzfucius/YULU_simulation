import { API } from '../config/api';
import type {
    ETCAlertSummary,
    ETCDetectionData,
    ETCGateStatistics,
    ETCNoiseStatistics,
    SimulationChartData,
    SimulationConfig,
    SimulationConnectionStatus,
    SimulationLogEntry,
    SimulationLogInput,
    SimulationProgress,
    SimulationRuntimeData,
    SimulationServerEvent,
    SimulationSnapshot,
    SimulationStatistics,
    VehicleSnapshot,
} from '../types/simulation';

type RecordLike = Record<string, unknown>;

export interface SimulationReducerState {
    config: SimulationConfig;
    sessionId: string | null;
    progress: SimulationProgress;
    statistics: SimulationStatistics | null;
    simulationData: SimulationRuntimeData | null;
    chartData: SimulationChartData | null;
    logs: SimulationLogEntry[];
}

export interface SimulationReducerResult {
    isRunning?: boolean;
    isPaused?: boolean;
    isComplete?: boolean;
    progress?: SimulationProgress;
    statistics?: SimulationStatistics | null;
    simulationData?: SimulationRuntimeData | null;
    chartData?: SimulationChartData | null;
    logs?: SimulationLogEntry[];
    lastError?: string | null;
    sessionId?: string | null;
}

export interface SimulationSessionClientOptions {
    sessionId: string;
    onEvent: (event: SimulationServerEvent) => void;
    onStatusChange?: (status: SimulationConnectionStatus) => void;
    onTransportError?: (message: string) => void;
}

function asRecord(value: unknown): RecordLike | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as RecordLike;
    }
    return null;
}

function asArray<T = unknown>(value: unknown): T[] {
    return Array.isArray(value) ? (value as T[]) : [];
}

function toNumber(value: unknown, fallback = 0): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return fallback;
}

function toOptionalNumber(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') {
        return undefined;
    }
    const parsed = toNumber(value, Number.NaN);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function toStringValue(value: unknown, fallback = ''): string {
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    return fallback;
}

function normalizeLogLevel(level: unknown): SimulationLogEntry['level'] {
    const normalized = toStringValue(level, 'INFO').toUpperCase();
    if (normalized === 'ERROR') return 'ERROR';
    if (normalized === 'WARN' || normalized === 'WARNING') return 'WARNING';
    return 'INFO';
}

function appendLog(logs: SimulationLogEntry[], log: SimulationLogInput): SimulationLogEntry[] {
    return [
        ...logs.slice(-199),
        {
            id: log.id ?? `${Date.now()}`,
            level: normalizeLogLevel(log.level),
            message: log.message,
            timestamp: toNumber(log.timestamp),
            category: log.category,
        },
    ];
}

function normalizeSnapshot(value: unknown): SimulationSnapshot | null {
    const record = asRecord(value);
    if (!record) return null;

    const vehicles = asArray(record.vehicles)
        .map((entry) => {
            const item = asRecord(entry);
            if (!item) return null;
            const vehicleType = toStringValue(item.vehicleType ?? item.vehicle_type ?? 'CAR').toUpperCase();
            const driverStyle = toStringValue(item.driverStyle ?? item.driver_style ?? 'normal').toLowerCase();
            const vehicle: VehicleSnapshot = {
                id: toNumber(item.id),
                x: toNumber(item.x),
                y: toNumber(item.y),
                lane: toNumber(item.lane),
                speed: toNumber(item.speed),
                vehicleType: (vehicleType === 'TRUCK' || vehicleType === 'BUS' ? vehicleType : 'CAR') as VehicleSnapshot['vehicleType'],
                driverStyle: (driverStyle === 'aggressive' || driverStyle === 'conservative' ? driverStyle : 'normal') as VehicleSnapshot['driverStyle'],
                anomalyState: toStringValue(item.anomalyState ?? item.anomaly_state ?? 'none'),
                anomalyType: toOptionalNumber(item.anomalyType ?? item.anomaly_type),
                isAffected: Boolean(item.isAffected ?? item.is_affected),
                length: toNumber(item.length, 4.5),
                color: toStringValue(item.color, '#1f77b4'),
            };
            return vehicle;
        })
        .filter((entry): entry is VehicleSnapshot => entry !== null);

    return {
        time: toNumber(record.time),
        vehicles,
    };
}

function normalizeProgress(value: unknown, fallbackTotalTime: number): SimulationProgress {
    const record = asRecord(value);
    if (!record) {
        return {
            currentTime: 0,
            totalTime: fallbackTotalTime,
            progress: 0,
            activeVehicles: 0,
            completedVehicles: 0,
            activeAnomalies: 0,
        };
    }

    return {
        currentTime: toNumber(record.currentTime ?? record.current_time),
        totalTime: toNumber(record.totalTime ?? record.total_time, fallbackTotalTime),
        progress: toNumber(record.progress),
        activeVehicles: toNumber(record.activeVehicles ?? record.active_vehicles),
        completedVehicles: toNumber(record.completedVehicles ?? record.completed_vehicles),
        activeAnomalies: toNumber(record.activeAnomalies ?? record.active_anomalies),
    };
}

function normalizeNoiseStatistics(value: unknown): ETCNoiseStatistics {
    const record = asRecord(value);
    return {
        missed_read_count: toNumber(record?.missed_read_count),
        duplicate_read_count: toNumber(record?.duplicate_read_count),
        delayed_upload_count: toNumber(record?.delayed_upload_count),
        clock_drift_count: toNumber(record?.clock_drift_count),
        missed_read_rate_actual: toNumber(record?.missed_read_rate_actual),
    };
}

function normalizeEtcDetection(value: unknown): ETCDetectionData | undefined {
    const record = asRecord(value);
    if (!record) return undefined;

    const alerts = asArray(record.alerts)
        .map((entry) => {
            const item = asRecord(entry);
            if (!item) return null;
            const alert: ETCAlertSummary = {
                type: toStringValue(item.type),
                gate_id: toStringValue(item.gate_id ?? item.gateId),
                timestamp: toNumber(item.timestamp ?? item.time),
                severity: toStringValue(item.severity, 'info'),
                description: toStringValue(item.description, '') || undefined,
            };
            return alert;
        })
        .filter((entry): entry is ETCAlertSummary => entry !== null);

    const gate_stats = Object.entries(asRecord(record.gate_stats) ?? {}).reduce<Record<string, ETCGateStatistics>>((result, [key, value]) => {
        const item = asRecord(value);
        result[key] = {
            total_transactions: toNumber(item?.total_transactions),
            avg_speed: toNumber(item?.avg_speed),
        };
        return result;
    }, {});

    return {
        alerts,
        gate_stats,
        noise_statistics: normalizeNoiseStatistics(record.noise_statistics),
        transactions: asArray(record.transactions),
    };
}

export function normalizeStatistics(value: SimulationStatistics | RecordLike | null): SimulationStatistics | null {
    if (!value) return null;
    const record = value as RecordLike;
    return {
        totalVehicles: toNumber(record.totalVehicles ?? record.total_vehicles),
        completedVehicles: toNumber(record.completedVehicles ?? record.completed_vehicles ?? record.total_vehicles),
        avgSpeed: toNumber(record.avgSpeed ?? record.avg_speed),
        avgTravelTime: toNumber(record.avgTravelTime ?? record.avg_travel_time),
        totalAnomalies: toNumber(record.totalAnomalies ?? record.total_anomalies ?? record.anomaly_count),
        affectedByAnomaly: toNumber(record.affectedByAnomaly ?? record.affected_vehicles),
        totalLaneChanges: toNumber(record.totalLaneChanges ?? record.total_lane_changes),
        maxCongestionLength: toNumber(record.maxCongestionLength ?? record.max_congestion_length),
        simulationTime: toNumber(record.simulationTime ?? record.simulation_time),
        etc_transactions_count: toOptionalNumber(record.etc_transactions_count),
        etc_alerts_count: toOptionalNumber(record.etc_alerts_count),
        segmentBoundaries: Array.isArray(record.segmentBoundaries) ? (record.segmentBoundaries as number[]) : undefined,
        segmentSpeedHistory: Array.isArray(record.segmentSpeedHistory) ? (record.segmentSpeedHistory as never[]) : undefined,
        sampledTrajectory: Array.isArray(record.sampledTrajectory) ? (record.sampledTrajectory as never[]) : undefined,
        anomalyLogs: Array.isArray(record.anomalyLogs) ? (record.anomalyLogs as never[]) : undefined,
    };
}

export function normalizeRuntimeData(value: SimulationRuntimeData | RecordLike | null, fallbackConfig: SimulationConfig): SimulationRuntimeData | null {
    if (!value) return null;
    const record = value as RecordLike;
    return {
        ...record,
        config: (asRecord(record.config) ?? fallbackConfig) as SimulationConfig | RecordLike,
        statistics: normalizeStatistics(asRecord(record.statistics) ?? null) ?? undefined,
        etc_detection: normalizeEtcDetection(record.etc_detection),
        progress: normalizeProgress(record.progress, fallbackConfig.maxSimulationTime),
        snapshot: normalizeSnapshot(record.snapshot),
    };
}

function buildChartDataFromSegmentHistory(segmentSpeedHistory: Array<Record<string, unknown>>): SimulationChartData | null {
    if (segmentSpeedHistory.length === 0) {
        return null;
    }

    const buckets = new Map<number, { speed: number; flow: number; density: number; count: number }>();

    for (const item of segmentSpeedHistory) {
        const time = toNumber(item.time);
        const bucket = buckets.get(time) ?? { speed: 0, flow: 0, density: 0, count: 0 };
        bucket.speed += toNumber(item.avgSpeed ?? item.avg_speed);
        bucket.flow += toNumber(item.flow);
        bucket.density += toNumber(item.density);
        bucket.count += 1;
        buckets.set(time, bucket);
    }

    const points = [...buckets.entries()].sort((left, right) => left[0] - right[0]).map(([time, bucket]) => ({
        time,
        speed: bucket.speed / Math.max(bucket.count, 1),
        flow: bucket.flow / Math.max(bucket.count, 1),
        density: bucket.density / Math.max(bucket.count, 1),
    }));

    return {
        speedHistory: points.map((point) => ({ time: point.time, value: point.speed, label: 'avgSpeed' })),
        flowHistory: points.map((point) => ({ time: point.time, value: point.flow, label: 'flow' })),
        densityHistory: points.map((point) => ({ time: point.time, value: point.density, label: 'density' })),
    };
}

export function reduceSimulationServerEvent(state: SimulationReducerState, event: SimulationServerEvent): SimulationReducerResult {
    const payload = event.payload;

    if (event.type === 'INIT_COMPLETE') {
        const progress = normalizeProgress(null, state.config.maxSimulationTime);
        return {
            sessionId: toStringValue(payload?.session_id, state.sessionId ?? '') || state.sessionId,
            progress,
            simulationData: {
                ...(state.simulationData ?? {}),
                sessionId: (toStringValue(payload?.session_id, state.sessionId ?? '') || state.sessionId) ?? undefined,
                config: (asRecord(payload?.config) ?? state.config) as SimulationConfig | RecordLike,
                workflow_snapshot: payload?.workflow_snapshot,
                progress,
            },
            lastError: null,
        };
    }

    if (event.type === 'STARTED') {
        const progress = normalizeProgress(null, state.config.maxSimulationTime);
        return {
            isRunning: true,
            isPaused: false,
            isComplete: false,
            progress,
            statistics: null,
            simulationData: { sessionId: state.sessionId ?? undefined, config: state.config, progress },
            chartData: null,
            logs: [],
            lastError: null,
        };
    }

    if (event.type === 'PROGRESS') {
        const progress = normalizeProgress(payload, state.config.maxSimulationTime);
        return {
            isRunning: true,
            isPaused: false,
            progress,
            simulationData: { ...(state.simulationData ?? {}), sessionId: state.sessionId ?? undefined, config: state.simulationData?.config ?? state.config, progress },
        };
    }

    if (event.type === 'SNAPSHOT') {
        return {
            simulationData: { ...(state.simulationData ?? {}), sessionId: state.sessionId ?? undefined, config: state.simulationData?.config ?? state.config, progress: state.progress, statistics: state.statistics ?? undefined, snapshot: normalizeSnapshot(payload) },
        };
    }

    if (event.type === 'RUNTIME_STATS') {
        const statsRecord = asRecord(payload?.statistics);
        const statistics = normalizeStatistics(statsRecord) ?? state.statistics;
        const chartData = statistics?.segmentSpeedHistory
            ? buildChartDataFromSegmentHistory(asArray<Record<string, unknown>>(statistics.segmentSpeedHistory))
            : state.chartData;

        return {
            statistics,
            chartData,
            simulationData: {
                ...(state.simulationData ?? {}),
                sessionId: state.sessionId ?? undefined,
                config: state.simulationData?.config ?? state.config,
                progress: state.progress,
                statistics: statistics ?? undefined,
                chartData,
            },
        };
    }

    if (event.type === 'LOG' && payload) {
        return {
            logs: appendLog(state.logs, {
                id: toStringValue(payload.id, ''),
                level: toStringValue(payload.level, 'INFO'),
                message: toStringValue(payload.message),
                timestamp: toNumber(payload.timestamp, state.progress.currentTime),
                category: toStringValue(payload.category, ''),
            }),
        };
    }

    if (event.type === 'PAUSED') return { isRunning: true, isPaused: true };
    if (event.type === 'RESUMED') return { isRunning: true, isPaused: false };
    if (event.type === 'STOPPED') return { isRunning: false, isPaused: false };

    if (event.type === 'RESET_COMPLETE') {
        const progress = normalizeProgress(null, state.config.maxSimulationTime);
        return {
            isRunning: false,
            isPaused: false,
            isComplete: false,
            progress,
            statistics: null,
            simulationData: state.sessionId ? { sessionId: state.sessionId, config: state.config, progress } : null,
            chartData: null,
            logs: [],
            lastError: null,
        };
    }

    if (event.type === 'COMPLETE') {
        const resultRecord = asRecord(payload?.results) ?? {};
        const configRecord = asRecord(resultRecord.config) ?? {};
        const gatePositions = asArray(resultRecord.etcGates).map((entry) => {
            const item = asRecord(entry);
            return item ? toOptionalNumber(item.position_km) : undefined;
        }).filter((value): value is number => value !== undefined);
        const roadLengthKm = toOptionalNumber(configRecord.custom_road_length_km ?? configRecord.road_length_km);
        const segmentBoundaries = roadLengthKm !== undefined
            ? [0, ...Array.from(new Set(gatePositions)).sort((left, right) => left - right), roadLengthKm]
            : undefined;
        const segmentSpeedHistory = asArray(resultRecord.segment_speed_history).map((entry) => {
            const item = asRecord(entry);
            return {
                time: toNumber(item?.time),
                segment: toNumber(item?.segment),
                avgSpeed: toNumber(item?.avg_speed ?? item?.avgSpeed),
                density: toNumber(item?.density),
                flow: toNumber(item?.flow),
                vehicleCount: toNumber(item?.vehicle_count ?? item?.vehicleCount),
            };
        });
        const sampledTrajectory = asArray(resultRecord.trajectory_data).map((entry) => {
            const item = asRecord(entry);
            return {
                id: toNumber(item?.id),
                time: toNumber(item?.time),
                pos: toNumber(item?.pos ?? item?.x),
                lane: toNumber(item?.lane),
                speed: toNumber(item?.speed),
                anomaly_type: toNumber(item?.anomaly_type ?? item?.anomalyType),
                anomaly_state: toStringValue(item?.anomaly_state ?? item?.anomalyState ?? 'none'),
                is_affected: Boolean(item?.is_affected ?? item?.isAffected),
                vehicle_type: toStringValue(item?.vehicle_type ?? item?.vehicleType ?? 'CAR'),
                driver_style: toStringValue(item?.driver_style ?? item?.driverStyle ?? 'normal'),
            };
        });
        const anomalyLogs = asArray(resultRecord.anomaly_logs).map((entry) => {
            const item = asRecord(entry);
            const posKm = toOptionalNumber(item?.pos_km ?? item?.posKm);
            return {
                id: toOptionalNumber(item?.id),
                type: toNumber(item?.type),
                time: toNumber(item?.time),
                posKm,
                pos_km: posKm,
                segment: toNumber(item?.segment),
            };
        });
        const statistics = normalizeStatistics(asRecord(payload?.statistics) ?? asRecord(resultRecord.statistics)) ?? {
            totalVehicles: 0,
            completedVehicles: 0,
            avgSpeed: 0,
            avgTravelTime: 0,
            totalAnomalies: 0,
            affectedByAnomaly: 0,
            totalLaneChanges: 0,
            maxCongestionLength: 0,
            simulationTime: 0,
        };
        statistics.segmentBoundaries = segmentBoundaries;
        statistics.segmentSpeedHistory = segmentSpeedHistory;
        statistics.sampledTrajectory = sampledTrajectory;
        statistics.anomalyLogs = anomalyLogs;
        statistics.etc_transactions_count = toOptionalNumber(asRecord(resultRecord.statistics)?.etc_transactions_count);
        statistics.etc_alerts_count = toOptionalNumber(asRecord(resultRecord.statistics)?.etc_alerts_count);
        const progress = { currentTime: statistics.simulationTime, totalTime: Math.max(statistics.simulationTime, state.config.maxSimulationTime), progress: 100, activeVehicles: 0, completedVehicles: statistics.completedVehicles, activeAnomalies: 0 };
        const chartData = buildChartDataFromSegmentHistory(segmentSpeedHistory);
        return {
            isRunning: false,
            isPaused: false,
            isComplete: true,
            progress,
            statistics,
            simulationData: { sessionId: state.sessionId ?? undefined, runId: toStringValue(payload?.run_id ?? payload?.runId, '') || null, savedPath: toStringValue(payload?.saved_path ?? payload?.savedPath, '') || null, config: (asRecord(resultRecord.config) ?? state.config) as SimulationConfig | RecordLike, statistics, etc_detection: normalizeEtcDetection(resultRecord.etc_detection), progress, chartData, results: resultRecord },
            chartData,
            lastError: null,
        };
    }

    if (event.type === 'ERROR') {
        const message = toStringValue(payload?.message, 'Simulation error');
        return {
            isRunning: false,
            isPaused: false,
            lastError: message,
            logs: appendLog(state.logs, { level: 'ERROR', message, timestamp: state.progress.currentTime, category: 'SYSTEM' }),
        };
    }

    return {};
}

function buildWsUrl(sessionId: string): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const httpBase = API.BASE.startsWith('http')
        ? API.BASE
        : `${window.location.protocol}//${window.location.host}${API.BASE.startsWith('/') ? API.BASE : `/${API.BASE}`}`;
    const url = new URL(`${httpBase.replace(/\/+$/, '')}/ws/simulation/${encodeURIComponent(sessionId)}`);
    url.protocol = protocol;
    return url.toString();
}

export class SimulationSessionClient {
    private readonly sessionId: string;
    private readonly onEvent: (event: SimulationServerEvent) => void;
    private readonly onStatusChange?: (status: SimulationConnectionStatus) => void;
    private readonly onTransportError?: (message: string) => void;
    private socket: WebSocket | null = null;
    private connectPromise: Promise<void> | null = null;
    private pendingMessages: string[] = [];
    private manualClose = false;

    constructor(options: SimulationSessionClientOptions) {
        this.sessionId = options.sessionId;
        this.onEvent = options.onEvent;
        this.onStatusChange = options.onStatusChange;
        this.onTransportError = options.onTransportError;
    }

    async connect(): Promise<void> {
        if (this.socket?.readyState === WebSocket.OPEN) return;
        if (this.connectPromise) return this.connectPromise;

        this.manualClose = false;
        this.onStatusChange?.('connecting');
        this.connectPromise = new Promise((resolve, reject) => {
            const socket = new WebSocket(buildWsUrl(this.sessionId));
            this.socket = socket;

            socket.onopen = () => {
                this.onStatusChange?.('connected');
                for (const message of this.pendingMessages) socket.send(message);
                this.pendingMessages = [];
                this.connectPromise = null;
                resolve();
            };

            socket.onmessage = (event) => {
                try {
                    this.onEvent(JSON.parse(event.data) as SimulationServerEvent);
                } catch (error) {
                    this.onTransportError?.(error instanceof Error ? error.message : String(error));
                }
            };

            socket.onerror = () => {
                reject(new Error('WebSocket connection failed'));
            };

            socket.onclose = () => {
                this.socket = null;
                this.connectPromise = null;
                this.onStatusChange?.('disconnected');
                if (!this.manualClose) {
                    this.onTransportError?.('WebSocket disconnected');
                }
            };
        });

        return this.connectPromise;
    }

    disconnect(): void {
        this.manualClose = true;
        this.socket?.close();
        this.socket = null;
        this.connectPromise = null;
    }

    private async send(message: RecordLike): Promise<void> {
        const serialized = JSON.stringify(message);
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(serialized);
            return;
        }

        this.pendingMessages.push(serialized);
        await this.connect();
    }

    init(config: SimulationConfig): Promise<void> {
        return this.send({ type: 'INIT', config });
    }

    start(): Promise<void> {
        return this.send({ type: 'START' });
    }

    pause(): Promise<void> {
        return this.send({ type: 'PAUSE' });
    }

    resume(): Promise<void> {
        return this.send({ type: 'RESUME' });
    }

    stop(): Promise<void> {
        return this.send({ type: 'STOP' });
    }

    reset(): Promise<void> {
        return this.send({ type: 'RESET' });
    }
}
