"""
车辆类
基于IDM和MOBIL模型的车辆仿真
"""

import random
import math
from typing import Optional, Dict, List, Any
from dataclasses import dataclass

from ..config.parameters import SimulationConfig
from ..config.colors import COLORS


def kmh_to_ms(v: float) -> float:
    """公里/小时转米/秒"""
    return v / 3.6


def ms_to_kmh(v: float) -> float:
    """米/秒转公里/小时"""
    return v * 3.6


# 车辆类型配置
VEHICLE_TYPE_CONFIG = {
    'CAR': {
        'weight': 0.60,
        'v0_kmh': 120,
        'a_max': 3.0,
        'b_desired': 3.5,
        's0': 2.0,
        'T': 1.5,
        'delta': 4.0,
        'length': 4.5,
        'reaction_time': (0.8, 1.2),
        'color': COLORS['car'],
        'name': '轿车'
    },
    'TRUCK': {
        'weight': 0.25,
        'v0_kmh': 100,
        'a_max': 2.0,
        'b_desired': 2.5,
        's0': 2.5,
        'T': 1.8,
        'delta': 4.0,
        'length': 12.0,
        'reaction_time': (1.0, 1.5),
        'color': COLORS['truck'],
        'name': '卡车'
    },
    'BUS': {
        'weight': 0.15,
        'v0_kmh': 90,
        'a_max': 1.8,
        'b_desired': 2.2,
        's0': 2.2,
        'T': 1.6,
        'delta': 4.0,
        'length': 10.0,
        'reaction_time': (0.9, 1.3),
        'color': COLORS['bus'],
        'name': '客车'
    }
}


# 驾驶风格配置
DRIVER_STYLE_CONFIG = {
    'aggressive': {
        'weight': 0.20,
        'politeness': (0.1, 0.3),
        'aggressiveness': (1.1, 1.3),
        'reaction_time_factor': (0.8, 1.0),
        'color': COLORS['aggressive'],
        'name': '激进型'
    },
    'conservative': {
        'weight': 0.20,
        'politeness': (0.6, 0.8),
        'aggressiveness': (0.8, 0.95),
        'reaction_time_factor': (1.2, 1.5),
        'color': COLORS['conservative'],
        'name': '保守型'
    },
    'normal': {
        'weight': 0.60,
        'politeness': (0.4, 0.6),
        'aggressiveness': (0.95, 1.05),
        'reaction_time_factor': (1.0, 1.2),
        'color': COLORS['normal_driver'],
        'name': '普通型'
    }
}


