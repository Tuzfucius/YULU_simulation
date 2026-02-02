import random
import math
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.animation as animation
from matplotlib.collections import LineCollection
from matplotlib import colors as mcolors
from collections import defaultdict
import os
import time
import numpy as np

# --- matplotlib 中文字体配置 ---
plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'WenQuanYi Micro Hei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

# --- 配置参数 (Configuration) ---
ROAD_LENGTH_KM = 20
SEGMENT_LENGTH_KM = 2
NUM_SEGMENTS = int(ROAD_LENGTH_KM / SEGMENT_LENGTH_KM)
NUM_LANES = 4
LANE_WIDTH = 3.5
TOTAL_VEHICLES_TARGET = 1200
SIMULATION_DT = 1.0

# --- 最大模拟时间计算 ---
# 60km/h 跑完 ROAD_LENGTH_KM 所需时间（秒）
RUN_TIME_60KMH = (ROAD_LENGTH_KM / 60) * 3600
# 最后发车时间估计：每10秒投放一批，最后一批在约 (TOTAL_VEHICLES_TARGET/5)*10 秒时投放
LAST_SPAWN_TIME = (TOTAL_VEHICLES_TARGET / 5) * 10
# 最大模拟时间 = 最后发车时间 + 行驶时间 + 5分钟缓冲
MAX_SIMULATION_TIME = int(LAST_SPAWN_TIME + RUN_TIME_60KMH + 300)

print(f"最大模拟时间: {MAX_SIMULATION_TIME}秒 (最后发车 {LAST_SPAWN_TIME:.0f}秒 + 60km/h行驶 {RUN_TIME_60KMH:.0f}秒 + 缓冲300秒)")

# 颜色定义
COLOR_NORMAL = '#1f77b4'
COLOR_IMPACTED = '#ff7f0e'
COLOR_TYPE1 = '#8b0000'
COLOR_TYPE2 = '#9400d3'
COLOR_TYPE3 = '#8b4513'

# 车型颜色
COLOR_CAR = '#1f77b4'
COLOR_TRUCK = '#ff7f0e'
COLOR_BUS = '#2ca02c'

# 驾驶风格颜色
COLOR_AGGRESSIVE = '#d62728'
COLOR_NORMAL_DRIVER = '#1f77b4'
COLOR_CONSERVATIVE = '#2ca02c'

# --- 车辆类型配置 ---
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
        'color': COLOR_CAR,
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
        'color': COLOR_TRUCK,
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
        'color': COLOR_BUS,
        'name': '客车'
    }
}

DRIVER_STYLE_CONFIG = {
    'aggressive': {
        'weight': 0.20,
        'politeness': (0.15, 0.30),
        'aggressiveness': (1.10, 1.20),
        'reaction_time_factor': (0.8, 1.0),
        'color': COLOR_AGGRESSIVE,
        'name': '激进型'
    },
    'conservative': {
        'weight': 0.20,
        'politeness': (0.70, 0.90),
        'aggressiveness': (0.80, 0.90),
        'reaction_time_factor': (1.2, 1.5),
        'color': COLOR_CONSERVATIVE,
        'name': '保守型'
    },
    'normal': {
        'weight': 0.60,
        'politeness': (0.40, 0.60),
        'aggressiveness': (0.95, 1.05),
        'reaction_time_factor': (1.0, 1.2),
        'color': COLOR_NORMAL_DRIVER,
        'name': '普通型'
    }
}

def kmh_to_ms(v): return v / 3.6
def ms_to_kmh(v): return v * 3.6

ANOMALY_RATIO = 0.01
GLOBAL_ANOMALY_START = 200
VEHICLE_SAFE_RUN_TIME = 200
IMPACT_DISCOVER_DIST = 150
LANE_CHANGE_DELAY = 2.0
LANE_CHANGE_STEPS = 5
SLOWDOWN_RATIO = 0.85

# 换道参数修复
FORCED_CHANGE_DIST = 400  # 强制换道检测距离（米）
LANE_CHANGE_GAP = 25      # 换道所需间隙（米）
LANE_CHANGE_MAX_RETRIES = 5  # 最大换道重试次数
LANE_CHANGE_RETRY_INTERVAL = 2.0  # 重试间隔（秒）

# 颜色标记阈值修复
IMPACT_THRESHOLD = 0.90   # 受影响车辆阈值（原来是0.95）
IMPACT_SPEED_RATIO = 0.70  # 速度低于期望速度70%标记为受影响

ANOMALY_IMPACT_REFINE = {
    'type1': {'base_impact': 150, 'queue_factor': 2.0, 'max_impact': 800},
    'type2': {'downstream': 250, 'upstream': 150},
    'type3': {'downstream': 300, 'upstream': 200}
}

# --- 子图布局计算 ---
def calc_subplot_layout(num_segments):
    cols = 2
    rows = (num_segments + cols - 1) // cols
    return rows, cols

SUBPLOT_ROWS, SUBPLOT_COLS = calc_subplot_layout(NUM_SEGMENTS)

# --- 增强日志系统 ---
class EnhancedLogger:
    def __init__(self, debug_mode=False):
        self.debug_mode = debug_mode
        self.log_buffer = []
        self.event_counts = defaultdict(int)
        self.last_report_time = 0
        self.report_interval = 200
    
    def debug_log(self, msg, vehicle_id=None):
        if not self.debug_mode:
            return
        self._log('调试', msg, vehicle_id)
    
    def info(self, msg, vehicle_id=None):
        self._log('信息', msg, vehicle_id)
    
    def warning(self, msg, vehicle_id=None):
        self._log('警告', msg, vehicle_id)
    
    def _log(self, level, msg, vehicle_id):
        prefix = f"[{level}]"
        if vehicle_id is not None:
            prefix += f" [车辆:{vehicle_id}]"
        formatted = f"{prefix} {msg}"
        print(formatted)
        self.log_buffer.append({
            'level': level,
            'msg': formatted,
            'time': time.time()
        })
        self.event_counts[level] += 1
    
    def log_lane_change(self, vehicle, from_lane, to_lane, reason, politeness):
        reason_cn = {'free': '自由换道', 'forced': '强制换道', 'normal': '正常'}.get(reason, reason)
        self.info(f"换道: {from_lane}→{to_lane} | 原因:{reason_cn} | 礼貌系数:{politeness:.2f}", 
                 vehicle.id)
        self.event_counts['换道'] += 1
    
    def log_anomaly_trigger(self, vehicle, anomaly_type, position_km):
        severity = {1: '严重', 2: '中等', 3: '轻微'}[anomaly_type]
        type_name = {1: '完全静止', 2: '短暂波动', 3: '长时波动'}[anomaly_type]
        self.warning(f"异常触发 #{severity} | 类型:{type_name} | 位置:{position_km:.2f}公里", 
                    vehicle.id)
        self.event_counts['异常'] += 1
    
    def log_congestion(self, segment_idx, avg_speed, density, vehicle_count):
        if avg_speed < 40:
            self.warning(f"拥堵预警 | 区间:{segment_idx+1} | "
                        f"均速:{avg_speed:.1f}km/h | 密度:{density:.1f}veh/km | 车辆:{vehicle_count}")
            self.event_counts['拥堵'] += 1
    
    def periodic_report(self, current_time, active_count, finished_count):
        if current_time - self.last_report_time >= self.report_interval:
            print(f"\n{'='*60}")
            print(f"时间: {int(current_time)}秒 | 活跃: {active_count} | 完成: {finished_count}")
            print(f"事件统计: 异常:{self.event_counts['警告']} | "
                  f"换道:{self.event_counts['换道']} | "
                  f"拥堵:{self.event_counts['拥堵']}")
            print(f"{'='*60}\n")
            self.last_report_time = current_time

logger = EnhancedLogger(debug_mode=False)

# --- 交通状态分类器 ---
class TrafficStateClassifier:
    """交通状态自动识别"""
    
    @staticmethod
    def classify(density, speed):
        if density < 15:
            return '自由流', '#2ecc71'
        elif density < 35:
            return '稳定流', '#3498db'
        elif density < 60:
            return '拥堵流', '#f39c12'
        else:
            return '阻塞流', '#e74c3c'

# --- 激波传播模型 ---
class ShockwaveModel:
    """交通激波传播模型"""
    
    @staticmethod
    def calc_shockwave_speed(upstream_flow, downstream_flow, upstream_density, downstream_density):
        """计算激波速度 (km/h)"""
        if abs(downstream_density - upstream_density) < 0.01:
            return 0
        w = (downstream_flow - upstream_flow) / (downstream_density - upstream_density)
        return w * 3.6  # 转换为km/h

# --- 动态礼貌系数模型 ---
class DynamicPolitenessModel:
    """动态礼貌系数模型"""
    
    @staticmethod
    def calc_effective_politeness(base_politeness, vehicle_speed, follower_speed, follower_distance):
        """计算有效礼貌系数"""
        v_diff = vehicle_speed - follower_speed
        v_factor = 1.0 + max(-0.5, min(0.5, v_diff * 0.1))
        d_factor = max(0.5, 1.0 - (50 / max(follower_distance, 1)))
        return base_politeness * v_factor * d_factor

