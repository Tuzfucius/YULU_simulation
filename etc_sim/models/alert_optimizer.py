"""
预警阈值自适应优化器

使用网格搜索或贝叶斯优化思路，在给定的参数空间内搜索
使 F1-Score 最大化的最优条件参数。

由于仿真有限步长，此处采用简化版网格搜索。
"""

import logging
import itertools
from dataclasses import dataclass, field
from typing import List, Dict, Any, Tuple, Optional

from .alert_context import AlertContext, AlertEvent
from .alert_rules import AlertRule, AlertRuleEngine
from .alert_evaluator import (
    AlertEvaluator, GroundTruthEvent, EvaluationMetrics
)

logger = logging.getLogger(__name__)


@dataclass
class ParamRange:
    """单个参数的搜索范围"""
    name: str
    min_val: float
    max_val: float
    step: float

    def values(self) -> List[float]:
        vals = []
        v = self.min_val
        while v <= self.max_val + 1e-9:
            vals.append(round(v, 6))
            v += self.step
        return vals


@dataclass
class OptimizationResult:
    """优化结果"""
    rule_name: str
    condition_index: int
    original_params: Dict[str, Any]
    best_params: Dict[str, Any]
    original_metrics: EvaluationMetrics
    best_metrics: EvaluationMetrics
    iterations_tested: int
    improvement: float  # F1 提升百分比

    def to_dict(self) -> dict:
        return {
            'rule_name': self.rule_name,
            'condition_index': self.condition_index,
            'original_params': self.original_params,
            'best_params': self.best_params,
            'original_f1': round(self.original_metrics.f1_score, 4),
            'best_f1': round(self.best_metrics.f1_score, 4),
            'iterations_tested': self.iterations_tested,
            'improvement_pct': round(self.improvement * 100, 2),
            'best_metrics': self.best_metrics.to_dict(),
        }


class AlertOptimizer:
    """
    预警阈值优化器
    
    对给定规则的各条件参数在指定范围内进行网格搜索，
    使用 AlertEvaluator 评估每组参数的效果，选择 F1 最优的参数组合。
    """

    def __init__(self, evaluator: Optional[AlertEvaluator] = None):
        self.evaluator = evaluator or AlertEvaluator()

    def optimize_rule(
        self,
        rule: AlertRule,
        param_ranges: Dict[int, List[ParamRange]],  # {condition_idx: [ParamRange]}
        context_snapshots: List[AlertContext],
        ground_truths: List[GroundTruthEvent],
        max_iterations: int = 500,
    ) -> List[OptimizationResult]:
        """
        对规则中指定条件的参数进行优化

        Args:
            rule: 规则
            param_ranges: 每个条件的参数搜索范围
            context_snapshots: 历史上下文快照（用于模拟评估）
            ground_truths: 真值事件
            max_iterations: 最大迭代次数

        Returns:
            各条件的优化结果
        """
        results = []

        for cond_idx, ranges in param_ranges.items():
            if cond_idx >= len(rule.conditions):
                logger.warning(f"条件索引 {cond_idx} 超出规则范围")
                continue

            condition = rule.conditions[cond_idx]
            original_params = dict(condition.params)

            # 生成参数组合
            param_names = [r.name for r in ranges]
            param_values = [r.values() for r in ranges]
            combinations = list(itertools.product(*param_values))

            if len(combinations) > max_iterations:
                # 如果组合太多，随机采样
                import random
                combinations = random.sample(combinations, max_iterations)

            logger.info(
                f"优化规则 '{rule.name}' 条件 {cond_idx}: "
                f"{len(combinations)} 种参数组合"
            )

            # 评估原始参数
            original_events = self._simulate_rule(rule, context_snapshots)
            original_metrics, _, _ = self.evaluator.evaluate(ground_truths, original_events)

            best_metrics = original_metrics
            best_params = dict(original_params)
            iterations = 0

            # 网格搜索
            for combo in combinations:
                iterations += 1

                # 设置参数
                for name, value in zip(param_names, combo):
                    condition.params[name] = value

                # 模拟评估
                events = self._simulate_rule(rule, context_snapshots)
                metrics, _, _ = self.evaluator.evaluate(ground_truths, events)

                if metrics.f1_score > best_metrics.f1_score:
                    best_metrics = metrics
                    best_params = {name: value for name, value in zip(param_names, combo)}
                    # 保留未搜索的原始参数
                    for k, v in original_params.items():
                        if k not in best_params:
                            best_params[k] = v

            # 恢复最佳参数到条件
            for k, v in best_params.items():
                condition.params[k] = v

            improvement = (
                (best_metrics.f1_score - original_metrics.f1_score) / max(original_metrics.f1_score, 0.001)
            )

            results.append(OptimizationResult(
                rule_name=rule.name,
                condition_index=cond_idx,
                original_params=original_params,
                best_params=best_params,
                original_metrics=original_metrics,
                best_metrics=best_metrics,
                iterations_tested=iterations,
                improvement=improvement,
            ))

            logger.info(
                f"  最优 F1={best_metrics.f1_score:.4f} "
                f"(原始 {original_metrics.f1_score:.4f}, 提升 {improvement*100:.1f}%)"
            )

        return results

    def _simulate_rule(
        self,
        rule: AlertRule,
        context_snapshots: List[AlertContext],
    ) -> List[AlertEvent]:
        """用给定规则在历史上下文快照上模拟，收集事件"""
        engine = AlertRuleEngine()
        engine.add_rule(rule)

        all_events: List[AlertEvent] = []
        for ctx in context_snapshots:
            events = engine.evaluate_all(ctx)
            all_events.extend(events)

        return all_events


def suggest_param_ranges(rule: AlertRule) -> Dict[int, List[ParamRange]]:
    """
    根据规则条件自动建议参数搜索范围
    
    Args:
        rule: 规则
        
    Returns:
        各条件建议的搜索范围
    """
    ranges: Dict[int, List[ParamRange]] = {}

    for idx, cond in enumerate(rule.conditions):
        cond_ranges = []

        for param_name, param_value in cond.params.items():
            if isinstance(param_value, (int, float)) and not isinstance(param_value, bool):
                # 在原始值的 ±50% 范围内搜索，步长为 10%
                base = float(param_value)
                if base > 0:
                    low = base * 0.5
                    high = base * 1.5
                    step = base * 0.1
                else:
                    low = -1.0
                    high = 1.0
                    step = 0.2
                
                cond_ranges.append(ParamRange(
                    name=param_name,
                    min_val=round(low, 4),
                    max_val=round(high, 4),
                    step=round(max(step, 0.01), 4),
                ))

        if cond_ranges:
            ranges[idx] = cond_ranges

    return ranges
