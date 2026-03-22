import copy

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
