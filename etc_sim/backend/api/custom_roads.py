"""
自定义路径管理 API
提供自定义轨迹的增删改查功能
"""

import os
import json
import logging
from enum import Enum
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from pathlib import Path

# 配置日志
logger = logging.getLogger(__name__)

router = APIRouter()

#由于项目结构原因，我们需要定位到 output/road_map 目录
# 假设 backend 在 etc_sim/backend，那么向上两级是 etc_sim，再平级是 output
# 需要根据实际部署路径调整，这里使用相对路径推断
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent / "output" / "road_map"

# 确保目录存在
if not BASE_DIR.exists():
    try:
        BASE_DIR.mkdir(parents=True, exist_ok=True)
        logger.info(f"Created custom road storage directory: {BASE_DIR}")
    except Exception as e:
        logger.error(f"Failed to create directory {BASE_DIR}: {e}")

class CustomRoadType(str, Enum):
    PATH = "path"

class RoadNode(BaseModel):
    x: float
    y: float
    type: str = "node" # start, end, node, control
    
class ETCGantry(BaseModel):
    id: str
    position_ratio: float # 0-1 relative to segment or path? 
    # 简化：存储绝对坐标或基于里程。前端传来的数据结构可能包含这些
    x: float
    y: float
    name: Optional[str] = None

class CustomRoadData(BaseModel):
    nodes: List[Dict[str, Any]] # 使用 Dict 以容纳前端传入的灵活结构
    edges: Optional[List[Dict[str, Any]]] = []
    gantries: List[Dict[str, Any]] = []
    ramps: Optional[List[Dict[str, Any]]] = []
    meta: Optional[Dict[str, Any]] = {}

class CustomRoadFile(BaseModel):
    filename: str
    updated_at: float
    size: int
    total_length_km: Optional[float] = None
    num_gantries: Optional[int] = None

@router.get("/", response_model=List[CustomRoadFile])
async def list_custom_roads():
    """获取所有自定义路径文件列表"""
    if not BASE_DIR.exists():
        return []
    
    files = []
    for file_path in BASE_DIR.glob("*.json"):
        try:
            stat = file_path.stat()
            # 尝试读取路径长度和门架数
            total_length_km = None
            num_gantries = None
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    road_data = json.load(f)
                meta = road_data.get("meta", {})
                total_length_km = meta.get("total_length_km")
                num_gantries = len(road_data.get("gantries", []))
            except Exception:
                pass  # 读取失败时保持 None
            
            files.append(CustomRoadFile(
                filename=file_path.name,
                updated_at=stat.st_mtime,
                size=stat.st_size,
                total_length_km=total_length_km,
                num_gantries=num_gantries,
            ))
        except Exception as e:
            logger.error(f"Error reading file {file_path}: {e}")
            continue
            
    # 按修改时间倒序排列
    files.sort(key=lambda x: x.updated_at, reverse=True)
    return files

@router.get("/{filename}", response_model=CustomRoadData)
async def get_custom_road(filename: str):
    """获取指定路径文件的详细内容"""
    file_path = BASE_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data
    except Exception as e:
        logger.error(f"Error reading json {filename}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to read file: {str(e)}")

@router.post("/", response_model=CustomRoadFile)
async def save_custom_road(
    filename: str = Body(..., embed=True),
    data: CustomRoadData = Body(..., embed=True)
):
    """保存自定义路径"""
    # 简单的文件名清理
    clean_filename = filename.strip()
    if not clean_filename.endswith(".json"):
        clean_filename += ".json"
        
    file_path = BASE_DIR / clean_filename
    
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data.dict(), f, indent=2, ensure_ascii=False)
            
        stat = file_path.stat()
        return CustomRoadFile(
            filename=clean_filename,
            updated_at=stat.st_mtime,
            size=stat.st_size
        )
    except Exception as e:
        logger.error(f"Error saving file {clean_filename}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

@router.put("/{filename}")
async def rename_custom_road(filename: str, new_filename: str = Body(..., embed=True)):
    """重命名文件"""
    old_path = BASE_DIR / filename
    if not old_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
        
    clean_new_name = new_filename.strip()
    if not clean_new_name.endswith(".json"):
        clean_new_name += ".json"
        
    new_path = BASE_DIR / clean_new_name
    if new_path.exists():
        raise HTTPException(status_code=400, detail="Target filename already exists")
        
    try:
        old_path.rename(new_path)
        return {"status": "success", "new_filename": clean_new_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to rename: {str(e)}")

@router.delete("/{filename}")
async def delete_custom_road(filename: str):
    """删除文件"""
    file_path = BASE_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
        
    try:
        file_path.unlink()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete: {str(e)}")
