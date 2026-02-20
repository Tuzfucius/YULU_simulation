# 前端 UI 组件库 (UI Components)

本目录包含所有用于展示仿真状态、配置参数及分析结果的 React 组件。

## 关键组件分类

### 1. 仿真控制与展示
- `App.tsx`: 应用主架构。
- `SimCanvas.tsx`: 基于原生 Canvas 开发的高性能仿真动画展示，支持光晕效果。
- `ControlBar.tsx`: 集成极速模式切换与仿真生命周期控制按钮。

### 2. 配置与监控
- `ConfigPanel.tsx`: 仿真参数配置，包括车辆比例、异构路网步长等。
- `LogConsole.tsx`: 实时预警日志，支持多级别过滤。

### 3. 分析与数据可视化 (重要)
- `ResultsPanel.tsx`: 宏观评估指标呈现（P/R/F1 仪表盘）。
- `ChartsPanel.tsx`: 后端生成图表预览、下载与收藏。
- **`SegmentInspector.tsx`**: 区间详细分析，支持 DataZoom 缩放区间宏观统计指标。
- **`MicroscopicInspector.tsx`**: 单车微观分析，基于 ECharts 实现的大规模采样点可视化。

## 样式指南
组件统一遵循项目的玻璃态 (Glassmorphism) 设计风格，使用 TailwindCSS 与预定义 CSS 变量。

## 机制解读
- **微观图表着色**：采用动态速度映射逻辑，确保在不同速度区间内都能提供高对比度的可视化反馈。
