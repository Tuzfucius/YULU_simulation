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

## Project Structure

```
etc_sim/
├── data/                      # Persistent data storage
│   ├── config/               # User configurations
│   ├── results/              # Simulation results (JSON)
│   ├── charts/               # Chart favorites
│   └── layouts/              # Layout presets
│
├── frontend/                 # React + Vite frontend
│   ├── src/
│   │   ├── components/       # Reusable components
│   │   ├── pages/          # Page components
│   │   │   ├── ConfigPage.tsx    # Configuration
│   │   │   ├── RunPage.tsx       # Simulation control
│   │   │   ├── AnalysisPage.tsx  # 11 charts
│   │   │   ├── ComparePage.tsx   # Result comparison
│   │   │   ├── FavoritesPage.tsx # Chart favorites
│   │   │   └── SettingsPage.tsx  # Settings
│   │   ├── stores/         # Zustand state management
│   │   ├── types/          # TypeScript definitions
│   │   └── utils/          # Utility functions
│   ├── Dockerfile
│   └── package.json
│
├── config/                  # Configuration modules
├── core/                   # Core simulation engine
├── models/                 # IDM, MOBIL, anomaly models
├── road/                   # Road network
├── simulation/             # Simulation engine
├── utils/                  # Utility functions
├── main.py                 # Python CLI entry point
├── start.bat              # Windows launcher
├── start.sh               # Linux/Mac launcher
├── docker-compose.yml
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
