# 工具模块 (Utils)

本目录包含仿真系统的辅助工具。

## 模块列表

### spatial_index.py
**空间索引** - 基于网格的车辆快速检索工具。

- 将道路划分为固定长度（默认 100m）的网格
- 支持 O(1) 时间复杂度的前车/后车查找
- 大幅提升大规模仿真（5000+ 车辆）的性能

**主要方法**：
- `rebuild(vehicles)`: 重建索引
- `find_leader(vehicle)`: 查找同车道前车
- `get_nearby_vehicles(vehicle)`: 获取邻近车辆
- `get_high_density_cells()`: 获取高密度区域（用于堵车检测）

### logger.py
增强型日志记录器。

### helpers.py
单位转换等辅助函数（如 `kmh_to_ms`, `ms_to_kmh`）。
