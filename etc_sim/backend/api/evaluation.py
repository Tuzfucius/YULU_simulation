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


@router.post("/run")
async def run_evaluation_with_params(config: EvaluationConfigModel):
    """使用前端传入的时间/距离窗口参数重新运行评估"""
    global _last_evaluation

    if not _last_ground_truths and not _last_alert_events:
        return {
            "success": True,
            "data": {
                "precision": 0, "recall": 0, "f1_score": 0,
                "detection_delay_avg": 0, "detection_delay_max": 0,
                "true_positives": 0, "false_positives": 0, "false_negatives": 0,
                "total_alerts": 0, "total_ground_truths": 0,
            },
            "message": "暂无仿真数据"
        }

    evaluator = AlertEvaluator(
        time_window_s=config.time_window_s,
        distance_window_km=config.distance_window_km,
    )

    metrics, matches, cat_metrics = evaluator.evaluate(
        _last_ground_truths, _last_alert_events
    )

    result = {
        "precision": metrics.precision,
        "recall": metrics.recall,
        "f1_score": metrics.f1_score,
        "detection_delay_avg": metrics.mean_detection_delay_s,
        "detection_delay_max": getattr(metrics, 'max_detection_delay_s', 0),
        "true_positives": metrics.true_positives,
        "false_positives": metrics.false_positives,
        "false_negatives": metrics.false_negatives,
        "total_alerts": metrics.total_alerts,
        "total_ground_truths": metrics.total_ground_truths,
        "match_details": [
            {
                "alert_time": m.alert_event.timestamp if m.alert_event else 0,
                "truth_time": m.ground_truth.trigger_time if m.ground_truth else 0,
                "rule_name": m.alert_event.rule_name if m.alert_event else "",
                "event_type": m.ground_truth.anomaly_type if m.ground_truth else "",
                "severity": m.alert_event.severity if m.alert_event else "medium",
                "position_km": m.ground_truth.position_km if m.ground_truth else 0,
                "matched": m.matched,
            }
            for m in matches[:200]
        ],
        "type_metrics": {
            k: {"precision": v.precision, "recall": v.recall,
                "f1_score": v.f1_score, "count": v.total_ground_truths}
            for k, v in (cat_metrics.by_anomaly_type.items() if hasattr(cat_metrics, 'by_anomaly_type') else [])
        } if hasattr(cat_metrics, 'by_anomaly_type') else {},
    }

    _last_evaluation = result
    return {"success": True, "data": result}


class EvaluateFileRequest(BaseModel):
    """文件评估请求 — 从磁盘 data.json 加载数据"""
    file_path: str  # 相对于 OUTPUT_DIR 的路径
    time_window_s: float = 120.0
    distance_window_km: float = 2.0


