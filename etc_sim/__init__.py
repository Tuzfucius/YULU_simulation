"""
ETC Simulation Package
基于IDM和MOBIL的交通流仿真系统
"""

import sys
from pathlib import Path

# 确保当前包在路径中
_package_path = Path(__file__).parent.resolve()
if str(_package_path) not in sys.path:
    sys.path.insert(0, str(_package_path))

from .config.parameters import SimulationConfig, load_config
from .config.defaults import DEFAULT_CONFIG
from .simulation.engine import SimulationEngine

__all__ = [
    'SimulationConfig',
    'load_config',
    'DEFAULT_CONFIG',
    'SimulationEngine',
]
