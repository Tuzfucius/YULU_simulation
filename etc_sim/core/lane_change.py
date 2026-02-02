"""
换道模型
MOBIL (Minimizing Overall Braking Induced by Lane changes)
"""

from typing import List, Optional, TYPE_CHECKING, Tuple

if TYPE_CHECKING:
    from .vehicle import Vehicle


class MOBILModel:
    """MOBIL换道模型 (Minimizing Overall Braking Induced by Lane changes)"""
    
    @staticmethod
    def decide_lane_change(vehicle: 'Vehicle', vehicles_nearby: List['Vehicle'],
                          current_lane: int, blocked_lanes: dict = None,
                          politeness: float = 0.5) -> Tuple[Optional[int], Optional[str]]:
        """
        MOBIL换道决策
        
        Args:
            vehicle: 当前车辆
            vehicles_nearby: 附近车辆列表
            current_lane: 当前车道
            blocked_lanes: 阻塞车道字典
            politeness: 礼貌系数 (0=激进, 1=保守)
        
        Returns:
            (目标车道, 换道原因) 或 (None, None)
        """
        if blocked_lanes is None:
            blocked_lanes = {}
        
        leader = MOBILModel._find_leader(vehicle, vehicles_nearby, current_lane)
        
        # 前方有静止车辆，强制换道
        if leader and leader.anomaly_type == 1:
            target_lane = MOBILModel._try_emergency_change(
                vehicle, vehicles_nearby, current_lane, blocked_lanes
            )
            if target_lane is not None:
                return target_lane, 'forced'
        
        # 评估所有相邻车道
        best_gain = MOBILModel._calc_lane_gain(
            vehicle, vehicles_nearby, current_lane, leader, current_lane
        )
        target_lane = None
        
        for candidate in [current_lane - 1, current_lane + 1]:
            if 0 <= candidate < 4:  # 假设4车道
                if MOBILModel._can_change_to(
                    vehicle, vehicles_nearby, candidate, blocked_lanes
                ):
                    gain = MOBILModel._calc_lane_gain(
                        vehicle, vehicles_nearby, candidate, leader, current_lane
                    )
                    
                    # 考虑礼貌系数
                    threshold = 0.1 + 0.4 * (1 - politeness)
                    
                    if gain > best_gain + threshold:
                        best_gain = gain
                        target_lane = candidate
        
        if target_lane is not None:
            return target_lane, 'free'
        return None, None
    
    @staticmethod
    def _find_leader(vehicle: 'Vehicle', vehicles_nearby: List['Vehicle'],
                    lane: int) -> Optional['Vehicle']:
        """找指定车道前车"""
        min_dist = float('inf')
        leader = None
        for v in vehicles_nearby:
            if v.lane == lane and v.pos > vehicle.pos:
                dist = v.pos - vehicle.pos
                if dist < min_dist:
                    min_dist = dist
                    leader = v
        return leader
    
    @staticmethod
    def _find_follower(vehicle: 'Vehicle', vehicles_nearby: List['Vehicle'],
                      lane: int) -> Optional['Vehicle']:
        """找指定车道后车"""
        min_dist = float('inf')
        follower = None
        for v in vehicles_nearby:
            if v.lane == lane and v.pos < vehicle.pos:
                dist = vehicle.pos - v.pos
                if dist < min_dist:
                    min_dist = dist
                    follower = v
        return follower
    
    @staticmethod
    def _calc_lane_gain(vehicle: 'Vehicle', vehicles_nearby: List['Vehicle'],
                       target_lane: int, current_leader: Optional['Vehicle'],
                       current_lane: int) -> float:
        """
        计算换到目标车道的收益
        收益 = 新车道加速度 - 原车道加速度 - 对后车影响 - 换道惩罚
        """
        # 原车道加速度
        a_current = 0
        if current_leader:
            a_current = vehicle.idm_calc_acceleration(current_leader, vehicle.speed)
        else:
            a_current = vehicle.a_max
        
        # 新车道加速度
        new_leader = MOBILModel._find_leader(vehicle, vehicles_nearby, target_lane)
        a_new = 0
        if new_leader:
            a_new = vehicle.idm_calc_acceleration(new_leader, vehicle.speed)
        else:
            a_new = vehicle.a_max
        
        # 对新车道后车的影响
        follower = MOBILModel._find_follower(vehicle, vehicles_nearby, target_lane)
        a_follower_current = 0
        a_follower_new = 0
        
        if follower:
            a_follower_current = follower.idm_calc_acceleration(
                vehicle if vehicle.lane == target_lane else None,
                follower.speed
            )
            
            if vehicle.lane != target_lane:
                # 模拟换道后follower的新前车
                new_follower_leader = MOBILModel._find_leader(
                    vehicle, vehicles_nearby, target_lane
                )
                if new_follower_leader:
                    a_follower_new = follower.idm_calc_acceleration(
                        new_follower_leader, follower.speed
                    )
        
        # MOBIL核心公式
        gain = (a_new - a_current) - vehicle.politeness * (a_follower_new - a_follower_current) - 0.001
        
        return gain
    
    @staticmethod
    def _can_change_to(vehicle: 'Vehicle', vehicles_nearby: List['Vehicle'],
                      target_lane: int, blocked_lanes: dict) -> bool:
        """检查是否能换道到目标车道"""
        if target_lane in blocked_lanes:
            for pos in blocked_lanes[target_lane]:
                if abs(pos - vehicle.pos) < 100:
                    return False
        
        gap = 25  # 最小间隙
        
        for v in vehicles_nearby:
            if v.lane == target_lane:
                dist = abs(v.pos - vehicle.pos)
                if dist < gap:
                    return False
        return True
    
    @staticmethod
    def _try_emergency_change(vehicle: 'Vehicle', vehicles_nearby: List['Vehicle'],
                             current_lane: int, blocked_lanes: dict) -> Optional[int]:
        """紧急换道（前方有障碍）"""
        for candidate in [current_lane - 1, current_lane + 1]:
            if 0 <= candidate < 4:
                if MOBILModel._can_change_to(vehicle, vehicles_nearby, candidate, blocked_lanes):
                    return candidate
        return None
