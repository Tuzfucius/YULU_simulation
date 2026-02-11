"""
事故与施工场景模型

支持：
- 多车连锁事故模型（追尾连锁碰撞）
- 施工区域限速（占用车道 + 限速区 + 引导变道）
- 抛锚渐停模型（车辆逐渐减速到停止）
- 事故清除逻辑（事故后 N 秒清除，车道逐步恢复）
"""

import random
from typing import List, Dict, Optional
from dataclasses import dataclass, field
from enum import Enum


class IncidentType(Enum):
    """事件类型"""
    SINGLE_STOP = "single_stop"       # 单车抛锚
    CHAIN_COLLISION = "chain_collision" # 多车连锁追尾
    BREAKDOWN_GRADUAL = "breakdown"     # 渐停抛锚
    CONSTRUCTION = "construction"       # 施工区域


@dataclass
class Incident:
    """事故/施工事件"""
    incident_id: int
    incident_type: IncidentType
    position_m: float           # 事件位置（米）
    lane: int                   # 事件所在车道（-1 表示跨车道）
    affected_lanes: List[int]   # 影响的所有车道
    start_time: float           # 事件开始时间
    duration: float             # 事件持续时间（秒）
    speed_limit: float          # 限速（m/s, 0=完全停止）
    warning_distance: float     # 上游预警距离（米）
    cleared: bool = False       # 是否已清除
    vehicles_involved: List[int] = field(default_factory=list)
    
    @property
    def end_time(self) -> float:
        return self.start_time + self.duration
    
    @property
    def is_active(self) -> bool:
        return not self.cleared


@dataclass
class ConstructionZone:
    """施工区域"""
    zone_id: int
    start_position_m: float   # 施工起点
    end_position_m: float     # 施工终点
    closed_lanes: List[int]   # 关闭的车道
    speed_limit_ms: float     # 限速（m/s）
    start_time: float         # 施工开始时间
    end_time: float           # 施工结束时间
    taper_length_m: float = 500.0  # 变道引导区长度
    
    @property
    def warning_start(self) -> float:
        """预警区起点"""
        return self.start_position_m - self.taper_length_m - 500
    
    @property
    def taper_start(self) -> float:
        """引导变道区起点"""
        return self.start_position_m - self.taper_length_m
    
    @property
    def length(self) -> float:
        return self.end_position_m - self.start_position_m
    
    def is_active(self, current_time: float) -> bool:
        return self.start_time <= current_time <= self.end_time
    
    def is_in_zone(self, position_m: float) -> bool:
        return self.start_position_m <= position_m <= self.end_position_m
    
    def is_in_warning_area(self, position_m: float) -> bool:
        return self.warning_start <= position_m < self.start_position_m
    
    def is_in_taper_area(self, position_m: float) -> bool:
        return self.taper_start <= position_m < self.start_position_m


