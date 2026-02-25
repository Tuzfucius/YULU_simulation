# ETC 交通仿真系统 (ETC Traffic Simulation)

高速公路 ETC 车流仿真与异常分析平台

## 快速开始

本项目包含了复杂的数值计算和机器学习依赖，推荐使用 **Conda** 构建纯净的虚拟环境予以隔离。我们在项目中提供了 `requirements.txt`。

### 1. 环境准备与依赖安装

**① 创建并激活 Python 3.9 环境**
```bash
conda create -n low_numpy python=3.9 -y
conda activate low_numpy
```

**② 安装后端核心依赖**
```bash
# 如果下载较慢，可追加 -i https://pypi.tuna.tsinghua.edu.cn/simple
pip install -r requirements.txt
```

**③ Node.js 环境**
确保你的系统已安装了 **Node.js (v18+)**。

### 2. 项目启动

#### Windows 一键启动
本项目提供了一个一键启动脚本 `start.bat`，它会自动唤起 `low_numpy` 环境启动后端，并自动安装前台依赖及运行。
```batch
双击运行 start.bat
```

### Linux/Mac 用户
```bash
chmod +x start.sh
./start.sh
```

### 手动启动
```bash
# 终端 1: 启动后端
cd etc_sim
uvicorn etc_sim.backend.main:app --reload --host 0.0.0.0 --port 8000

# 终端 2: 启动前端
cd etc_sim/frontend
npm install  # 首次运行
npm run dev
```

**访问地址**: http://localhost:3000

---

## 功能特性

| 功能 | 描述 |
|------|------|
| 🚗 **实时仿真可视化** | Canvas 渲染道路、车辆和 ETC 门架，支持极速模式 |
| ⚙️ **参数自定义** | 道路长度、车道数、车辆比例、异常率等 |
| 📊 **16种图表分析** | 车流画像、时空图、延误分析、交通流基本图等 |
| 🔔 **智能预警规则引擎** | 可配置条件-动作规则，支持 9 种条件原子和 4 种动作 ⭐ |
| 🎨 **可视化工作流编辑器** | React Flow 拖拽式规则设计，20 种节点类型 ⭐ |
| 📈 **自动化评估系统** | F1/Precision/Recall 指标、检测延迟分析、阈值优化 ⭐ |
| 📤 **数据导出** | 配置导出 (JSON) + 结果导出 (CSV) |
| 🎨 **现代化界面** | 玻璃态设计、渐变配色、动画效果 |
| 🎨 **交互式详细分析** | 仿真后提供区间流量、速度画像及单车微观散点图分析 ⭐ |
| ⚡ **极速模式** | 跳过渲染，快速完成仿真 |

---

## 技术栈

- **前端**: React + TypeScript + Vite
- **后端**: Python + FastAPI (图表生成)
- **状态管理**: Zustand (持久化)
- **样式**: TailwindCSS
- **仿真引擎**: IDM 跟驰模型 + MOBIL 换道模型
- **图表**: Matplotlib (后端) + Recharts (前端)

---

## 项目文档与运算机制

项目深度模拟了真实世界的交通流动态变化。有关**跟驰模型、换道模型、环境影响机制（天气、坡度）、异常车辆行为及其冲击传播机制**的具体参数设定与算法公式，请参阅专门的详细说明文档：

👉 [**《交通流模拟运算与机制》 (Simulation Mechanics)**](./docs/simulation_mechanics.md)

---

## 目录结构

```
etc_sim/
├── frontend/               # 前端应用 (React + Vite)
│   ├── src/
│   │   ├── App.tsx         # 主应用入口
│   │   ├── engine/         # 仿真引擎核心
│   │   │   ├── SimulationEngine.ts  # 仿真主循环
│   │   │   ├── Vehicle.ts           # 车辆类 (IDM+MOBIL)
│   │   │   └── config.ts            # 配置常量
│   │   ├── components/     # UI 组件
│   │   └── stores/         # Zustand 状态管理
│   └── package.json
├── backend/                # 后端 API (FastAPI)
│   ├── main.py             # FastAPI 入口
│   ├── api/charts.py       # 图表 API 端点
│   └── plotter.py          # Matplotlib 图表生成器
├── output/                 # 仿真输出目录
│   └── run_<timestamp>/    # 每次运行的图表和日志
├── start.bat               # Windows 启动脚本
├── start.sh                # Linux/Mac 启动脚本
└── README.md               # 本文件
```

