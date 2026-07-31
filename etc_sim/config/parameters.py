"""仿真领域的唯一配置协议。"""

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


def _to_camel_case(name: str) -> str:
    head, *tail = name.split("_")
    return head + "".join(part.title() for part in tail)


class SimulationConfig(BaseModel):
    """内部使用 snake_case；外部 JSON 仅使用 camelCase。"""

    model_config = ConfigDict(alias_generator=_to_camel_case, populate_by_name=False, extra="forbid")

    road_length_km: float = Field(20.0, ge=1.0, le=100.0)
    segment_length_km: float = Field(2.0, gt=0.0, le=20.0)
    num_lanes: int = Field(4, ge=1, le=8)
    lane_width: float = Field(3.5, ge=2.5, le=4.5)
    custom_road_length_km: float | None = Field(None, ge=1.0, le=100.0)
    custom_gantry_positions: list[float] = Field(
        default_factory=list,
        validation_alias="customGantryPositionsKm",
        serialization_alias="customGantryPositionsKm",
    )
    custom_road_path: str | None = Field(None, min_length=1, max_length=256)
    custom_ramps: list[dict[str, Any]] = Field(default_factory=list)

    total_vehicles: int = Field(1200, ge=0, le=5000)
    simulation_dt: float = Field(1.0, gt=0.0, le=10.0)
    max_simulation_time: float = Field(3900.0, gt=0.0, le=10000.0)
    trajectory_sample_interval: float = Field(2.0, gt=0.0, le=600.0)

    anomaly_ratio: float = Field(0.01, ge=0.0, le=1.0)
    global_anomaly_start: float = Field(200.0, ge=0.0)
    vehicle_safe_run_time: float = Field(200.0, ge=0.0)

    forced_change_dist: float = Field(400.0, gt=0.0)
    lane_change_gap: float = Field(25.0, gt=0.0)
    lane_change_max_retries: int = Field(5, ge=0, le=100)
    lane_change_retry_interval: float = Field(1.0, gt=0.0)
    impact_threshold: float = Field(0.90, ge=0.0, le=1.0)
    impact_speed_ratio: float = Field(0.70, ge=0.0, le=1.0)
    lane_coupling_dist: float = Field(50.0, ge=0.0)
    lane_coupling_factor: float = Field(0.01, ge=0.0)
    queue_speed_threshold: float = Field(15.0, ge=0.0)
    queue_min_vehicles: int = Field(3, ge=1)
    queue_dissipation_rate: float = Field(0.8, ge=0.0, le=1.0)
    phantom_jam_speed: float = Field(30.0, ge=0.0)
    phantom_jam_dist: float = Field(200.0, ge=0.0)
    phase_critical_density: float = Field(35.0, ge=0.0)
    phase_transition_threshold: float = Field(5.0, ge=0.0)
    impact_discover_dist: float = Field(150.0, ge=0.0)

    @model_validator(mode="after")
    def validate_cross_field_constraints(self) -> "SimulationConfig":
        if self.segment_length_km > self.effective_road_length_km:
            raise ValueError("segmentLengthKm must not exceed the effective road length")
        if self.global_anomaly_start > self.max_simulation_time:
            raise ValueError("globalAnomalyStart must not exceed maxSimulationTime")
        if any(position <= 0 or position >= self.effective_road_length_km for position in self.custom_gantry_positions):
            raise ValueError("customGantryPositions must be inside the road bounds")
        if self.custom_gantry_positions != sorted(set(self.custom_gantry_positions)):
            raise ValueError("customGantryPositions must be strictly increasing and unique")
        return self

    @property
    def effective_road_length_km(self) -> float:
        return self.custom_road_length_km or self.road_length_km

    @property
    def num_segments(self) -> int:
        return int(self.effective_road_length_km / self.segment_length_km)

    @property
    def last_spawn_time(self) -> float:
        return (self.total_vehicles / 5) * 10

    @property
    def run_time_60kmh(self) -> float:
        return (self.effective_road_length_km / 60) * 3600

    @classmethod
    def from_internal(cls, values: dict[str, Any] | None = None, **kwargs: Any) -> "SimulationConfig":
        """仅供 Python 调用者以 snake_case 构造经过校验的配置。"""
        return cls.model_validate({**(values or {}), **kwargs}, by_alias=False, by_name=True)

    @classmethod
    def from_wire(cls, values: dict[str, Any]) -> "SimulationConfig":
        return cls.model_validate(values, by_alias=True, by_name=False)

    def to_wire_dict(self) -> dict[str, Any]:
        return self.model_dump(by_alias=True)

    def to_dict(self) -> dict[str, Any]:
        return self.to_wire_dict()

    def to_json(self, filepath: str, indent: int = 2) -> None:
        Path(filepath).write_text(json.dumps(self.to_wire_dict(), indent=indent, ensure_ascii=False), encoding="utf-8")


def load_config(filepath: str) -> SimulationConfig:
    path = Path(filepath)
    if path.suffix.lower() != ".json":
        raise ValueError(f"Unsupported configuration format: {path.suffix}")
    return SimulationConfig.from_wire(json.loads(path.read_text(encoding="utf-8")))
