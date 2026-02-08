"""
路网配置 API
提供复杂路网模板和配置接口
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from enum import Enum


router = APIRouter()


class NetworkTemplate(str, Enum):
    SIMPLE_MAINLINE = "simple_mainline"
    ON_RAMP = "on_ramp"
    OFF_RAMP = "off_ramp"


class NetworkConfig(BaseModel):
    template: NetworkTemplate = NetworkTemplate.SIMPLE_MAINLINE
    main_length_km: float = Field(20.0, ge=5, le=100)
    num_lanes: int = Field(4, ge=2, le=8)
    ramp_position_km: Optional[float] = Field(None, ge=1)
    ramp_length_km: float = Field(0.5, ge=0.2, le=2.0)
    exit_probability: float = Field(0.2, ge=0, le=1.0)


class NetworkNode(BaseModel):
    node_id: str
    node_type: str
    position_km: float
    x: float
    y: float


class NetworkEdge(BaseModel):
    edge_id: str
    from_node: str
    to_node: str
    length_km: float
    num_lanes: int
    is_ramp: bool = False


class NetworkGraph(BaseModel):
    nodes: List[NetworkNode]
    edges: List[NetworkEdge]
    paths: Dict[str, List[str]]


# 当前配置
_current_config = NetworkConfig()


@router.get("/templates")
async def get_templates() -> List[dict]:
    """获取所有可用路网模板"""
    return [
        {
            "id": NetworkTemplate.SIMPLE_MAINLINE.value,
            "name": "简单主线",
            "description": "单一主线道路，无匝道",
            "icon": "➡️"
        },
        {
            "id": NetworkTemplate.ON_RAMP.value,
            "name": "入口匝道",
            "description": "主线 + 一个入口匝道（合流点）",
            "icon": "↗️"
        },
        {
            "id": NetworkTemplate.OFF_RAMP.value,
            "name": "出口匝道",
            "description": "主线 + 一个出口匝道（分流点）",
            "icon": "↘️"
        }
    ]


@router.get("/current", response_model=NetworkConfig)
async def get_current_config() -> NetworkConfig:
    """获取当前路网配置"""
    return _current_config


@router.put("/current", response_model=NetworkConfig)
async def update_config(config: NetworkConfig) -> NetworkConfig:
    """更新路网配置"""
    global _current_config
    
    # 验证匝道位置
    if config.template in [NetworkTemplate.ON_RAMP, NetworkTemplate.OFF_RAMP]:
        if config.ramp_position_km is None:
            config.ramp_position_km = config.main_length_km * 0.4
        if config.ramp_position_km >= config.main_length_km:
            raise HTTPException(400, "匝道位置必须小于道路总长度")
    
    _current_config = config
    return _current_config


@router.get("/preview", response_model=NetworkGraph)
async def preview_network() -> NetworkGraph:
    """预览当前配置生成的路网图"""
    config = _current_config
    nodes = []
    edges = []
    paths = {}
    
    if config.template == NetworkTemplate.SIMPLE_MAINLINE:
        nodes = [
            NetworkNode(node_id="origin", node_type="origin", position_km=0, x=0, y=0),
            NetworkNode(node_id="destination", node_type="destination", 
                       position_km=config.main_length_km, x=config.main_length_km, y=0)
        ]
        edges = [
            NetworkEdge(edge_id="main", from_node="origin", to_node="destination",
                       length_km=config.main_length_km, num_lanes=config.num_lanes)
        ]
        paths = {"main_route": ["main"]}
        
    elif config.template == NetworkTemplate.ON_RAMP:
        ramp_pos = config.ramp_position_km or 8.0
        nodes = [
            NetworkNode(node_id="origin", node_type="origin", position_km=0, x=0, y=0),
            NetworkNode(node_id="merge", node_type="merge", position_km=ramp_pos, x=ramp_pos, y=0),
            NetworkNode(node_id="destination", node_type="destination",
                       position_km=config.main_length_km, x=config.main_length_km, y=0),
            NetworkNode(node_id="ramp_origin", node_type="origin",
                       position_km=ramp_pos - config.ramp_length_km,
                       x=ramp_pos - config.ramp_length_km, y=-1)
        ]
        edges = [
            NetworkEdge(edge_id="main1", from_node="origin", to_node="merge",
                       length_km=ramp_pos, num_lanes=config.num_lanes),
            NetworkEdge(edge_id="main2", from_node="merge", to_node="destination",
                       length_km=config.main_length_km - ramp_pos, num_lanes=config.num_lanes),
            NetworkEdge(edge_id="ramp", from_node="ramp_origin", to_node="merge",
                       length_km=config.ramp_length_km, num_lanes=1, is_ramp=True)
        ]
        paths = {"main_route": ["main1", "main2"], "ramp_route": ["ramp", "main2"]}
        
    elif config.template == NetworkTemplate.OFF_RAMP:
        ramp_pos = config.ramp_position_km or 12.0
        nodes = [
            NetworkNode(node_id="origin", node_type="origin", position_km=0, x=0, y=0),
            NetworkNode(node_id="diverge", node_type="diverge", position_km=ramp_pos, x=ramp_pos, y=0),
            NetworkNode(node_id="destination", node_type="destination",
                       position_km=config.main_length_km, x=config.main_length_km, y=0),
            NetworkNode(node_id="ramp_dest", node_type="destination",
                       position_km=ramp_pos + config.ramp_length_km,
                       x=ramp_pos + config.ramp_length_km, y=1)
        ]
        edges = [
            NetworkEdge(edge_id="main1", from_node="origin", to_node="diverge",
                       length_km=ramp_pos, num_lanes=config.num_lanes),
            NetworkEdge(edge_id="main2", from_node="diverge", to_node="destination",
                       length_km=config.main_length_km - ramp_pos, num_lanes=config.num_lanes),
            NetworkEdge(edge_id="ramp", from_node="diverge", to_node="ramp_dest",
                       length_km=config.ramp_length_km, num_lanes=1, is_ramp=True)
        ]
        paths = {"main_route": ["main1", "main2"], "exit_route": ["main1", "ramp"]}
    
    return NetworkGraph(nodes=nodes, edges=edges, paths=paths)
