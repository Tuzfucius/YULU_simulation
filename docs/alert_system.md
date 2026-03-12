# 预警系统设计与实现

本文档详细介绍了 ETC 交通仿真系统中的智能预警规则引擎的架构、核心数据结构设计、内置条件与动作原子、以及评估与优化机制。

## 1. 系统总览

预警规则引擎在整个仿真平台中扮演着“中枢神经”的角色，它实时分析底层的交通流状态，并依靠灵活的规则网络触发高级别的管控建议。

**系统数据流向图：**

```mermaid
graph TD
    A[物理引擎 (仿真步)] --> B[网联数据 (ETC, 雷达)]
    B --> C(AlertContext 预警上下文)
    C --> D{规则引擎 AlertRuleEngine}
    D --> E[条件原子 Condition]
    E --> F[动作 Action]
    F --> G(前端推送 / 自动干预)
    
    H[工作流编辑器] -->|JSON配置| D
    I[评估系统 AlertEvaluator] -.->|F1 Score| D
    J[优化器 AlertOptimizer] -.->|参数寻优| E
```

## 2. 核心数据结构

### 2.1 AlertContext 预警上下文

`AlertContext` 聚合了每一帧仿真中所有预警判断所需的实时检测数据。由 `SimulationEngine` 构建并每步传递给规则引擎。

**核心字段：**
- `current_time` (float)：当前仿真时间（秒）。
- `gate_stats` (dict)：各门架的统计信息（如平均速度、流量）。
- `vehicle_speeds` / `vehicle_positions` / `vehicle_lanes` (dict)：车辆状态快照。
- `queue_lengths` (dict)：各门架区间的排队长度。
- `segment_avg_speeds` / `segment_vehicles` (dict)：宏观路段的聚合状态。
- `weather_type` (str)：当前天气环境。
- `noise_stats` (dict)：ETC 设备及环境噪声统计（如漏读率）。
- `recent_transactions` (list)：最近的 ETC 交易原始记录。
- `alert_history` (list)：已触发的历史预警事件列表。

### 2.2 AlertEvent 预警事件

当规则条件满足时，系统会生成 `AlertEvent` 供 Action 和前端消费。

**核心字段：**
- `rule_name` (str)：触发规则名称。
- `severity` (str)：告警级别 (`low`, `medium`, `high`, `critical`)。
- `timestamp` (float)：触发时刻。
- `gate_id` (str)：发生预警的物理门架编号。
- `position_km` (float)：发生位置里程。
- `description` (str)：详细描述信息。

## 3. 条件原子 (Condition) 系统

规则的本质是逻辑的组合，而 **Condition** 是最小的判断策略。系统通过注册机制 (`@register_condition`) 管理了 14 种预置条件原子，开发者可轻松扩展。所有条件均通过 `evaluate(context)` 输出布尔值。

### 内置条件一览表

| 分类 | 类型标识 (condition_type) | 描述 | 核心参数及默认值 |
| :--- | :--- | :--- | :--- |
| **速度类** | `speed_below_threshold` | 平均速度低于阈值 | `threshold_kmh`: 40.0, `min_samples`: 3 |
| | `speed_std_high` | 速度标准差过高（不稳定流） | `std_threshold_kmh`: 15.0, `min_samples`: 5 |
| | `speed_change_rate` | 速度梯度超阈值（加减速异常） | `rate_threshold`: 10.0, `direction`: 'decel' |
| **行程时间** | `travel_time_outlier` | 行程时间显著偏高 | `z_score_threshold`: 2.5, `ratio_threshold`: 1.5 |
| **流量类** | `flow_imbalance` | 上下游流量不平衡 | `ratio_threshold`: 0.5, `time_window_s`: 60.0 |
| **连续异常** | `consecutive_alerts` | 连续单车异常次数超限 | `count_threshold`: 3 |
| **排队类** | `queue_length_exceeds` | 排队长度超限 | `length_threshold_m`: 500.0 |
| | `segment_speed_drop` | 区间平均速度骤降 | `threshold_kmh`: 30.0 |
| **空间分布** | `occupancy_high` | 路段空间占有率超限 | `threshold_pct`: 80.0 |
| | `density_exceeds` | 交通密度超过阈值 | `threshold_veh_km`: 80.0 |
| **微观行为** | `headway_anomaly` | 车头时距过短（追尾风险） | `min_headway_s`: 1.5, `min_violations`: 2 |
| **环境硬件** | `weather_condition` | 天气条件匹配 | `weather_types`: ['rain', 'fog', 'snow'] |
| | `high_missed_read_rate` | ETC 漏读率过高 | `rate_threshold`: 0.1 |
| **自定义** | `custom_expression` | 字符串表达式求值 | `expression`: 'avg_speed < 30' |
| | `custom_script` | 自定义算法脚本 (包含模型等) | `script`: "def predict(context): return True" |

