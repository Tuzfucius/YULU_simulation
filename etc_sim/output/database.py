"""
数据库输出
SQLite数据库存储
"""

import os
from typing import List, Dict, Optional
from sqlalchemy import create_engine, Column, Integer, Float, String, Boolean, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

Base = declarative_base()


class VehicleRecord(Base):
    """车辆记录表"""
    __tablename__ = 'vehicles'
    
    id = Column(Integer, primary_key=True)
    vehicle_type = Column(String)
    driver_style = Column(String)
    entry_time = Column(Float)
    exit_time = Column(Float, nullable=True)
    entry_lane = Column(Integer)
    exit_lane = Column(Integer, nullable=True)
    lane_changes = Column(Integer)
    anomaly_type = Column(Integer, default=0)
    anomaly_trigger_time = Column(Float, nullable=True)
    etc_detection_time = Column(Float, nullable=True)
    min_ttc = Column(Float)
    max_decel = Column(Float)
    brake_count = Column(Integer)
    emergency_brake_count = Column(Integer)


class TrajectoryRecord(Base):
    """轨迹记录表"""
    __tablename__ = 'trajectories'
    
    id = Column(Integer, primary_key=True)
    vehicle_id = Column(Integer, index=True)
    time = Column(Float)
    position_km = Column(Float)
    lane = Column(Integer)
    speed_kmh = Column(Float)
    anomaly_state = Column(String)
    anomaly_type = Column(Integer, default=0)
    is_affected = Column(Boolean, default=False)


class AnomalyRecord(Base):
    """异常记录表"""
    __tablename__ = 'anomalies'
    
    id = Column(Integer, primary_key=True)
    vehicle_id = Column(Integer, index=True)
    anomaly_type = Column(Integer)
    trigger_time = Column(Float)
    position_km = Column(Float)
    segment = Column(Integer)
    min_speed = Column(Float)


class SegmentSpeedRecord(Base):
    """区间速度记录表"""
    __tablename__ = 'segment_speeds'
    
    id = Column(Integer, primary_key=True)
    time = Column(Float)
    segment = Column(Integer)
    avg_speed = Column(Float)
    density = Column(Float)
    flow = Column(Float)


class SafetyRecord(Base):
    """安全记录表"""
    __tablename__ = 'safety_data'
    
    id = Column(Integer, primary_key=True)
    time = Column(Float)
    vehicle_id = Column(Integer)
    vehicle_type = Column(String)
    driver_style = Column(String)
    speed_kmh = Column(Float)
    position_km = Column(Float)
    min_ttc = Column(Float)
    max_decel = Column(Float)
    brake_count = Column(Integer)
    emergency_brake_count = Column(Integer)