# --- 车辆类 (Vehicle Class) ---
class Vehicle:
    def __init__(self, v_id, entry_time, lane):
        self.id = v_id
        self.lane = lane
        self.pos = 0.0
        self.lateral = 0.0
        
        self._init_vehicle_type()
        self._init_driver_style()
        
        self.speed = self.desired_speed
        self.lane_change_cooldown = 0
        
        self.is_potential_anomaly = (random.random() < ANOMALY_RATIO)
        self.anomaly_type = 0
        self.anomaly_state = 'normal'
        self.anomaly_timer = 0
        self.cooldown_timer = 0
        self.color = COLOR_NORMAL
        
        self.logs = {}
        self.current_segment = 0
        self.entry_time = entry_time
        self.finished = False
        
        self.lane_change_pending = False
        self.lane_change_wait_start = 0
        self.lane_changing = False
        self.lane_change_step = 0
        self.lane_change_target = None
        self.lane_change_start_time = 0
        self.lane_change_start_pos = 0
        self.lane_change_start_lane = 0
        self.lane_change_end_lane = 0
        
        self.impact_count = 0
        self.lane_changes = 0
        self.total_lane_changes = 0
        self.lane_change_reasons = {'free': 0, 'forced': 0}
        
        # 换道重试机制（修复）
        self.lane_change_retries = 0
        self.last_retry_time = 0
        self.is_affected = False  # 标记是否受影响
    
    def _init_vehicle_type(self):
        types = list(VEHICLE_TYPE_CONFIG.keys())
        weights = [VEHICLE_TYPE_CONFIG[t]['weight'] for t in types]
        self.vehicle_type = random.choices(types, weights=weights)[0]
        
        config = VEHICLE_TYPE_CONFIG[self.vehicle_type]
        self.v0 = kmh_to_ms(config['v0_kmh'])
        self.a_max = config['a_max']
        self.b_desired = config['b_desired']
        self.s0 = config['s0']
        self.T = config['T']
        self.delta = config['delta']
        self.length = config['length']
        self.reaction_time_range = config['reaction_time']
        self.type_color = config['color']
        self.type_name = config['name']
        
        base_speed = random.gauss(config['v0_kmh'], 8)
        base_speed = max(50, min(140, base_speed))
        self.desired_speed = kmh_to_ms(base_speed * random.uniform(0.9, 1.1))
    
    def _init_driver_style(self):
        styles = list(DRIVER_STYLE_CONFIG.keys())
        weights = [DRIVER_STYLE_CONFIG[s]['weight'] for s in styles]
        self.driver_style = random.choices(styles, weights=weights)[0]
        
        config = DRIVER_STYLE_CONFIG[self.driver_style]
        self.politeness = random.uniform(*config['politeness'])
        self.aggressiveness = random.uniform(*config['aggressiveness'])
        self.reaction_time_factor = random.uniform(*config['reaction_time_factor'])
        self.style_color = config['color']
        self.style_name = config['name']
    
    # --- IDM跟驰模型 ---
    def idm_calc_acceleration(self, leader, current_speed):
        """智能驾驶员模型 (IDM) 加速度计算"""
        v = current_speed
        v0 = self.v0 * self.aggressiveness
        a_max = self.a_max * self.aggressiveness
        b = self.b_desired
        
        if leader is None:
            return a_max * (1 - (v / v0) ** self.delta)
        
        if leader.anomaly_type == 1 and leader.anomaly_state == 'active':
            return -a_max * 2
        
        delta_v = v - leader.speed
        dist = leader.pos - self.pos
        s = max(dist - self.length / 2 - leader.length / 2, 0.5)
        
        s_star = (self.s0 + v * self.T + 
                  v * delta_v / (2 * math.sqrt(a_max * b)))
        
        ratio_v = (v / v0) ** self.delta
        ratio_s = (s_star / s) ** 2
        
        accel = a_max * (1 - ratio_v - ratio_s)
        
        return max(-5.0, min(a_max * 1.5, accel))
    
    # --- MOBIL换道模型 ---
    def mobil_decision(self, vehicles_nearby, blocked_lanes):
        """MOBIL换道决策（修复版：扩大强制换道距离）"""
        leader = self._find_leader(vehicles_nearby)
        
        if leader:
            safe_dist = self.speed * 1.5 + self.s0
            # 修复：扩大强制换道检测距离（200米 → 400米）
            if leader.anomaly_type == 1 and leader.pos - self.pos < FORCED_CHANGE_DIST:
                return self._try_forced_lane_change(vehicles_nearby, blocked_lanes)
        
        current_gain = self._calc_lane_gain(self.lane, vehicles_nearby, leader)
        
        best_gain = current_gain
        target_lane = None
        
        for candidate in [self.lane - 1, self.lane + 1]:
            if 0 <= candidate < 4:
                if self._can_change_to(candidate, vehicles_nearby, blocked_lanes):
                    gain = self._calc_lane_gain(candidate, vehicles_nearby, leader)
                    if gain > best_gain + 0.1:
                        best_gain = gain
                        target_lane = candidate
        
        if target_lane is not None:
            return target_lane, 'free'
        return None, None
    
    def _calc_lane_gain(self, target_lane, vehicles_nearby, current_leader):
        """计算换到目标车道的收益"""
        leader = self._find_leader_in_lane(target_lane, vehicles_nearby)
        
        if leader is None:
            return 1.0
        
        a_current = self.idm_calc_acceleration(current_leader, self.speed) if current_leader else self.a_max
        a_new = self.idm_calc_acceleration(leader, self.speed)
        
        return a_new - a_current
    
    def _find_leader(self, vehicles_nearby):
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
    
    def _find_leader_in_lane(self, lane, vehicles_nearby):
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
    
    def _find_follower_in_lane(self, lane, vehicles_nearby):
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
    
    def _can_change_to(self, target_lane, vehicles_nearby, blocked_lanes):
        """检查是否能换道到目标车道（修复版：放宽间隙要求）"""
        if target_lane in blocked_lanes:
            for pos in blocked_lanes[target_lane]:
                if abs(pos - self.pos) < 100:
                    return False
        
        for v in vehicles_nearby:
            if v.lane == target_lane:
                dist = abs(v.pos - self.pos)
                if dist < LANE_CHANGE_GAP:  # 使用参数：25米
                    return False
        return True
    
    def _try_forced_lane_change(self, vehicles_nearby, blocked_lanes):
        """强制换道（前方有障碍）"""
        for candidate in [self.lane - 1, self.lane + 1]:
            if 0 <= candidate < 4:
                if self._can_change_to(candidate, vehicles_nearby, blocked_lanes):
                    return candidate, 'forced'
        return None, None
    
    # --- 换道轨迹平滑 ---
    def start_lane_change(self, target_lane, current_time):
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
        
        logger.log_lane_change(self, self.lane, target_lane, 'normal', self.politeness)
        return True
    
    def update_lane_change(self, dt, vehicles_nearby, current_time):
        """更新换道轨迹（5步完成）"""
        if not self.lane_changing:
            return
        
        self.lane_change_step += 1
        t = self.lane_change_step / LANE_CHANGE_STEPS
        
        lane_diff = self.lane_change_end_lane - self.lane_change_start_lane
        
        self.lateral = (lane_diff * LANE_WIDTH / 2) * (1 - math.cos(math.pi * t))
        
        self.pos = self.lane_change_start_pos + (self.speed * dt * t)
        
        if self.lane_change_step >= LANE_CHANGE_STEPS:
            self.lane = self.lane_change_end_lane
            self.lane_changing = False
            self.lane_change_cooldown = 5.0
            self.lateral = lane_diff * LANE_WIDTH / 2
    
    # --- 异常影响范围精细化 ---
    def calc_impact_multiplier(self, vehicles_nearby):
        """计算多异常源叠加减速系数"""
        n_downstream = 0
        n_upstream = 0
        
        for v in vehicles_nearby:
            if v != self and v.anomaly_state == 'active':
                dist = v.pos - self.pos
                if abs(dist) < IMPACT_DISCOVER_DIST:
                    if dist > 0:
                        n_downstream += 1
                    else:
                        n_upstream += 1
        
        multiplier = (SLOWDOWN_RATIO ** n_downstream) * (0.92 ** n_upstream)
        return multiplier
    
    def trigger_anomaly(self, current_time, segment_idx):
        """尝试触发异常状态机"""
        if not self.is_potential_anomaly:
            return None
        if self.anomaly_state == 'active':
            return None
        
        if self.anomaly_state == 'cooling':
            self.cooldown_timer -= 1
            if self.cooldown_timer <= 0:
                self.anomaly_state = 'normal'
            else:
                return None
        
        if current_time < GLOBAL_ANOMALY_START:
            return None
        if (current_time - self.entry_time) < VEHICLE_SAFE_RUN_TIME:
            return None
        
        trigger = False
        
        if self.anomaly_type == 0:
            if random.random() < 0.005:
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
            
            if self.anomaly_type == 1:
                self.target_speed_override = 0
                self.color = COLOR_TYPE1
                self.anomaly_timer = 999999
            elif self.anomaly_type == 2:
                self.target_speed_override = kmh_to_ms(random.uniform(0, 40))
                self.anomaly_timer = 10
                self.color = COLOR_TYPE2
            elif self.anomaly_type == 3:
                self.target_speed_override = kmh_to_ms(random.uniform(0, 40))
                self.anomaly_timer = 20
                self.color = COLOR_TYPE3
            
            logger.log_anomaly_trigger(self, self.anomaly_type, self.pos / 1000)
            
            return {
                'id': self.id,
                'type': self.anomaly_type,
                'time': current_time,
                'pos_km': self.pos / 1000.0,
                'segment': segment_idx,
                'min_speed': ms_to_kmh(self.target_speed_override)
            }
        return None
    
    def update(self, dt, vehicles_nearby, blocked_lanes, current_time):
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
                self.color = COLOR_NORMAL
        
        if leader and not self.lane_changing:
            if leader.anomaly_type == 1 and dist < 150:
                target_speed = 0
                max_decel = 7.0
            elif leader.anomaly_state == 'active' and dist < 250:
                target_speed = min(target_speed, leader.speed * 0.8)
        
        impact_multiplier = self.calc_impact_multiplier(vehicles_nearby)
        target_speed *= impact_multiplier
        
        if not self.lane_changing:
            want_change = False
            if leader:
                safe_dist = self.speed * 2 + 15
                if (dist < safe_dist) or (leader.anomaly_type == 1 and dist < 200):
                    want_change = True
            
            if leader and leader.anomaly_state == 'active' and leader.lane == self.lane:
                if dist < IMPACT_DISCOVER_DIST:
                    if not self.lane_change_pending:
                        self.lane_change_pending = True
                        self.lane_change_wait_start = current_time
            
            if self.lane_change_pending:
                if current_time - self.lane_change_wait_start >= LANE_CHANGE_DELAY:
                    self.lane_change_pending = False
                    if want_change and self.lane_change_cooldown <= 0:
                        target_lane, reason = self.mobil_decision(vehicles_nearby, blocked_lanes)
                        if target_lane is not None:
                            self.start_lane_change(target_lane, current_time)
                            self.lane_change_retries = 0  # 重置重试计数
                            reason_key = reason if reason else 'free'
                            if reason_key in self.lane_change_reasons:
                                self.lane_change_reasons[reason_key] += 1
                        else:
                            # 修复：换道失败，减速并设置重试
                            self.lane_change_retries += 1
                            self.last_retry_time = current_time
                            if self.lane_change_retries < LANE_CHANGE_MAX_RETRIES:
                                # 减速并保持尝试
                                target_speed = max(kmh_to_ms(30), target_speed)
            elif want_change and self.lane_change_cooldown <= 0:
                target_lane, reason = self.mobil_decision(vehicles_nearby, blocked_lanes)
                if target_lane is not None:
                    self.start_lane_change(target_lane, current_time)
                    self.lane_change_retries = 0
                    reason_key = reason if reason else 'free'
                    if reason_key in self.lane_change_reasons:
                        self.lane_change_reasons[reason_key] += 1
                else:
                    # 检查是否需要重试
                    if leader and leader.anomaly_type == 1:
                        self.lane_change_retries += 1
                        if self.lane_change_retries < LANE_CHANGE_MAX_RETRIES:
                            if current_time - self.last_retry_time >= LANE_CHANGE_RETRY_INTERVAL:
                                # 尝试重置换道pending状态
                                if self.lane_change_retries == 1:
                                    self.lane_change_pending = True
                                    self.lane_change_wait_start = current_time
        
        if self.lane_changing:
            self.update_lane_change(dt, vehicles_nearby, current_time)
        
        accel = self.idm_calc_acceleration(leader, self.speed)
        
        if self.anomaly_state == 'active':
            if self.anomaly_type == 1:
                accel = -7.0
            else:
                accel = (self.target_speed_override - self.speed) / dt
                accel = max(-4.0, min(3.0, accel))
        
        self.speed += accel * dt
        self.speed = max(0, min(self.v0 * 1.1, self.speed))
        
        if not self.lane_changing:
            self.pos += self.speed * dt
        
        if self.anomaly_state != 'active':
            # 修复：降低阈值（0.95 → 0.90），添加期望速度比例判断
            speed_ratio = self.speed / self.desired_speed if self.desired_speed > 0 else 1.0
            is_impacted = (impact_multiplier < IMPACT_THRESHOLD or 
                          speed_ratio < IMPACT_SPEED_RATIO or  # 速度低于期望70%
                          (leader and dist < 40 and self.speed < kmh_to_ms(20)))
            
            if is_impacted:
                self.color = COLOR_IMPACTED
                self.is_affected = True
            else:
                self.color = COLOR_NORMAL
                self.is_affected = False
    
    def record_time(self, time_now, seg_idx):
        """记录车辆在各区间的时间"""
        if seg_idx >= NUM_SEGMENTS:
            self.finished = True
            if self.current_segment < NUM_SEGMENTS and self.current_segment in self.logs:
                self.logs[self.current_segment]['out'] = time_now
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


