"""ETC traffic simulation FastAPI application."""

from contextlib import asynccontextmanager
from os import getenv
import logging
import traceback
import uuid
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api import analysis, charts, configs, environment, evaluation, files, road_network, runs, simulations, websocket, workflows
from .api import custom_roads, data_packets, prediction
from .core.websocket_manager import WebSocketManager
from .security import is_unsafe_relative_path
from .services.storage import StorageService


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

ws_manager: Optional[WebSocketManager] = None
storage_service: Optional[StorageService] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize and release application-wide services."""
    global ws_manager, storage_service

    logger.info("Starting ETC Traffic Simulation Backend...")
    storage_service = StorageService()
    ws_manager = WebSocketManager(storage_service)
    app.state.ws_manager = ws_manager

    logger.info("Backend initialized successfully")
    yield

    logger.info("Shutting down backend...")
    if ws_manager:
        await ws_manager.shutdown()
    logger.info("Backend shutdown complete")


app = FastAPI(
    title="ETC Traffic Simulation API",
    description="高速公路 ETC 车流仿真、预警与分析 API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

_default_origins = "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173"
_allowed_origins = getenv("ALLOWED_ORIGINS", _default_origins).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in _allowed_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# The legacy files router included host-level Python execution and script
# mutation endpoints. Remove the complete scripts namespace before mounting the
# router. File browsing and historical replay compatibility remain available.
_removed_script_routes = [
    route
    for route in files.router.routes
    if str(getattr(route, "path", "")).startswith("/scripts")
]
files.router.routes[:] = [
    route
    for route in files.router.routes
    if not str(getattr(route, "path", "")).startswith("/scripts")
]
if _removed_script_routes:
    logger.warning(
        "Disabled %d unsafe legacy script routes",
        len(_removed_script_routes),
    )


@app.middleware("http")
async def security_baseline_middleware(request: Request, call_next):
    """Block retired execution APIs and obvious path traversal attempts."""
    request_path = request.url.path.rstrip("/")

    if request_path == "/api/code" or request_path.startswith("/api/code/"):
        return JSONResponse(status_code=404, content={"detail": "Not found"})

    if request_path == "/api/files/scripts" or request_path.startswith("/api/files/scripts/"):
        return JSONResponse(status_code=404, content={"detail": "Not found"})

    if request_path.startswith("/api/files"):
        for key, value in request.query_params.multi_items():
            if key in {"path", "sim_run_dir"} and is_unsafe_relative_path(value):
                return JSONResponse(
                    status_code=400,
                    content={"detail": "非法文件路径"},
                )

    return await call_next(request)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Return a stable response for request validation failures."""
    return JSONResponse(
        status_code=422,
        content={
            "error": "validation_error",
            "detail": exc.errors(),
            "message": "请求参数校验失败",
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Log unhandled exceptions without exposing internal tracebacks."""
    error_id = str(uuid.uuid4())[:8]
    logger.error(
        "[%s] Unhandled exception on %s %s: %s",
        error_id,
        request.method,
        request.url,
        exc,
    )
    logger.error("[%s] %s", error_id, traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_error",
            "error_id": error_id,
            "message": f"服务器内部错误（错误 ID：{error_id}）",
        },
    )


app.include_router(configs.router, prefix="/api/configs", tags=["配置"])
app.include_router(simulations.router, prefix="/api/simulations", tags=["仿真"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["分析"])
app.include_router(websocket.router, prefix="/api/ws", tags=["WebSocket"])
app.include_router(charts.router, prefix="/api/charts", tags=["图表"])
app.include_router(environment.router, prefix="/api/environment", tags=["环境"])
app.include_router(road_network.router, prefix="/api/road-network", tags=["路网"])
app.include_router(files.router, prefix="/api/files", tags=["文件"])
app.include_router(runs.router, prefix="/api/runs", tags=["运行记录"])
app.include_router(workflows.router, prefix="/api/workflows", tags=["工作流"])
app.include_router(evaluation.router, prefix="/api/evaluation", tags=["评估"])
app.include_router(data_packets.router, prefix="/api/packets", tags=["数据包"])
app.include_router(custom_roads.router, prefix="/api/custom-roads", tags=["自定义路网"])
app.include_router(prediction.router, prefix="/api", tags=["预测"])


@app.get("/")
async def root():
    """Return service metadata."""
    return {
        "name": "ETC Traffic Simulation API",
        "version": "1.0.0",
        "docs": "/api/docs",
        "status": "running",
    }


@app.get("/health")
async def health_check():
    """Return backend health and active WebSocket connection count."""
    return {
        "status": "healthy",
        "ws_connections": ws_manager.connection_count if ws_manager else 0,
    }
