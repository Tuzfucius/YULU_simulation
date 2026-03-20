# 代码审查报告（2026-03-20）

## 审查范围

本次审查覆盖以下模块：

- `etc_sim/backend/` 后端 API、存储、WebSocket、图表与运行历史
- `etc_sim/frontend/src/` 前端页面、状态管理、前端仿真引擎
- `etc_sim/core/`、`etc_sim/simulation/`、`etc_sim/models/`、`etc_sim/utils/` 仿真内核与规则引擎

审查目标：

- 识别冗余代码、重复职责、屎山代码与死代码
- 分析性能瓶颈、时间复杂度与空间复杂度
- 识别模块化不足、全局状态污染与可维护性风险
- 保持原有功能不变前提下，给出后续优化方向

## 本次核验

执行过的关键核验：

- `git status --short --branch`
- `git ls-files`
- `pytest -q`
- `npm run build`

当前可验证结论：

- `pytest -q` 在仓库根目录无法正常完成收集，报错与 Windows 特殊路径 `nul` 有关
- `npm run build` 失败，前端当前存在较多 TypeScript 类型错误，说明前后端模型与 store 类型已经出现漂移

## 最高优先级问题（P1）

### 1. 回放读取路径会完整物化整次运行帧数据，且重复复制静态几何

位置：

- `etc_sim/backend/api/files.py:184-198`
- `etc_sim/backend/api/files.py:261-309`
- `etc_sim/backend/api/files.py:337-347`

问题：

- `_attach_gates_and_geometry()` 把同一份 `etcGates` 和 `pathGeometry` 写入每一帧
- `_get_frames_for_file()` 每次都完整读取 `data.json`，再把整段轨迹转换为帧
- 仅查询元信息的接口也会走整帧转换路径

影响：

- 单次请求时间复杂度接近 `O(总轨迹记录数)`
- 缓存最多保留 3 份完整帧集，空间复杂度放大明显
- 运行历史越大，`/output-file-info`、分页读取、回放相关接口越慢

建议：

- 将几何信息提升到响应顶层或 `manifest`
- 元信息接口仅依赖 `summary.json`、`manifest.json` 与轨迹记录数
- 分页接口改为按块解码，不要先完整构建全量 `frames`

### 2. 工作流规则引擎使用进程级可变单例，存在跨会话串扰

位置：

- `etc_sim/backend/api/workflows.py:29-33`
- `etc_sim/backend/api/workflows.py:134-226`
- `etc_sim/backend/api/workflows.py:378-401`
- `etc_sim/backend/core/websocket_manager.py:34`
- `etc_sim/backend/core/websocket_manager.py:265-270`

问题：

- `_standalone_engine` 在模块加载时创建
- 工作流编辑接口直接修改该单例
- 仿真启动时又直接从该单例读取规则

影响：

- 一个用户修改规则会影响另一个用户后续启动的仿真
- 进程重启会丢失状态
- 多 worker 部署下状态不一致

建议：

- 以工作流文件或版本快照作为事实来源
- 仿真启动时显式加载目标工作流快照
- 规则引擎实例只保留在会话内，不共享可变对象

### 3. ML 数据集导出字段不一致，导出功能实际失效

位置：

- `etc_sim/models/ml_feature_extractor.py:21-23`
- `etc_sim/models/ml_feature_extractor.py:101-121`
- `etc_sim/models/ml_feature_extractor.py:173-176`
- `etc_sim/models/ml_feature_extractor.py:213`
- `etc_sim/simulation/engine.py:449-462`

问题：

- `build_dataset()` 使用的特征列为 `flow/density/avg_speed`
- 实际特征提取输出为 `flow_in/flow_out/avg_speed_out/delta_t_mean/...`
- 列名不匹配后被上层静默吞掉，最终返回空数据集

影响：

- 机器学习数据集提取、训练前准备链路存在硬性失效

建议：

- 统一特征 schema
- 由提取阶段显式返回可用特征列
- 移除静默降级，改为明确报错

### 4. 排队状态已计算但未注入规则上下文，默认规则“严重排队”永远不会触发

