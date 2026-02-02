"""
幽灵堵车检测模型
检测无明显障碍物的交通拥堵（幽灵堵车）
"""

from typing import List, Dict, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..core.vehicle import Vehicle


class PhantomJamDetector:
    """幽灵堵车检测器
    
    幽灵堵车（Phantom Jam）是指在没有任何外部障碍物的情况下，
    由于车辆跟驰行为的波动导致的交通拥堵。
    """
    
    SPEED_THRESHOLD = 30  # km/h，无障碍时低于此速度可能是幽灵堵车
    DETECT_DIST = 200     # 前方无障碍检测距离
    
    @classmethod
    def detect_phantom_jam(cls, vehicles: List['Vehicle'], 
                          current_time: float) -> List[Dict]:
        """
        检测幽灵堵车事件
        
        Args:
            vehicles: 车辆列表
            current_time: 当前仿真时间
        
        Returns:
            幽灵堵车事件列表
        """
        jams = []
        
        for v in vehicles:
            speed_kmh = v.speed * 3.6
            
            # 速度低于阈值
            if speed_kmh > cls.SPEED_THRESHOLD:
                continue
            
            # 检查前方是否无障碍
            has_obstacle = False
            for other in vehicles:
                if other.lane == v.lane and other.pos > v.pos:
                    dist = other.pos - v.pos
                    if dist < cls.DETECT_DIST:
                        # 检查前方车辆是否也是慢速
                        if other.speed * 3.6 < cls.SPEED_THRESHOLD:
                            has_obstacle = True
                        break
            
            # 无障碍但速度低，判定为幽灵堵车
            if not has_obstacle:
                jams.append({
                    'time': current_time,
                    'vehicle_id': v.id,
                    'position_km': v.pos / 1000,
                    'speed_kmh': speed_kmh,
                    'lane': v.lane
                })
        
        return jams
    
    @classmethod
    def calc_shockwave_speed(cls, upstream_speed: float, downstream_speed: float,
                            upstream_density: float, downstream_density: float) -> float:
        """
        计算激波传播速度
        
        用于分析幽灵堵车的传播特性
        
        Args:
            upstream_speed: 上游速度 (km/h)
            downstream_speed: 下游速度 (km/h)
            upstream_density: 上游密度 (veh/km)
            downstream_density: 下游密度 (veh/km)
        
        Returns:
            激波速度 (km/h)
        """
        upstream_flow = upstream_speed * upstream_density / 3.6
        downstream_flow = downstream_speed * downstream_density / 3.6
        
        density_diff = downstream_density - upstream_density
        flow_diff = downstream_flow - upstream_flow
        
        if abs(density_diff) < 0.01:
            return 0
        
        shockwave_speed = flow_diff / density_diff * 3.6
        
        return shockwave_speed
