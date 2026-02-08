"""
道路网络模块
支持简单路网和复杂图结构路网
"""

from .network import RoadNetwork, Segment, Fork, Merge, ETCGate
from .graph import (
    RoadGraph, RoadNode, RoadEdge, VehiclePath, NodeType,
    create_simple_mainline, create_mainline_with_on_ramp, create_mainline_with_off_ramp
)
from .path_planner import PathPlanner, PathSelectionMode, DivergeDecision

__all__ = [
    # 基础路网（向后兼容）
    'RoadNetwork',
    'Segment',
    'Fork',
    'Merge',
    'ETCGate',
    # 图结构路网
    'RoadGraph',
    'RoadNode',
    'RoadEdge', 
    'VehiclePath',
    'NodeType',
    # 预置模板
    'create_simple_mainline',
    'create_mainline_with_on_ramp',
    'create_mainline_with_off_ramp',
    # 路径规划
    'PathPlanner',
    'PathSelectionMode',
    'DivergeDecision',
]

