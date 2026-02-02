"""
反应时间异质性模型
"""

import random
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..core.vehicle import Vehicle


class ReactionTimeModel:
    """反应时间异质性模型
    
    不同车辆类型和驾驶风格有不同的反应时间
    """
    
    # 基础反应时间配置（秒）
    BASE_REACTION_TIME = {
        'CAR': (0.8, 1.2),
        'TRUCK': (1.0, 1.5),
        'BUS': (0.9, 1.3),
    }
    
    # 驾驶风格影响因子
    STYLE_FACTORS = {
        'aggressive': (0.8, 0.95),    # 激进型反应更快
        'normal': (1.0, 1.1),
        'conservative': (1.1, 1.3),   # 保守型反应更慢
    }
    
    @classmethod
    def calc_reaction_time(cls, vehicle: 'Vehicle') -> float:
        """
        计算车辆的反应时间
        
        Args:
            vehicle: 车辆对象
        
        Returns:
            反应时间（秒）
        """
        # 基础反应时间
        base_range = cls.BASE_REACTION_TIME.get(vehicle.vehicle_type, (1.0, 1.2))
        base_time = random.uniform(*base_range)
        
        # 驾驶风格影响
        style_factor_range = cls.STYLE_FACTORS.get(vehicle.driver_style, (1.0, 1.0))
        factor = random.uniform(*style_factor_range)
        
        return base_time * factor
    
    @classmethod
    def calc_delayed_acceleration(cls, vehicle: 'Vehicle', target_accel: float,
                                  reaction_time: float = None) -> float:
        """
        计算考虑反应延迟后的实际加速度
        
        Args:
            vehicle: 车辆对象
            target_accel: 目标加速度
            reaction_time: 反应时间（默认计算）
        
        Returns:
            考虑延迟后的加速度
        """
        if reaction_time is None:
            reaction_time = cls.calc_reaction_time(vehicle)
        
        # 反应延迟会导致实际执行的加速度与目标有偏差
        delay_factor = 1.0 - min(reaction_time * 0.1, 0.3)
        
        return target_accel * delay_factor
