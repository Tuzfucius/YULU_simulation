"""
ETC 门架异常检测模块
基于门架流水数据识别交通异常（拥堵、事故）

核心算法：
1. 行程时间离群检测 (TT-Outlier)：检测门架区间通行时间异常
2. 流量时空相关性：对比上下游门架流量差异识别滞留
"""

from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, field
from collections import deque
import math


@dataclass
class ETCTransaction:
    """ETC 门架交易记录"""
    vehicle_id: int
    gate_id: str
    gate_position_km: float
    timestamp: float
    lane: int
    speed: float  # 通过时的速度 (m/s)
    status: str = 'normal'  # normal, delayed, missed


@dataclass
class GateStatistics:
    """门架统计信息"""
    gate_id: str
    position_km: float
    
    # 滑动窗口统计
    recent_travel_times: deque = field(default_factory=lambda: deque(maxlen=50))
    recent_speeds: deque = field(default_factory=lambda: deque(maxlen=50))
    recent_flows: deque = field(default_factory=lambda: deque(maxlen=20))
    
    # 实时统计
    avg_travel_time: float = 0.0
    std_travel_time: float = 0.0
    avg_speed: float = 0.0
    flow_rate: float = 0.0  # 车辆/分钟
    
    # 异常计数
    outlier_count: int = 0
    consecutive_outliers: int = 0


@dataclass
class AnomalyAlert:
    """异常警报"""
    alert_type: str  # 'congestion', 'incident', 'slow_down'
    severity: str  # 'low', 'medium', 'high', 'critical'
    gate_id: str
    position_km: float
    timestamp: float
    description: str
    confidence: float  # 0.0 - 1.0
    affected_lanes: List[int] = field(default_factory=list)