---

## 组件说明

| 组件 | 功能 |
|------|------|
| `ConfigPanel` | 参数配置面板：道路、车辆、驾驶风格、异常设置 |
| `SimCanvas` | 仿真可视化画布，含车辆光晕和异常高亮 |
| `ControlBar` | 控制按钮（开始/暂停/停止/重置/极速模式） |
| `ChartsPanel` | 图表预览面板，支持下载和收藏 |
| `LogConsole` | 日志控制台，支持过滤和导出 |
| `ResultsPanel` | 结果统计卡片，支持 CSV 导出 |
| `SegmentInspector` | 区间详细分析：交互式展示特定区间的速度、流量、密度趋势 |
| `MicroscopicInspector` | 单车微观分析：展示海量车辆采样点的速度-时间分布，支持异常着色 |

---

## 仿真算法

### IDM 跟驰模型
- 自由流加速度：`a_free = a_max * (1 - (v/v0)^δ)`
- 跟车减速：基于前车距离和速度差计算期望间距

### MOBIL 换道模型
- 礼貌系数和收益计算
- 强制换道（前方静止车辆）
- 自由换道（寻找更优车道）

### 高级仿真特性
- **自适应进度控制**：仿真引擎会根据路网中剩余车辆状态动态调整“预计总时间”，确保即使仿真超时运行（等待末尾车辆），进度条也能准确反映剩余工作量。
- **异构路网精确统计**：支持自定义不均匀路段划分。车辆通过维护一套动态边界检测机制，能够精确记录在不同长度区间内的停留时间和平均速度，解决了传统静态分段导致的短区间统计失效问题。
- **高性能轨迹采样**：采用“前后台分离”的采样策略。前端保留 10w+ 采样点用于交互式微观分析，后端上传 1w 点高代表性数据用于静态图表生成，平衡了分析深度与响应速度。

### 异常状态机
| 类型 | 描述 | 颜色 |
|------|------|------|
| Type 1 | 完全静止（永久） | 🔴 深红 |
| Type 2 | 短暂波动（10秒） | 🟣 紫色 |
| Type 3 | 长时波动（20秒） | 🟤 棕色 |
| 受影响 | 被异常车辆减速 | 🟠 橙色 |
| 正常 | 正常行驶 | 🔵 蓝色 |

---

## 预警规则引擎 ⭐

### 架构设计

规则引擎采用三层架构：**条件原子 → 规则组合 → 动作执行**

```
AlertContext (数据聚合) → AlertRuleEngine (规则评估) → AlertEvent (预警输出)
```

### 条件原子（9 种）

| 条件类型 | 说明 | 关键参数 |
|---------|------|---------|
| `speed_below_threshold` | 平均速度低于阈值 | `threshold_kmh`, `min_samples` |
| `speed_std_high` | 速度标准差过高 | `std_threshold_kmh` |
| `travel_time_outlier` | 行程时间显著偏高 | `z_score_threshold`, `ratio_threshold` |
| `flow_imbalance` | 上下游流量不平衡 | `ratio_threshold`, `time_window_s` |
| `consecutive_alerts` | 连续异常次数超限 | `count_threshold` |
| `queue_length_exceeds` | 排队长度超限 | `length_threshold_m` |
| `segment_speed_drop` | 区间平均速度骤降 | `threshold_kmh` |
| `weather_condition` | 天气条件匹配 | `weather_types` |
| `high_missed_read_rate` | ETC 漏读率过高 | `rate_threshold` |

### 动作（4 种）

- `log` — 记录到日志
- `notify` — 推送通知到前端
- `speed_limit` — 建议限速
- `lane_control` — 车道管控建议

### 默认预设规则（7 条）

