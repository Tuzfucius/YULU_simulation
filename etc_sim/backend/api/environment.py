"""
环境配置 API
提供天气系统和道路坡度的配置接口
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum


router = APIRouter()


class WeatherType(str, Enum):
    CLEAR = "clear"
    RAIN = "rain"
    SNOW = "snow"
    FOG = "fog"
    HEAVY_RAIN = "heavy_rain"


class GradientSegment(BaseModel):
    start_km: float = Field(..., ge=0, description="起始位置 (km)")
    end_km: float = Field(..., gt=0, description="结束位置 (km)")
    gradient_percent: float = Field(..., ge=-15, le=15, description="坡度百分比")


class EnvironmentConfig(BaseModel):
    weather_type: WeatherType = WeatherType.CLEAR
    enabled: bool = True
    gradient_segments: List[GradientSegment] = []


class EnvironmentStatus(BaseModel):
    enabled: bool
    weather_type: str
    weather_name: str
    weather_description: str
    speed_factor: float
    headway_factor: float
    visibility_factor: float
    gradient_segments: int


# 预定义天气效果
WEATHER_PRESETS = {
    WeatherType.CLEAR: {
        "name": "晴天",
        "description": "标准驾驶条件",
        "speed_factor": 1.0,
        "headway_factor": 1.0,
        "visibility_factor": 1.0
    },
    WeatherType.RAIN: {
        "name": "雨天",
        "description": "路面湿滑，驾驶员更谨慎",
        "speed_factor": 0.8,
        "headway_factor": 1.4,
        "visibility_factor": 0.7
    },
    WeatherType.SNOW: {
        "name": "雪天",
        "description": "路面结冰，极端谨慎驾驶",
        "speed_factor": 0.6,
        "headway_factor": 1.8,
        "visibility_factor": 0.5
    },
    WeatherType.FOG: {
        "name": "雾天",
        "description": "能见度极低，需保持安全距离",
        "speed_factor": 0.7,
        "headway_factor": 1.6,
        "visibility_factor": 0.3
    },
    WeatherType.HEAVY_RAIN: {
        "name": "大雨",
        "description": "暴雨天气，严重影响视线和制动",
        "speed_factor": 0.65,
        "headway_factor": 1.7,
        "visibility_factor": 0.4
    }
}

# 内存存储当前配置
_current_config = EnvironmentConfig()


@router.get("", response_model=EnvironmentStatus)
async def get_environment_status() -> EnvironmentStatus:
    """获取当前环境配置状态"""
    preset = WEATHER_PRESETS.get(_current_config.weather_type, WEATHER_PRESETS[WeatherType.CLEAR])
    
    return EnvironmentStatus(
        enabled=_current_config.enabled,
        weather_type=_current_config.weather_type.value,
        weather_name=preset["name"],
        weather_description=preset["description"],
        speed_factor=preset["speed_factor"],
        headway_factor=preset["headway_factor"],
        visibility_factor=preset["visibility_factor"],
        gradient_segments=len(_current_config.gradient_segments)
    )


@router.put("", response_model=EnvironmentConfig)
async def update_environment(config: EnvironmentConfig) -> EnvironmentConfig:
    """更新环境配置"""
    global _current_config
    _current_config = config
    return _current_config


@router.get("/weather-types")
async def get_weather_types() -> List[dict]:
    """获取所有可用天气类型"""
    return [
        {
            "type": wt.value,
            "name": WEATHER_PRESETS[wt]["name"],
            "description": WEATHER_PRESETS[wt]["description"],
            "speed_factor": WEATHER_PRESETS[wt]["speed_factor"],
            "headway_factor": WEATHER_PRESETS[wt]["headway_factor"]
        }
        for wt in WeatherType
    ]


@router.post("/gradients", response_model=EnvironmentConfig)
async def add_gradient_segment(segment: GradientSegment) -> EnvironmentConfig:
    """添加坡度分段"""
    global _current_config
    _current_config.gradient_segments.append(segment)
    return _current_config


@router.delete("/gradients", response_model=EnvironmentConfig)
async def clear_gradient_segments() -> EnvironmentConfig:
    """清除所有坡度分段"""
    global _current_config
    _current_config.gradient_segments = []
    return _current_config
