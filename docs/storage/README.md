# 存储专题文档

本目录聚焦 ETC 仿真系统中的历史运行存储、回放读取、训练数据提取、路径轨迹嵌入、接口迁移与性能优化。

## 阅读顺序

1. `../system_working_principles.md`
   内容：系统整体工作原理、模块分层、关键数据结构、核心 API 总览。
2. `api_interaction_and_history_storage.md`
   内容：历史运行存储模型、路径轨迹结构、回放/训练/分析接口关系、兼容迁移和性能设计。

## 本目录解决的问题

本目录重点解释以下问题：

1. 为什么历史记录不能继续只依赖单个 `data.json`。
2. 为什么要以 `run_id` 作为历史系统主标识。
3. 为什么轨迹应逐步升级为 `path_id + s + offset`。
4. 为什么回放、分析、训练要共用同一套历史运行模型。
5. 如何在保证兼容性的前提下推进接口迁移和性能优化。

## 当前建议

当前推荐的历史数据组织方式如下：

```text
data/
  simulations/
    run_xxx/
      summary.json
      manifest.json
      data.json
      trajectory/
      events/
      metrics/
```

其中：

- `summary.json`
  用于历史列表、快速概览和训练来源展示。
- `manifest.json`
  用于描述当前运行有哪些数据、采样策略和几何信息。
- `data.json`
  作为旧结构兼容层或聚合结果文件。
- `trajectory/`
  存放可分块读取的轨迹数据。
- `events/`
  存放异常、排队、规则、交易等事件。
- `metrics/`
  存放区段指标、路径指标和训练友好的聚合时序。

## 与代码的对应关系

当前与本目录最相关的实现位置包括：

- `etc_sim/backend/api/runs.py`
  新的历史运行 API、分析 API、回放读取入口。
- `etc_sim/backend/api/files.py`
  旧式文件回放兼容接口。
- `etc_sim/backend/services/run_repository.py`
  历史运行列表、摘要回填和运行目录解析。
- `etc_sim/backend/services/storage.py`
  仿真结果保存逻辑。
- `etc_sim/backend/services/trajectory_storage.py`
  轨迹数据序列化逻辑。

## 后续文档建议

如果后续继续重构历史系统，建议在本目录追加：

1. `schema_versions.md`
   说明 `run_v1`、`run_v2`、`run_v2_path` 等版本差异。
2. `api_migration_checklist.md`
   说明旧接口与新接口的迁移顺序、前端影响面和兼容策略。
