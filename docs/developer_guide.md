# 开发者指南

本文档说明仓库当前的开发环境、运行入口、目录职责和安全边界。内容以 `main` 分支实际代码为准。

## 1. 开发环境

仓库统一使用 Conda 环境 `yulu-sim`：

```bash
conda env create -f etc_sim/environment.yml
conda activate yulu-sim
```

`environment.yml` 固定以下关键版本：

- Python 3.11
- Node.js 20
- Python 依赖来自 `etc_sim/requirements.txt`

前端依赖使用锁文件安装：

```bash
cd etc_sim/frontend
npm ci
```

不要继续使用历史环境名 `low_numpy`，也不要在 README 或脚本中单独创建 Python 3.13 环境。

## 2. 启动方式

### 2.1 一键启动

- Windows：`etc_sim/start.bat`
- Linux / macOS：`etc_sim/start.sh`

两个脚本都会：

1. 检查 Conda；
2. 在缺少环境时创建 `yulu-sim`；
3. 在缺少 `node_modules` 时安装前端依赖；
4. 启动 FastAPI 后端；
5. 启动 Vite 前端。

Linux / macOS 脚本还会等待后端健康检查通过，并在退出时关闭后端进程。

### 2.2 手动启动 Web 后端

在仓库根目录执行：

```bash
conda activate yulu-sim
python -m uvicorn etc_sim.backend.main:app --reload --host 0.0.0.0 --port 8000
```

后端入口是 `etc_sim/backend/main.py`。API 文档位于：

```text
http://127.0.0.1:8000/api/docs
```

### 2.3 手动启动前端

```bash
conda activate yulu-sim
cd etc_sim/frontend
npm run dev
```

前端默认地址：

```text
http://localhost:3000
```

### 2.4 离线 CLI 仿真

`etc_sim/main.py` 是离线仿真入口，不会启动 FastAPI：

```bash
conda activate yulu-sim
python -m etc_sim.main
```

导出默认配置：

```bash
python -m etc_sim.main --json
```

## 3. 安全边界

以下旧接口已在恢复维护阶段停用：

- `/api/code/*`
- `/api/files/scripts/*`

这些旧接口曾允许使用后端宿主机权限执行 Python、修改脚本、管理 Conda 环境和安装 pip 包。它们缺少鉴权、文件系统隔离、网络隔离和资源限制，因此禁止重新直接挂载。

未来如需恢复用户脚本分析，必须至少满足：

- 独立容器或独立低权限 Worker；
- 只读挂载仿真数据；
- 默认禁用网络；
- CPU、内存、进程数和运行时间限制；
- 明确的允许依赖列表；
- 不允许操作宿主机 Conda 环境。

文件路径参数必须先经过统一安全校验，不得继续使用字符串 `startswith()` 判断目录包含关系。

## 4. 目录职责

### 4.1 后端

- `etc_sim/backend/main.py`
  FastAPI 主入口，负责中间件、异常处理、路由挂载、WebSocket 和存储服务初始化。
- `etc_sim/backend/api/`
  REST 与 WebSocket 路由。
- `etc_sim/backend/core/`
  WebSocket 管理器及运行时协调组件。
- `etc_sim/backend/services/`
  存储、运行记录仓储和轨迹编码。
- `etc_sim/backend/models/`
  API 请求与响应模型。
- `etc_sim/backend/security.py`
  无依赖的安全校验辅助函数。
- `etc_sim/backend/plotter.py`
  图表生成逻辑。

### 4.2 仿真核心

- `etc_sim/simulation/`
  Python 仿真主循环和车辆投放。
- `etc_sim/core/`
  车辆、IDM 跟驰和 MOBIL 换道模型。
- `etc_sim/road/`
  道路、路段和 ETC 门架结构。
- `etc_sim/models/`
  异常检测、环境、告警规则和特征提取。
- `etc_sim/config/`
  仿真配置与默认参数。
- `etc_sim/utils/`
  空间索引和通用工具。

### 4.3 前端

- `etc_sim/frontend/src/App.tsx`
  当前一级页面路由和应用布局入口。
- `etc_sim/frontend/src/components/pages/`
  页面级组件。
- `etc_sim/frontend/src/components/`
  可复用面板、图表和编辑器。
- `etc_sim/frontend/src/stores/`
  Zustand 状态管理。
- `etc_sim/frontend/src/engine/`
  当前仍存在前端侧仿真实现。恢复维护计划将逐步收敛为 Python 后端唯一正式引擎。

## 5. 新增功能的落点

### 5.1 新增后端 API

1. 在 `etc_sim/backend/api/` 新建或修改模块；
2. 在 `etc_sim/backend/main.py` 注册路由；
3. 使用 Pydantic 模型校验所有外部输入；
4. 文件系统操作必须经过安全路径解析；
5. 前端需要调用时，同步更新 `frontend/src/config/api.ts` 或对应服务层。

不得新增可直接执行客户端代码或 Shell 命令的 API。

### 5.2 新增页面

1. 在 `frontend/src/components/pages/` 新建页面；
2. 在路由配置中注册；
3. 只在确有跨页面共享需求时增加全局状态；
4. 页面不得硬编码后端主机地址。

### 5.3 新增模型

- 交通机理优先放在 `core/`、`simulation/` 或 `models/`；
- 规则和告警优先放在 `models/alert_*` 或 `models/alert_conditions*`；
- 图表派生逻辑放在分析服务或 `backend/plotter.py`；
- 不要在前端和 Python 后端分别复制同一套正式物理模型。

## 6. 测试与验证

### 6.1 安全基线测试

```bash
conda activate yulu-sim
python -m unittest etc_sim.backend.test_security_baseline
```

该测试验证：

- 主机级代码执行路由未注册；
- 旧脚本接口未注册；
- 正常文件浏览接口仍然存在；
- 绝对路径、父目录和 NUL 字节路径会被识别为不安全。

### 6.2 现有后端测试

仓库当前已有部分测试：

- `etc_sim/backend/test_plotter_speed_profile.py`
- `etc_sim/backend/test_plotter_exclusivity.py`
- `etc_sim/backend/services/test_trajectory_storage.py`

统一 pytest、覆盖率和 CI 工具链将在后续维护 PR 中补齐。

### 6.3 前端验证

```bash
cd etc_sim/frontend
npm ci
npm run build
```

关键页面仍需进行基本手工检查，后续再引入 Vitest 和 Playwright。

## 7. 变更原则

- 每个 PR 只处理一个清晰的问题域；
- 修改核心模型前先增加能够复现问题的回归测试；
- 文档必须区分 Web 后端入口与离线 CLI 入口；
- 不把未挂载页面或历史功能写成当前主流程；
- 避免把规则、图表、回放、存储和执行逻辑集中到同一文件；
- 不使用空实现、硬编码零值或无法验证的统计数据伪装成功能完成。

## 8. 常用命令

```bash
# 创建环境
conda env create -f etc_sim/environment.yml

# 激活环境
conda activate yulu-sim

# 启动 Web 后端
python -m uvicorn etc_sim.backend.main:app --reload --host 0.0.0.0 --port 8000

# 运行离线仿真
python -m etc_sim.main

# 导出默认配置
python -m etc_sim.main --json

# 运行安全基线测试
python -m unittest etc_sim.backend.test_security_baseline

# 构建前端
cd etc_sim/frontend && npm ci && npm run build
```
