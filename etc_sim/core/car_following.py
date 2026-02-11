"""
跟驰模型
IDM (Intelligent Driver Model)
"""

import math
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from .vehicle import Vehicle


class IDMModel:
    """智能驾驶员模型 (Intelligent Driver Model)"""
    
    @staticmethod
    def calc_acceleration(vehicle: 'Vehicle', leader: Optional['Vehicle'], 
                         current_speed: float = None) -> float:
        """
        计算IDM加速度
        
        Args:
            vehicle: 车辆对象
            leader: 前车对象
            current_speed: 当前速度（默认使用车辆实际速度）
        
        Returns:
            加速度值 (m/s²)
        """
        if current_speed is None:
            current_speed = vehicle.speed
        
        if leader is None:
            return vehicle.a_max
        
        v = current_speed
        v0 = vehicle.v0
        a_max = vehicle.a_max * vehicle.aggressiveness_range[0]
        b = vehicle.b_desired
        
        # 前方有静止异常车辆：基于距离的分阶段制动
        if leader.anomaly_type == 1 and leader.anomaly_state == 'active':
            dist = leader.pos - vehicle.pos
            s = max(dist - vehicle.length / 2 - leader.length / 2, 0.5)
            
            if s > 200:  # 远距离：轻微减速
                return max(-1.5, -v * 0.1)
            elif s > 100:  # 中距离：中等减速
                ratio = (200 - s) / 100
                return -1.5 - 2.5 * ratio  # -1.5 → -4.0
            elif s > 30:  # 近距离：强力减速
                ratio = (100 - s) / 70
                return -4.0 - 3.0 * ratio  # -4.0 → -7.0
            else:  # 极近距离：紧急制动
                return -7.0
        
        # 速度差和距离
        delta_v = v - leader.speed
        dist = leader.pos - vehicle.pos
        s = max(dist - vehicle.length / 2 - leader.length / 2, 0.5)
        
        # 期望跟车距离
        s_star = (vehicle.s0 + v * vehicle.T + 
                  v * delta_v / (2 * math.sqrt(a_max * b)))
        
        # 速度比和距离比
        ratio_v = (v / v0) ** vehicle.delta
        ratio_s = (s_star / s) ** 2
        
        # IDM加速度公式
        accel = a_max * (1 - ratio_v - ratio_s)
        
        # 紧急情况判断
        time_gap = s / max(v, 0.1)
        is_emergency = time_gap < 1.5 or delta_v > 3
        
        if is_emergency:
            accel *= 1.2
        
        # 限制加速度范围
        return max(-7.0, min(a_max * 1.5, accel))
    
    @staticmethod
    def calc_desired_spacing(vehicle: 'Vehicle', leader_speed: float, 
                            current_speed: float) -> float:
        """
        计算期望跟车距离
        
        Args:
            vehicle: 当前车辆
            leader_speed: 前车速度
            current_speed: 当前速度
        
        Returns:
            期望跟车距离 (m)
        """
        s0 = vehicle.s0
        T = vehicle.T
        v = current_speed
        delta_v = v - leader_speed
        
        s_star = s0 + v * T + (v * delta_v) / (2 * math.sqrt(vehicle.a_max * vehicle.b_desired))
        
        return max(s0, s_star)
