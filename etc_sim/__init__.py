"""ETC Simulation Package.

基于 IDM 和 MOBIL 的交通流仿真系统。
"""

from .config.defaults import DEFAULT_CONFIG
from .config.parameters import SimulationConfig, load_config

__all__ = ["SimulationConfig", "load_config", "DEFAULT_CONFIG", "SimulationEngine"]


def __getattr__(name: str):
    """延迟加载重量级模块，避免包初始化时引入不必要依赖。"""

    if name == "SimulationEngine":
        from .simulation.engine import SimulationEngine

        return SimulationEngine
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
