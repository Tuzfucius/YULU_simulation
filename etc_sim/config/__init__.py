"""
配置模块
支持JSON配置加载和参数管理
"""

from .parameters import SimulationConfig, load_config
from .colors import COLORS

__all__ = [
    'SimulationConfig',
    'load_config',
    'COLORS',
]
