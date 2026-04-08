# 预警系统与工作流

本文档只说明当前工作流和预警规则相关的实现。

## 1. 作用

预警系统负责把仿真中的事件、异常和规则判定组织成可配置的工作流。

它的输出包括：

- 规则触发结果
- 预警事件
- 规则启停状态
- 工作流文件

## 2. 核心组件

### 2.1 规则引擎

`AlertRuleEngine` 负责持有规则集合并执行判定。

### 2.2 条件与动作

规则由条件和动作组成：

- 条件决定什么时候触发
- 动作决定触发后做什么

当前工作流接口支持查询条件类型和动作类型，也支持规则的增删改查、启停、导入和导出。

### 2.3 工作流文件

工作流文件保存在 `data/workflows/`。

## 3. API

主接口都挂在 `/api/workflows` 下，典型能力包括：

- `GET /conditions/types`
- `GET /actions/types`
- `GET /rules`
- `POST /rules`
- `PUT /rules/{rule_name}`
- `DELETE /rules/{rule_name}`
- `PATCH /rules/{rule_name}/toggle`
- `POST /workflows/import`
- `GET /workflows/export`
- `GET /workflows/files`
- `POST /workflows/reset`
- `GET /workflows/active-rules`
- `GET /engine/status`
- `GET /engine/events`

## 4. 与仿真的关系

规则引擎在仿真会话中由 WebSocket 管理器引用。也就是说，工作流不是独立的离线配置，而是会直接参与仿真运行中的预警判定。

## 5. 前端位置

对应页面是 `frontend/src/components/pages/WorkflowPage.tsx`。

它主要用于：

- 配置规则
- 编辑文件
- 查看当前启用规则
- 检查引擎状态和事件

## 6. 说明

这个模块是系统的一部分，但不承担总览职责。总览和运行机制应写在 `system_working_principles.md`，数学模型应写在 `simulation_mechanics.md`。
