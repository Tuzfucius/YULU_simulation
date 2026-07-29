"""Canonical simulation configuration model and JSON helpers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator


def _to_camel(name: str) -> str:
    head, *tail = name.split("_")
    return head + "".join(part.capitalize() for part in tail)


class SimulationConfig(BaseModel):
    """Single authoritative configuration used by CLI, API and WebSocket.

    The model accepts the internal snake_case names, frontend camelCase names
    and the legacy nested API payload. Unknown frontend-only experiment fields
    are ignored during the migration period instead of causing a hard failure.
    """

    model_config = ConfigDict(
        alias_generator=_to_camel,
        populate_by_name=True,
        validate_assignment=True,
        extra="ignore",
    )

    # Road parameters
    road_length_km: float = Field(20.0, gt=0, le=1000)
    segment_length_km: float = Field(
        2.0,
        gt=0,
        le=100,
        validation_alias=AliasChoices(
            "segment_length_km",
            "segmentLengthKm",
            "etcGateIntervalKm",
        ),
    )
    num_lanes: int = Field(4, ge=1, le=12)
    lane_width: float = Field(3.5, gt=0, le=10)

    # Custom road parameters
    custom_road_length_km: Optional[float] = Field(None, gt=0, le=1000)
    custom_gantry_positions: List[float] = Field(
        default_factory=list,
        validation_alias=AliasChoices(
            "custom_gantry_positions",
            "customGantryPositions",
            "customGantryPositionsKm",
        ),
    )
    custom_road_path: Optional[str] = None
    custom_ramps: List[Dict[str, Any]] = Field(default_factory=list)

    # Simulation parameters
    total_vehicles: int = Field(1200, ge=1, le=100000)
    simulation_dt: float = Field(1.0, gt=0, le=10)
    max_simulation_time: float = Field(3900.0, gt=0, le=1000000)
    trajectory_sample_interval: float = Field(2.0, gt=0, le=100000)
    random_seed: int = 42

    # Vehicle composition compatibility fields
    vehicle_type_weights: Dict[str, float] = Field(
        default_factory=lambda: {"CAR": 0.60, "TRUCK": 0.25, "BUS": 0.15}
    )

    # Anomaly parameters
    anomaly_ratio: float = Field(0.01, ge=0, le=1)
    global_anomaly_start: float = Field(
        200.0,
        ge=0,
        validation_alias=AliasChoices(
            "global_anomaly_start",
            "globalAnomalyStart",
            "anomalyStartTime",
        ),
    )
    vehicle_safe_run_time: float = Field(200.0, ge=0)

    # Lane-change parameters
    forced_change_dist: float = Field(400.0, ge=0)
    lane_change_gap: float = Field(25.0, gt=0)
    lane_change_max_retries: int = Field(5, ge=0)
    lane_change_retry_interval: float = Field(1.0, ge=0)
    lane_change_delay: float = Field(2.0, ge=0)
    lane_change_steps: int = Field(5, ge=1)

    # Impact parameters
    impact_threshold: float = Field(0.90, ge=0, le=1)
    impact_speed_ratio: float = Field(0.70, ge=0, le=1)
    impact_discover_dist: float = Field(150.0, ge=0)
    slowdown_ratio: float = Field(0.85, ge=0, le=1)

    # Multi-lane coupling parameters
    lane_coupling_dist: float = Field(50.0, ge=0)
    lane_coupling_factor: float = Field(0.01, ge=0)

    # Queue detection parameters
    queue_speed_threshold: float = Field(15.0, ge=0)
    queue_min_vehicles: int = Field(3, ge=1)
    queue_dissipation_rate: float = Field(0.8, ge=0)

    # Phantom-jam parameters
    phantom_jam_speed: float = Field(30.0, ge=0)
    phantom_jam_dist: float = Field(200.0, ge=0)

    # Phase-analysis parameters
    phase_critical_density: float = Field(35.0, ge=0)
    phase_transition_threshold: float = Field(5.0, ge=0)

    @model_validator(mode="before")
    @classmethod
    def _flatten_legacy_nested_payload(cls, value: Any) -> Any:
        """Accept the retired nested API configuration without data loss."""
        if not isinstance(value, dict):
            return value

        nested_keys = {"road", "vehicle", "simulation", "anomaly", "lane_change", "impact", "etc"}
        if not nested_keys.intersection(value):
            return value

        flattened: Dict[str, Any] = {
            key: item
            for key, item in value.items()
            if key not in nested_keys
        }

        for section_name in ("road", "vehicle", "simulation", "anomaly", "lane_change", "impact"):
            section = value.get(section_name)
            if isinstance(section, dict):
                flattened.update(section)

        etc_section = value.get("etc")
        if isinstance(etc_section, dict):
            interval = etc_section.get("etc_gate_interval_km", etc_section.get("etcGateIntervalKm"))
            if interval is not None and not any(
                key in flattened
                for key in ("segment_length_km", "segmentLengthKm", "etcGateIntervalKm")
            ):
                flattened["segment_length_km"] = interval

        return flattened

    @model_validator(mode="after")
    def _validate_cross_field_constraints(self) -> "SimulationConfig":
        effective_road_length = self.custom_road_length_km or self.road_length_km

        if self.segment_length_km > effective_road_length:
            raise ValueError("segment_length_km cannot exceed the effective road length")

        if self.trajectory_sample_interval < self.simulation_dt:
            raise ValueError("trajectory_sample_interval must be greater than or equal to simulation_dt")

        if any(position <= 0 or position >= effective_road_length for position in self.custom_gantry_positions):
            raise ValueError("custom gantry positions must be inside the effective road range")

        if self.custom_gantry_positions != sorted(set(self.custom_gantry_positions)):
            raise ValueError("custom gantry positions must be strictly increasing and unique")

        weight_sum = sum(self.vehicle_type_weights.values())
        if any(weight < 0 for weight in self.vehicle_type_weights.values()) or weight_sum <= 0:
            raise ValueError("vehicle_type_weights must contain non-negative values with a positive sum")

        return self

    @property
    def num_segments(self) -> int:
        """Return the number of regular road segments."""
        return max(1, int(self.road_length_km / self.segment_length_km))

    @property
    def last_spawn_time(self) -> float:
        """Return the historical estimate of the last spawn time."""
        return (self.total_vehicles / 5) * 10

    @property
    def run_time_60kmh(self) -> float:
        """Return the road traversal time at 60 km/h."""
        return (self.road_length_km / 60) * 3600

    @classmethod
    def create_default(cls) -> "SimulationConfig":
        """Create a default configuration for API compatibility."""
        return cls()

    def to_dict(self) -> Dict[str, Any]:
        """Return a JSON-compatible snake_case dictionary."""
        return self.model_dump(mode="json", by_alias=False)

    def to_json(self, filepath: str | Path, indent: int = 2) -> None:
        """Serialize the configuration to a UTF-8 JSON file."""
        target = Path(filepath)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            json.dumps(self.to_dict(), indent=indent, ensure_ascii=False),
            encoding="utf-8",
        )

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SimulationConfig":
        """Validate and create a configuration from a dictionary."""
        return cls.model_validate(data)

    @classmethod
    def from_json(cls, filepath: str | Path) -> "SimulationConfig":
        """Load and validate a UTF-8 JSON configuration file."""
        data = json.loads(Path(filepath).read_text(encoding="utf-8"))
        return cls.from_dict(data)


def load_config(filepath: str | Path) -> SimulationConfig:
    """Load a supported simulation configuration file."""
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"配置文件不存在: {path}")
    if path.suffix.lower() != ".json":
        raise ValueError(f"不支持的配置文件格式: {path.suffix.lower()}")
    return SimulationConfig.from_json(path)
