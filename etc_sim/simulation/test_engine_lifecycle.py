import unittest

from etc_sim.config.parameters import SimulationConfig
from etc_sim.road.network import RoadNetwork
from etc_sim.simulation.engine import SimulationEngine, SimulationStepStatus


class SimulationEngineLifecycleTests(unittest.TestCase):
    def test_gate_ids_are_stable_and_serialized(self):
        network = RoadNetwork()
        network.add_etc_gate("main", 2.0, gate_id="G02")
        self.assertEqual(network.etc_gates[0].gate_id, "G02")
        self.assertEqual(network.to_dict()["etc_gates"][0]["gate_id"], "G02")

    def test_duplicate_gate_id_is_rejected(self):
        network = RoadNetwork()
        network.add_etc_gate("main", 2.0, gate_id="G02")
        with self.assertRaises(ValueError):
            network.add_etc_gate("main", 4.0, gate_id="G02")

    def test_step_reports_time_limit_and_stop(self):
        config = SimulationConfig.from_internal(
            total_vehicles=0,
            max_simulation_time=1,
            global_anomaly_start=0,
        )
        engine = SimulationEngine(config)
        self.assertEqual(engine.step(), SimulationStepStatus.TIME_LIMIT_REACHED)
        engine.stop()
        self.assertEqual(engine.step(), SimulationStepStatus.STOPPED)

    def test_sampling_uses_the_first_actual_tick_after_deadline(self):
        config = SimulationConfig.from_internal(
            total_vehicles=0,
            simulation_dt=0.6,
            trajectory_sample_interval=1,
            max_simulation_time=10,
            global_anomaly_start=0,
        )
        engine = SimulationEngine(config)
        engine.spawn_schedule = [100.0]

        engine.step()  # tick 0.0 samples and schedules the 1.0 deadline
        engine.step()  # tick 0.6 does not reach it
        engine.step()  # tick 1.2 is the first actual tick after it

        self.assertEqual(engine._next_sample_time, 2.0)


if __name__ == "__main__":
    unittest.main()
