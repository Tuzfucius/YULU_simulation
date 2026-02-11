"""
增强物理模型

提供：
- Wiedemann 99 跟驰模型（作为 IDM 替代方案）
- 反应时间延迟模块
- 视距受限模型
- 速度依赖加速度上限
"""

import math
import random
from typing import Optional, List, Dict, Deque
from collections import deque
from dataclasses import dataclass


@dataclass
class PerceptionState:
    """感知状态快照"""
    time: float
    leader_pos: float
    leader_speed: float
    leader_accel: float
    leader_length: float


class ReactionTimeDelay:
    """反应时间延迟模型
    
    模拟驾驶员感知前车状态的延迟效应。
    驾驶员的决策基于 reaction_time 前的感知信息而非实时状态。
    """
    
    def __init__(self, reaction_time: float = 1.0, dt: float = 0.5):
        """
        Args:
            reaction_time: 反应时间（秒）
            dt: 仿真步长（秒），用于计算缓冲区大小
        """
        self.reaction_time = reaction_time
        self.dt = dt
        buffer_size = max(int(reaction_time / dt) + 2, 3)
        self._history: Deque[PerceptionState] = deque(maxlen=buffer_size)
    
    def update(self, current_time: float, leader_pos: float,
               leader_speed: float, leader_accel: float = 0,
               leader_length: float = 4.5):
        """记录当前时刻的感知状态"""
        self._history.append(PerceptionState(
            time=current_time,
            leader_pos=leader_pos,
            leader_speed=leader_speed,
            leader_accel=leader_accel,
            leader_length=leader_length
        ))
    
    def get_delayed_perception(self, current_time: float) -> Optional[PerceptionState]:
        """获取延迟后的感知状态
        
        Returns:
            reaction_time 前的感知状态，若缓冲区不足则返回最早的状态
        """
        if not self._history:
            return None
        
        target_time = current_time - self.reaction_time
        
        # 找到最接近 target_time 的历史状态
        best = None
        best_diff = float('inf')
        
        for state in self._history:
            diff = abs(state.time - target_time)
            if diff < best_diff:
                best_diff = diff
                best = state
        
        return best if best else self._history[0]
    
    def clear(self):
        self._history.clear()


class Wiedemann99Model:
    """Wiedemann 99 跟驰模型
    
    十参数模型，可更精细地描述跟车行为。
    划分四种驾驶状态：自由行驶、趋近、跟车、急停。
    
    参考：PTV Vissim 使用的经典模型
    """
    
    # Wiedemann 99 默认参数
    DEFAULT_PARAMS = {
        'cc0': 1.50,    # 停车间距 (m)
        'cc1': 0.90,    # 期望跟车时距 (s)
        'cc2': 4.00,    # 跟车振荡幅度 (m)
        'cc3': -8.00,   # 开始减速阈值 (s)
        'cc4': -0.35,   # 加速度差阈值-负
        'cc5': 0.35,    # 加速度差阈值-正
        'cc6': 11.44,   # 速度波动因子 (1/ms)
        'cc7': 0.25,    # 振荡加速度 (m/s²)
        'cc8': 3.50,    # 起步加速度 (m/s²)
        'cc9': 1.50,    # 期望加速度at 80km/h (m/s²)
    }
    
    def __init__(self, params: dict = None):
        p = self.DEFAULT_PARAMS.copy()
        if params:
            p.update(params)
        self.cc0 = p['cc0']
        self.cc1 = p['cc1']
        self.cc2 = p['cc2']
        self.cc3 = p['cc3']
        self.cc4 = p['cc4']
        self.cc5 = p['cc5']
        self.cc6 = p['cc6']
        self.cc7 = p['cc7']
        self.cc8 = p['cc8']
        self.cc9 = p['cc9']
    
    def calc_acceleration(self, v: float, v0: float, a_max: float,
                          leader_speed: float, gap: float,
                          delta_v: float) -> float:
        """
        计算 Wiedemann 99 加速度
        
        Args:
            v: 当前速度 (m/s)
            v0: 期望速度 (m/s)
            a_max: 最大加速度 (m/s²)
            leader_speed: 前车速度 (m/s)
            gap: 与前车净距 (m)
            delta_v: 速度差 = v - leader_speed
        
        Returns:
            加速度 (m/s²)
        """
        # 安全跟车距离阈值
        sdx = self.cc0 + self.cc1 * max(v, 0)
        
        # 感知距离阈值
        sdx_upper = sdx + self.cc2
        sdx_lower = sdx
        
        # 状态判断
        if gap <= 0.5:
            # 碰撞防护
            return -7.0
        
        if gap < sdx_lower:
            # 状态1：急停（太近了）
            # 强减速
            if v > 0:
                decel = -min(7.0, 0.5 * v * v / max(gap, 0.5))
                return max(-7.0, decel)
            return 0
        
        if delta_v > 0 and gap < sdx_upper:
            # 状态2：趋近（正在接近前车）
            # 逐渐减速
            ratio = (sdx_upper - gap) / max(self.cc2, 0.1)
            decel = -ratio * delta_v * 0.5
            return max(-5.0, decel)
        
        if gap < sdx_upper:
            # 状态3：跟车（稳定跟随）
            # 微调速度匹配前车
            if abs(delta_v) < 0.5:
                return random.uniform(-self.cc7, self.cc7)
            elif delta_v > 0:
                return -0.5 * delta_v
            else:
                return min(a_max * 0.3, -delta_v * 0.3)
        
        # 状态4：自由行驶
        if v < v0:
            # 加速向期望速度靠拢
            speed_ratio = v / max(v0, 0.1)
            accel = a_max * (1 - speed_ratio ** 2)
            return max(0.1, min(a_max, accel))
        elif v > v0 * 1.05:
            return -0.5  # 轻微减速
        
        return 0.0  # 保持巡航