@router.post("/evaluate-file")
async def evaluate_from_file(req: EvaluateFileRequest):
    """
    从 output 目录的 data.json 文件加载仿真数据并运行评估。
    后端分批读取，无需前端传输大文件。
    """
    global _last_evaluation, _last_ground_truths, _last_alert_events
    import json
    from pathlib import Path

    project_root = Path(__file__).resolve().parents[2]
    output_dir = project_root / "output"
    target = (output_dir / req.file_path).resolve()

    if not str(target).startswith(str(output_dir)):
        raise HTTPException(400, "路径越界")
    if not target.exists():
        raise HTTPException(404, "文件不存在")

    try:
        data = json.loads(target.read_text(encoding="utf-8"))
    except Exception as e:
        raise HTTPException(400, f"JSON 解析失败: {e}")

    # 从 anomaly_logs 构造 ground truths
    anomaly_logs = data.get('anomaly_logs', [])
    trajectory_data = data.get('trajectory_data', [])
    config = data.get('config', {})

    ground_truths = []
    for log in anomaly_logs:
        gt = GroundTruthEvent(
            vehicle_id=log.get('id', log.get('vehicle_id', 0)),
            anomaly_type=int(log.get('type', log.get('anomaly_type', 0))),
            trigger_time=float(log.get('time', log.get('trigger_time', 0))),
            position_m=float(log.get('pos_km', log.get('position_km', 0))) * 1000,
            segment_idx=int(log.get('segment', log.get('segment_idx', 0))),
            min_speed_kmh=float(log.get('min_speed_kmh', 0)),
        )
        ground_truths.append(gt)

    # 没有真值数据时仍然返回空指标
    if not ground_truths:
        return {
            "success": True,
            "data": {
                "precision": 0, "recall": 0, "f1_score": 0,
                "detection_delay_avg": 0, "detection_delay_max": 0,
                "true_positives": 0, "false_positives": 0, "false_negatives": 0,
                "total_alerts": 0, "total_ground_truths": 0,
            },
            "message": f"文件中无 anomaly_logs 数据 (trajectory_data: {len(trajectory_data)} 条)",
            "file_info": {
                "trajectory_records": len(trajectory_data),
                "anomaly_logs": len(anomaly_logs),
                "config": config,
            },
        }

    _last_ground_truths = ground_truths

    evaluator = AlertEvaluator(
        time_window_s=req.time_window_s,
        distance_window_km=req.distance_window_km,
    )

    # 使用已有的 alert_events 或空列表
    metrics, matches, cat_metrics = evaluator.evaluate(
        _last_ground_truths, _last_alert_events
    )

    result = {
        "precision": metrics.precision,
        "recall": metrics.recall,
        "f1_score": metrics.f1_score,
        "detection_delay_avg": metrics.mean_detection_delay_s,
        "detection_delay_max": getattr(metrics, 'max_detection_delay_s', 0),
        "true_positives": metrics.true_positives,
        "false_positives": metrics.false_positives,
        "false_negatives": metrics.false_negatives,
        "total_alerts": metrics.total_alerts,
        "total_ground_truths": metrics.total_ground_truths,
        "match_details": [
            {
                "alert_time": m.alert_event.timestamp if m.alert_event else 0,
                "truth_time": m.ground_truth.trigger_time if m.ground_truth else 0,
                "rule_name": m.alert_event.rule_name if m.alert_event else "",
                "event_type": m.ground_truth.anomaly_type if m.ground_truth else "",
                "severity": m.alert_event.severity if m.alert_event else "medium",
                "position_km": m.ground_truth.position_km if m.ground_truth else 0,
                "matched": m.matched,
            }
            for m in matches[:200]
        ],
        "type_metrics": {
            k: {"precision": v.precision, "recall": v.recall,
                "f1_score": v.f1_score, "count": v.total_ground_truths}
            for k, v in (cat_metrics.by_anomaly_type.items() if hasattr(cat_metrics, 'by_anomaly_type') else [])
        } if hasattr(cat_metrics, 'by_anomaly_type') else {},
    }

    _last_evaluation = result
    logger.info(f"File evaluation complete: GT={len(ground_truths)}, F1={metrics.f1_score:.4f}")
    return {
        "success": True,
        "data": result,
        "file_info": {
            "trajectory_records": len(trajectory_data),
            "anomaly_logs": len(anomaly_logs),
            "config": config,
        },
    }


class SensitivityRequest(BaseModel):
    param_name: str = "time_window"
    range: List[float] = [10, 120, 10]  # [start, end, step]


@router.post("/sensitivity")
async def sensitivity_analysis(req: SensitivityRequest):
    """参数敏感性分析：遍历参数范围，返回每个参数值下的 P/R/F1"""
    if not _last_ground_truths and not _last_alert_events:
        return {"success": False, "data": [], "message": "暂无仿真数据"}

    start, end, step = req.range[0], req.range[1], req.range[2]
    results = []
    
    val = start
    while val <= end:
        if req.param_name == "time_window":
            evaluator = AlertEvaluator(time_window_s=val)
        elif req.param_name == "distance_window":
            evaluator = AlertEvaluator(distance_window_km=val)
        else:
            evaluator = AlertEvaluator(time_window_s=val)
        
        metrics, _, _ = evaluator.evaluate(_last_ground_truths, _last_alert_events)
        results.append({
            "paramValue": val,
            "f1Score": metrics.f1_score,
            "precision": metrics.precision,
            "recall": metrics.recall,
        })
        val += step

    return {"success": True, "data": results}


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
