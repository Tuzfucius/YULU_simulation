# 仿真配置协议

## 1. 唯一配置模型

正式配置模型位于：

```text
etc_sim/config/parameters.py
```

唯一类：

```python
SimulationConfig
```

以下入口均复用该类：

- 离线 CLI；
- Python `SimulationEngine`；
- FastAPI 配置请求；
- WebSocket 仿真会话；
- 默认配置 `DEFAULT_CONFIG`。

`etc_sim/config/defaults.py` 不再定义第二套配置类，只创建一个默认实例。

## 2. 支持的输入格式

### 2.1 Python snake_case

```json
{
  "road_length_km": 20,
  "segment_length_km": 2,
  "num_lanes": 4,
  "total_vehicles": 1200,
  "simulation_dt": 1.0,
  "trajectory_sample_interval": 2.0,
  "max_simulation_time": 3900,
  "random_seed": 42
}
```

这是持久化和 Python 内部推荐格式。

### 2.2 前端 camelCase

```json
{
  "roadLengthKm": 20,
  "etcGateIntervalKm": 2,
  "numLanes": 4,
  "totalVehicles": 1200,
  "simulationDt": 1.0,
  "trajectorySampleInterval": 2.0,
  "maxSimulationTime": 3900,
  "randomSeed": 42
}
```

兼容别名包括：

- `etcGateIntervalKm` → `segment_length_km`
- `customGantryPositionsKm` → `custom_gantry_positions`
- `anomalyStartTime` → `global_anomaly_start`

### 2.3 旧嵌套 API 格式

以下旧结构仍可读取：

```json
{
  "road": {},
  "vehicle": {},
  "simulation": {},
  "anomaly": {},
  "lane_change": {},
  "impact": {},
  "etc": {}
}
```

模型会在校验前将各分区展平。新代码不应继续生成该格式。

## 3. 默认值

当前正式默认值包括：

| 字段 | 默认值 |
| --- | ---: |
| `road_length_km` | 20 km |
| `segment_length_km` | 2 km |
| `num_lanes` | 4 |
| `lane_width` | 3.5 m |
| `total_vehicles` | 1200 |
| `simulation_dt` | 1 s |
| `trajectory_sample_interval` | 2 s |
| `max_simulation_time` | 3900 s |
| `anomaly_ratio` | 0.01 |
| `random_seed` | 42 |

前端 Zustand 默认配置应与该表一致。

## 4. 跨字段约束

配置模型会拒绝以下情况：

- 区间长度大于有效道路长度；
- 轨迹采样间隔小于仿真步长；
- 门架位置位于道路范围外；
- 门架位置未严格递增或存在重复；
- 车型权重包含负数或总权重不为正数。

## 5. 序列化约定

正式保存格式使用 snake_case：

```python
config.to_dict()
config.to_json(path)
```

读取配置：

```python
SimulationConfig.from_dict(payload)
SimulationConfig.from_json(path)
load_config(path)
```

不要使用 `config.__dict__` 或手工拼接配置字典。

## 6. 迁移期说明

前端仍保留若干实验参数，例如场景、噪声和异常类型比例。其中部分字段尚未接入 Python 正式引擎。核心模型在迁移期会忽略未知字段，以避免旧浏览器持久化配置导致请求失败。

这不代表未知字段已经生效。新增参数必须同时完成：

1. 加入 `SimulationConfig`；
2. 在模型或引擎中实际使用；
3. 加入序列化结果；
4. 增加回归测试；
5. 更新本文档和前端类型。
