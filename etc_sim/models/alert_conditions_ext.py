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


# ==================== 自定义算法脚本条件 ====================

import logging
logger = logging.getLogger(__name__)

@register_condition
@dataclass
class CustomScript(Condition):
    """自定义 Python 算法脚本判断
    
    支持在节点内部直接编写和执行多行 Python 代码或加载模型推理。
    脚本中应当定义一个 `predict(context)` 函数并返回 bool 或预警概率。
    基于哈希值进行重复编译缓存，以保证高频的帧评估性能。
    """
    condition_type: str = 'custom_script'
    description: str = '自定义算法 (Python)'
    default_params: Dict[str, Any] = field(default_factory=lambda: {
        'script': "def predict(context):\n    # Return pre-warning prob\n    return 0.8\n",
    })
    
    # 避免每次 evaluation 重复编译，缓存编译后的执行环境
    _compiled_env: Dict[str, Any] = field(default_factory=dict, repr=False, init=False)
    _script_hash: int = field(default=0, repr=False, init=False)
    
    def evaluate(self, context: AlertContext) -> bool:
        script = self.get_param('script', '')
        if not script.strip():
            return False
            
        current_hash = hash(script)
        if current_hash != self._script_hash:
            # 重新编译代码
            try:
                env = {}
                # 局部命名空间隔离，执行代码生成 predict() 方法
                exec(script, globals(), env)
                if 'predict' not in env or not callable(env['predict']):
                    logger.error("自定义代码节点未正确定义 callable 的 predict(context) 方法！")
                    return False
                self._compiled_env = env
                self._script_hash = current_hash
            except Exception as e:
                logger.error(f"自定义代码节点编译失败: {e}")
                self._script_hash = current_hash # 避免反复提示
                self._compiled_env = {}
                return False
                
        if not self._compiled_env:
            return False
            
        # 构建算法预测时所需的特征化上下文
        input_ctx = self._build_input_ctx(context)
        
        try:
            result = self._compiled_env['predict'](input_ctx)
            # 兼容算法返回的多种类型（布尔值或连续的预警概率）
            if isinstance(result, bool):
                return result
            elif isinstance(result, (int, float)):
                return result > 0.5
            return bool(result)
        except Exception as e:
            logger.error(f"自定义代码节点执行期抛出异常: {e}")
            return False
            
    def _build_input_ctx(self, context: AlertContext) -> dict:
        """从 AlertContext 中提取全量上下文数据，供研究员提取专属算法特征"""
        all_speeds = []
        for stat in getattr(context, 'gate_stats', {}).values():
            if getattr(stat, 'avg_speed', 0) > 0:
                all_speeds.append(stat.avg_speed)

        return {
            'time': getattr(context, 'current_time', 0),
            'weather': getattr(context, 'weather_type', 'clear'),
            'queue_lengths': getattr(context, 'queue_lengths', {}),
            'avg_speed': sum(all_speeds) / len(all_speeds) if all_speeds else 0,
            'traffic_volume': len(getattr(context, 'recent_transactions', [])),
            'gate_stats': {
                k: {
                    'avg_speed': getattr(v, 'avg_speed', 0), 
                    'flow': len(getattr(v, 'recent_speeds', [])),
                } for k, v in getattr(context, 'gate_stats', {}).items()
            },
            # 给予真正的高端研究玩家直接访问整个裸环境状态对象的能力
            'raw_context': context   
        }
