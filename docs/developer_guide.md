# 开发者指南

本文档用于说明这个仓库当前的开发入口、目录分工和扩展落点。内容只保留与源码直接相关的部分。

## 1. 开发环境

仓库的推荐环境是 Conda，Windows 侧优先使用 `low_numpy`：

```bash
conda env create -f etc_sim/environment.yml
conda activate low_numpy
```

`environment.yml` 中当前的关键版本是：

- Python 3.11
- Node.js 20
- `pip install -r requirements.txt`

前端依赖：

```bash
cd etc_sim/frontend
npm install
```

## 2. 启动方式

### 2.1 一键启动

- Windows：`etc_sim/start.bat`
- Linux / macOS：`etc_sim/start.sh`

脚本会先启动后端，再启动前端开发服务器。

### 2.2 手动启动

后端：

```bash
cd etc_sim
python main.py
```

或者直接运行 Web 服务：

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

前端：

```bash
cd etc_sim/frontend
npm run dev
```

## 3. 目录分工

### 3.1 后端

- `backend/main.py`
  FastAPI 主入口，负责挂载路由、初始化 WebSocket 和存储服务。
- `backend/api/`
  所有 REST 和 WebSocket 路由。
- `backend/core/`
  WebSocket 管理器等核心运行组件。
- `backend/services/`
  存储、运行仓储、轨迹编码等基础服务。
- `backend/models/`
  接口 schema、数据库和请求响应模型。
- `backend/plotter.py`
  图表生成逻辑，和 `charts`、`speed_profile` 等可视化功能相关。

### 3.2 仿真核心

- `simulation/`
  仿真主循环与车辆投放。
- `core/`
  车辆、跟驰、换道等微观模型。
- `road/`
  路网、路段和门架结构。
- `models/`
  异常检测、环境、告警规则、特征提取等分析模型。
- `config/`
  仿真参数与默认配置。
- `utils/`
  空间索引、日志和工具函数。

### 3.3 前端

- `frontend/src/App.tsx`
  一级页面路由和导航。
- `frontend/src/components/pages/`
  页面级组件。
- `frontend/src/components/`
  复用面板、图表、编辑器和屏幕组件。
- `frontend/src/stores/`
  Zustand 状态管理。
- `frontend/src/engine/`
  前端侧仿真或回放辅助逻辑。

## 4. 新增功能的落点

### 4.1 新增后端 API

1. 在 `backend/api/` 新建模块。
2. 在 `backend/main.py` 中注册路由前缀。
3. 如果接口会被前端复用，再同步更新 `frontend/src/config/api.ts` 或相关调用点。

### 4.2 新增页面

1. 在 `frontend/src/components/pages/` 新建页面组件。
2. 在 `frontend/src/App.tsx` 的导航配置中注册路由。
3. 如果页面依赖全局状态，再在 `stores/` 中增加最小必要切片。

### 4.3 新增模型

1. 如果是交通机理，优先放在 `core/`、`simulation/` 或 `models/`。
2. 如果是规则和告警，优先放在 `models/alert_*` 或 `models/alert_conditions*`。
3. 如果是图表派生逻辑，优先放在 `backend/plotter.py` 或 `backend/api/charts.py`。

## 5. 测试与验证

### 5.1 后端

- `python main.py`
- `python -m pytest` 或仓库已有的单测文件

当前仓库里已经存在的测试包括：

- `backend/test_plotter_speed_profile.py`
- `backend/test_plotter_exclusivity.py`
- `backend/services/test_trajectory_storage.py`

### 5.2 前端

- `npm run build`
- 关键页面手工检查

### 5.3 变更原则

- 不要在文档里写未挂载页面是主流程。
- 不要把旧环境名写成当前事实。
- 新增内容优先保持模块边界清晰，避免把规则、图表、回放和存储逻辑混在一个文件里。