位置：

- `etc_sim/simulation/engine.py:305-307`
- `etc_sim/simulation/engine.py:324-342`
- `etc_sim/models/alert_rules.py:504-513`
- `etc_sim/models/alert_conditions.py:325-333`

问题：

- 仿真引擎已检测 `queue_state`
- 但构造 `AlertContext` 时传入的是 `queue_lengths={}`

影响：

- 规则引擎结果失真
- 默认规则中存在死规则

建议：

- 将 `queue_state` 中的排队长度映射到 `queue_lengths`
- 若短期不支持，删除或禁用当前不可达规则

### 5. 非整数门架位置会发生门架 ID 冲突

位置：

- `etc_sim/simulation/engine.py:115-128`
- `etc_sim/simulation/engine.py:263-271`

问题：

- 支持 `custom_gantry_positions`
- 但运行期门架 ID 通过 `int(position_km)` 生成
- 例如 `3.2km` 与 `3.8km` 都会变成 `G03`

影响：

- ETC 交易统计串线
- 异常检测串线
- 规则引擎门架绑定失真

建议：

- 在门架创建时生成稳定唯一 ID
- 运行期直接引用该 ID，不要从位置反推

## 中优先级问题（P2）

### 6. 仿真主循环仍存在多层重复扫描，常数成本过高

位置：

- `etc_sim/simulation/engine.py:212-239`
- `etc_sim/simulation/engine.py:256-257`
- `etc_sim/simulation/engine.py:263-271`
- `etc_sim/simulation/engine.py:305-310`
- `etc_sim/utils/spatial_index.py:215-237`
- `etc_sim/core/vehicle.py:244-295`
- `etc_sim/core/vehicle.py:410-535`

问题：

- 虽然引入了空间索引，但每步仍重复做多轮扫描
- `Vehicle.update()` 内部继续线性找前车、后车、换道可行性与影响源
- `dict(blocked_lanes)` 在逐车复制
- 幽灵拥堵检测与排队检测又重复全量遍历
- 门架检测当前为 `O(车辆数 × 门架数)`

影响：

- 不是裸 `O(N^2)`，但高常数叠加明显
- 车辆数、门架数和仿真步数一大，吞吐会快速下降

建议：

- 在空间索引层一次性给出 leader/follower/邻道最近车
- 门架检测改为“下一门架索引”推进，而不是每步扫全部门架
- `blocked_lanes` 改为共享只读结构
- 幽灵拥堵和排队检测复用已排序结果或索引结果

### 7. 多个高频结果列表无界增长，空间复杂度接近 `O(车辆数 × 仿真步数)`

位置：

- `etc_sim/simulation/engine.py:95-104`
- `etc_sim/simulation/engine.py:277-322`
- `etc_sim/simulation/engine.py:346-357`
- `etc_sim/simulation/engine.py:417-438`

问题：

- `trajectory_data`
- `segment_speed_history`
- `safety_data`
- `rule_engine_events`
- `finished_vehicles`

以上结构全部无界累积，导出时还会再复制一遍

影响：

- 长时间仿真和大规模车流下，内存峰值会明显放大

建议：

- 高频采样数据分块落盘或流式写出
- 导出阶段禁止整表复制
- 将图表层与持久化层解耦，避免“一份给分析、一份给导出”双持有

### 8. 规则历史为无界列表，最近事件查询每步线性扫描

位置：

- `etc_sim/models/alert_rules.py:324-380`
- `etc_sim/simulation/engine.py:339-341`

问题：

- `event_history` 为无界 `list`
- `get_recent_events()` 每个仿真步都会线性扫描整个历史

影响：

- 总复杂度会向 `O(仿真步数 × 历史事件数)` 退化

建议：

- 改为按时间窗口维护的 `deque`
- 追加新事件时顺手淘汰过期事件

### 9. 前端运行中反复构造大轨迹数组并塞入 Zustand，GC 与重渲染压力过大

位置：

