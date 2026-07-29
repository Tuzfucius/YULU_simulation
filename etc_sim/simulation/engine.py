"""Python traffic simulation engine."""

import logging
import random
from collections import defaultdict
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional

from ..config.parameters import SimulationConfig
from ..core.vehicle import Vehicle
from ..models.alert_context import AlertContext
from ..models.alert_evaluator import extract_ground_truths_from_engine
from ..models.alert_rules import AlertRule, AlertRuleEngine, create_default_rules
from ..models.environment import EnvironmentModel
from ..models.etc_anomaly_detector import ETCAnomalyDetector, ETCTransaction
from ..models.etc_noise_simulator import ETCNoiseSimulator
from ..models.ml_feature_extractor import TimeSeriesFeatureExtractor
from ..models.phantom_jam import PhantomJamDetector
from ..road.network import RoadNetwork
from ..simulation.spawner import VehicleSpawner
from ..utils.spatial_index import SpatialIndex

logger = logging.getLogger(__name__)


class SimulationStepStatus(str, Enum):
    """Result of one simulation step."""

    RUNNING = "running"
    COMPLETED = "completed"
    TIME_LIMIT_REACHED = "time_limit_reached"


@dataclass
class SimulationResult:
    """In-memory simulation result collections."""

    finished_vehicles: List[Vehicle]
    anomaly_logs: List[Dict]
    trajectory_data: List[Dict]
    segment_speed_history: List[Dict]
    queue_events: List[Dict]
    phantom_jam_events: List[Dict]
    safety_data: List[Dict]


