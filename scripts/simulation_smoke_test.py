"""Run a small end-to-end simulation and validate exported results."""

from __future__ import annotations

import json
import math
import sys
import traceback
from typing import Any, Dict, List

from etc_sim.config import SimulationConfig
from etc_sim.simulation.engine import SimulationEngine, SimulationStepStatus


def _record(checks: List[Dict[str, Any]], name: str, passed: bool, detail: str) -> None:
    checks.append({"name": name, "passed": passed, "detail": detail})
    print(f"[{'PASS' if passed else 'FAIL'}] {name}: {detail}")


def main() -> int:
    checks: List[Dict[str, Any]] = []

    config = SimulationConfig(
        road_length_km=2.0,
        segment_length_km=1.0,
        total_vehicles=12,
        simulation_dt=0.5,
        trajectory_sample_interval=1.0,
        max_simulation_time=30.0,
        anomaly_ratio=0.0,
        random_seed=42,
    )

    try:
        engine = SimulationEngine(config)
        status = engine.run()
    except Exception as exc:
        _record(checks, "engine-run", False, f"{type(exc).__name__}: {exc}")
        traceback.print_exc()
        print(json.dumps({"checks": checks, "failed": 1}, indent=2, ensure_ascii=False))
        return 1

    _record(
        checks,
        "terminal-status",
        status in {SimulationStepStatus.COMPLETED, SimulationStepStatus.TIME_LIMIT_REACHED},
        f"status={status.value}",
    )

    _record(
        checks,
        "time-bound",
        engine.current_time <= config.max_simulation_time + config.simulation_dt + 1e-9,
        f"current_time={engine.current_time}, max={config.max_simulation_time}",
    )

    sampled_times = sorted({float(item["time"]) for item in engine.trajectory_data})
    sampling_aligned = all(
        math.isclose(
            sample_time / config.trajectory_sample_interval,
            round(sample_time / config.trajectory_sample_interval),
            abs_tol=1e-7,
        )
        for sample_time in sampled_times
    )
    _record(
        checks,
        "sampling-deadlines",
        sampling_aligned,
        f"sampled_times={sampled_times[:20]}",
    )

    trajectory_keys = {
        "id",
        "pos",
        "time",
        "lane",
        "speed",
        "anomaly_state",
        "anomaly_type",
        "vehicle_type",
        "driver_style",
        "is_affected",
    }
    trajectory_shape_ok = all(trajectory_keys.issubset(item) for item in engine.trajectory_data)
    _record(
        checks,
        "trajectory-schema",
        trajectory_shape_ok,
        f"frames={len(engine.trajectory_data)}",
    )

    try:
        exported = engine.export_to_dict()
        serialized = json.dumps(exported, ensure_ascii=False)
        _record(
            checks,
            "result-json-serialization",
            True,
            f"serialized_bytes={len(serialized.encode('utf-8'))}",
        )
    except Exception as exc:
        _record(
            checks,
            "result-json-serialization",
            False,
            f"{type(exc).__name__}: {exc}",
        )

    statistics = exported.get("statistics", {}) if "exported" in locals() else {}
    _record(
        checks,
        "statistics-present",
        isinstance(statistics, dict)
        and "simulation_time" in statistics
        and "total_vehicles" in statistics,
        f"keys={sorted(statistics.keys()) if isinstance(statistics, dict) else type(statistics).__name__}",
    )

    failures = [check for check in checks if not check["passed"]]
    print(json.dumps({"checks": checks, "failed": len(failures)}, indent=2, ensure_ascii=False))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
