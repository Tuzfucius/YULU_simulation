[English] | [简体中文](#简体中文)

# ETC Traffic Simulation System

A highway traffic simulation system based on IDM (Intelligent Driver Model) and MOBIL lane-changing models.

## Features

| Module | Description |
|--------|-------------|
| IDM Car Following | Intelligent driver model with multiple vehicle types |
| MOBIL Lane Change | Benefit-based lane change decisions |
| Anomaly Simulation | Vehicle anomaly events (stationary, fluctuation) |
| ETC Detection | ETC gantry detection effects |
| Visualization | 11 interactive charts with export |

## Quick Start

> **Important**: This project involves complex machine learning and data processing dependencies. For detailed, step-by-step environment setup instructions (including **Conda** virtual environment creation and package installation), please refer to the dedicated deployment guide:
> 👉 [**ETC Simulation Deployment & Environment Guide (etc_sim/README.md)**](./etc_sim/README.md)

### Option 1: Use One-Click Launcher (Recommended)

```bash
# Windows
cd etc_sim
start.bat

# Linux/Mac
cd etc_sim
chmod +x start.sh
./start.sh
```

Select option [1] to start the frontend, then open http://localhost:3000

### Option 2: Frontend + CLI Simulation

```bash
# Terminal 1: Start frontend
cd etc_sim/frontend
npm install
npm run dev

# Terminal 2: Run simulation
cd etc_sim
python main.py
```

### Option 3: Docker

```bash
cd etc_sim
docker-compose up -d
```

Open http://localhost:3000

## Documentation & Mechanics

For detailed information on the underlying physical models (IDM/Wiedemann 99 & MOBIL), environmental impact factors (weather, gradients), and the anomaly propagation mechanics, please refer to the dedicated documentation:

👉 [**Simulation Mechanics**](./etc_sim/docs/simulation_mechanics.md)

## Project Structure

```
etc_sim/
├── data/                          # 统一数据存储根目录
│   ├── config/                   # 用户仿真参数配置 (JSON)
│   ├── simulations/              # 每次仿真独立文件夹 (图表 + JSON数据)
│   ├── datasets/                 # 机器学习: 提取的训练集
│   ├── models/                   # 机器学习: 训练好的模型 (.joblib)
│   ├── road_map/                 # 自定义路网文件
│   └── layouts/                  # UI 布局预设
│
├── frontend/                     # React + Vite frontend
│   └── src/
│       ├── components/pages/     # 页面组件
│       │   ├── SimControlPage    # 仿真控制
│       │   ├── ReplayPage        # 俯视回放
│       │   ├── AlertDashboard    # 预警仪表盘
│       │   ├── ScenarioPage      # 场景模板
│       │   ├── PredictBuilder    # 时序预测工作台
│       │   └── ...
│       └── stores/               # Zustand 状态管理
│
├── backend/                      # FastAPI 后端
│   ├── api/                      # REST API 路由
│   │   ├── prediction.py         # 预测/训练/数据集提取
│   │   ├── files.py              # 文件浏览
│   │   ├── charts.py             # 图表管理
│   │   ├── custom_roads.py       # 路网编辑
│   │   └── ...
│   ├── core/                     # WebSocket 管理
│   └── services/                 # 存储服务
│
├── simulation/                   # 仿真引擎 (IDM/MOBIL)
├── models/                       # ML模型 (特征提取器/预测器)
├── config/                       # 仿真参数模块
├── road/                         # 路网模型
├── start.bat                     # Windows 一键启动
└── requirements.txt
```

## Pages

| Page | Function |
|------|----------|
| **Config** | Set parameters, save/load JSON, presets |
| **Run** | Start/pause/stop, progress bar, terminal |
| **Analysis** | 11 charts, export PNG/CSV, favorites |
| **Compare** | Overlay two results, diff stats |
| **Favorites** | Save/manage chart configs |
| **Settings** | Layout, theme, language |

## Charts

1. Speed Heatmap
2. Trajectory Space-Time
3. Anomaly Distribution
4. Congestion Recovery
5. Lane Change Analysis
6. Vehicle Type Distribution
7. Lane Distribution
8. Safety Analysis (TTC)
9. Cumulative Delay
10. Fundamental Diagram
11. ETC Performance

## Python CLI Usage

```bash
# Default config
python main.py

# With config file
python main.py config.json

# Export config
python main.py --json config.json
```

Results are saved to `data/results/sim_YYYYMMDD_HHMMSS.json`

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + ECharts
- **Backend**: Python 3.13 + NumPy + Pandas
- **State**: Zustand (persistent)
- **Deployment**: Docker, static build

## Requirements

- Python 3.13+
- Node.js 18+ (for frontend)
- Docker (optional)

## License

MIT

---

## 简体中文

# ETC 交通仿真系统

一个基于 IDM（智能驾驶员模型）和 MOBIL 换道模型的高速公路交通仿真系统。

## 特性

| 模块 | 描述 |
|------|------|
| IDM 跟驰 | 包含多种车型支持的智能驾驶员模型 |
| MOBIL 换道 | 基于收益的换道策略决策 |
| 异常模拟 | 模拟车辆异常事件（静止、波动） |
| ETC 检测 | ETC 门架检测效果模拟 |
| 可视化 | 11 种交互式图表及数据导出 |

## 快速开始

> **重要提示**：本项目包含了复杂的数值计算和机器学习依赖模块，推荐使用 **Conda** 构建纯净的虚拟环境予以隔离。
> 关于**如何从零构建 Conda 虚拟环境**以及详细的前后端架构依赖部署指引，请务必参阅子项目目录下的专属部署文档：
> 👉 [**《ETC 仿真系统详细部署与环境搭建指南》 (etc_sim/README.md)**](./etc_sim/README.md)

### 方式 1: 使用一键启动脚本 (推荐)

```bash
# Windows
cd etc_sim
start.bat

# Linux/Mac
cd etc_sim
chmod +x start.sh
./start.sh
```

选择选项 [1] 启动前端，然后访问 http://localhost:3000

### 方式 2: 前端 + 命令行仿真

```bash
# 终端 1: 启动前端
cd etc_sim/frontend
npm install
npm run dev

# 终端 2: 运行仿真
cd etc_sim
python main.py
```

### 方式 3: Docker

```bash
cd etc_sim
docker-compose up -d
```

访问 http://localhost:3000

## 项目文档与运算机制

项目深度模拟了真实世界的交通流动态变化。有关**跟驰模型 (IDM/Wiedemann 99)、换道模型 (MOBIL)、环境影响机制（天气、坡度）、异常车辆行为及其冲击传播机制**的具体参数设定与算法公式，请参阅专门的详细说明文档：

👉 [**《交通流模拟运算与机制》 (Simulation Mechanics)**](./etc_sim/docs/simulation_mechanics.md)

## 项目结构

```
etc_sim/
├── data/                      # 持久化数据存储
│   ├── config/               # 用户配置
│   ├── results/              # 仿真结果 (JSON)
│   ├── charts/               # 图表收藏
│   └── layouts/              # 布局预设
│
├── frontend/                 # React + Vite 前端
│   ├── src/
│   │   ├── components/       # 可复用组件
│   │   ├── pages/          # 页面组件
│   │   │   ├── ConfigPage.tsx    # 参数配置
│   │   │   ├── RunPage.tsx       # 仿真运行
│   │   │   ├── AnalysisPage.tsx  # 11 种图表
│   │   │   ├── ComparePage.tsx   # 结果对比
│   │   │   ├── FavoritesPage.tsx # 图表收藏
│   │   │   └── SettingsPage.tsx  # 设置页面
│   │   ├── stores/         # Zustand 状态管理
│   │   ├── types/          # TypeScript 类型定义
│   │   └── utils/          # 工具函数
│   ├── Dockerfile
│   └── package.json
│
├── config/                  # 配置模块
├── core/                   # 核心仿真引擎
├── models/                 # IDM, MOBIL, 异常模型
├── road/                   # 道路网络
├── simulation/             # 仿真控制
├── utils/                  # 工具函数
├── main.py                 # Python 命令行接口入口
├── start.bat              # Windows 启动脚本
├── start.sh               # Linux/Mac 启动脚本
├── docker-compose.yml
└── requirements.txt
```

## 页面功能

| 页面 | 功能 |
|------|----------|
| **配置** | 参数设置、保存/加载 JSON、预设管理 |
| **运行** | 启动/暂停/停止、进度展示、终端输出 |
| **分析** | 11 种图表、导出 PNG/CSV、收藏夹 |
| **对比** | 叠加两组结果进行对比、差异统计 |
| **收藏** | 管理保存的图表配置 |
| **设置** | 布局调整、主题色、语言设置 |

## 仿真图表

1. 速度热力图
2. 轨迹时空图
3. 异常分布图
4. 拥堵恢复过程
5. 换道分析
6. 车辆类型分布
7. 车道分布
8. 安全性分析 (TTC)
9. 累积延误
10. 基本图 (Fundamental Diagram)
11. ETC 性能表现

## Python 命令行用法

```bash
# 使用默认配置
python main.py

# 使用特定配置文件
python main.py config.json

# 导出默认配置
python main.py --json config.json
```

仿真结果将保存至 `data/results/sim_YYYYMMDD_HHMMSS.json`

## 技术栈

- **前端**: React 18 + TypeScript + Vite + Tailwind CSS + ECharts
- **后端**: Python 3.13 + NumPy + Pandas
- **状态**: Zustand (持久化存储)
- **部署**: Docker, 静态构建

## 系统要求

- Python 3.13+
- Node.js 18+ (用于前端开发)
- Docker (可选)

## 开源协议

MIT
