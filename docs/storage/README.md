# 存储专题索引

本目录聚焦历史运行、回放读取、分析复用和训练数据提取。当前历史系统已经从单个大结果文件，演进到以 `run_id` 为中心的目录化存储。

## 阅读顺序

1. [../system_working_principles.md](../system_working_principles.md)
   先理解系统总体架构和运行链路。
2. [api_interaction_and_history_storage.md](./api_interaction_and_history_storage.md)
   再看历史运行目录、回放、分析和训练之间的关系。

## 本目录重点

- 为什么历史结果要按 `run_id` 组织。
- 为什么摘要、清单、原始结果要分层存储。
- 为什么回放、分析和训练要复用同一份历史数据。
- 为什么旧的文件式读取接口还要保留一段时间。

## 当前推荐目录结构

```text
data/
  simulations/
    run_20260408_120000/
      data.json
      summary.json
      manifest.json
      trajectory.msgpack
      images/
```

其中：

- `data.json`
  运行主结果，包含引擎导出的原始结构。
- `summary.json`
  列表页和概览页使用的精简摘要。
- `manifest.json`
  回放、分析和发现文件所需的元信息。
- `trajectory.msgpack`
  若启用轨迹分块，会保存更适合分段读取的轨迹数据。
- `images/`
  运行图像和导出图表。

## 代码对应位置

- `etc_sim/backend/services/run_repository.py`
  历史运行索引、摘要、清单和目录解析。
- `etc_sim/backend/services/storage.py`
  仿真结果落盘。
- `etc_sim/backend/services/trajectory_storage.py`
  轨迹数据序列化与读取。
- `etc_sim/backend/api/runs.py`
  新的历史运行、回放和分析入口。
- `etc_sim/backend/api/files.py`
  旧式文件驱动接口和脚本工具。

## 维护原则

- 新增历史文件格式时，先改服务层，再改 API，最后改文档。
- 不要在文档里混淆 `data/results` 与 `data/simulations` 的用途。
- 历史系统若继续演进，应优先保持 `run_id` 兼容。
