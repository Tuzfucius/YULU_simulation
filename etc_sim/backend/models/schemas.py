"""Pydantic request, response and runtime payload models."""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

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
    """Vehicle state sent to the frontend."""

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
    """Simulation progress payload."""

    current_time: float
    total_time: float
    progress: float
    active_vehicles: int
    completed_vehicles: int
    active_anomalies: int
    eta: Optional[float] = None


class LogPayload(BaseModel):
    """Simulation log payload."""

    level: str
    message: str
    timestamp: float
    category: str
    data: Optional[Dict[str, Any]] = None


class Statistics(BaseModel):
    """Simulation statistics returned by analysis APIs."""

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
    """Completed vehicle record."""

    id: int
    vehicle_type: str
    driver_style: str
    entry_time: float
    exit_time: Optional[float]
    lane_changes: int
    anomaly_type: int
    avg_speed: float
    total_delay: float


class AnomalyLog(BaseModel):
    """Anomaly event record."""

    id: int
    type: int
    time: float
    pos_km: float
    segment: int
    min_speed: float


class TrajectoryPoint(BaseModel):
    """Vehicle trajectory sample."""

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
    """Segment-level speed, density and flow sample."""

    time: float
    segment: int
    avg_speed: float
    density: float
    flow: float


class SimulationResult(BaseModel):
    """Serialized simulation result payload."""

    config: Dict[str, Any]
    statistics: Statistics
    vehicle_records: List[VehicleRecord]
    anomaly_logs: List[AnomalyLog]
    trajectory_data: List[TrajectoryPoint]
    segment_speed_history: List[SegmentSpeed]
    created_at: datetime


class ConfigCreateRequest(BaseModel):
    """Create or replace one saved simulation configuration."""

    name: str
    description: Optional[str] = None
    config: SimulationConfig


class ConfigResponse(BaseModel):
    """Saved configuration response."""

    id: str
    name: str
    description: Optional[str]
    config: Dict[str, Any]
    created_at: datetime
    updated_at: datetime


class SimulationCreateRequest(BaseModel):
    """Create a simulation from a saved or inline configuration."""

    config_id: Optional[str] = None
    config: Optional[SimulationConfig] = None


class SimulationResponse(BaseModel):
    """Simulation lifecycle response."""

    id: str
    config: Dict[str, Any]
    status: str
    progress: Optional[float]
    created_at: datetime
    completed_at: Optional[datetime]


class AnalysisSummary(BaseModel):
    """Analysis availability and summary response."""

    simulation_id: str
    statistics: Statistics
    charts_available: List[str]


__all__ = [
    "AnalysisSummary",
    "AnomalyLog",
    "AnomalyType",
    "ConfigCreateRequest",
    "ConfigResponse",
    "DriverStyle",
    "LogPayload",
    "ProgressPayload",
    "SegmentSpeed",
    "SimulationConfig",
    "SimulationCreateRequest",
    "SimulationResponse",
    "SimulationResult",
    "Statistics",
    "TrajectoryPoint",
    "VehicleRecord",
    "VehicleSnapshot",
    "VehicleType",
]
