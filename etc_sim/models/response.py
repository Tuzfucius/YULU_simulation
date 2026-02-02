"""
响应强度异质性模型
"""

import random
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..core.vehicle import Vehicle


class ResponseIntensityModel:
    """响应强度异质性模型
    
    不同驾驶风格在紧急情况下有不同的制动响应强度
    """
    
    # 驾驶风格对应的强度因子
    INTENSITY_FACTOR = {
        'aggressive': 1.2,   # 激进型：急刹
        'normal': 1.0,       # 普通型：正常
        'conservative': 0.8, # 保守型：缓刹
    }
    
    @classmethod
    def calc_response_deceleration(cls, base_decel: float, driver_style: str,
                                   emergency: bool = False) -> float:
        """
        计算考虑驾驶风格的响应减速度
        
        Args:
            base_decel: 基础减速度
            driver_style: 驾驶风格
            emergency: 是否紧急情况
        
        Returns:
            实际减速度
        """
        factor = cls.INTENSITY_FACTOR.get(driver_style, 1.0)
        
        if emergency:
            factor *= 1.2  # 紧急情况反应更强烈
        
        return base_decel * factor
    
    @classmethod
    def calc_brake_intensity(cls, vehicle: 'Vehicle', situation: str = 'normal') -> float:
        """
        计算制动强度
        
        Args:
            vehicle: 车辆对象
            situation: 情况类型 ('normal', 'warning', 'emergency')
        
        Returns:
            制动强度因子
        """
        base_intensity = 1.0
        
        if situation == 'warning':
            base_intensity = 0.5
        elif situation == 'emergency':
            base_intensity = 1.0
        
        style_factor = cls.INTENSITY_FACTOR.get(vehicle.driver_style, 1.0)
        
        return base_intensity * style_factor