*注：参数取值优先级为 `实例传入参数 > default_params > fallback`。*

## 4. 规则引擎 (AlertRuleEngine)

规则引擎的核心职责是在极短的仿真步长内（例如 0.1 秒）高效评估所有挂载的预警规则。

### 规则结构 (AlertRule)
每条 `AlertRule` 包含：
- **组合逻辑 (`logic`)**：`AND` / `OR`。
- **关联数据源 (`data_sources`)**：动态界定评估的作用域（见第 6 节）。
- **条件列表 (`conditions`)**：参与判断的条件。
- **动作列表 (`actions`)**：触发后执行的操作。
- **冷却时间 (`cooldown_s`)**：防止同位置连续触发造成日志风暴或干预振荡（默认 60 秒）。

### 工作流
1. 引擎遍历所有 enabled 的规则。
2. 规则调用 `DataSourceResolver`，解析出具体推荐的注入 `gate_id`。
3. 临时将 `gate_id` 注射给没有指定门架的条件原子（`gate_id='*'`）。
4. 求值组合逻辑，如果触发，包装 `AlertEvent`，调用所有 Action 的 `execute` 方法，最后更新冷却时钟。

## 5. 动作 (Action) 系统

动作系统决定了预警产生后系统该如何反应。

| 类型标识 | 描述 | 功能影响 |
| :--- | :--- | :--- |
| `log` | 记录到系统日志 | 仅供后端调试和溯源。 |
| `notify` | 浏览器消息推送 | 通过 WebSocket 实时展示在前端通知栏和画布拓扑上。 |
| `speed_limit` | 建议限速 | 干预机制。向特定门架区间下发建议限速，物理模型中的车辆将强制遵守。 |
| `lane_control`| 车道管控建议 | 干预机制。用于封闭车道、强制分流等高风险规避操作。 |

## 6. 数据源解析器 (DataSourceResolver)

为了解决前端工作流编辑器的高度灵活性，系统通过 `DataSourceResolver` 将图形化配置转译为具体的门架提取。

支持的源类型 (`source_type`) 包括：
- `etc_data` / `vehicle_data` / `env_data`：直接读取对应子域。
- `history_data`：滑动窗口内的告警回溯分析。
- `aggregation_data`：空间维度的统计聚合（如取路网 min/max 速度）。
- `gate_corr_data`：指定上下游门架间的空间拓扑关联（常用于流量突变分析）。
- `realtime_calc`：多门架断面指标实时平均。

## 7. 预置规则集 (Default Rules)

系统默认内置了 7 条可立即部署的典范管控规则（可通过 `create_default_rules()` 加载）：

1. **拥堵检测 (Medium)**：速度持续低于 40km/h `AND` 行程时间 Z-score 偏高。
2. **疑似事故 (High)**：上下游流量严重不平（率<0.3） `OR` 连续异常报警 5 次以上。
3. **缓行预警 (Low)**：连续 5 辆车平均速度跌破 60km/h。
4. **交通震荡波提示 (Medium)**：单门架车速标准差激增（>20km/h）。
5. **严重排队停滞 (High)**：区间排队等待长度超 800m（触发车道管控建议）。
6. **恶劣天气联动低速 (High)**：(下雨/大雾/降雪) `AND` 车速<50km/h（触发建议限速40km/h）。
7. **设备可用性阻断 (Critical)**：ETC 漏读率飙升 >15%（暗示硬件故障）。

## 8. 评估系统 (AlertEvaluator)

单纯依赖主观感受无法闭环调整阈值。评估模块 `AlertEvaluator` 通过 **时空二维关联窗算法** 将系统发出的预警 (`AlertEvent`) 与微观底层产生物理异常的车 (`GroundTruthEvent`) 进行关联映射。

