# API 交互与历史存储设计

## 1. 文档目标

本文档只讨论历史运行相关的存储和读取机制，重点是：

- 一次仿真结果如何从内存落到磁盘
- `run_id` 如何作为历史系统主键
- 回放、分析、训练如何复用同一份结果
- 旧文件接口如何向新 `run_id` 结构过渡

## 2. 当前历史系统的核心链路

一次仿真完成后，系统会把结果组织成一个运行目录：

```text
data/
  simulations/
    run_xxx/
      data.json
      summary.json
      manifest.json
      trajectory.msgpack
```

其中：

- `data.json` 保存完整结果
- `summary.json` 保存列表和概览需要的摘要
- `manifest.json` 保存采样策略、门架和路径几何信息
- `trajectory.msgpack` 保存轨迹帧，避免大 JSON 反复读取

当前仓库中的运行 schema 版本是 `run_v2_path`。

## 3. 存储写入流程

写入逻辑主要在 `backend/services/storage.py` 和 `backend/services/run_repository.py` 中。

### 3.1 仿真结果写入

`StorageService.save_results()` 会：

1. 创建 `data/simulations/<simulation_id>/`
2. 给结果附加 `_metadata`
3. 将 `trajectory_data` 拆分保存到 `trajectory.msgpack`
4. 在 `data.json` 中保留轨迹文件信息和记录数
5. 调用 `persist_run_metadata()` 写入运行摘要和清单

### 3.2 摘要构建

`run_repository.py` 会从结果中归纳出：

- `total_vehicles`
- `total_anomalies`
- `simulation_time`
- `etc_alerts_count`
- `etc_transactions_count`
- `ml_samples`

这部分数据用于历史列表和概览卡片，不需要把完整结果全部读回前端。

### 3.3 路径几何与门架

同一份运行结果还会附带：

- 门架描述 `build_gate_descriptors()`
- 路径几何 `build_path_geometry()`

如果配置里有 `custom_road_path`，系统会优先读取自定义路网文件；否则按直线路网生成默认路径。

## 4. 读取链路

### 4.1 新式运行接口

`backend/api/runs.py` 是新历史系统的主入口。它面向 `run_id`，提供：

- 历史列表
- 运行详情
- 回放元数据
- 回放帧分块
- 事件列表
- 分析结果
- 门架列表

这套接口的优点是：

- 不依赖文件路径
- 更容易做分层存储
- 更适合后续扩展到多种几何和多种采样策略

### 4.2 旧式文件接口

`backend/api/files.py` 仍保留了文件路径驱动的兼容接口，主要用于旧页面和旧数据结构：

- `GET /api/files/output-files`
- `GET /api/files/output-file`
- `GET /api/files/output-file-info`
- `GET /api/files/output-file-chunk`
- `GET /api/files/simulation-gates`

这部分接口的定位是兼容，不是新的主路径。

## 5. 历史数据模型

### 5.1 摘要层

摘要层用于列表和快速概览：

```json
{
  "run_id": "run_20260314_101500",
  "schema_version": "run_v2_path",
  "summary": {
    "total_vehicles": 1280,
    "total_anomalies": 36,
    "simulation_time": 3600,
    "etc_alerts_count": 12,
    "etc_transactions_count": 1180,
    "ml_samples": 420
  }
}
```

### 5.2 清单层

清单层描述一次运行的组织方式：

```json
{
  "run_id": "run_xxx",
  "schema_version": "run_v2_path",
  "sampling": {
    "trajectory_interval_s": 2
  },
  "gates": [
    { "id": "G01", "position_km": 2.0 }
  ],
  "path_geometry": {
    "version": "path_geometry_v1"
  }
}
```

### 5.3 轨迹层

轨迹建议采用路径表达，而不是每帧重复保存完整笛卡尔坐标：

```json
{
  "time": 120.0,
  "vehicles": [
    {
      "id": 57,
      "path_id": "main_lane_1",
      "s": 812.4,
      "offset": 0.0,
      "speed": 21.5,
      "flags": 0
    }
  ]
}
```

其中：

- `path_id` 标识当前轨迹所属路径
- `s` 是路径纵向里程
- `offset` 是横向偏移

对于直线道路，`path_id + s` 可以退化回旧坐标体系。

## 6. 回放与分析

### 6.1 回放

回放页只需要读取：

- 运行摘要
- 门架和路径几何
- 轨迹帧分块

这样前端不必一次性加载全部历史数据。

### 6.2 分析

`GET /api/runs/{run_id}/analysis` 返回的是聚合后的图表数据，而不是原始轨迹：

- 全局速度时序
- 区段热力图
- 异常时间分布
- 事件构成
- 区段切换时序
- 异常类型分布
- 回放锚点

这让分析页和回放页可以共享同一个 `run_id`，但按不同粒度读取。

## 7. 目录级兼容策略

当前系统同时保留两种读取方式：

- 新方式：`run_id` 驱动
- 旧方式：文件路径驱动

兼容策略是：

1. 新功能优先接 `runs` 接口
2. 旧页面继续使用 `files` 接口
3. 新存储尽量向 `run_id` 聚合
4. 只有兼容场景才继续读旧路径

## 8. 实际落盘对象

除历史运行外，项目还会写入这些目录：

- `data/datasets`
- `data/models`
- `data/workflows`
- `data/charts`
- `data/layouts`

这些目录分别服务于训练、模型、规则、图表收藏和界面布局，不属于单次仿真的原始轨迹。
