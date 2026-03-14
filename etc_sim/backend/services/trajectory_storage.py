"""
Trajectory storage abstraction.

Supports:
- v3 msgpack frame storage with path registry
- JSON fallback
- backward-compatible loading from legacy data.json trajectory_data
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Optional

try:
    import msgpack
except ImportError:
    msgpack = None

logger = logging.getLogger(__name__)

_ANOMALY_STATE_ENCODE = {
    "normal": 0,
    "triggered": 1,
    "active": 2,
    "resolved": 3,
}
_ANOMALY_STATE_DECODE = {value: key for key, value in _ANOMALY_STATE_ENCODE.items()}


def _encode_flags(is_affected: bool, anomaly_state: str) -> int:
    state_code = _ANOMALY_STATE_ENCODE.get(anomaly_state, 0)
    return (state_code << 1) | (1 if is_affected else 0)


def _decode_flags(flags: int) -> dict:
    is_affected = bool(flags & 1)
    state_code = (flags >> 1) & 0x3
    anomaly_state = _ANOMALY_STATE_DECODE.get(state_code, "normal")
    return {"is_affected": is_affected, "anomaly_state": anomaly_state}


class TrajectoryStorage:
    """Read/write helper for trajectory history."""

    MSGPACK_FILENAME = "trajectory.msgpack"
    DATA_JSON_FILENAME = "data.json"
    CURRENT_VERSION = 3

    @staticmethod
    def save(
        sim_dir: str,
        trajectory_data: list,
        vehicle_meta: Optional[dict] = None,
        config: Optional[dict] = None,
    ):
        if msgpack is None:
            logger.warning("msgpack not installed, falling back to JSON trajectory storage")
            TrajectoryStorage._save_json_fallback(sim_dir, trajectory_data, config=config)
            return

        os.makedirs(sim_dir, exist_ok=True)
        filepath = os.path.join(sim_dir, TrajectoryStorage.MSGPACK_FILENAME)

        if (
            trajectory_data
            and isinstance(trajectory_data, list)
            and isinstance(trajectory_data[0], dict)
            and "t" in trajectory_data[0]
        ):
            frames = trajectory_data
            meta = vehicle_meta or {}
            path_registry = TrajectoryStorage._build_path_registry(config, trajectory_data)
        else:
            frames, meta, path_registry = TrajectoryStorage._flat_to_frames(trajectory_data, config=config)
            if vehicle_meta:
                meta.update(vehicle_meta)

        payload = {
            "version": TrajectoryStorage.CURRENT_VERSION,
            "config": config or {},
            "vehicle_meta": meta,
            "path_registry": path_registry,
            "frames": frames,
        }

        with open(filepath, "wb") as file:
            msgpack.pack(payload, file, use_bin_type=True)

        total_records = sum(len(frame.get("v", [])) for frame in frames)
        logger.info(
            "Trajectory saved to %s (%s frames, %s records, %.1f KB)",
            filepath,
            len(frames),
            total_records,
            os.path.getsize(filepath) / 1024,
        )

    @staticmethod
    def _save_json_fallback(sim_dir: str, trajectory_data: list, config: Optional[dict] = None):
        filepath = os.path.join(sim_dir, "trajectory.json")
        frames, meta, path_registry = TrajectoryStorage._flat_to_frames(trajectory_data, config=config)
        payload = {
            "version": TrajectoryStorage.CURRENT_VERSION,
            "config": config or {},
            "vehicle_meta": meta,
            "path_registry": path_registry,
            "frames": frames,
        }
        with open(filepath, "w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False)
        logger.info("Trajectory saved using JSON fallback: %s", filepath)

    @staticmethod
    def _build_path_registry(config: Optional[dict], flat_data: Optional[list] = None) -> dict:
        config = config or {}
        lane_count = config.get("num_lanes") or config.get("numLanes")
        if lane_count is None and flat_data:
            lanes = [point.get("lane", 0) for point in flat_data if isinstance(point, dict)]
            lane_count = max(lanes) + 1 if lanes else 4
        try:
            lane_count = max(int(lane_count or 4), 1)
        except (TypeError, ValueError):
            lane_count = 4

        prefix = "custom_lane" if config.get("custom_road_path") else "main_lane"
        return {str(code): f"{prefix}_{code}" for code in range(lane_count)}

    @staticmethod
    def _flat_to_frames(flat_data: list, config: Optional[dict] = None) -> tuple:
        from collections import defaultdict

        time_groups = defaultdict(list)
        vehicle_meta = {}
        path_registry = TrajectoryStorage._build_path_registry(config, flat_data)

        for point in flat_data:
            t = point.get("time", 0)
            vid = point.get("id", 0)
            lane = point.get("lane", 0)

            vid_str = str(vid)
            if vid_str not in vehicle_meta:
                vehicle_meta[vid_str] = {
                    "type": point.get("vehicle_type", point.get("type", "CAR")),
                    "style": point.get("driver_style", point.get("style", "normal")),
                }

            flags = _encode_flags(
                point.get("is_affected", False),
                point.get("anomaly_state", "normal"),
            )
            pos = round(point.get("pos", 0), 1)
            speed = round(point.get("speed", 0), 1)
            anomaly_type = point.get("anomaly_type", 0)

            path_id = point.get("path_id") or path_registry.get(str(lane), f"main_lane_{lane}")
            path_code = lane
            for code, registry_path_id in path_registry.items():
                if registry_path_id == path_id:
                    path_code = int(code)
                    break

            time_groups[t].append([vid, pos, lane, speed, anomaly_type, flags, path_code])

        frames = [{"t": t, "v": time_groups[t]} for t in sorted(time_groups.keys())]
        return frames, vehicle_meta, path_registry

    @staticmethod
    def load(sim_dir: str) -> Optional[dict]:
        sim_path = Path(sim_dir)

        msgpack_file = sim_path / TrajectoryStorage.MSGPACK_FILENAME
        if msgpack_file.exists() and msgpack is not None:
            try:
                with open(msgpack_file, "rb") as file:
                    return msgpack.unpack(file, raw=False)
            except Exception as exc:
                logger.warning("Failed to load trajectory msgpack: %s", exc)

        json_traj_file = sim_path / "trajectory.json"
        if json_traj_file.exists():
            try:
                with open(json_traj_file, "r", encoding="utf-8") as file:
                    return json.load(file)
            except Exception as exc:
                logger.warning("Failed to load trajectory JSON fallback: %s", exc)

        data_json_file = sim_path / TrajectoryStorage.DATA_JSON_FILENAME
        if data_json_file.exists():
            try:
                with open(data_json_file, "r", encoding="utf-8") as file:
                    data = json.load(file)
                flat_traj = data.get("trajectory_data", [])
                if flat_traj:
                    frames, meta, path_registry = TrajectoryStorage._flat_to_frames(
                        flat_traj,
                        data.get("config", {}),
                    )
                    return {
                        "version": 1,
                        "frames": frames,
                        "vehicle_meta": meta,
                        "path_registry": path_registry,
                        "config": data.get("config", {}),
                    }
            except Exception as exc:
                logger.warning("Failed to load legacy trajectory data from data.json: %s", exc)

        return None

    @staticmethod
    def to_flat_trajectory(frames_data: dict) -> list:
        if not frames_data:
            return []

        frames = frames_data.get("frames", [])
        vehicle_meta = frames_data.get("vehicle_meta", {})
        path_registry = frames_data.get("path_registry", {})
        result = []

        for frame in frames:
            t = frame.get("t", 0)
            for vehicle_arr in frame.get("v", []):
                vid = vehicle_arr[0]
                pos = vehicle_arr[1]
                lane = vehicle_arr[2]
                speed = vehicle_arr[3]
                anomaly_type = vehicle_arr[4] if len(vehicle_arr) > 4 else 0
                flags = vehicle_arr[5] if len(vehicle_arr) > 5 else 0
                path_code = vehicle_arr[6] if len(vehicle_arr) > 6 else lane

                decoded = _decode_flags(flags)
                vid_str = str(vid)
                meta = vehicle_meta.get(vid_str, {})
                path_id = path_registry.get(str(path_code), f"main_lane_{lane}")

                result.append(
                    {
                        "id": vid,
                        "time": t,
                        "pos": pos,
                        "lane": lane,
                        "speed": speed,
                        "anomaly_type": anomaly_type,
                        "anomaly_state": decoded["anomaly_state"],
                        "is_affected": decoded["is_affected"],
                        "vehicle_type": meta.get("type", "CAR"),
                        "driver_style": meta.get("style", "normal"),
                        "path_id": path_id,
                    }
                )

        return result

    @staticmethod
    def get_record_count(sim_dir: str) -> int:
        sim_path = Path(sim_dir)

        msgpack_file = sim_path / TrajectoryStorage.MSGPACK_FILENAME
        if msgpack_file.exists() and msgpack is not None:
            try:
                with open(msgpack_file, "rb") as file:
                    data = msgpack.unpack(file, raw=False)
                return sum(len(frame.get("v", [])) for frame in data.get("frames", []))
            except Exception:
                pass

        json_traj_file = sim_path / "trajectory.json"
        if json_traj_file.exists():
            try:
                with open(json_traj_file, "r", encoding="utf-8") as file:
                    data = json.load(file)
                return sum(len(frame.get("v", [])) for frame in data.get("frames", []))
            except Exception:
                pass

        data_json_file = sim_path / TrajectoryStorage.DATA_JSON_FILENAME
        if data_json_file.exists():
            try:
                with open(data_json_file, "r", encoding="utf-8") as file:
                    data = json.load(file)
                return len(data.get("trajectory_data", []))
            except Exception:
                pass

        return 0

    @staticmethod
    def exists(sim_dir: str) -> bool:
        sim_path = Path(sim_dir)
        return (
            (sim_path / TrajectoryStorage.MSGPACK_FILENAME).exists()
            or (sim_path / "trajectory.json").exists()
            or (sim_path / TrajectoryStorage.DATA_JSON_FILENAME).exists()
        )