- `etc_sim/frontend/src/engine/SimulationEngine.ts:244`
- `etc_sim/frontend/src/engine/SimulationEngine.ts:293`
- `etc_sim/frontend/src/engine/SimulationEngine.ts:657`
- `etc_sim/frontend/src/engine/SimulationEngine.ts:1072`

问题：

- `runLoop()` 在 turbo 模式下高频调度
- `prepareTrajectorySamples()` 会反复遍历并重映射整个 `trajectoryData`
- `updateUI()` 再把大数组写入 store

影响：

- 单次刷新复杂度接近 `O(T + S)`
- 整个运行过程接近 `O(K × (T + S))`
- 直接放大序列化、GC 与组件重渲染成本

建议：

- 采样改为增量维护
- 运行中 store 只保留轻量摘要
- 面板真正需要明细时再拉取或计算

### 10. 工作流编辑器对每次微小变化都做整图深拷贝与落盘

位置：

- `etc_sim/frontend/src/stores/workflowStore.ts:19-20`
- `etc_sim/frontend/src/stores/workflowStore.ts:499-509`
- `etc_sim/frontend/src/stores/workflowStore.ts:511-540`
- `etc_sim/frontend/src/stores/workflowStore.ts:545-549`
- `etc_sim/frontend/src/components/pages/WorkflowPage.tsx:214`

问题：

- `deepClone()` 基于 `JSON.parse(JSON.stringify(...))`
- `_pushHistory()`、`undo()`、`redo()` 都对整张图深拷贝
- `setNodes()`、`setEdges()` 每次变化都入历史并触发 autosave

影响：

- 拖拽期间时间复杂度接近 `O(K × (V + E))`
- 空间复杂度接近 `O(MAX_HISTORY × (V + E))`

建议：

- 历史记录改为事务化提交，只在拖拽结束时入栈
- 自动保存增加节流
- 使用结构共享或差量记录，而非每次完整 JSON 序列化

### 11. 历史运行列表会逐个重读完整 `data.json`

位置：

- `etc_sim/backend/services/run_repository.py:362-374`
- `etc_sim/backend/services/run_repository.py:377-408`

问题：

- 即使已有 `summary.json`，仍会优先读 `data.json` 重建摘要

影响：

- `/api/runs` 成本接近 `O(所有 data.json 总大小)`

建议：

- 以 `summary.json` 与 `manifest.json` 为主
- 仅在缺失或版本不兼容时迁移重建

### 12. 后端存储层会原地修改调用者结果对象

位置：

- `etc_sim/backend/services/storage.py:95-118`
- `etc_sim/backend/core/websocket_manager.py:357-400`

问题：

- `save_results()` 会注入 `_metadata`
- 会 `pop('trajectory_data')`
- 但调用方随后继续复用同一对象

影响：

- 结果对象在保存前后语义不一致
- 调试和前后端联调容易出现“保存后字段消失”的副作用

建议：

- 存储层始终处理副本
- 调用方只拿不可变结果对象

### 13. Zustand 订阅粒度过粗，仿真高频更新会触发整页重渲染

位置：

- `etc_sim/frontend/src/App.tsx:42`
- `etc_sim/frontend/src/components/ConfigPanel.tsx:102`
- `etc_sim/frontend/src/components/ResultsPanel.tsx:11`
- `etc_sim/frontend/src/components/ChartsPanel.tsx:27`
- `etc_sim/frontend/src/components/pages/WorkflowPage.tsx:67`
- `etc_sim/frontend/src/components/workflow/NodePropertiesPanel.tsx:27`

问题：

- 多个大组件直接整体订阅 store，而不是 selector

影响：

- `setProgress`、`setStatistics`、日志追加和工作流变更会让整个页面链路重渲染

建议：

- 全面改为 selector 订阅最小字段
- 大页面拆为更小的纯展示组件

## 低优先级问题（P3）

### 14. 前端轨迹采样字段名漂移，驾驶风格被错误降级为 `normal`

位置：

- `etc_sim/frontend/src/engine/SimulationEngine.ts:1076-1077`
- `etc_sim/frontend/src/engine/Vehicle.ts:52`
- `etc_sim/frontend/src/engine/Vehicle.ts:119`