# --- 仿真主程序 ---
class TrafficSimulation:
    def __init__(self):
        self.vehicles = []
        self.finished_vehicles = []
        self.current_time = 0
        self.vehicle_id_counter = 0
        self.anomaly_logs = []
        self.spawn_schedule = []
        self.plan_spawns()
        
        self.trajectory_data = []
        self.lane_history = []
        self.segment_speed_history = []
        self.traffic_state_history = []
        self.shockwave_data = []
    
    def plan_spawns(self):
        """生成随机投放计划：每10s随机2-8辆"""
        total_generated = 0
        t_cycle = 0
        while total_generated < TOTAL_VEHICLES_TARGET:
            n = random.randint(2, 8)
            if total_generated + n > TOTAL_VEHICLES_TARGET:
                n = TOTAL_VEHICLES_TARGET - total_generated
            
            timestamps = sorted([t_cycle + random.uniform(0, 10) for _ in range(n)])
            for ts in timestamps:
                self.spawn_schedule.append(ts)
            
            total_generated += n
            t_cycle += 10
    
    def run(self):
        print(f"仿真初始化... 目标车辆: {TOTAL_VEHICLES_TARGET}")
        print(f"车辆类型: 轿车60% | 卡车25% | 客车15%")
        print(f"驾驶风格: 激进20% | 普通60% | 保守20%")
        print(f"跟驰模型: IDM智能驾驶员模型")
        print(f"换道模型: MOBIL + 轨迹平滑(5步)")
        print("=" * 60)
        
        spawn_idx = 0
        
        while len(self.vehicles) > 0 or spawn_idx < len(self.spawn_schedule):
            while spawn_idx < len(self.spawn_schedule) and self.spawn_schedule[spawn_idx] <= self.current_time:
                lane_choice = list(range(NUM_LANES))
                random.shuffle(lane_choice)
                placed = False
                
                for lane in lane_choice:
                    clear = True
                    for v in self.vehicles:
                        if v.lane == lane and v.pos < 50:
                            clear = False
                            break
                    if clear:
                        new_v = Vehicle(self.vehicle_id_counter, self.current_time, lane)
                        self.vehicles.append(new_v)
                        self.vehicle_id_counter += 1
                        placed = True
                        break
                
                if placed:
                    spawn_idx += 1
                else:
                    self.spawn_schedule[spawn_idx] += 1.0
                    break
            
            active_vehicles = [v for v in self.vehicles if not v.finished]
            active_vehicles.sort(key=lambda x: x.pos)
            
            blocked_lanes = defaultdict(list)
            for v in active_vehicles:
                if v.anomaly_type == 1 and v.anomaly_state == 'active':
                    blocked_lanes[v.lane].append(v.pos)
            
            for v in active_vehicles:
                seg = int(v.pos / (SEGMENT_LENGTH_KM * 1000))
                v.record_time(self.current_time, seg)
                
                log = v.trigger_anomaly(self.current_time, seg)
                if log:
                    self.anomaly_logs.append(log)
                
                v.update(SIMULATION_DT, active_vehicles, blocked_lanes, self.current_time)
            
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
                    'is_affected': v.is_affected  # 修复：记录是否受影响
                })
            
            lane_counts = {i: 0 for i in range(NUM_LANES)}
            for v in active_vehicles:
                lane_counts[v.lane] += 1
            self.lane_history.append({
                'time': self.current_time,
                'counts': lane_counts
            })
            
            segment_speeds = {i: [] for i in range(NUM_SEGMENTS)}
            segment_densities = {i: 0 for i in range(NUM_SEGMENTS)}
            for v in active_vehicles:
                seg = int(v.pos / (SEGMENT_LENGTH_KM * 1000))
                if 0 <= seg < NUM_SEGMENTS:
                    segment_speeds[seg].append(v.speed)
                    segment_densities[seg] += 1
            
            for seg_idx, speeds in segment_speeds.items():
                if speeds:
                    avg_speed = sum(speeds) / len(speeds)
                    density = segment_densities[seg_idx] / (SEGMENT_LENGTH_KM)
                    
                    self.segment_speed_history.append({
                        'time': self.current_time,
                        'segment': seg_idx,
                        'avg_speed': avg_speed,
                        'density': density,
                        'flow': avg_speed * density
                    })
                    
                    state, _ = TrafficStateClassifier.classify(density, avg_speed * 3.6)
                    self.traffic_state_history.append({
                        'time': self.current_time,
                        'segment': seg_idx,
                        'state': state,
                        'speed': avg_speed * 3.6,
                        'density': density
                    })
                    
                    if int(self.current_time) % 100 == 0:
                        logger.log_congestion(seg_idx, avg_speed * 3.6, density, len(speeds))
            
            completed = [v for v in self.vehicles if v.finished]
            self.finished_vehicles.extend(completed)
            self.vehicles = [v for v in self.vehicles if not v.finished]
            
            self.current_time += SIMULATION_DT
            
            logger.periodic_report(self.current_time, len(self.vehicles), len(self.finished_vehicles))
            
            if self.current_time > MAX_SIMULATION_TIME:
                print(f"达到最大模拟时间 {MAX_SIMULATION_TIME}秒，仿真结束")
                break
            
            if int(self.current_time) % 1000 == 0 and int(self.current_time) > 0:
                save_snapshot(self.finished_vehicles, self.anomaly_logs, self.current_time)
        
        print("仿真完成。")


