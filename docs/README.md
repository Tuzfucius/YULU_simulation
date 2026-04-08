# 文档索引

本目录只保留与当前代码直接对应的文档。目标是把系统架构、运行方式、数学原理、API 和对外讲解材料分开说明，避免重复。

## 推荐阅读顺序

1. `system_working_principles.md`
   系统总览。说明架构、启动方式、运行链路、数据流和 API 分类。
2. `simulation_mechanics.md`
   仿真原理。说明 IDM、MOBIL、车辆投放、排队、幽灵堵车和震荡传播等模型。
3. `storage/README.md`
   存储专题索引。说明历史运行、回放、训练、数据集和分层存储的关系。
4. `storage/api_interaction_and_history_storage.md`
   存储专题正文。说明 `run_id` 历史模型、目录结构、路径轨迹和兼容迁移。
5. `impact_score.md`
   车流画像中的影响度计算说明。
6. `developer_guide.md`
   开发与扩展说明，包含环境、目录、测试和新增页面/API 的落点。
7. `presentation_script.md`
   面向客户的 3 分钟讲稿，按页面切换顺序组织。

## 维护原则

- 只写能从源码证明的内容，不把旧设计稿、废弃接口或未挂载页面写成事实。
- 总览文档讲“系统是什么、怎么跑、数据怎么流动”；专题文档讲“某个机制怎么计算”。
- 当代码和文档冲突时，以当前代码为准。
