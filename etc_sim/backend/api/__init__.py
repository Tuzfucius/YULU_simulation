# API 路由包
from .configs import router as configs_router
from .simulations import router as simulations_router
from .analysis import router as analysis_router
from .websocket import router as websocket_router
from .charts import router as charts_router

__all__ = [
    "configs_router",
    "simulations_router", 
    "analysis_router",
    "websocket_router",
    "charts_router"
]

