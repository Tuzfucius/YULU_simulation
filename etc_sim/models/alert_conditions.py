"""
预警条件原子模块
封装所有可复用的预警判断条件（Condition），每个 Condition 是最小的判断单元。

设计模式：策略模式
- 每个 Condition 是独立的判断策略
- 通过 params 配置阈值等参数
- evaluate(context) 返回布尔值表示是否满足条件

注册机制：
- 所有 Condition 子类通过 CONDITION_REGISTRY 自动注册
- 支持按名称动态创建 Condition 实例（用于 JSON 反序列化）
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List, Type
import math

from .alert_context import AlertContext

# 全局条件注册表
CONDITION_REGISTRY: Dict[str, Type['Condition']] = {}


def register_condition(cls):
    """条件注册装饰器"""
    CONDITION_REGISTRY[cls.condition_type] = cls
    return cls


@dataclass
class Condition(ABC):
    """预警条件基类
    
    所有条件判断原子的抽象基类。子类需要：
    1. 定义 condition_type 类属性（唯一标识）
    2. 定义 description 类属性（中文描述）
    3. 定义 default_params 类属性（默认参数）
    4. 实现 evaluate(context) 方法
    """
    
    condition_type: str = ''
    description: str = ''
    default_params: Dict[str, Any] = field(default_factory=dict)
    
    # 实例参数（覆盖默认值）
    params: Dict[str, Any] = field(default_factory=dict)
    
    # 关联的门架 ID（'*' 表示所有门架）
    gate_id: str = '*'
    
    def get_param(self, key: str, fallback=None):
        """获取参数值（实例参数 > 默认参数 > fallback）"""
        if key in self.params:
            return self.params[key]
        if key in self.default_params:
            return self.default_params[key]
        return fallback
    
    @abstractmethod
    def evaluate(self, context: AlertContext) -> bool:
        """评估条件是否满足
        
        Args:
            context: 预警上下文
            
        Returns:
            True 表示条件满足（异常）
        """
        ...
    
    def to_dict(self) -> dict:
        """序列化为字典"""
        return {
            'type': self.condition_type,
            'params': self.params,
            'gate_id': self.gate_id,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'Condition':
        """从字典反序列化"""
        cond_type = data.get('type', '')
        if cond_type in CONDITION_REGISTRY:
            cond_cls = CONDITION_REGISTRY[cond_type]
            return cond_cls(
                params=data.get('params', {}),
                gate_id=data.get('gate_id', '*')
            )
        raise ValueError(f"未知条件类型: {cond_type}")


# ==================== 速度类条件 ====================

@register_condition
@dataclass
class SpeedBelowThreshold(Condition):
    """速度低于阈值
    
    检测指定门架区间的平均速度是否低于阈值。
    用于识别拥堵和缓行路段。
    """
    condition_type: str = 'speed_below_threshold'
    description: str = '平均速度低于阈值'
    default_params: Dict[str, Any] = field(default_factory=lambda: {
        'threshold_kmh': 40.0,      # 速度阈值 (km/h)
        'min_samples': 3,           # 最少样本数
    })
    
    def evaluate(self, context: AlertContext) -> bool:
        gates = self._get_target_gates(context)
        for gate_id, stat in gates.items():
            avg_speed = getattr(stat, 'avg_speed', 0)
            samples = len(getattr(stat, 'recent_speeds', []))
            threshold = self.get_param('threshold_kmh', 40.0)
            min_samples = self.get_param('min_samples', 3)
            
            if samples >= min_samples and avg_speed < threshold:
                return True
        return False
    
    def _get_target_gates(self, context: AlertContext) -> dict:
        """获取目标门架"""
        if self.gate_id == '*':
            return context.gate_stats
        if self.gate_id in context.gate_stats:
            return {self.gate_id: context.gate_stats[self.gate_id]}
        return {}


@register_condition
@dataclass
class SpeedStdDevHigh(Condition):
    """速度标准差过高（不稳定流）
    
    当门架处速度波动大时触发，预示可能产生交通震荡波。
    """
    condition_type: str = 'speed_std_high'
    description: str = '速度标准差过高（不稳定流）'
    default_params: Dict[str, Any] = field(default_factory=lambda: {
        'std_threshold_kmh': 15.0,  # 标准差阈值 (km/h)
        'min_samples': 5,           # 最少样本数
    })
    
    def evaluate(self, context: AlertContext) -> bool:
        for gate_id, stat in self._get_target_gates(context).items():
            speeds = list(getattr(stat, 'recent_speeds', []))
            min_samples = self.get_param('min_samples', 5)
            
            if len(speeds) < min_samples:
                continue
                
            mean = sum(speeds) / len(speeds)
            variance = sum((s - mean) ** 2 for s in speeds) / len(speeds)
            std = math.sqrt(variance) if variance > 0 else 0
            
            if std > self.get_param('std_threshold_kmh', 15.0):
                return True
        return False
    
    def _get_target_gates(self, context: AlertContext) -> dict:
        if self.gate_id == '*':
            return context.gate_stats
        if self.gate_id in context.gate_stats:
            return {self.gate_id: context.gate_stats[self.gate_id]}
        return {}


# ==================== 行程时间类条件 ====================

@register_condition
@dataclass
class TravelTimeOutlier(Condition):
    """行程时间离群检测
    
    基于 Z-score 检测门架区间通行时间是否异常偏高。
    """
    condition_type: str = 'travel_time_outlier'
    description: str = '行程时间显著偏高'
    default_params: Dict[str, Any] = field(default_factory=lambda: {
        'z_score_threshold': 2.5,   # Z-score 阈值
        'ratio_threshold': 1.5,     # 比例阈值（相对均值）
        'min_samples': 5,           # 最少样本数
    })
    
    def evaluate(self, context: AlertContext) -> bool:
        for gate_id, stat in self._get_target_gates(context).items():
            tt_list = list(getattr(stat, 'recent_travel_times', []))
            min_samples = self.get_param('min_samples', 5)
            
            if len(tt_list) < min_samples:
                continue
            
            avg_tt = getattr(stat, 'avg_travel_time', 0)
            std_tt = getattr(stat, 'std_travel_time', 0)
            
            if std_tt < 0.1 or avg_tt <= 0:
                continue
            
            # 检查最近一次行程时间
            latest_tt = tt_list[-1]
            z_score = (latest_tt - avg_tt) / std_tt
            ratio = latest_tt / avg_tt
            
            z_threshold = self.get_param('z_score_threshold', 2.5)
            ratio_threshold = self.get_param('ratio_threshold', 1.5)
            
            if z_score > z_threshold or ratio > ratio_threshold:
                return True
        return False
    
    def _get_target_gates(self, context: AlertContext) -> dict:
        if self.gate_id == '*':
            return context.gate_stats
        if self.gate_id in context.gate_stats:
            return {self.gate_id: context.gate_stats[self.gate_id]}
        return {}


# ==================== 流量类条件 ====================

@register_condition
@dataclass
class FlowImbalance(Condition):
    """上下游流量不平衡
    
    当下游流量显著低于上游时，说明区间内可能有车辆滞留。
    """
    condition_type: str = 'flow_imbalance'
    description: str = '上下游流量不平衡'
    default_params: Dict[str, Any] = field(default_factory=lambda: {
        'ratio_threshold': 0.5,     # 流量比阈值 (下游/上游 < 此值触发)
        'time_window_s': 60.0,      # 分析时间窗口（秒）
        'min_upstream_count': 5,    # 上游最少车流量
    })
    
    def evaluate(self, context: AlertContext) -> bool:
        # 获取排序后的门架列表
        sorted_gates = sorted(
            context.gate_stats.items(),
            key=lambda x: getattr(x[1], 'position_km', 0)
        )
        
        if len(sorted_gates) < 2:
            return False
        
        time_window = self.get_param('time_window_s', 60.0)
        ratio_threshold = self.get_param('ratio_threshold', 0.5)
        min_count = self.get_param('min_upstream_count', 5)
        current_time = context.current_time
        
        for i in range(len(sorted_gates) - 1):
            up_id = sorted_gates[i][0]
            down_id = sorted_gates[i + 1][0]
            
            # 仅检查目标门架
            if self.gate_id != '*' and self.gate_id not in (up_id, down_id):
                continue
            
            up_count = sum(
                1 for t in context.recent_transactions
                if t.gate_id == up_id and current_time - t.timestamp <= time_window
            )
            down_count = sum(
                1 for t in context.recent_transactions
                if t.gate_id == down_id and current_time - t.timestamp <= time_window
            )
            
            if up_count >= min_count:
                ratio = down_count / up_count
                if ratio < ratio_threshold:
                    return True
        
        return False


# ==================== 连续异常类条件 ====================

@register_condition
@dataclass
class ConsecutiveAlerts(Condition):
    """连续异常次数过多
    
    检测指定门架是否有连续多辆车出现异常。
    """
    condition_type: str = 'consecutive_alerts'
    description: str = '连续异常次数超限'
    default_params: Dict[str, Any] = field(default_factory=lambda: {
        'count_threshold': 3,       # 连续异常计数阈值
    })
    
    def evaluate(self, context: AlertContext) -> bool:
        threshold = self.get_param('count_threshold', 3)
        
        for gate_id, stat in self._get_target_gates(context).items():
            consecutive = getattr(stat, 'consecutive_outliers', 0)
            if consecutive >= threshold:
                return True
        return False
    
    def _get_target_gates(self, context: AlertContext) -> dict:
        if self.gate_id == '*':
            return context.gate_stats
        if self.gate_id in context.gate_stats:
            return {self.gate_id: context.gate_stats[self.gate_id]}
        return {}


# ==================== 排队类条件 ====================

@register_condition
@dataclass
class QueueLengthExceeds(Condition):
    """排队长度超限
    
    检测某个区间的排队长度是否超过阈值。
    """
    condition_type: str = 'queue_length_exceeds'
    description: str = '排队长度超限'
    default_params: Dict[str, Any] = field(default_factory=lambda: {
        'length_threshold_m': 500.0,  # 排队长度阈值（米）
    })
    
    def evaluate(self, context: AlertContext) -> bool:
        threshold = self.get_param('length_threshold_m', 500.0)
        
        for gate_id, length in context.queue_lengths.items():
            if self.gate_id != '*' and gate_id != self.gate_id:
                continue
            if length >= threshold:
                return True
        return False


# ==================== 区间速度类条件 ====================

@register_condition
@dataclass
class SegmentSpeedDrop(Condition):
    """区间平均速度骤降
    
    检测某个路段区间内车辆的平均速度是否低于阈值。
    基于区间内所有车辆实时速度计算。
    """
    condition_type: str = 'segment_speed_drop'
    description: str = '区间平均速度骤降'
    default_params: Dict[str, Any] = field(default_factory=lambda: {
        'threshold_kmh': 30.0,      # 区间平均速度阈值 (km/h)
        'segment_idx': -1,          # 目标区间 (-1 = 所有区间)
    })
    
    def evaluate(self, context: AlertContext) -> bool:
        threshold_ms = self.get_param('threshold_kmh', 30.0) / 3.6
        target_seg = self.get_param('segment_idx', -1)
        
        for seg_idx, avg_speed in context.segment_avg_speeds.items():
            if target_seg != -1 and seg_idx != target_seg:
                continue
            if avg_speed < threshold_ms:
                return True
        return False


# ==================== 天气类条件 ====================

@register_condition
@dataclass
class WeatherCondition(Condition):
    """天气条件
    
    检测当前天气是否为指定类型（用于组合规则，例如雨天+低速=高风险）。
    """
    condition_type: str = 'weather_condition'
    description: str = '天气条件匹配'
    default_params: Dict[str, Any] = field(default_factory=lambda: {
        'weather_types': ['rain', 'fog', 'snow'],  # 匹配的天气类型列表
    })
    
    def evaluate(self, context: AlertContext) -> bool:
        target_types = self.get_param('weather_types', ['rain', 'fog', 'snow'])
        return context.weather_type in target_types


# ==================== 噪声类条件 ====================

@register_condition
@dataclass
class HighMissedReadRate(Condition):
    """漏读率过高
    
    检测 ETC 系统漏读率是否超过阈值，可能表示硬件故障。
    """
    condition_type: str = 'high_missed_read_rate'
    description: str = 'ETC 漏读率过高'
    default_params: Dict[str, Any] = field(default_factory=lambda: {
        'rate_threshold': 0.1,      # 漏读率阈值 (10%)
    })
    
    def evaluate(self, context: AlertContext) -> bool:
        rate = context.noise_stats.get('missed_read_rate_actual', 0)
        threshold = self.get_param('rate_threshold', 0.1)
        return rate > threshold


def get_all_condition_types() -> List[Dict[str, Any]]:
    """获取所有已注册的条件类型定义
    
    Returns:
        条件类型列表，每项包含 type、description、default_params
    """
    result = []
    for cond_type, cond_cls in CONDITION_REGISTRY.items():
        # 创建一个临时实例来获取默认值
        temp = cond_cls()
        result.append({
            'type': cond_type,
            'description': temp.description,
            'default_params': temp.default_params,
        })
    return result
