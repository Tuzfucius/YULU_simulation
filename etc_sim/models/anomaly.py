"""
异常检测模型
"""

import random
from typing import List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..core.vehicle import Vehicle


class AnomalyModel:
    """异常检测模型"""
    
    # 异常类型定义
    TYPE_FULL_STOP = 1      # 完全静止
    TYPE_TEMP_FLUCT = 2     # 短暂波动
    TYPE_LONG_FLUCT = 3     # 长时波动
    
    TYPE_NAMES = {
        TYPE_FULL_STOP: '完全静止',
        TYPE_TEMP_FLUCT: '短暂波动',
        TYPE_LONG_FLUCT: '长时波动',
    }
    
    @classmethod
    def should_be_anomaly(cls, vehicle: 'Vehicle', current_time: float,
                         anomaly_ratio: float = 0.01,
                         global_start: float = 200,
                         safe_run_time: float = 200) -> bool:
        """
        判断车辆是否应该触发异常
        
        Args:
            vehicle: 车辆对象
            current_time: 当前仿真时间
            anomaly_ratio: 异常比例
            global_start: 全局异常开始时间
            safe_run_time: 车辆安全运行时间
        
        Returns:
            是否应该触发异常
        """
        if not vehicle.is_potential_anomaly:
            return False
        
        if current_time < global_start:
            return False
        
        if (current_time - vehicle.entry_time) < safe_run_time:
            return False
        
        return random.random() < 0.005
    
    @classmethod
    def get_anomaly_type(cls, vehicle: 'Vehicle') -> int:
        """
        获取异常类型
        
        Args:
            vehicle: 车辆对象
        
        Returns:
            异常类型 (1/2/3)
        """
        r = random.random()
        if r < 0.33:
            return cls.TYPE_FULL_STOP
        elif r < 0.66:
            return cls.TYPE_TEMP_FLUCT
        else:
            return cls.TYPE_LONG_FLUCT
    
    @classmethod
    def get_anomaly_duration(cls, anomaly_type: int) -> float:
        """
        获取异常持续时间
        
        Args:
            anomaly_type: 异常类型
        
        Returns:
            持续时间（秒）
        """
        if anomaly_type == cls.TYPE_FULL_STOP:
            return 999999  # 永久
        elif anomaly_type == cls.TYPE_TEMP_FLUCT:
            return 10
        else:
            return 20
    
    @classmethod
    def get_target_speed(cls, anomaly_type: int) -> float:
        """
        获取异常时的目标速度
        
        Args:
            anomaly_type: 异常类型
        
        Returns:
            目标速度 (m/s)
        """
        if anomaly_type == cls.TYPE_FULL_STOP:
            return 0
        else:
            return random.uniform(0, 40) / 3.6
