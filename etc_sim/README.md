# ETC 交通仿真系统 (ETC Traffic Simulation)

高速公路 ETC 车流仿真与异常分析平台

## 快速开始

### 环境要求
- **Node.js** 18+
- **Python** 3.9+ (推荐使用带有 NumPy 1.x 的 Conda 环境)

### Windows 用户
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
| 📤 **数据导出** | 配置导出 (JSON) + 结果导出 (CSV) |
| 🎨 **现代化界面** | 玻璃态设计、渐变配色、动画效果 |
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

---

## 仿真算法

### IDM 跟驰模型
- 自由流加速度：`a_free = a_max * (1 - (v/v0)^δ)`
- 跟车减速：基于前车距离和速度差计算期望间距

### MOBIL 换道模型
- 礼貌系数和收益计算
- 强制换道（前方静止车辆）
- 自由换道（寻找更优车道）

### 异常状态机
| 类型 | 描述 | 颜色 |
|------|------|------|
| Type 1 | 完全静止（永久） | 🔴 深红 |
| Type 2 | 短暂波动（10秒） | 🟣 紫色 |
| Type 3 | 长时波动（20秒） | 🟤 棕色 |
| 受影响 | 被异常车辆减速 | 🟠 橙色 |
| 正常 | 正常行驶 | 🔵 蓝色 |

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

## 故障排除

### 图表无法生成
检查 `output/run_<timestamp>/launcher.log` 查看错误日志。常见问题：
- **NumPy 版本冲突**: 使用 `pip install numpy<2.0`
- **Matplotlib 缺失**: `pip install matplotlib`

### 前端连接失败
确保后端已启动在 `http://localhost:8000`

### 启动脚本问题
如果自动启动失败，请手动分别启动前端和后端。
