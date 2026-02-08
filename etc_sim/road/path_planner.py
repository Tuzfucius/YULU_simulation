"""
路径规划与车辆分流模块
管理车辆在复杂路网中的路径选择和换道触发

核心功能：
- 路径分配（基于权重随机或固定）
- 分流点前换道触发
- 合流点冲突检测
"""

import random
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
from enum import Enum

from .graph import RoadGraph, NodeType, VehiclePath


class PathSelectionMode(Enum):
    """路径选择模式"""
    RANDOM_WEIGHTED = "random_weighted"  # 按权重随机
    FIXED = "fixed"                       # 固定路径
    SHORTEST = "shortest"                 # 最短路径


@dataclass
class DivergeDecision:
    """分流决策
    
    Attributes:
        should_exit: 是否应该驶出
        target_lane: 目标车道（0 = 最右车道，用于驶出）
        decision_distance_km: 决策距离（在多远处开始换道）
        urgency: 紧急程度 (0.0-1.0)
    """
    should_exit: bool
    target_lane: int
    decision_distance_km: float
    urgency: float = 0.5


class PathPlanner:
    """路径规划器
    
    为车辆分配路径并管理分流决策。
    
    使用示例:
        planner = PathPlanner(road_graph)
        
        # 为新车辆分配路径
        path_id = planner.assign_path(origin_node_id="origin")
        
        # 检查是否需要换道驶出
        decision = planner.check_diverge_decision(
            path_id="main_route",
            current_position_km=11.5,
            current_lane=2
        )
    """
    
    # 分流点前开始换道的距离（米）
    DEFAULT_DIVERGE_LOOKAHEAD_M = 500
    
    def __init__(self, graph: RoadGraph, 
                 selection_mode: PathSelectionMode = PathSelectionMode.RANDOM_WEIGHTED):
        self.graph = graph
        self.selection_mode = selection_mode
        
        # 预分配的车辆路径
        self.vehicle_paths: Dict[int, str] = {}  # vehicle_id -> path_id
        
        # 分流决策缓存
        self.diverge_decisions: Dict[int, DivergeDecision] = {}
    
    def assign_path(self, vehicle_id: int, origin_node_id: str = None) -> Optional[str]:
        """为车辆分配路径
        
        Args:
            vehicle_id: 车辆 ID
            origin_node_id: 起点节点 ID（如果为空，从所有可用路径中选择）
            
        Returns:
            分配的路径 ID
        """
        # 获取从指定起点出发的路径
        available_paths = self._get_paths_from_origin(origin_node_id)
        
        if not available_paths:
            # 回退到所有路径
            available_paths = self.graph.get_all_paths()
        
        if not available_paths:
            return None
        
        # 根据选择模式分配
        if self.selection_mode == PathSelectionMode.RANDOM_WEIGHTED:
            path = self._select_weighted_random(available_paths)
        elif self.selection_mode == PathSelectionMode.FIXED:
            path = available_paths[0]  # 取第一条
        else:
            path = available_paths[0]
        
        self.vehicle_paths[vehicle_id] = path.path_id
        return path.path_id
    
    def get_vehicle_path(self, vehicle_id: int) -> Optional[str]:
        """获取车辆的路径 ID"""
        return self.vehicle_paths.get(vehicle_id)
    
    def _get_paths_from_origin(self, origin_node_id: str) -> List[VehiclePath]:
        """获取从指定起点出发的所有路径"""
        if not origin_node_id:
            return self.graph.get_all_paths()
        
        result = []
        for path in self.graph.get_all_paths():
            if path.edges:
                first_edge = self.graph.get_edge(path.edges[0])
                if first_edge and first_edge.from_node == origin_node_id:
                    result.append(path)
        return result
    
    def _select_weighted_random(self, paths: List[VehiclePath]) -> VehiclePath:
        """按权重随机选择路径"""
        total_weight = sum(p.weight for p in paths)
        if total_weight <= 0:
            return random.choice(paths)
        
        r = random.random() * total_weight
        cumulative = 0.0
        for path in paths:
            cumulative += path.weight
            if r <= cumulative:
                return path
        
        return paths[-1]
    
    def check_diverge_decision(self, vehicle_id: int, 
                               current_position_km: float,
                               current_lane: int,
                               lookahead_m: float = None) -> Optional[DivergeDecision]:
        """检查是否需要在分流点换道
        
        Args:
            vehicle_id: 车辆 ID
            current_position_km: 当前位置（km）
            current_lane: 当前车道
            lookahead_m: 前瞻距离（米）
            
        Returns:
            分流决策，如果不需要换道则返回 None
        """
        path_id = self.vehicle_paths.get(vehicle_id)
        if not path_id:
            return None
        
        if lookahead_m is None:
            lookahead_m = self.DEFAULT_DIVERGE_LOOKAHEAD_M
        
        lookahead_km = lookahead_m / 1000.0
        
        # 检查前方是否有分流点
        diverge_info = self.graph.get_upcoming_diverge(path_id, current_position_km, lookahead_km)
        if not diverge_info:
            return None
        
        diverge_node, distance_km = diverge_info
        
        # 检查车辆的路径是否需要驶出
        path = self.graph.get_path(path_id)
        should_exit = self._path_exits_at_diverge(path, diverge_node.node_id)
        
        if not should_exit:
            return None
        
        # 计算紧急程度（越近越紧急）
        urgency = 1.0 - (distance_km / lookahead_km)
        
        # 需要换到最右车道驶出
        decision = DivergeDecision(
            should_exit=True,
            target_lane=0,  # 最右车道
            decision_distance_km=distance_km,
            urgency=urgency
        )
        
        self.diverge_decisions[vehicle_id] = decision
        return decision
    
    def _path_exits_at_diverge(self, path: VehiclePath, diverge_node_id: str) -> bool:
        """检查路径是否在指定分流点驶出"""
        if not path or not path.edges:
            return False
        
        # 找到经过分流点的边
        for i, edge_id in enumerate(path.edges):
            edge = self.graph.get_edge(edge_id)
            if edge and edge.to_node == diverge_node_id:
                # 检查下一条边是否是匝道
                if i + 1 < len(path.edges):
                    next_edge = self.graph.get_edge(path.edges[i + 1])
                    if next_edge and next_edge.is_ramp:
                        return True
        
        return False
    
    def get_merge_conflict_zone(self, node_id: str) -> Optional[Tuple[float, float]]:
        """获取合流点冲突区域
        
        Args:
            node_id: 合流点节点 ID
            
        Returns:
            (起始位置 km, 结束位置 km) 表示冲突区域
        """
        node = self.graph.get_node(node_id)
        if not node or node.node_type != NodeType.MERGE:
            return None
        
        # 冲突区域：合流点前后各 100m
        return (node.position_km - 0.1, node.position_km + 0.1)
    
    def clear_vehicle(self, vehicle_id: int):
        """清除车辆的路径分配"""
        self.vehicle_paths.pop(vehicle_id, None)
        self.diverge_decisions.pop(vehicle_id, None)
    
    def get_statistics(self) -> dict:
        """获取规划器统计信息"""
        path_counts = {}
        for path_id in self.vehicle_paths.values():
            path_counts[path_id] = path_counts.get(path_id, 0) + 1
        
        return {
            'total_vehicles_assigned': len(self.vehicle_paths),
            'path_distribution': path_counts,
            'pending_diverge_decisions': len(self.diverge_decisions),
        }
