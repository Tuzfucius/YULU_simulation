# API - 路由定义

该目录定义了所有的 HTTP 接口和 WebSocket 入口点。

## 主要文件说明

- **configs.py**: 
  - 负责仿真配置管理。
  - 支持创建、列表、详情获取、更新、删除及副本创建。
- **simulations.py**: 
  - 负责仿真记录的管理。
  - 提供列表查询、结果获取、任务取消等功能。
- **analysis.py**: 
  - 负责仿真后的深度数据分析。
  - 提供各项统计指标摘要及图表所需的结构化数据。
- **websocket.py**: 
  - WebSocket 服务端入口。
  - 该模块现已重构为代理模式，通过 `app.state.ws_manager` 调用全局单例，处理实时仿真流。

## 设计模式

- 使用 FastAPI 路由组 (`APIRouter`) 进行模块化拆分。
- 遵循 RESTful API 设计规范。
- 利用 Pydantic 模型进行强制类型验证和自动文档生成。