class SimulationEngine:
    """Coordinate vehicle spawning, movement, detection and result collection."""

    def __init__(
        self,
        config: Optional[SimulationConfig] = None,
        custom_rules: Optional[List[Dict]] = None,
    ):
        self.config = config
        self.road_network = RoadNetwork(
            road_length_km=config.road_length_km if config else 20.0,
            num_lanes=config.num_lanes if config else 4,
        )
        self.spawner = VehicleSpawner(
            total_vehicles=config.total_vehicles if config else 1200,
            num_lanes=config.num_lanes if config else 4,
        )

        self.spatial_index = SpatialIndex(
            road_length_km=config.road_length_km if config else 20.0,
            num_lanes=config.num_lanes if config else 4,
            cell_size=100.0,
        )

        self.etc_detector = ETCAnomalyDetector()
        self.etc_alerts: List[Dict] = []

        self.etc_noise_simulator = ETCNoiseSimulator()
        self.etc_noise_events: List[Dict] = []

        self.environment = EnvironmentModel()

        self.alert_rule_engine = AlertRuleEngine()
        if custom_rules is not None:
            for rule_data in custom_rules:
                try:
                    rule = AlertRule.from_dict(rule_data)
                    self.alert_rule_engine.add_rule(rule)
                except Exception as exc:
                    logger.error("加载自定义规则失败: %s, data=%s", exc, rule_data)
            logger.info("已加载 %d 条自定义规则", len(self.alert_rule_engine.rules))
        else:
            for rule in create_default_rules():
                self.alert_rule_engine.add_rule(rule)
        self.rule_engine_events: List[Dict] = []

        self.vehicles: List[Vehicle] = []
        self.finished_vehicles: List[Vehicle] = []
        self.anomaly_logs: List[Dict] = []
        self.trajectory_data: List[Dict] = []
        self.segment_speed_history: List[Dict] = []
        self.queue_events: List[Dict] = []
        self.phantom_jam_events: List[Dict] = []
        self.safety_data: List[Dict] = []

        self.current_time = 0.0
        self.vehicle_id_counter = 0
        self.etc_gates: List[Dict[str, Any]] = []

        self.spawn_schedule = self.spawner.get_spawn_times()
        self.spawn_idx = 0

        self._next_sample_time = 0.0

        self._init_etc_gates()

    def _init_etc_gates(self) -> None:
        """Initialize ETC gates using custom or regular spacing."""
        self.etc_gates.clear()
        self.road_network.etc_gates.clear()
        used_gate_ids = set()

        def _make_gate_id(position_km: float) -> str:
            base_id = f"G{int(round(position_km)):02d}"
            if abs(position_km - round(position_km)) < 1e-6 and base_id not in used_gate_ids:
                return base_id

            suffix = 1
            candidate = f"{base_id}_{suffix}"
            while candidate in used_gate_ids:
                suffix += 1
                candidate = f"{base_id}_{suffix}"
            return candidate

        def _register_gate(position_km: float, segment_idx: int) -> None:
            gate_position_km = float(position_km)
            gate_id = _make_gate_id(gate_position_km)
            used_gate_ids.add(gate_id)
            self.road_network.add_etc_gate("main", gate_position_km, gate_id=gate_id)
            self.etc_gates.append(
                {
                    "gate_id": gate_id,
                    "segment": segment_idx,
                    "position_km": gate_position_km,
                    "position_m": gate_position_km * 1000.0,
                }
            )

        if self.config and self.config.custom_gantry_positions:
            for segment_idx, gate_km in enumerate(
                self.config.custom_gantry_positions,
                start=1,
            ):
                _register_gate(gate_km, segment_idx)
        else:
            road_length = self.config.road_length_km if self.config else 20.0
            segment_length = self.config.segment_length_km if self.config else 2.0
            position = segment_length
            segment_idx = 1
            while position < road_length:
                _register_gate(float(position), segment_idx)
                position += segment_length
                segment_idx += 1

    def _resolve_queue_gate_id(self, queue_state: Dict) -> str:
        """Map a queue state to the nearest stable gate identifier."""
        if not self.etc_gates:
            return "queue"

        queue_start = queue_state.get("queue_start")
        if queue_start is None:
            return str(self.etc_gates[0]["gate_id"])

        nearest_gate = min(
            self.etc_gates,
            key=lambda gate: abs(float(gate["position_m"]) - float(queue_start)),
        )
        return str(nearest_gate["gate_id"])

    def _process_etc_transaction(
        self,
        vehicle: Vehicle,
        gate_id: str,
        gate_position_km: float,
    ) -> None:
        """Apply noise and anomaly detection to one ETC gate crossing."""
        self.etc_detector.register_gate(gate_id, gate_position_km)

        raw_transaction = {
            "vehicle_id": vehicle.id,
            "gate_id": gate_id,
            "gate_position_km": gate_position_km,
            "timestamp": self.current_time,
            "lane": vehicle.lane,
            "speed": vehicle.speed,
            "status": "anomaly" if vehicle.anomaly_state == "active" else "normal",
        }

        noisy_transactions, noise_events = self.etc_noise_simulator.process(raw_transaction)

        for event in noise_events:
            self.etc_noise_events.append(
                {
                    "type": event.noise_type.value,
                    "vehicle_id": event.vehicle_id,
                    "gate_id": event.gate_id,
                    "original_timestamp": event.original_timestamp,
                    "modified_timestamp": event.modified_timestamp,
                    "is_dropped": event.is_dropped,
                    "description": event.description,
                }
            )

        for transaction_data in noisy_transactions:
            transaction = ETCTransaction(
                vehicle_id=transaction_data["vehicle_id"],
                gate_id=transaction_data["gate_id"],
                gate_position_km=transaction_data["gate_position_km"],
                timestamp=transaction_data["timestamp"],
                lane=transaction_data["lane"],
                speed=transaction_data["speed"],
                status=transaction_data["status"],
            )

            alert = self.etc_detector.record_transaction(transaction)
            if alert:
                self.etc_alerts.append(
                    {
                        "type": alert.alert_type,
                        "severity": alert.severity,
                        "gate_id": alert.gate_id,
                        "position_km": alert.position_km,
                        "timestamp": alert.timestamp,
                        "description": alert.description,
                        "confidence": alert.confidence,
                    }
                )

        if vehicle.anomaly_state == "active" and not vehicle.detected_by_etc:
            vehicle.detected_by_etc = True
            if vehicle.anomaly_trigger_time is not None:
                vehicle.etc_detection_time = self.current_time - vehicle.anomaly_trigger_time

    def add_output(self, output_handler) -> None:
        """Reserved extension point for external output handlers."""
        del output_handler

    def _consume_sample_due(self) -> bool:
        """Return true once when the configured sampling deadline is reached."""
        sample_interval = float(
            self.config.trajectory_sample_interval if self.config else 2.0
        )
        epsilon = max(1e-9, sample_interval * 1e-9)

        if self.current_time + epsilon < self._next_sample_time:
            return False

        while self._next_sample_time <= self.current_time + epsilon:
            self._next_sample_time += sample_interval
        return True

    def step(self) -> SimulationStepStatus:
        """Advance the simulation by one time step and return its lifecycle state."""
        dt = float(self.config.simulation_dt if self.config else 1.0)
        max_time = float(self.config.max_simulation_time if self.config else 3900.0)

        if not self.vehicles and self.spawn_idx >= len(self.spawn_schedule):
            return SimulationStepStatus.COMPLETED

        if self.current_time >= max_time:
            return SimulationStepStatus.TIME_LIMIT_REACHED

        while (
            self.spawn_idx < len(self.spawn_schedule)
            and self.spawn_schedule[self.spawn_idx] <= self.current_time
        ):
            lane_choice = list(range(self.config.num_lanes if self.config else 4))
            random.shuffle(lane_choice)
            placed = False

            for lane in lane_choice:
                clear = True
                for vehicle in self.vehicles:
                    if vehicle.lane == lane and vehicle.pos < 50:
                        clear = False
                        break
                if clear:
                    new_vehicle = Vehicle(
                        self.vehicle_id_counter,
                        self.current_time,
                        lane,
                        self.config,
                    )
                    self.vehicles.append(new_vehicle)
                    self.vehicle_id_counter += 1
                    placed = True
                    break

            if placed:
                self.spawn_idx += 1
            else:
                self.spawn_schedule[self.spawn_idx] += 1.0

        active_vehicles = [vehicle for vehicle in self.vehicles if not vehicle.finished]
        active_vehicles.sort(key=lambda vehicle: vehicle.pos)

        self.spatial_index.rebuild(active_vehicles)

        blocked_lanes = defaultdict(list)
        for vehicle in active_vehicles:
            if vehicle.anomaly_type == 1 and vehicle.anomaly_state == "active":
                blocked_lanes[vehicle.lane].append(vehicle.pos)
        blocked_lanes = {
            lane: tuple(positions)
            for lane, positions in blocked_lanes.items()
        }

        for vehicle in active_vehicles:
            segment_length = self.config.segment_length_km if self.config else 2.0
            segment = int(vehicle.pos / (segment_length * 1000))
            vehicle.record_time(self.current_time, segment, segment_length)

            anomaly_log = vehicle.trigger_anomaly(self.current_time, segment)
            if anomaly_log:
                self.anomaly_logs.append(anomaly_log)

            nearby_vehicles = self.spatial_index.get_nearby_vehicles(
                vehicle,
                range_cells=3,
            )
            vehicle.update(dt, nearby_vehicles, blocked_lanes, self.current_time)
            self.spatial_index.update_vehicle(vehicle)

        for vehicle in active_vehicles:
            position_km = vehicle.pos / 1000
            for gate in self.etc_gates:
                gate_id = str(gate["gate_id"])
                gate_position_km = float(gate["position_km"])

                if gate_position_km - 0.05 <= position_km < gate_position_km + 0.05:
                    if gate_id not in vehicle.passed_gates:
                        vehicle.passed_gates.add(gate_id)
                        self._process_etc_transaction(
                            vehicle,
                            gate_id,
                            gate_position_km,
                        )

        sample_due = self._consume_sample_due()
        if sample_due:
            for vehicle in active_vehicles:
                self.trajectory_data.append(
                    {
                        "id": vehicle.id,
                        "pos": vehicle.pos,
                        "time": self.current_time,
                        "lane": vehicle.lane,
                        "speed": vehicle.speed,
                        "anomaly_state": vehicle.anomaly_state,
                        "anomaly_type": vehicle.anomaly_type,
                        "vehicle_type": vehicle.vehicle_type,
                        "driver_style": vehicle.driver_style,
                        "is_affected": vehicle.is_affected,
                    }
                )

        segment_speeds = defaultdict(list)
        segment_densities = defaultdict(int)

        for vehicle in active_vehicles:
            segment_length = self.config.segment_length_km if self.config else 2.0
            segment = int(vehicle.pos / (segment_length * 1000))
            if 0 <= segment < (self.config.num_segments if self.config else 10):
                segment_speeds[segment].append(vehicle.speed)
                segment_densities[segment] += 1

        for segment_idx, speeds in segment_speeds.items():
            if speeds:
                average_speed = sum(speeds) / len(speeds)
                segment_length = self.config.segment_length_km if self.config else 2.0
                density = segment_densities[segment_idx] / segment_length
                self.segment_speed_history.append(
                    {
                        "time": self.current_time,
                        "segment": segment_idx,
                        "avg_speed": average_speed,
                        "density": density,
                        "flow": average_speed * density,
                    }
                )

        queue_state = self._detect_queue_state(active_vehicles, presorted=True)
        if queue_state["in_queue"]:
            self.queue_events.append({"time": self.current_time, **queue_state})

        queue_lengths = {}
        if queue_state["in_queue"]:
            queue_gate_id = self._resolve_queue_gate_id(queue_state)
            queue_lengths[queue_gate_id] = queue_state["queue_length"]

        jams = PhantomJamDetector.detect_phantom_jam_with_index(
            self.spatial_index,
            active_vehicles,
            self.current_time,
        )
        self.phantom_jam_events.extend(jams)

        if sample_due:
            for vehicle in active_vehicles:
                self.safety_data.append(
                    {
                        "time": self.current_time,
                        "vehicle_id": vehicle.id,
                        "vehicle_type": vehicle.vehicle_type,
                        "driver_style": vehicle.driver_style,
                        "speed": vehicle.speed * 3.6,
                        "pos": vehicle.pos,
                        "min_ttc": vehicle.min_ttc,
                        "max_decel": vehicle.max_decel,
                        "brake_count": vehicle.brake_count,
                        "emergency_brake_count": vehicle.emergency_brake_count,
                    }
                )

        alert_context = AlertContext(
            current_time=self.current_time,
            gate_stats=self.etc_detector.gate_stats,
            recent_transactions=(
                self.etc_detector.transactions[-100:]
                if self.etc_detector.transactions
                else []
            ),
            active_incidents=[],
            vehicle_speeds={vehicle.id: vehicle.speed for vehicle in active_vehicles},
            vehicle_positions={vehicle.id: vehicle.pos for vehicle in active_vehicles},
            vehicle_anomaly_states={
                vehicle.id: vehicle.anomaly_state
                for vehicle in active_vehicles
            },
            vehicle_lanes={vehicle.id: vehicle.lane for vehicle in active_vehicles},
            noise_stats=self.etc_noise_simulator.get_statistics(),
            weather_type=(
                self.environment.current_weather.value
                if hasattr(self.environment, "current_weather")
                else "clear"
            ),
            queue_lengths=queue_lengths,
            segment_avg_speeds={
                segment: sum(speeds) / len(speeds)
                for segment, speeds in segment_speeds.items()
                if speeds
            },
            alert_history=[],
            recent_alert_events=self.alert_rule_engine.get_recent_events(
                max_age=300.0,
                current_time=self.current_time,
            ),
        )

        rule_events = self.alert_rule_engine.evaluate_all(alert_context)
        for event in rule_events:
            self.rule_engine_events.append(
                {
                    "rule_name": event.rule_name,
                    "severity": event.severity,
                    "timestamp": event.timestamp,
                    "gate_id": event.gate_id,
                    "position_km": event.position_km,
                    "description": event.description,
                    "confidence": event.confidence,
                }
            )

        completed = [vehicle for vehicle in self.vehicles if vehicle.finished]
        self.finished_vehicles.extend(completed)
        self.vehicles = [vehicle for vehicle in self.vehicles if not vehicle.finished]

        self.current_time += dt

        if not self.vehicles and self.spawn_idx >= len(self.spawn_schedule):
            return SimulationStepStatus.COMPLETED
        if self.current_time >= max_time:
            return SimulationStepStatus.TIME_LIMIT_REACHED
        return SimulationStepStatus.RUNNING

    def run(self) -> SimulationStepStatus:
        """Run until all vehicles finish or the configured time limit is reached."""
        while True:
            status = self.step()
            if status is SimulationStepStatus.RUNNING:
                continue
            if status is SimulationStepStatus.TIME_LIMIT_REACHED:
                max_time = self.config.max_simulation_time if self.config else 3900
                print(f"达到最大模拟时间 {max_time}秒，仿真结束")
            break

        print("仿真完成。")
        return status

    def _detect_queue_state(
        self,
        vehicles: List[Vehicle],
        presorted: bool = False,
    ) -> Dict:
        """Detect the current queue state."""
        from ..models.queue import QueueFormationModel

        if presorted:
            return QueueFormationModel.detect_queue_state_sorted(vehicles)
        return QueueFormationModel.detect_queue_state(vehicles)

    def get_results(self) -> SimulationResult:
        """Return the in-memory result collections."""
        return SimulationResult(
            finished_vehicles=self.finished_vehicles,
            anomaly_logs=self.anomaly_logs,
            trajectory_data=self.trajectory_data,
            segment_speed_history=self.segment_speed_history,
            queue_events=self.queue_events,
            phantom_jam_events=self.phantom_jam_events,
            safety_data=self.safety_data,
        )

    def export_to_dict(self) -> Dict[str, Any]:
        """Export all simulation data to a JSON-compatible dictionary."""
        results = self.get_results()
        noise_stats = self.etc_noise_simulator.get_statistics()

        return {
            "trajectory_version": 1,
            "config": self.config.to_dict() if self.config else {},
            "statistics": {
                "total_vehicles": len(results.finished_vehicles),
                "total_anomalies": len(results.anomaly_logs),
                "simulation_time": self.current_time,
                "etc_alerts_count": len(self.etc_alerts),
                "etc_transactions_count": len(self.etc_detector.transactions),
            },
            "etcGates": [
                {
                    "gate_id": gate["gate_id"],
                    "position": float(gate["position_m"]),
                    "position_km": float(gate["position_km"]),
                    "segment": int(gate["segment"]),
                }
                for gate in self.etc_gates
            ],
            "anomaly_logs": results.anomaly_logs,
            "trajectory_data": [item.copy() for item in results.trajectory_data],
            "segment_speed_history": [
                item.copy()
                for item in results.segment_speed_history
            ],
            "queue_events": [item.copy() for item in results.queue_events],
            "phantom_jam_events": [
                item.copy()
                for item in results.phantom_jam_events
            ],
            "safety_data": [item.copy() for item in results.safety_data],
            "vehicle_records": [
                vehicle.to_dict()
                for vehicle in results.finished_vehicles
            ],
            "etc_detection": {
                "alerts": self.etc_alerts,
                "gate_stats": self.etc_detector.get_all_stats(),
                "noise_events": self.etc_noise_events,
                "noise_statistics": noise_stats,
                "transactions": [
                    {
                        "vehicle_id": transaction.vehicle_id,
                        "gate_id": transaction.gate_id,
                        "gate_position_km": transaction.gate_position_km,
                        "timestamp": transaction.timestamp,
                        "lane": transaction.lane,
                        "speed": transaction.speed,
                        "status": transaction.status,
                    }
                    for transaction in self.etc_detector.transactions
                ],
            },
            "environment": self.environment.get_status(),
            "rule_engine": {
                "events": self.rule_engine_events,
                "engine_stats": self.alert_rule_engine.to_dict(),
            },
            "ml_dataset": self._generate_ml_dataset(),
        }

    def _generate_ml_dataset(self) -> Dict[str, Any]:
        """Build a time-series feature dataset for downstream ML tasks."""
        try:
            ground_truths = extract_ground_truths_from_engine(self)
            extractor = TimeSeriesFeatureExtractor(
                step_seconds=60.0,
                window_size_steps=5,
            )
            return extractor.build_dataset(
                transactions=self.etc_detector.transactions,
                ground_truths=ground_truths,
                run_id="sim_run",
            )
        except Exception as exc:
            logger.exception("Error generating ML dataset: %s", exc)
            return {}