1. **拥堵检测** — 速度低 + 时间离群 → Log + Notify
2. **疑似事故** — 极低速 + 连续异常 → Log + 限速
3. **缓行预警** — 中等速度离群 → Log
4. **交通震荡** — 速度标准差高 → Log + Notify
5. **严重排队** — 排队长度超限 → Log + 限速
6. **恶劣天气低速** — 雨雪 + 速度低 → Log + 限速
7. **ETC 设备异常** — 高漏读率 → Log + Notify

### 可视化工作流编辑器

访问 **/workflow** 页面进行拖拽式规则设计：

- 📡 3 种数据源节点（门架统计、车辆状态、环境数据）
- ⚙️ 9 种条件节点（对应条件原子）
- 🔀 2 种逻辑节点（AND / OR）
- 🎯 4 种动作节点

支持功能：
- 实时参数编辑
- 节点连线自动验证
- 后端保存/加载
- JSON 导入导出

### 评估系统

访问 **/evaluation** 页面查看预警效果：

**核心指标：**
- **Precision**（精确率）— 预警准确性
- **Recall**（召回率）— 异常覆盖度
- **F1 Score** — 综合指标
- **检测延迟** — 预警及时性

**可视化组件：**
- F1 仪表盘圆弧
- 混淆矩阵（TP/FP/FN）
- 检测延迟柱状图
- 按异常类型细分统计

**阈值优化：**
通过网格搜索自动寻找最优参数，最大化 F1 Score。

---

## 图表输出

仿真完成后自动生成 16 种分析图表：

1. **速度画像** - 各区间车辆速度轨迹（按状态着色）
2. **异常分布** - 各路段异常事件统计
3. **时空图** - 车辆轨迹可视化
4. **速度热力图** - 时间-空间速度分布
5. **累计延误** - 各路段总延误时间
6. **恢复曲线** - 异常后速度恢复过程
7. **车道分布** - 各车道车辆数变化
8. **车辆类型** - 轿车/卡车/客车分布
9. **交通流基本图** - 流量-密度-速度关系
10. **换道分析** - 换道原因和风格统计
11. **拥堵传播** - 拥堵波扩散分析
12. **驾驶风格** - 激进/普通/保守对比
13. **异常时间线** - 异常事件时序图
14. **ETC性能** - ETC检测时间分析
15. **空间排他性** - 车道阻塞影响

---

## API 接口

### 基础 URL
```
http://localhost:8000/api
```

### 主要端点

#### 工作流管理 `/workflows`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/conditions/types` | 获取所有条件类型 |
| GET | `/actions/types` | 获取所有动作类型 |
| GET | `/rules` | 列出所有规则 |
| POST | `/rules` | 创建新规则 |
| PUT | `/rules/{name}` | 更新规则 |
| DELETE | `/rules/{name}` | 删除规则 |
| POST | `/workflows/import` | 导入工作流 JSON |
| GET | `/workflows/export` | 导出工作流 JSON |
| POST | `/workflows/reset` | 重置为默认规则 |

#### 评估系统 `/evaluation`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/metrics` | 获取最近评估指标 |
| POST | `/evaluate` | 重新评估（自定义参数） |
| GET | `/summary` | 获取评估摘要 |
| POST | `/optimize` | 优化规则阈值 |

#### WebSocket `/ws`

实时仿真推送：
```
ws://localhost:8000/ws/simulation/{session_id}
```

**消息类型：**
- `SNAPSHOT` — 车辆状态快照（每帧）
- `LOG` — 日志消息
- `PROGRESS` — 进度更新
- `COMPLETE` — 仿真完成（包含评估结果）

---

## 故障排除

### 图表无法生成
检查 `output/run_<timestamp>/launcher.log` 查看错误日志。常见问题：
- **NumPy 版本冲突**: 使用 `pip install numpy<2.0`
- **Matplotlib 缺失**: `pip install matplotlib`

### 前端连接失败
确保后端已启动在 `http://localhost:8000`

### 启动脚本问题
如果自动启动失败，请手动分别启动前端和后端。
