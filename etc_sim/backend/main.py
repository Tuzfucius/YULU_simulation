"""
ETC 交通仿真系统 - FastAPI 后端
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from contextlib import asynccontextmanager
from os import getenv
import traceback
import uuid

from .api import configs, simulations, analysis, websocket, charts, environment, road_network, files, workflows, evaluation
from .api import code_execution, data_packets, custom_roads, prediction
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

# CORS 配置（支持环境变量 ALLOWED_ORIGINS，逗号分隔）
_DEFAULT_ORIGINS = "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173"
_ALLOWED_ORIGINS = getenv("ALLOWED_ORIGINS", _DEFAULT_ORIGINS).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _ALLOWED_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== 全局异常处理 ====================

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """请求参数验证失败"""
    return JSONResponse(
        status_code=422,
        content={
            "error": "validation_error",
            "detail": exc.errors(),
            "message": "请求参数验证失败",
        },
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局未处理异常捕获"""
    error_id = str(uuid.uuid4())[:8]
    logger.error(f"[{error_id}] Unhandled exception on {request.method} {request.url}: {exc}")
    logger.error(f"[{error_id}] {traceback.format_exc()}")
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_error",
            "error_id": error_id,
            "message": f"服务器内部错误 (参考ID: {error_id})",
        },
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
app.include_router(code_execution.router, prefix="/api/code", tags=["代码执行"])
app.include_router(data_packets.router, prefix="/api/packets", tags=["数据包管理"])
app.include_router(custom_roads.router, prefix="/api/custom-roads", tags=["自定义路径"])
app.include_router(prediction.router, prefix="/api", tags=["时序预测模型"])


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
