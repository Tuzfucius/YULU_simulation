# 道路网络模块 (Road)

本目录实现道路网络建模，支持简单单线和复杂图结构路网。

## 模块列表

### graph.py
**图结构核心** - 节点/边/路径的数据结构。

核心类：
- `RoadNode`: 节点（ORIGIN/DESTINATION/MERGE/DIVERGE/JUNCTION）
- `RoadEdge`: 边（长度、车道数、限速、坡度）
- `VehiclePath`: 车辆行驶路径
- `RoadGraph`: 图管理器

预置模板：
- `create_simple_mainline()`: 简单主线
- `create_mainline_with_on_ramp()`: 主线 + 入口匝道
- `create_mainline_with_off_ramp()`: 主线 + 出口匝道

### path_planner.py
**路径规划** - 车辆路径分配和分流决策。

- `PathPlanner`: 路径分配器
- `DivergeDecision`: 分流点换道决策

### network.py
**基础路网** - 向后兼容的简化路网（单线 + Fork/Merge）。

## 使用示例

```python
from etc_sim.road import create_mainline_with_on_ramp, PathPlanner

# 创建带入口匝道的路网
graph = create_mainline_with_on_ramp(
    main_length_km=20.0,
    ramp_position_km=8.0,
    ramp_length_km=0.5
)

# 创建路径规划器
planner = PathPlanner(graph)

# 分配车辆路径
path_id = planner.assign_path(vehicle_id=1, origin_node_id="origin")
```
