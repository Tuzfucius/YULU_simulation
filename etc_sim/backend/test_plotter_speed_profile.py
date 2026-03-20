import os
import sys


sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from plotter import ChartGenerator


def _make_vehicle(vehicle_id, travel_time, vehicle_type='CAR', was_affected=False, anomaly_type=0):
    return {
        'id': vehicle_id,
        'vehicle_type': vehicle_type,
        'anomaly_type': anomaly_type,
        'was_affected': was_affected,
        'desired_speed': 100 / 3.6,
        'logs': {
            '0': {'in': 0, 'out': travel_time}
        }
    }


def test_segment_impact_score_ignores_permanent_was_affected_flag(tmp_path):
    plotter = ChartGenerator(output_dir=str(tmp_path))
    finished_vehicles = [
        _make_vehicle(1, 100),
        _make_vehicle(2, 102),
        _make_vehicle(3, 104),
    ]
    baselines = plotter._build_segment_travel_time_baselines(finished_vehicles, 1)

    near_baseline_vehicle = _make_vehicle(9, 106, was_affected=True)
    score = plotter._compute_segment_impact_score(
        near_baseline_vehicle,
        0,
        near_baseline_vehicle['logs']['0'],
        baselines,
        2.5,
    )

    assert score == 0.0


def test_segment_impact_score_grows_linearly_with_excess_delay(tmp_path):
    plotter = ChartGenerator(output_dir=str(tmp_path))
    finished_vehicles = [
        _make_vehicle(1, 100),
        _make_vehicle(2, 100),
        _make_vehicle(3, 100),
    ]
    baselines = plotter._build_segment_travel_time_baselines(finished_vehicles, 1)

    mild_vehicle = _make_vehicle(10, 120)
    severe_vehicle = _make_vehicle(11, 180)

    mild_score = plotter._compute_segment_impact_score(
        mild_vehicle,
        0,
        mild_vehicle['logs']['0'],
        baselines,
        2.5,
    )
    severe_score = plotter._compute_segment_impact_score(
        severe_vehicle,
        0,
        severe_vehicle['logs']['0'],
        baselines,
        2.5,
    )

    assert 0.0 < mild_score < severe_score < 1.0
