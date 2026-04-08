# 影响度计算说明

本文档说明 `backend/plotter.py` 中车流画像 `speed_profile` 图的影响度计算方式。

## 1. 作用

影响度 `impact_score` 用来替代旧的永久布尔标志 `was_affected`。它描述的是“当前区间内的延误程度”，而不是“历史上是否曾受影响”。

这样做的原因很直接：

- `was_affected` 是永久标志，不能表达当前区间的连续强度
- 图表需要的是分段渐变，而不是只有两种状态
- 不同区段、不同车型的基线通行时间本来就不同

## 2. 基线通行时间

### 2.1 统计口径

对每个区段，先从“非异常车辆”的通行时间中计算基线。代码会分别统计：

- `segment_times[seg_idx]`
- `type_times[(seg_idx, vehicle_type)]`

### 2.2 分位数基线

基线取 25% 分位数：

```text
T_base(seg, type) = P25(T_travel)
```

如果某个“区段 + 车型”的样本不足，则回退到该区段的整体 25% 分位数。

如果区段层面也没有基线，则再回退到车辆的期望速度：

```text
T_base = 距离 / desired_speed
```

## 3. 影响度公式

先计算超额延误比：

```text
excess_ratio = max(0, T_actual / T_base - 1)
```

再引入 10% 的死区，避免正常波动被误判为受影响：

```text
deadband = 0.10
saturation = 1.00
```

最终影响度为：

```text
impact_score = clip((excess_ratio - deadband) / (saturation - deadband), 0, 1)
```

等价地说：

- `impact_score = 0` 表示基本正常
- `0 < impact_score < 1` 表示受影响程度逐渐增强
- `impact_score = 1` 表示强影响

## 4. 图表映射

在 `speed_profile` 图中：

- 正常车辆使用低影响度颜色渐变
- 异常车辆保持固定异常颜色，不走影响度渐变
- 线条宽度随 `impact_score` 增大而略微加粗

颜色条的语义是：

- 0 = 正常
- 1 = 强影响

## 5. 与旧逻辑的区别

旧逻辑的问题在于 `was_affected` 只能表示“曾经受过影响”，不能表示“受影响有多强”。现在的逻辑改成：

- 先建立区段基线
- 再计算相对延误
- 最后把延误压缩到 `[0, 1]`

这样图表更适合做区间对比，也更适合做客户演示和后续统计。
