# 批次B-优先做任务记录

## 目标

在保持功能不变的前提下，优先完成高收益性能优化，降低回放、前端运行态和规则历史的时间复杂度与空间占用。

## 完成状态

- [x] 回放链路轻量化
- [x] 历史运行列表加速
- [x] 前端仿真引擎减载
- [x] 工作流编辑器性能优化
- [x] 规则历史窗口化

## 变更摘要

### 1. 后端回放与列表
- `/api/files/output-file-info` 优先从 `summary.json` 与 `manifest.json` 读取元信息
- `/api/files/output-file-chunk` 保持分页回放，但将几何信息改为顶层返回，不再重复写入每一帧
- 运行历史列表不再为每个 run 重读 `data.json`

### 2. 前端运行态
- 运行中仅更新轻量统计与进度
- `segmentSpeedHistory`、`sampledTrajectory`、`anomalyLogs` 仅在完成态注入

### 3. 工作流编辑器
- `setNodes`、`setEdges`、`updateNodeData` 改为延迟入历史与自动保存
- `addNode`、`removeNode`、`undo`、`redo` 等结构性操作仍立即提交
- 清理了重复定义，避免旧实现覆盖延迟逻辑

### 4. 规则引擎
- `event_history` 改为窗口化结构
- 追加事件时同时按时间和容量裁剪，长期运行内存更加稳定

## 对应提交

- `8c04309 perf: 优化后端回放元数据与列表读取`
- `601e53f perf: 减载前端仿真引擎运行态写入`
- `ab2317c perf: 收敛工作流编辑器历史提交`
- `9e40f3b fix: 清理工作流编辑器重复定义`
- `7c4bbe0 fix: 规则历史改为窗口化`

## 验证

- `python -m py_compile` 已通过后端相关改动验证
- `git diff --check` 已通过本轮收尾修复的文本校验
- `npm run build` 未作为通过条件，仓库中仍有既有 TypeScript 问题