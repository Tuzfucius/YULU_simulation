# 预警规则引擎模块

本文件夹下新增的预警规则引擎相关文件：

## 文件说明

| 文件 | 功能 |
|------|------|
| `alert_context.py` | 预警上下文（`AlertContext`）和预警事件（`AlertEvent`）数据类 |
| `alert_conditions.py` | 9 种条件原子（Condition），支持注册表动态创建 |
| `alert_rules.py` | 规则组合（`AlertRule`）、4 种动作（`Action`）、规则引擎（`AlertRuleEngine`） |

## 条件原子（Conditions）

- `speed_below_threshold` — 平均速度低于阈值
- `speed_std_high` — 速度标准差过高
- `travel_time_outlier` — 行程时间显著偏高
- `flow_imbalance` — 上下游流量不平衡
- `consecutive_alerts` — 连续异常次数超限
- `queue_length_exceeds` — 排队长度超限
- `segment_speed_drop` — 区间平均速度骤降
- `weather_condition` — 天气条件匹配
- `high_missed_read_rate` — ETC 漏读率过高

## 动作（Actions）

- `log` — 记录到日志
- `notify` — 推送通知
- `speed_limit` — 建议限速
- `lane_control` — 车道管控建议

## 预置规则（7 条）

拥堵检测、疑似事故、缓行预警、交通震荡预警、严重排队、恶劣天气低速预警、ETC 设备异常
