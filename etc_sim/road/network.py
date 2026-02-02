"""
道路网络模块
支持多路段、一条变两条、两条变一条
"""

from typing import Dict, List, Optional
from dataclasses import dataclass


@dataclass
class Segment:
    """道路区间段"""
    seg_id: str
    start_km: float
    end_km: float
    lanes: int
    
    @property
    def length_km(self) -> float:
        return self.end_km - self.start_km
    
    def contains_position(self, position_km: float) -> bool:
        return self.start_km <= position_km < self.end_km


@dataclass
class Fork:
    """分叉点（一条变两条）"""
    from_segment: str
    to_segment: str
    position_km: float


@dataclass
class Merge:
    """汇合点（两条变一条）"""
    from_segment: str
    to_segment: str
    position_km: float


@dataclass
class ETCGate:
    """ETC门架"""
    segment: str
    position_km: float


class RoadNetwork:
    """道路网络
    
    支持：
    - 多路段串联
    - 分叉（一条变两条）
    - 汇合（两条变一条）
    """
    
    def __init__(self, road_length_km: float = 20.0, num_lanes: int = 4):
        self.segments: Dict[str, Segment] = {}
        self.forks: List[Fork] = []
        self.merges: List[Merge] = []
        self.etc_gates: List[ETCGate] = []
        self.base_lanes = num_lanes
        
        # 默认创建单一路段
        self.add_segment("main", 0, road_length_km, num_lanes)
    
    def add_segment(self, seg_id: str, start_km: float, end_km: float, lanes: int):
        """添加路段"""
        self.segments[seg_id] = Segment(seg_id, start_km, end_km, lanes)
    
    def add_fork(self, from_segment: str, to_segment: str, position_km: float):
        """添加分叉点：from_segment在position_km处分出一条新路
        
        Args:
            from_segment: 源路段ID
            to_segment: 目标路段ID（新分出的路）
            position_km: 分叉位置（公里）
        """
        # 确保from_segment在该位置有足够的延伸
        if from_segment in self.segments:
            seg = self.segments[from_segment]
            if seg.end_km < position_km:
                seg.end_km = position_km
        
        self.forks.append(Fork(from_segment, to_segment, position_km))
    
    def add_merge(self, from_segment: str, to_segment: str, position_km: float):
        """添加汇合点：from_segment在position_km处汇入to_segment
        
        Args:
            from_segment: 源路段ID（要汇出的路）
            to_segment: 目标路段ID（汇入的路）
            position_km: 汇合位置（公里）
        """
        self.merges.append(Merge(from_segment, to_segment, position_km))
    
    def add_etc_gate(self, segment: str, position_km: float):
        """添加ETC门架"""
        self.etc_gates.append(ETCGate(segment, position_km))
    
    def get_segment_at(self, position_km: float) -> Optional[Segment]:
        """获取指定位置所在的路段"""
        for seg_id, seg in self.segments.items():
            if seg.contains_position(position_km):
                return seg
        
        # 检查是否在分叉后的区域
        for fork in self.forks:
            if fork.from_segment in self.segments:
                from_seg = self.segments[fork.from_segment]
                if from_seg.start_km <= position_km < fork.position_km:
                    # 在分叉点之前
                    return from_seg
        
        return None
    
    def get_lane_count(self, position_km: float) -> int:
        """获取指定位置的车道数（支持分叉/汇合）"""
        # 默认车道数
        lanes = self.base_lanes
        
        # 检查是否在分叉点
        for fork in self.forks:
            if fork.from_segment in self.segments:
                from_seg = self.segments[fork.from_segment]
                if from_seg.start_km <= position_km < fork.position_km:
                    # 分叉点之前：原车道数
                    lanes = from_seg.lanes
                elif position_km >= fork.position_km:
                    # 分叉点之后：原车道数 + 新车道（假设分出2车道）
                    lanes = from_seg.lanes + 2
        
        # 检查是否在汇合点
        for merge in self.merges:
            if merge.from_segment in self.segments and merge.to_segment in self.segments:
                from_seg = self.segments[merge.from_segment]
                to_seg = self.segments[merge.to_segment]
                if from_seg.start_km <= position_km < merge.position_km:
                    # 汇合点之前：原车道数
                    lanes = from_seg.lanes
                elif position_km >= merge.position_km:
                    # 汇合点之后：目标车道数
                    lanes = to_seg.lanes
        
        return lanes
    
    def is_blocked_by_anomaly(self, position_km: float, lane: int) -> bool:
        """检查指定位置和车道是否被异常车辆阻塞"""
        for seg_id, seg in self.segments.items():
            if seg.contains_position(position_km):
                # 检查该路段该车道是否有静止异常车辆
                return False  # 由仿真引擎检查
        
        return False
    
    def get_etc_gates_in_range(self, start_km: float, end_km: float) -> List[ETCGate]:
        """获取指定范围内的ETC门架"""
        return [gate for gate in self.etc_gates 
                if start_km <= gate.position_km < end_km]
    
    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            'segments': {seg_id: {
                'start_km': seg.start_km,
                'end_km': seg.end_km,
                'lanes': seg.lanes
            } for seg_id, seg in self.segments.items()},
            'forks': [{'from': f.from_segment, 'to': f.to_segment, 'position_km': f.position_km}
                      for f in self.forks],
            'merges': [{'from': m.from_segment, 'to': m.to_segment, 'position_km': m.position_km}
                      for m in self.merges],
            'etc_gates': [{'segment': g.segment, 'position_km': g.position_km}
                         for g in self.etc_gates]
        }