class Vehicle:
    """车辆类"""
    
    LANE_CHANGE_STEPS = 5
    LANE_CHANGE_DELAY = 2.0
    SLOWDOWN_RATIO = 0.85
    
    def __init__(self, v_id: int, entry_time: float, lane: int, config: SimulationConfig = None):
        self.id = v_id
        self.lane = lane
        self.pos = 0.0
        self.lateral = 0.0
        self.config = config
        
        self._init_vehicle_type()
        self._init_driver_style()
        
        self.speed = self.desired_speed
        self.lane_change_cooldown = 0
        self.lane_changing = False
        self.lane_change_step = 0
        self.lane_change_target = None
        self.lane_change_start_time = 0
        self.lane_change_start_pos = 0
        self.lane_change_start_lane = 0
        self.lane_change_end_lane = 0
        
        # 异常状态
        self.is_potential_anomaly = (random.random() < (config.anomaly_ratio if config else 0.01))
        self.anomaly_type = 0
        self.anomaly_state = 'normal'
        self.anomaly_timer = 0
        self.cooldown_timer = 0
        self.color = COLORS['normal']
        
        # 异常响应时间记录（方案A）
        self.anomaly_trigger_time: Optional[float] = None
        self.first_detection_time: Optional[float] = None
        self.anomaly_response_times: List[float] = []
        
        # ETC门架检测（方案B）
        self.detected_by_etc = False
        self.etc_detection_time: Optional[float] = None
        
        # 日志和状态
        self.logs = {}
        self.current_segment = 0
        self.entry_time = entry_time
        self.finished = False
        self.exit_time: Optional[float] = None
        
        # 换道相关
        self.lane_change_pending = False
        self.lane_change_wait_start = 0
        self.lane_change_retries = 0
        self.last_retry_time = 0
        self.lane_changes = 0
        self.total_lane_changes = 0
        self.lane_change_reasons = {'free': 0, 'forced': 0}
        
        # 影响标记
        self.is_affected = False
        
        # 安全指标
        self.min_ttc = 999.0
        self.max_decel = 0.0
        self.brake_count = 0
        self.emergency_brake_count = 0
        self.safety_violations = 0
    
    def _init_vehicle_type(self):
        """初始化车辆类型"""
        types = list(VEHICLE_TYPE_CONFIG.keys())
        weights = [VEHICLE_TYPE_CONFIG[t]['weight'] for t in types]
        self.vehicle_type = random.choices(types, weights=weights)[0]
        
        cfg = VEHICLE_TYPE_CONFIG[self.vehicle_type]
        self.v0 = kmh_to_ms(cfg['v0_kmh'])
        self.a_max = cfg['a_max']
        self.b_desired = cfg['b_desired']
        self.s0 = cfg['s0']
        self.T = cfg['T']
        self.delta = cfg['delta']
        self.length = cfg['length']
        self.reaction_time_range = cfg['reaction_time']
        self.type_color = cfg['color']
        self.type_name = cfg['name']
        
        base_speed = random.gauss(cfg['v0_kmh'], 8)
        base_speed = max(50, min(140, base_speed))
        self.desired_speed = kmh_to_ms(base_speed * random.uniform(0.9, 1.1))
    
    def _init_driver_style(self):
        """初始化驾驶风格"""
        styles = list(DRIVER_STYLE_CONFIG.keys())
        weights = [DRIVER_STYLE_CONFIG[s]['weight'] for s in styles]
        self.driver_style = random.choices(styles, weights=weights)[0]
        
        cfg = DRIVER_STYLE_CONFIG[self.driver_style]
        self.politeness_range = cfg['politeness']
        self.politeness = random.uniform(*self.politeness_range)
        self.aggressiveness_range = cfg['aggressiveness']
        self.reaction_time_factor_range = cfg['reaction_time_factor']
        self.style_color = cfg['color']
        self.style_name = cfg['name']
        
        self.reaction_time = random.uniform(*self.reaction_time_range)
    
    # ==================== IDM模型 ====================
    
    def idm_calc_acceleration(self, leader: Optional['Vehicle'], current_speed: float, 
                              vehicles_nearby: List['Vehicle'] = None) -> float:
        """IDM加速度计算"""
        if leader is None:
            return self.a_max
        
        v = current_speed
        v0 = self.v0
        a_max = self.a_max * self.aggressiveness_range[0]
        b = self.b_desired
        
        if leader.anomaly_type == 1 and leader.anomaly_state == 'active':
            # 基于距离的分阶段制动：远距轻踩→中距减速→近距急刹
            dist = leader.pos - self.pos
            s = max(dist - self.length / 2 - leader.length / 2, 0.5)
            
            if s > 200:  # 远距离（>200m）：轻微减速
                return max(-1.5, -v * 0.1)
            elif s > 100:  # 中距离（100-200m）：中等减速
                ratio = (200 - s) / 100  # 0→1
                return -1.5 - 2.5 * ratio  # -1.5 → -4.0
            elif s > 30:  # 近距离（30-100m）：强力减速
                ratio = (100 - s) / 70  # 0→1
                return -4.0 - 3.0 * ratio  # -4.0 → -7.0
            else:  # 极近距离（<30m）：紧急制动
                return -7.0
        
        delta_v = v - leader.speed
        dist = leader.pos - self.pos
        s = max(dist - self.length / 2 - leader.length / 2, 0.5)
        
        s_star = (self.s0 + v * self.T + v * delta_v / (2 * math.sqrt(a_max * b)))
        
        ratio_v = (v / v0) ** self.delta
        ratio_s = (s_star / s) ** 2
        
        accel = a_max * (1 - ratio_v - ratio_s)
        
        time_gap = s / max(v, 0.1)
        is_emergency = time_gap < 1.5 or delta_v > 3
        
        if is_emergency:
            accel *= 1.2
        
        return max(-7.0, min(a_max * 1.5, accel))
    
    # ==================== MOBIL模型 ====================
    
    def mobil_decision(self, vehicles_nearby: List['Vehicle'], 
                       blocked_lanes: dict = None) -> tuple:
        """MOBIL换道决策"""
        if blocked_lanes is None:
            blocked_lanes = {}
        
        leader = self._find_leader(vehicles_nearby)
        
        if leader:
            if leader.anomaly_type == 1 and leader.pos - self.pos < self.config.forced_change_dist:
                return self._try_forced_lane_change(vehicles_nearby, blocked_lanes)
        
        current_gain = self._calc_lane_gain(self.lane, vehicles_nearby, leader)
        
        best_gain = current_gain
        target_lane = None
        
        for candidate in [self.lane - 1, self.lane + 1]:
            if 0 <= candidate < (self.config.num_lanes if self.config else 4):
                if self._can_change_to(candidate, vehicles_nearby, blocked_lanes):
                    gain = self._calc_lane_gain(candidate, vehicles_nearby, leader)
                    if gain > best_gain + 0.1:
                        best_gain = gain
                        target_lane = candidate
        
        if target_lane is not None:
            return target_lane, 'free'
        return None, None
    
    def _calc_lane_gain(self, target_lane: int, vehicles_nearby: List['Vehicle'], 
                        current_leader: Optional['Vehicle']) -> float:
        """计算换到目标车道的收益"""
        leader = self._find_leader_in_lane(target_lane, vehicles_nearby)
        
        if leader is None:
            return 1.0
        
        a_current = self.idm_calc_acceleration(current_leader, self.speed) if current_leader else self.a_max
        a_new = self.idm_calc_acceleration(leader, self.speed)
        
        return a_new - a_current
    
    def _find_leader(self, vehicles_nearby: List['Vehicle']) -> Optional['Vehicle']:
        """找同车道前车"""
        min_dist = float('inf')
        leader = None
        for v in vehicles_nearby:
            if v.lane == self.lane and v.pos > self.pos:
                dist = v.pos - self.pos
                if dist < min_dist:
                    min_dist = dist
                    leader = v
        return leader
    
    def _find_leader_in_lane(self, lane: int, vehicles_nearby: List['Vehicle']) -> Optional['Vehicle']:
        """找指定车道前车"""
        min_dist = float('inf')
        leader = None
        for v in vehicles_nearby:
            if v.lane == lane and v.pos > self.pos:
                dist = v.pos - self.pos
                if dist < min_dist:
                    min_dist = dist
                    leader = v
        return leader
    
    def _find_follower_in_lane(self, lane: int, vehicles_nearby: List['Vehicle']) -> Optional['Vehicle']:
        """找指定车道后车"""
        min_dist = float('inf')
        follower = None
        for v in vehicles_nearby:
            if v.lane == lane and v.pos < self.pos:
                dist = self.pos - v.pos
                if dist < min_dist:
                    min_dist = dist
                    follower = v
        return follower
    
    def _can_change_to(self, target_lane: int, vehicles_nearby: List['Vehicle'], 
                       blocked_lanes: dict) -> bool:
        """检查是否能换道到目标车道"""
        if target_lane in blocked_lanes:
            for pos in blocked_lanes[target_lane]:
                if abs(pos - self.pos) < 100:
                    return False
        
        gap = self.config.lane_change_gap if self.config else 25
        
        for v in vehicles_nearby:
            if v.lane == target_lane:
                dist = abs(v.pos - self.pos)
                if dist < gap:
                    return False
        return True
    
    def _try_forced_lane_change(self, vehicles_nearby: List['Vehicle'], 
                                blocked_lanes: dict) -> tuple:
        """强制换道（前方有障碍）"""
        for candidate in [self.lane - 1, self.lane + 1]:
            if 0 <= candidate < (self.config.num_lanes if self.config else 4):
                if self._can_change_to(candidate, vehicles_nearby, blocked_lanes):
                    return candidate, 'forced'
        return None, None
    
    def start_lane_change(self, target_lane: int, current_time: float) -> bool:
        """开始换道"""
        if self.lane_change_cooldown > 0 or self.lane_changing:
            return False
        
        self.lane_changing = True
        self.lane_change_step = 0
        self.lane_change_target = target_lane
        self.lane_change_start_time = current_time
        self.lane_change_start_pos = self.pos
        self.lane_change_start_lane = self.lane
        self.lane_change_end_lane = target_lane
        
        self.lane_changes += 1
        self.total_lane_changes += 1
        return True
    
    def update_lane_change(self, dt: float, current_time: float):
        """更新换道轨迹"""
        if not self.lane_changing:
            return
        
        self.lane_change_step += 1
        t = self.lane_change_step / self.LANE_CHANGE_STEPS
        
        lane_diff = self.lane_change_end_lane - self.lane_change_start_lane
        lane_width = self.config.lane_width if self.config else 3.5
        
        self.lateral = (lane_diff * lane_width / 2) * (1 - math.cos(math.pi * t))
        self.pos = self.lane_change_start_pos + (self.speed * dt * t)
        
        if self.lane_change_step >= self.LANE_CHANGE_STEPS:
            self.lane = self.lane_change_end_lane
            self.lane_changing = False
            self.lane_change_cooldown = 5.0
            self.lateral = lane_diff * lane_width / 2
    
    # ==================== 异常检测 ====================
    
    def trigger_anomaly(self, current_time: float, segment_idx: int) -> Optional[dict]:
        """尝试触发异常状态机"""
        if not self.is_potential_anomaly:
            return None
        if self.anomaly_state == 'active':
            return None
        
        if self.anomaly_state == 'cooling':
            self.cooldown_timer -= 1
            if self.cooldown_timer <= 0:
                self.anomaly_state = 'normal'
            return None
        
        if current_time < (self.config.global_anomaly_start if self.config else 200):
            return None
        if (current_time - self.entry_time) < (self.config.vehicle_safe_run_time if self.config else 200):
            return None
        
        trigger = False
        # 使用配置参数控制异常触发概率
        anomaly_prob = (self.config.anomaly_ratio if self.config else 0.01) * 0.5
        
        if self.anomaly_type == 0:
            if random.random() < anomaly_prob:
                trigger = True
                r = random.random()
                if r < 0.33:
                    self.anomaly_type = 1
                elif r < 0.66:
                    self.anomaly_type = 2
                else:
                    self.anomaly_type = 3
        elif self.anomaly_type in [2, 3]:
            if random.random() < 0.3:
                trigger = True
        
        if trigger:
            self.anomaly_state = 'active'
            self.anomaly_trigger_time = current_time
            
            if self.anomaly_type == 1:
                self.target_speed_override = 0
                self.anomaly_timer = 999999
                self.color = COLORS['type1']
            elif self.anomaly_type == 2:
                self.target_speed_override = kmh_to_ms(random.uniform(0, 40))
                self.anomaly_timer = 10
                self.color = COLORS['type2']
            else:
                self.target_speed_override = kmh_to_ms(random.uniform(0, 40))
                self.anomaly_timer = 20
                self.color = COLORS['type3']
            
            return {
                'id': self.id,
                'type': self.anomaly_type,
                'time': current_time,
                'pos_km': self.pos / 1000.0,
                'segment': segment_idx,
                'min_speed': ms_to_kmh(self.target_speed_override)
            }
        return None
    
    # ==================== 状态更新 ====================
    
    def update(self, dt: float, vehicles_nearby: List['Vehicle'], 
               blocked_lanes: dict, current_time: float):
        """更新车辆物理状态"""
        if self.finished:
            return
        
        self.lane_change_cooldown -= dt
        
        leader = None
        dist = float('inf')
        
        if not self.lane_changing:
            leader = self._find_leader(vehicles_nearby)
            if leader:
                dist = leader.pos - self.pos
        
        target_speed = self.desired_speed
        max_decel = 3.0
        
        if self.anomaly_state == 'active':
            target_speed = self.target_speed_override
            if self.anomaly_type == 1:
                max_decel = 7.0
            else:
                max_decel = 4.0
            
            self.anomaly_timer -= dt
            if self.anomaly_timer <= 0 and self.anomaly_type != 1:
                self.anomaly_state = 'cooling'
                self.cooldown_timer = 1000
                self.color = COLORS['normal']
        
        if leader and not self.lane_changing:
            if leader.anomaly_type == 1 and dist < 150:
                target_speed = 0
                max_decel = 7.0
                # 记录响应时间（方案A）
                if leader.anomaly_trigger_time and not self.first_detection_time:
                    response_time = current_time - leader.anomaly_trigger_time
                    self.anomaly_response_times.append(response_time)
                    self.first_detection_time = current_time
            elif leader.anomaly_state == 'active' and dist < 250:
                target_speed = min(target_speed, leader.speed * 0.8)
        
        if not self.lane_changing:
            want_change = False
            if leader:
                safe_dist = self.speed * 2 + 15
                if (dist < safe_dist) or (leader.anomaly_type == 1 and dist < 200):
                    want_change = True
            
            if want_change and self.lane_change_cooldown <= 0:
                target_lane, reason = self.mobil_decision(vehicles_nearby, blocked_lanes)
                if target_lane is not None:
                    self.start_lane_change(target_lane, current_time)
        
        if self.lane_changing:
            self.update_lane_change(dt, current_time)
        
        accel = self.idm_calc_acceleration(leader, self.speed)
        
        if self.anomaly_state == 'active':
            if self.anomaly_type == 1:
                # 渐停模型：根据当前速度平滑减速到零
                if self.speed > 1.0:
                    accel = max(-7.0, -self.speed / max(dt, 0.5) * 0.5)
                else:
                    accel = -self.speed / max(dt, 0.1)  # 最终停车
            else:
                accel = (self.target_speed_override - self.speed) / dt
                accel = max(-4.0, min(3.0, accel))
        
        self.speed += accel * dt
        self.speed = max(0, min(self.v0 * 1.1, self.speed))
        
        if not self.lane_changing:
            self.pos += self.speed * dt
        
        # 更新安全指标
        self._update_safety_metrics(leader, dist, accel)
    
    def _update_safety_metrics(self, leader: Optional['Vehicle'], dist: float, accel: float):
        """更新安全指标"""
        if leader is not None and leader.speed < self.speed:
            closing_speed = self.speed - leader.speed
            if closing_speed > 0.1:
                ttc = dist / closing_speed
                self.min_ttc = min(self.min_ttc, ttc)
        
        if accel < 0:
            self.max_decel = max(self.max_decel, -accel)
        
        if accel < -2.0:
            self.brake_count += 1
        if accel < -4.0:
            self.emergency_brake_count += 1
        
        if self.min_ttc < 1.0:
            self.safety_violations += 1
    
    def record_time(self, time_now: float, seg_idx: int, segment_length_km: float = 2.0):
        """记录车辆在各区间的时间"""
        if seg_idx >= (self.config.num_segments if self.config else 10):
            self.finished = True
            self.exit_time = time_now
            return
        
        if seg_idx != self.current_segment:
            if self.current_segment in self.logs:
                self.logs[self.current_segment]['out'] = time_now
            
            self.current_segment = seg_idx
            if seg_idx not in self.logs:
                self.logs[seg_idx] = {'in': time_now, 'out': time_now}
        else:
            if seg_idx not in self.logs:
                self.logs[seg_idx] = {'in': time_now, 'out': time_now}
            else:
                self.logs[seg_idx]['out'] = time_now
    
    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            'id': self.id,
            'vehicle_type': self.vehicle_type,
            'driver_style': self.driver_style,
            'entry_time': self.entry_time,
            'exit_time': self.exit_time,
            'lane_changes': self.lane_changes,
            'anomaly_type': self.anomaly_type,
            'anomaly_trigger_time': self.anomaly_trigger_time,
            'etc_detection_time': self.etc_detection_time,
            'anomaly_response_times': self.anomaly_response_times,
            'min_ttc': self.min_ttc,
            'max_decel': self.max_decel,
            'brake_count': self.brake_count,
            'emergency_brake_count': self.emergency_brake_count,
            'logs': self.logs
        }
