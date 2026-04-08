# 影响度计算说明

本文档说明 `speed_profile` 图中连续影响度 `impact_score` 的计算方式。它的作用是把“某个区间比正常情况慢多少”映射到 `[0, 1]`，而不是简单使用历史布尔标志 `was_affected`。

---

## 1. 设计目标

- 保留正常车辆的蓝色或中性色调。
- 让轻微、中等、严重受影响的区间呈现连续渐变。
- 避免把“曾经受过影响”误画成“当前整段都受影响”。

---

## 2. 基线时间

`backend/plotter.py` 在生成车流画像时，会先为每个区间建立通行时间基线。

对同一 `seg_idx` 和 `vehicle_type`，使用历史旅行时间的 25% 分位数作为基线：

```math
T_{base}(seg, type) = P_{25}(T_{travel})
```

如果某个车辆类型样本不足，则回退到该区间整体基线；如果仍然缺失，则根据期望速度估算：

```math
T_{base} \approx \frac{L_{seg}}{v_{desired}}
```

其中 `L_seg` 为区间长度，`v_desired` 取车辆记录里的期望速度。

---

## 3. 超额时长

对某辆车在某区间的实际通行时间 `T_actual`，先计算超额比例：

```math
excess\_ratio = \max\left(0, \frac{T_{actual}}{T_{base}} - 1\right)
```

这个值越大，说明该车辆在该区间比正常情况慢得越明显。

---

## 4. 连续影响度

为了避免轻微波动被误判，代码引入 10% 的死区：

```math
impact\_score =
\text{clip}\left(\frac{excess\_ratio - 0.10}{1.00 - 0.10}, 0, 1\right)
```

因此：

- `impact_score = 0` 表示基本正常。
- `0 < impact_score < 1` 表示受影响程度逐渐增强。
- `impact_score = 1` 表示达到最强影响。

---

## 5. 图上映射

在 `speed_profile` 图里，`impact_score` 会直接影响颜色和线宽：

- 分值越低，颜色越接近正常色。
- 分值越高，颜色越接近受影响色。
- 线宽按 `1.0 + impact_score * 0.6` 放大。

对于统计分类，代码还把非异常车辆按影响度分成四档：

- `impact_score < 0.10`：normal
- `impact_score < 0.35`：mild
- `impact_score < 0.70`：moderate
- 其余：severe

异常车则保持专门的异常颜色，不进入连续渐变。

---

## 6. 为什么不用 `was_affected`

`was_affected` 是历史标志，只要曾经受过影响就会一直为真。它适合做历史统计，不适合做区间级渐变渲染。

`impact_score` 的目标是当前区间当前状态，因此必须是连续值，不能是永久布尔量。

---

## 7. 结论

`impact_score` 本质上是一个基于基线通行时间的归一化超额时长指标。它的计算方式已经在 `backend/plotter.py` 中实现，文档与代码应保持一致，不应再回退到二值状态描述。
