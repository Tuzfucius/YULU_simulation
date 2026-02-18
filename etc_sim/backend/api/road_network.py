"""
路网配置 API
提供复杂路网模板和配置接口
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum


router = APIRouter()


class NetworkTemplate(str, Enum):
    SIMPLE_MAINLINE = "simple_mainline"
    ON_RAMP = "on_ramp"
    OFF_RAMP = "off_ramp"
    CUSTOM = "custom"


class NetworkConfig(BaseModel):
    template: NetworkTemplate = NetworkTemplate.SIMPLE_MAINLINE
    main_length_km: float = Field(20.0, ge=5, le=100)
    num_lanes: int = Field(4, ge=2, le=8)
    ramp_position_km: Optional[float] = Field(None, ge=1)
    ramp_length_km: float = Field(0.5, ge=0.2, le=2.0)
    exit_probability: float = Field(0.2, ge=0, le=1.0)
    custom_file_path: Optional[str] = None


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
    paths: Dict[str, Any]  # 支持存储列表、浮点数等不同类型的元数据


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
        },
        {
            "id": NetworkTemplate.CUSTOM.value,
            "name": "自定义路径",
            "description": "从路径编辑器导入自定义轨迹",
            "icon": "🛣️"
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
    
    # 自定义路径：保留上次 preview 计算出的 main_length_km，
    # 避免前端传来的默认值（20km）覆盖实际路径长度
    if (config.template == NetworkTemplate.CUSTOM and
            _current_config.template == NetworkTemplate.CUSTOM and
            _current_config.custom_file_path == config.custom_file_path and
            _current_config.main_length_km != config.main_length_km):
        config = NetworkConfig(
            template=config.template,
            main_length_km=_current_config.main_length_km,
            num_lanes=config.num_lanes,
            ramp_position_km=config.ramp_position_km,
            exit_probability=config.exit_probability,
            custom_file_path=config.custom_file_path
        )
    
    _current_config = config
    return _current_config



def _compute_segment_length_m(
    prev: dict, curr: dict, next_node: Optional[dict], scale_m_per_unit: float
) -> float:
    """
    计算从 prev→curr 路段的实际长度（米）。
    若 curr 节点有 radius（米），且存在 next_node，则计算圆弧长度；
    否则返回 prev→curr 的直线距离。
    
    圆弧长度公式：L = R × θ
    其中 θ 由切点距离 d = R / tan(halfAngle) 推导：
      halfAngle = acos(dot(u1, u2)) / 2
      θ = π - 2 × halfAngle（圆弧对应的圆心角）
    """
    import math as _math
    
    dx = curr["x"] - prev["x"]
    dy = curr["y"] - prev["y"]
    straight_units = _math.sqrt(dx * dx + dy * dy)
    straight_m = straight_units * scale_m_per_unit
    
    radius_m = float(curr.get("radius", 0) or 0)
    if radius_m <= 0 or next_node is None:
        return straight_m
    
    # 向量 prev→curr 和 next→curr（反向，用于计算夹角）
    v1x = prev["x"] - curr["x"]; v1y = prev["y"] - curr["y"]
    v2x = next_node["x"] - curr["x"]; v2y = next_node["y"] - curr["y"]
    len1 = _math.sqrt(v1x*v1x + v1y*v1y)
    len2 = _math.sqrt(v2x*v2x + v2y*v2y)
    if len1 < 1e-9 or len2 < 1e-9:
        return straight_m
    
    # 单位向量点积 → 夹角
    dot = (v1x*v2x + v1y*v2y) / (len1 * len2)
    dot = max(-1.0, min(1.0, dot))
    angle_between = _math.acos(dot)  # 两向量夹角（0~π）
    half_angle = angle_between / 2.0
    if half_angle < 1e-6 or half_angle > _math.pi / 2 - 1e-6:
        return straight_m  # 几乎平行或垂直，退化为直线
    
    # 切点到顶点距离（画布单位）
    radius_units = radius_m / scale_m_per_unit
    d_units = radius_units / _math.tan(half_angle)
    
    # 检查圆弧是否放得下
    if d_units > len1 or d_units > len2:
        return straight_m  # 圆弧太大，退化为直线
    
    # 圆弧对应的圆心角 = π - angle_between
    # 圆弧长度（米）= R × 圆心角
    arc_angle = _math.pi - angle_between
    arc_length_m = radius_m * arc_angle
    
    # 该路段长度 = prev→切点1 的直线距离 + 圆弧长度（切点1→切点2）
    # 注意：切点1 在 prev→curr 上，距 curr 为 d_units
    t1_dist_m = (straight_units - d_units) * scale_m_per_unit  # prev→切点1
    if t1_dist_m < 0:
        return straight_m
    return t1_dist_m + arc_length_m


@router.get("/preview", response_model=NetworkGraph)
async def preview_network() -> NetworkGraph:
    """预览当前配置生成的路网图"""
    global _current_config  # 必须在函数顶部声明，避免 SyntaxError
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
        
    elif config.template == NetworkTemplate.CUSTOM:
        # 加载自定义路径文件
        from .custom_roads import BASE_DIR
        import json
        import math
        
        if not config.custom_file_path:
            return NetworkGraph(nodes=[], edges=[], paths={})
             
        file_path = BASE_DIR / config.custom_file_path
        if not file_path.exists():
            return NetworkGraph(nodes=[], edges=[], paths={})
            
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                
            raw_nodes = data.get("nodes", [])
            if not raw_nodes:
                return NetworkGraph(nodes=[], edges=[], paths={})

            # 读取比例尺：1 画布单位 = scale_m_per_unit 米
            # 前端约定：1格(50px) = 100m，即 1px = 2m
            meta = data.get("meta", {})
            scale_m_per_unit = float(meta.get("scale_m_per_unit", 2.0))

            current_km = 0.0
            nodes = []
            total_edges = []
            path_edge_ids = []
            
            # 第一个节点（起点）
            first = raw_nodes[0]
            nodes.append(NetworkNode(
                node_id="node_0", 
                node_type="origin",
                position_km=0.0,
                x=float(first.get("x", 0)),
                y=float(first.get("y", 0))
            ))
            
            for i in range(1, len(raw_nodes)):
                prev = raw_nodes[i - 1]
                curr = raw_nodes[i]
                next_node = raw_nodes[i + 1] if i + 1 < len(raw_nodes) else None
                
                # 计算路段长度：若当前节点有圆弧半径，使用圆弧长度；否则用直线距离
                # 圆弧长度公式：L = R × θ，其中 θ 是圆弧对应的圆心角
                seg_length_m = _compute_segment_length_m(prev, curr, next_node, scale_m_per_unit)
                dist_km = seg_length_m / 1000.0
                current_km += dist_km
                
                node_type = "destination" if i == len(raw_nodes) - 1 else "node"
                nodes.append(NetworkNode(
                    node_id=f"node_{i}",
                    node_type=node_type,
                    position_km=round(current_km, 4),
                    x=float(curr.get("x", 0)),
                    y=float(curr.get("y", 0))
                ))
                
                edge_id = f"edge_{i}"
                total_edges.append(NetworkEdge(
                    edge_id=edge_id,
                    from_node=f"node_{i-1}",
                    to_node=f"node_{i}",
                    length_km=round(dist_km, 4),
                    num_lanes=config.num_lanes
                ))
                path_edge_ids.append(edge_id)
            
            # 处理 ETC 门架：计算每个门架的里程位置
            # 门架存储了 segmentIndex（所在路段）和 t（路段参数 0~1）
            # 里程 = 该路段起点里程 + t × 该路段长度
            raw_gantries = data.get("gantries", [])
            gantry_positions_km = []
            for g in raw_gantries:
                seg_idx = int(g.get("segmentIndex", 0))
                t_val = float(g.get("t", 0.5))
                if seg_idx < len(total_edges):
                    seg_start_km = nodes[seg_idx].position_km
                    seg_len_km = total_edges[seg_idx].length_km
                    gantry_km = seg_start_km + t_val * seg_len_km
                    gantry_positions_km.append(round(gantry_km, 4))
            
            # 将门架里程写入 paths 元数据（供仿真引擎读取）
            paths = {
                "main_route": path_edge_ids,
                "gantry_positions_km": gantry_positions_km,
                "total_length_km": round(current_km, 4)
            }
            edges = total_edges
            
            # 更新全局配置中的路段长度，使仿真引擎使用正确里程
            _current_config = NetworkConfig(
                template=config.template,
                main_length_km=max(round(current_km, 3), 0.1),
                num_lanes=config.num_lanes,
                custom_file_path=config.custom_file_path
            )
            
        except Exception as e:
            print(f"Error loading custom road: {e}")
            import traceback; traceback.print_exc()
            return NetworkGraph(nodes=[], edges=[], paths={})
    
    return NetworkGraph(nodes=nodes, edges=edges, paths=paths)