问题：

- 采样处读取 `v.style`
- 实际字段为 `driverStyle`

影响：

- 驾驶风格图表与后端分析被污染

建议：

- 统一车辆领域模型字段命名

### 15. 图表面板每次渲染都会强制刷新图片 URL，轮询也未做完整清理

位置：

- `etc_sim/frontend/src/components/ChartsPanel.tsx:84`
- `etc_sim/frontend/src/components/ChartsPanel.tsx:97`
- `etc_sim/frontend/src/components/ChartsPanel.tsx:260`
- `etc_sim/frontend/src/components/ChartsPanel.tsx:345`

问题：

- `?t=${Date.now()}` 放在 render 中
- 轮询递归使用裸 `setTimeout`

影响：

- 浏览器会把所有图片视为新资源反复下载
- 存在卸载后继续更新状态的风险

建议：

- 只在显式刷新时更新 `refreshToken`
- 保存 timeout id 并在 cleanup 中清理

### 16. 冗余 UI 与空壳 API 增加维护噪音

位置：

- `etc_sim/frontend/src/App.tsx:75`
- `etc_sim/frontend/src/App.tsx:83`
- `etc_sim/frontend/src/components/ConfigPanel.tsx:453`
- `etc_sim/backend/api/simulations.py:12-99`
- `etc_sim/backend/main.py:101-103`

问题：

- `SimulationPage` 重复渲染两次 `ResultsPanel`
- `ConfigPanel` 存在死控件
- `/api/simulations` 与真实运行历史链路脱节

影响：

- 造成直接冗余渲染
- 误导维护者与前端调用方

建议：

- 删除冗余面板与死控件
- 删除或接管空壳 API

## 架构层结论

### 1. 前后端存在双仿真引擎，领域模型已经开始漂移

位置：

- `etc_sim/simulation/engine.py`
- `etc_sim/core/vehicle.py`
- `etc_sim/frontend/src/engine/SimulationEngine.ts`
- `etc_sim/frontend/src/engine/Vehicle.ts`

结论：

- 当前项目同时维护 Python 仿真引擎和 TypeScript 仿真引擎
- 两套实现都较重，字段命名、统计口径与结果结构已经出现漂移
- `npm run build` 中的类型错误就是这种漂移的外在表现

建议：

- 明确单一事实来源
- 若后端为权威，则前端只做渲染与轻量播放
- 若必须共享领域对象，建议抽出共享 schema 与类型生成

### 2. 全局状态使用过多，模块边界不清晰

典型位置：

- `backend/api/workflows.py` 中的 `_standalone_engine`
- `backend/api/charts.py` 中的 `LATEST_BATCH_DIR`
- `backend/api/prediction.py` 中的 `current_predictor`
- `backend/api/simulations.py` 中的 `_simulations_db`

结论：

- 当前不少状态被放在模块级全局变量里
- 对单用户开发方便，但对并发、多会话、多 worker 很不稳定

建议：

- 按“会话态、持久态、缓存态”三类重新收敛状态归属
- 避免把业务真相寄存在模块级变量中

## 推荐优化顺序

1. 先修正确性问题：ML 数据集字段对齐、排队规则失效、门架 ID 冲突、前端驾驶风格字段漂移
2. 再拆性能热点：回放全量物化、前端大数组写 store、规则历史无界扫描、仿真主循环重复扫描
3. 然后做模块收敛：去掉全局单例、收敛空壳 API、统一前后端领域模型
4. 最后补工程健康：修复 TypeScript 构建错误、让 `pytest` 能在仓库根目录正常运行

## 建议的下一步执行方案

可按以下三个批次推进：

- 批次 A：只修正确性，不改架构
- 批次 B：只修回放链路和前端 store 热点
- 批次 C：统一工作流状态、图表批次状态与仿真会话状态

如果进入落地阶段，建议每个批次独立提交，避免把“功能修复”和“架构重构”混在一个 commit 中。
