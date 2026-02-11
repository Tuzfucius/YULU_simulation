"""
预警上下文模块
聚合所有预警判断所需的仿真数据，作为 Condition 评估的输入
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any


@dataclass
class AlertEvent:
    """预警事件 - 规则引擎输出"""
    rule_name: str
    severity: str           # 'low', 'medium', 'high', 'critical'
    timestamp: float
    gate_id: str = ''
    position_km: float = 0.0
    description: str = ''
    confidence: float = 0.0
    affected_lanes: List[int] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AlertContext:
    """预警判断上下文 - 聚合所有检测数据
    
    在每一步仿真中由 SimulationEngine 构建，传给规则引擎进行评估。
    
    Attributes:
        current_time: 当前仿真时间（秒）
        gate_stats: 各门架统计信息 {gate_id: GateStatistics}
        recent_transactions: 最近的 ETC 交易记录
        active_incidents: 当前活跃事件列表
        vehicle_speeds: 车辆速度 {vehicle_id: speed_ms}
        vehicle_positions: 车辆位置 {vehicle_id: position_m}
        vehicle_anomaly_states: 车辆异常状态 {vehicle_id: anomaly_state}
        noise_stats: 噪声统计信息
        weather_type: 当前天气类型
        queue_lengths: 各门架区间排队长度 {gate_id: length_m}
        segment_avg_speeds: 各区间平均速度 {segment_idx: avg_speed_ms}
        alert_history: 历史预警事件列表
    """
    current_time: float = 0.0
    
    # 门架相关
    gate_stats: Dict[str, Any] = field(default_factory=dict)
    recent_transactions: List[Any] = field(default_factory=list)
    
    # 事件相关
    active_incidents: List[Any] = field(default_factory=list)
    
    # 车辆状态快照
    vehicle_speeds: Dict[int, float] = field(default_factory=dict)
    vehicle_positions: Dict[int, float] = field(default_factory=dict)
    vehicle_anomaly_states: Dict[int, str] = field(default_factory=dict)
    vehicle_lanes: Dict[int, int] = field(default_factory=dict)
    
    # 环境状态
    noise_stats: Dict[str, Any] = field(default_factory=dict)
    weather_type: str = 'clear'
    
    # 聚合统计
    queue_lengths: Dict[str, float] = field(default_factory=dict)
    segment_avg_speeds: Dict[int, float] = field(default_factory=dict)
    
    # 历史预警
    alert_history: List[AlertEvent] = field(default_factory=list)
    recent_alert_events: List[AlertEvent] = field(default_factory=list)
