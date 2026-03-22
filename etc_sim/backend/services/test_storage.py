import copy
import json

from etc_sim.backend.services.storage import StorageService


def test_save_results_does_not_mutate_input(tmp_path):
    service = StorageService(base_dir=str(tmp_path))
    results = {
        "config": {"num_lanes": 2},
        "statistics": {"total_vehicles": 1},
        "trajectory_data": [
            {"time": 0, "id": 1, "pos": 0.0, "lane": 0, "speed": 1.0},
        ],
    }
    original = copy.deepcopy(results)

    service.save_results("run_001", results)

    assert results == original
    assert "_metadata" not in results
    assert "trajectory_data" in results


def test_save_results_persists_workflow_snapshot_to_data_and_manifest(tmp_path):
    service = StorageService(base_dir=str(tmp_path))
    workflow_snapshot = {
        "requested_workflow_name": "runtime_flow",
        "workflow_name": "runtime_flow",
        "source": "workflow_file",
        "workflow_file_name": "runtime_flow.json",
        "workflow_path": "C:/workflows/runtime_flow.json",
        "saved_at": "2026-03-22T10:00:00",
        "parsed_at": "2026-03-22T10:00:01",
        "rule_count": 1,
        "rules": [{"name": "Rule-1"}],
    }
    results = {
        "config": {"num_lanes": 2},
        "statistics": {"total_vehicles": 1},
        "trajectory_data": [
            {"time": 0, "id": 1, "pos": 0.0, "lane": 0, "speed": 1.0},
        ],
        "workflow_snapshot": workflow_snapshot,
    }

    service.save_results("run_002", results)

    run_dir = tmp_path / "simulations" / "run_002"
    data = json.loads((run_dir / "data.json").read_text(encoding="utf-8"))
    manifest = json.loads((run_dir / "manifest.json").read_text(encoding="utf-8"))

    assert data["_metadata"]["workflow_snapshot"] == workflow_snapshot
    assert manifest["workflow_snapshot"] == workflow_snapshot