class DatabaseOutput:
    """数据库输出处理器"""
    
    def __init__(self, db_path: str):
        self.db_path = db_path
        
        # 确保目录存在
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        
        self.engine = create_engine(f'sqlite:///{db_path}', echo=False)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
    
    def save_vehicles(self, vehicles: List[Dict]):
        """保存车辆记录"""
        session = self.Session()
        try:
            for v in vehicles:
                record = VehicleRecord(
                    id=v['id'],
                    vehicle_type=v.get('vehicle_type'),
                    driver_style=v.get('driver_style'),
                    entry_time=v.get('entry_time'),
                    exit_time=v.get('exit_time'),
                    entry_lane=v.get('entry_lane'),
                    lane_changes=v.get('lane_changes'),
                    anomaly_type=v.get('anomaly_type', 0),
                    anomaly_trigger_time=v.get('anomaly_trigger_time'),
                    etc_detection_time=v.get('etc_detection_time'),
                    min_ttc=v.get('min_ttc'),
                    max_decel=v.get('max_decel'),
                    brake_count=v.get('brake_count', 0),
                    emergency_brake_count=v.get('emergency_brake_count', 0)
                )
                session.add(record)
            session.commit()
            print(f"  已保存 {len(vehicles)} 条车辆记录到数据库")
        except Exception as e:
            session.rollback()
            print(f"  保存车辆记录失败: {e}")
        finally:
            session.close()
    
    def save_trajectories(self, trajectories: List[Dict]):
        """保存轨迹数据"""
        session = self.Session()
        try:
            for t in trajectories:
                record = TrajectoryRecord(
                    vehicle_id=t['id'],
                    time=t['time'],
                    position_km=t['pos'] / 1000 if 'pos' in t else t.get('position_km', 0),
                    lane=t['lane'],
                    speed_kmh=t['speed'] * 3.6,
                    anomaly_state=t.get('anomaly_state', 'normal'),
                    anomaly_type=t.get('anomaly_type', 0),
                    is_affected=t.get('is_affected', False)
                )
                session.add(record)
            session.commit()
            print(f"  已保存 {len(trajectories)} 条轨迹记录到数据库")
        except Exception as e:
            session.rollback()
            print(f"  保存轨迹记录失败: {e}")
        finally:
            session.close()
    
    def save_anomalies(self, anomalies: List[Dict]):
        """保存异常记录"""
        session = self.Session()
        try:
            for a in anomalies:
                record = AnomalyRecord(
                    vehicle_id=a['id'],
                    anomaly_type=a['type'],
                    trigger_time=a['time'],
                    position_km=a['pos_km'],
                    segment=a['segment'],
                    min_speed=a.get('min_speed', 0)
                )
                session.add(record)
            session.commit()
            print(f"  已保存 {len(anomalies)} 条异常记录到数据库")
        except Exception as e:
            session.rollback()
            print(f"  保存异常记录失败: {e}")
        finally:
            session.close()
    
    def save_segment_speeds(self, speeds: List[Dict]):
        """保存区间速度记录"""
        session = self.Session()
        try:
            for s in speeds:
                record = SegmentSpeedRecord(
                    time=s['time'],
                    segment=s['segment'],
                    avg_speed=s['avg_speed'] * 3.6,
                    density=s['density'],
                    flow=s['flow'] * 3.6
                )
                session.add(record)
            session.commit()
            print(f"  已保存 {len(speeds)} 条区间速度记录到数据库")
        except Exception as e:
            session.rollback()
            print(f"  保存区间速度记录失败: {e}")
        finally:
            session.close()
    
    def save_safety_data(self, safety_data: List[Dict]):
        """保存安全数据"""
        session = self.Session()
        try:
            for s in safety_data:
                record = SafetyRecord(
                    time=s['time'],
                    vehicle_id=s['vehicle_id'],
                    vehicle_type=s.get('vehicle_type'),
                    driver_style=s.get('driver_style'),
                    speed_kmh=s['speed'],
                    position_km=s['pos'] / 1000 if 'pos' in s else s.get('position_km', 0),
                    min_ttc=s.get('min_ttc', 999),
                    max_decel=s.get('max_decel', 0),
                    brake_count=s.get('brake_count', 0),
                    emergency_brake_count=s.get('emergency_brake_count', 0)
                )
                session.add(record)
            session.commit()
            print(f"  已保存 {len(safety_data)} 条安全记录到数据库")
        except Exception as e:
            session.rollback()
            print(f"  保存安全记录失败: {e}")
        finally:
            session.close()
    
    def save_all(self, results: dict):
        """保存所有数据"""
        self.save_vehicles(results.get('vehicles', []))
        self.save_trajectories(results.get('trajectories', []))
        self.save_anomalies(results.get('anomalies', []))
        self.save_segment_speeds(results.get('segment_speeds', []))
        self.save_safety_data(results.get('safety_data', []))
    
    def query(self, table_class, **filters):
        """查询数据"""
        session = self.Session()
        try:
            query = session.query(table_class)
            for attr, value in filters.items():
                query = query.filter(getattr(table_class, attr) == value)
            return query.all()
        finally:
            session.close()
    
    def get_vehicle_count(self) -> int:
        """获取车辆数量"""
        session = self.Session()
        try:
            return session.query(VehicleRecord).count()
        finally:
            session.close()
    
    def get_anomaly_count(self) -> int:
        """获取异常数量"""
        session = self.Session()
        try:
            return session.query(AnomalyRecord).count()
        finally:
            session.close()
