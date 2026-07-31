"""FastAPI 传输模型；仿真配置仅定义于 etc_sim.config.parameters。"""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel

from etc_sim.config.parameters import SimulationConfig


class VehicleType(str, Enum):
    CAR = "CAR"
    TRUCK = "TRUCK"
    BUS = "BUS"


class DriverStyle(str, Enum):
    AGGRESSIVE = "aggressive"
    NORMAL = "normal"
    CONSERVATIVE = "conservative"


class AnomalyType(str, Enum):
    NONE = "none"
    FULL_STOP = "full_stop"
    TEMP_FLUCTUATION = "temp_fluctuation"
    LONG_FLUCTUATION = "long_fluctuation"


class VehicleSnapshot(BaseModel):
    id: int
    x: float
    y: float
    lane: int
    speed: float
    vehicle_type: str
    anomaly_state: str
    anomaly_type: int
    is_affected: bool
    length: float
    color: str


class ProgressPayload(BaseModel):
    current_time: float
    total_time: float
    progress: float
    active_vehicles: int
    completed_vehicles: int
    active_anomalies: int
    eta: float | None = None


class LogPayload(BaseModel):
    level: str
    message: str
    timestamp: float
    category: str
    data: dict[str, Any] | None = None


class Statistics(BaseModel):
    total_vehicles: int
    total_anomalies: int
    simulation_time: float
    completed_vehicles: int
    avg_speed: float
    avg_travel_time: float
    total_lane_changes: int
    anomaly_count: int
    affected_vehicles: int
    max_congestion_length: float
    etc_detection_rate: float
    ttc_violations: int


class VehicleRecord(BaseModel):
    id: int
    vehicle_type: str
    driver_style: str
    entry_time: float
    exit_time: float | None
    lane_changes: int
    anomaly_type: int
    avg_speed: float
    total_delay: float


class AnomalyLog(BaseModel):
    id: int
    type: int
    time: float
    pos_km: float
    segment: int
    min_speed: float


class TrajectoryPoint(BaseModel):
    id: int
    pos: float
    time: float
    lane: int
    speed: float
    anomaly_state: str
    anomaly_type: int
    vehicle_type: str
    driver_style: str
    is_affected: bool


class SegmentSpeed(BaseModel):
    time: float
    segment: int
    avg_speed: float
    density: float
    flow: float


class SimulationResult(BaseModel):
    config: dict[str, Any]
    statistics: Statistics
    vehicle_records: list[VehicleRecord]
    anomaly_logs: list[AnomalyLog]
    trajectory_data: list[TrajectoryPoint]
    segment_speed_history: list[SegmentSpeed]
    created_at: datetime


class ConfigCreateRequest(BaseModel):
    name: str
    description: str | None = None
    config: SimulationConfig


class ConfigResponse(BaseModel):
    id: str
    name: str
    description: str | None
    config: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class SimulationCreateRequest(BaseModel):
    config_id: str | None = None
    config: SimulationConfig | None = None


class SimulationResponse(BaseModel):
    id: str
    config: dict[str, Any]
    status: str
    progress: float | None
    created_at: datetime
    completed_at: datetime | None


class AnalysisSummary(BaseModel):
    simulation_id: str
    statistics: Statistics
    charts_available: list[str]
