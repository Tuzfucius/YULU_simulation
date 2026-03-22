import asyncio
from types import SimpleNamespace

from etc_sim.backend.core import websocket_manager as manager_module


def test_build_workflow_snapshot_binds_session_state(monkeypatch):
    manager = manager_module.WebSocketManager()
    session = manager_module.SimulationSession("session-001", SimpleNamespace())
    session.config = {
        "workflowName": "runtime_flow",
        "workflow": {
            "rules": [
                {"name": "InlineRule", "conditions": [], "actions": []},
            ]
        },
    }

    expected_snapshot = {
        "workflow_name": "runtime_flow",
        "source": "inline_rules",
        "rules": [{"name": "InlineRule"}],
        "rule_count": 1,
        "parsed_at": "2026-03-22T00:00:00",
        "saved_at": None,
    }

    captured = {}

    def fake_build_runtime_workflow_snapshot(*, workflow_name=None, inline_rules=None):
        captured["workflow_name"] = workflow_name
        captured["inline_rules"] = inline_rules
        return expected_snapshot

    monkeypatch.setattr(manager_module, "build_runtime_workflow_snapshot", fake_build_runtime_workflow_snapshot)

    snapshot = manager._build_workflow_snapshot(session)

    assert snapshot is expected_snapshot
    assert session.workflow_snapshot is expected_snapshot
    assert captured["workflow_name"] == "runtime_flow"
    assert captured["inline_rules"] == session.config["workflow"]["rules"]


def test_run_simulation_reports_error_when_runtime_init_fails(monkeypatch):
    manager = manager_module.WebSocketManager()
    session = manager_module.SimulationSession("session-002", SimpleNamespace())
    session.is_running = True
    sent_messages = []

    async def fake_send(current_session, message):
        sent_messages.append(message)

    monkeypatch.setattr(manager, "_send", fake_send)
    monkeypatch.setattr(manager, "_prepare_simulation_runtime", lambda current_session: (_ for _ in ()).throw(RuntimeError("init failed")))

    asyncio.run(manager._run_simulation(session))

    assert session.is_running is False
    assert [message["type"] for message in sent_messages] == ["ERROR"]
    assert sent_messages[0]["payload"]["message"] == "init failed"


def test_run_simulation_sends_started_after_runtime_init(monkeypatch):
    manager = manager_module.WebSocketManager()
    session = manager_module.SimulationSession("session-003", SimpleNamespace())
    session.is_running = True
    sent_messages = []

    async def fake_send(current_session, message):
        sent_messages.append(message)

    async def fake_send_log(current_session, level, message, category):
        return None

    engine = SimpleNamespace(
        current_time=10.0,
        finished_vehicles=[],
        anomaly_logs=[],
        export_to_dict=lambda: {"statistics": {}, "ml_dataset": {"samples": []}},
    )
    config = SimpleNamespace(
        total_vehicles=1200,
        num_lanes=4,
        max_simulation_time=10.0,
        road_length_km=10.0,
    )

    monkeypatch.setattr(manager, "_send", fake_send)
    monkeypatch.setattr(manager, "_send_log", fake_send_log)
    monkeypatch.setattr(
        manager,
        "_prepare_simulation_runtime",
        lambda current_session: (config, {}, engine, 1.0, 10.0, 4, 3.5),
    )

    asyncio.run(manager._run_simulation(session))

    assert [message["type"] for message in sent_messages] == ["STARTED", "COMPLETE"]
