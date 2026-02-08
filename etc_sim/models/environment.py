"""
环境影响模型
实现天气系统和道路坡度对车辆行为的影响

设计原则：
- 可扩展的环境因子接口
- 与 IDM/MOBIL 模型解耦
- 支持动态天气变化
"""

from dataclasses import dataclass, field
from typing import Dict, Optional, List, Tuple
from enum import Enum
import math


class WeatherType(Enum):
    """天气类型"""
    CLEAR = "clear"       # 晴天
    RAIN = "rain"         # 雨天
    SNOW = "snow"         # 雪天
    FOG = "fog"           # 雾天
    HEAVY_RAIN = "heavy_rain"  # 大雨


@dataclass
class WeatherEffect:
    """天气效果参数
    
    所有参数都是相对于晴天的倍率 (1.0 = 无变化)
    """
    speed_factor: float = 1.0       # 期望速度倍率
    headway_factor: float = 1.0     # 安全间隔倍率 (T)
    visibility_factor: float = 1.0  # 可视距离倍率
    politeness_factor: float = 1.0  # MOBIL 礼让因子倍率
    acceleration_factor: float = 1.0  # 最大加速度倍率
    
    name: str = "晴天"
    description: str = "正常驾驶条件"


# 预定义天气效果
WEATHER_PRESETS: Dict[WeatherType, WeatherEffect] = {
    WeatherType.CLEAR: WeatherEffect(
        speed_factor=1.0,
        headway_factor=1.0,
        visibility_factor=1.0,
        politeness_factor=1.0,
        acceleration_factor=1.0,
        name="晴天",
        description="标准驾驶条件"
    ),
    WeatherType.RAIN: WeatherEffect(
        speed_factor=0.8,
        headway_factor=1.4,
        visibility_factor=0.7,
        politeness_factor=1.1,
        acceleration_factor=0.9,
        name="雨天",
        description="路面湿滑，驾驶员更谨慎"
    ),
    WeatherType.SNOW: WeatherEffect(
        speed_factor=0.6,
        headway_factor=1.8,
        visibility_factor=0.5,
        politeness_factor=1.2,
        acceleration_factor=0.7,
        name="雪天",
        description="路面结冰，极端谨慎驾驶"
    ),
    WeatherType.FOG: WeatherEffect(
        speed_factor=0.7,
        headway_factor=1.6,
        visibility_factor=0.3,
        politeness_factor=1.3,
        acceleration_factor=0.85,
        name="雾天",
        description="能见度极低，需保持安全距离"
    ),
    WeatherType.HEAVY_RAIN: WeatherEffect(
        speed_factor=0.65,
        headway_factor=1.7,
        visibility_factor=0.4,
        politeness_factor=1.2,
        acceleration_factor=0.75,
        name="大雨",
        description="暴雨天气，严重影响视线和制动"
    ),
}


@dataclass
class GradientSegment:
    """道路坡度分段
    
    Attributes:
        start_km: 起始位置 (km)
        end_km: 结束位置 (km)
        gradient_percent: 坡度百分比 (+为上坡, -为下坡)
    """
    start_km: float
    end_km: float
    gradient_percent: float  # 正值上坡，负值下坡
    
    @property
    def slope_angle(self) -> float:
        """计算坡度角（弧度）"""
        return math.atan(self.gradient_percent / 100)
    
    def contains(self, position_km: float) -> bool:
        """判断位置是否在该分段内"""
        return self.start_km <= position_km < self.end_km


@dataclass 
class EnvironmentConfig:
    """环境配置
    
    Attributes:
        weather_type: 当前天气类型
        custom_weather: 自定义天气效果（如果提供则覆盖预设）
        gradient_segments: 道路坡度分段列表
        enabled: 是否启用环境影响
    """
    weather_type: WeatherType = WeatherType.CLEAR
    custom_weather: Optional[WeatherEffect] = None
    gradient_segments: List[GradientSegment] = field(default_factory=list)
    enabled: bool = True
    
    def to_dict(self) -> dict:
        return {
            'weather_type': self.weather_type.value,
            'enabled': self.enabled,
            'gradient_segments': [
                {'start_km': s.start_km, 'end_km': s.end_km, 'gradient': s.gradient_percent}
                for s in self.gradient_segments
            ]
        }


