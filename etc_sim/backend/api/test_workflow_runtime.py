import json

from etc_sim.backend.api import workflows
from etc_sim.models.alert_rules import create_default_rules


def _write_workflow(tmp_path, name: str, rules: list[dict]) -> None:
    path = tmp_path / f"{name}.json"
    path.write_text(
        json.dumps(
            {
                "name": name,
                "description": f"{name} workflow",
                "rules": rules,
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def test_load_rules_for_runtime_prefers_named_workflow(tmp_path, monkeypatch):
    monkeypatch.setattr(workflows, "WORKFLOW_DIR", tmp_path)

    default_rules = [create_default_rules()[0].to_dict()]
    named_rules = [create_default_rules()[1].to_dict()]
    _write_workflow(tmp_path, workflows.DEFAULT_WORKFLOW_NAME, default_rules)
    _write_workflow(tmp_path, "custom_flow", named_rules)

    resolved = workflows.load_rules_for_runtime("custom_flow")

    assert [rule["name"] for rule in resolved] == [rule["name"] for rule in named_rules]


def test_load_rules_for_runtime_uses_default_workflow_file(tmp_path, monkeypatch):
    monkeypatch.setattr(workflows, "WORKFLOW_DIR", tmp_path)

    default_rules = [create_default_rules()[0].to_dict()]
    latest_other_rules = [create_default_rules()[1].to_dict()]
    _write_workflow(tmp_path, workflows.DEFAULT_WORKFLOW_NAME, default_rules)
    _write_workflow(tmp_path, "zzz_latest", latest_other_rules)

    resolved = workflows.load_rules_for_runtime()

    assert [rule["name"] for rule in resolved] == [rule["name"] for rule in default_rules]


def test_load_rules_for_runtime_falls_back_to_builtin_defaults(tmp_path, monkeypatch):
    monkeypatch.setattr(workflows, "WORKFLOW_DIR", tmp_path)

    resolved = workflows.load_rules_for_runtime()

    assert [rule["name"] for rule in resolved] == [rule.name for rule in create_default_rules()]


def test_resolve_runtime_workflow_name_supports_camel_and_nested_keys():
    assert workflows.resolve_runtime_workflow_name({"workflowName": "main_flow"}) == "main_flow"
    assert workflows.resolve_runtime_workflow_name({"workflow": {"name": "nested_flow"}}) == "nested_flow"
    assert workflows.resolve_runtime_workflow_name({}) is None
