"""
仿真引擎
"""

import random
from collections import defaultdict
from typing import List, Dict, Optional
from dataclasses import dataclass

from ..config.parameters import SimulationConfig
from ..core.vehicle import Vehicle
from ..road.network import RoadNetwork
from ..simulation.spawner import VehicleSpawner
from ..utils.spatial_index import SpatialIndex
from ..models.etc_anomaly_detector import ETCAnomalyDetector, ETCTransaction
from ..models.etc_noise_simulator import ETCNoiseSimulator, NoiseConfig
from ..models.environment import EnvironmentModel, EnvironmentConfig, WeatherType
from ..models.alert_context import AlertContext, AlertEvent
from ..models.alert_rules import AlertRuleEngine, create_default_rules
from ..models.ml_feature_extractor import TimeSeriesFeatureExtractor
from ..models.alert_evaluator import extract_ground_truths_from_engine


@dataclass
class SimulationResult:
    """仿真结果"""
    finished_vehicles: List[Vehicle]
    anomaly_logs: List[Dict]
    trajectory_data: List[Dict]
    segment_speed_history: List[Dict]
    queue_events: List[Dict]
    phantom_jam_events: List[Dict]
    safety_data: List[Dict]


class SimulationEngine:
    """仿真引擎
    
    整合所有模块，驱动仿真运行
    """
    
    def __init__(self, config: SimulationConfig = None):
        self.config = config
        self.road_network = RoadNetwork(
            road_length_km=config.road_length_km if config else 20.0,
            num_lanes=config.num_lanes if config else 4
        )
        self.spawner = VehicleSpawner(
            total_vehicles=config.total_vehicles if config else 1200,
            num_lanes=config.num_lanes if config else 4
        )
        
        # 初始化空间索引 (O(N) 车辆检索)
        self.spatial_index = SpatialIndex(
            road_length_km=config.road_length_km if config else 20.0,
            num_lanes=config.num_lanes if config else 4,
            cell_size=100.0  # 每 100 米一个网格
        )
        
        # 初始化 ETC 异常检测器
        self.etc_detector = ETCAnomalyDetector()
        self.etc_alerts: List[Dict] = []  # ETC 异常警报
        
        # 初始化 ETC 噪声模拟器
        self.etc_noise_simulator = ETCNoiseSimulator()
        self.etc_noise_events: List[Dict] = []  # 噪声事件记录
        
        # 初始化环境影响模型
        self.environment = EnvironmentModel()
        
        # 初始化预警规则引擎
        self.alert_rule_engine = AlertRuleEngine()
        for rule in create_default_rules():
            self.alert_rule_engine.add_rule(rule)
        self.rule_engine_events: List[Dict] = []  # 规则引擎预警事件
        
        self.vehicles: List[Vehicle] = []
        self.finished_vehicles: List[Vehicle] = []
        self.anomaly_logs: List[Dict] = []
        self.trajectory_data: List[Dict] = []
        self.segment_speed_history: List[Dict] = []
        self.queue_events: List[Dict] = []
        self.phantom_jam_events: List[Dict] = []
        self.safety_data: List[Dict] = []
        
        self.current_time = 0.0
        self.vehicle_id_counter = 0
        
        self._init_etc_gates()
    
    def _init_etc_gates(self):
        """初始化ETC门架（每2公里一个）"""
        road_length = self.config.road_length_km if self.config else 20.0
        for gate_km in range(2, int(road_length), 2):
            self.road_network.add_etc_gate("main", float(gate_km))
    
    def _process_etc_transaction(self, vehicle, gate_id: str, gate_position_km: float):
        """处理 ETC 交易，应用噪声注入并调用异常检测
        
        Args:
            vehicle: 车辆对象
            gate_id: 门架 ID
            gate_position_km: 门架位置 (km)
        """
        # 注册门架（如果尚未注册）
        self.etc_detector.register_gate(gate_id, gate_position_km)
        
        # 构造原始交易记录 (dict 格式用于噪声处理)
        raw_transaction = {
            'vehicle_id': vehicle.id,
            'gate_id': gate_id,
            'gate_position_km': gate_position_km,
            'timestamp': self.current_time,
            'lane': vehicle.lane,
            'speed': vehicle.speed,
            'status': 'anomaly' if vehicle.anomaly_state == 'active' else 'normal'
        }
        
        # 应用噪声注入
        noisy_transactions, noise_events = self.etc_noise_simulator.process(raw_transaction)
        
        # 记录噪声事件
        for event in noise_events:
            self.etc_noise_events.append({
                'type': event.noise_type.value,
                'vehicle_id': event.vehicle_id,
                'gate_id': event.gate_id,
                'original_timestamp': event.original_timestamp,
                'modified_timestamp': event.modified_timestamp,
                'is_dropped': event.is_dropped,
                'description': event.description
            })
        
        # 处理（可能多条、可能为空的）交易
        for trans_dict in noisy_transactions:
            # 转换为 ETCTransaction 对象
            transaction = ETCTransaction(
                vehicle_id=trans_dict['vehicle_id'],
                gate_id=trans_dict['gate_id'],
                gate_position_km=trans_dict['gate_position_km'],
                timestamp=trans_dict['timestamp'],
                lane=trans_dict['lane'],
                speed=trans_dict['speed'],
                status=trans_dict['status']
            )
            
            # 调用异常检测
            alert = self.etc_detector.record_transaction(transaction)
            if alert:
                self.etc_alerts.append({
                    'type': alert.alert_type,
                    'severity': alert.severity,
                    'gate_id': alert.gate_id,
                    'position_km': alert.position_km,
                    'timestamp': alert.timestamp,
                    'description': alert.description,
                    'confidence': alert.confidence
                })
        
        # 异常车辆的 ETC 检测时间记录
        if vehicle.anomaly_state == 'active' and not vehicle.detected_by_etc:
            vehicle.detected_by_etc = True
            if vehicle.anomaly_trigger_time:
                vehicle.etc_detection_time = self.current_time - vehicle.anomaly_trigger_time
    
    def add_output(self, output_handler):
        """添加输出处理器"""
        pass  # 可扩展
    
    def step(self):
        """执行一步仿真"""
        dt = self.config.simulation_dt if self.config else 1.0
        max_time = self.config.max_simulation_time if self.config else 3900
        
        if self.current_time >= max_time:
            return
        
        # 使用类成员变量维护生成进度
        while self.spawn_idx < len(self.spawn_schedule) and self.spawn_schedule[self.spawn_idx] <= self.current_time:
            lane_choice = list(range(self.config.num_lanes if self.config else 4))
            random.shuffle(lane_choice)
            placed = False
            
            for lane in lane_choice:
                clear = True
                for v in self.vehicles:
                    if v.lane == lane and v.pos < 50:
                        clear = False
                        break
                if clear:
                    new_v = Vehicle(self.vehicle_id_counter, self.current_time, lane, self.config)
                    self.vehicles.append(new_v)
                    self.vehicle_id_counter += 1
                    placed = True
                    break
            
            if placed:
                self.spawn_idx += 1
            else:
                self.spawn_schedule[self.spawn_idx] += 1.0
        
        active_vehicles = [v for v in self.vehicles if not v.finished]
        active_vehicles.sort(key=lambda x: x.pos)
        
        # 重建空间索引 (O(N))
        self.spatial_index.rebuild(active_vehicles)
        
        blocked_lanes = defaultdict(list)
        for v in active_vehicles:
            if v.anomaly_type == 1 and v.anomaly_state == 'active':
                blocked_lanes[v.lane].append(v.pos)
        
        # 更新车辆（使用空间索引获取邻近车辆，避免 O(N^2)）
        for v in active_vehicles:
            seg = int(v.pos / (self.config.segment_length_km * 1000 if self.config else 2000))
            v.record_time(self.current_time, seg, self.config.segment_length_km if self.config else 2.0)
            
            log = v.trigger_anomaly(self.current_time, seg)
            if log:
                self.anomaly_logs.append(log)
            
            # 使用空间索引获取邻近车辆 (O(1) per vehicle)
            nearby_vehicles = self.spatial_index.get_nearby_vehicles(v, range_cells=3)
            v.update(dt, nearby_vehicles, dict(blocked_lanes), self.current_time)
            
            # 更新空间索引中的车辆位置
            self.spatial_index.update_vehicle(v)
        
        # ETC门架检测与异常识别
        for v in active_vehicles:
            pos_km = v.pos / 1000
            for gate in self.road_network.etc_gates:
                gate_id = f"G{int(gate.position_km):02d}"
                
                if gate.position_km - 0.05 <= pos_km < gate.position_km + 0.05:
                    last_gate_key = f"_last_gate_{gate_id}"
                    if not hasattr(v, last_gate_key) or not getattr(v, last_gate_key):
                        setattr(v, last_gate_key, True)
                        self._process_etc_transaction(v, gate_id, gate.position_km)
        
        for v in active_vehicles:
            self.trajectory_data.append({
                'id': v.id, 'pos': v.pos, 'time': self.current_time,
                'lane': v.lane, 'speed': v.speed,
                'anomaly_state': v.anomaly_state, 'anomaly_type': v.anomaly_type,
                'vehicle_type': v.vehicle_type, 'driver_style': v.driver_style,
                'is_affected': v.is_affected
            })
        
        segment_speeds = defaultdict(list)
        segment_densities = defaultdict(int)
        
        for v in active_vehicles:
            seg = int(v.pos / (self.config.segment_length_km * 1000 if self.config else 2000))
            if 0 <= seg < (self.config.num_segments if self.config else 10):
                segment_speeds[seg].append(v.speed)
                segment_densities[seg] += 1
        
        for seg_idx, speeds in segment_speeds.items():
            if speeds:
                avg_speed = sum(speeds) / len(speeds)
                density = segment_densities[seg_idx] / (self.config.segment_length_km if self.config else 2.0)
                
                self.segment_speed_history.append({
                    'time': self.current_time, 'segment': seg_idx,
                    'avg_speed': avg_speed, 'density': density,
                    'flow': avg_speed * density
                })
        
        queue_state = self._detect_queue_state(active_vehicles)
        if queue_state['in_queue']:
            self.queue_events.append({'time': self.current_time, **queue_state})
        
        from ..models.phantom_jam import PhantomJamDetector
        jams = PhantomJamDetector.detect_phantom_jam(active_vehicles, self.current_time)
        self.phantom_jam_events.extend(jams)
        
        for v in active_vehicles:
            self.safety_data.append({
                'time': self.current_time, 'vehicle_id': v.id,
                'vehicle_type': v.vehicle_type, 'driver_style': v.driver_style,
                'speed': v.speed * 3.6, 'pos': v.pos,
                'min_ttc': v.min_ttc, 'max_decel': v.max_decel,
                'brake_count': v.brake_count, 'emergency_brake_count': v.emergency_brake_count
            })
        
        # ===== 预警规则引擎评估 (step 方法) =====
        alert_context = AlertContext(
            current_time=self.current_time,
            gate_stats=self.etc_detector.gate_stats,
            recent_transactions=self.etc_detector.transactions[-100:] if self.etc_detector.transactions else [],
            active_incidents=[],
            vehicle_speeds={v.id: v.speed for v in active_vehicles},
            vehicle_positions={v.id: v.pos for v in active_vehicles},
            vehicle_anomaly_states={v.id: v.anomaly_state for v in active_vehicles},
            vehicle_lanes={v.id: v.lane for v in active_vehicles},
            noise_stats=self.etc_noise_simulator.get_statistics(),
            weather_type=self.environment.current_weather.value if hasattr(self.environment, 'current_weather') else 'clear',
            queue_lengths={},
            segment_avg_speeds={seg: sum(spds)/len(spds) for seg, spds in segment_speeds.items() if spds},
            alert_history=[],
            recent_alert_events=self.alert_rule_engine.get_recent_events(
                max_age=300.0, current_time=self.current_time
            ),
        )
        
        rule_events = self.alert_rule_engine.evaluate_all(alert_context)
        for event in rule_events:
            self.rule_engine_events.append({
                'rule_name': event.rule_name,
                'severity': event.severity,
                'timestamp': event.timestamp,
                'gate_id': event.gate_id,
                'position_km': event.position_km,
                'description': event.description,
                'confidence': event.confidence,
            })
        
        completed = [v for v in self.vehicles if v.finished]
        self.finished_vehicles.extend(completed)
        self.vehicles = [v for v in self.vehicles if not v.finished]
        
        self.current_time += dt
    
    def run(self):
        """运行仿真主循环"""
        spawn_idx = 0
        spawn_schedule = self.spawner.get_spawn_times()
        
        dt = self.config.simulation_dt if self.config else 1.0
        max_time = self.config.max_simulation_time if self.config else 3900
        
        while len(self.vehicles) > 0 or spawn_idx < len(spawn_schedule):
            # 生成新车辆
            while spawn_idx < len(spawn_schedule) and spawn_schedule[spawn_idx] <= self.current_time:
                lane_choice = list(range(self.config.num_lanes if self.config else 4))
                random.shuffle(lane_choice)
                placed = False
                
                for lane in lane_choice:
                    clear = True
                    for v in self.vehicles:
                        if v.lane == lane and v.pos < 50:
                            clear = False
                            break
                    if clear:
                        new_v = Vehicle(self.vehicle_id_counter, self.current_time, lane, self.config)
                        self.vehicles.append(new_v)
                        self.vehicle_id_counter += 1
                        placed = True
                        break
                
                if placed:
                    spawn_idx += 1
                else:
                    spawn_schedule[spawn_idx] += 1.0
            
            active_vehicles = [v for v in self.vehicles if not v.finished]
            active_vehicles.sort(key=lambda x: x.pos)
            
            # 重建空间索引 (O(N))
            self.spatial_index.rebuild(active_vehicles)
            
            # 更新阻塞车道
            blocked_lanes = defaultdict(list)
            for v in active_vehicles:
                if v.anomaly_type == 1 and v.anomaly_state == 'active':
                    blocked_lanes[v.lane].append(v.pos)
            
            # 更新车辆（使用空间索引获取邻近车辆，避免 O(N^2)）
            for v in active_vehicles:
                seg = int(v.pos / (self.config.segment_length_km * 1000 if self.config else 2000))
                v.record_time(self.current_time, seg, self.config.segment_length_km if self.config else 2.0)
                
                log = v.trigger_anomaly(self.current_time, seg)
                if log:
                    self.anomaly_logs.append(log)
                
                # 使用空间索引获取邻近车辆 (O(1) per vehicle)
                nearby_vehicles = self.spatial_index.get_nearby_vehicles(v, range_cells=3)
                v.update(dt, nearby_vehicles, dict(blocked_lanes), self.current_time)
                
                # 更新空间索引中的车辆位置
                self.spatial_index.update_vehicle(v)
            
            # ETC门架检测与异常识别
            for v in active_vehicles:
                pos_km = v.pos / 1000
                for gate in self.road_network.etc_gates:
                    gate_id = f"G{int(gate.position_km):02d}"
                    
                    if gate.position_km - 0.05 <= pos_km < gate.position_km + 0.05:
                        last_gate_key = f"_last_gate_{gate_id}"
                        if not hasattr(v, last_gate_key) or not getattr(v, last_gate_key):
                            setattr(v, last_gate_key, True)
                            self._process_etc_transaction(v, gate_id, gate.position_km)
            
            # 记录轨迹
            for v in active_vehicles:
                self.trajectory_data.append({
                    'id': v.id,
                    'pos': v.pos,
                    'time': self.current_time,
                    'lane': v.lane,
                    'speed': v.speed,
                    'anomaly_state': v.anomaly_state,
                    'anomaly_type': v.anomaly_type,
                    'vehicle_type': v.vehicle_type,
                    'driver_style': v.driver_style,
                    'is_affected': v.is_affected
                })
            
            # 记录区间速度
            segment_speeds = defaultdict(list)
            segment_densities = defaultdict(int)
            
            for v in active_vehicles:
                seg = int(v.pos / (self.config.segment_length_km * 1000 if self.config else 2000))
                if 0 <= seg < (self.config.num_segments if self.config else 10):
                    segment_speeds[seg].append(v.speed)
                    segment_densities[seg] += 1
            
            for seg_idx, speeds in segment_speeds.items():
                if speeds:
                    avg_speed = sum(speeds) / len(speeds)
                    density = segment_densities[seg_idx] / (self.config.segment_length_km if self.config else 2.0)
                    
                    self.segment_speed_history.append({
                        'time': self.current_time,
                        'segment': seg_idx,
                        'avg_speed': avg_speed,
                        'density': density,
                        'flow': avg_speed * density
                    })
            
            # 检测排队
            queue_state = self._detect_queue_state(active_vehicles)
            if queue_state['in_queue']:
                self.queue_events.append({
                    'time': self.current_time,
                    **queue_state
                })
            
            # 检测幽灵堵车
            from ..models.phantom_jam import PhantomJamDetector
            jams = PhantomJamDetector.detect_phantom_jam(active_vehicles, self.current_time)
            self.phantom_jam_events.extend(jams)
            
            # 记录安全数据
            for v in active_vehicles:
                self.safety_data.append({
                    'time': self.current_time,
                    'vehicle_id': v.id,
                    'vehicle_type': v.vehicle_type,
                    'driver_style': v.driver_style,
                    'speed': v.speed * 3.6,
                    'pos': v.pos,
                    'min_ttc': v.min_ttc,
                    'max_decel': v.max_decel,
                    'brake_count': v.brake_count,
                    'emergency_brake_count': v.emergency_brake_count
                })
            
            # ===== 预警规则引擎评估 =====
            alert_context = AlertContext(
                current_time=self.current_time,
                gate_stats=self.etc_detector.gate_stats,
                recent_transactions=self.etc_detector.transactions[-100:] if self.etc_detector.transactions else [],
                active_incidents=[],
                vehicle_speeds={v.id: v.speed for v in active_vehicles},
                vehicle_positions={v.id: v.pos for v in active_vehicles},
                vehicle_anomaly_states={v.id: v.anomaly_state for v in active_vehicles},
                vehicle_lanes={v.id: v.lane for v in active_vehicles},
                noise_stats=self.etc_noise_simulator.get_statistics(),
                weather_type=self.environment.current_weather.value if hasattr(self.environment, 'current_weather') else 'clear',
                queue_lengths={},
                segment_avg_speeds={seg: sum(spds)/len(spds) for seg, spds in segment_speeds.items() if spds},
                alert_history=[],
                recent_alert_events=self.alert_rule_engine.get_recent_events(
                    max_age=300.0, current_time=self.current_time
                ),
            )
            
            rule_events = self.alert_rule_engine.evaluate_all(alert_context)
            for event in rule_events:
                self.rule_engine_events.append({
                    'rule_name': event.rule_name,
                    'severity': event.severity,
                    'timestamp': event.timestamp,
                    'gate_id': event.gate_id,
                    'position_km': event.position_km,
                    'description': event.description,
                    'confidence': event.confidence,
                })
            
            # 完成车辆
            completed = [v for v in self.vehicles if v.finished]
            self.finished_vehicles.extend(completed)
            self.vehicles = [v for v in self.vehicles if not v.finished]
            
            self.current_time += dt
            
            # 检查是否达到最大时间
            if self.current_time > max_time:
                print(f"达到最大模拟时间 {max_time}秒，仿真结束")
                break
        
        print("仿真完成。")
    
    def _detect_queue_state(self, vehicles: List[Vehicle]) -> Dict:
        """检测排队状态"""
        from ..models.queue import QueueFormationModel
        
        return QueueFormationModel.detect_queue_state(vehicles)
    
    def get_results(self) -> SimulationResult:
        """获取仿真结果"""
        return SimulationResult(
            finished_vehicles=self.finished_vehicles,
            anomaly_logs=self.anomaly_logs,
            trajectory_data=self.trajectory_data,
            segment_speed_history=self.segment_speed_history,
            queue_events=self.queue_events,
            phantom_jam_events=self.phantom_jam_events,
            safety_data=self.safety_data
        )
    
    def export_to_dict(self) -> dict:
        """导出仿真结果为字典"""
        results = self.get_results()
        noise_stats = self.etc_noise_simulator.get_statistics()
        
        return {
            'config': self.config.to_dict() if self.config else {},
            'statistics': {
                'total_vehicles': len(results.finished_vehicles),
                'total_anomalies': len(results.anomaly_logs),
                'simulation_time': self.current_time,
                'etc_alerts_count': len(self.etc_alerts),
                'etc_transactions_count': len(self.etc_detector.transactions),
            },
            'anomaly_logs': results.anomaly_logs,
            'trajectory_data': [t.copy() for t in results.trajectory_data],
            'segment_speed_history': [s.copy() for s in results.segment_speed_history],
            'queue_events': [q.copy() for q in results.queue_events],
            'phantom_jam_events': [j.copy() for j in results.phantom_jam_events],
            'safety_data': [s.copy() for s in results.safety_data],
            'vehicle_records': [v.to_dict() for v in results.finished_vehicles],
            'etc_detection': {
                'alerts': self.etc_alerts,
                'gate_stats': self.etc_detector.get_all_stats(),
                'noise_events': self.etc_noise_events,
                'noise_statistics': noise_stats,
            },
            'environment': self.environment.get_status(),
            'rule_engine': {
                'events': self.rule_engine_events,
                'engine_stats': self.alert_rule_engine.to_dict(),
            },
            'ml_dataset': self._generate_ml_dataset()
        }

    def _generate_ml_dataset(self) -> dict:
        """生成供机器学习使用的时序特征序列数据集"""
        try:
            ground_truths = extract_ground_truths_from_engine(self)
            extractor = TimeSeriesFeatureExtractor(step_seconds=60.0, window_size_steps=5)
            dataset = extractor.build_dataset(
                transactions=self.etc_detector.transactions,
                ground_truths=ground_truths,
                run_id="sim_run"
            )
            return dataset
        except Exception as e:
            print(f"Error generating ML dataset: {e}")
            return {}
