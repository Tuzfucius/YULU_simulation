# 历史运行、接口与存储结构

本文档说明历史运行如何落盘、如何被 API 读取、如何服务回放和训练。这里描述的是当前代码真实采用的结构，不再保留旧版单文件驱动的叙述。

---

## 1. 历史系统的主标识

当前历史系统以 `run_id` 为中心。`run_id` 同时承担以下职责：

- 历史列表主键。
- 回放查询键。
- 分析查询键。
- 训练数据来源追踪键。
- 数据集和模型的来源引用键。

运行目录通常位于 `data/simulations/<run_id>/`。

---

## 2. 运行目录结构

一个完整历史运行通常包含以下文件：

```text
data/simulations/run_xxx/
  data.json
  summary.json
  manifest.json
  trajectory.msgpack   # 若启用轨迹分块
  images/
```

### 2.1 `data.json`

`data.json` 保存仿真引擎导出的主结果。`SimulationEngine.export_to_dict()` 会输出：

- `config`
- `statistics`
- `etcGates`
- `anomaly_logs`
- `trajectory_data`
- `segment_speed_history`
- `queue_events`
- `phantom_jam_events`
- `safety_data`
- `vehicle_records`
- `etc_detection`
- `environment`
- `rule_engine`
- `ml_dataset`

这份数据是后续摘要、清单、回放、分析和训练的基础。

### 2.2 `summary.json`

`summary.json` 用于列表页和概览页。`run_repository.py` 当前会写入：

- `run_id`
- `schema_version`
- `created_at`
- `status`
- `config_digest`
- `summary`

其中 `summary` 至少包含：

- `total_vehicles`
- `total_anomalies`
- `simulation_time`
- `etc_alerts_count`
- `etc_transactions_count`
- `ml_samples`
- `queue_event_count`
- `phantom_jam_event_count`

### 2.3 `manifest.json`

`manifest.json` 用于发现和回放。它比 `summary.json` 更完整，通常包含：

- `run_id`
- `schema_version`
- `created_at`
- `artifacts`
- `config`
- `summary`
- `road_geometry`
- `sampling`
- `chunks`

其中 `artifacts` 会说明数据文件、摘要文件、清单文件和轨迹文件的位置。

---

## 3. 写入流程

### 3.1 CLI 仿真写入

`etc_sim/main.py` 的命令行模式会把结果写入 `data/results/`。

这条路径适合单机调试和快速实验，不是当前后端历史系统的主索引路径。

### 3.2 后端历史写入

后端服务通过 `StorageService` 和 `run_repository` 维护 `data/simulations/`。

典型顺序是：

1. 仿真引擎完成运行并导出字典。
2. 存储服务把主结果写入运行目录。
3. `run_repository` 生成 `summary.json` 和 `manifest.json`。
4. 前端通过 `/api/runs` 读取列表与详情。

---

## 4. 读取流程

### 4.1 运行列表

`GET /api/runs`

返回运行列表时，后端优先读取 `summary.json`。若摘要缺失，会尝试从 `manifest.json` 或 `data.json` 回填。

### 4.2 运行详情

`GET /api/runs/{run_id}`

会把摘要、清单和辅助统计合并成统一视图，供详情页、回放页和分析页使用。

### 4.3 回放元信息

`GET /api/runs/{run_id}/replay/meta`

主要用于告诉前端：

- 有哪些轨迹数据。
- 轨迹如何分块。
- 门架和路径几何如何映射。

### 4.4 回放帧

`GET /api/runs/{run_id}/replay/frames`

按时间窗或偏移量返回帧数据，前端据此逐帧重建轨迹。

### 4.5 分析数据

`GET /api/runs/{run_id}/analysis`

为图表、摘要卡片和事件定位提供聚合结果。

---

## 5. 与旧接口的关系

### 5.1 旧文件式接口

`/api/files` 仍然保留，主要用于：

- 历史脚本兼容。
- 旧结果文件读取。
- 输出文件浏览和脚本编辑。

### 5.2 新历史接口

`/api/runs` 是当前推荐入口，原因是：

- 明确以 `run_id` 为主键。
- 支持摘要、清单、分析和回放联动。
- 更适合分块读取和后续扩展。

---

## 6. 训练与回放的复用关系

预测工作台会从历史运行中提取训练数据：

- `segment_speed_history` 提供时序特征。
- `anomaly_logs` 提供标签和事件信息。
- `etc_detection` 提供门架交易与异常检测结果。
- `ml_dataset` 可以直接作为训练样本输入。

因此，历史运行不是一次性产物，而是后续分析、训练和评估的共享数据源。

---

## 7. 迁移建议

如果继续演进历史系统，优先顺序应是：

1. 继续保留 `data.json` 作为主结果文件。
2. 让 `summary.json` 和 `manifest.json` 维持向后兼容。
3. 让新回放和分析接口优先读 `run_id`。
4. 最后再逐步减少旧文件式接口的使用范围。
