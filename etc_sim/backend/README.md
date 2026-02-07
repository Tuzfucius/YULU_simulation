# Backend - 后端核心服务

该目录包含了基于 FastAPI 的后端服务，负责处理 API 请求、管理仿真会话以及通过 WebSocket 提供实时数据推送。

## 目录结构

- **api/**: 接口路由定义。
  - `configs.py`: 仿真配置的增删改查 API。
  - `simulations.py`: 仿真状态查询与结果获取 API。
  - `analysis.py`: 仿真结果的统计分析数据接口。
  - `websocket.py`: WebSocket 代理路由，负责将会话转发给 `WebSocketManager`。
- **core/**: 后端核心组件。
  - `websocket_manager.py`: WebSocket 连接与会话管理器，负责驱动仿真引擎并推送数据。
- **models/**: 数据模型定义。
  - `schemas.py`: 定义了 Pydantic 模型，用于 API 请求/响应及 WebSocket 消息的序列化。
- **services/**: 基础设施服务。
  - `storage.py`: 基于文件系统的持久化存储服务，负责保存/加载配置与结果。
- **main.py**: FastAPI 应用主入口，负责初始化服务、挂载路由及配置中间件。

## 核心职责

1. **API 提供**: 暴露 RESTful 接口供前端调用。
2. **WebSocket 调度**: 管理多个并行的仿真会话，按需启动仿真引擎。
3. **数据转换**: 将仿真引擎的原始物理数据转换为前端易于渲染的快照格式。
4. **持久化**: 确保仿真配置与最终统计结果被安全保存到磁盘。