class VisibilityModel:
    """视距受限模型
    
    在弯道、雾天、夜间等条件下限制前车感知距离。
    未被感知的前车不会影响跟驰决策。
    """
    
    # 视距条件的参考值（米）
    VISIBILITY_TABLE = {
        'clear':    800,   # 晴天
        'rain':     400,   # 雨天
        'snow':     300,   # 雪天
        'fog':      150,   # 雾天
        'heavy_fog': 50,   # 浓雾
        'night':    300,   # 夜间
    }
    
    def __init__(self, base_visibility: float = 800):
        self.base_visibility = base_visibility
    
    def get_effective_visibility(self, weather: str = 'clear',
                                  is_curve: bool = False,
                                  curve_radius: float = 1000) -> float:
        """
        计算有效视距
        
        Args:
            weather: 天气条件
            is_curve: 是否在弯道
            curve_radius: 弯道半径（米）
        
        Returns:
            有效视距（米）
        """
        vis = self.VISIBILITY_TABLE.get(weather, self.base_visibility)
        
        if is_curve:
            # 弯道视距限制：基于曲率
            curve_vis = math.sqrt(2 * curve_radius * 1.2)  # 简化的弯道视距公式
            vis = min(vis, curve_vis)
        
        return vis
    
    def filter_visible_vehicles(self, ego_pos: float, ego_lane: int,
                                 vehicles: list,
                                 visibility: float) -> list:
        """
        过滤出可见车辆
        
        Args:
            ego_pos: 自车位置
            ego_lane: 自车车道
            vehicles: 所有车辆列表
            visibility: 当前视距
        
        Returns:
            可见车辆列表
        """
        visible = []
        for v in vehicles:
            dist = abs(v.pos - ego_pos)
            if dist <= visibility:
                visible.append(v)
            elif v.pos < ego_pos:
                # 后方视野更短（通过后视镜）
                if dist <= visibility * 0.5:
                    visible.append(v)
        return visible


def speed_dependent_max_acceleration(v: float, v0: float, 
                                      a_max_base: float) -> float:
    """
    速度依赖的最大加速度
    
    高速时加速能力下降（动力衰减 + 空气阻力）
    
    Args:
        v: 当前速度 (m/s)
        v0: 期望速度 (m/s)
        a_max_base: 基础最大加速度 (m/s²)
    
    Returns:
        实际最大加速度 (m/s²)
    """
    if v0 <= 0:
        return a_max_base
    
    speed_ratio = v / v0
    
    if speed_ratio < 0.3:
        # 低速：接近全加速能力
        return a_max_base * 0.95
    elif speed_ratio < 0.7:
        # 中速：线性衰减
        factor = 1.0 - 0.3 * (speed_ratio - 0.3) / 0.4
        return a_max_base * factor
    else:
        # 高速：显著衰减
        factor = 0.7 * (1.0 - speed_ratio) / 0.3
        factor = max(0.05, factor)  # 至少保留 5% 加速能力
        return a_max_base * factor
