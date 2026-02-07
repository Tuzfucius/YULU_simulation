"""
数据库模型定义 (SQLite/PostgreSQL)
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, JSON, Text, Boolean, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

Base = declarative_base()


def generate_uuid() -> str:
    """生成 UUID"""
    return str(uuid.uuid4())


class SimulationConfigModel(Base):
    """仿真配置表"""
    __tablename__ = "simulation_configs"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    config_data = Column(JSON, nullable=False)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关系
    simulations = relationship("SimulationResultModel", back_populates="config")


class SimulationResultModel(Base):
    """仿真结果表"""
    __tablename__ = "simulation_results"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    config_id = Column(String(36), ForeignKey("simulation_configs.id"), nullable=True, index=True)
    
    # 配置快照
    config_snapshot = Column(JSON, nullable=False)
    
    # 统计信息
    statistics = Column(JSON, nullable=False)
    
    # 结果数据
    vehicle_records = Column(JSON, nullable=True)
    anomaly_logs = Column(JSON, nullable=True)
    trajectory_data = Column(JSON, nullable=True)
    segment_speed_history = Column(JSON, nullable=True)
    safety_data = Column(JSON, nullable=True)
    queue_events = Column(JSON, nullable=True)
    phantom_jam_events = Column(JSON, nullable=True)
    
    # 状态
    status = Column(String(20), default="pending", index=True)
    progress = Column(Float, nullable=True)
    error_message = Column(Text, nullable=True)
    
    # 时间戳
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    
    # 关系
    config = relationship("SimulationConfigModel", back_populates="simulations")
    
    @property
    def is_completed(self) -> bool:
        return self.status == "completed"
    
    @property
    def is_failed(self) -> bool:
        return self.status == "failed"


class ChartFavoriteModel(Base):
    """图表收藏表"""
    __tablename__ = "chart_favorites"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    chart_type = Column(String(50), nullable=False, index=True)
    config = Column(JSON, nullable=False)
    is_default = Column(Boolean, default=False)
    usage_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UserLayoutModel(Base):
    """用户布局表"""
    __tablename__ = "user_layouts"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    layout_data = Column(JSON, nullable=False)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SimulationSessionModel(Base):
    """仿真会话表 (用于追踪实时仿真)"""
    __tablename__ = "simulation_sessions"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    config_id = Column(String(36), ForeignKey("simulation_configs.id"), nullable=True)
    websocket_id = Column(String(100), nullable=True, index=True)
    
    status = Column(String(20), default="pending", index=True)
    progress = Column(Float, nullable=True)
    current_time = Column(Float, default=0)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
