# Road - 道路网络定义

该目录定义了仿真所需的道路基础设施。

## 文件说明

- **road_network.py**: 
  - 定义了路段 (Segment) 和 ETC 门架 (ETCGate) 的物理位置。
  - 维护了全局的路网拓扑信息。

## 职能

- 提供路段划分逻辑。
- 辅助 `SimulationEngine` 确定 ETC 门架的触发坐标范围。
