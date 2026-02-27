"""
预警评估系统 — 真值对比 + 性能指标计算

将规则引擎触发的 AlertEvent 与仿真中车辆的真实异常状态
进行空间-时间匹配，计算 Precision、Recall、F1、检测延迟等关键指标。
"""

import logging
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple
from collections import defaultdict

from .alert_context import AlertEvent

logger = logging.getLogger(__name__)


# ==================== 真值记录 ====================

@dataclass
class GroundTruthEvent:
    """仿真中的真实异常事件（来源于 Vehicle.trigger_anomaly）"""
    vehicle_id: int
    anomaly_type: int          # 1=停车, 2=缓行短, 3=缓行长
    trigger_time: float        # 触发时刻 (s)
    position_m: float          # 触发位置 (m)
    segment_idx: int           # 所在路段
    min_speed_kmh: float       # 异常最低速度
    resolved_time: Optional[float] = None  # 恢复时刻

    @property
    def position_km(self) -> float:
        return self.position_m / 1000.0

    @property
    def duration(self) -> Optional[float]:
        if self.resolved_time is not None:
            return self.resolved_time - self.trigger_time
        return None


# ==================== 匹配记录 ====================

@dataclass
class MatchResult:
    """一次真值-预警的匹配结果"""
    ground_truth: GroundTruthEvent
    alert_event: Optional[AlertEvent]
    matched: bool
    detection_delay: Optional[float] = None   # 检测延迟 (s)
    position_error_km: Optional[float] = None # 位置误差 (km)


# ==================== 评估指标 ====================

@dataclass
class EvaluationMetrics:
    """评估指标汇总"""
    total_ground_truths: int = 0
    total_alerts: int = 0
    true_positives: int = 0
    false_positives: int = 0
    false_negatives: int = 0
    true_negatives: int = 0      # 需由外部根据总车辆数设置

    mean_detection_delay_s: float = 0.0
    median_detection_delay_s: float = 0.0
    max_detection_delay_s: float = 0.0

    mean_position_error_km: float = 0.0

    @property
    def precision(self) -> float:
        if self.true_positives + self.false_positives == 0:
            return 0.0
        return self.true_positives / (self.true_positives + self.false_positives)

    @property
    def recall(self) -> float:
        if self.true_positives + self.false_negatives == 0:
            return 0.0
        return self.true_positives / (self.true_positives + self.false_negatives)

    @property
    def f1_score(self) -> float:
        p, r = self.precision, self.recall
        if p + r == 0:
            return 0.0
        return 2 * p * r / (p + r)

    @property
    def specificity(self) -> float:
        """特异性 = TN / (TN + FP)"""
        if self.true_negatives + self.false_positives == 0:
            return 0.0
        return self.true_negatives / (self.true_negatives + self.false_positives)

    @property
    def fpr(self) -> float:
        """假阳率 = FP / (FP + TN)"""
        if self.false_positives + self.true_negatives == 0:
            return 0.0
        return self.false_positives / (self.false_positives + self.true_negatives)

    @property
    def mcc(self) -> float:
        """Matthews 相关系数，范围 [-1, 1]，1 为完美分类"""
        tp = self.true_positives
        fp = self.false_positives
        fn = self.false_negatives
        tn = self.true_negatives
        denom = ((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn)) ** 0.5
        if denom == 0:
            return 0.0
        return (tp * tn - fp * fn) / denom

    def to_dict(self) -> dict:
        return {
            'total_ground_truths': self.total_ground_truths,
            'total_alerts': self.total_alerts,
            'true_positives': self.true_positives,
            'false_positives': self.false_positives,
            'false_negatives': self.false_negatives,
            'true_negatives': self.true_negatives,
            'precision': round(self.precision, 4),
            'recall': round(self.recall, 4),
            'f1_score': round(self.f1_score, 4),
            'specificity': round(self.specificity, 4),
            'fpr': round(self.fpr, 4),
            'mcc': round(self.mcc, 4),
            'mean_detection_delay_s': round(self.mean_detection_delay_s, 2),
            'median_detection_delay_s': round(self.median_detection_delay_s, 2),
            'max_detection_delay_s': round(self.max_detection_delay_s, 2),
            'mean_position_error_km': round(self.mean_position_error_km, 3),
        }


# ==================== 按类别细分指标 ====================

@dataclass
class CategoryMetrics:
    """按异常类型分的指标"""
    by_anomaly_type: Dict[int, EvaluationMetrics] = field(default_factory=dict)
    by_severity: Dict[str, EvaluationMetrics] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            'by_anomaly_type': {
                k: v.to_dict() for k, v in self.by_anomaly_type.items()
            },
            'by_severity': {
                k: v.to_dict() for k, v in self.by_severity.items()
            },
        }


