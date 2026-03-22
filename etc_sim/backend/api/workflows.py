"""
预警规则/工作流管理 API
提供规则 CRUD、条件/动作类型查询、工作流 JSON 导入导出等端点
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import json
import logging
import os
import re
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

from etc_sim.models.alert_conditions import get_all_condition_types, Condition
from etc_sim.models.alert_rules import (
    AlertRule, AlertRuleEngine, create_default_rules,
    get_all_action_types, Action
)

router = APIRouter()
logger = logging.getLogger(__name__)
WORKFLOW_DIR = Path(__file__).resolve().parents[2] / "data" / "workflows"
WORKFLOW_DIR.mkdir(parents=True, exist_ok=True)
DEFAULT_WORKFLOW_NAME = "default"

# 全局规则引擎实例（会在仿真会话中由 WebSocket Manager 引用）
# 此处作为独立管理用途，仿真运行时使用 engine 内部的实例
_standalone_engine = AlertRuleEngine()
for _rule in create_default_rules():
    _standalone_engine.add_rule(_rule)


# ==================== Pydantic 模型 ====================

class ConditionModel(BaseModel):
    type: str
    params: Dict[str, Any] = {}
    gate_id: str = '*'

class ActionModel(BaseModel):
    type: str
    params: Dict[str, Any] = {}

class RuleModel(BaseModel):
    name: str
    description: str = ''
    conditions: List[ConditionModel] = []
    logic: str = 'AND'
    severity: str = 'medium'
    actions: List[ActionModel] = []
    cooldown_s: float = 60.0
    enabled: bool = True

class WorkflowImportModel(BaseModel):
    rules: List[RuleModel]


class WorkflowFileSaveModel(BaseModel):
    name: str
    description: str = ""
    rules: List[RuleModel]


class WorkflowRenameModel(BaseModel):
    old_name: str
    new_name: str


def _sanitize_workflow_name(name: str) -> str:
    normalized = re.sub(r'[<>:"/\\|?*]+', "_", (name or "").strip())
    normalized = re.sub(r"\s+", "_", normalized).strip("._")
    if not normalized:
        raise HTTPException(status_code=400, detail="工作流名称不能为空")
    return normalized


def _workflow_path(name: str) -> Path:
    workflow_name = _sanitize_workflow_name(name)
    return WORKFLOW_DIR / f"{workflow_name}.json"


def _default_workflow_path() -> Path:
    return _workflow_path(DEFAULT_WORKFLOW_NAME)


def _workflow_copy_path(name: str) -> Path:
    source = _workflow_path(name)
    for index in range(1, 1000):
        candidate = WORKFLOW_DIR / f"{source.stem}_copy{index}.json"
        if not candidate.exists():
            return candidate
    raise HTTPException(status_code=500, detail="无法生成可用的复制名称")


def _read_workflow_file(path: Path) -> dict:
    try:
        with open(path, "r", encoding="utf-8") as file:
            return json.load(file)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="工作流不存在") from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="工作流文件格式错误") from exc


def _list_workflow_paths() -> List[Path]:
    return sorted(WORKFLOW_DIR.glob("*.json"), key=lambda item: item.stat().st_mtime, reverse=True)


def _normalize_runtime_rules(rules: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    for rule_data in rules or []:
        rule = AlertRule.from_dict(rule_data)
        normalized.append(rule.to_dict())
    return normalized


def _runtime_file_saved_at(path: Path) -> Optional[str]:
    try:
        return datetime.fromtimestamp(path.stat().st_mtime).isoformat()
    except OSError:
        return None


def _build_runtime_snapshot(
    *,
    requested_workflow_name: Optional[str],
    resolved_workflow_name: str,
    source: str,
    rules: List[Dict[str, Any]],
    workflow_path: Optional[Path] = None,
    description: str = "",
) -> Dict[str, Any]:
    snapshot: Dict[str, Any] = {
        "requested_workflow_name": requested_workflow_name,
        "workflow_name": resolved_workflow_name,
        "source": source,
        "parsed_at": datetime.utcnow().isoformat(),
        "saved_at": _runtime_file_saved_at(workflow_path) if workflow_path else None,
        "rules": rules,
        "rule_count": len(rules),
    }
    if workflow_path is not None:
        snapshot["workflow_file_name"] = workflow_path.name
        snapshot["workflow_path"] = str(workflow_path)
    if description:
        snapshot["description"] = description
    return snapshot


def build_runtime_workflow_snapshot(
    workflow_name: Optional[str] = None,
    inline_rules: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Resolve and freeze the runtime workflow snapshot used by a simulation."""
    requested_workflow_name = workflow_name.strip() if isinstance(workflow_name, str) and workflow_name.strip() else None

    if inline_rules is not None:
        rules = _normalize_runtime_rules(inline_rules)
        return _build_runtime_snapshot(
            requested_workflow_name=requested_workflow_name,
            resolved_workflow_name=requested_workflow_name or DEFAULT_WORKFLOW_NAME,
            source="inline_rules",
            rules=rules,
        )

    candidate_paths: List[tuple[Path, str, str]] = []
    if requested_workflow_name:
        candidate_paths.append((_workflow_path(requested_workflow_name), "workflow_file", requested_workflow_name))
    candidate_paths.append((_default_workflow_path(), "default_workflow_file", DEFAULT_WORKFLOW_NAME))

    for path, source, resolved_name in candidate_paths:
        if not path.exists():
            continue
        try:
            payload = _read_workflow_file(path)
        except HTTPException:
            continue
        rules = _normalize_runtime_rules(payload.get("rules", []))
        return _build_runtime_snapshot(
            requested_workflow_name=requested_workflow_name,
            resolved_workflow_name=payload.get("name") or resolved_name,
            source=source,
            rules=rules,
            workflow_path=path,
            description=payload.get("description", ""),
        )

    rules = [rule.to_dict() for rule in create_default_rules()]
    return _build_runtime_snapshot(
        requested_workflow_name=requested_workflow_name,
        resolved_workflow_name=DEFAULT_WORKFLOW_NAME,
        source="builtin_defaults",
        rules=rules,
    )


