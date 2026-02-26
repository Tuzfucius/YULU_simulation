"""
WebSocket 连接管理器
集成实际的仿真引擎
"""

import asyncio
import json
import logging
import sys
import os
from typing import Dict, Optional, Any
from datetime import datetime

# Fix imports from parent etc_sim package
_current_dir = os.path.dirname(os.path.abspath(__file__))
_backend_dir = os.path.dirname(_current_dir)
_etc_sim_dir = os.path.dirname(_backend_dir)

# Add etc_sim to path
if _etc_sim_dir not in sys.path:
    sys.path.insert(0, _etc_sim_dir)

from fastapi import WebSocket, WebSocketDisconnect

from etc_sim.backend.models.schemas import (
    ProgressPayload,
    LogPayload,
    VehicleSnapshot
)
from etc_sim.backend.services.storage import StorageService

# Import actual simulation engine
from etc_sim.config.parameters import SimulationConfig
from etc_sim.simulation.engine import SimulationEngine

logger = logging.getLogger(__name__)


class ConnectionManager:
    """WebSocket 连接管理器"""
    
    def __init__(self, storage_service: Optional[StorageService] = None):
        self.active_connections: Dict[str, WebSocket] = {}
        self.session_connections: Dict[str, Dict[str, WebSocket]] = {}
        self.storage_service = storage_service
    
    @property
    def connection_count(self) -> int:
        """返回当前连接数"""
        return len(self.active_connections)
    
    async def connect(self, websocket: WebSocket, client_id: str):
        """建立连接"""
        await websocket.accept()
        self.active_connections[client_id] = websocket
        logger.info(f"Client connected: {client_id}, total: {self.connection_count}")
    
    async def disconnect(self, client_id: str):
        """断开连接"""
        if client_id in self.active_connections:
            del self.active_connections[client_id]
        logger.info(f"Client disconnected: {client_id}, total: {self.connection_count}")
    
    async def send_message(self, client_id: str, message: dict):
        """发送消息给指定客户端"""
        if client_id in self.active_connections:
            websocket = self.active_connections[client_id]
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.error(f"Failed to send message to {client_id}: {e}")
    
    async def broadcast(self, message: dict, exclude: Optional[str] = None):
        """广播消息给所有客户端"""
        disconnected = []
        for client_id, websocket in self.active_connections.items():
            if client_id != exclude:
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    logger.error(f"Broadcast failed to {client_id}: {e}")
                    disconnected.append(client_id)
        
        for client_id in disconnected:
            await self.disconnect(client_id)


class SimulationSession:
    """仿真会话"""
    
    def __init__(self, session_id: str, websocket: WebSocket):
        self.session_id = session_id
        self.websocket = websocket
        self.config: Optional[Dict[str, Any]] = None
        self.is_running = False
        self.is_paused = False
        self.current_time = 0.0
        self.total_time = 0.0
        self.started_at: Optional[datetime] = None
        self.task: Optional[asyncio.Task] = None
        
        # 统计数据
        self.stats = {
            "active_vehicles": 0,
            "completed_vehicles": 0,
            "active_anomalies": 0,
            "total_lane_changes": 0
        }
    
    def to_progress_payload(self) -> ProgressPayload:
        """转换为进度消息"""
        progress = (self.current_time / self.total_time * 100) if self.total_time > 0 else 0
        eta = (self.total_time - self.current_time) / 60 if self.total_time > 0 else None
        
        return ProgressPayload(
            current_time=self.current_time,
            total_time=self.total_time,
            progress=progress,
            active_vehicles=self.stats["active_vehicles"],
            completed_vehicles=self.stats["completed_vehicles"],
            active_anomalies=self.stats["active_anomalies"],
            eta=eta
        )


