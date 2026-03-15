# screen 目录说明

本目录存放“态势大屏”页面的展示组件，负责将历史运行数据、路网结构和异常事件组合成大屏视图。

当前主要包含以下职责：

- `ScreenMapStage.tsx`：负责绘制路网主舞台、门架与匝道，并提供门架点击/悬浮联动能力。
- `ScreenTrafficProfilePanel.tsx`：负责展示门架对应区间的车流时序图表和关键指标摘要。
- `ScreenHeader.tsx`、`ScreenPanel.tsx`：负责大屏的头部信息和统一面板外观。
- `ScreenAlertList.tsx`、`ScreenIncidentDetail.tsx`：负责异常列表与事件详情展示。
- `ScreenMetricCard.tsx`、`ScreenSummaryTile.tsx`：负责顶部指标卡和摘要信息块。

维护原则：

- 优先保持组件单一职责，地图绘制、图表展示、详情展示分离。
- 新增大屏交互时，优先在本目录内封装，不向页面组件堆叠过多渲染逻辑。
- 所有展示组件应优先兼容历史运行数据与当前配置两种来源。
