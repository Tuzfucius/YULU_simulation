"""
WebSocket 路由
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
import logging

# 引用 main 中的 ws_manager
# 注意：这需要 main.py 正确初始化 ws_manager 并将其暴露，或者使用依赖注入
# 由于循环导入问题，我们将在端点内部获取 ws_manager 实例，但这通常通过 Depends 或全局变量解决
# 这里假设 main.py 会在 startup 时将 ws_manager 注入到 app.state 或 globals

router = APIRouter()
logger = logging.getLogger(__name__)


@router.websocket("/simulation")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket 仿真端点 (旧接口兼容)"""
    # 尝试从 app.state 获取 manager
    ws_manager = getattr(websocket.app.state, "ws_manager", None)
    
    if ws_manager is None:
        # 如果未找到，尝试从全局变量（不推荐但兼容旧代码结构）
        from ..main import ws_manager as global_manager
        ws_manager = global_manager
    
    if ws_manager is None:
        logger.error("WebSocket Manager not initialized")
        await websocket.close(code=1011)
        return
    
    await ws_manager.handle_connection(websocket)


@router.websocket("/simulation/{session_id}")
async def websocket_session_endpoint(websocket: WebSocket, session_id: str):
    """带会话 ID 的 WebSocket 端点"""
    ws_manager = getattr(websocket.app.state, "ws_manager", None)
    
    if ws_manager is None:
         from ..main import ws_manager as global_manager
         ws_manager = global_manager
            
    if ws_manager is None:
        logger.error("WebSocket Manager not initialized")
        await websocket.close(code=1011)
        return
    
    await ws_manager.handle_session(websocket, session_id)


# 测试页面 (保留用于调试)
WS_TEST_HTML = """
<!DOCTYPE html>
<html>
<head>
    <title>WebSocket Test</title>
    <style>
        body { font-family: Arial; padding: 20px; }
        #messages { border: 1px solid #ccc; padding: 10px; height: 300px; overflow-y: scroll; }
        .log { margin: 5px 0; padding: 5px; }
        .info { background: #e3f2fd; }
        .progress { background: #fff3e0; }
        .snapshot { background: #e8f5e9; }
        .error { background: #ffebee; }
    </style>
</head>
<body>
    <h1>WebSocket 仿真测试</h1>
    <button onclick="connect()">连接</button>
    <button onclick="sendInit()">初始化</button>
    <button onclick="sendStart()">开始仿真</button>
    <button onclick="sendPause()">暂停</button>
    <button onclick="sendResume()">继续</button>
    <button onclick="sendStop()">停止</button>
    <button onclick="clearLog()">清除日志</button>
    
    <h3>消息日志</h3>
    <div id="messages"></div>
    
    <script>
        let ws = null;
        
        function connect() {
            ws = new WebSocket('ws://' + window.location.host + '/api/ws/simulation/test_session');
            
            ws.onopen = () => {
                log('Connected', 'info');
            };
            
            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'PROGRESS') {
                    log(`Progress: ${data.payload?.progress.toFixed(1)}% | ETA: ${data.payload?.eta?.toFixed(1)}m`, 'progress');
                } else if (data.type === 'SNAPSHOT') {
                    // ignore large payloads log
                } else {
                    log(`Received: ${data.type}`, 'info');
                }
            };
            
            ws.onclose = () => log('Disconnected', 'error');
            ws.onerror = (e) => log('Error: ' + e, 'error');
        }
        
        function sendInit() {
            ws.send(JSON.stringify({
                type: 'INIT',
                config: { max_simulation_time: 3600, simulation_dt: 0.5, totalVehicles: 500 }
            }));
        }
        
        function sendStart() {
            ws.send(JSON.stringify({ type: 'START' }));
        }
        
        function sendPause() {
            ws.send(JSON.stringify({ type: 'PAUSE' }));
        }
        
        function sendResume() {
            ws.send(JSON.stringify({ type: 'RESUME' }));
        }
        
        function sendStop() {
            ws.send(JSON.stringify({ type: 'STOP' }));
        }
        
        function log(msg, type = 'info') {
            const div = document.createElement('div');
            div.className = 'log ' + type;
            div.textContent = msg;
            document.getElementById('messages').appendChild(div);
            div.scrollIntoView();
        }
        
        function clearLog() {
            document.getElementById('messages').innerHTML = '';
        }
    </script>
</body>
</html>
"""


@router.get("/test")
async def websocket_test_page() -> HTMLResponse:
    """WebSocket 测试页面"""
    return HTMLResponse(WS_TEST_HTML)
