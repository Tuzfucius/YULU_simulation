"""
预警规则/工作流管理 API
提供规则 CRUD、条件/动作类型查询、工作流 JSON 导入导出等端点
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import json
import logging

from etc_sim.models.alert_conditions import get_all_condition_types, Condition
from etc_sim.models.alert_rules import (
    AlertRule, AlertRuleEngine, create_default_rules,
    get_all_action_types, Action
)

router = APIRouter()
logger = logging.getLogger(__name__)

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
