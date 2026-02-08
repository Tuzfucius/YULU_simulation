"""
幽灵堵车检测模型
检测无明显障碍物的交通拥堵（幽灵堵车）
优化版：支持基于空间索引的快速检测
"""

from typing import List, Dict, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..core.vehicle import Vehicle
    from ..utils.spatial_index import SpatialIndex


class PhantomJamDetector:
    """幽灵堵车检测器
    
    幽灵堵车（Phantom Jam）是指在没有任何外部障碍物的情况下，
    由于车辆跟驰行为的波动导致的交通拥堵。
    
    优化策略：
    1. 先通过速度阈值快速过滤高速车辆
    2. 使用空间索引仅检查附近车辆，而非全量遍历
    """
    
    SPEED_THRESHOLD = 30  # km/h，无障碍时低于此速度可能是幽灵堵车
    DETECT_DIST = 200     # 前方无障碍检测距离
    
    @classmethod
    def detect_phantom_jam(cls, vehicles: List['Vehicle'], 
                          current_time: float) -> List[Dict]:
        """
        检测幽灵堵车事件（兼容旧接口）
        
        Args:
            vehicles: 车辆列表
            current_time: 当前仿真时间
        
        Returns:
            幽灵堵车事件列表
        """
        jams = []
        
        # 预先按车道分组，减少无效比较
        lane_vehicles: Dict[int, List] = {}
        for v in vehicles:
            if v.lane not in lane_vehicles:
                lane_vehicles[v.lane] = []
            lane_vehicles[v.lane].append(v)
        
        # 对每个车道按位置排序
        for lane in lane_vehicles:
            lane_vehicles[lane].sort(key=lambda x: x.pos)
        
        for v in vehicles:
            speed_kmh = v.speed * 3.6
            
            # 速度低于阈值
            if speed_kmh > cls.SPEED_THRESHOLD:
                continue
            
            # 在同车道的车辆列表中查找前车（已排序，可二分查找优化）
            has_obstacle = False
            same_lane = lane_vehicles.get(v.lane, [])
            for other in same_lane:
                if other.pos > v.pos:
                    dist = other.pos - v.pos
                    if dist < cls.DETECT_DIST:
                        # 检查前方车辆是否也是慢速
                        if other.speed * 3.6 < cls.SPEED_THRESHOLD:
                            has_obstacle = True
                    break  # 由于已排序，第一个pos更大的就是最近前车
            
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
    def detect_phantom_jam_with_index(cls, spatial_index: 'SpatialIndex',
                                      vehicles: List['Vehicle'],
                                      current_time: float) -> List[Dict]:
        """
        使用空间索引检测幽灵堵车事件（优化版）
        
        仅检测高密度区域，大幅减少计算量。
        
        Args:
            spatial_index: 空间索引实例
            vehicles: 车辆列表
            current_time: 当前仿真时间
        
        Returns:
            幽灵堵车事件列表
        """
        jams = []
        
        # 只检测密度较高的区域（可能存在堵车）
        high_density_cells = spatial_index.get_high_density_cells(threshold=3)
        
        checked_vehicles = set()
        
        for lane, cell_idx in high_density_cells:
            # 获取该区域的车辆
            start_pos = cell_idx * spatial_index.cell_size
            end_pos = start_pos + spatial_index.cell_size
            
            cell_vehicles = spatial_index.get_vehicles_in_segment(start_pos, end_pos)
            
            for v in cell_vehicles:
                if v.id in checked_vehicles:
                    continue
                checked_vehicles.add(v.id)
                
                speed_kmh = v.speed * 3.6
                
                if speed_kmh > cls.SPEED_THRESHOLD:
                    continue
                
                # 使用空间索引查找前车
                leader = spatial_index.find_leader(v, search_range=2)
                
                has_obstacle = False
                if leader:
                    dist = leader.pos - v.pos
                    if dist < cls.DETECT_DIST and leader.speed * 3.6 < cls.SPEED_THRESHOLD:
                        has_obstacle = True
                
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

