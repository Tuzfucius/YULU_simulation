# 任务记录

## 当前目标

- 项目分支：`codex/code-audit-optimization`
- 审查报告位置：`docs/codex_tasks/code_audit_20260320.md`
- 审查报告目录：`docs/codex_tasks/` 已加入忽略列表

## 任务状态

- [x] 审查报告迁移到专属目录
- [x] 专属目录已纳入 `.gitignore`
- [x] 批次A-前端：修复轨迹采样中驾驶风格字段漂移问题
- [x] 批次A-后端/仿真：修复 ML schema、排队规则、门架 ID 问题
- [x] 验证：`python -m py_compile` 通过，前端 `driverStyle` 旧错误已消失；`npm run build` 仍有仓库既有 TypeScript 错误

## 说明

- 以上条目只记录当前分支上的实际状态
- 每完成一个小任务，需要单独提交 git commit
- 批次A 完成后，会在此文件中把对应条目标记为完成

## 批次B-优先做完成状态

- [x] 回放链路轻量化：`/output-file-info` 改为优先读取 `summary.json` 和 `manifest.json`，不再为元信息全量解码回放帧
- [x] 历史运行列表加速：`list_runs()` 与 `load_run_summary()` 优先读取摘要文件，不再为列表页重读 `data.json`
- [x] 前端仿真引擎减载：运行中不再高频向 Zustand 写入大数组，重数据只在完成态一次性注入
- [x] 工作流编辑器性能优化：节点/边变化改为延迟合并提交历史与自动保存，避免拖拽过程持续深拷贝
- [x] 规则历史窗口化：`event_history` 改为窗口化结构，限制时间窗口与事件数量上限