"""
Helpers for run-centered simulation history storage.
"""

from __future__ import annotations

import json
import math
from datetime import datetime
from pathlib import Path
from typing import Any, List, Optional


RUN_SCHEMA_VERSION = "run_v2_path"
MANIFEST_FILENAME = "manifest.json"
SUMMARY_FILENAME = "summary.json"
DATA_FILENAME = "data.json"

ETC_SIM_DIR = Path(__file__).resolve().parents[2]
ROAD_MAP_DIR = ETC_SIM_DIR / "data" / "road_map"


def _safe_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def build_gate_descriptors(config: Optional[dict]) -> List[dict]:
    """Build stable gate descriptors from config."""
    config = config or {}
    gates: List[dict] = []

    custom_gantries = config.get("custom_gantry_positions") or config.get("customGantryPositionsKm") or []
    if custom_gantries:
        for index, gate_km in enumerate(custom_gantries, start=1):
            position_km = _safe_float(gate_km, 0.0)
            gates.append(
                {
                    "id": f"G{index:02d}",
                    "position_m": round(position_km * 1000, 3),
                    "position_km": round(position_km, 3),
                    "segment": index,
                }
            )
        return gates

    road_length_km = _safe_float(
        config.get("custom_road_length_km") or config.get("road_length_km") or config.get("roadLengthKm"),
        20.0,
    )
    segment_length_km = _safe_float(
        config.get("segment_length_km") or config.get("segmentLengthKm"),
        2.0,
    )
    if segment_length_km <= 0:
        segment_length_km = 2.0

    pos_km = segment_length_km
    segment = 1
    while pos_km < road_length_km:
        gates.append(
            {
                "id": f"G{segment:02d}",
                "position_m": round(pos_km * 1000, 3),
                "position_km": round(pos_km, 3),
                "segment": segment,
            }
        )
        pos_km += segment_length_km
        segment += 1

    return gates


def _compute_polyline_length(points: List[List[float]]) -> float:
    total = 0.0
    for start, end in zip(points, points[1:]):
        total += math.dist(start, end)
    return total


def _load_custom_path_geometry(config: dict) -> Optional[dict]:
    custom_road_path = config.get("custom_road_path")
    if not custom_road_path:
        return None

    road_path = ROAD_MAP_DIR / custom_road_path
    if not road_path.exists():
        return None

    try:
        with open(road_path, "r", encoding="utf-8") as file:
            road_data = json.load(file)
    except (OSError, json.JSONDecodeError):
        return None

    raw_nodes = road_data.get("nodes", [])
    if len(raw_nodes) < 2:
        return None

    scale_m = _safe_float(road_data.get("meta", {}).get("scale_m_per_unit"), 1.0)
    polyline = []
    for node in raw_nodes:
        x = _safe_float(node.get("x"), 0.0) * scale_m
        y = _safe_float(node.get("y"), 0.0) * scale_m
        polyline.append([round(x, 3), round(y, 3)])

    lane_count = max(1, _safe_int(config.get("num_lanes"), 4))
    lane_width = _safe_float(config.get("lane_width"), 3.5)
    length_m = _compute_polyline_length(polyline)
    paths = []

    for lane in range(lane_count):
        paths.append(
            {
                "path_id": f"custom_lane_{lane}",
                "road_id": "custom_main",
                "lane_id": lane,
                "lane_offset_m": round((lane - (lane_count - 1) / 2.0) * lane_width, 3),
                "polyline": polyline,
                "length_m": round(length_m, 3),
            }
        )

    return {
        "version": "path_geometry_v1",
        "coordinate_system": "custom_meter",
        "source": custom_road_path,
        "paths": paths,
    }


def build_path_geometry(config: Optional[dict]) -> dict:
    """Build replay geometry for run history."""
    config = config or {}
    custom_geometry = _load_custom_path_geometry(config)
    if custom_geometry:
        return custom_geometry

    lane_count = max(1, _safe_int(config.get("num_lanes"), 4))
    lane_width = _safe_float(config.get("lane_width"), 3.5)
    road_length_km = _safe_float(
        config.get("custom_road_length_km") or config.get("road_length_km") or config.get("roadLengthKm"),
        20.0,
    )
    road_length_m = road_length_km * 1000

    paths = []
    for lane in range(lane_count):
        y = round(lane * lane_width + lane_width / 2.0, 3)
        paths.append(
            {
                "path_id": f"main_lane_{lane}",
                "road_id": "main",
                "lane_id": lane,
                "lane_offset_m": 0.0,
                "polyline": [[0.0, y], [round(road_length_m, 3), y]],
                "length_m": round(road_length_m, 3),
            }
        )

    return {
        "version": "path_geometry_v1",
        "coordinate_system": "local_meter",
        "source": "generated_straight_road",
        "paths": paths,
    }