class WebSocketManager:
    """WebSocket 仿真管理器"""
    
    def __init__(self, storage_service: Optional[StorageService] = None):
        self.connection_manager = ConnectionManager(storage_service)
        self.sessions: Dict[str, SimulationSession] = {}
        self.storage_service = storage_service
    
    @property
    def connection_count(self) -> int:
        return self.connection_manager.connection_count
    
    async def handle_connection(self, websocket: WebSocket):
        """处理新连接"""
        client_id = f"client_{len(self.connection_manager.active_connections) + 1}"
        await self.connection_manager.connect(websocket, client_id)
        
        try:
            while True:
                data = await websocket.receive_json()
                await self._handle_message(client_id, data)
        except WebSocketDisconnect:
            await self.connection_manager.disconnect(client_id)
    
    async def handle_session(self, websocket: WebSocket, session_id: str):
        """处理带会话的连接"""
        await websocket.accept()
        
        session = SimulationSession(session_id, websocket)
        self.sessions[session_id] = session
        
        logger.info(f"Session connected: {session_id}")
        
        try:
            while True:
                data = await websocket.receive_json()
                await self._handle_session_message(session, data)
        except WebSocketDisconnect:
            await self._end_session(session_id)
    
    async def _handle_message(self, client_id: str, data: dict):
        """处理普通消息"""
        msg_type = data.get("type")
        
        if msg_type == "ping":
            await self.connection_manager.send_message(client_id, {"type": "pong"})
        elif msg_type == "status":
            await self.connection_manager.send_message(client_id, {
                "type": "status",
                "payload": {
                    "connections": self.connection_count,
                    "sessions": len(self.sessions)
                }
            })
    
    async def _handle_session_message(self, session: SimulationSession, data: dict):
        """处理会话消息"""
        msg_type = data.get("type")
        
        if msg_type == "INIT":
            await self._handle_init(session, data)
        elif msg_type == "START":
            await self._handle_start(session)
        elif msg_type == "PAUSE":
            await self._handle_pause(session)
        elif msg_type == "RESUME":
            await self._handle_resume(session)
        elif msg_type == "STOP":
            await self._handle_stop(session)
        elif msg_type == "RESET":
            await self._handle_reset(session)
        elif msg_type == "ping":
            await self._send(session, {"type": "pong"})
    
    async def _handle_init(self, session: SimulationSession, data: dict):
        """处理初始化"""
        session.config = data.get("config", {})
        session.total_time = session.config.get("max_simulation_time", 3600)
        
        await self._send(session, {
            "type": "INIT_COMPLETE",
            "payload": {
                "session_id": session.session_id,
                "config": session.config
            }
        })
    
    async def _handle_start(self, session: SimulationSession):
        """处理开始仿真"""
        if session.is_running:
            return
        
        session.is_running = True
        session.is_paused = False
        session.started_at = datetime.utcnow()
        
        await self._send(session, {"type": "STARTED"})
        
        # 启动仿真任务
        session.task = asyncio.create_task(self._run_simulation(session))
    
    async def _run_simulation(self, session: SimulationSession):
        """运行仿真 - 使用实际仿真引擎"""
        config_data = session.config or {}
        
        # 将前端配置转换为后端配置
        config = SimulationConfig(
            road_length_km=config_data.get('roadLengthKm', 10),
            segment_length_km=config_data.get('segmentLengthKm', 1),
            num_lanes=config_data.get('numLanes', 4),
            lane_width=config_data.get('laneWidth', 3.5),
            total_vehicles=config_data.get('totalVehicles', 1200),
            simulation_dt=config_data.get('simulationDt', 1.0),
            max_simulation_time=config_data.get('maxSimulationTime', 3600),
            anomaly_ratio=config_data.get('anomalyRatio', 0.01),
            global_anomaly_start=config_data.get('globalAnomalyStart', 200),
            vehicle_safe_run_time=config_data.get('vehicleSafeRunTime', 200),
            forced_change_dist=config_data.get('forcedChangeDist', 400),
            lane_change_gap=config_data.get('laneChangeGap', 25),
            lane_change_max_retries=config_data.get('laneChangeMaxRetries', 5),
            lane_change_retry_interval=config_data.get('laneChangeRetryInterval', 2.0),
            impact_threshold=config_data.get('impactThreshold', 0.90),
            impact_speed_ratio=config_data.get('impactSpeedRatio', 0.70),
            trajectory_sample_interval=config_data.get('trajectorySampleInterval', 2),
            lane_coupling_dist=50.0,
            lane_coupling_factor=0.01,
            queue_speed_threshold=15.0,
            queue_min_vehicles=3,
            queue_dissipation_rate=0.8,
            phantom_jam_speed=30.0,
            phantom_jam_dist=200.0,
            phase_critical_density=35.0,
            phase_transition_threshold=5.0,
            impact_discover_dist=config_data.get('impactDiscoverDist', 150.0)
        )
        
        # 创建仿真引擎
        engine = SimulationEngine(config)
        dt = config.simulation_dt
        max_time = config.max_simulation_time
        num_lanes = config.num_lanes
        lane_width = config.lane_width
        
        logger.info(f"Starting simulation with {config.total_vehicles} vehicles, {config.num_lanes} lanes, {max_time}s max time")
        
        # 记录开始
        await self._send_log(session, "INFO", f"仿真开始: 道路长度 {config.road_length_km}km, 车道数 {config.num_lanes}", "INFO")
        
        # 记录轨迹数据用于发送快照
        trajectory_data = []
        step_count = 0
        
        try:
            while engine.current_time < max_time:
                if not session.is_running:
                    await self._send_log(session, "INFO", "仿真已停止", "INFO")
                    return
                
                while session.is_paused:
                    await asyncio.sleep(0.1)
                    if not session.is_running:
                        return
                
                # 执行一步仿真
                engine.step()
                session.current_time = engine.current_time
                
                # 更新统计
                active_vehicles = [v for v in engine.vehicles if not v.finished]
                session.stats["active_vehicles"] = len(active_vehicles)
                session.stats["completed_vehicles"] = len(engine.finished_vehicles)
                session.stats["active_anomalies"] = len([v for v in active_vehicles if v.anomaly_state == 'active'])
                
                # 计算进度
                progress = (session.current_time / max_time) * 100
                eta = (max_time - session.current_time) / 60 if session.current_time < max_time else 0
                
                # 发送进度 (每10步或每100ms)
                step_count += 1
                if step_count % 10 == 0 or session.current_time % 100 < dt:
                    await self._send(session, {
                        "type": "PROGRESS",
                        "payload": {
                            "current_time": session.current_time,
                            "total_time": max_time,
                            "progress": progress,
                            "active_vehicles": session.stats["active_vehicles"],
                            "completed_vehicles": session.stats["completed_vehicles"],
                            "active_anomalies": session.stats["active_anomalies"],
                            "eta": eta
                        }
                    })
                
                # 每2步发送快照 (更高频率以保持平滑) 
                # 使用相对较小的步数，例如每0.2s模拟时间更新一次
                steps_per_snapshot = max(1, int(0.2 / dt))
                if step_count % steps_per_snapshot == 0:
                    await self._send_snapshot_from_engine(session, active_vehicles, num_lanes, lane_width)
                
                # 定期发送日志
                if step_count % 100 == 0:
                    await self._send_log(session, "INFO", 
                        f"进度: {progress:.1f}%, 活跃车辆: {len(active_vehicles)}, 完成: {len(engine.finished_vehicles)}", 
                        "INFO")
                
                # 避免阻塞
                await asyncio.sleep(0.001)
            
            # 仿真完成
            await self._send_log(session, "INFO", f"仿真完成! 完成车辆: {len(engine.finished_vehicles)}, 异常: {len(engine.anomaly_logs)}", "INFO")
            
            # 计算统计数据
            results = engine.export_to_dict()
            stats = results.get('statistics', {})
            
            # 持久化仿真结果到磁盘 (含 ml_dataset，供预测工作台训练使用)
            saved_path = None
            if self.storage_service:
                sim_id = f"run_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
                try:
                    saved_path = self.storage_service.save_results(sim_id, results)
                    logger.info(f"Simulation results saved to: {saved_path}")
                    ml_samples = len(results.get('ml_dataset', {}).get('samples', []))
                    await self._send_log(session, "INFO", f"仿真结果已保存: {sim_id}/data.json (ML样本数: {ml_samples})", "INFO")
                except Exception as save_err:
                    logger.error(f"Failed to save simulation results: {save_err}")
                    await self._send_log(session, "WARN", f"仿真结果保存失败: {save_err}", "WARN")
            
            session.is_running = False
            
            await self._send(session, {
                "type": "COMPLETE",
                "payload": {
                    "statistics": {
                        "total_vehicles": stats.get('total_vehicles', len(engine.finished_vehicles)),
                        "total_anomalies": stats.get('total_anomalies', len(engine.anomaly_logs)),
                        "simulation_time": session.current_time,
                        "completed_vehicles": stats.get('total_vehicles', len(engine.finished_vehicles)),
                        # 更多统计可以从 results 提取
                        "avg_speed": 0.0, # Placeholder
                        "avg_travel_time": 0.0, # Placeholder
                        "total_lane_changes": sum(v.total_lane_changes for v in engine.finished_vehicles) if engine.finished_vehicles else 0,
                        "anomaly_count": len(engine.anomaly_logs),
                        "affected_vehicles": len([v for v in engine.finished_vehicles if v.is_affected]),
                        "max_congestion_length": 0.0,
                        "etc_detection_rate": 0.0,
                        "ttc_violations": 0
                    },
                    "results": results
                }
            })
            
        except Exception as e:
            logger.error(f"Simulation error: {e}", exc_info=True)
            await self._send(session, {
                "type": "ERROR",
                "payload": {"message": str(e)}
            })
            session.is_running = False
    
    async def _send_snapshot_from_engine(self, session: SimulationSession, vehicles, num_lanes=4, lane_width=3.5):
        """从引擎发送车辆快照"""
        snapshot_vehicles = []
        
        # 限制发送的车辆数量，优先发送视野内的或所有活跃车辆
        # 如果车辆太多，可以考虑只发送部分，但为了平滑最好发送所有
        # 这里为了网络性能，我们限制最多发送500辆，或者做视图裁剪
        limit = 500 
        
        for v in vehicles[:limit]:  
            # 计算横向位置 (基于车道和lateral偏移)
            # 车道 0 在最下方 (或上方，取决于前端坐标系)
            # 假设 road center line 模式或从底部开始
            # 简化的 y 坐标计算: lane * width + width/2 + lateral
            y = v.lane * lane_width + (lane_width / 2) + v.lateral
            
            snapshot_vehicles.append({
                "id": v.id,
                "x": v.pos,
                "y": y,
                "lane": v.lane,
                "speed": v.speed * 3.6,  # m/s 转 km/h
                "vehicle_type": v.vehicle_type if hasattr(v, 'vehicle_type') else "CAR",
                "anomaly_state": v.anomaly_state,
                "anomaly_type": v.anomaly_type,
                "is_affected": v.is_affected,
                "length": v.length,
                "color": v.color if hasattr(v, 'color') else "#1f77b4"
            })
        
        await self._send(session, {
            "type": "SNAPSHOT",
            "payload": {
                "time": session.current_time,
                "vehicles": snapshot_vehicles
            }
        })
    
    async def _send_snapshot(self, session: SimulationSession):
        """发送车辆快照"""
        # 模拟生成车辆快照
        vehicles = []
        for i in range(min(session.stats["active_vehicles"], 20)):
            vehicles.append({
                "id": i,
                "x": session.current_time * 10 + i * 50,
                "y": i % 4 * 4 + 2,
                "lane": i % 4,
                "speed": 60 + (i % 10) * 2,
                "vehicle_type": ["CAR", "TRUCK", "BUS"][i % 3],
                "anomaly_state": "normal",
                "anomaly_type": 0,
                "is_affected": False,
                "length": 4.5 + (i % 3) * 3,
                "color": "#1f77b4"
            })
        
        await self._send(session, {
            "type": "SNAPSHOT",
            "payload": {
                "time": session.current_time,
                "vehicles": vehicles
            }
        })
    
    async def _send_log(self, session: SimulationSession, level: str, message: str, category: str):
        """发送日志"""
        await self._send(session, {
            "type": "LOG",
            "payload": {
                "level": level,
                "message": message,
                "timestamp": session.current_time,
                "category": category
            }
        })
    
    async def _handle_pause(self, session: SimulationSession):
        """处理暂停"""
        if session.is_running and not session.is_paused:
            session.is_paused = True
            await self._send(session, {"type": "PAUSED"})
    
    async def _handle_resume(self, session: SimulationSession):
        """处理恢复"""
        if session.is_running and session.is_paused:
            session.is_paused = False
            await self._send(session, {"type": "RESUMED"})
    
    async def _handle_stop(self, session: SimulationSession):
        """处理停止"""
        session.is_running = False
        session.is_paused = False
        
        if session.task:
            session.task.cancel()
        
        await self._send(session, {"type": "STOPPED"})
    
    async def _handle_reset(self, session: SimulationSession):
        """处理重置"""
        await self._handle_stop(session)
        
        session.current_time = 0
        session.stats = {
            "active_vehicles": 0,
            "completed_vehicles": 0,
            "active_anomalies": 0,
            "total_lane_changes": 0
        }
        
        await self._send(session, {"type": "RESET_COMPLETE"})
    
    async def _send(self, session: SimulationSession, message: dict):
        """发送消息"""
        try:
            await session.websocket.send_json(message)
        except Exception as e:
            logger.error(f"Failed to send message to session {session.session_id}: {e}")
    
    async def _end_session(self, session_id: str):
        """结束会话"""
        if session_id in self.sessions:
            session = self.sessions[session_id]
            await self._handle_stop(session)
            del self.sessions[session_id]
            logger.info(f"Session ended: {session_id}")
    
    async def shutdown(self):
        """关闭所有连接"""
        # 停止所有会话
        for session_id in list(self.sessions.keys()):
            await self._end_session(session_id)
        
        # 关闭所有连接
        for client_id in list(self.connection_manager.active_connections.keys()):
            await self.connection_manager.disconnect(client_id)
        
        logger.info("WebSocket manager shutdown complete")
