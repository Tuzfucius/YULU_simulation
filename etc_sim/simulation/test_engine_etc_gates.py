from etc_sim.config.parameters import SimulationConfig
from etc_sim.road.network import RoadNetwork
from etc_sim.simulation.engine import SimulationEngine


def test_road_network_add_etc_gate_accepts_gate_id():
    network = RoadNetwork(road_length_km=10.0, num_lanes=4)

    network.add_etc_gate("main", 2.0, gate_id="G02")

    assert len(network.etc_gates) == 1
    assert network.etc_gates[0].gate_id == "G02"
    assert network.to_dict()["etc_gates"][0]["gate_id"] == "G02"


def test_simulation_engine_initializes_named_etc_gates():
    config = SimulationConfig(
        road_length_km=10.0,
        segment_length_km=2.0,
        num_lanes=4,
        total_vehicles=10,
        max_simulation_time=10,
    )

    engine = SimulationEngine(config)

    assert [gate["gate_id"] for gate in engine.etc_gates] == ["G02", "G04", "G06", "G08"]
    assert [gate.gate_id for gate in engine.road_network.etc_gates] == ["G02", "G04", "G06", "G08"]
