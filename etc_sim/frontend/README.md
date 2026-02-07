# Frontend - 前端可视化界面

该目录包含了基于 React 和 Vite 的前端应用，用于仿真配置、实时监控和结果展示。

## 技术栈

- **React**: UI 视图框架。
- **TypeScript**: 类型安全。
- **Vite**: 构建与开发服务器。
- **Lucide React**: 图标库。
- **CSS Modules**: 样式隔离。

## 核心目录

- **src/engine/**: 前端侧的物理模型定义（用于本地预测或数据校验）。
- **src/components/**: 
  - `simulation/`: 包含仿真看板、参数面板、实时画布及控制台等组件。
- **src/hooks/**: 
  - `useSimulationWS.ts`: **关键 Hook**，封装了与后端的 WebSocket 通信逻辑，处理实时进度与快照。
- **src/pages/**: 
  - `RunPage.tsx`: 主监控页面。
  - `AnalysisPage.tsx`: 结果分析与图表页面。
  - `ConfigPage.tsx`: 参数配置管理页面。

## 功能介绍

1. **参数配置**: 动态调整道路和车辆参数。
2. **实时看板**: 使用 Canvas 渲染路网中车辆的时空分布，支持异常车辆着色。
3. **统计图表**: 展示仿真完成后生成的详细数据。