# ==================== 评估引擎 ====================

class AlertEvaluator:
    """
    预警评估引擎
    
    使用时空窗口匹配算法将规则引擎输出的 AlertEvent 匹配到
    仿真中的真实异常事件（GroundTruthEvent），然后计算性能指标。
    """

    def __init__(
        self,
        time_window_s: float = 120.0,    # 匹配时间窗口
        distance_window_km: float = 2.0, # 匹配距离窗口
    ):
        self.time_window_s = time_window_s
        self.distance_window_km = distance_window_km

    def evaluate(
        self,
        ground_truths: List[GroundTruthEvent],
        alert_events: List[AlertEvent],
    ) -> Tuple[EvaluationMetrics, List[MatchResult], CategoryMetrics]:
        """
        执行评估

        Args:
            ground_truths: 真实异常事件列表
            alert_events: 规则引擎触发的预警事件列表

        Returns:
            (总体指标, 匹配详情, 按类别细分指标)
        """
        # 标记哪些 alert 已被匹配
        used_alerts = set()
        matches: List[MatchResult] = []
        detection_delays: List[float] = []
        position_errors: List[float] = []

        # 1. 对每个真值事件，找最近的匹配 alert
        for gt in ground_truths:
            best_alert = None
            best_score = float('inf')

            for i, alert in enumerate(alert_events):
                if i in used_alerts:
                    continue

                # 时间差
                time_diff = alert.timestamp - gt.trigger_time
                if time_diff < -10 or time_diff > self.time_window_s:
                    # alert 必须在真值之后（允许10s提前），且不超过窗口
                    continue

                # 空间差
                if alert.position_km is not None:
                    dist_diff = abs(alert.position_km - gt.position_km)
                    if dist_diff > self.distance_window_km:
                        continue
                else:
                    dist_diff = 0.0

                # 综合得分（时间优先）
                score = abs(time_diff) + dist_diff * 100  # 加权
                if score < best_score:
                    best_score = score
                    best_alert = (i, alert, time_diff, dist_diff)

            if best_alert:
                idx, alert, delay, dist_err = best_alert
                used_alerts.add(idx)
                matches.append(MatchResult(
                    ground_truth=gt,
                    alert_event=alert,
                    matched=True,
                    detection_delay=delay,
                    position_error_km=dist_err,
                ))
                detection_delays.append(delay)
                position_errors.append(dist_err)
            else:
                matches.append(MatchResult(
                    ground_truth=gt,
                    alert_event=None,
                    matched=False,
                ))

        # 2. 计算总体指标
        tp = sum(1 for m in matches if m.matched)
        fn = sum(1 for m in matches if not m.matched)
        fp = len(alert_events) - len(used_alerts)  # 未匹配的 alert

        metrics = EvaluationMetrics(
            total_ground_truths=len(ground_truths),
            total_alerts=len(alert_events),
            true_positives=tp,
            false_positives=fp,
            false_negatives=fn,
        )

        if detection_delays:
            sorted_delays = sorted(detection_delays)
            metrics.mean_detection_delay_s = sum(sorted_delays) / len(sorted_delays)
            metrics.median_detection_delay_s = sorted_delays[len(sorted_delays) // 2]
            metrics.max_detection_delay_s = sorted_delays[-1]

        if position_errors:
            metrics.mean_position_error_km = sum(position_errors) / len(position_errors)

        # 3. 按类别细分
        cat_metrics = CategoryMetrics()

        # 按异常类型
        by_type: Dict[int, Tuple[List[MatchResult], int]] = defaultdict(lambda: ([], 0))
        for m in matches:
            atype = m.ground_truth.anomaly_type
            if atype not in by_type:
                by_type[atype] = ([], 0)
            lst, _ = by_type[atype]
            lst.append(m)

        for atype, (type_matches, _) in by_type.items():
            t_tp = sum(1 for m in type_matches if m.matched)
            t_fn = sum(1 for m in type_matches if not m.matched)
            em = EvaluationMetrics(
                total_ground_truths=len(type_matches),
                total_alerts=0,  # 不细分
                true_positives=t_tp,
                false_positives=0,
                false_negatives=t_fn,
            )
            type_delays = [m.detection_delay for m in type_matches if m.detection_delay is not None]
            if type_delays:
                em.mean_detection_delay_s = sum(type_delays) / len(type_delays)
            cat_metrics.by_anomaly_type[atype] = em

        logger.info(
            f"AlertEvaluator: GT={len(ground_truths)}, Alerts={len(alert_events)}, "
            f"TP={tp}, FP={fp}, FN={fn}, "
            f"P={metrics.precision:.3f}, R={metrics.recall:.3f}, F1={metrics.f1_score:.3f}"
        )

        return metrics, matches, cat_metrics


def compute_gantry_stats(
    ground_truths: List[GroundTruthEvent],
    alert_events: List['AlertEvent'],
    matches: List[MatchResult],
    segment_boundaries: List[float],
) -> List[Dict]:
    """
    按门架区间聚合评估统计。

    Args:
        ground_truths:      真实异常事件列表
        alert_events:       预警事件列表
        matches:            评估匹配结果列表
        segment_boundaries: 区间边界 km 列表，例如 [0, 3.44, 7.94, 8.28, 9.47]

    Returns:
        每个区间的统计字典列表
    """
    if not segment_boundaries or len(segment_boundaries) < 2:
        return []

    n_segments = len(segment_boundaries) - 1

    # 统计每个区间的 GT 数（直接用 segment_idx 字段）
    gt_by_seg: Dict[int, int] = defaultdict(int)
    for gt in ground_truths:
        seg = getattr(gt, 'segment_idx', None)
        if seg is not None and 0 <= seg < n_segments:
            gt_by_seg[seg] += 1

    # 将 alert_events 按位置分配到对应区间
    def _pos_to_seg(pos_km: float) -> int:
        for i in range(n_segments):
            if segment_boundaries[i] <= pos_km < segment_boundaries[i + 1]:
                return i
        # 超出末端归入最后一个区间
        return n_segments - 1

    alert_by_seg: Dict[int, int] = defaultdict(int)
    for alert in alert_events:
        if alert.position_km is not None:
            seg = _pos_to_seg(alert.position_km)
        else:
            continue
        alert_by_seg[seg] += 1

    # 统计每个区间的 TP / FN
    tp_by_seg: Dict[int, int] = defaultdict(int)
    fn_by_seg: Dict[int, int] = defaultdict(int)
    for m in matches:
        seg = getattr(m.ground_truth, 'segment_idx', None)
        if seg is None or not (0 <= seg < n_segments):
            continue
        if m.matched:
            tp_by_seg[seg] += 1
        else:
            fn_by_seg[seg] += 1

    # 组装结果
    result = []
    for i in range(n_segments):
        start_km = round(segment_boundaries[i], 3)
        end_km = round(segment_boundaries[i + 1], 3)
        gt_count = gt_by_seg[i]
        alert_count = alert_by_seg[i]
        matched = tp_by_seg[i]
        fn = fn_by_seg[i]
        fp = max(alert_count - matched, 0)
        detection_rate = matched / gt_count if gt_count > 0 else 0.0

        result.append({
            'segment_id': i,
            'label': f'区间{i} ({start_km}~{end_km}km)',
            'start_km': start_km,
            'end_km': end_km,
            'ground_truth_count': gt_count,
            'alert_count': alert_count,
            'matched_count': matched,
            'false_positive_count': fp,
            'false_negative_count': fn,
            'detection_rate': round(detection_rate, 4),
        })

    return result


def extract_ground_truths_from_engine(engine) -> List[GroundTruthEvent]:
    """
    从仿真引擎中提取真值事件

    Args:
        engine: SimulationEngine 实例

    Returns:
        GroundTruthEvent 列表
    """
    ground_truths = []

    for log_entry in engine.anomaly_logs:
        gt = GroundTruthEvent(
            vehicle_id=log_entry.get('id', -1),
            anomaly_type=log_entry.get('type', 0),
            trigger_time=log_entry.get('time', 0.0),
            position_m=log_entry.get('pos_km', 0.0) * 1000.0,
            segment_idx=log_entry.get('segment', 0),
            min_speed_kmh=log_entry.get('min_speed', 0.0),
        )
        ground_truths.append(gt)

    return ground_truths


def extract_alert_events_from_engine(engine) -> List[AlertEvent]:
    """
    从仿真引擎中提取规则引擎触发的预警事件

    Args:
        engine: SimulationEngine 实例

    Returns:
        AlertEvent 列表
    """
    events = []
    for ev in engine.rule_engine_events:
        events.append(AlertEvent(
            rule_name=ev.get('rule_name', ''),
            severity=ev.get('severity', 'medium'),
            timestamp=ev.get('timestamp', 0.0),
            gate_id=ev.get('gate_id', ''),
            position_km=ev.get('position_km'),
            description=ev.get('description', ''),
            confidence=ev.get('confidence', 0.0),
        ))
    return events
