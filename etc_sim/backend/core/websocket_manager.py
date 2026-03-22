"""WebSocket manager integrated with the simulation engine."""


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
from etc_sim.backend.api.workflows import (
    DEFAULT_WORKFLOW_NAME,
    load_rules_for_runtime,
    resolve_runtime_workflow_name,
)

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manage active WebSocket connections."""
    
    def __init__(self, storage_service: Optional[StorageService] = None):
        self.active_connections: Dict[str, WebSocket] = {}
        self.session_connections: Dict[str, Dict[str, WebSocket]] = {}
        self.storage_service = storage_service
    
    @property
    def connection_count(self) -> int:
        """Return the number of active connections."""
        return len(self.active_connections)
    
    async def connect(self, websocket: WebSocket, client_id: str):
        """Accept a client connection."""
        await websocket.accept()
        self.active_connections[client_id] = websocket
        logger.info(f"Client connected: {client_id}, total: {self.connection_count}")
    
    async def disconnect(self, client_id: str):
        """Disconnect a client."""
        if client_id in self.active_connections:
            del self.active_connections[client_id]
        logger.info(f"Client disconnected: {client_id}, total: {self.connection_count}")
    
    async def send_message(self, client_id: str, message: dict):
        """Send a message to a specific client."""
        if client_id in self.active_connections:
            websocket = self.active_connections[client_id]
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.error(f"Failed to send message to {client_id}: {e}")
    
    async def broadcast(self, message: dict, exclude: Optional[str] = None):
        """Broadcast a message to all clients."""
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
    """Runtime state for one simulation session."""
    
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
        
        # 缁熻鏁版嵁
        self.stats = {
            "active_vehicles": 0,
            "completed_vehicles": 0,
            "active_anomalies": 0,
            "total_lane_changes": 0
        }
    
    def to_progress_payload(self) -> ProgressPayload:
        """Build a progress payload for the session."""
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
    """Coordinate simulation sessions over WebSocket."""
    
    def __init__(self, storage_service: Optional[StorageService] = None):
        self.connection_manager = ConnectionManager(storage_service)
        self.sessions: Dict[str, SimulationSession] = {}
        self.storage_service = storage_service
    
    @property
    def connection_count(self) -> int:
        return self.connection_manager.connection_count
    
    async def handle_connection(self, websocket: WebSocket):
        """Handle a generic WebSocket connection."""
        client_id = f"client_{len(self.connection_manager.active_connections) + 1}"
        await self.connection_manager.connect(websocket, client_id)
        
        try:
            while True:
                data = await websocket.receive_json()
                await self._handle_message(client_id, data)
        except WebSocketDisconnect:
            await self.connection_manager.disconnect(client_id)
    
    async def handle_session(self, websocket: WebSocket, session_id: str):
        """Handle a session-bound WebSocket connection."""
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
        """Process a generic connection message."""
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
        """Process a session message."""
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
        """Handle session initialization."""
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
        """Handle simulation start."""
        if session.is_running:
            return
        
        session.is_running = True
        session.is_paused = False
        session.started_at = datetime.utcnow()
        
        await self._send(session, {"type": "STARTED"})
        
        # 鍚姩浠跨湡浠诲姟
        session.task = asyncio.create_task(self._run_simulation(session))
    
    async def _run_simulation(self, session: SimulationSession):
        """Run the simulation loop."""
        config_data = session.config or {}

        config = SimulationConfig(
            road_length_km=config_data.get('roadLengthKm', 10),
            segment_length_km=config_data.get('segmentLengthKm', 1),
            num_lanes=config_data.get('numLanes', 4),
            lane_width=config_data.get('laneWidth', 3.5),
            custom_road_length_km=config_data.get('customRoadLengthKm'),
            custom_gantry_positions=config_data.get('customGantryPositionsKm', []),
            custom_road_path=config_data.get('customRoadPath'),
            custom_ramps=config_data.get('customRamps', []),
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
            impact_discover_dist=config_data.get('impactDiscoverDist', 150.0),
        )

        custom_rules = None
        workflow_name = resolve_runtime_workflow_name(config_data)
        try:
            custom_rules = load_rules_for_runtime(workflow_name=workflow_name)
            if custom_rules:
                rule_source = f"workflow '{workflow_name}'" if workflow_name else f"default workflow '{DEFAULT_WORKFLOW_NAME}' or default rules"
                logger.info('Loaded %s workflow rules from %s', len(custom_rules), rule_source)
        except Exception as exc:
            logger.warning('Failed to load workflow rules for runtime, fallback to engine defaults: %s', exc)
            custom_rules = None

        engine = SimulationEngine(config, custom_rules=custom_rules)
        dt = config.simulation_dt
        max_time = config.max_simulation_time
        num_lanes = config.num_lanes
        lane_width = config.lane_width

        logger.info(
            'Starting simulation with %s vehicles, %s lanes, %ss max time',
            config.total_vehicles,
            config.num_lanes,
            max_time,
        )
        await self._send_log(
            session,
            'INFO',
            f'????: ???? {config.road_length_km}km, ??? {config.num_lanes}',
            'INFO',
        )

        step_count = 0
        try:
            while engine.current_time < max_time:
                if not session.is_running:
                    await self._send_log(session, 'INFO', '?????', 'INFO')
                    return

                while session.is_paused:
                    await asyncio.sleep(0.1)
                    if not session.is_running:
                        return

                engine.step()
                session.current_time = engine.current_time

                active_vehicles = [vehicle for vehicle in engine.vehicles if not vehicle.finished]
                session.stats['active_vehicles'] = len(active_vehicles)
                session.stats['completed_vehicles'] = len(engine.finished_vehicles)
                session.stats['active_anomalies'] = len(
                    [vehicle for vehicle in active_vehicles if vehicle.anomaly_state == 'active']
                )

                progress = (session.current_time / max_time) * 100
                eta = (max_time - session.current_time) / 60 if session.current_time < max_time else 0

                step_count += 1
                if step_count % 10 == 0 or session.current_time % 100 < dt:
                    await self._send(
                        session,
                        {
                            'type': 'PROGRESS',
                            'payload': {
                                'current_time': session.current_time,
                                'total_time': max_time,
                                'progress': progress,
                                'active_vehicles': session.stats['active_vehicles'],
                                'completed_vehicles': session.stats['completed_vehicles'],
                                'active_anomalies': session.stats['active_anomalies'],
                                'eta': eta,
                            },
                        },
                    )

                steps_per_snapshot = max(1, int(0.2 / dt))
                if step_count % steps_per_snapshot == 0:
                    await self._send_snapshot_from_engine(session, active_vehicles, num_lanes, lane_width)

                if step_count % 100 == 0:
                    await self._send_log(
                        session,
                        'INFO',
                        f'??: {progress:.1f}%, ????: {len(active_vehicles)}, ??: {len(engine.finished_vehicles)}',
                        'INFO',
                    )

                await asyncio.sleep(0.001)

            await self._send_log(
                session,
                'INFO',
                f'????! ????: {len(engine.finished_vehicles)}, ??: {len(engine.anomaly_logs)}',
                'INFO',
            )

            results = engine.export_to_dict()
            stats = results.get('statistics', {})

            saved_path = None
            sim_id = None
            if self.storage_service:
                sim_id = f"run_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
                try:
                    saved_path = self.storage_service.save_results(sim_id, results)
                    logger.info('Simulation results saved to: %s', saved_path)
                    ml_samples = len(results.get('ml_dataset', {}).get('samples', []))
                    await self._send_log(
                        session,
                        'INFO',
                        f'???????: {sim_id}/data.json (ML??? {ml_samples})',
                        'INFO',
                    )
                except Exception as save_err:
                    logger.error('Failed to save simulation results: %s', save_err)
                    await self._send_log(session, 'WARN', f'????????: {save_err}', 'WARN')

            session.is_running = False
            await self._send(
                session,
                {
                    'type': 'COMPLETE',
                    'payload': {
                        'run_id': sim_id,
                        'saved_path': saved_path,
                        'statistics': {
                            'total_vehicles': stats.get('total_vehicles', len(engine.finished_vehicles)),
                            'total_anomalies': stats.get('total_anomalies', len(engine.anomaly_logs)),
                            'simulation_time': session.current_time,
                            'completed_vehicles': stats.get('total_vehicles', len(engine.finished_vehicles)),
                            'avg_speed': 0.0,
                            'avg_travel_time': 0.0,
                            'total_lane_changes': sum(v.total_lane_changes for v in engine.finished_vehicles) if engine.finished_vehicles else 0,
                            'anomaly_count': len(engine.anomaly_logs),
                            'affected_vehicles': len([v for v in engine.finished_vehicles if v.is_affected]),
                            'max_congestion_length': 0.0,
                            'etc_detection_rate': 0.0,
                            'ttc_violations': 0,
                        },
                        'results': results,
                    },
                },
            )
        except Exception as exc:
            logger.error('Simulation error: %s', exc, exc_info=True)
            await self._send(session, {'type': 'ERROR', 'payload': {'message': str(exc)}})
            session.is_running = False

    async def _send_snapshot_from_engine(self, session: SimulationSession, vehicles, num_lanes=4, lane_width=3.5):
        """Send a snapshot built from the engine state."""
        snapshot_vehicles = []
        
        # 闄愬埗鍙戦€佺殑杞﹁締鏁伴噺锛屼紭鍏堝彂閫佽閲庡唴鐨勬垨鎵€鏈夋椿璺冭溅杈?        # 濡傛灉杞﹁締澶锛屽彲浠ヨ€冭檻鍙彂閫侀儴鍒嗭紝浣嗕负浜嗗钩婊戞渶濂藉彂閫佹墍鏈?        # 杩欓噷涓轰簡缃戠粶鎬ц兘锛屾垜浠檺鍒舵渶澶氬彂閫?00杈嗭紝鎴栬€呭仛瑙嗗浘瑁佸壀
        limit = 500 
        
        for v in vehicles[:limit]:  
            # 璁＄畻妯悜浣嶇疆 (鍩轰簬杞﹂亾鍜宭ateral鍋忕Щ)
            # 杞﹂亾 0 鍦ㄦ渶涓嬫柟 (鎴栦笂鏂癸紝鍙栧喅浜庡墠绔潗鏍囩郴)
            # 鍋囪 road center line 妯″紡鎴栦粠搴曢儴寮€濮?            # 绠€鍖栫殑 y 鍧愭爣璁＄畻: lane * width + width/2 + lateral
            y = v.lane * lane_width + (lane_width / 2) + v.lateral
            
            snapshot_vehicles.append({
                "id": v.id,
                "x": v.pos,
                "y": y,
                "lane": v.lane,
                "speed": v.speed * 3.6,  # m/s 杞?km/h
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
        """Send a synthetic snapshot."""
        # 妯℃嫙鐢熸垚杞﹁締蹇収
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
        """Send a log message."""
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
        """Handle pause."""
        if session.is_running and not session.is_paused:
            session.is_paused = True
            await self._send(session, {"type": "PAUSED"})
    
    async def _handle_resume(self, session: SimulationSession):
        """Handle resume."""
        if session.is_running and session.is_paused:
            session.is_paused = False
            await self._send(session, {"type": "RESUMED"})
    
    async def _handle_stop(self, session: SimulationSession):
        """Handle stop."""
        session.is_running = False
        session.is_paused = False
        
        if session.task:
            session.task.cancel()
        
        await self._send(session, {"type": "STOPPED"})
    
    async def _handle_reset(self, session: SimulationSession):
        """Handle reset."""
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
        """Send a session message."""
        try:
            await session.websocket.send_json(message)
        except Exception as e:
            logger.error(f"Failed to send message to session {session.session_id}: {e}")
    
    async def _end_session(self, session_id: str):
        """End a session."""
        if session_id in self.sessions:
            session = self.sessions[session_id]
            await self._handle_stop(session)
            del self.sessions[session_id]
            logger.info(f"Session ended: {session_id}")
    
    async def shutdown(self):
        """Shutdown all connections and sessions."""
        for session_id in list(self.sessions.keys()):
            await self._end_session(session_id)
        
        for client_id in list(self.connection_manager.active_connections.keys()):
            await self.connection_manager.disconnect(client_id)
        
        logger.info("WebSocket manager shutdown complete")

