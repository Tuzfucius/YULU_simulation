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
        
        blocked_lanes = defaultdict(list)
        for v in active_vehicles:
            if v.anomaly_type == 1 and v.anomaly_state == 'active':
                blocked_lanes[v.lane].append(v.pos)
        
        for v in active_vehicles:
            seg = int(v.pos / (self.config.segment_length_km * 1000 if self.config else 2000))
            v.record_time(self.current_time, seg, self.config.segment_length_km if self.config else 2.0)
            
            log = v.trigger_anomaly(self.current_time, seg)
            if log:
                self.anomaly_logs.append(log)
            
            v.update(dt, active_vehicles, dict(blocked_lanes), self.current_time)
        
        for v in active_vehicles:
            if v.anomaly_state == 'active' and not v.detected_by_etc:
                pos_km = v.pos / 1000
                for gate in self.road_network.etc_gates:
                    if gate.segment in self.road_network.segments:
                        if gate.position_km <= pos_km < gate.position_km + 0.5:
                            v.detected_by_etc = True
                            v.etc_detection_time = self.current_time - v.anomaly_trigger_time
                            break
        
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
            
            # 更新阻塞车道
            blocked_lanes = defaultdict(list)
            for v in active_vehicles:
                if v.anomaly_type == 1 and v.anomaly_state == 'active':
                    blocked_lanes[v.lane].append(v.pos)
            
            # 更新车辆
            for v in active_vehicles:
                seg = int(v.pos / (self.config.segment_length_km * 1000 if self.config else 2000))
                v.record_time(self.current_time, seg, self.config.segment_length_km if self.config else 2.0)
                
                log = v.trigger_anomaly(self.current_time, seg)
                if log:
                    self.anomaly_logs.append(log)
                
                v.update(dt, active_vehicles, dict(blocked_lanes), self.current_time)
            
            # ETC门架检测（方案B）
            for v in active_vehicles:
                if v.anomaly_state == 'active' and not v.detected_by_etc:
                    pos_km = v.pos / 1000
                    for gate in self.road_network.etc_gates:
                        if gate.segment in self.road_network.segments:
                            if gate.position_km <= pos_km < gate.position_km + 0.5:
                                v.detected_by_etc = True
                                v.etc_detection_time = self.current_time - v.anomaly_trigger_time
                                break
            
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
        return {
            'config': self.config.to_dict() if self.config else {},
            'statistics': {
                'total_vehicles': len(results.finished_vehicles),
                'total_anomalies': len(results.anomaly_logs),
                'simulation_time': self.current_time,
            },
            'anomaly_logs': results.anomaly_logs,
            'trajectory_data': [t.copy() for t in results.trajectory_data],
            'segment_speed_history': [s.copy() for s in results.segment_speed_history],
            'queue_events': [q.copy() for q in results.queue_events],
            'phantom_jam_events': [j.copy() for j in results.phantom_jam_events],
            'safety_data': [s.copy() for s in results.safety_data],
            'vehicle_records': [v.to_dict() for v in results.finished_vehicles]
        }
