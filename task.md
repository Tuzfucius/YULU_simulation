# 任务记录

## 当前分支

- 分支：`codex/batch1-engineering-baseline`
- 目标：执行批次 1，恢复工程基线，使测试与前端构建重新可控

## 批次 1 任务表

### T01 修复 `pytest` 根目录收集失败

- 优先级：P0
- 目标：让仓库根目录执行 `pytest -q` 时不再因 `E:/Project/yulu/nul` 收集失败
- 范围：
  - 仓库根目录测试发现配置
  - 与 `pytest` 收集规则相关的文件
- 验收标准：
  - `pytest -q` 可以正常开始收集并执行
  - 不再出现 `WindowsPath('E:/Project/yulu/nul')` 相关断言错误

### T02 修复前端 TypeScript 构建错误

- 优先级：P0
- 目标：恢复 `etc_sim/frontend` 的类型检查与构建能力
- 范围：
  - `etc_sim/frontend/src/`
  - 前端构建配置与类型定义
- 验收标准：
  - `cd etc_sim/frontend && npm run build` 通过

### T03 收敛前端仿真数据类型

- 优先级：P0
- 目标：解决 `store`、类型定义、组件之间字段漂移问题
- 范围：
  - `etc_sim/frontend/src/stores/simStore.ts`
  - `etc_sim/frontend/src/types/`
  - 使用仿真状态的组件与页面
- 验收标准：
  - `statistics`、`progress`、`simulationData` 等核心结构有统一类型
  - 不再存在组件读取不存在字段、将 `unknown` 直接当结构化对象使用的问题

## 执行顺序

1. 先修复 `pytest` 根目录收集失败
2. 再修复前端构建与类型错误
3. 最后统一做一次回归验证

## 当前状态

- [x] 批次 1 任务文档已整理
- [ ] T01 修复 `pytest` 根目录收集失败
- [ ] T02 修复前端 TypeScript 构建错误
- [ ] T03 收敛前端仿真数据类型
- [ ] 批次 1 回归验证完成

## 验证清单

- `pytest -q`
- `cd etc_sim/frontend && npm run build`

## 提交要求

- 每完成一个小任务，单独提交一次 `git commit`
- 提交信息需清晰表达任务目标与结果

## 执行结果（2026-03-22）

- [x] T01 修复 `pytest` 根目录收集失败
- [x] T02 修复前端 TypeScript 构建错误
- [x] T03 收敛前端仿真数据类型
- [x] 批次 1 回归验证完成

## 本批次验证结果

- `pytest -q`：5 项测试全部通过
- `cd etc_sim/frontend && npm run build`：构建通过

## 批次 2 首轮

### T04 收敛工作流运行态加载

- 优先级：P1
- 目标：去掉 WebSocket 仿真对进程级 `_standalone_engine` 的直接依赖
- 当前结果：
  - [x] 仿真启动改为按 `workflow_name/workflowName` 显式解析工作流
  - [x] 未指定时优先读取 `default.json`
  - [x] 若不存在默认工作流文件则回退到内置默认规则
  - [x] 已补运行态规则解析测试

### T08 修复存储层结果对象副作用

- 优先级：P1
- 当前结果：
  - [x] `save_results()` 已改为基于副本写入，不再原地修改调用方对象
  - [x] 已有测试覆盖输入对象不被污染

## 批次 2 首轮验证

- `pytest -q`：10 项测试全部通过
