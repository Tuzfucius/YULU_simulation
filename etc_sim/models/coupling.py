"""
多车道耦合模型
相邻车道之间的横向影响
"""

from typing import List, TYPE_CHECKING

if TYPE_CHECKING:
    from ..core.vehicle import Vehicle


class MultiLaneCoupling:
    """多车道耦合模型
    
    相邻车道车辆之间存在横向影响，一车减速会影响邻道车辆的行驶
    """
    
    COUPLING_DIST = 50  # 影响距离（米）
    COUPLING_FACTOR = 0.01  # 耦合系数
    
    @classmethod
    def calc_lateral_influence(cls, vehicle: 'Vehicle', 
                               vehicles_nearby: List['Vehicle']) -> float:
        """
        计算相邻车道对本车的横向影响
        
        Args:
            vehicle: 当前车辆
            vehicles_nearby: 附近车辆列表
        
        Returns:
            横向影响加速度修正值
        """
        influence = 0.0
        
        for other in vehicles_nearby:
            if other == vehicle:
                continue
            
            # 只考虑相邻车道
            if abs(other.lane - vehicle.lane) != 1:
                continue
            
            # 计算纵向距离
            dist = other.pos - vehicle.pos
            
            # 只考虑一定范围内的车辆
            if abs(dist) > cls.COUPLING_DIST:
                continue
            
            # 邻道车辆减速会影响本车
            if other.speed < vehicle.speed * 0.9:
                # 距离越近，影响越大
                dist_factor = 1.0 - abs(dist) / cls.COUPLING_DIST
                speed_diff = vehicle.speed - other.speed
                
                influence -= cls.COUPLING_FACTOR * dist_factor * speed_diff * 10
        
        return influence
