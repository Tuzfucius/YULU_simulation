"""
预警条件扩展模块
新增速度变化率、占有率、车头时距、密度、自定义表达式等条件类。

所有条件通过 @register_condition 自动注册到 CONDITION_REGISTRY。
"""

from dataclasses import dataclass, field
from typing import Dict, Any, List
import math

from .alert_context import AlertContext
from .alert_conditions import Condition, register_condition


# ==================== 速度变化率条件 ====================

@register_condition
@dataclass
class SpeedChangeRate(Condition):
    """速度变化率（加/减速异常）
    
    检测门架处速度变化梯度是否超过阈值。
    direction='decel' 检测急减速，'accel' 检测急加速，'both' 两者均检测。
    """
    condition_type: str = 'speed_change_rate'
    description: str = '速度梯度超阈值（加/减速异常）'
    default_params: Dict[str, Any] = field(default_factory=lambda: {
        'rate_threshold': 10.0,     # 速度变化率阈值 (km/h per step)
        'direction': 'decel',       # 检测方向: 'decel', 'accel', 'both'
        'min_samples': 3,           # 最少样本数
    })
    
    def evaluate(self, context: AlertContext) -> bool:
        direction = self.get_param('direction', 'decel')
        threshold = self.get_param('rate_threshold', 10.0)
        min_samples = self.get_param('min_samples', 3)
        
        for gate_id, stat in self._get_target_gates(context).items():
            speeds = list(getattr(stat, 'recent_speeds', []))
            if len(speeds) < min_samples:
                continue
            
            # 计算相邻速度差
            for i in range(1, len(speeds)):
                delta = speeds[i] - speeds[i - 1]
                if direction == 'decel' and delta < -threshold:
                    return True
                elif direction == 'accel' and delta > threshold:
                    return True
                elif direction == 'both' and abs(delta) > threshold:
                    return True
        return False
    
    def _get_target_gates(self, context: AlertContext) -> dict:
        if self.gate_id == '*':
            return context.gate_stats
        if self.gate_id in context.gate_stats:
            return {self.gate_id: context.gate_stats[self.gate_id]}
        return {}


# ==================== 占有率条件 ====================

@register_condition
@dataclass
class OccupancyHigh(Condition):
    """路段空间占有率过高
    
    基于区间内车辆占用空间比例判断拥堵。
    占有率 = sum(车辆长度) / 路段长度 * 100%
    """
    condition_type: str = 'occupancy_high'
    description: str = '路段空间占有率超限'
    default_params: Dict[str, Any] = field(default_factory=lambda: {
        'threshold_pct': 80.0,      # 占有率阈值 (%)
    })
    
    def evaluate(self, context: AlertContext) -> bool:
        threshold = self.get_param('threshold_pct', 80.0)
        
        # 通过区间车辆数和路段长度估算占有率
        for seg_idx, vehicles in context.segment_vehicles.items():
            if not vehicles:
                continue
            road_length_m = context.segment_lengths.get(seg_idx, 1000.0)
            avg_vehicle_length = 5.0  # 默认车辆长度 5m
            total_vehicle_length = len(vehicles) * avg_vehicle_length
            occupancy = (total_vehicle_length / road_length_m) * 100.0
            
            if occupancy >= threshold:
                return True
        return False


# ==================== 车头时距条件 ====================

@register_condition
@dataclass
class HeadwayAnomaly(Condition):
    """车头时距异常
    
    检测同一车道上前后车的时间间隔是否过短，预示追尾风险。
    """
    condition_type: str = 'headway_anomaly'
    description: str = '车头时距过短（追尾风险）'
    default_params: Dict[str, Any] = field(default_factory=lambda: {
        'min_headway_s': 1.5,       # 最小安全车头时距 (秒)
        'min_violations': 2,        # 最少违规车对数
    })
    
    def evaluate(self, context: AlertContext) -> bool:
        min_headway = self.get_param('min_headway_s', 1.5)
        min_violations = self.get_param('min_violations', 2)
        
        for gate_id, stat in self._get_target_gates(context).items():
            headways = list(getattr(stat, 'recent_headways', []))
            if not headways:
                continue
            
            violations = sum(1 for h in headways if h < min_headway)
            if violations >= min_violations:
                return True
        return False
    
    def _get_target_gates(self, context: AlertContext) -> dict:
        if self.gate_id == '*':
            return context.gate_stats
        if self.gate_id in context.gate_stats:
            return {self.gate_id: context.gate_stats[self.gate_id]}
        return {}


# ==================== 交通密度条件 ====================

@register_condition
@dataclass
class DensityExceeds(Condition):
    """交通密度超过阈值
    
    计算 K = N / L（辆/km），当超过阈值时触发。
    """
    condition_type: str = 'density_exceeds'
    description: str = '交通密度超过阈值'
    default_params: Dict[str, Any] = field(default_factory=lambda: {
        'threshold_veh_km': 80.0,   # 密度阈值 (辆/km)
    })
    
    def evaluate(self, context: AlertContext) -> bool:
        threshold = self.get_param('threshold_veh_km', 80.0)
        
        for seg_idx, vehicles in context.segment_vehicles.items():
            road_length_km = context.segment_lengths.get(seg_idx, 1000.0) / 1000.0
            if road_length_km <= 0:
                continue
            density = len(vehicles) / road_length_km
            if density >= threshold:
                return True
        return False


# ==================== 自定义表达式条件 ====================

@register_condition
@dataclass
class CustomExpression(Condition):
    """自定义表达式判断
    
    用户编写简单的 Python 表达式，在预警上下文中求值。
    可用变量包括：avg_speed, total_flow, queue_length, occupancy 等。
    
    安全性：使用 eval 的受限环境，仅允许数学运算和比较。
    """
    condition_type: str = 'custom_expression'
    description: str = '自定义表达式判断'
    default_params: Dict[str, Any] = field(default_factory=lambda: {
        'expression': 'avg_speed < 30',
    })
    
    def evaluate(self, context: AlertContext) -> bool:
        expr = self.get_param('expression', 'False')
        
        # 构建安全的求值环境
        safe_vars = self._build_safe_context(context)
        
        try:
            # 仅允许内置数学函数
            safe_builtins = {
                'abs': abs, 'min': min, 'max': max,
                'sum': sum, 'len': len, 'round': round,
                'True': True, 'False': False,
            }
            result = eval(expr, {"__builtins__": safe_builtins}, safe_vars)
            return bool(result)
        except Exception:
            return False
    
    def _build_safe_context(self, context: AlertContext) -> dict:
        """从 AlertContext 中提取可用于表达式的变量"""
        safe = {}
        
        # 聚合速度数据
        all_speeds = []
        for stat in context.gate_stats.values():
            avg_speed = getattr(stat, 'avg_speed', 0)
            if avg_speed > 0:
                all_speeds.append(avg_speed)
        
        safe['avg_speed'] = sum(all_speeds) / len(all_speeds) if all_speeds else 0
        safe['min_speed'] = min(all_speeds) if all_speeds else 0
        safe['max_speed'] = max(all_speeds) if all_speeds else 0
        safe['gate_count'] = len(context.gate_stats)
        safe['total_flow'] = len(context.recent_transactions)
        safe['queue_length'] = max(context.queue_lengths.values()) if context.queue_lengths else 0
        safe['current_time'] = context.current_time
        safe['weather'] = context.weather_type
        
        return safe
