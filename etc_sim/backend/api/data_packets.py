"""
预警数据包管理 API
提供数据包的 CRUD 操作和基于用户代码的评判功能。
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
import json
import glob
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

# 数据包存储目录
PACKETS_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'packets')
os.makedirs(PACKETS_DIR, exist_ok=True)


class PacketSummary(BaseModel):
    packet_id: str
    session_id: str = ''
    created_at: str = ''
    duration_s: float = 0
    alert_count: int = 0
    truth_count: int = 0
    severity_counts: Dict[str, int] = {}
    avg_speed_kmh: float = 0
    weather: str = 'clear'


class EvaluateWithCodeRequest(BaseModel):
    code: str
    environment: str = 'base'


# ==================== 内部工具 ====================

def _load_packet(packet_id: str) -> dict:
    """加载指定数据包"""
    filepath = os.path.join(PACKETS_DIR, f"packet_{packet_id}.json")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail=f"数据包 {packet_id} 不存在")
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def _list_all_packets() -> List[dict]:
    """列出所有数据包摘要"""
    pattern = os.path.join(PACKETS_DIR, "packet_*.json")
    summaries = []
    for filepath in sorted(glob.glob(pattern), reverse=True):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            alerts = data.get('alerts', [])
            severity_counts = {}
            for a in alerts:
                sev = a.get('severity', 'medium')
                severity_counts[sev] = severity_counts.get(sev, 0) + 1
            
            summaries.append({
                'packet_id': data.get('packet_id', ''),
                'session_id': data.get('session_id', ''),
                'created_at': data.get('created_at', ''),
                'duration_s': data.get('duration_s', 0),
                'alert_count': len(alerts),
                'truth_count': len(data.get('ground_truths', [])),
                'severity_counts': severity_counts,
                'avg_speed_kmh': data.get('snapshot', {}).get('avg_speed_kmh', 0),
                'weather': data.get('snapshot', {}).get('weather', 'clear'),
            })
        except Exception as e:
            logger.warning(f"读取数据包失败 {filepath}: {e}")
    return summaries


# ==================== API ====================

@router.get("/", response_model=List[PacketSummary])
async def list_packets():
    """列出所有预警数据包摘要"""
    return _list_all_packets()


@router.get("/{packet_id}")
async def get_packet(packet_id: str):
    """获取指定数据包完整内容"""
    data = _load_packet(packet_id)
    return {"success": True, "data": data}


@router.delete("/{packet_id}")
async def delete_packet(packet_id: str):
    """删除指定数据包"""
    filepath = os.path.join(PACKETS_DIR, f"packet_{packet_id}.json")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail=f"数据包 {packet_id} 不存在")
    os.remove(filepath)
    return {"success": True, "message": f"数据包 {packet_id} 已删除"}


@router.post("/{packet_id}/evaluate")
async def evaluate_packet_with_code(packet_id: str, request: EvaluateWithCodeRequest):
    """使用用户代码对数据包进行评估
    
    用户代码可以访问 `alert_data` 变量，即完整的数据包字典。
    代码的标准输出将作为评估结果返回。
    """
    packet_data = _load_packet(packet_id)
    
    # 复用 code_execution 模块的执行逻辑
    from .code_execution import _get_conda_activate_cmd, _run_process, MAX_OUTPUT_LENGTH
    import tempfile
    import time

    start_time = time.time()

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".py", delete=False, encoding="utf-8"
    ) as f:
        f.write(f"import json\nalert_data = json.loads('''{json.dumps(packet_data, ensure_ascii=False)}''')\n\n")
        f.write("# === 用户评估代码 ===\n")
        f.write(request.code)
        f.write("\n")
        script_path = f.name

    try:
        activate = _get_conda_activate_cmd(request.environment)
        cmd = f'{activate}python "{script_path}"'
        stdout, stderr, rc = await _run_process(cmd, timeout=30)

        if len(stdout) > MAX_OUTPUT_LENGTH:
            stdout = stdout[:MAX_OUTPUT_LENGTH] + "\n... [已截断]"

        elapsed = time.time() - start_time

        return {
            "success": rc == 0,
            "output": stdout,
            "error": stderr if rc != 0 else "",
            "execution_time": round(elapsed, 3),
        }
    finally:
        try:
            os.unlink(script_path)
        except OSError:
            pass


@router.post("/store")
async def store_packet(data: Dict[str, Any]):
    """手动存储一个数据包（通常由仿真完成后自动调用）"""
    from ..models_import import AlertDataPacket   # 避免循环导入

    try:
        packet = AlertDataPacket.from_dict(data)
        filepath = packet.save(PACKETS_DIR)
        return {
            "success": True,
            "packet_id": packet.packet_id,
            "filepath": filepath,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"数据包格式错误: {e}")
