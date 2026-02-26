# 预警规则引擎模块

本目录包含 ETC 交通仿真系统的智能预警规则引擎相关模块。

## 模块组成

### 核心模块

| 文件 | 说明 |
|------|------|
| `alert_context.py` | 预警上下文数据结构，聚合仿真数据供规则评估使用 |
| `alert_conditions.py` | 9 种条件原子定义 + 条件注册表 |
| `alert_rules.py` | 规则引擎核心（规则组合、动作执行、7 条默认规则） |

### 评估系统

| 文件 | 说明 |
|------|------|
| `alert_evaluator.py` | 预警评估器（时空窗口匹配、F1/Precision/Recall 指标） |
| `alert_optimizer.py` | 阈值优化器（网格搜索寻找最优参数） |

## 快速开始

### 创建规则引擎

```python
from etc_sim.models import AlertRuleEngine, create_default_rules

# 初始化引擎
engine = AlertRuleEngine()

# 加载默认规则
for rule in create_default_rules():
    engine.add_rule(rule)

print(f"已加载 {len(engine.rules)} 条规则")
```

### 评估规则

```python
from etc_sim.models import AlertContext

# 构建上下文（通常由仿真引擎自动完成）
context = AlertContext(
    current_time=100.0,
    gate_stats=gate_stats_dict,
    vehicle_states=vehicle_list,
    environment=env_data
)

# 评估所有规则
events = engine.evaluate_all(context)

for event in events:
    print(f"[{event.severity.upper()}] {event.rule_name}: {event.description}")
```

### 评估性能

```python
from etc_sim.models import AlertEvaluator

evaluator = AlertEvaluator(
    time_window_s=120.0,      # 匹配时间窗口
    distance_window_km=2.0    # 匹配距离窗口
)

metrics, matches, cat_metrics = evaluator.evaluate(
    ground_truths=ground_truth_events,
    alert_events=rule_engine_events
)

print(f"Precision: {metrics.precision:.3f}")
print(f"Recall: {metrics.recall:.3f}")
print(f"F1 Score: {metrics.f1_score:.3f}")
```

## 条件原子详解

### 1. speed_below_threshold
**说明：** 检测平均速度是否低于阈值

**参数：**
- `threshold_kmh` (float) — 速度阈值（km/h）
- `min_samples` (int) — 最少样本数

**示例：**
```python
{
    "threshold_kmh": 40.0,
    "min_samples": 5
}
```

### 2. travel_time_outlier
**说明：** 检测行程时间是否显著偏高（Z-score 方法）

**参数：**
- `z_score_threshold` (float) — Z-score 阈值（默认 2.0）
- `ratio_threshold` (float) — 相对阈值（默认 1.5）

### 3. flow_imbalance
**说明：** 检测上下游流量是否不平衡

**参数：**
- `ratio_threshold` (float) — 流量比阈值
- `time_window_s` (float) — 时间窗口

### 更多条件...

详见 `alert_conditions.py` 中的完整定义。

## 动作类型

### log
记录到系统日志

### notify
推送通知到前端界面

### speed_limit
建议限速（附带推荐速度值）

### lane_control
车道管控建议（如封闭车道）

## 扩展开发

### 添加自定义条件

```python
from etc_sim.models.alert_conditions import Condition, register_condition

@register_condition('my_condition')
class MyCondition(Condition):
    def __init__(self, params: dict, gate_id: str = '*'):
        super().__init__(params, gate_id)
        self.my_param = params.get('my_param', 100)
    
    def evaluate(self, context: AlertContext) -> bool:
        # 实现你的评估逻辑
        return some_check(context, self.my_param)
```

### 添加自定义动作

```python
from etc_sim.models.alert_rules import Action, register_action

@register_action('my_action')
class MyAction(Action):
    def execute(self, context: AlertContext, event: AlertEvent):
        # 实现你的动作逻辑
        print(f"执行自定义动作: {event.description}")
```

## 性能考虑

- **条件短路**：在 AND 逻辑中，低成本条件应优先评估
- **缓存统计**：避免在每次评估时重新计算统计量
- **冷却时间**：使用规则的 `cooldown_seconds` 参数避免频繁触发

## 相关文档

- [开发者指南](../../docs/developer_guide.md) — 详细的开发指南
- [API 文档](../../README.md#api-接口) — REST API 接口说明
