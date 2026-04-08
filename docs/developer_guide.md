# 开发者指南

本文档只保留当前仓库里真正可用的开发、扩展和调试方式。

---

## 1. 环境准备

当前推荐使用 Conda。

### 后端与仿真

```bash
conda env create -f etc_sim/environment.yml
conda activate low_numpy
```

`environment.yml` 里已经包含 Python 3.11 和 Node.js 20。若环境已存在，可直接激活。

### 前端依赖

```bash
cd etc_sim/frontend
npm install
```

---

## 2. 启动方式

### 2.1 一键启动

Windows 下优先使用 [etc_sim/start.bat](/E:/Project/yulu/etc_sim/start.bat)。

它会：

1. 检查 Node.js。
2. 使用 `low_numpy` 环境启动后端。
3. 安装前端依赖。
4. 启动 Vite 开发服务器。

### 2.2 手动启动

后端：

```bash
cd etc_sim
python main.py
```

或者：

```bash
uvicorn etc_sim.backend.main:app --host 0.0.0.0 --port 8000
```

前端：

```bash
cd etc_sim/frontend
npm run dev
```

---

## 3. 目录职责

- `etc_sim/simulation/`
  - 仿真主循环、车辆投放和引擎入口。
- `etc_sim/core/`
  - IDM、MOBIL、车辆对象等底层机制。
- `etc_sim/models/`
  - 告警规则、异常检测、环境模型、特征提取和预测相关模型。
- `etc_sim/road/`
  - 路网、路段、门架和拓扑结构。
- `etc_sim/backend/`
  - FastAPI 路由、历史运行、文件服务、图表、工作流和预测接口。
- `etc_sim/frontend/`
  - 页面、图表、状态管理和可视化引擎。

---

## 4. 常见扩展点

### 4.1 新增后端接口

1. 在 `etc_sim/backend/api/` 下新增路由文件。
2. 在 `etc_sim/backend/main.py` 中挂载 `include_router`。
3. 如果返回结构会被前端使用，补充对应的 TypeScript 类型。
4. 更新 [docs/system_working_principles.md](./system_working_principles.md) 的 API 索引。

### 4.2 新增仿真参数

1. 在 `etc_sim/config/parameters.py` 中添加字段。
2. 在 `to_dict()` 和 `from_dict()` 路径里同步。
3. 若参数影响结果文件或历史摘要，更新存储文档。
4. 若参数影响前端展示，补充页面说明或控件说明。

### 4.3 新增告警规则或工作流节点

1. 后端规则逻辑放在 `etc_sim/models/`。
2. 工作流路由和规则文件逻辑放在 `etc_sim/backend/api/workflows.py`。
3. 前端节点定义放在 `etc_sim/frontend/src/stores/workflowStore.ts` 和对应组件里。
4. 如规则影响仿真结果导出，需要同步 `SimulationEngine.export_to_dict()`。

### 4.4 新增图表

1. 在 `etc_sim/backend/api/charts.py` 注册图表元数据。
2. 在 `etc_sim/backend/plotter.py` 增加生成函数。
3. 在前端新增或复用图表组件。
4. 确保图表名称、说明和前端入口一致。

### 4.5 新增页面

1. 在 `etc_sim/frontend/src/components/pages/` 创建页面组件。
2. 在 `etc_sim/frontend/src/App.tsx` 注册路由。
3. 若页面面向客户展示，也要补充 [docs/presentation_script.md](./presentation_script.md)。

---

## 5. 调试建议

- 后端优先看 `etc_sim/backend/main.py` 的路由挂载和异常处理。
- 仿真逻辑优先看 `etc_sim/simulation/engine.py` 的 `step()` 和 `export_to_dict()`。
- 跟驰和换道问题优先看 `etc_sim/core/car_following.py` 与 `etc_sim/core/lane_change.py`。
- 历史存储问题优先看 `etc_sim/backend/services/run_repository.py`、`storage.py` 和 `trajectory_storage.py`。
- 前端页面问题优先看 `etc_sim/frontend/src/App.tsx` 和对应页面组件。

---

## 6. 约束

- 代码和文档必须同步更新。
- 不要把未实现的模型写进文档。
- 新接口优先复用现有目录和数据结构，避免再引入一套并行概念。
