"""Regression tests for simulation lifecycle and sampling behavior."""

import unittest

from etc_sim.config import SimulationConfig
from etc_sim.simulation.engine import SimulationEngine, SimulationStepStatus


class EngineTerminationTests(unittest.TestCase):
    def test_step_at_exact_time_limit_returns_terminal_status(self):
        config = SimulationConfig(
            total_vehicles=1,
            simulation_dt=1.0,
            trajectory_sample_interval=1.0,
            max_simulation_time=10.0,
        )
        engine = SimulationEngine(config)
        engine.current_time = 10.0

        status = engine.step()

        self.assertIs(status, SimulationStepStatus.TIME_LIMIT_REACHED)
        self.assertEqual(engine.current_time, 10.0)

    def test_run_exits_when_time_limit_is_an_exact_step_multiple(self):
        config = SimulationConfig(
            total_vehicles=1,
            simulation_dt=1.0,
            trajectory_sample_interval=1.0,
            max_simulation_time=1.0,
        )
        engine = SimulationEngine(config)

        status = engine.run()

        self.assertIs(status, SimulationStepStatus.TIME_LIMIT_REACHED)
        self.assertEqual(engine.current_time, 1.0)

    def test_empty_schedule_finishes_without_advancing_time(self):
        config = SimulationConfig(
            total_vehicles=1,
            simulation_dt=1.0,
            trajectory_sample_interval=1.0,
            max_simulation_time=10.0,
        )
        engine = SimulationEngine(config)
        engine.spawn_schedule = []
        engine.spawn_idx = 0

        status = engine.step()

        self.assertIs(status, SimulationStepStatus.COMPLETED)
        self.assertEqual(engine.current_time, 0.0)


class SamplingClockTests(unittest.TestCase):
    def test_sampling_occurs_once_per_deadline(self):
        config = SimulationConfig(
            total_vehicles=1,
            simulation_dt=0.25,
            trajectory_sample_interval=1.0,
            max_simulation_time=10.0,
        )
        engine = SimulationEngine(config)

        observed = []
        for current_time in (0.0, 0.25, 0.5, 0.75, 1.0, 1.25):
            engine.current_time = current_time
            observed.append(engine._consume_sample_due())

        self.assertEqual(observed, [True, False, False, False, True, False])

    def test_fractional_sampling_interval_is_not_lost_to_float_rounding(self):
        config = SimulationConfig(
            total_vehicles=1,
            simulation_dt=0.1,
            trajectory_sample_interval=0.3,
            max_simulation_time=10.0,
        )
        engine = SimulationEngine(config)

        observed = []
        for current_time in (0.0, 0.1, 0.2, 0.30000000000000004, 0.4):
            engine.current_time = current_time
            observed.append(engine._consume_sample_due())

        self.assertEqual(observed, [True, False, False, True, False])


if __name__ == "__main__":
    unittest.main()