def build_run_summary(simulation_id: str, results_data: dict) -> dict:
    """Build summary payload persisted beside a run."""
    config = results_data.get("config", {})
    statistics = results_data.get("statistics", {})
    ml_dataset = results_data.get("ml_dataset", {})

    return {
        "run_id": simulation_id,
        "schema_version": RUN_SCHEMA_VERSION,
        "created_at": datetime.utcnow().isoformat(),
        "status": results_data.get("status", "completed"),
        "config_digest": {
            "road_length_km": config.get("custom_road_length_km") or config.get("road_length_km"),
            "num_lanes": config.get("num_lanes"),
            "total_vehicles": config.get("total_vehicles"),
            "simulation_dt": config.get("simulation_dt"),
            "trajectory_sample_interval": config.get("trajectory_sample_interval"),
            "custom_road_path": config.get("custom_road_path"),
        },
        "summary": {
            "total_vehicles": statistics.get("total_vehicles", 0),
            "total_anomalies": statistics.get("total_anomalies", 0),
            "simulation_time": statistics.get("simulation_time", 0),
            "etc_alerts_count": statistics.get("etc_alerts_count", 0),
            "etc_transactions_count": statistics.get("etc_transactions_count", 0),
            "ml_samples": len(ml_dataset.get("samples", [])) if isinstance(ml_dataset, dict) else 0,
            "queue_event_count": len(results_data.get("queue_events", [])),
            "phantom_jam_event_count": len(results_data.get("phantom_jam_events", [])),
        },
    }


def build_run_manifest(simulation_id: str, results_data: dict) -> dict:
    """Build manifest payload for replay and analysis discovery."""
    config = results_data.get("config", {})
    summary = build_run_summary(simulation_id, results_data)
    trajectory_info = results_data.get("_trajectory_info", {})
    gates = results_data.get("etcGates") or build_gate_descriptors(config)
    path_geometry = build_path_geometry(config)

    artifacts = {
        "data": DATA_FILENAME,
        "summary": SUMMARY_FILENAME,
        "manifest": MANIFEST_FILENAME,
    }
    if trajectory_info:
        artifacts["trajectory"] = trajectory_info.get("file", "trajectory.msgpack")

    chunks = {"trajectory": [], "metrics": [], "events": []}
    if trajectory_info:
        chunks["trajectory"].append(
            {
                "chunk_id": "trajectory_full",
                "file": trajectory_info.get("file", "trajectory.msgpack"),
                "format": trajectory_info.get("format", "msgpack"),
                "record_count": trajectory_info.get("record_count", 0),
            }
        )

    return {
        "run_id": simulation_id,
        "schema_version": RUN_SCHEMA_VERSION,
        "created_at": summary["created_at"],
        "artifacts": artifacts,
        "config": config,
        "summary": summary["summary"],
        "road_geometry": {
            "gates": gates,
            "path_geometry": path_geometry,
        },
        "sampling": {
            "trajectory_interval_s": config.get("trajectory_sample_interval", 2),
            "metrics_interval_s": 1,
        },
        "chunks": chunks,
    }


def persist_run_metadata(sim_dir: Path, simulation_id: str, results_data: dict) -> dict:
    """Persist summary and manifest beside the primary run data."""
    summary = build_run_summary(simulation_id, results_data)
    manifest = build_run_manifest(simulation_id, results_data)

    with open(sim_dir / SUMMARY_FILENAME, "w", encoding="utf-8") as file:
        json.dump(summary, file, indent=2, ensure_ascii=False)
    with open(sim_dir / MANIFEST_FILENAME, "w", encoding="utf-8") as file:
        json.dump(manifest, file, indent=2, ensure_ascii=False)

    return {"summary": summary, "manifest": manifest}


def resolve_run_dir(simulations_dir: Path, run_id: str) -> Path:
    """Resolve a run directory while keeping the path inside the simulations root."""
    run_dir = (simulations_dir / run_id).resolve()
    if not str(run_dir).startswith(str(simulations_dir.resolve())):
        raise ValueError("Run path escapes simulations directory")
    return run_dir


def load_json_file(path: Path) -> Optional[dict]:
    if not path.exists():
        return None
    try:
        with open(path, "r", encoding="utf-8") as file:
            return json.load(file)
    except (OSError, json.JSONDecodeError):
        return None


def load_run_manifest(run_dir: Path) -> Optional[dict]:
    return load_json_file(run_dir / MANIFEST_FILENAME)


def load_run_summary(run_dir: Path) -> Optional[dict]:
    summary = load_json_file(run_dir / SUMMARY_FILENAME)
    if summary:
        return summary

    data = load_json_file(run_dir / DATA_FILENAME)
    if not data:
        return None

    return build_run_summary(run_dir.name, data)


def list_runs(simulations_dir: Path) -> List[dict]:
    """List stored runs using summary and manifest when available."""
    if not simulations_dir.exists():
        return []

    runs: List[dict] = []
    for run_dir in sorted(simulations_dir.iterdir(), reverse=True):
        if not run_dir.is_dir():
            continue

        summary = load_run_summary(run_dir)
        manifest = load_run_manifest(run_dir)
        if not summary:
            continue

        stat = run_dir.stat()
        runs.append(
            {
                "run_id": run_dir.name,
                "name": run_dir.name,
                "path": run_dir.name,
                "schema_version": summary.get("schema_version", RUN_SCHEMA_VERSION),
                "created_at": summary.get("created_at"),
                "modified": stat.st_mtime,
                "status": summary.get("status", "completed"),
                "summary": summary.get("summary", {}),
                "config_digest": summary.get("config_digest", {}),
                "artifacts": manifest.get("artifacts", {}) if manifest else {},
            }
        )

    return runs
