"""
Pydantic 数据模型定义
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class VehicleType(str, Enum):
    CAR = "CAR"
    TRUCK = "TRUCK"
    BUS = "BUS"


class DriverStyle(str, Enum):
    AGGRESSIVE = "aggressive"
    NORMAL = "normal"
    CONSERVATIVE = "conservative"


class AnomalyType(str, Enum):
    NONE = "none"
    FULL_STOP = "full_stop"       # 完全静止
    TEMP_FLUCTUATION = "temp_fluctuation"  # 短暂波动
    LONG_FLUCTUATION = "long_fluctuation"   # 长时波动


# ==================== 配置模型 ====================

class RoadParams(BaseModel):
    """道路参数"""
    road_length_km: float = Field(10.0, ge=1, le=100, description="道路长度 (km)")
    segment_length_km: float = Field(1.0, ge=0.5, le=5, description="区间长度 (km)")
    num_lanes: int = Field(4, ge=1, le=6, description="车道数量")
    lane_width: float = Field(3.5, ge=2.5, le=4, description="车道宽度 (m)")


class VehicleParams(BaseModel):
    """车辆参数"""
    total_vehicles: int = Field(1200, ge=100, le=5000, description="目标车辆数")
    anomaly_ratio: float = Field(0.01, ge=0, le=0.1, description="异常比例")
    vehicle_type_weights: Dict[str, float] = Field(
        default={"CAR": 0.60, "TRUCK": 0.25, "BUS": 0.15},
        description="车辆类型权重"
    )


class SimulationParams(BaseModel):
    """仿真参数"""
    simulation_dt: float = Field(1.0, ge=0.1, le=2, description="仿真步长 (s)")
    max_simulation_time: int = Field(3600, ge=100, le=10000, description="最大仿真时间 (s)")


class AnomalyParams(BaseModel):
    """异常参数"""
    global_anomaly_start: int = Field(200, ge=0, description="全局异常开始时间 (s)")
    vehicle_safe_run_time: int = Field(200, ge=0, description="车辆安全运行时间 (s)")
    impact_discover_dist: float = Field(150.0, ge=10, le=500, description="影响发现距离 (m)")


class LaneChangeParams(BaseModel):
    """换道参数"""
    forced_change_dist: int = Field(400, ge=100, le=1000, description="强制换道距离 (m)")
    lane_change_gap: int = Field(25, ge=10, le=100, description="换道间隙 (m)")
    lane_change_max_retries: int = Field(5, ge=1, le=20, description="最大重试次数")
    lane_change_retry_interval: float = Field(2.0, ge=0.5, le=10, description="重试间隔 (s)")
    lane_change_delay: float = Field(2.0, ge=0, le=5, description="换道延迟 (s)")
    lane_change_steps: int = Field(5, ge=3, le=10, description="换道步数")


class ImpactParams(BaseModel):
    """影响参数"""
    impact_threshold: float = Field(0.90, ge=0.5, le=1, description="影响阈值")
    impact_speed_ratio: float = Field(0.70, ge=0.3, le=1, description="影响速度比例")
    slowdown_ratio: float = Field(0.85, ge=0.5, le=1, description="减速比例")


class ETCParams(BaseModel):
    """ETC 参数"""
    etc_gate_interval_km: int = Field(2, ge=1, le=5, description="ETC 门架间隔 (km)")


class SimulationConfig(BaseModel):
    """完整仿真配置"""
    road: RoadParams
    vehicle: VehicleParams
    simulation: SimulationParams
    anomaly: AnomalyParams
    lane_change: LaneChangeParams
    impact: ImpactParams
    etc: ETCParams
    
    @classmethod
    def create_default(cls) -> "SimulationConfig":
        """创建默认配置"""
        return cls(
            road=RoadParams(),
            vehicle=VehicleParams(),
            simulation=SimulationParams(),
            anomaly=AnomalyParams(),
            lane_change=LaneChangeParams(),
            impact=ImpactParams(),
            etc=ETCParams()
        )
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "road": self.road.model_dump(),
            "vehicle": self.vehicle.model_dump(),
            "simulation": self.simulation.model_dump(),
            "anomaly": self.anomaly.model_dump(),
            "lane_change": self.lane_change.model_dump(),
            "impact": self.impact.model_dump(),
            "etc": self.etc.model_dump()
        }


# ==================== 仿真状态模型 ====================

class VehicleSnapshot(BaseModel):
    """车辆快照"""
    id: int
    x: float  # 位置 (m)
    y: float  # 横向位置
    lane: int
    speed: float  # km/h
    vehicle_type: str
    anomaly_state: str
    anomaly_type: int
    is_affected: bool
    length: float
    color: str


class ProgressPayload(BaseModel):
    """进度消息"""
    current_time: float
    total_time: float
    progress: float  # 百分比 0-100
    active_vehicles: int
    completed_vehicles: int
    active_anomalies: int
    eta: Optional[float] = None  # 预计剩余时间 (分钟)


class LogPayload(BaseModel):
    """日志消息"""
    level: str  # INFO, WARNING, ERROR, DEBUG
    message: str
    timestamp: float
    category: str  # SPAWN, LANE_CHANGE, ANOMALY, CONGESTION, ETC
    data: Optional[Dict[str, Any]] = None


# ==================== 结果模型 ====================

class Statistics(BaseModel):
    """仿真统计"""
    total_vehicles: int
    total_anomalies: int
    simulation_time: float
    completed_vehicles: int
    avg_speed: float
    avg_travel_time: float
    total_lane_changes: int
    anomaly_count: int
    affected_vehicles: int
    max_congestion_length: float
    etc_detection_rate: float
    ttc_violations: int


class VehicleRecord(BaseModel):
    """车辆记录"""
    id: int
    vehicle_type: str
    driver_style: str
    entry_time: float
    exit_time: Optional[float]
    lane_changes: int
    anomaly_type: int
    avg_speed: float
    total_delay: float


class AnomalyLog(BaseModel):
    """异常日志"""
    id: int
    type: int
    time: float
    pos_km: float
    segment: int
    min_speed: float


class TrajectoryPoint(BaseModel):
    """轨迹点"""
    id: int
    pos: float
    time: float
    lane: int
    speed: float
    anomaly_state: str
    anomaly_type: int
    vehicle_type: str
    driver_style: str
    is_affected: bool


class SegmentSpeed(BaseModel):
    """区间速度"""
    time: float
    segment: int
    avg_speed: float
    density: float
    flow: float


class SimulationResult(BaseModel):
    """仿真结果"""
    config: Dict[str, Any]
    statistics: Statistics
    vehicle_records: List[VehicleRecord]
    anomaly_logs: List[AnomalyLog]
    trajectory_data: List[TrajectoryPoint]
    segment_speed_history: List[SegmentSpeed]
    created_at: datetime


# ==================== API 响应模型 ====================

class ConfigCreateRequest(BaseModel):
    """创建配置请求"""
    name: str
    description: Optional[str] = None
    config: SimulationConfig


class ConfigResponse(BaseModel):
    """配置响应"""
    id: str
    name: str
    description: Optional[str]
    config: Dict[str, Any]
    created_at: datetime
    updated_at: datetime


class SimulationCreateRequest(BaseModel):
    """创建仿真请求"""
    config_id: Optional[str] = None
    config: Optional[SimulationConfig] = None


class SimulationResponse(BaseModel):
    """仿真响应"""
    id: str
    config: Dict[str, Any]
    status: str  # pending, running, completed, failed
    progress: Optional[float]
    created_at: datetime
    completed_at: Optional[datetime]


class AnalysisSummary(BaseModel):
    """分析摘要"""
    simulation_id: str
    statistics: Statistics
    charts_available: List[str]
