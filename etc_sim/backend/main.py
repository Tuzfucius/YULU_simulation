"""
ETC 交通仿真系统 - FastAPI 后端
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .api import configs, simulations, analysis, websocket, charts, environment, road_network, files, workflows, evaluation
from .core.websocket_manager import WebSocketManager
from .services.storage import StorageService
import logging

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 全局管理器实例
ws_manager: WebSocketManager = None
storage_service: StorageService = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    global ws_manager, storage_service
    
    # 启动时初始化
    logger.info("Starting ETC Traffic Simulation Backend...")
    
    # 初始化存储服务
    storage_service = StorageService()
    
    # 初始化 WebSocket 管理器
    ws_manager = WebSocketManager(storage_service)
    app.state.ws_manager = ws_manager
    
    logger.info("Backend initialized successfully")
    
    yield
    
    # 关闭时清理
    logger.info("Shutting down backend...")
    if ws_manager:
        await ws_manager.shutdown()
    logger.info("Backend shutdown complete")


app = FastAPI(
    title="ETC Traffic Simulation API",
    description="高速公路交通仿真系统后端 API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(configs.router, prefix="/api/configs", tags=["配置管理"])
app.include_router(simulations.router, prefix="/api/simulations", tags=["仿真管理"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["分析"])
app.include_router(websocket.router, prefix="/api/ws", tags=["WebSocket"])
app.include_router(charts.router, prefix="/api/charts", tags=["图表管理"])
app.include_router(environment.router, prefix="/api/environment", tags=["环境配置"])
app.include_router(road_network.router, prefix="/api/road-network", tags=["路网配置"])
app.include_router(files.router, prefix="/api/files", tags=["文件管理"])
app.include_router(workflows.router, prefix="/api/workflows", tags=["预警规则"])
app.include_router(evaluation.router, prefix="/api/evaluation", tags=["评估系统"])


@app.get("/")
async def root():
    """API 根路径"""
    return {
        "name": "ETC Traffic Simulation API",
        "version": "1.0.0",
        "docs": "/api/docs",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy", "ws_connections": ws_manager.connection_count if ws_manager else 0}
