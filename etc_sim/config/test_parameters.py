"""Regression tests for the canonical simulation configuration."""

import tempfile
import unittest
from pathlib import Path

from pydantic import ValidationError

from etc_sim.backend.models.schemas import SimulationConfig as ApiSimulationConfig
from etc_sim.config import DEFAULT_CONFIG, SimulationConfig, load_config
from etc_sim.simulation.engine import SimulationEngine


class CanonicalConfigTests(unittest.TestCase):
    def test_api_and_core_import_the_same_config_class(self):
        self.assertIs(ApiSimulationConfig, SimulationConfig)
        self.assertIsInstance(DEFAULT_CONFIG, SimulationConfig)

    def test_default_config_contains_engine_required_fields(self):
        self.assertEqual(DEFAULT_CONFIG.road_length_km, 20.0)
        self.assertEqual(DEFAULT_CONFIG.segment_length_km, 2.0)
        self.assertEqual(DEFAULT_CONFIG.trajectory_sample_interval, 2.0)
        self.assertEqual(DEFAULT_CONFIG.random_seed, 42)

        engine = SimulationEngine(
            DEFAULT_CONFIG.model_copy(
                update={"total_vehicles": 1, "max_simulation_time": 10.0}
            )
        )
        engine.step()

    def test_accepts_frontend_camel_case_payload(self):
        config = SimulationConfig.model_validate(
            {
                "roadLengthKm": 30,
                "etcGateIntervalKm": 3,
                "numLanes": 3,
                "totalVehicles": 50,
                "simulationDt": 0.5,
                "trajectorySampleInterval": 1.0,
                "maxSimulationTime": 1200,
                "customGantryPositionsKm": [5, 15, 25],
                "randomSeed": 7,
                "frontendOnlyExperiment": True,
            }
        )

        self.assertEqual(config.road_length_km, 30)
        self.assertEqual(config.segment_length_km, 3)
        self.assertEqual(config.num_lanes, 3)
        self.assertEqual(config.custom_gantry_positions, [5, 15, 25])
        self.assertEqual(config.random_seed, 7)

    def test_accepts_legacy_nested_api_payload(self):
        config = SimulationConfig.model_validate(
            {
                "road": {
                    "road_length_km": 12,
                    "segment_length_km": 1,
                    "num_lanes": 2,
                    "lane_width": 3.5,
                },
                "vehicle": {
                    "total_vehicles": 100,
                    "anomaly_ratio": 0.02,
                    "vehicle_type_weights": {
                        "CAR": 0.7,
                        "TRUCK": 0.2,
                        "BUS": 0.1,
                    },
                },
                "simulation": {
                    "simulation_dt": 0.5,
                    "max_simulation_time": 1800,
                },
                "anomaly": {
                    "global_anomaly_start": 100,
                    "vehicle_safe_run_time": 60,
                    "impact_discover_dist": 120,
                },
                "lane_change": {
                    "lane_change_gap": 30,
                    "lane_change_steps": 6,
                },
                "impact": {
                    "impact_threshold": 0.8,
                    "slowdown_ratio": 0.75,
                },
                "etc": {"etc_gate_interval_km": 1},
            }
        )

        self.assertEqual(config.road_length_km, 12)
        self.assertEqual(config.total_vehicles, 100)
        self.assertEqual(config.lane_change_steps, 6)
        self.assertEqual(config.slowdown_ratio, 0.75)

    def test_rejects_invalid_cross_field_values(self):
        with self.assertRaises(ValidationError):
            SimulationConfig(road_length_km=10, segment_length_km=20)

        with self.assertRaises(ValidationError):
            SimulationConfig(simulation_dt=2, trajectory_sample_interval=1)

        with self.assertRaises(ValidationError):
            SimulationConfig(
                road_length_km=10,
                custom_gantry_positions=[7, 3],
            )

    def test_json_round_trip_uses_canonical_snake_case(self):
        config = SimulationConfig(total_vehicles=25, random_seed=123)

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config.json"
            config.to_json(path)
            loaded = load_config(path)

        self.assertEqual(loaded, config)
        self.assertIn("trajectory_sample_interval", config.to_dict())
        self.assertNotIn("trajectorySampleInterval", config.to_dict())


if __name__ == "__main__":
    unittest.main()
