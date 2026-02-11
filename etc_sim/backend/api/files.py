"""
文件管理与脚本执行 API

功能：
- 列出 output 目录下的历史数据文件
- 列出/保存/读取 scripts 目录下的预警脚本
- 执行 Python 脚本（沙箱）
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pathlib import Path
from typing import Optional
import os
import sys
import json
import subprocess
import tempfile
import datetime
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

# 项目根目录
PROJECT_ROOT = Path(__file__).resolve().parents[2]  # etc_sim 的上一级
OUTPUT_DIR = PROJECT_ROOT / "output"
SCRIPTS_DIR = PROJECT_ROOT / "etc_sim" / "scripts"


# ============================================
# 历史数据文件浏览
# ============================================

def _scan_files(directory: Path, extensions: set = None) -> list:
    """递归扫描目录，返回文件信息列表"""
    results = []
    if not directory.exists():
        return results
    
    for item in sorted(directory.rglob("*")):
        if item.is_file():
            if extensions and item.suffix.lower() not in extensions:
                continue
            try:
                stat = item.stat()
                results.append({
                    "name": item.name,
                    "path": str(item.relative_to(directory)),
                    "size": stat.st_size,
                    "modified": datetime.datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "extension": item.suffix.lower(),
                })
            except Exception:
                pass
    return results


def _scan_tree(directory: Path) -> list:
    """扫描目录树结构"""
    result = []
    if not directory.exists():
        return result
    
    for item in sorted(directory.iterdir()):
        node = {
            "name": item.name,
            "path": str(item.relative_to(directory)),
            "isDir": item.is_dir(),
        }
        if item.is_dir():
            node["children"] = _scan_tree(item)
        else:
            try:
                stat = item.stat()
                node["size"] = stat.st_size
                node["modified"] = datetime.datetime.fromtimestamp(stat.st_mtime).isoformat()
            except Exception:
                pass
        result.append(node)
    return result


@router.get("/output-files")
async def list_output_files():
    """列出 output 目录下的所有数据文件，JSON 文件附带参数摘要"""
    files = _scan_files(OUTPUT_DIR, extensions={".csv", ".json"})
    
    # 对 JSON 文件尝试提取仿真参数摘要
    for f in files:
        if f["extension"] == ".json":
            try:
                fpath = OUTPUT_DIR / f["path"]
                with open(fpath, "r", encoding="utf-8") as fp:
                    # 只读前 2000 字符快速提取
                    head = fp.read(2000)
                data = json.loads(head if head.rstrip().endswith('}') else head + ']}')
            except Exception:
                try:
                    data = json.loads((OUTPUT_DIR / f["path"]).read_text(encoding="utf-8"))
                except Exception:
                    data = {}
            
            meta = {}
            # 从 metadata 或 config 或 statistics 中提取关键参数
            cfg = data.get("metadata", {}).get("config", data.get("config", {}))
            stats = data.get("statistics", data.get("metadata", {}).get("statistics", {}))
            
            if cfg:
                if "totalVehicles" in cfg or "total_vehicles" in cfg:
                    meta["vehicles"] = cfg.get("totalVehicles", cfg.get("total_vehicles"))
                if "numLanes" in cfg or "num_lanes" in cfg:
                    meta["lanes"] = cfg.get("numLanes", cfg.get("num_lanes"))
                if "roadLength" in cfg or "road_length" in cfg:
                    meta["road_km"] = round((cfg.get("roadLength", cfg.get("road_length", 0))) / 1000, 1)
                if "simulationTime" in cfg or "simulation_time" in cfg:
                    meta["sim_time"] = cfg.get("simulationTime", cfg.get("simulation_time"))
            
            if stats:
                if "avgSpeed" in stats:
                    meta["avg_speed"] = round(stats["avgSpeed"], 1)
                if "totalAnomalies" in stats:
                    meta["anomalies"] = stats["totalAnomalies"]
            
            if data.get("metadata", {}).get("exported_at"):
                meta["exported_at"] = data["metadata"]["exported_at"]
            
            f["meta"] = meta
    
    return {"dir": str(OUTPUT_DIR), "files": files}


@router.get("/output-file")
async def read_output_file(path: str):
    """读取 output 目录下的指定文件内容"""
    target = (OUTPUT_DIR / path).resolve()
    # 安全检查
    if not str(target).startswith(str(OUTPUT_DIR)):
        raise HTTPException(400, "路径越界")
    if not target.exists():
        raise HTTPException(404, "文件不存在")
    
    content = target.read_text(encoding="utf-8")
    
    if target.suffix.lower() == ".json":
        try:
            return {"type": "json", "data": json.loads(content)}
        except json.JSONDecodeError:
            return {"type": "text", "data": content}
    else:
        return {"type": "text", "data": content}


# ============================================
# 脚本管理
# ============================================

@router.get("/scripts/tree")
async def get_scripts_tree():
    """获取 scripts 目录树"""
    SCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
    tree = _scan_tree(SCRIPTS_DIR)
    return {"dir": str(SCRIPTS_DIR), "tree": tree}


@router.get("/scripts/list")
async def list_scripts():
    """列出所有 .py 脚本"""
    SCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
    files = _scan_files(SCRIPTS_DIR, extensions={".py"})
    return {"dir": str(SCRIPTS_DIR), "files": files}


@router.get("/scripts/read")
async def read_script(path: str):
    """读取脚本内容"""
    target = (SCRIPTS_DIR / path).resolve()
    if not str(target).startswith(str(SCRIPTS_DIR)):
        raise HTTPException(400, "路径越界")
    if not target.exists():
        raise HTTPException(404, "脚本不存在")
    return {"path": path, "content": target.read_text(encoding="utf-8")}


class SaveScriptRequest(BaseModel):
    path: str
    content: str


@router.post("/scripts/save")
async def save_script(req: SaveScriptRequest):
    """保存脚本"""
    target = (SCRIPTS_DIR / req.path).resolve()
    if not str(target).startswith(str(SCRIPTS_DIR)):
        raise HTTPException(400, "路径越界")
    
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(req.content, encoding="utf-8")
    logger.info(f"Script saved: {target}")
    return {"status": "ok", "path": str(target)}


class RunScriptRequest(BaseModel):
    code: str
    timeout: int = 10


@router.post("/scripts/run")
async def run_script(req: RunScriptRequest):
    """
    在子进程中执行 Python 脚本（沙箱）
    
    脚本可使用预注入的 ETCGateData 工具类读取门架数据。
    """
    # 构建完整脚本（注入工具库）
    full_script = f'''
import sys, os, json, csv
from pathlib import Path

# 预注入路径
OUTPUT_DIR = r"{str(OUTPUT_DIR)}"

class ETCGateData:
    """ETC 门架数据读取工具"""
    
    def __init__(self, output_dir=OUTPUT_DIR):
        self.output_dir = Path(output_dir)
    
    def list_files(self, ext=".csv"):
        """列出所有数据文件"""
        return [str(f.relative_to(self.output_dir)) for f in self.output_dir.rglob(f"*{{ext}}")]
    
    def read_csv(self, path):
        """读取 CSV 文件为字典列表"""
        full = self.output_dir / path
        if not full.exists():
            return []
        with open(full, "r", encoding="utf-8") as f:
            return list(csv.DictReader(f))
    
    def read_json(self, path):
        """读取 JSON 文件"""
        full = self.output_dir / path
        if not full.exists():
            return None
        with open(full, "r", encoding="utf-8") as f:
            return json.load(f)

# 实例化
gate_data = ETCGateData()

# ===== 用户脚本开始 =====
{req.code}
'''
    
    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False, encoding="utf-8") as tmp:
            tmp.write(full_script)
            tmp_path = tmp.name
        
        result = subprocess.run(
            [sys.executable if hasattr(sys, 'executable') else "python", tmp_path],
            capture_output=True,
            text=True,
            timeout=req.timeout,
            cwd=str(PROJECT_ROOT),
        )
        
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": f"⏰ 脚本执行超时 ({req.timeout}s)", "returncode": -1}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "returncode": -1}
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