**核心评估指标：**
- **Precision (精准率)**，**Recall (召回率)**，**F1-Score**，综合衡量算法捕获能力与误报控制。
- **检测延迟 (Mean Detection Delay)**：规则引擎发现拥堵相较于真实物理异常点的时间滞后秒数（核心考核点）。
- **位置误差 (Position Error)**：距离最近关联门架的物理公里数误差。
- **MCC / Specificity / FPR**：多维度抗噪健壮性指标。

## 9. 预警阈值优化器 (AlertOptimizer)

人工调参不仅费时而且难以全局最优。`AlertOptimizer` 提供一套以最大化 F1 值为导向的自动调参框架。

- **搜索策略**：受制于仿真步长计算开销，系统采取限定参数空间 (`ParamRange`) 的自适应离散随机网格搜索（取代暴力全网格）。
- **流程**：提取历史上下文快照及异常真值 $\rightarrow$ 排列组合不同参数（如尝试 `threshold_kmh`=30/40/50） $\rightarrow$ 虚拟执行回放 $\rightarrow$ 比较 F1 得分并输出 `OptimizationResult` $\rightarrow$ 反馈给前端。

## 10. 机器学习与预测诊断模型

除了基于规则和专家经验的静态管控外，系统内嵌了基于随机森林（Random Forest）的时序状态异常诊断引擎模块（`alert_ml_predictor.py`），旨在通过历史流数据的学习预判局部路网未来的拥堵或事故波及概率。

### 10.1 特征工程 (Feature Engineering)

系统的 `TimeSeriesFeatureExtractor` 负责将原始的 ETC 流水记录（或宏观断面历史）按指定的**步长时间** (`step_seconds`) 聚合，衍生出训练模型所需的关键评估面：

- **基础维度**：`flow` (流量), `density` (密度), `avg_speed` (平均速度)。
- **扩展维度 (需启用的配置项)**：`speed_variance` (区间速度方差，反映交通流离散度), `occupancy` (空间占有率估算), `headway_mean` (平均车头时距)。
- **自定义派生 (Custom Expressions)**：支持业务人员通过基于内置安全沙箱的纯字符串公式定义组合指标，基于 `pandas` DataFrame 自动完成矢量化求值并作为新特征列纳入（例如 `congestion_index = density / max(flow, 1)`）。

### 10.2 序列窗口化 (Sliding Window Strategy)

真实交通态势具有强时序惯性，预测模块不采用单步数据而采用滑动窗口（Sliding Window）。
1. 在提取并补齐好区间时序特征后，按 `window_size_steps` 步长往后滑动截断数据。
2. 将得到的 2D 矩阵 `(Steps * Features)` 在空间上展平 (Flatten) 得到 1D Array 供随机森林消费。
3. **标签对其 (Ground Truth Alignment)：** 读取物理引擎挂载的原始异常事件 `GroundTruthEvent`，在当前时空区间窗口如果匹配得上异常时空方块（事件发生地、涉事范围边界以及存续时长），则标记序列为阳性状态（0为正常，1/2分别为源头区和波及区等衍生细化）。

### 10.3 模型训练与评估

1. 引擎接收构建好的多维 JSON 时序特征，进行 `train_test_split` 分割。
2. 内部模型采用 Scikit-learn 的 `RandomForestClassifier`，其中 `class_weight='balanced'` 设置为了应对实际路网常态情况占比远大于事故的极端不平衡问题。
3. **模型透明度**：除了返回常规的 P/R/F1 宏观平均（Macro-average指标）和混淆矩阵供报表展现外，会归并同一物理特征在各时间窗中的信息增益比率 (`feature_importances_`) 返回前端显示以指导专家决策（如：证明在这段路 “速度方差” 是第一预测因子）。

### 10.4 实时闭环与模型管理

该预测器支持调用 `predict_realtime_window()` 输出类别决策与各类别预测概率字典（Confidence Dictionary）。而在规则引擎系统 (`AlertRuleEngine`) 内嵌条件库中，提供的 `custom_script` (自定义算法节点) 便可直接实例化或调用保存好的 `.joblib` 模型（由 `save_model` 落盘持久化），在每一帧的 `AlertContext` 状态注入实时验证判断，实现算法策略与逻辑规则的深层混合部署。

---

> 通过以上多层架构的有机组合，系统达到了规则灵活性强、评估数字化、调参自动化和数据驱动预测的现代化仿真预警设计标准。
