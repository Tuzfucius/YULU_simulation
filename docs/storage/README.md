# 存储专题索引

这个目录只讨论历史运行、回放和训练数据相关的存储设计。

## 阅读顺序

1. `../system_working_principles.md`
   先看系统总览，确认历史存储在整条链路中的位置。
2. `api_interaction_and_history_storage.md`
   再看本专题正文，了解 `run_id`、目录结构、轨迹分离和兼容策略。

## 本目录关注的问题

- 一次仿真结果如何落盘
- 为什么历史记录要以 `run_id` 为中心
- 为什么轨迹要单独编码，而不是全部塞进一个大 JSON
- 回放、分析和训练如何复用同一份历史数据

## 当前存储对象

- `data/simulations/<run_id>/`
  历史运行主目录
- `summary.json`
  列表与概览用摘要
- `manifest.json`
  运行清单、采样信息、门架和路径几何
- `data.json`
  完整结果载体
- `trajectory.msgpack`
  轨迹数据的独立分块文件

## 相关实现

- `backend/services/storage.py`
  保存仿真结果、分离轨迹、落盘元数据
- `backend/services/run_repository.py`
  运行目录解析、摘要构建、路径几何和门架描述
- `backend/services/trajectory_storage.py`
  轨迹编码与解码
- `backend/api/runs.py`
  新的历史运行、回放和事件读取接口
- `backend/api/files.py`
  旧式文件兼容接口

## 额外说明

- CLI 入口写入的是 `data/results`，Web 后端写入的是 `data/simulations`。
- 讲历史系统时默认以 `run_id` 为主，不再以单个大 JSON 文件为主。