def resolve_runtime_workflow_name(config: Optional[Dict[str, Any]]) -> Optional[str]:
    config = config or {}
    for key in ("workflow_name", "workflowName", "selected_workflow_name", "selectedWorkflowName"):
        value = config.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    workflow_block = config.get("workflow")
    if isinstance(workflow_block, dict):
        for key in ("name", "workflow_name", "workflowName"):
            value = workflow_block.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None


def load_rules_for_runtime(
    workflow_name: Optional[str] = None,
    inline_rules: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Resolve runtime rules from explicit rules, a saved workflow, or defaults."""
    snapshot = build_runtime_workflow_snapshot(workflow_name=workflow_name, inline_rules=inline_rules)
    return snapshot["rules"]


def _open_folder_in_explorer(path: Path):
    folder = path if path.is_dir() else path.parent
    if os.name == "nt":
        subprocess.Popen(["explorer", str(folder)])
    else:
        raise HTTPException(status_code=501, detail="当前仅支持 Windows 打开文件夹")


# ==================== 条件/动作类型查询 ====================

@router.get("/conditions/types")
async def list_condition_types():
    """获取所有可用的条件类型及其默认参数"""
    return {
        "success": True,
        "data": get_all_condition_types()
    }


@router.get("/actions/types")
async def list_action_types():
    """获取所有可用的动作类型"""
    return {
        "success": True,
        "data": get_all_action_types()
    }


# ==================== 规则 CRUD ====================

@router.get("/rules")
async def list_rules():
    """获取所有已加载的规则"""
    return {
        "success": True,
        "data": [r.to_dict() for r in _standalone_engine.rules]
    }


@router.get("/rules/{rule_name}")
async def get_rule(rule_name: str):
    """获取单条规则详情"""
    rule = _standalone_engine.get_rule(rule_name)
    if not rule:
        raise HTTPException(status_code=404, detail=f"规则 '{rule_name}' 不存在")
    return {
        "success": True,
        "data": rule.to_dict()
    }


@router.post("/rules")
async def create_rule(rule_model: RuleModel):
    """创建新规则"""
    try:
        rule = AlertRule.from_dict(rule_model.dict())
        _standalone_engine.add_rule(rule)
        return {
            "success": True,
            "data": rule.to_dict(),
            "message": f"规则 '{rule.name}' 创建成功"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/rules/{rule_name}")
async def update_rule(rule_name: str, rule_model: RuleModel):
    """更新规则"""
    existing = _standalone_engine.get_rule(rule_name)
    if not existing:
        raise HTTPException(status_code=404, detail=f"规则 '{rule_name}' 不存在")
    
    try:
        _standalone_engine.remove_rule(rule_name)
        rule = AlertRule.from_dict(rule_model.dict())
        _standalone_engine.add_rule(rule)
        return {
            "success": True,
            "data": rule.to_dict(),
            "message": f"规则 '{rule.name}' 已更新"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/rules/{rule_name}")
async def delete_rule(rule_name: str):
    """删除规则"""
    removed = _standalone_engine.remove_rule(rule_name)
    if not removed:
        raise HTTPException(status_code=404, detail=f"规则 '{rule_name}' 不存在")
    return {
        "success": True,
        "message": f"规则 '{rule_name}' 已删除"
    }


@router.patch("/rules/{rule_name}/toggle")
async def toggle_rule(rule_name: str):
    """启用/禁用规则"""
    rule = _standalone_engine.get_rule(rule_name)
    if not rule:
        raise HTTPException(status_code=404, detail=f"规则 '{rule_name}' 不存在")
    
    rule.enabled = not rule.enabled
    return {
        "success": True,
        "data": {"name": rule.name, "enabled": rule.enabled},
        "message": f"规则 '{rule.name}' 已{'启用' if rule.enabled else '禁用'}"
    }


# ==================== 工作流导入导出 ====================

@router.post("/workflows/import")
async def import_workflow(workflow: WorkflowImportModel):
    """从 JSON 导入工作流（规则集合）"""
    try:
        imported_count = 0
        for rule_data in workflow.rules:
            rule = AlertRule.from_dict(rule_data.dict())
            _standalone_engine.add_rule(rule)
            imported_count += 1
        
        return {
            "success": True,
            "message": f"成功导入 {imported_count} 条规则",
            "data": {"imported_count": imported_count}
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/workflows/export")
async def export_workflow():
    """导出当前规则为工作流 JSON"""
    return {
        "success": True,
        "data": _standalone_engine.export_to_json()
    }


@router.get("/workflows/files")
async def list_workflow_files():
    """列出已保存的工作流文件。"""
    files = []
    for path in _list_workflow_paths():
        payload = _read_workflow_file(path)
        stat = path.stat()
        rules = payload.get("rules", [])
        files.append(
            {
                "name": payload.get("name", path.stem),
                "file_name": path.name,
                "path": path.stem,
                "description": payload.get("description", ""),
                "saved_at": payload.get("saved_at"),
                "rule_count": len(rules),
                "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            }
        )
    return {"success": True, "data": files}


@router.get("/workflows/files/read")
async def read_workflow_file(name: str):
    """读取指定的工作流文件。"""
    path = _workflow_path(name)
    payload = _read_workflow_file(path)
    return {"success": True, "data": payload}


@router.post("/workflows/files/save")
async def save_workflow_file(workflow: WorkflowFileSaveModel):
    """保存工作流文件。"""
    path = _workflow_path(workflow.name)
    payload = {
        "name": workflow.name,
        "description": workflow.description,
        "rules": [rule.dict() for rule in workflow.rules],
        "saved_at": datetime.utcnow().isoformat(),
    }
    with open(path, "w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2, ensure_ascii=False)
    return {
        "success": True,
        "message": f"工作流已保存: {path.stem}",
        "data": {
            "name": workflow.name,
            "file_name": path.name,
            "path": path.stem,
            "saved_at": payload["saved_at"],
        },
    }


@router.put("/workflows/files/rename")
async def rename_workflow_file(request: WorkflowRenameModel):
    """重命名工作流文件。"""
    source_path = _workflow_path(request.old_name)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail="工作流不存在")

    target_path = _workflow_path(request.new_name)
    if target_path.exists():
        raise HTTPException(status_code=409, detail="目标工作流名称已存在")

    payload = _read_workflow_file(source_path)
    payload["name"] = request.new_name
    payload["saved_at"] = datetime.utcnow().isoformat()

    with open(target_path, "w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2, ensure_ascii=False)
    source_path.unlink()

    return {
        "success": True,
        "message": f"工作流已重命名为: {request.new_name}",
        "data": {
            "name": request.new_name,
            "file_name": target_path.name,
            "path": target_path.stem,
            "saved_at": payload["saved_at"],
        },
    }


@router.post("/workflows/files/copy")
async def copy_workflow_file(name: str):
    """复制工作流文件。"""
    source_path = _workflow_path(name)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail="工作流不存在")

    target_path = _workflow_copy_path(name)
    payload = _read_workflow_file(source_path)
    payload["name"] = target_path.stem
    payload["saved_at"] = datetime.utcnow().isoformat()

    with open(target_path, "w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2, ensure_ascii=False)

    return {
        "success": True,
        "message": f"工作流已复制为: {target_path.stem}",
        "data": {
            "name": target_path.stem,
            "file_name": target_path.name,
            "path": target_path.stem,
            "saved_at": payload["saved_at"],
        },
    }


@router.delete("/workflows/files")
async def delete_workflow_file(name: str):
    """删除工作流文件。"""
    path = _workflow_path(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail="工作流不存在")
    try:
        path.unlink()
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"删除失败: {exc}") from exc
    return {"success": True, "message": f"工作流已删除: {name}"}


@router.post("/workflows/files/open-folder")
async def open_workflow_folder(name: Optional[str] = None):
    """在资源管理器中打开工作流目录。"""
    path = WORKFLOW_DIR if not name else _workflow_path(name)
    if name and not path.exists():
        raise HTTPException(status_code=404, detail="工作流不存在")
    _open_folder_in_explorer(path)
    return {"success": True, "data": {"folder": str(path.parent if name else path)}}


@router.post("/workflows/reset")
async def reset_to_defaults():
    """重置为默认规则集"""
    _standalone_engine.rules.clear()
    _standalone_engine._rules_by_name.clear()
    
    for rule in create_default_rules():
        _standalone_engine.add_rule(rule)
    
    return {
        "success": True,
        "message": f"已重置为默认规则集（共 {len(_standalone_engine.rules)} 条）",
        "data": [r.to_dict() for r in _standalone_engine.rules]
    }


# ==================== 规则同步（供仿真引擎使用） ====================

@router.get("/workflows/active-rules")
async def get_active_rules(workflow_name: Optional[str] = None):
    """获取当前所有规则的序列化数据（供仿真引擎启动时加载）"""
    rules = load_rules_for_runtime(workflow_name)
    return {
        "success": True,
        "data": rules,
        "meta": {
            "workflow_name": workflow_name,
            "default_workflow_name": DEFAULT_WORKFLOW_NAME,
        },
    }


# ==================== 引擎状态 ====================

@router.get("/engine/status")
async def get_engine_status():
    """获取规则引擎状态"""
    return {
        "success": True,
        "data": _standalone_engine.to_dict()
    }


@router.get("/engine/events")
async def get_engine_events(max_age: float = 300.0, current_time: float = 0.0):
    """获取最近的预警事件"""
    events = _standalone_engine.get_recent_events(max_age, current_time)
    return {
        "success": True,
        "data": [
            {
                'rule_name': e.rule_name,
                'severity': e.severity,
                'timestamp': e.timestamp,
                'gate_id': e.gate_id,
                'position_km': e.position_km,
                'description': e.description,
                'confidence': e.confidence,
            }
            for e in events
        ]
    }
