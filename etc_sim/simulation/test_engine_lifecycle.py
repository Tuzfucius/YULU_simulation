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
        config = SimulationConfig(total_vehicles=0, max_simulation_time=1)
        engine = SimulationEngine(config)
        self.assertEqual(engine.step(), SimulationStepStatus.TIME_LIMIT_REACHED)
        engine.stop()
        self.assertEqual(engine.step(), SimulationStepStatus.STOPPED)


if __name__ == "__main__":
    unittest.main()
