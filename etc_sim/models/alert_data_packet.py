"""
预警数据包模型
封装仿真快照 + 预警记录 + 真值，作为用户自定义判断方法的标准输入。
"""

from dataclasses import dataclass, field, asdict
from typing import Dict, List, Any, Optional
from datetime import datetime
import json
import os
import uuid


@dataclass
class AlertRecord:
    """单条预警记录"""
    rule_name: str
    severity: str           # low / medium / high / critical
    timestamp: float        # 仿真时间秒
    gate_id: str = ''
    position_km: float = 0.0
    description: str = ''
    confidence: float = 0.0
    conditions_met: Dict[str, Any] = field(default_factory=dict)
    actions_executed: List[str] = field(default_factory=list)


@dataclass
class GroundTruthRecord:
    """真值事件记录"""
    event_type: str         # congestion / accident / anomaly_vehicle / ...
    start_time: float
    end_time: float = 0.0
    position_km: float = 0.0
    gate_id: str = ''
    severity: str = 'medium'
    description: str = ''
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SimulationSnapshot:
    """仿真快照"""
    gate_stats: Dict[str, Any] = field(default_factory=dict)
    vehicle_count: int = 0
    avg_speed_kmh: float = 0.0
    weather: str = 'clear'
    noise_stats: Dict[str, Any] = field(default_factory=dict)
    segment_speeds: Dict[str, float] = field(default_factory=dict)


@dataclass
class AlertDataPacket:
    """预警数据包
    
    每次仿真产生一个数据包，包含：
    - 仿真元信息（会话 ID、时间、时长）
    - 仿真快照（门架/车辆/天气等聚合数据）
    - 预警记录列表
    - 真值事件列表
    """
    packet_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    session_id: str = ''
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    duration_s: float = 0.0
    
    snapshot: SimulationSnapshot = field(default_factory=SimulationSnapshot)
    alerts: List[AlertRecord] = field(default_factory=list)
    ground_truths: List[GroundTruthRecord] = field(default_factory=list)
    
    # 自定义元数据
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    # ========== 序列化 ==========
    
    def to_dict(self) -> dict:
        """转为可 JSON 序列化的字典"""
        return asdict(self)
    
    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=indent)
    
    @classmethod
    def from_dict(cls, data: dict) -> 'AlertDataPacket':
        """从字典构建"""
        packet = cls()
        packet.packet_id = data.get('packet_id', packet.packet_id)
        packet.session_id = data.get('session_id', '')
        packet.created_at = data.get('created_at', packet.created_at)
        packet.duration_s = data.get('duration_s', 0.0)
        packet.metadata = data.get('metadata', {})
        
        # 快照
        snap_data = data.get('snapshot', {})
        packet.snapshot = SimulationSnapshot(
            gate_stats=snap_data.get('gate_stats', {}),
            vehicle_count=snap_data.get('vehicle_count', 0),
            avg_speed_kmh=snap_data.get('avg_speed_kmh', 0.0),
            weather=snap_data.get('weather', 'clear'),
            noise_stats=snap_data.get('noise_stats', {}),
            segment_speeds=snap_data.get('segment_speeds', {}),
        )
        
        # 预警记录
        for a in data.get('alerts', []):
            packet.alerts.append(AlertRecord(
                rule_name=a.get('rule_name', ''),
                severity=a.get('severity', 'medium'),
                timestamp=a.get('timestamp', 0),
                gate_id=a.get('gate_id', ''),
                position_km=a.get('position_km', 0),
                description=a.get('description', ''),
                confidence=a.get('confidence', 0),
                conditions_met=a.get('conditions_met', {}),
                actions_executed=a.get('actions_executed', []),
            ))
        
        # 真值
        for g in data.get('ground_truths', []):
            packet.ground_truths.append(GroundTruthRecord(
                event_type=g.get('event_type', ''),
                start_time=g.get('start_time', 0),
                end_time=g.get('end_time', 0),
                position_km=g.get('position_km', 0),
                gate_id=g.get('gate_id', ''),
                severity=g.get('severity', 'medium'),
                description=g.get('description', ''),
                metadata=g.get('metadata', {}),
            ))
        
        return packet
    
    @classmethod
    def from_json(cls, json_str: str) -> 'AlertDataPacket':
        return cls.from_dict(json.loads(json_str))
    
    # ========== 文件 I/O ==========
    
    def save(self, directory: str) -> str:
        """保存到目录，返回文件路径"""
        os.makedirs(directory, exist_ok=True)
        filename = f"packet_{self.packet_id}.json"
        filepath = os.path.join(directory, filename)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(self.to_json())
        return filepath
    
    @classmethod
    def load(cls, filepath: str) -> 'AlertDataPacket':
        """从文件加载"""
        with open(filepath, 'r', encoding='utf-8') as f:
            return cls.from_json(f.read())
    
    # ========== 统计 ==========
    
    @property
    def alert_count(self) -> int:
        return len(self.alerts)
    
    @property
    def truth_count(self) -> int:
        return len(self.ground_truths)
    
    def summary(self) -> Dict[str, Any]:
        """生成摘要信息"""
        severity_counts = {}
        for a in self.alerts:
            severity_counts[a.severity] = severity_counts.get(a.severity, 0) + 1
        
        return {
            'packet_id': self.packet_id,
            'session_id': self.session_id,
            'created_at': self.created_at,
            'duration_s': self.duration_s,
            'alert_count': self.alert_count,
            'truth_count': self.truth_count,
            'severity_counts': severity_counts,
            'avg_speed_kmh': self.snapshot.avg_speed_kmh,
            'weather': self.snapshot.weather,
        }