class IncidentManager:
    """事故/施工事件管理器"""
    
    def __init__(self, num_lanes: int = 4, road_length_m: float = 20000):
        self.num_lanes = num_lanes
        self.road_length_m = road_length_m
        self.incidents: List[Incident] = []
        self.construction_zones: List[ConstructionZone] = []
        self.next_incident_id = 0
        self.next_zone_id = 0
    
    def add_construction_zone(self, start_m: float, end_m: float,
                              closed_lanes: List[int],
                              speed_limit_kmh: float = 60,
                              start_time: float = 0,
                              end_time: float = float('inf'),
                              taper_length: float = 500) -> ConstructionZone:
        """添加施工区域"""
        zone = ConstructionZone(
            zone_id=self.next_zone_id,
            start_position_m=start_m,
            end_position_m=end_m,
            closed_lanes=closed_lanes,
            speed_limit_ms=speed_limit_kmh / 3.6,
            start_time=start_time,
            end_time=end_time,
            taper_length_m=taper_length
        )
        self.construction_zones.append(zone)
        self.next_zone_id += 1
        return zone
    
    def create_breakdown(self, vehicle_id: int, position_m: float, lane: int,
                         current_time: float, is_gradual: bool = True,
                         clear_time: float = 300) -> Incident:
        """
        创建抛锚事件
        
        Args:
            vehicle_id: 抛锚车辆ID
            position_m: 位置
            lane: 车道
            current_time: 当前时间
            is_gradual: 是否渐停
            clear_time: 清除时间（秒）
        """
        incident = Incident(
            incident_id=self.next_incident_id,
            incident_type=IncidentType.BREAKDOWN_GRADUAL if is_gradual else IncidentType.SINGLE_STOP,
            position_m=position_m,
            lane=lane,
            affected_lanes=[lane],
            start_time=current_time,
            duration=clear_time,
            speed_limit=0,
            warning_distance=500,
            vehicles_involved=[vehicle_id]
        )
        self.incidents.append(incident)
        self.next_incident_id += 1
        return incident
    
    def create_chain_collision(self, vehicle_ids: List[int], 
                               position_m: float, lanes: List[int],
                               current_time: float,
                               clear_time: float = 600) -> Incident:
        """
        创建多车连锁追尾事故
        
        Args:
            vehicle_ids: 涉及车辆ID列表
            position_m: 事故中心位置
            lanes: 涉及车道
            current_time: 当前时间
            clear_time: 清除时间（秒）
        """
        incident = Incident(
            incident_id=self.next_incident_id,
            incident_type=IncidentType.CHAIN_COLLISION,
            position_m=position_m,
            lane=lanes[0],
            affected_lanes=lanes,
            start_time=current_time,
            duration=clear_time,
            speed_limit=0,
            warning_distance=800,  # 连锁事故预警距离更大
            vehicles_involved=vehicle_ids
        )
        self.incidents.append(incident)
        self.next_incident_id += 1
        return incident
    
    def check_chain_collision(self, vehicles: list, current_time: float,
                               ttc_threshold: float = 0.5,
                               min_speed_diff: float = 10.0) -> Optional[Incident]:
        """
        检测是否发生连锁追尾
        
        条件：多辆车 TTC < 阈值 且 速度差较大
        
        Args:
            vehicles: 车辆列表
            current_time: 当前时间
            ttc_threshold: TTC 阈值（秒）
            min_speed_diff: 最小速度差（m/s）
        """
        # 按车道和位置排序
        lane_groups: Dict[int, list] = {}
        for v in vehicles:
            if v.finished:
                continue
            lane_groups.setdefault(v.lane, []).append(v)
        
        for lane, lane_vehicles in lane_groups.items():
            lane_vehicles.sort(key=lambda v: v.pos)
            
            chain = []
            for i in range(len(lane_vehicles) - 1):
                follower = lane_vehicles[i]
                leader = lane_vehicles[i + 1]
                
                dist = leader.pos - follower.pos
                speed_diff = follower.speed - leader.speed
                
                if speed_diff > min_speed_diff and dist < speed_diff * ttc_threshold:
                    if not chain:
                        chain = [leader.id]
                    chain.append(follower.id)
                else:
                    if len(chain) >= 3:
                        # 发生连锁追尾
                        pos = lane_vehicles[i].pos
                        affected_lanes = list(set(v.lane for v in lane_vehicles 
                                                  if v.id in chain))
                        return self.create_chain_collision(
                            chain, pos, affected_lanes, current_time
                        )
                    chain = []
            
            # 检查最后的链
            if len(chain) >= 3:
                pos = lane_vehicles[-1].pos
                return self.create_chain_collision(
                    chain, pos, [lane], current_time
                )
        
        return None
    
    def update(self, current_time: float):
        """更新事件状态，处理清除逻辑"""
        for incident in self.incidents:
            if incident.is_active and current_time >= incident.end_time:
                incident.cleared = True
    
    def get_active_incidents(self, current_time: float) -> List[Incident]:
        """获取当前活跃的事件"""
        return [i for i in self.incidents if i.is_active and i.start_time <= current_time]
    
    def get_active_construction(self, current_time: float) -> List[ConstructionZone]:
        """获取当前活跃的施工区域"""
        return [z for z in self.construction_zones if z.is_active(current_time)]
    
    def get_blocked_lanes(self, current_time: float) -> Dict[int, List[float]]:
        """
        获取被阻塞的车道及其位置
        
        Returns:
            {车道号: [阻塞位置列表]}
        """
        blocked: Dict[int, List[float]] = {}
        
        for incident in self.get_active_incidents(current_time):
            for lane in incident.affected_lanes:
                blocked.setdefault(lane, []).append(incident.position_m)
        
        for zone in self.get_active_construction(current_time):
            for lane in zone.closed_lanes:
                # 施工区域整段阻塞：用多个点表示
                pos = zone.start_position_m
                while pos <= zone.end_position_m:
                    blocked.setdefault(lane, []).append(pos)
                    pos += 100
        
        return blocked
    
    def get_speed_limit_at(self, position_m: float, lane: int,
                           current_time: float) -> Optional[float]:
        """
        获取指定位置的限速
        
        Returns:
            限速 (m/s)，若无限速则返回 None
        """
        min_limit = None
        
        # 检查施工区域
        for zone in self.get_active_construction(current_time):
            if zone.is_in_zone(position_m):
                if lane in zone.closed_lanes:
                    return 0  # 车道关闭
                if min_limit is None or zone.speed_limit_ms < min_limit:
                    min_limit = zone.speed_limit_ms
            elif zone.is_in_warning_area(position_m):
                # 预警区域：限速更宽松
                warn_limit = zone.speed_limit_ms * 1.5
                if min_limit is None or warn_limit < min_limit:
                    min_limit = warn_limit
        
        # 检查事故区域
        for incident in self.get_active_incidents(current_time):
            if lane in incident.affected_lanes:
                dist = abs(position_m - incident.position_m)
                if dist < 50:
                    return 0  # 事故现场
                elif dist < incident.warning_distance:
                    # 距事故越近限速越低
                    ratio = dist / incident.warning_distance
                    limit = ratio * 30 / 3.6  # 0 → 30km/h
                    if min_limit is None or limit < min_limit:
                        min_limit = limit
        
        return min_limit
    
    def should_vehicle_change_lane(self, position_m: float, lane: int,
                                   current_time: float) -> bool:
        """检查车辆是否需要因施工/事故而变道"""
        for zone in self.get_active_construction(current_time):
            if lane in zone.closed_lanes:
                if zone.is_in_taper_area(position_m) or zone.is_in_zone(position_m):
                    return True
        
        for incident in self.get_active_incidents(current_time):
            if lane in incident.affected_lanes:
                dist = position_m - incident.position_m
                if -incident.warning_distance < dist < 0:
                    return True
        
        return False
    
    def get_summary(self) -> dict:
        """获取事件管理器统计摘要"""
        active_incidents = [i for i in self.incidents if i.is_active]
        cleared_incidents = [i for i in self.incidents if i.cleared]
        
        return {
            'total_incidents': len(self.incidents),
            'active_incidents': len(active_incidents),
            'cleared_incidents': len(cleared_incidents),
            'construction_zones': len(self.construction_zones),
            'incident_types': {
                t.value: sum(1 for i in self.incidents if i.incident_type == t)
                for t in IncidentType
            }
        }
