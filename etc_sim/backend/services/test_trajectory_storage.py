import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.services.trajectory_storage import TrajectoryStorage


def test_json_fallback_creates_missing_directory(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.services.trajectory_storage.msgpack", None)

    sim_dir = tmp_path / "nested" / "run_001"
    TrajectoryStorage.save(str(sim_dir), [{"id": 1, "time": 0, "lane": 0, "pos": 10.2, "speed": 18.7}])

    output = sim_dir / "trajectory.json"
    assert output.exists()

    payload = json.loads(output.read_text(encoding="utf-8"))
    assert payload["version"] == TrajectoryStorage.CURRENT_VERSION
    assert payload["frames"][0]["v"][0][0] == 1


def test_flat_to_frames_path_code_uses_registry_direct_lookup():
    flat_data = [
        {"id": 1, "time": 0, "lane": 0, "path_id": "custom_lane_2", "pos": 10, "speed": 20},
        {"id": 2, "time": 0, "lane": 1, "path_id": "custom_lane_9", "pos": 11, "speed": 21},
    ]
    config = {"num_lanes": 3, "custom_road_path": "demo"}

    frames, _, path_registry = TrajectoryStorage._flat_to_frames(flat_data, config)

    assert path_registry == {"0": "custom_lane_0", "1": "custom_lane_1", "2": "custom_lane_2"}
    vehicle_rows = frames[0]["v"]
    assert vehicle_rows[0][6] == 2
    assert vehicle_rows[1][6] == 1
