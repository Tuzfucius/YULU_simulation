# ETC 交通仿真系统 (ETC Traffic Simulation)

高速公路 ETC 车流仿真、预警规则引擎与微观异常分析平台

## 项目简介

本项目是一个基于 IDM（智能驾驶员模型）和 MOBIL 换道模型的高速公路交通仿真系统。不仅支持多种车辆模型、气候与坡度影响，还囊括了可视化的事件预警规则引擎及基于 FastAPI + React 的现代化响应式界面。它能够精准模拟车辆在交通突发事件中的激波反应、延误与拥堵恢复表现。

---

## 功能特性

| 特点核心 | 详情描述 |
| ------ | ------ |
| 🚗 **实时仿真可视化** | Canvas 渲染道路、车辆和 ETC 门架，支持动态极速模式与自适应时间控制 |
| 🔔 **智能预警规则引擎** | 可配置条件-动作规则，支持 9 种评估条件与 4 种输出动作 |
| 🎨 **可视化工作流编辑器** | React Flow 拖拽式规则设计，并支持模型参数阈值优化网格搜索 |
| 📊 **16种专业分析图表** | 时空图、基本图、拥堵恢复恢复过程图、车流微观画像等 |
| ⚙️ **微观场景自定义** | 支持自定义车流构成、驾驶风格（普通/激进/保守），天气与长上坡效应 |
| 交互式区间分析 | 交互式展示特定区间的速度、流量、密度趋势以及车辆轨迹散点图 |

---

## 快速开始

本项目包含了大量科学计算和分析包（如 numpy、scipy、matplotlib、pandas 等）。推荐使用 **Conda** 进行环境隔离：

### 1. 自动启动（推荐）

#### Windows 用户
只需在项目根目录双击执行 `start.bat`。（或者在命令行运行 `cd etc_sim && start.bat`）。
它会自动创建 `etc_sim` Conda 虚拟环境、拉取后端运行包、初始化前端模块依赖，并同步启动首尾服务。

#### Linux / MacOS 用户
```bash
cd etc_sim
chmod +x start.sh
./start.sh
```

### 2. 手动独立启动

**2.1 环境配置：**
```bash
conda create -n etc_sim python=3.13 -y
conda activate etc_sim
pip install -r etc_sim/requirements.txt
```

**2.2 启动 FastAPI 后端：**
```bash
cd etc_sim
python main.py
# 或以 uvicorn 方式：uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

**2.3 启动 Vite React 前端：**
```bash
cd etc_sim/frontend
npm install
npm run dev
```
之后在浏览器中打开: `http://localhost:3000`

---

## 预警规则引擎

引擎采用三层架构：`条件原子 → 规则组合 → 动作输出`。在前端的 `/workflow` 可视化工作流界面，您可以自由构建和拖拽您的告警链路。

预置规则包含例如：**拥堵检测、疑似事故预警、严重排队、ETC漏读异常、恶劣天气限速**。利用 `/evaluation` 页面，评估器将使用 F1 Score、Precision、Recall 等数据去匹配历史时空真值并优化最佳检视阈值。

---

## 文档指引与系统架构

详细系统内建指南与物理模型文档，已分类存放在 `docs/` 目录下。

- 📖 **[API 及开发者指南 (Developer Guide)](./docs/developer_guide.md)**
  涵盖项目配置约定、图表扩展、条件原子的编码修改方案以及系统各依赖组件结构与通信流。
- ⚙️ **[仿真物理机制 (Simulation Mechanics)](./docs/simulation_mechanics.md)**
  详细阐述 IDM 和 MOBIL 模型的底层运动学公式、动态边界检测算法原理，以及幽灵堵车（Phantom Traffic Jam）和天气干预系统的影响链路。

| 目录结构概览 | |
| --- | --- |
| `docs/` | 详细底层算法解释与开发者开发约定 |
| `etc_sim/backend/` | Python FastAPI 图表 API 与数据服务层 |
| `etc_sim/frontend/` | React 界面、可视化图表集与 Zustand 管理 |
| `etc_sim/models/` | 预警引擎、特征评估器、时空窗检测器 |
| `etc_sim/simulation/` | IDM 跟驰模拟物理引擎 |

---

## 结果导出形式
- **UI 可视化**：分析面板提供 16 种图层预览
- **JSON 支持**：`data/results/run_YYYYMMDD_HHMM.json` 保存每次参数运行的细节。
- **CSV 输出**：可用于后续导入任何离线建模训练库进行分析。

---

**License**
MIT
