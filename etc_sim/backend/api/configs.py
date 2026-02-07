"""
配置管理 API
"""

from fastapi import APIRouter, HTTPException, status
from typing import List, Optional
from datetime import datetime
import uuid

from etc_sim.backend.models.schemas import (
    SimulationConfig,
    ConfigCreateRequest,
    ConfigResponse
)

router = APIRouter()

# 内存存储 (生产环境应使用数据库)
_configs_db: dict = {}


@router.get("", response_model=List[ConfigResponse])
async def list_configs() -> List[ConfigResponse]:
    """获取所有配置"""
    configs = []
    for cid, config in _configs_db.items():
        configs.append(ConfigResponse(
            id=cid,
            name=config["name"],
            description=config.get("description"),
            config=config["config"],
            created_at=config["created_at"],
            updated_at=config["updated_at"]
        ))
    return configs


@router.post("", response_model=ConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_config(request: ConfigCreateRequest) -> ConfigResponse:
    """创建新配置"""
    config_id = str(uuid.uuid4())
    now = datetime.utcnow()
    
    _configs_db[config_id] = {
        "name": request.name,
        "description": request.description,
        "config": request.config.to_dict(),
        "created_at": now,
        "updated_at": now
    }
    
    return ConfigResponse(
        id=config_id,
        name=request.name,
        description=request.description,
        config=request.config.to_dict(),
        created_at=now,
        updated_at=now
    )


@router.get("/{config_id}", response_model=ConfigResponse)
async def get_config(config_id: str) -> ConfigResponse:
    """获取配置详情"""
    if config_id not in _configs_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"配置 {config_id} 不存在"
        )
    
    config = _configs_db[config_id]
    return ConfigResponse(
        id=config_id,
        name=config["name"],
        description=config.get("description"),
        config=config["config"],
        created_at=config["created_at"],
        updated_at=config["updated_at"]
    )


@router.put("/{config_id}", response_model=ConfigResponse)
async def update_config(
    config_id: str,
    request: ConfigCreateRequest
) -> ConfigResponse:
    """更新配置"""
    if config_id not in _configs_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"配置 {config_id} 不存在"
        )
    
    _configs_db[config_id].update({
        "name": request.name,
        "description": request.description,
        "config": request.config.to_dict(),
        "updated_at": datetime.utcnow()
    })
    
    config = _configs_db[config_id]
    return ConfigResponse(
        id=config_id,
        name=config["name"],
        description=config.get("description"),
        config=config["config"],
        created_at=config["created_at"],
        updated_at=config["updated_at"]
    )


@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_config(config_id: str):
    """删除配置"""
    if config_id not in _configs_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"配置 {config_id} 不存在"
        )
    
    del _configs_db[config_id]


@router.post("/{config_id}/duplicate", response_model=ConfigResponse)
async def duplicate_config(config_id: str) -> ConfigResponse:
    """复制配置"""
    if config_id not in _configs_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"配置 {config_id} 不存在"
        )
    
    original = _configs_db[config_id]
    new_id = str(uuid.uuid4())
    now = datetime.utcnow()
    
    _configs_db[new_id] = {
        "name": f"{original['name']} (副本)",
        "description": original.get("description"),
        "config": original["config"],
        "created_at": now,
        "updated_at": now
    }
    
    return ConfigResponse(
        id=new_id,
        name=_configs_db[new_id]["name"],
        description=_configs_db[new_id].get("description"),
        config=_configs_db[new_id]["config"],
        created_at=now,
        updated_at=now
    )
