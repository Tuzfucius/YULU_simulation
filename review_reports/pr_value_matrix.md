# PR #6--#9 价值提取与处置记录

审阅日期：2026-07-31  
审阅基线：`main`（`7b8ea0a`）  
结论：四个 PR 均不直接合并或 cherry-pick。后续在 `agent/architecture-consolidation` 以小步提交重新实现已确认有价值的部分。

## 审阅依据

- PR #6 以 `main` 为基线；PR #7 以 #6 为基线；PR #8 以 #7 为基线；PR #9 以 `main` 为基线。
- 以实际代码差异和行为验证判断覆盖关系，不以提交祖先关系替代验证。
- PR #9 的严格检查失败：PowerShell 将正常的 stderr 日志当作错误；Python runner 使用脚本路径启动导致 `etc_sim` 导入失败，并且未正确处理 Windows 的 `npm.cmd`。
- 已手工验证 #9：受控 API 冒烟、退役执行接口 404、路径穿越拒绝、前端生产构建、`start.bat` 后端健康检查和前端访问均可通过。该结果不足以抵消下面的结构问题。

## 价值矩阵

| PR | 可复用部分 | 放弃原因 | 重建阶段 |
| --- | --- | --- | --- |
| #6 安全基线 | 文件路径安全校验、关闭宿主脚本执行、环境与启动健康检查思路 | 运行时替换 router，且保留失效实现；Windows 启动对已有 8000 端口会误判成功 | 基线与安全、后端收敛 |
| #7 统一配置 | 唯一 Pydantic 配置模型、跨字段校验、前后端默认值测试 | WebSocket 手工提取配置；旧嵌套格式和未知字段兼容会扩大长期维护面 | 领域协议、前端迁移 |
| #8 引擎运行时 | 显式 step 状态、终止边界、采样时钟测试 | WebSocket 未消费完成状态，可能忙循环；采样记录时刻语义不清；存在大面积格式改写 | 领域协议、后端收敛 |
| #9 集成候选 | API/仿真冒烟测试、FastAPI 弃用修复、报告与启动探活目标 | 严格 runner 不可用，包含上述问题，且把 #6--#8 的设计缺陷一起带入 | 基线与安全、收尾验证 |

## 关键问题与重建约束

1. `SimulationEngine` 初始化调用 `RoadNetwork.add_etc_gate(..., gate_id=...)`，而现有方法不接受 `gate_id`，当前主线已无法构造引擎。先修复稳定门架标识契约。
2. Python 后端是唯一仿真运行时。删除前端 `SimulationEngine.ts`、前端车辆和重复物理逻辑；浏览器只维护 WebSocket 会话状态和可视化数据。
3. 内部 Python 模型只使用 snake_case，HTTP/WebSocket JSON 只使用 camelCase。仅保留一个 Pydantic `SimulationConfig` 和一个前端 TypeScript 类型，不接受历史嵌套格式、旧 localStorage 或未知字段。
4. 删除 `/api/code/*`、`/api/files/scripts/*`、数据包动态 Python 执行、脚本编辑/运行界面和 `custom_script` 工作流节点。文件 API 只访问受控配置、结果和历史记录。
5. `step()` 必须返回明确的 `running`、`completed`、`time_limit_reached`、`failed` 或 `stopped` 状态。采样定义为首次达到截止时间的实际 tick，并由 CLI、WebSocket 与测试共用。
6. 根目录 `模拟车流.py` 与 Notebook 仅作历史资料保留，本轮不接入运行链。

## PR 处置

本报告提交后关闭 #6--#9，保留远端分支用于追溯；待新的维护 PR 通过验收并由人工确认后，再统一删除旧远端维护分支。
