"""
车辆投放器（增强版）
支持非均匀泊松过程、时变流量模式、车队跟随效应

时变模式:
- peak_morning: 早高峰（7:00-9:00 高流量）
- peak_evening: 晚高峰（17:00-19:00 高流量）
- uniform: 均匀流量（用于简单测试）
- custom: 自定义流量-时间曲线
"""

import random
import math
from typing import List, Dict, Optional, Tuple
from enum import Enum


class FlowMode(Enum):
    """流量模式枚举"""
    UNIFORM = "uniform"           # 均匀流量
    PEAK_MORNING = "peak_morning" # 早高峰
    PEAK_EVENING = "peak_evening" # 晚高峰
    PEAK_BOTH = "peak_both"       # 早晚双高峰
    NIGHT = "night"               # 夜间低流量
    CUSTOM = "custom"             # 自定义曲线


# 预定义流量曲线（归一化倍率, 1.0 = 基础流量）
FLOW_PROFILES: Dict[FlowMode, List[Tuple[float, float]]] = {
    FlowMode.UNIFORM: [
        (0, 1.0), (3600, 1.0)  # 恒定
    ],
    FlowMode.PEAK_MORNING: [
        (0, 0.3),       # 仿真开始：低流量
        (300, 0.5),     # 5min：渐增
        (600, 1.2),     # 10min：高峰开始
        (1200, 1.8),    # 20min：高峰顶峰
        (1800, 1.5),    # 30min：高峰回落
        (2400, 0.8),    # 40min：逐渐恢复
        (3000, 0.5),    # 50min：低流量
        (3600, 0.3),    # 60min：低谷
    ],
    FlowMode.PEAK_EVENING: [
        (0, 0.5),
        (600, 0.4),
        (1200, 0.6),
        (1800, 1.2),
        (2400, 1.8),
        (3000, 1.5),
        (3600, 0.5),
    ],
    FlowMode.PEAK_BOTH: [
        (0, 0.3),
        (300, 0.8),
        (600, 1.5),     # 第一个高峰
        (900, 1.8),
        (1200, 1.2),    # 高峰间低谷
        (1500, 0.6),
        (1800, 0.5),
        (2100, 0.8),
        (2400, 1.5),    # 第二个高峰
        (2700, 1.8),
        (3000, 1.2),
        (3300, 0.6),
        (3600, 0.3),
    ],
    FlowMode.NIGHT: [
        (0, 0.2), (1800, 0.15), (3600, 0.1)
    ],
}


