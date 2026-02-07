"""
仿真参数配置
支持JSON配置文件加载和参数管理
"""

import json
import os
from dataclasses import dataclass, asdict
from typing import Optional
from pathlib import Path


@dataclass
class SimulationConfig:
    """仿真配置参数"""
    
    # 道路参数
    road_length_km: float = 20.0
    segment_length_km: float = 2.0
    num_lanes: int = 4
    lane_width: float = 3.5
    
    # 仿真参数
    total_vehicles: int = 1200
    simulation_dt: float = 1.0
    max_simulation_time: int = 3900
    
    # 异常参数
    anomaly_ratio: float = 0.01
    global_anomaly_start: int = 200
    vehicle_safe_run_time: int = 200
    
    # 换道参数
    forced_change_dist: int = 400
    lane_change_gap: int = 25
    lane_change_max_retries: int = 5
    lane_change_retry_interval: float = 1.0
    
    # 颜色标记阈值
    impact_threshold: float = 0.90
    impact_speed_ratio: float = 0.70
    
    # 多车道耦合参数
    lane_coupling_dist: float = 50.0
    lane_coupling_factor: float = 0.01
    
    # 排队检测参数
    queue_speed_threshold: float = 15.0
    queue_min_vehicles: int = 3
    queue_dissipation_rate: float = 0.8
    
    # 幽灵堵车检测参数
    phantom_jam_speed: float = 30.0
    phantom_jam_dist: float = 200.0
    
    # 相变分析参数
    phase_critical_density: float = 35.0
    phase_transition_threshold: float = 5.0
    
    # 异常影响范围
    impact_discover_dist: float = 150.0
    
    @property
    def num_segments(self) -> int:
        """区间数量"""
        return int(self.road_length_km / self.segment_length_km)
    
    @property
    def last_spawn_time(self) -> float:
        """最后发车时间估计"""
        return (self.total_vehicles / 5) * 10
    
    @property
    def run_time_60kmh(self) -> float:
        """60km/h跑完全程时间"""
        return (self.road_length_km / 60) * 3600
    
    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            'road_length_km': self.road_length_km,
            'segment_length_km': self.segment_length_km,
            'num_lanes': self.num_lanes,
            'lane_width': self.lane_width,
            'total_vehicles': self.total_vehicles,
            'simulation_dt': self.simulation_dt,
            'max_simulation_time': self.max_simulation_time,
            'anomaly_ratio': self.anomaly_ratio,
            'global_anomaly_start': self.global_anomaly_start,
            'vehicle_safe_run_time': self.vehicle_safe_run_time,
            'forced_change_dist': self.forced_change_dist,
            'lane_change_gap': self.lane_change_gap,
            'lane_change_max_retries': self.lane_change_max_retries,
            'lane_change_retry_interval': self.lane_change_retry_interval,
            'impact_threshold': self.impact_threshold,
            'impact_speed_ratio': self.impact_speed_ratio,
            'lane_coupling_dist': self.lane_coupling_dist,
            'lane_coupling_factor': self.lane_coupling_factor,
            'queue_speed_threshold': self.queue_speed_threshold,
            'queue_min_vehicles': self.queue_min_vehicles,
            'queue_dissipation_rate': self.queue_dissipation_rate,
            'phantom_jam_speed': self.phantom_jam_speed,
            'phantom_jam_dist': self.phantom_jam_dist,
            'phase_critical_density': self.phase_critical_density,
            'phase_transition_threshold': self.phase_transition_threshold,
            'impact_discover_dist': self.impact_discover_dist,
        }
    
    def to_json(self, filepath: str, indent: int = 2):
        """保存为JSON文件"""
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(self.to_dict(), f, indent=indent, ensure_ascii=False)
    
    @classmethod
    def from_dict(cls, data: dict) -> 'SimulationConfig':
        """从字典创建配置"""
        return cls(**data)
    
    @classmethod
    def from_json(cls, filepath: str) -> 'SimulationConfig':
        """从JSON文件加载配置"""
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return cls.from_dict(data)


def load_config(filepath: str) -> SimulationConfig:
    """
    加载配置文件
    
    Args:
        filepath: 配置文件路径（JSON格式）
    
    Returns:
        SimulationConfig实例
    """
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"配置文件不存在: {filepath}")
    
    ext = Path(filepath).suffix.lower()
    
    if ext == '.json':
        return SimulationConfig.from_json(filepath)
    else:
        raise ValueError(f"不支持的配置文件格式: {ext}")
