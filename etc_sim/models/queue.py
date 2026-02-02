"""
排队检测模型
检测交通排队状态和消散过程
"""

from typing import List, Dict, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..core.vehicle import Vehicle


class QueueFormationModel:
    """排队检测与消散模型"""
    
    SPEED_THRESHOLD = 15  # km/h，低于此速度判定为排队
    MIN_VEHICLES = 3      # 最少车辆数形成排队
    DISSIPATION_RATE = 0.8  # 排队消散率
    
    @classmethod
    def detect_queue_state(cls, vehicles: List['Vehicle']) -> Dict:
        """
        检测当前排队状态
        
        Args:
            vehicles: 车辆列表
        
        Returns:
            排队状态字典
        """
        if len(vehicles) < cls.MIN_VEHICLES:
            return {
                'in_queue': False,
                'queue_start': None,
                'queue_end': None,
                'queue_length': 0,
                'queue_vehicles': []
            }
        
        # 按位置排序
        sorted_vehicles = sorted(vehicles, key=lambda v: v.pos)
        
        # 查找排队车辆
        queue_vehicles = []
        queue_start_pos = None
        queue_end_pos = None
        
        for v in sorted_vehicles:
            speed_kmh = v.speed * 3.6
            if speed_kmh < cls.SPEED_THRESHOLD:
                queue_vehicles.append(v)
                if queue_start_pos is None:
                    queue_start_pos = v.pos
                queue_end_pos = v.pos
        
        if len(queue_vehicles) < cls.MIN_VEHICLES:
            return {
                'in_queue': False,
                'queue_start': None,
                'queue_end': None,
                'queue_length': 0,
                'queue_vehicles': []
            }
        
        return {
            'in_queue': True,
            'queue_start': queue_start_pos,
            'queue_end': queue_end_pos,
            'queue_length': queue_end_pos - queue_start_pos if queue_end_pos and queue_start_pos else 0,
            'queue_vehicles': queue_vehicles
        }
    
    @classmethod
    def calc_queue_dissipation_time(cls, queue_length: float, 
                                   headway: float = 2.0) -> float:
        """
        计算排队消散时间
        
        Args:
            queue_length: 排队长度（米）
            headway: 车辆平均间距（秒）
        
        Returns:
            消散时间（秒）
        """
        if queue_length <= 0:
            return 0
        
        # 假设排队以正常速度消散
        normal_speed = 80 / 3.6  # 80 km/h
        dissipation_time = queue_length / normal_speed
        
        return dissipation_time