class VehicleSpawner:
    """车辆投放器（增强版）
    
    支持：
    - 非均匀泊松过程投放
    - 高峰/平峰/夜间时变流量
    - 自定义流量-时间曲线
    - 车队跟随效应（platoon）
    """
    
    def __init__(self, total_vehicles: int = 1200, num_lanes: int = 4,
                 flow_mode: str = "uniform",
                 custom_profile: List[Tuple[float, float]] = None,
                 platoon_probability: float = 0.15,
                 platoon_size_range: Tuple[int, int] = (3, 6)):
        """
        Args:
            total_vehicles: 目标总车辆数
            num_lanes: 车道数
            flow_mode: 流量模式 ("uniform", "peak_morning", "peak_evening", "peak_both", "night", "custom")
            custom_profile: 自定义流量曲线 [(时间, 倍率), ...]
            platoon_probability: 车队出现概率
            platoon_size_range: 车队大小范围
        """
        self.total_vehicles = total_vehicles
        self.num_lanes = num_lanes
        self.platoon_probability = platoon_probability
        self.platoon_size_range = platoon_size_range
        
        # 解析流量模式
        try:
            self.flow_mode = FlowMode(flow_mode)
        except ValueError:
            self.flow_mode = FlowMode.UNIFORM
        
        # 获取流量曲线
        if self.flow_mode == FlowMode.CUSTOM and custom_profile:
            self.flow_profile = sorted(custom_profile, key=lambda x: x[0])
        elif self.flow_mode in FLOW_PROFILES:
            self.flow_profile = FLOW_PROFILES[self.flow_mode]
        else:
            self.flow_profile = FLOW_PROFILES[FlowMode.UNIFORM]
        
        # 生成投放计划
        self.spawn_schedule: List[float] = []
        self.spawn_metadata: Dict[int, dict] = {}  # idx -> {is_platoon, platoon_id}
        self._generate_schedule()
    
    def _get_flow_rate(self, t: float) -> float:
        """
        根据时间获取流量倍率（分段线性插值）
        
        Args:
            t: 当前仿真时间（秒）
        
        Returns:
            流量倍率（1.0 = 基础流量）
        """
        profile = self.flow_profile
        
        if t <= profile[0][0]:
            return profile[0][1]
        if t >= profile[-1][0]:
            return profile[-1][1]
        
        # 线性插值
        for i in range(len(profile) - 1):
            t0, r0 = profile[i]
            t1, r1 = profile[i + 1]
            if t0 <= t < t1:
                ratio = (t - t0) / (t1 - t0)
                return r0 + ratio * (r1 - r0)
        
        return 1.0
    
    def _generate_schedule(self):
        """生成非均匀泊松投放计划"""
        # 基础投放率（辆/秒）
        max_time = self.flow_profile[-1][0]
        if max_time <= 0:
            max_time = 3600
        
        # 通过积分流量曲线来估算基础率
        # 使积分后总量接近 total_vehicles
        integral = 0
        dt_sample = 10  # 采样步长
        t = 0
        while t < max_time:
            integral += self._get_flow_rate(t) * dt_sample
            t += dt_sample
        
        if integral <= 0:
            integral = max_time
        
        base_rate = self.total_vehicles / integral  # 辆/秒/倍率
        
        # 非均匀泊松过程生成
        generated = 0
        t = 0.0
        platoon_id = 0
        
        while generated < self.total_vehicles and t < max_time * 1.5:
            rate = self._get_flow_rate(t) * base_rate
            rate = max(rate, 0.01)  # 防止零流量
            
            # 泊松过程：到达间隔服从指数分布
            interval = random.expovariate(rate)
            t += interval
            
            if t > max_time * 1.5:
                break
            
            # 车队效应检测
            if random.random() < self.platoon_probability and generated + 3 < self.total_vehicles:
                platoon_id += 1
                platoon_size = random.randint(*self.platoon_size_range)
                platoon_size = min(platoon_size, self.total_vehicles - generated)
                
                # 车队内车辆紧密跟随（间隔 0.5~2.0 秒）
                for j in range(platoon_size):
                    if generated >= self.total_vehicles:
                        break
                    spawn_t = t + j * random.uniform(0.5, 2.0)
                    self.spawn_schedule.append(spawn_t)
                    self.spawn_metadata[generated] = {
                        'is_platoon': True,
                        'platoon_id': platoon_id,
                        'platoon_position': j
                    }
                    generated += 1
                
                t += platoon_size * 1.5  # 车队后留间距
            else:
                self.spawn_schedule.append(t)
                self.spawn_metadata[generated] = {
                    'is_platoon': False,
                    'platoon_id': 0,
                    'platoon_position': 0
                }
                generated += 1
        
        # 如果生成不足，补充
        while generated < self.total_vehicles:
            t += random.uniform(1.0, 5.0)
            self.spawn_schedule.append(t)
            self.spawn_metadata[generated] = {
                'is_platoon': False,
                'platoon_id': 0,
                'platoon_position': 0
            }
            generated += 1
        
        self.spawn_schedule.sort()
    
    def get_spawn_times(self) -> List[float]:
        """获取投放时间列表"""
        return sorted(self.spawn_schedule)
    
    def get_next_spawn_time(self, current_time: float) -> List[float]:
        """获取当前时间之后的所有投放时间"""
        return [t for t in self.spawn_schedule if t > current_time]
    
    def get_next_batch(self, current_time: float, max_count: int = 8) -> List[float]:
        """获取下一批投放时间（最多max_count个）"""
        times = [t for t in self.spawn_schedule if t > current_time]
        return sorted(times)[:max_count]
    
    def select_lane(self, occupied_lanes: set) -> int:
        """选择投放车道（优先选择空闲车道）"""
        available = [i for i in range(self.num_lanes) if i not in occupied_lanes]
        if available:
            return random.choice(available)
        return random.randint(0, self.num_lanes - 1)
    
    def can_spawn(self, vehicle_id: int, current_time: float, 
                  lane: int, existing_vehicles: list) -> bool:
        """检查是否可以在指定车道投放车辆"""
        for v in existing_vehicles:
            if v.lane == lane and v.pos < 50:
                return False
        return True
    
    def is_platoon_vehicle(self, vehicle_index: int) -> bool:
        """检查是否为车队车辆"""
        meta = self.spawn_metadata.get(vehicle_index, {})
        return meta.get('is_platoon', False)
    
    def get_vehicle_metadata(self, vehicle_index: int) -> dict:
        """获取车辆投放元数据"""
        return self.spawn_metadata.get(vehicle_index, {
            'is_platoon': False,
            'platoon_id': 0,
            'platoon_position': 0
        })
    
    @property
    def last_spawn_time(self) -> float:
        """最后投放时间"""
        return max(self.spawn_schedule) if self.spawn_schedule else 0
    
    def remaining_count(self, current_time: float) -> int:
        """剩余未投放车辆数"""
        return sum(1 for t in self.spawn_schedule if t > current_time)
    
    def get_flow_statistics(self) -> dict:
        """获取投放统计信息"""
        if not self.spawn_schedule:
            return {}
        
        times = sorted(self.spawn_schedule)
        total = len(times)
        duration = times[-1] - times[0] if total > 1 else 1
        
        # 按 60 秒窗口统计流量
        window = 60
        flow_per_minute = []
        t = times[0]
        while t < times[-1]:
            count = sum(1 for s in times if t <= s < t + window)
            flow_per_minute.append({
                'time': t,
                'count': count,
                'rate_per_min': count
            })
            t += window
        
        platoon_count = sum(1 for m in self.spawn_metadata.values() if m.get('is_platoon'))
        
        return {
            'total_vehicles': total,
            'duration': duration,
            'avg_rate': total / duration * 60 if duration > 0 else 0,
            'flow_mode': self.flow_mode.value,
            'platoon_vehicles': platoon_count,
            'platoon_ratio': platoon_count / total if total > 0 else 0,
            'flow_per_minute': flow_per_minute
        }