class ETCAnomalyDetector:
    """ETC 门架异常检测器
    
    通过分析门架间的车辆通行数据，识别交通异常。
    
    检测算法：
    1. TT-Outlier: 行程时间超过动态阈值
    2. Flow-Drop: 下游流量骤降
    3. Speed-Gradient: 速度梯度异常
    """
    
    # 检测参数
    TT_OUTLIER_SIGMA = 2.0      # 行程时间离群阈值（标准差倍数）
    TT_OUTLIER_RATIO = 1.5     # 行程时间离群比例阈值
    FLOW_DROP_THRESHOLD = 0.5   # 流量下降阈值（50%）
    SPEED_ALERT_THRESHOLD = 30  # 速度警报阈值 (km/h)
    CONSECUTIVE_THRESHOLD = 3   # 连续异常计数阈值
    
    def __init__(self):
        # 门架统计信息
        self.gate_stats: Dict[str, GateStatistics] = {}
        
        # 车辆上一次通过的门架记录
        self.vehicle_last_gate: Dict[int, Tuple[str, float]] = {}
        
        # 活跃警报
        self.active_alerts: List[AnomalyAlert] = []
        
        # 历史警报
        self.alert_history: List[AnomalyAlert] = []
        
        # 流水记录
        self.transactions: List[ETCTransaction] = []
    
    def register_gate(self, gate_id: str, position_km: float):
        """注册门架"""
        if gate_id not in self.gate_stats:
            self.gate_stats[gate_id] = GateStatistics(
                gate_id=gate_id,
                position_km=position_km
            )
    
    def record_transaction(self, transaction: ETCTransaction) -> Optional[AnomalyAlert]:
        """记录 ETC 交易并检测异常
        
        Args:
            transaction: ETC 交易记录
            
        Returns:
            如检测到异常则返回警报，否则返回 None
        """
        self.transactions.append(transaction)
        
        # 确保门架已注册
        if transaction.gate_id not in self.gate_stats:
            self.register_gate(transaction.gate_id, transaction.gate_position_km)
        
        gate_stat = self.gate_stats[transaction.gate_id]
        
        # 更新速度统计
        speed_kmh = transaction.speed * 3.6
        gate_stat.recent_speeds.append(speed_kmh)
        gate_stat.avg_speed = sum(gate_stat.recent_speeds) / len(gate_stat.recent_speeds)
        
        # 计算与上一门架的行程时间
        alert = None
        vid = transaction.vehicle_id
        
        if vid in self.vehicle_last_gate:
            last_gate_id, last_time = self.vehicle_last_gate[vid]
            travel_time = transaction.timestamp - last_time
            
            if travel_time > 0 and last_gate_id in self.gate_stats:
                # 更新行程时间统计
                gate_stat.recent_travel_times.append(travel_time)
                
                if len(gate_stat.recent_travel_times) >= 5:
                    # 计算均值和标准差
                    tt_list = list(gate_stat.recent_travel_times)
                    gate_stat.avg_travel_time = sum(tt_list) / len(tt_list)
                    variance = sum((t - gate_stat.avg_travel_time) ** 2 for t in tt_list) / len(tt_list)
                    gate_stat.std_travel_time = math.sqrt(variance) if variance > 0 else 1.0
                    
                    # TT-Outlier 检测
                    alert = self._check_travel_time_outlier(
                        gate_stat, travel_time, transaction
                    )
        
        # 更新车辆最后通过门架
        self.vehicle_last_gate[vid] = (transaction.gate_id, transaction.timestamp)
        
        # 检测速度异常
        if alert is None:
            alert = self._check_speed_anomaly(gate_stat, transaction)
        
        if alert:
            self.active_alerts.append(alert)
            self.alert_history.append(alert)
        
        return alert
    
    def _check_travel_time_outlier(self, gate_stat: GateStatistics, 
                                   travel_time: float,
                                   transaction: ETCTransaction) -> Optional[AnomalyAlert]:
        """检测行程时间离群值"""
        if gate_stat.std_travel_time < 0.1:
            return None
        
        # 计算 Z-score
        z_score = (travel_time - gate_stat.avg_travel_time) / gate_stat.std_travel_time
        
        # 检测条件：超过阈值或比例异常
        is_outlier = (
            z_score > self.TT_OUTLIER_SIGMA or 
            travel_time > gate_stat.avg_travel_time * self.TT_OUTLIER_RATIO
        )
        
        if is_outlier:
            gate_stat.outlier_count += 1
            gate_stat.consecutive_outliers += 1
            
            if gate_stat.consecutive_outliers >= self.CONSECUTIVE_THRESHOLD:
                # 连续异常：高置信度警报
                severity = 'high' if gate_stat.consecutive_outliers >= 5 else 'medium'
                return AnomalyAlert(
                    alert_type='congestion',
                    severity=severity,
                    gate_id=gate_stat.gate_id,
                    position_km=gate_stat.position_km,
                    timestamp=transaction.timestamp,
                    description=f"连续{gate_stat.consecutive_outliers}辆车行程时间异常，"
                               f"当前TT={travel_time:.1f}s，均值={gate_stat.avg_travel_time:.1f}s",
                    confidence=min(0.9, 0.5 + gate_stat.consecutive_outliers * 0.1),
                    affected_lanes=[transaction.lane]
                )
        else:
            gate_stat.consecutive_outliers = 0
        
        return None
    
    def _check_speed_anomaly(self, gate_stat: GateStatistics,
                            transaction: ETCTransaction) -> Optional[AnomalyAlert]:
        """检测速度异常"""
        speed_kmh = transaction.speed * 3.6
        
        # 低速警报
        if speed_kmh < self.SPEED_ALERT_THRESHOLD and len(gate_stat.recent_speeds) >= 3:
            # 检查是否持续低速
            recent = list(gate_stat.recent_speeds)[-3:]
            if all(s < self.SPEED_ALERT_THRESHOLD for s in recent):
                return AnomalyAlert(
                    alert_type='slow_down',
                    severity='low',
                    gate_id=gate_stat.gate_id,
                    position_km=gate_stat.position_km,
                    timestamp=transaction.timestamp,
                    description=f"门架处连续低速通过，当前{speed_kmh:.1f}km/h",
                    confidence=0.6,
                    affected_lanes=[transaction.lane]
                )
        
        return None
    
    def analyze_flow_imbalance(self, upstream_gate_id: str, 
                               downstream_gate_id: str,
                               time_window: float = 60.0) -> Optional[AnomalyAlert]:
        """分析上下游流量不平衡
        
        如果流入大于流出，说明区间内可能有车辆滞留（事故或堵车）。
        
        Args:
            upstream_gate_id: 上游门架ID
            downstream_gate_id: 下游门架ID
            time_window: 分析时间窗口（秒）
            
        Returns:
            如检测到异常则返回警报
        """
        if upstream_gate_id not in self.gate_stats or downstream_gate_id not in self.gate_stats:
            return None
        
        upstream = self.gate_stats[upstream_gate_id]
        downstream = self.gate_stats[downstream_gate_id]
        
        # 计算时间窗口内的流量
        current_time = self.transactions[-1].timestamp if self.transactions else 0
        
        upstream_count = sum(
            1 for t in self.transactions 
            if t.gate_id == upstream_gate_id and current_time - t.timestamp <= time_window
        )
        
        downstream_count = sum(
            1 for t in self.transactions 
            if t.gate_id == downstream_gate_id and current_time - t.timestamp <= time_window
        )
        
        if upstream_count == 0:
            return None
        
        flow_ratio = downstream_count / upstream_count
        
        if flow_ratio < self.FLOW_DROP_THRESHOLD:
            return AnomalyAlert(
                alert_type='incident',
                severity='high',
                gate_id=downstream_gate_id,
                position_km=downstream.position_km,
                timestamp=current_time,
                description=f"上下游流量不平衡：上游{upstream_count}辆，下游{downstream_count}辆，"
                           f"可能存在事故或严重拥堵",
                confidence=0.85
            )
        
        return None
    
    def get_active_alerts(self, max_age: float = 300.0) -> List[AnomalyAlert]:
        """获取活跃警报（最近 max_age 秒内）"""
        if not self.transactions:
            return []
        
        current_time = self.transactions[-1].timestamp
        return [
            alert for alert in self.active_alerts
            if current_time - alert.timestamp <= max_age
        ]
    
    def get_gate_status(self, gate_id: str) -> Dict:
        """获取门架状态"""
        if gate_id not in self.gate_stats:
            return {}
        
        stat = self.gate_stats[gate_id]
        return {
            'gate_id': gate_id,
            'position_km': stat.position_km,
            'avg_travel_time': stat.avg_travel_time,
            'std_travel_time': stat.std_travel_time,
            'avg_speed': stat.avg_speed,
            'outlier_count': stat.outlier_count,
            'consecutive_outliers': stat.consecutive_outliers,
            'sample_count': len(stat.recent_travel_times)
        }
    
    def get_all_stats(self) -> Dict[str, Dict]:
        """获取所有门架统计"""
        return {gate_id: self.get_gate_status(gate_id) for gate_id in self.gate_stats}
    
    def to_dict(self) -> dict:
        """导出检测结果"""
        return {
            'gate_stats': self.get_all_stats(),
            'active_alerts': [
                {
                    'type': a.alert_type,
                    'severity': a.severity,
                    'gate_id': a.gate_id,
                    'position_km': a.position_km,
                    'timestamp': a.timestamp,
                    'description': a.description,
                    'confidence': a.confidence
                }
                for a in self.active_alerts
            ],
            'total_transactions': len(self.transactions),
            'total_alerts': len(self.alert_history)
        }
