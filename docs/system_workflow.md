# 系统工作原理与运行链路

本文档描述恢复维护阶段的真实运行结构。它用于帮助维护者区分 Web 后端、离线 CLI、前端本地仿真和历史存储，避免把多个入口误认为同一条链路。

## 1. 当前系统组成

系统主要由以下部分构成：

1. React + Vite 前端；
2. FastAPI REST 与 WebSocket 后端；
3. Python `SimulationEngine`；
4. 前端 TypeScript 仿真实现；
5. 运行记录、轨迹和图表存储；
6. 预警规则、评估和预测模块。

当前仍存在一项明确的架构债务：浏览器侧和 Python 后端各自维护了一套仿真逻辑。恢复维护计划将在后续 PR 中让 Python 引擎成为唯一正式事实来源。在完成收敛前，调试结果必须注明使用的是哪一套引擎。

## 2. 运行入口

### 2.1 Web 后端

FastAPI 入口：

```text
etc_sim/backend/main.py
```

在仓库根目录启动：

```bash
conda activate yulu-sim
python -m uvicorn etc_sim.backend.main:app --reload --host 0.0.0.0 --port 8000
```

启动时会：

- 创建 `StorageService`；
- 创建 `WebSocketManager`；
- 注册 CORS；
- 挂载 REST 和 WebSocket 路由；
- 暴露 `/health`；
- 停用旧的主机级代码和脚本执行接口。

### 2.2 离线 CLI

离线入口：

```text
etc_sim/main.py
```

运行方式：

```bash
python -m etc_sim.main
```

该入口会读取配置、运行 Python 仿真引擎并将结果保存到：

```text
etc_sim/data/results/
```

它不会启动 FastAPI，也不会启动前端。

### 2.3 前端

前端入口：

```text
etc_sim/frontend/src/App.tsx
```

启动方式：

```bash
cd etc_sim/frontend
npm run dev
```

默认地址：

```text
http://localhost:3000
```

Vite 会将 `/api` 请求代理到 `http://127.0.0.1:8000`。

## 3. 当前主要运行链路

### 3.1 前端仿真控制页

当前 `/sim` 页面仍直接调用前端 `frontend/src/engine/SimulationEngine.ts`。浏览器本地推进车辆状态，并将结果写入 Zustand 状态。

因此当前页面上的实时结果不一定与 Python `SimulationEngine` 完全一致。任何物理模型修复在完成双引擎收敛前都需要检查两套实现。

### 3.2 后端 WebSocket 仿真

后端 WebSocket 会话使用 Python `SimulationEngine`：

```text
WebSocket INIT
    ↓
解析会话配置
    ↓
创建 Python SimulationEngine
    ↓
循环调用 engine.step()
    ↓
推送进度、车辆快照和日志
    ↓
保存运行结果
    ↓
发送 COMPLETE
```

恢复维护期间将继续修复该链路的配置校验、并发隔离和统计正确性。

### 3.3 离线仿真

```text
加载 JSON 配置或默认配置
    ↓
创建 SimulationEngine
    ↓
engine.run()
    ↓
export_to_dict()
    ↓
保存 JSON 结果
```

该链路适合快速回归和模型调试，但当前配置模型仍有重复定义问题，将由后续配置统一 PR 处理。

### 3.4 历史回放

Web 后端运行结果主要保存到：

```text
etc_sim/data/simulations/<run_id>/
```

典型文件包括：

```text
data.json
summary.json
manifest.json
trajectory.msgpack
```

回放和分析接口应优先通过 `run_id` 读取运行记录。旧的 `/api/files` 文件式接口只用于兼容，不应继续扩展新的业务能力。

## 4. 安全边界

以下旧接口已停用：

```text
/api/code/*
/api/files/scripts/*
```

停用原因：

- 可使用后端宿主机权限执行任意 Python；
- 可拼接并执行 Shell 命令；
- 可管理宿主机 Conda 环境；
- 可安装任意 pip 包；
- 缺少鉴权、沙箱和资源限制。

文件接口的相对路径参数会在进入端点前检查绝对路径、父目录组件和 NUL 字节。后续仍需逐步将所有文件端点迁移到统一的安全路径解析函数。

## 5. 数据目录

```text
etc_sim/data/
├── config/          配置文件
├── simulations/     Web 运行结果
├── results/         CLI 离线结果
├── datasets/        训练数据集
├── models/          训练模型
├── workflows/       工作流文件
├── charts/          图表与收藏
└── layouts/         页面布局
```

当前配置 API 仍存在内存存储和文件存储双轨制，后续将统一为明确的持久化仓储。

## 6. 主要 API 路由

| 前缀 | 作用 |
| --- | --- |
| `/api/configs` | 仿真配置 |
| `/api/simulations` | 仿真会话和结果 |
| `/api/ws` | WebSocket 控制 |
| `/api/runs` | 历史运行与回放 |
| `/api/analysis` | 统计分析 |
| `/api/charts` | 图表生成 |
| `/api/workflows` | 工作流和规则 |
| `/api/evaluation` | 规则评估 |
| `/api/prediction` | 数据集、模型和预测 |
| `/api/custom-roads` | 自定义路网 |
| `/api/files` | 旧式文件兼容接口 |

## 7. 维护顺序

系统恢复维护按以下顺序推进：

1. 安全和开发环境基线；
2. 配置模型统一；
3. 仿真终止、换道和采样正确性；
4. 异常、排队、拥堵和统计语义；
5. 持久化与轨迹分块；
6. 仿真 Worker 和前后端引擎收敛；
7. CI、测试和文档收尾。

在第 4 步完成前，不建议新增新的仿真功能或分析指标。