class EnvironmentModel:
    """环境影响模型
    
    计算天气和坡度对车辆行为参数的修正。
    
    使用示例:
        env = EnvironmentModel()
        env.set_weather(WeatherType.RAIN)
        env.add_gradient_segment(10.0, 12.0, 5.0)  # 10-12km 处 5% 上坡
        
        # 获取修正后的参数
        v0_adjusted = env.get_adjusted_speed(vehicle, base_v0)
        T_adjusted = env.get_adjusted_headway(vehicle, base_T)
        accel_adj = env.get_gradient_acceleration_adjust(vehicle)
    """
    
    # 物理常数
    GRAVITY = 9.81  # m/s^2
    
    # 车型质量因子（相对于小汽车）
    MASS_FACTORS = {
        'car': 1.0,
        'sedan': 1.0,
        'suv': 1.3,
        'truck': 2.5,
        'bus': 2.2,
    }
    
    def __init__(self, config: EnvironmentConfig = None):
        self.config = config or EnvironmentConfig()
        self._weather_effect = self._get_current_weather_effect()
    
    def _get_current_weather_effect(self) -> WeatherEffect:
        """获取当前天气效果"""
        if self.config.custom_weather:
            return self.config.custom_weather
        return WEATHER_PRESETS.get(self.config.weather_type, WEATHER_PRESETS[WeatherType.CLEAR])
    
    def set_weather(self, weather_type: WeatherType):
        """设置天气类型"""
        self.config.weather_type = weather_type
        self._weather_effect = self._get_current_weather_effect()
    
    def set_custom_weather(self, weather_effect: WeatherEffect):
        """设置自定义天气效果"""
        self.config.custom_weather = weather_effect
        self._weather_effect = weather_effect
    
    def add_gradient_segment(self, start_km: float, end_km: float, gradient_percent: float):
        """添加坡度分段"""
        segment = GradientSegment(start_km, end_km, gradient_percent)
        self.config.gradient_segments.append(segment)
    
    def clear_gradients(self):
        """清除所有坡度分段"""
        self.config.gradient_segments.clear()
    
    # ==================== 天气影响 ====================
    
    def get_adjusted_speed(self, vehicle_type: str, base_speed: float) -> float:
        """获取天气调整后的期望速度
        
        Args:
            vehicle_type: 车辆类型
            base_speed: 基础期望速度 (m/s)
            
        Returns:
            调整后的期望速度 (m/s)
        """
        if not self.config.enabled:
            return base_speed
        
        return base_speed * self._weather_effect.speed_factor
    
    def get_adjusted_headway(self, vehicle_type: str, base_headway: float) -> float:
        """获取天气调整后的安全时间间隔
        
        Args:
            vehicle_type: 车辆类型
            base_headway: 基础安全间隔 T (s)
            
        Returns:
            调整后的安全间隔 (s)
        """
        if not self.config.enabled:
            return base_headway
        
        # 货车在恶劣天气下更谨慎
        extra_factor = 1.0
        if vehicle_type in ('truck', 'bus') and self._weather_effect.headway_factor > 1.0:
            extra_factor = 1.1
        
        return base_headway * self._weather_effect.headway_factor * extra_factor
    
    def get_adjusted_visibility(self, base_visibility: float = 300.0) -> float:
        """获取天气调整后的可视距离
        
        Args:
            base_visibility: 基础可视距离 (m)
            
        Returns:
            调整后的可视距离 (m)
        """
        if not self.config.enabled:
            return base_visibility
        
        return base_visibility * self._weather_effect.visibility_factor
    
    def get_adjusted_acceleration(self, vehicle_type: str, base_accel: float) -> float:
        """获取天气调整后的最大加速度
        
        Args:
            vehicle_type: 车辆类型
            base_accel: 基础最大加速度 (m/s^2)
            
        Returns:
            调整后的最大加速度 (m/s^2)
        """
        if not self.config.enabled:
            return base_accel
        
        return base_accel * self._weather_effect.acceleration_factor
    
    # ==================== 坡度影响 ====================
    
    def get_gradient_at(self, position_km: float) -> float:
        """获取指定位置的坡度
        
        Args:
            position_km: 位置 (km)
            
        Returns:
            坡度百分比 (+上坡, -下坡)
        """
        for segment in self.config.gradient_segments:
            if segment.contains(position_km):
                return segment.gradient_percent
        return 0.0  # 默认平路
    
    def get_gradient_acceleration_adjust(self, position_km: float, 
                                         vehicle_type: str = 'car') -> float:
        """计算坡度对加速度的影响
        
        基于物理公式: a_adjust = -g * sin(θ) * mass_factor
        
        Args:
            position_km: 车辆位置 (km)
            vehicle_type: 车辆类型
            
        Returns:
            加速度调整量 (m/s^2)，负值表示减速效果
        """
        if not self.config.enabled:
            return 0.0
        
        gradient = self.get_gradient_at(position_km)
        if abs(gradient) < 0.1:  # 忽略极小坡度
            return 0.0
        
        # 计算坡度角
        slope_angle = math.atan(gradient / 100)
        
        # 获取质量因子
        mass_factor = self.MASS_FACTORS.get(vehicle_type, 1.0)
        
        # 物理公式：a = -g * sin(θ) * mass_factor
        # 质量更大的车在上坡时减速更明显
        accel_adjust = -self.GRAVITY * math.sin(slope_angle) * mass_factor
        
        return accel_adjust
    
    def get_safe_downhill_speed(self, position_km: float, 
                                vehicle_type: str = 'car',
                                base_max_speed: float = 120.0) -> float:
        """获取下坡时的安全速度限制
        
        货车下坡时需要限速以保证制动安全
        
        Args:
            position_km: 车辆位置 (km)
            vehicle_type: 车辆类型
            base_max_speed: 基础最高速度 (km/h)
            
        Returns:
            安全速度限制 (km/h)
        """
        gradient = self.get_gradient_at(position_km)
        
        if gradient >= 0:  # 不是下坡
            return base_max_speed
        
        # 下坡坡度（取绝对值）
        downhill_percent = abs(gradient)
        
        # 货车在陡坡下需要更严格的限速
        if vehicle_type in ('truck', 'bus'):
            if downhill_percent > 5:
                return base_max_speed * 0.6  # 陡坡重载限速 60%
            elif downhill_percent > 3:
                return base_max_speed * 0.75  # 中坡限速 75%
            elif downhill_percent > 1:
                return base_max_speed * 0.9  # 缓坡限速 90%
        
        return base_max_speed
    
    # ==================== 综合修正 ====================
    
    def get_all_adjustments(self, position_km: float, vehicle_type: str = 'car',
                           base_params: dict = None) -> dict:
        """获取所有环境调整参数
        
        Args:
            position_km: 车辆位置 (km)
            vehicle_type: 车辆类型
            base_params: 基础参数 {'v0': ..., 'T': ..., 'a': ...}
            
        Returns:
            调整后的参数字典
        """
        base = base_params or {'v0': 33.33, 'T': 1.6, 'a': 1.5, 'visibility': 300}
        
        return {
            'v0': self.get_adjusted_speed(vehicle_type, base['v0']),
            'T': self.get_adjusted_headway(vehicle_type, base['T']),
            'a': self.get_adjusted_acceleration(vehicle_type, base['a']),
            'visibility': self.get_adjusted_visibility(base.get('visibility', 300)),
            'gradient_accel': self.get_gradient_acceleration_adjust(position_km, vehicle_type),
            'weather': self._weather_effect.name,
            'gradient': self.get_gradient_at(position_km),
        }
    
    def get_status(self) -> dict:
        """获取当前环境状态"""
        return {
            'enabled': self.config.enabled,
            'weather_type': self.config.weather_type.value,
            'weather_name': self._weather_effect.name,
            'weather_description': self._weather_effect.description,
            'speed_factor': self._weather_effect.speed_factor,
            'headway_factor': self._weather_effect.headway_factor,
            'visibility_factor': self._weather_effect.visibility_factor,
            'gradient_segments': len(self.config.gradient_segments),
        }
