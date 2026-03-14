"""ETC Traffic Simulation FastAPI application."""

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
from .api import code_execution, custom_roads, data_packets, prediction
from .core.websocket_manager import WebSocketManager
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
    """?????????"""
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
    description="???????????? API",
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


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """?????????"""
    return JSONResponse(
        status_code=422,
        content={
            "error": "validation_error",
            "detail": exc.errors(),
            "message": "????????",
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """????????"""
    error_id = str(uuid.uuid4())[:8]
    logger.error("[%s] Unhandled exception on %s %s: %s", error_id, request.method, request.url, exc)
    logger.error("[%s] %s", error_id, traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_error",
            "error_id": error_id,
            "message": f"??????? (?? ID: {error_id})",
        },
    )


app.include_router(configs.router, prefix="/api/configs", tags=["????"])
app.include_router(simulations.router, prefix="/api/simulations", tags=["????"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["??"])
app.include_router(websocket.router, prefix="/api/ws", tags=["WebSocket"])
app.include_router(charts.router, prefix="/api/charts", tags=["????"])
app.include_router(environment.router, prefix="/api/environment", tags=["????"])
app.include_router(road_network.router, prefix="/api/road-network", tags=["????"])
app.include_router(files.router, prefix="/api/files", tags=["????"])
app.include_router(runs.router, prefix="/api/runs", tags=["????"])
app.include_router(workflows.router, prefix="/api/workflows", tags=["????"])
app.include_router(evaluation.router, prefix="/api/evaluation", tags=["????"])
app.include_router(code_execution.router, prefix="/api/code", tags=["????"])
app.include_router(data_packets.router, prefix="/api/packets", tags=["?????"])
app.include_router(custom_roads.router, prefix="/api/custom-roads", tags=["?????"])
app.include_router(prediction.router, prefix="/api", tags=["??????"])


@app.get("/")
async def root():
    """????"""
    return {
        "name": "ETC Traffic Simulation API",
        "version": "1.0.0",
        "docs": "/api/docs",
        "status": "running",
    }


@app.get("/health")
async def health_check():
    """?????"""
    return {"status": "healthy", "ws_connections": ws_manager.connection_count if ws_manager else 0}
