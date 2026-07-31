"""WebSocket routes for simulation sessions."""

import logging

from fastapi import APIRouter, WebSocket


router = APIRouter()
logger = logging.getLogger(__name__)


@router.websocket("/simulation/{session_id}")
async def websocket_session_endpoint(websocket: WebSocket, session_id: str):
    """The only WebSocket entrypoint for an isolated simulation session."""
    manager = getattr(websocket.app.state, "ws_manager", None)
    if manager is None:
        logger.error("WebSocket manager not initialized")
        await websocket.close(code=1011)
        return
    await manager.handle_session(websocket, session_id)
