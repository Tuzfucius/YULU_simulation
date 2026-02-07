"""
仿真管理 API
"""

from fastapi import APIRouter, HTTPException, status, Query
from typing import List, Optional
from datetime import datetime
import uuid

router = APIRouter()

# 内存存储 (生产环境应使用数据库)
_simulations_db: dict = {}


@router.get("")
async def list_simulations(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status_filter: Optional[str] = Query(None, regex="^(pending|running|completed|failed)$")
) -> List[dict]:
    """获取仿真历史列表"""
    simulations = []
    
    for sid, sim in _simulations_db.items():
        if status_filter and sim.get("status") != status_filter:
            continue
        simulations.append({
            "id": sid,
            "status": sim.get("status", "pending"),
            "progress": sim.get("progress"),
            "created_at": sim.get("created_at"),
            "completed_at": sim.get("completed_at")
        })
    
    return simulations[offset:offset + limit]


@router.get("/{simulation_id}")
async def get_simulation(simulation_id: str) -> dict:
    """获取仿真详情"""
    if simulation_id not in _simulations_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"仿真 {simulation_id} 不存在"
        )
    
    return _simulations_db[simulation_id]


@router.delete("/{simulation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_simulation(simulation_id: str):
    """删除仿真"""
    if simulation_id not in _simulations_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"仿真 {simulation_id} 不存在"
        )
    
    del _simulations_db[simulation_id]


@router.post("/{simulation_id}/cancel", status_code=status.HTTP_200_OK)
async def cancel_simulation(simulation_id: str) -> dict:
    """取消正在运行的仿真"""
    if simulation_id not in _simulations_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"仿真 {simulation_id} 不存在"
        )
    
    _simulations_db[simulation_id]["status"] = "cancelled"
    _simulations_db[simulation_id]["completed_at"] = datetime.utcnow()
    
    return {"status": "cancelled"}


@router.get("/{simulation_id}/results")
async def get_simulation_results(simulation_id: str) -> dict:
    """获取仿真结果数据"""
    if simulation_id not in _simulations_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"仿真 {simulation_id} 不存在"
        )
    
    sim = _simulations_db[simulation_id]
    
    if sim.get("status") != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="仿真尚未完成"
        )
    
    return {
        "simulation_id": simulation_id,
        "config": sim.get("config"),
        "statistics": sim.get("statistics"),
        "data": sim.get("results", {})
    }
