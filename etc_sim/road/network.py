"""
道路网络模块
支持多路段、分叉、汇合以及 ETC 门架描述。
"""

from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class Segment:
    """道路区间段。"""

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
    """分叉点。"""

    from_segment: str
    to_segment: str
    position_km: float


@dataclass
class Merge:
    """汇合点。"""

    from_segment: str
    to_segment: str
    position_km: float


@dataclass
class ETCGate:
    """ETC 门架。"""

    segment: str
    position_km: float
    gate_id: Optional[str] = None


class RoadNetwork:
    """道路网络。"""

    def __init__(self, road_length_km: float = 20.0, num_lanes: int = 4):
        self.segments: Dict[str, Segment] = {}
        self.forks: List[Fork] = []
        self.merges: List[Merge] = []
        self.etc_gates: List[ETCGate] = []
        self.base_lanes = num_lanes

        self.add_segment("main", 0, road_length_km, num_lanes)

    def add_segment(self, seg_id: str, start_km: float, end_km: float, lanes: int):
        """添加路段。"""

        self.segments[seg_id] = Segment(seg_id, start_km, end_km, lanes)

    def add_fork(self, from_segment: str, to_segment: str, position_km: float):
        """添加分叉点。"""

        if from_segment in self.segments:
            seg = self.segments[from_segment]
            if seg.end_km < position_km:
                seg.end_km = position_km

        self.forks.append(Fork(from_segment, to_segment, position_km))

    def add_merge(self, from_segment: str, to_segment: str, position_km: float):
        """添加汇合点。"""

        self.merges.append(Merge(from_segment, to_segment, position_km))

    def add_etc_gate(self, segment: str, position_km: float, gate_id: Optional[str] = None):
        """添加 ETC 门架。"""

        self.etc_gates.append(ETCGate(segment, position_km, gate_id))

    def get_segment_at(self, position_km: float) -> Optional[Segment]:
        """获取指定位置所在路段。"""

        for seg in self.segments.values():
            if seg.contains_position(position_km):
                return seg

        for fork in self.forks:
            if fork.from_segment in self.segments:
                from_seg = self.segments[fork.from_segment]
                if from_seg.start_km <= position_km < fork.position_km:
                    return from_seg

        return None

    def get_lane_count(self, position_km: float) -> int:
        """获取指定位置的车道数。"""

        lanes = self.base_lanes

        for fork in self.forks:
            if fork.from_segment in self.segments:
                from_seg = self.segments[fork.from_segment]
                if from_seg.start_km <= position_km < fork.position_km:
                    lanes = from_seg.lanes
                elif position_km >= fork.position_km:
                    lanes = from_seg.lanes + 2

        for merge in self.merges:
            if merge.from_segment in self.segments and merge.to_segment in self.segments:
                from_seg = self.segments[merge.from_segment]
                to_seg = self.segments[merge.to_segment]
                if from_seg.start_km <= position_km < merge.position_km:
                    lanes = from_seg.lanes
                elif position_km >= merge.position_km:
                    lanes = to_seg.lanes

        return lanes

    def is_blocked_by_anomaly(self, position_km: float, lane: int) -> bool:
        """检查指定位置和车道是否被异常车辆阻塞。"""

        for seg in self.segments.values():
            if seg.contains_position(position_km):
                return False

        return False

    def get_etc_gates_in_range(self, start_km: float, end_km: float) -> List[ETCGate]:
        """获取指定范围内的 ETC 门架。"""

        return [gate for gate in self.etc_gates if start_km <= gate.position_km < end_km]

    def to_dict(self) -> dict:
        """转换为字典。"""

        return {
            "segments": {
                seg_id: {
                    "start_km": seg.start_km,
                    "end_km": seg.end_km,
                    "lanes": seg.lanes,
                }
                for seg_id, seg in self.segments.items()
            },
            "forks": [
                {"from": fork.from_segment, "to": fork.to_segment, "position_km": fork.position_km}
                for fork in self.forks
            ],
            "merges": [
                {"from": merge.from_segment, "to": merge.to_segment, "position_km": merge.position_km}
                for merge in self.merges
            ],
            "etc_gates": [
                {"segment": gate.segment, "position_km": gate.position_km, "gate_id": gate.gate_id}
                for gate in self.etc_gates
            ],
        }