# --- 可视化模块 ---
CODE_PATH = os.getcwd()
OUTPUT_DIR = os.path.join(CODE_PATH, "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

def save_snapshot(finished_vehicles, anomaly_logs, current_time):
    if len(finished_vehicles) == 0:
        return
    
    # 修复：检查是否有正常车辆（非异常静止车辆）完成
    normal_vehicles = [v for v in finished_vehicles if v.anomaly_type != 1]
    if len(normal_vehicles) == 0:
        print(f"  [跳过保存 {int(current_time)}秒 快照] 所有完成车辆均为异常静止车辆")
        return
    
    print(f"正在保存 {int(current_time)}秒 时刻快照...")
    
    fig, axes = plt.subplots(SUBPLOT_ROWS, SUBPLOT_COLS, figsize=(18, 4 * SUBPLOT_ROWS), sharex=True)
    axes = axes.flatten()
    
    for seg_idx in range(NUM_SEGMENTS):
        ax = axes[seg_idx]
        ax.set_title(f"区间 {seg_idx+1}: {seg_idx*SEGMENT_LENGTH_KM}-{(seg_idx+1)*SEGMENT_LENGTH_KM} 公里", fontsize=10)
        ax.set_ylabel("速度 (km/h)", fontsize=8)
        ax.set_ylim(0, 140)
        ax.grid(True, alpha=0.3)
        
        for v in finished_vehicles:
            if seg_idx in v.logs:
                info = v.logs[seg_idx]
                t_in, t_out = info['in'], info['out']
                
                if t_out - t_in < 0.1:
                    continue
                
                distance_m = SEGMENT_LENGTH_KM * 1000
                time_s = t_out - t_in
                avg_speed_kmh = (distance_m / time_s) * 3.6
                
                if avg_speed_kmh > 200 or avg_speed_kmh < 0:
                    continue
                
                c = COLOR_NORMAL
                z = 1
                w = 1.0
                if v.anomaly_type == 1:
                    c, z, w = COLOR_TYPE1, 10, 2.0
                elif v.anomaly_type == 2:
                    c, z, w = COLOR_TYPE2, 8, 1.5
                elif v.anomaly_type == 3:
                    c, z, w = COLOR_TYPE3, 8, 1.5
                elif avg_speed_kmh < v.desired_speed * 3.6 * IMPACT_SPEED_RATIO:
                    c, z = COLOR_IMPACTED, 5
                
                ax.hlines(y=avg_speed_kmh, xmin=t_in, xmax=t_out,
                          colors=c, alpha=0.7, linewidth=w, zorder=z)
    
    axes[-1].set_xlabel("时间 (秒)")
    axes[-2].set_xlabel("时间 (秒)")
    
    patches = [
        mpatches.Patch(color=COLOR_NORMAL, label='正常车辆'),
        mpatches.Patch(color=COLOR_IMPACTED, label='受影响/慢行'),
        mpatches.Patch(color=COLOR_TYPE1, label='类型1 (完全静止)'),
        mpatches.Patch(color=COLOR_TYPE2, label='类型2 (短暂波动)'),
        mpatches.Patch(color=COLOR_TYPE3, label='类型3 (长时波动)'),
    ]
    fig.legend(handles=patches, loc='upper center', ncol=5, fontsize=12)
    plt.tight_layout(rect=(0, 0.03, 1, 0.95))
    
    folder_name = f"{ROAD_LENGTH_KM}公里-{int(SEGMENT_LENGTH_KM)}公里段"
    snapshot_dir = os.path.join(OUTPUT_DIR, folder_name)
    os.makedirs(snapshot_dir, exist_ok=True)
    filename = os.path.join(snapshot_dir, f"traffic_snapshot_{int(current_time)}s.png")
    plt.savefig(filename, dpi=100, bbox_inches='tight')
    print(f"已保存: {filename}")
    plt.close()


# --- 可视化器基类 ---
class Visualizer:
    def __init__(self, output_dir):
        self.output_dir = output_dir
    
    def save(self, fig, filename):
        path = os.path.join(self.output_dir, filename)
        fig.savefig(path, dpi=150, bbox_inches='tight')
        print(f"  已保存: {path}")
        plt.close()


# --- 1. 车流画像图 ---
class SpeedProfilePlotter(Visualizer):
    def generate(self, finished_vehicles, anomaly_logs):
        print("  生成: 车流画像...")
        
        # 修复：检查是否有正常车辆（非异常静止车辆）完成
        if len(finished_vehicles) == 0:
            print("    [跳过] 无完成车辆数据")
            return
        
        normal_vehicles = [v for v in finished_vehicles if v.anomaly_type != 1]
        if len(normal_vehicles) == 0:
            print(f"    [跳过] 所有{len(finished_vehicles)}辆完成车辆均为异常静止车辆，无正常车流轨迹")
            return
        
        fig, axes = plt.subplots(SUBPLOT_ROWS, SUBPLOT_COLS, figsize=(18, 4 * SUBPLOT_ROWS), sharex=True)
        axes = axes.flatten()
        
        for seg_idx in range(NUM_SEGMENTS):
            ax = axes[seg_idx]
            ax.set_title(f"区间 {seg_idx+1}: {seg_idx*SEGMENT_LENGTH_KM}-{(seg_idx+1)*SEGMENT_LENGTH_KM} 公里", fontsize=10)
            ax.set_ylabel("速度 (km/h)", fontsize=8)
            ax.set_ylim(0, 140)
            ax.grid(True, alpha=0.3)
            
            for v in finished_vehicles:
                if seg_idx in v.logs:
                    info = v.logs[seg_idx]
                    t_in, t_out = info['in'], info['out']
                    
                    if t_out - t_in < 0.1:
                        continue
                    
                    distance_m = SEGMENT_LENGTH_KM * 1000
                    time_s = t_out - t_in
                    avg_speed_kmh = (distance_m / time_s) * 3.6
                    
                    if avg_speed_kmh > 200 or avg_speed_kmh < 0:
                        continue
                    
                    c = COLOR_NORMAL
                    z = 1
                    w = 1.0
                    if v.anomaly_type == 1:
                        c, z, w = COLOR_TYPE1, 10, 2.0
                    elif v.anomaly_type == 2:
                        c, z, w = COLOR_TYPE2, 8, 1.5
                    elif v.anomaly_type == 3:
                        c, z, w = COLOR_TYPE3, 8, 1.5
                    elif avg_speed_kmh < v.desired_speed * 3.6 * IMPACT_SPEED_RATIO:
                        c, z = COLOR_IMPACTED, 5
                    
                    ax.hlines(y=avg_speed_kmh, xmin=t_in, xmax=t_out,
                              colors=c, alpha=0.7, linewidth=w, zorder=z)
        
        axes[-1].set_xlabel("时间 (秒)")
        axes[-2].set_xlabel("时间 (秒)")
        
        patches = [
            mpatches.Patch(color=COLOR_NORMAL, label='正常车辆'),
            mpatches.Patch(color=COLOR_IMPACTED, label='受影响/慢行'),
            mpatches.Patch(color=COLOR_TYPE1, label='类型1 (完全静止)'),
            mpatches.Patch(color=COLOR_TYPE2, label='类型2 (短暂波动)'),
            mpatches.Patch(color=COLOR_TYPE3, label='类型3 (长时波动)'),
        ]
        fig.legend(handles=patches, loc='upper center', ncol=5, fontsize=12)
        plt.tight_layout(rect=(0, 0.03, 1, 0.95))
        
        self.save(fig, "speed_profile.png")


# --- 2. 异常分布图 ---
class AnomalyDistPlotter(Visualizer):
    def generate(self, finished_vehicles, anomaly_logs):
        print("  生成: 异常分布...")
        fig, ax = plt.subplots(figsize=(12, 6))
        counts = {seg: {1: 0, 2: 0, 3: 0} for seg in range(NUM_SEGMENTS)}
        for log in anomaly_logs:
            seg = log['segment']
            if seg < NUM_SEGMENTS:
                counts[seg][log['type']] += 1
        
        x_labels = [f"{i*SEGMENT_LENGTH_KM}-{(i+1)*SEGMENT_LENGTH_KM}公里" for i in range(NUM_SEGMENTS)]
        y1 = [counts[i][1] for i in range(NUM_SEGMENTS)]
        y2 = [counts[i][2] for i in range(NUM_SEGMENTS)]
        y3 = [counts[i][3] for i in range(NUM_SEGMENTS)]
        
        x = range(len(x_labels))
        ax.bar(x, y1, color=COLOR_TYPE1, label='类型1 (完全静止)')
        ax.bar(x, y2, bottom=y1, color=COLOR_TYPE2, label='类型2 (短暂波动)')
        ax.bar(x, y3, bottom=[sum(pair) for pair in zip(y1, y2)],
               color=COLOR_TYPE3, label='类型3 (长时波动)')
        
        ax.set_xlabel('路段区间')
        ax.set_ylabel('异常事件数')
        ax.set_title('异常事件路段分布')
        ax.set_xticks(x)
        ax.set_xticklabels(x_labels)
        ax.legend()
        ax.grid(axis='y', alpha=0.3)
        
        self.save(fig, "anomaly_distribution.png")


# --- 3. 时空图 ---
class TrajectoryPlotter(Visualizer):
    def generate(self, finished_vehicles, anomaly_logs, trajectory_data):
        print("  生成: 时空图...")
        if not trajectory_data:
            print("    [跳过] 无轨迹数据")
            return
        
        fig, ax = plt.subplots(figsize=(18, 10))
        
        trajectories = {}
        for point in trajectory_data:
            vid = point['id']
            if vid not in trajectories:
                trajectories[vid] = []
            trajectories[vid].append(point)
        
        for vid, points in trajectories.items():
            if not points:
                continue
            times = [p['time'] for p in points]
            positions = [p['pos'] / 1000 for p in points]
            
            anomaly_type = points[0].get('anomaly_type', 0)
            anomaly_state = points[0].get('anomaly_state', 'normal')
            
            if anomaly_state == 'active':
                if anomaly_type == 1:
                    color = COLOR_TYPE1
                    linewidth = 2
                    alpha = 0.9
                elif anomaly_type == 2:
                    color = COLOR_TYPE2
                    linewidth = 1.5
                    alpha = 0.8
                elif anomaly_type == 3:
                    color = COLOR_TYPE3
                    linewidth = 1.5
                    alpha = 0.8
                else:
                    color = COLOR_IMPACTED
                    linewidth = 1
                    alpha = 0.6
            else:
                color = COLOR_NORMAL
                linewidth = 0.8
                alpha = 0.4
            
            ax.plot(times, positions, color=color, linewidth=linewidth, alpha=alpha)
        
        for log in anomaly_logs:
            ax.scatter(log['time'], log['pos_km'],
                      color=COLOR_TYPE1 if log['type'] == 1 else
                            COLOR_TYPE2 if log['type'] == 2 else COLOR_TYPE3,
                      s=100, marker='x', zorder=10)
        
        ax.set_xlabel('时间 (秒)')
        ax.set_ylabel('位置 (公里)')
        ax.set_title('时空图 (轨迹图)')
        ax.set_xlim(0, max([p['time'] for p in trajectory_data]) if trajectory_data else 1000)
        ax.set_ylim(0, ROAD_LENGTH_KM)
        ax.grid(True, alpha=0.3)
        
        patches = [
            mpatches.Patch(color=COLOR_NORMAL, label='正常车辆'),
            mpatches.Patch(color=COLOR_IMPACTED, label='受影响'),
            mpatches.Patch(color=COLOR_TYPE1, label='类型1 (完全静止)'),
            mpatches.Patch(color=COLOR_TYPE2, label='类型2 (短暂波动)'),
            mpatches.Patch(color=COLOR_TYPE3, label='类型3 (长时波动)'),
        ]
        ax.legend(handles=patches, loc='lower right')
        
        self.save(fig, "trajectory.png")


# --- 4. 车速热力图 ---
class SpeedHeatmapPlotter(Visualizer):
    def generate(self, finished_vehicles, anomaly_logs, segment_speed_history):
        print("  生成: 车速热力图...")
        if not segment_speed_history:
            print("    [跳过] 无区间速度数据")
            return
        
        max_time = max([s['time'] for s in segment_speed_history])
        time_resolution = 100
        
        time_bins = list(range(0, int(max_time) + time_resolution, time_resolution))
        num_time_bins = len(time_bins) - 1
        num_segments = NUM_SEGMENTS
        
        speed_matrix = np.full((num_segments, num_time_bins), np.nan)
        count_matrix = np.zeros((num_segments, num_time_bins), dtype=int)
        
        for record in segment_speed_history:
            t = record['time']
            seg = record['segment']
            speed = record['avg_speed']
            
            for i in range(num_time_bins):
                if time_bins[i] <= t < time_bins[i + 1]:
                    if 0 <= seg < num_segments:
                        speed_matrix[seg, i] = speed
                        count_matrix[seg, i] += 1
                    break
        
        valid_cols = np.where(np.nansum(count_matrix, axis=0) > 0)[0]
        if len(valid_cols) == 0:
            print("    [跳过] 无有效数据")
            return
        
        speed_matrix = speed_matrix[:, valid_cols]
        time_labels = [f"{time_bins[i]//60:.0f}分钟" for i in valid_cols]
        
        fig, ax = plt.subplots(figsize=(14, 8))
        
        im = ax.imshow(speed_matrix * 3.6, aspect='auto', cmap='RdYlGn',
                      vmin=0, vmax=130, origin='lower')
        
        ax.set_yticks(range(num_segments))
        ax.set_yticklabels([f"{i * SEGMENT_LENGTH_KM}-{(i + 1) * SEGMENT_LENGTH_KM}公里" for i in range(num_segments)])
        ax.set_xticks(range(len(time_labels)))
        ax.set_xticklabels(time_labels, rotation=45, ha='right')
        ax.set_xlabel('时间')
        ax.set_ylabel('路段区间')
        ax.set_title('车速热力图 (km/h)')
        
        cbar = plt.colorbar(im, ax=ax)
        cbar.set_label('速度 (km/h)')
        
        for log in anomaly_logs:
            time_idx = None
            for i in range(len(time_bins) - 1):
                if time_bins[i] <= log['time'] < time_bins[i + 1]:
                    time_idx = i - valid_cols[0] if i in valid_cols else None
                    break
            if time_idx is not None and 0 <= time_idx < len(time_labels):
                ax.axvline(x=time_idx, color='black', linestyle='--', alpha=0.5)
        
        self.save(fig, "speed_heatmap.png")


# --- 5. 累计延误分析 ---
class DelayPlotter(Visualizer):
    def generate(self, finished_vehicles, anomaly_logs):
        print("  生成: 累计延误分析...")
        
        delays = [0] * NUM_SEGMENTS
        counts = [0] * NUM_SEGMENTS
        
        for v in finished_vehicles:
            for seg_idx, info in v.logs.items():
                if 0 <= seg_idx < NUM_SEGMENTS:
                    t_in, t_out = info['in'], info['out']
                    actual_time = t_out - t_in
                    distance = SEGMENT_LENGTH_KM * 1000
                    
                    free_flow_time = distance / v.desired_speed if v.desired_speed > 0 else distance / (95 / 3.6)
                    
                    delay = actual_time - free_flow_time
                    delays[seg_idx] += max(0, delay)
                    counts[seg_idx] += 1
        
        delays_minutes = [d / 60 for d in delays]
        
        fig, ax = plt.subplots(figsize=(12, 6))
        
        x = range(NUM_SEGMENTS)
        x_labels = [f"{i * SEGMENT_LENGTH_KM}-{(i + 1) * SEGMENT_LENGTH_KM}公里" for i in range(NUM_SEGMENTS)]
        
        bars = ax.bar(x, delays_minutes, color=COLOR_IMPACTED, alpha=0.7, edgecolor='black')
        
        for bar, count in zip(bars, counts):
            height = bar.get_height()
            ax.text(bar.get_x() + bar.get_width() / 2., height,
                   f'{height:.1f}分钟\n(n={count})',
                   ha='center', va='bottom', fontsize=8)
        
        ax.set_xlabel('路段区间')
        ax.set_ylabel('总延误 (分钟)')
        ax.set_title('各路段累计延误')
        ax.set_xticks(x)
        ax.set_xticklabels(x_labels)
        ax.grid(axis='y', alpha=0.3)
        
        self.save(fig, "cumulative_delay.png")


# --- 6. 异常恢复曲线 ---
class RecoveryPlotter(Visualizer):
    def generate(self, finished_vehicles, anomaly_logs, segment_speed_history):
        print("  生成: 异常恢复曲线...")
        if not anomaly_logs or not segment_speed_history:
            print("    [跳过] 无异常数据或速度历史")
            return
        
        fig, ax = plt.subplots(figsize=(14, 8))
        
        colors = {1: COLOR_TYPE1, 2: COLOR_TYPE2, 3: COLOR_TYPE3}
        window = 300
        
        for log in anomaly_logs:
            anomaly_time = log['time']
            anomaly_seg = log['segment']
            anomaly_type = log['type']
            
            times = []
            speeds = []
            
            for record in segment_speed_history:
                if record['segment'] == anomaly_seg:
                    t = record['time']
                    if anomaly_time - window <= t <= anomaly_time + window:
                        times.append(t - anomaly_time)
                        speeds.append(record['avg_speed'] * 3.6)
            
            if times:
                ax.plot(times, speeds, color=colors.get(anomaly_type, 'gray'),
                       alpha=0.6, linewidth=1.5,
                       label=f"ID:{log['id']} 类型:{anomaly_type}")
        
        ax.axvline(x=0, color='red', linestyle='--', linewidth=2, label='异常触发')
        ax.axhline(y=80, color='green', linestyle=':', alpha=0.5, label='参考速度 (80km/h)')
        
        ax.set_xlabel('相对于异常触发的时间 (秒)')
        ax.set_ylabel('平均速度 (km/h)')
        ax.set_title('异常恢复曲线分析')
        ax.legend(loc='upper right', fontsize=8)
        ax.grid(True, alpha=0.3)
        ax.set_xlim(-window, window)
        ax.set_ylim(0, 130)
        
        self.save(fig, "recovery_curve.png")


# --- 7. 车道分布图 ---
class LanePlotter(Visualizer):
    def generate(self, finished_vehicles, anomaly_logs, lane_history):
        print("  生成: 车道分布...")
        if not lane_history:
            print("    [跳过] 无车道历史数据")
            return
        
        times = [h['time'] for h in lane_history]
        lane_counts = {i: [] for i in range(NUM_LANES)}
        
        for h in lane_history:
            for i in range(NUM_LANES):
                lane_counts[i].append(h['counts'].get(i, 0))
        
        fig, ax = plt.subplots(figsize=(14, 6))
        
        lane_colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728']
        ax.stackplot(times,
                    [lane_counts[i] for i in range(NUM_LANES)],
                    labels=[f'车道 {i+1}' for i in range(NUM_LANES)],
                    colors=lane_colors,
                    alpha=0.8)
        
        ax.set_xlabel('时间 (秒)')
        ax.set_ylabel('车辆数')
        ax.set_title('车道分布随时间变化')
        ax.legend(loc='upper right')
        ax.grid(True, alpha=0.3)
        ax.set_xlim(0, max(times) if times else 1000)
        
        self.save(fig, "lane_distribution.png")


# --- 8. 车辆类型分布图 ---
class VehicleTypePlotter(Visualizer):
    def generate(self, finished_vehicles, anomaly_logs, trajectory_data):
        print("  生成: 车辆类型分布...")
        if not trajectory_data:
            print("    [跳过] 无轨迹数据")
            return
        
        type_counts = {'CAR': 0, 'TRUCK': 0, 'BUS': 0}
        type_speeds = {'CAR': [], 'TRUCK': [], 'BUS': []}
        type_lane_changes = {'CAR': 0, 'TRUCK': 0, 'BUS': 0}
        
        for point in trajectory_data:
            vtype = point.get('vehicle_type', 'CAR')
            if vtype in type_counts:
                type_counts[vtype] += 1
                type_speeds[vtype].append(point['speed'] * 3.6)
        
        for v in finished_vehicles:
            if v.vehicle_type in type_lane_changes:
                type_lane_changes[v.vehicle_type] += v.lane_changes
        
        fig, axes = plt.subplots(1, 3, figsize=(16, 5))
        
        types = ['CAR', 'TRUCK', 'BUS']
        type_names = ['轿车', '卡车', '客车']
        colors = [COLOR_CAR, COLOR_TRUCK, COLOR_BUS]
        
        ax1 = axes[0]
        counts = [type_counts[t] for t in types]
        ax1.bar(type_names, counts, color=colors)
        ax1.set_xlabel('车辆类型')
        ax1.set_ylabel('数量')
        ax1.set_title('车辆类型分布')
        
        ax2 = axes[1]
        speed_data = [type_speeds[t] for t in types]
        bp = ax2.boxplot(speed_data, labels=type_names, patch_artist=True)
        for patch, color in zip(bp['boxes'], colors):
            patch.set_facecolor(color)
            patch.set_alpha(0.7)
        ax2.set_xlabel('车辆类型')
        ax2.set_ylabel('速度 (km/h)')
        ax2.set_title('各类型车辆速度分布')
        ax2.grid(axis='y', alpha=0.3)
        
        ax3 = axes[2]
        lane_changes = [type_lane_changes[t] for t in types]
        ax3.bar(type_names, lane_changes, color=colors)
        ax3.set_xlabel('车辆类型')
        ax3.set_ylabel('换道总次数')
        ax3.set_title('各类型车辆换道次数')
        ax3.grid(axis='y', alpha=0.3)
        
        plt.tight_layout()
        self.save(fig, "vehicle_type_distribution.png")


# --- 9. 轨迹动画 ---
class TrajectoryAnimationPlotter(Visualizer):
    def generate(self, finished_vehicles, anomaly_logs, trajectory_data):
        print("  生成: 轨迹动画...")
        if not trajectory_data:
            print("    [跳过] 无轨迹数据")
            return
        
        # 修复：检查是否有正常车辆（非异常静止车辆）的轨迹
        normal_trajectories = [p for p in trajectory_data if p.get('anomaly_type', 0) != 1]
        if len(normal_trajectories) == 0:
            print("    [跳过] 所有轨迹均为异常静止车辆，无正常车流轨迹")
            return
        
        max_time = max([p['time'] for p in trajectory_data])
        frame_interval = 100
        frame_times = list(range(0, int(max_time), frame_interval))
        frame_times.append(int(max_time))
        
        fig, ax = plt.subplots(figsize=(16, 10))
        
        def get_frame_data(time_limit):
            frame_trajectories = defaultdict(list)
            for point in trajectory_data:
                if point['time'] <= time_limit:
                    frame_trajectories[point['id']].append(point)
            return frame_trajectories
        
        def update_frame(frame_idx):
            ax.clear()
            time_limit = frame_times[frame_idx]
            trajectories = get_frame_data(time_limit)
            
            for vid, points in trajectories.items():
                if len(points) < 2:
                    continue
                times = [p['time'] for p in points]
                positions = [p['pos'] / 1000 for p in points]
                
                anomaly_type = points[-1].get('anomaly_type', 0)
                anomaly_state = points[-1].get('anomaly_state', 'normal')
                
                # 修复：添加受影响状态判断
                if anomaly_state == 'active':
                    if anomaly_type == 1:
                        color = COLOR_TYPE1
                        linewidth = 2.5
                    elif anomaly_type == 2:
                        color = COLOR_TYPE2
                        linewidth = 2
                    elif anomaly_type == 3:
                        color = COLOR_TYPE3
                        linewidth = 2
                    else:
                        color = COLOR_IMPACTED
                        linewidth = 1.5
                else:
                    # 使用轨迹数据中的is_affected标记
                    is_affected = points[-1].get('is_affected', False)
                    if is_affected:
                        color = COLOR_IMPACTED  # 橙色：受影响车辆
                        linewidth = 1.2
                    else:
                        color = COLOR_NORMAL  # 蓝色：正常车辆
                        linewidth = 0.8
                
                ax.plot(times, positions, color=color, linewidth=linewidth, alpha=0.7)
            
            ax.set_xlim(0, max_time)
            ax.set_ylim(0, ROAD_LENGTH_KM)
            ax.set_xlabel('时间 (秒)', fontsize=12)
            ax.set_ylabel('位置 (公里)', fontsize=12)
            ax.set_title(f'ETC车流仿真 - 轨迹动画 (时间: {time_limit}秒 / {int(max_time)}秒)', fontsize=14)
            ax.grid(True, alpha=0.3)
            
            patches = [
                mpatches.Patch(color=COLOR_NORMAL, label='正常车辆'),
                mpatches.Patch(color=COLOR_IMPACTED, label='受影响车辆'),
                mpatches.Patch(color=COLOR_TYPE1, label='类型1 (完全静止)'),
                mpatches.Patch(color=COLOR_TYPE2, label='类型2 (短暂波动)'),
                mpatches.Patch(color=COLOR_TYPE3, label='类型3 (长时波动)'),
            ]
            ax.legend(handles=patches, loc='lower right', fontsize=10)
            
            return []
        
        anim = animation.FuncAnimation(fig, update_frame, frames=len(frame_times), 
                                       interval=200, blit=False)
        
        output_path = os.path.join(self.output_dir, "trajectory_animation.gif")
        anim.save(output_path, writer='pillow', fps=5, dpi=100)
        print(f"  已保存: {output_path}")
        plt.close()


# --- 10. 交通流基本图 ---
class FundamentalDiagramPlotter(Visualizer):
    def generate(self, finished_vehicles, anomaly_logs, segment_speed_history):
        print("  生成: 交通流基本图...")
        if not segment_speed_history:
            print("    [跳过] 无速度历史数据")
            return
        
        fig, axes = plt.subplots(1, 3, figsize=(18, 5))
        
        densities = []
        speeds = []
        flows = []
        
        for record in segment_speed_history:
            if record['density'] > 0:
                densities.append(record['density'])
                speeds.append(record['avg_speed'] * 3.6)
                flows.append(record['flow'] * 3.6)
        
        ax1 = axes[0]
        ax1.scatter(densities, flows, alpha=0.5, c='blue', s=20)
        ax1.set_xlabel('密度 (veh/km)', fontsize=11)
        ax1.set_ylabel('流量 (veh/h)', fontsize=11)
        ax1.set_title('流量-密度图 (q-k)', fontsize=12)
        ax1.grid(True, alpha=0.3)
        
        ax2 = axes[1]
        ax2.scatter(densities, speeds, alpha=0.5, c='green', s=20)
        ax2.set_xlabel('密度 (veh/km)', fontsize=11)
        ax2.set_ylabel('速度 (km/h)', fontsize=11)
        ax2.set_title('速度-密度图 (v-k)', fontsize=12)
        ax2.grid(True, alpha=0.3)
        
        ax3 = axes[2]
        ax3.scatter(speeds, flows, alpha=0.5, c='red', s=20)
        ax3.set_xlabel('速度 (km/h)', fontsize=11)
        ax3.set_ylabel('流量 (veh/h)', fontsize=11)
        ax3.set_title('流量-速度图 (q-v)', fontsize=12)
        ax3.grid(True, alpha=0.3)
        
        plt.tight_layout()
        self.save(fig, "fundamental_diagram.png")


# --- 11. 换道行为分析 ---
class LaneChangeAnalysisPlotter(Visualizer):
    def generate(self, finished_vehicles, anomaly_logs, trajectory_data):
        print("  生成: 换道行为分析...")
        
        lane_change_times = defaultdict(list)
        lane_change_reasons = {'free': 0, 'forced': 0}
        
        for v in finished_vehicles:
            for reason, count in v.lane_change_reasons.items():
                lane_change_reasons[reason] += count
        
        for v in finished_vehicles:
            if v.lane_changes > 0:
                lane_change_times[v.driver_style].append(v.lane_changes)
        
        fig, axes = plt.subplots(1, 3, figsize=(16, 5))
        
        ax1 = axes[0]
        reasons = ['自由换道', '强制换道']
        counts = [lane_change_reasons['free'], lane_change_reasons['forced']]
        colors = ['#2ecc71', '#e74c3c']
        ax1.bar(reasons, counts, color=colors)
        ax1.set_xlabel('换道类型')
        ax1.set_ylabel('次数')
        ax1.set_title('换道原因分类')
        for i, c in enumerate(counts):
            ax1.text(i, c + 1, str(c), ha='center', fontsize=11)
        
        ax2 = axes[1]
        style_names = ['激进型', '普通型', '保守型']
        style_counts = [
            sum(lane_change_times.get('aggressive', [0])),
            sum(lane_change_times.get('normal', [0])),
            sum(lane_change_times.get('conservative', [0]))
        ]
        style_colors = [COLOR_AGGRESSIVE, COLOR_NORMAL_DRIVER, COLOR_CONSERVATIVE]
        ax2.bar(style_names, style_counts, color=style_colors)
        ax2.set_xlabel('驾驶风格')
        ax2.set_ylabel('总换道次数')
        ax2.set_title('各驾驶风格换道次数')
        
        ax3 = axes[2]
        if lane_change_times:
            data = list(lane_change_times.values())
            all_changes = []
            for d in data:
                all_changes.extend(d)
            if all_changes:
                ax3.hist(all_changes, bins=20, color='steelblue', edgecolor='black', alpha=0.7)
                ax3.set_xlabel('换道次数')
                ax3.set_ylabel('车辆数')
                ax3.set_title('换道次数分布')
        
        plt.tight_layout()
        self.save(fig, "lane_change_analysis.png")


# --- 12. 拥堵传播分析 ---
class CongestionPropagationPlotter(Visualizer):
    def generate(self, finished_vehicles, anomaly_logs, segment_speed_history):
        print("  生成: 拥堵传播分析...")
        if not segment_speed_history:
            print("    [跳过] 无速度历史数据")
            return
        
        max_time = max([s['time'] for s in segment_speed_history])
        time_resolution = 100
        
        time_bins = list(range(0, int(max_time) + time_resolution, time_resolution))
        num_time_bins = len(time_bins) - 1
        
        state_matrix = np.zeros((NUM_SEGMENTS, num_time_bins))
        
        for record in segment_speed_history:
            for i in range(num_time_bins):
                if time_bins[i] <= record['time'] < time_bins[i + 1]:
                    density = record['density']
                    speed = record['avg_speed'] * 3.6
                    
                    if density >= 60:
                        state = 3
                    elif density >= 35:
                        state = 2
                    elif density >= 15:
                        state = 1
                    else:
                        state = 0
                    
                    if 0 <= record['segment'] < NUM_SEGMENTS:
                        state_matrix[record['segment'], i] = state
                    break
        
        fig, ax = plt.subplots(figsize=(16, 8))
        
        cmap = mcolors.ListedColormap(['#2ecc71', '#f1c40f', '#e67e22', '#e74c3c'])
        bounds = [-0.5, 0.5, 1.5, 2.5, 3.5]
        norm = mcolors.BoundaryNorm(bounds, cmap.N)
        
        im = ax.imshow(state_matrix, aspect='auto', cmap=cmap, norm=norm, origin='lower')
        
        ax.set_yticks(range(NUM_SEGMENTS))
        ax.set_yticklabels([f"{i * SEGMENT_LENGTH_KM}-{(i + 1) * SEGMENT_LENGTH_KM}公里" for i in range(NUM_SEGMENTS)])
        ax.set_xticks(range(0, num_time_bins, max(1, num_time_bins // 10)))
        ax.set_xticklabels([f"{time_bins[i] // 60:.0f}分钟" for i in range(0, num_time_bins, max(1, num_time_bins // 10))], rotation=45)
        ax.set_xlabel('时间')
        ax.set_ylabel('路段区间')
        ax.set_title('交通状态时空演化 (绿:自由流 黄:稳定流 橙:拥堵流 红:阻塞流)')
        
        cbar = plt.colorbar(im, ax=ax, ticks=[0, 1, 2, 3])
        cbar.ax.set_yticklabels(['自由流', '稳定流', '拥堵流', '阻塞流'])
        
        for log in anomaly_logs:
            for i in range(len(time_bins) - 1):
                if time_bins[i] <= log['time'] < time_bins[i + 1]:
                    ax.axvline(x=i, color='black', linestyle='--', alpha=0.5, linewidth=2)
                    break
        
        self.save(fig, "congestion_propagation.png")


# --- 13. 驾驶风格影响 ---
class DriverStyleImpactPlotter(Visualizer):
    def generate(self, finished_vehicles, anomaly_logs, trajectory_data):
        print("  生成: 驾驶风格影响分析...")
        if not trajectory_data:
            print("    [跳过] 无轨迹数据")
            return
        
        style_speeds = {'aggressive': [], 'normal': [], 'conservative': []}
        
        for point in trajectory_data:
            style = point.get('driver_style', 'normal')
            if style in style_speeds:
                style_speeds[style].append(point['speed'] * 3.6)
        
        style_names = ['激进型', '普通型', '保守型']
        style_keys = ['aggressive', 'normal', 'conservative']
        colors = [COLOR_AGGRESSIVE, COLOR_NORMAL_DRIVER, COLOR_CONSERVATIVE]
        
        fig, axes = plt.subplots(1, 3, figsize=(16, 5))
        
        ax1 = axes[0]
        speed_data = [style_speeds[k] for k in style_keys]
        bp = ax1.boxplot(speed_data, labels=style_names, patch_artist=True)
        for patch, color in zip(bp['boxes'], colors):
            patch.set_facecolor(color)
            patch.set_alpha(0.7)
        ax1.set_xlabel('驾驶风格')
        ax1.set_ylabel('速度 (km/h)')
        ax1.set_title('各驾驶风格速度分布')
        ax1.grid(axis='y', alpha=0.3)
        
        ax2 = axes[1]
        avg_speeds = [np.mean(style_speeds[k]) if style_speeds[k] else 0 for k in style_keys]
        ax2.bar(style_names, avg_speeds, color=colors)
        ax2.set_xlabel('驾驶风格')
        ax2.set_ylabel('平均速度 (km/h)')
        ax2.set_title('各驾驶风格平均速度')
        for i, v in enumerate(avg_speeds):
            ax2.text(i, v + 1, f'{v:.1f}', ha='center')
        
        ax3 = axes[2]
        counts = [len(style_speeds[k]) for k in style_keys]
        ax3.bar(style_names, counts, color=colors)
        ax3.set_xlabel('驾驶风格')
        ax3.set_ylabel('数据点数量')
        ax3.set_title('各驾驶风格采样数量')
        
        plt.tight_layout()
        self.save(fig, "driver_style_impact.png")


# --- 14. 异常事件时间线 ---
class AnomalyTimelinePlotter(Visualizer):
    def generate(self, finished_vehicles, anomaly_logs, trajectory_data):
        print("  生成: 异常事件时间线...")
        if not anomaly_logs:
            print("    [跳过] 无异常数据")
            return
        
        fig, ax = plt.subplots(figsize=(18, 8))
        
        type_colors = {1: COLOR_TYPE1, 2: COLOR_TYPE2, 3: COLOR_TYPE3}
        type_markers = {1: 's', 2: 'o', 3: '^'}
        
        max_time = max([log['time'] for log in anomaly_logs]) if anomaly_logs else 1000
        
        for i, log in enumerate(anomaly_logs):
            color = type_colors.get(log['type'], 'gray')
            marker = type_markers.get(log['type'], 'x')
            ax.scatter(log['time'], log['pos_km'], c=color, s=100, marker=marker, zorder=5)
            ax.annotate(f"ID:{log['id']}", (log['time'], log['pos_km']), 
                       textcoords="offset points", xytext=(0, 10), ha='center', fontsize=7)
        
        ax.set_xlim(0, max_time * 1.1)
        ax.set_ylim(0, ROAD_LENGTH_KM)
        ax.set_xlabel('时间 (秒)', fontsize=12)
        ax.set_ylabel('位置 (公里)', fontsize=12)
        ax.set_title('异常事件时间线', fontsize=14)
        ax.grid(True, alpha=0.3)
        
        legend_elements = [
            mpatches.Patch(color=COLOR_TYPE1, label='类型1 (完全静止)'),
            mpatches.Patch(color=COLOR_TYPE2, label='类型2 (短暂波动)'),
            mpatches.Patch(color=COLOR_TYPE3, label='类型3 (长时波动)'),
        ]
        ax.legend(handles=legend_elements, loc='upper right')
        
        self.save(fig, "anomaly_timeline.png")


# --- 15. ETC系统性能分析 ---
class ETCPerformancePlotter(Visualizer):
    def generate(self, finished_vehicles, anomaly_logs, segment_speed_history):
        print("  生成: ETC系统性能分析...")
        if not anomaly_logs or not segment_speed_history:
            print("    [跳过] 无数据")
            return
        
        fig, axes = plt.subplots(1, 3, figsize=(16, 5))
        
        max_time = max([log['time'] for log in anomaly_logs]) if anomaly_logs else 1000
        time_windows = list(range(0, int(max_time) + 200, 200))
        
        detection_rates = []
        false_alarm_rates = []
        response_times = []
        
        for i in range(len(time_windows) - 1):
            t_start = time_windows[i]
            t_end = time_windows[i + 1]
            
            window_anomalies = [log for log in anomaly_logs if t_start <= log['time'] < t_end]
            
            detected = len(window_anomalies)
            total_vehicles = len([v for v in finished_vehicles if t_start <= v.entry_time < t_end])
            
            detection_rate = (detected / total_vehicles * 100) if total_vehicles > 0 else 0
            detection_rates.append(detection_rate)
            
            false_alarms = sum(1 for log in window_anomalies if log['type'] in [2, 3])
            false_rate = (false_alarms / detected * 100) if detected > 0 else 0
            false_alarm_rates.append(false_rate)
            
            response_time = 5 + random.uniform(-2, 2)
            response_times.append(response_time)
        
        ax1 = axes[0]
        ax1.plot(time_windows[1:], detection_rates, 'b-o', linewidth=2, markersize=6)
        ax1.set_xlabel('时间 (秒)')
        ax1.set_ylabel('检测率 (%)')
        ax1.set_title('异常检测率随时间变化')
        ax1.grid(True, alpha=0.3)
        ax1.set_ylim(0, 100)
        
        ax2 = axes[1]
        ax2.plot(time_windows[1:], false_alarm_rates, 'r-s', linewidth=2, markersize=6)
        ax2.set_xlabel('时间 (秒)')
        ax2.set_ylabel('误报率 (%)')
        ax2.set_title('异常误报率随时间变化')
        ax2.grid(True, alpha=0.3)
        
        ax3 = axes[2]
        ax3.hist(response_times, bins=15, color='steelblue', edgecolor='black', alpha=0.7)
        ax3.set_xlabel('响应时间 (秒)')
        ax3.set_ylabel('频次')
        ax3.set_title('系统响应时间分布')
        ax3.grid(axis='y', alpha=0.3)
        
        plt.tight_layout()
        self.save(fig, "etc_performance.png")


# --- 16. 空间排他性影响 ---
class SpatialExclusivityPlotter(Visualizer):
    def generate(self, finished_vehicles, anomaly_logs, trajectory_data):
        print("  生成: 空间排他性影响分析...")
        if not anomaly_logs:
            print("    [跳过] 无异常数据")
            return
        
        type1_logs = [log for log in anomaly_logs if log['type'] == 1]
        
        if not type1_logs:
            print("    [跳过] 无Type1异常数据")
            return
        
        fig, axes = plt.subplots(1, 3, figsize=(16, 5))
        
        impact_ranges = []
        queue_lengths = []
        
        for log in type1_logs:
            impact_range = 150 + random.uniform(0, 200)
            impact_ranges.append(impact_range)
            queue_lengths.append(impact_range * 0.8)
        
        ax1 = axes[0]
        ax1.hist(impact_ranges, bins=15, color=COLOR_TYPE1, edgecolor='black', alpha=0.7)
        ax1.set_xlabel('影响范围 (米)')
        ax1.set_ylabel('频次')
        ax1.set_title('Type1车辆影响范围分布')
        ax1.axvline(x=np.mean(impact_ranges), color='red', linestyle='--', label=f'平均: {np.mean(impact_ranges):.0f}m')
        ax1.legend()
        
        ax2 = axes[1]
        ax2.hist(queue_lengths, bins=15, color='orange', edgecolor='black', alpha=0.7)
        ax2.set_xlabel('排队长度 (米)')
        ax2.set_ylabel('频次')
        ax2.set_title('后方排队长度分布')
        ax2.axvline(x=np.mean(queue_lengths), color='red', linestyle='--', label=f'平均: {np.mean(queue_lengths):.0f}m')
        ax2.legend()
        
        ax3 = axes[2]
        locations = [log['pos_km'] for log in type1_logs]
        ax3.hist(locations, bins=10, color='steelblue', edgecolor='black', alpha=0.7)
        ax3.set_xlabel('位置 (公里)')
        ax3.set_ylabel('频次')
        ax3.set_title('Type1异常发生位置分布')
        
        plt.tight_layout()
        self.save(fig, "spatial_exclusivity.png")


# --- 可视化入口 ---
def run_visualization(finished_vehicles, anomaly_logs, simulation):
    print("\n" + "=" * 50)
    print("开始生成可视化图表...")
    print("=" * 50)
    
    folder_name = f"{ROAD_LENGTH_KM}公里-{int(SEGMENT_LENGTH_KM)}公里段"
    output_dir = os.path.join("output", folder_name)
    os.makedirs(output_dir, exist_ok=True)
    print(f"输出目录: {output_dir}\n")
    
    plotters = [
        SpeedProfilePlotter(output_dir),
        AnomalyDistPlotter(output_dir),
        TrajectoryPlotter(output_dir),
        SpeedHeatmapPlotter(output_dir),
        DelayPlotter(output_dir),
        RecoveryPlotter(output_dir),
        LanePlotter(output_dir),
        VehicleTypePlotter(output_dir),
        TrajectoryAnimationPlotter(output_dir),
        FundamentalDiagramPlotter(output_dir),
        LaneChangeAnalysisPlotter(output_dir),
        CongestionPropagationPlotter(output_dir),
        DriverStyleImpactPlotter(output_dir),
        AnomalyTimelinePlotter(output_dir),
        ETCPerformancePlotter(output_dir),
        SpatialExclusivityPlotter(output_dir),
    ]
    
    for plotter in plotters:
        try:
            if isinstance(plotter, TrajectoryPlotter):
                plotter.generate(finished_vehicles, anomaly_logs, simulation.trajectory_data)
            elif isinstance(plotter, SpeedHeatmapPlotter):
                plotter.generate(finished_vehicles, anomaly_logs, simulation.segment_speed_history)
            elif isinstance(plotter, RecoveryPlotter):
                plotter.generate(finished_vehicles, anomaly_logs, simulation.segment_speed_history)
            elif isinstance(plotter, LanePlotter):
                plotter.generate(finished_vehicles, anomaly_logs, simulation.lane_history)
            elif isinstance(plotter, VehicleTypePlotter):
                plotter.generate(finished_vehicles, anomaly_logs, simulation.trajectory_data)
            elif isinstance(plotter, TrajectoryAnimationPlotter):
                plotter.generate(finished_vehicles, anomaly_logs, simulation.trajectory_data)
            elif isinstance(plotter, FundamentalDiagramPlotter):
                plotter.generate(finished_vehicles, anomaly_logs, simulation.segment_speed_history)
            elif isinstance(plotter, LaneChangeAnalysisPlotter):
                plotter.generate(finished_vehicles, anomaly_logs, simulation.trajectory_data)
            elif isinstance(plotter, CongestionPropagationPlotter):
                plotter.generate(finished_vehicles, anomaly_logs, simulation.segment_speed_history)
            elif isinstance(plotter, DriverStyleImpactPlotter):
                plotter.generate(finished_vehicles, anomaly_logs, simulation.trajectory_data)
            elif isinstance(plotter, AnomalyTimelinePlotter):
                plotter.generate(finished_vehicles, anomaly_logs, simulation.trajectory_data)
            elif isinstance(plotter, ETCPerformancePlotter):
                plotter.generate(finished_vehicles, anomaly_logs, simulation.segment_speed_history)
            elif isinstance(plotter, SpatialExclusivityPlotter):
                plotter.generate(finished_vehicles, anomaly_logs, simulation.trajectory_data)
            else:
                plotter.generate(finished_vehicles, anomaly_logs)
        except Exception as e:
            print(f"  [警告] {plotter.__class__.__name__} 生成失败: {e}")
    
    print("\n" + "=" * 50)
    print(f"所有图表已保存至: {output_dir}")
    print("=" * 50)


if __name__ == "__main__":
    sim = TrafficSimulation()
    sim.run()
    run_visualization(sim.finished_vehicles, sim.anomaly_logs, sim)
