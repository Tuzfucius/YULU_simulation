"""
道路网络图结构核心模块
实现基于有向图的复杂路网模型

设计原则：
- 节点表示连接点（起点、终点、合流、分流）
- 边表示路段（包含车道、长度、限速等属性）
- 支持路径规划和车辆分流
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple
from enum import Enum
import math


class NodeType(Enum):
    """节点类型"""
    ORIGIN = "origin"           # 起点（车辆生成）
    DESTINATION = "destination"  # 终点（车辆消失）
    MERGE = "merge"             # 合流点（多路变一路）
    DIVERGE = "diverge"         # 分流点（一路变多路）
    JUNCTION = "junction"       # 一般连接点


@dataclass
class RoadNode:
    """道路节点
    
    表示路网中的连接点或特殊位置
    """
    node_id: str
    node_type: NodeType
    position_km: float          # 全局位置（用于可视化）
    x_coord: float = 0.0        # X 坐标（可视化用）
    y_coord: float = 0.0        # Y 坐标（可视化用）
    
    # 分流点专用属性
    exit_probability: float = 0.2  # 驶出概率（分流点使用）
    
    def __hash__(self):
        return hash(self.node_id)
    
    def __eq__(self, other):
        if isinstance(other, RoadNode):
            return self.node_id == other.node_id
        return False


@dataclass
class RoadEdge:
    """道路边（路段）
    
    表示两个节点之间的道路
    """
    edge_id: str
    from_node: str
    to_node: str
    length_km: float
    num_lanes: int = 4
    speed_limit_kmh: float = 120.0
    gradient_percent: float = 0.0  # 坡度
    is_ramp: bool = False          # 是否为匝道
    
    # 距离追踪
    start_offset_km: float = 0.0   # 在全局路径中的起始偏移
    
    # ETC 门架位置（相对于路段起点的 km）
    etc_gates: List[float] = field(default_factory=list)
    
    def __hash__(self):
        return hash(self.edge_id)
    
    def __eq__(self, other):
        if isinstance(other, RoadEdge):
            return self.edge_id == other.edge_id
        return False


@dataclass
class VehiclePath:
    """车辆行驶路径
    
    由有序的边列表组成，表示车辆从起点到终点的完整路线
    """
    path_id: str
    edges: List[str]            # 有序的边 ID 列表
    total_length_km: float = 0.0
    description: str = ""
    
    # 路径权重（用于随机分配）
    weight: float = 1.0


class RoadGraph:
    """道路网络图
    
    管理节点、边和预定义路径，支持复杂路网拓扑。
    
    使用示例:
        graph = RoadGraph()
        graph.add_node("origin", NodeType.ORIGIN, 0.0)
        graph.add_node("dest", NodeType.DESTINATION, 20.0)
        graph.add_edge("main", "origin", "dest", 20.0, num_lanes=4)
        
        path = graph.create_path("main_route", ["main"])
    """
    
    def __init__(self):
        self.nodes: Dict[str, RoadNode] = {}
        self.edges: Dict[str, RoadEdge] = {}
        self.paths: Dict[str, VehiclePath] = {}
        
        # 邻接表（用于图遍历）
        self.outgoing: Dict[str, List[str]] = {}  # node_id -> [edge_ids]
        self.incoming: Dict[str, List[str]] = {}  # node_id -> [edge_ids]
    
    # ==================== 节点操作 ====================
    
    def add_node(self, node_id: str, node_type: NodeType, position_km: float,
                 x_coord: float = None, y_coord: float = None,
                 exit_probability: float = 0.2) -> RoadNode:
        """添加节点"""
        if x_coord is None:
            x_coord = position_km
        if y_coord is None:
            y_coord = 0.0
        
        node = RoadNode(
            node_id=node_id,
            node_type=node_type,
            position_km=position_km,
            x_coord=x_coord,
            y_coord=y_coord,
            exit_probability=exit_probability
        )
        self.nodes[node_id] = node
        self.outgoing[node_id] = []
        self.incoming[node_id] = []
        return node
    
    def get_node(self, node_id: str) -> Optional[RoadNode]:
        """获取节点"""
        return self.nodes.get(node_id)
    
    def get_origin_nodes(self) -> List[RoadNode]:
        """获取所有起点节点"""
        return [n for n in self.nodes.values() if n.node_type == NodeType.ORIGIN]
    
    def get_destination_nodes(self) -> List[RoadNode]:
        """获取所有终点节点"""
        return [n for n in self.nodes.values() if n.node_type == NodeType.DESTINATION]
    
    # ==================== 边操作 ====================
    
    def add_edge(self, edge_id: str, from_node: str, to_node: str,
                 length_km: float, num_lanes: int = 4,
                 speed_limit_kmh: float = 120.0,
                 gradient_percent: float = 0.0,
                 is_ramp: bool = False) -> RoadEdge:
        """添加边（路段）"""
        edge = RoadEdge(
            edge_id=edge_id,
            from_node=from_node,
            to_node=to_node,
            length_km=length_km,
            num_lanes=num_lanes,
            speed_limit_kmh=speed_limit_kmh,
            gradient_percent=gradient_percent,
            is_ramp=is_ramp
        )
        self.edges[edge_id] = edge
        
        # 更新邻接表
        if from_node in self.outgoing:
            self.outgoing[from_node].append(edge_id)
        if to_node in self.incoming:
            self.incoming[to_node].append(edge_id)
        
        return edge
    
    def get_edge(self, edge_id: str) -> Optional[RoadEdge]:
        """获取边"""
        return self.edges.get(edge_id)
    
    def get_outgoing_edges(self, node_id: str) -> List[RoadEdge]:
        """获取节点的所有出边"""
        edge_ids = self.outgoing.get(node_id, [])
        return [self.edges[eid] for eid in edge_ids if eid in self.edges]
    
    def get_incoming_edges(self, node_id: str) -> List[RoadEdge]:
        """获取节点的所有入边"""
        edge_ids = self.incoming.get(node_id, [])
        return [self.edges[eid] for eid in edge_ids if eid in self.edges]
    
    def add_etc_gate_to_edge(self, edge_id: str, position_km: float):
        """向路段添加 ETC 门架"""
        if edge_id in self.edges:
            self.edges[edge_id].etc_gates.append(position_km)
            self.edges[edge_id].etc_gates.sort()
    
    # ==================== 路径操作 ====================
    
    def create_path(self, path_id: str, edge_ids: List[str],
                    weight: float = 1.0, description: str = "") -> Optional[VehiclePath]:
        """创建车辆路径"""
        # 验证路径连通性
        total_length = 0.0
        prev_to_node = None
        
        for i, edge_id in enumerate(edge_ids):
            edge = self.edges.get(edge_id)
            if not edge:
                return None
            
            if prev_to_node and edge.from_node != prev_to_node:
                return None  # 路径不连通
            
            # 计算起始偏移
            edge.start_offset_km = total_length
            total_length += edge.length_km
            prev_to_node = edge.to_node
        
        path = VehiclePath(
            path_id=path_id,
            edges=edge_ids,
            total_length_km=total_length,
            weight=weight,
            description=description
        )
        self.paths[path_id] = path
        return path
    
    def get_path(self, path_id: str) -> Optional[VehiclePath]:
        """获取路径"""
        return self.paths.get(path_id)
    
    def get_all_paths(self) -> List[VehiclePath]:
        """获取所有路径"""
        return list(self.paths.values())
    
    # ==================== 位置转换 ====================
    
    def get_edge_and_offset_at(self, path_id: str, 
                               global_position_km: float) -> Tuple[Optional[RoadEdge], float]:
        """根据全局位置获取当前所在的边和局部偏移
        
        Args:
            path_id: 路径 ID
            global_position_km: 全局位置（从路径起点计算）
            
        Returns:
            (当前边, 边内偏移 km)
        """
        path = self.paths.get(path_id)
        if not path:
            return None, 0.0
        
        cumulative = 0.0
        for edge_id in path.edges:
            edge = self.edges.get(edge_id)
            if not edge:
                continue
            
            if cumulative + edge.length_km > global_position_km:
                local_offset = global_position_km - cumulative
                return edge, local_offset
            
            cumulative += edge.length_km
        
        # 已超出路径终点
        if path.edges:
            last_edge = self.edges.get(path.edges[-1])
            return last_edge, last_edge.length_km if last_edge else 0.0
        
        return None, 0.0
    
    def get_lane_count_at(self, path_id: str, global_position_km: float) -> int:
        """获取指定位置的车道数"""
        edge, _ = self.get_edge_and_offset_at(path_id, global_position_km)
        return edge.num_lanes if edge else 4
    
    def get_speed_limit_at(self, path_id: str, global_position_km: float) -> float:
        """获取指定位置的限速"""
        edge, _ = self.get_edge_and_offset_at(path_id, global_position_km)
        return edge.speed_limit_kmh if edge else 120.0
    
    # ==================== 分流/合流检测 ====================
    
    def get_upcoming_diverge(self, path_id: str, 
                             global_position_km: float,
                             lookahead_km: float = 0.5) -> Optional[Tuple[RoadNode, float]]:
        """检测前方是否有分流点
        
        Args:
            path_id: 当前路径
            global_position_km: 当前位置
            lookahead_km: 前瞻距离
            
        Returns:
            (分流节点, 到分流点的距离) 或 None
        """
        path = self.paths.get(path_id)
        if not path:
            return None
        
        cumulative = 0.0
        for edge_id in path.edges:
            edge = self.edges.get(edge_id)
            if not edge:
                continue
            
            edge_end = cumulative + edge.length_km
            
            # 检查该边的终点节点是否为分流点
            if edge_end > global_position_km:
                to_node = self.nodes.get(edge.to_node)
                if to_node and to_node.node_type == NodeType.DIVERGE:
                    distance_to_diverge = edge_end - global_position_km
                    if distance_to_diverge <= lookahead_km:
                        return to_node, distance_to_diverge
            
            cumulative += edge.length_km
        
        return None
    
    # ==================== 序列化 ====================
    
    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            'nodes': {
                nid: {
                    'type': n.node_type.value,
                    'position_km': n.position_km,
                    'x': n.x_coord,
                    'y': n.y_coord,
                    'exit_probability': n.exit_probability
                }
                for nid, n in self.nodes.items()
            },
            'edges': {
                eid: {
                    'from': e.from_node,
                    'to': e.to_node,
                    'length_km': e.length_km,
                    'num_lanes': e.num_lanes,
                    'speed_limit': e.speed_limit_kmh,
                    'gradient': e.gradient_percent,
                    'is_ramp': e.is_ramp,
                    'etc_gates': e.etc_gates
                }
                for eid, e in self.edges.items()
            },
            'paths': {
                pid: {
                    'edges': p.edges,
                    'total_length': p.total_length_km,
                    'weight': p.weight,
                    'description': p.description
                }
                for pid, p in self.paths.items()
            }
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'RoadGraph':
        """从字典创建"""
        graph = cls()
        
        # 加载节点
        for nid, ndata in data.get('nodes', {}).items():
            graph.add_node(
                nid,
                NodeType(ndata['type']),
                ndata['position_km'],
                ndata.get('x', ndata['position_km']),
                ndata.get('y', 0.0),
                ndata.get('exit_probability', 0.2)
            )
        
        # 加载边
        for eid, edata in data.get('edges', {}).items():
            edge = graph.add_edge(
                eid,
                edata['from'],
                edata['to'],
                edata['length_km'],
                edata.get('num_lanes', 4),
                edata.get('speed_limit', 120.0),
                edata.get('gradient', 0.0),
                edata.get('is_ramp', False)
            )
            for gate_pos in edata.get('etc_gates', []):
                graph.add_etc_gate_to_edge(eid, gate_pos)
        
        # 加载路径
        for pid, pdata in data.get('paths', {}).items():
            graph.create_path(
                pid,
                pdata['edges'],
                pdata.get('weight', 1.0),
                pdata.get('description', '')
            )
        
        return graph


# ==================== 预置路网模板 ====================

def create_simple_mainline(length_km: float = 20.0, num_lanes: int = 4) -> RoadGraph:
    """创建简单主线路网（向后兼容）"""
    graph = RoadGraph()
    
    graph.add_node("origin", NodeType.ORIGIN, 0.0)
    graph.add_node("destination", NodeType.DESTINATION, length_km)
    
    edge = graph.add_edge("main", "origin", "destination", length_km, num_lanes)
    
    # 添加 ETC 门架（每 2km 一个）
    for gate_km in range(2, int(length_km), 2):
        graph.add_etc_gate_to_edge("main", float(gate_km))
    
    graph.create_path("main_route", ["main"], description="主线路径")
    
    return graph


def create_mainline_with_on_ramp(main_length_km: float = 20.0, 
                                  ramp_position_km: float = 8.0,
                                  ramp_length_km: float = 0.5) -> RoadGraph:
    """创建带入口匝道的路网
    
    结构: [Origin] --main1--> [Merge] --main2--> [Destination]
                                ↑
          [RampOrigin] --ramp--┘
    """
    graph = RoadGraph()
    
    # 节点
    graph.add_node("origin", NodeType.ORIGIN, 0.0, x_coord=0.0, y_coord=0.0)
    graph.add_node("merge", NodeType.MERGE, ramp_position_km, 
                   x_coord=ramp_position_km, y_coord=0.0)
    graph.add_node("destination", NodeType.DESTINATION, main_length_km,
                   x_coord=main_length_km, y_coord=0.0)
    graph.add_node("ramp_origin", NodeType.ORIGIN, ramp_position_km - ramp_length_km,
                   x_coord=ramp_position_km - ramp_length_km, y_coord=-1.0)
    
    # 边
    graph.add_edge("main1", "origin", "merge", ramp_position_km, num_lanes=4)
    graph.add_edge("main2", "merge", "destination", main_length_km - ramp_position_km, num_lanes=4)
    graph.add_edge("ramp", "ramp_origin", "merge", ramp_length_km, num_lanes=1, 
                   speed_limit_kmh=60.0, is_ramp=True)
    
    # ETC 门架
    for gate_km in range(2, int(ramp_position_km), 2):
        graph.add_etc_gate_to_edge("main1", float(gate_km))
    for gate_km in range(2, int(main_length_km - ramp_position_km), 2):
        graph.add_etc_gate_to_edge("main2", float(gate_km))
    
    # 路径
    graph.create_path("main_route", ["main1", "main2"], description="主线直行")
    graph.create_path("ramp_route", ["ramp", "main2"], description="匝道汇入")
    
    return graph


def create_mainline_with_off_ramp(main_length_km: float = 20.0,
                                   ramp_position_km: float = 12.0,
                                   ramp_length_km: float = 0.5,
                                   exit_probability: float = 0.2) -> RoadGraph:
    """创建带出口匝道的路网
    
    结构: [Origin] --main1--> [Diverge] --main2--> [Destination]
                                  ↓
                               --ramp--> [RampDest]
    """
    graph = RoadGraph()
    
    # 节点
    graph.add_node("origin", NodeType.ORIGIN, 0.0, x_coord=0.0, y_coord=0.0)
    graph.add_node("diverge", NodeType.DIVERGE, ramp_position_km,
                   x_coord=ramp_position_km, y_coord=0.0,
                   exit_probability=exit_probability)
    graph.add_node("destination", NodeType.DESTINATION, main_length_km,
                   x_coord=main_length_km, y_coord=0.0)
    graph.add_node("ramp_dest", NodeType.DESTINATION, ramp_position_km + ramp_length_km,
                   x_coord=ramp_position_km + ramp_length_km, y_coord=1.0)
    
    # 边
    graph.add_edge("main1", "origin", "diverge", ramp_position_km, num_lanes=4)
    graph.add_edge("main2", "diverge", "destination", main_length_km - ramp_position_km, num_lanes=4)
    graph.add_edge("ramp", "diverge", "ramp_dest", ramp_length_km, num_lanes=1,
                   speed_limit_kmh=60.0, is_ramp=True)
    
    # ETC 门架
    for gate_km in range(2, int(ramp_position_km), 2):
        graph.add_etc_gate_to_edge("main1", float(gate_km))
    for gate_km in range(2, int(main_length_km - ramp_position_km), 2):
        graph.add_etc_gate_to_edge("main2", float(gate_km))
    
    # 路径
    graph.create_path("main_route", ["main1", "main2"], description="主线直行")
    graph.create_path("exit_route", ["main1", "ramp"], description="匝道驶出")
    
    return graph
