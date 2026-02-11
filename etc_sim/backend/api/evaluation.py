"""
评估系统 API
提供仿真后评估指标查询、优化建议等端点
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import logging

from etc_sim.models.alert_evaluator import (
    AlertEvaluator, GroundTruthEvent, EvaluationMetrics,
    extract_ground_truths_from_engine, extract_alert_events_from_engine,
)
from etc_sim.models.alert_optimizer import (
    AlertOptimizer, suggest_param_ranges, ParamRange
)
from etc_sim.models.alert_rules import AlertRuleEngine, create_default_rules

router = APIRouter()
logger = logging.getLogger(__name__)

# 存储最近一次评估结果（仿真完成后填充）
_last_evaluation: Optional[Dict[str, Any]] = None
_last_ground_truths: List[GroundTruthEvent] = []
_last_alert_events: list = []


class EvaluationConfigModel(BaseModel):
    time_window_s: float = 120.0
    distance_window_km: float = 2.0


class OptimizeRequest(BaseModel):
    rule_name: str
    condition_index: int = 0
    param_ranges: Optional[List[Dict[str, float]]] = None  # [{name, min, max, step}]


# ==================== 评估端点 ====================

@router.get("/metrics")
async def get_evaluation_metrics():
    """获取最近一次仿真的评估指标"""
    if _last_evaluation is None:
        return {
            "success": True,
            "data": None,
            "message": "暂无评估数据，请先完成一次仿真"
        }
    return {"success": True, "data": _last_evaluation}


@router.post("/evaluate")
async def run_evaluation(config: EvaluationConfigModel):
    """使用自定义参数重新评估"""
    global _last_evaluation

    if not _last_ground_truths and not _last_alert_events:
        raise HTTPException(status_code=400, detail="暂无仿真数据，请先运行仿真")

    evaluator = AlertEvaluator(
        time_window_s=config.time_window_s,
        distance_window_km=config.distance_window_km,
    )

    metrics, matches, cat_metrics = evaluator.evaluate(
        _last_ground_truths, _last_alert_events
    )

    result = {
        'metrics': metrics.to_dict(),
        'category_metrics': cat_metrics.to_dict(),
        'match_details': [
            {
                'ground_truth': {
                    'vehicle_id': m.ground_truth.vehicle_id,
                    'anomaly_type': m.ground_truth.anomaly_type,
                    'trigger_time': m.ground_truth.trigger_time,
                    'position_km': m.ground_truth.position_km,
                },
                'matched': m.matched,
                'detection_delay': m.detection_delay,
                'position_error_km': m.position_error_km,
                'alert_rule': m.alert_event.rule_name if m.alert_event else None,
            }
            for m in matches[:100]  # 限制返回数量
        ],
    }

    _last_evaluation = result
    return {"success": True, "data": result}


@router.get("/summary")
async def get_evaluation_summary():
    """获取评估摘要（用于仪表板展示）"""
    if _last_evaluation is None:
        # 返回空的摘要结构
        return {
            "success": True,
            "data": {
                "precision": 0,
                "recall": 0,
                "f1_score": 0,
                "total_ground_truths": 0,
                "total_alerts": 0,
                "mean_detection_delay_s": 0,
                "by_anomaly_type": {},
            }
        }

    m = _last_evaluation.get('metrics', {})
    cat = _last_evaluation.get('category_metrics', {})

    return {
        "success": True,
        "data": {
            "precision": m.get('precision', 0),
            "recall": m.get('recall', 0),
            "f1_score": m.get('f1_score', 0),
            "total_ground_truths": m.get('total_ground_truths', 0),
            "total_alerts": m.get('total_alerts', 0),
            "mean_detection_delay_s": m.get('mean_detection_delay_s', 0),
            "by_anomaly_type": cat.get('by_anomaly_type', {}),
        }
    }


@router.post("/optimize")
async def optimize_rule(req: OptimizeRequest):
    """对指定规则进行阈值优化"""
    if not _last_ground_truths:
        raise HTTPException(status_code=400, detail="暂无真值数据")

    # 获取规则引擎
    engine = AlertRuleEngine()
    for r in create_default_rules():
        engine.add_rule(r)

    rule = engine.get_rule(req.rule_name)
    if not rule:
        raise HTTPException(status_code=404, detail=f"规则 '{req.rule_name}' 不存在")

    # 构建参数范围
    if req.param_ranges:
        ranges = {
            req.condition_index: [
                ParamRange(name=p['name'], min_val=p['min'], max_val=p['max'], step=p['step'])
                for p in req.param_ranges
            ]
        }
    else:
        ranges = suggest_param_ranges(rule)
        if req.condition_index not in ranges:
            return {
                "success": True,
                "data": None,
                "message": "该条件无数值型参数可优化"
            }
        ranges = {req.condition_index: ranges[req.condition_index]}

    optimizer = AlertOptimizer()
    results = optimizer.optimize_rule(
        rule=rule,
        param_ranges=ranges,
        context_snapshots=[],
        ground_truths=_last_ground_truths,
        max_iterations=200,
    )

    return {
        "success": True,
        "data": [r.to_dict() for r in results]
    }


# ==================== 内部函数（供 WebSocket Manager 调用） ====================

def store_evaluation_data(engine_instance) -> Dict[str, Any]:
    """
    从仿真引擎提取数据并执行评估（由仿真完成时调用）

    Args:
        engine_instance: SimulationEngine 实例

    Returns:
        评估结果字典
    """
    global _last_evaluation, _last_ground_truths, _last_alert_events

    _last_ground_truths = extract_ground_truths_from_engine(engine_instance)
    _last_alert_events = extract_alert_events_from_engine(engine_instance)

    evaluator = AlertEvaluator()
    metrics, matches, cat_metrics = evaluator.evaluate(
        _last_ground_truths, _last_alert_events
    )

    _last_evaluation = {
        'metrics': metrics.to_dict(),
        'category_metrics': cat_metrics.to_dict(),
        'match_count': len(matches),
    }

    logger.info(
        f"Evaluation stored: GT={len(_last_ground_truths)}, "
        f"Alerts={len(_last_alert_events)}, F1={metrics.f1_score:.4f}"
    )

    return _last_evaluation
