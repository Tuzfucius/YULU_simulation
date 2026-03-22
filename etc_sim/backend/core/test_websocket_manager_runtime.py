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
