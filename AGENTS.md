[简体中文](#简体中文) | [English](#english)

# ETC 交通仿真系统 - 代理开发指南

## 项目概述

本项目是基于 IDM（智能驾驶员模型）和 MOBIL 换道模型的交通仿真系统，使用 Python 3.13+ 开发，依赖 numpy、matplotlib 和 sqlalchemy。用于模拟高速公路场景下的车辆运行、异常事件传播及 ETC 门架检测效果。

## 1. 构建与测试命令

### 运行仿真

```bash
# 使用默认配置运行仿真
python etc_sim/main.py

# 使用指定配置文件运行
python etc_sim/main.py config.json

# 导出默认配置为 JSON
python etc_sim/main.py --json config.json

# 运行旧版仿真脚本
python 模拟车流.py
```

### 依赖安装

```bash
pip install -r etc_sim/requirements.txt
```

### 虚拟环境（推荐）

```bash
python -m venv venv
.\venv\Scripts\activate   # Windows
pip install -r etc_sim/requirements.txt
```

## 2. 代码风格指南

### 2.1 导入规范

```python
# 标准库导入（按字母顺序）
import os
import sys

# 第三方库导入
import matplotlib.pyplot as plt
import numpy as np
from collections import defaultdict

# 相对导入（项目内部模块）
from .models import AnomalyModel
from etc_sim.config.parameters import SimulationConfig
```

### 2.2 命名约定

| 类型 | 规则 | 示例 |
|------|------|------|
| 类名 | PascalCase | `TrafficSimulation`, `Vehicle` |
| 函数/变量 | snake_case | `calc_shockwave_speed`, `segment_speed_history` |
| 常量 | UPPER_SNAKE_CASE | `MAX_SIMULATION_TIME`, `NUM_LANES` |
| 私有方法/变量 | 前缀 `_` | `_init_vehicle_type`, `_find_leader` |
| 模块名 | snake_case | `simulation_engine.py`, `csv_writer.py` |

### 2.3 函数与类结构

```python
class TrafficSimulation:
    """交通仿真主类"""
    
    def __init__(self, config: SimulationConfig):
        """初始化仿真引擎"""
        self.vehicles = []
        self.config = config
    
    def run(self) -> None:
        """运行仿真主循环"""
        pass
```

### 2.4 类型注解

```python
from typing import List, Dict, Optional, Tuple

def process_vehicles(
    vehicles: List[Vehicle],
    config: Dict[str, float]
) -> Tuple[int, List[str]]:
    """处理车辆数据
    
    Args:
        vehicles: 车辆列表
        config: 配置参数字典
    
    Returns:
        处理数量和状态列表
    """
    pass
```

### 2.5 错误处理

```python
def load_config(path: str) -> SimulationConfig:
    """加载配置文件"""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        raise FileNotFoundError(f"配置文件不存在: {path}")
    except json.JSONDecodeError as e:
        raise ValueError(f"配置文件格式错误: {e}")
```

### 2.6 文档字符串

```python
class ShockwaveModel:
    """交通激波传播模型
    
    用于计算上下游流量变化引起的激波传播速度，
    分析拥堵波动的传播特征。
    """
    
    @staticmethod
    def calc_shockwave_speed(
        upstream_flow: float,
        downstream_flow: float,
        upstream_density: float,
        downstream_density: float
    ) -> float:
        """计算激波速度 (km/h)
        
        Args:
            upstream_flow: 上游流量
            downstream_flow: 下游流量
            upstream_density: 上游密度
            downstream_density: 下游密度
        
        Returns:
            激波速度 (km/h)，正值为向后传播
        """
        pass
```

### 2.7 代码布局

```python
# 模块文档字符串（必需）
"""模块功能描述

包含:
    - 类和函数列表
    - 主要用途说明
"""

# 导入区（标准库 → 第三方 → 内部模块）

# 常量定义区

# 类定义区

# 函数定义区

# 主程序入口（if __name__ == '__main__'）
```

### 2.8 注释规范

```python
# 单行注释（空格后使用）
self.lane_change_cooldown = 0  # 换道冷却时间

# 复杂逻辑注释（放在上方）
# 多异常源叠加减速系数计算
# 下游异常影响大于上游（使用更高减速比例）
multiplier = (SLOWDOWN_RATIO ** n_downstream) * (0.92 ** n_upstream)

# TODO 注释格式
# TODO: 实现 XXX 功能（issue #123）
```

### 2.9 目录结构规范

```
etc_sim/
├── config/          # 配置模块
│   ├── parameters.py
│   ├── defaults.py
│   └── __init__.py
├── core/            # 核心引擎
├── models/          # 仿真模型（IDM、MOBIL等）
├── road/            # 道路网络
├── simulation/      # 仿真控制
├── output/          # 输出处理（DB、CSV）
├── utils/           # 工具函数
├── visualization/   # 可视化模块
└── main.py          # 入口点
```

## 3. 关键命令速查

| 操作 | 命令 |
|------|------|
| 运行仿真 | `python etc_sim/main.py` |
| 安装依赖 | `pip install -r etc_sim/requirements.txt` |
| 创建虚拟环境 | `python -m venv venv` |
| 激活环境 | `.\venv\Scripts\activate` |

## 4. 开发注意事项

1. **编码格式**: 所有文件使用 UTF-8 编码
2. **中文支持**: matplotlib 中文配置已预设 `SimHei`、`Microsoft YaHei` 字体
3. **模块导入**: 内部模块使用相对导入
4. **异常处理**: 关键 I/O 操作必须 try-except 包裹
5. **类型注解**: 公开函数建议添加类型注解

---

## English

# ETC Traffic Simulation System - Agent Development Guide

## Project Overview

This project is a traffic simulation system based on the IDM (Intelligent Driver Model) and MOBIL lane-changing model. Developed using Python 3.13+, it relies on `numpy`, `matplotlib`, and `sqlalchemy`. It is used to simulate vehicle movement, anomaly event propagation, and ETC gantry detection effects in highway scenarios.

## 1. Build & Test Commands

### Run Simulation

```bash
# Run simulation with default config
python etc_sim/main.py

# Run with specific config file
python etc_sim/main.py config.json

# Export default config to JSON
python etc_sim/main.py --json config.json

# Run legacy simulation script
python 模拟车流.py
```

### Dependency Installation

```bash
pip install -r etc_sim/requirements.txt
```

### Virtual Environment (Recommended)

```bash
python -m venv venv
.\venv\Scripts\activate   # Windows
pip install -r etc_sim/requirements.txt
```

## 2. Code Style Guide

### 2.1 Import Conventions

```python
# Standard library imports (alphabetical)
import os
import sys

# Third-party library imports
import matplotlib.pyplot as plt
import numpy as np
from collections import defaultdict

# Relative imports (internal modules)
from .models import AnomalyModel
from etc_sim.config.parameters import SimulationConfig
```

### 2.2 Naming Conventions

| Type | Rule | Example |
|------|------|------|
| Class Name | PascalCase | `TrafficSimulation`, `Vehicle` |
| Function/Variable | snake_case | `calc_shockwave_speed`, `segment_speed_history` |
| Constant | UPPER_SNAKE_CASE | `MAX_SIMULATION_TIME`, `NUM_LANES` |
| Private Method/Var | Prefix `_` | `_init_vehicle_type`, `_find_leader` |
| Module Name | snake_case | `simulation_engine.py`, `csv_writer.py` |

### 2.3 Function & Class Structure

```python
class TrafficSimulation:
    """Main traffic simulation class"""
    
    def __init__(self, config: SimulationConfig):
        """Initialize simulation engine"""
        self.vehicles = []
        self.config = config
    
    def run(self) -> None:
        """Run main simulation loop"""
        pass
```

### 2.4 Type Annotations

```python
from typing import List, Dict, Optional, Tuple

def process_vehicles(
    vehicles: List[Vehicle],
    config: Dict[str, float]
) -> Tuple[int, List[str]]:
    """Process vehicle data
    
    Args:
        vehicles: List of vehicles
        config: Dictionary of configuration parameters
    
    Returns:
        Number processed and list of statuses
    """
    pass
```

### 2.5 Error Handling

```python
def load_config(path: str) -> SimulationConfig:
    """Load configuration file"""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        raise FileNotFoundError(f"Config file not found: {path}")
    except json.JSONDecodeError as e:
        raise ValueError(f"Config file format error: {e}")
```

### 2.6 Docstrings

```python
class ShockwaveModel:
    """Traffic shockwave propagation model
    
    Used to calculate the speed of shockwave propagation caused by 
    changes in upstream/downstream flow, analyzing congestion fluctuations.
    """
    
    @staticmethod
    def calc_shockwave_speed(
        upstream_flow: float,
        downstream_flow: float,
        upstream_density: float,
        downstream_density: float
    ) -> float:
        """Calculate shockwave speed (km/h)
        
        Args:
            upstream_flow: Upstream flow
            downstream_flow: Downstream flow
            upstream_density: Upstream density
            downstream_density: Downstream density
        
        Returns:
            Shockwave speed (km/h), positive means backward propagation
        """
        pass
```

### 2.7 Code Layout

```python
# Module docstring (Required)
"""Module description

Includes:
    - List of classes and functions
    - Main purpose description
"""

# Imports (Standard -> Third-party -> Internal)

# Constants

# Classes

# Functions

# Entry point (if __name__ == '__main__')
```

### 2.8 Comment Style

```python
# Single-line comment (preceded by space)
self.lane_change_cooldown = 0  # Lane change cooldown time

# Complex logic comment (placed above)
# Multi-anomaly source superimposed slowdown coefficient calculation
# Downstream influence is greater than upstream (use higher slowdown ratio)
multiplier = (SLOWDOWN_RATIO ** n_downstream) * (0.92 ** n_upstream)

# TODO format
# TODO: Implement XXX feature (issue #123)
```

### 2.9 Project Structure

```
etc_sim/
├── config/          # Configuration modules
│   ├── parameters.py
│   ├── defaults.py
│   └── __init__.py
├── core/            # Core engine
├── models/          # Simulation models (IDM, MOBIL, etc.)
├── road/            # Road network
├── simulation/      # Simulation control
├── output/          # Output processing (DB, CSV)
├── utils/           # Utility functions
├── visualization/   # Visualization modules
└── main.py          # Entry point
```

## 3. Quick Command Reference

| Action | Command |
|------|------|
| Run Simulation | `python etc_sim/main.py` |
| Install Dependencies | `pip install -r etc_sim/requirements.txt` |
| Create Venv | `python -m venv venv` |
| Activate Venv | `.\venv\Scripts\activate` |

## 4. Development Notes

1. **Encoding**: All files use UTF-8 encoding.
2. **Chinese Support**: Matplotlib Chinese fonts are preset with `SimHei` and `Microsoft YaHei`.
3. **Module Imports**: Use relative imports for internal modules.
4. **Exception Handling**: Critical I/O operations must be wrapped in try-except.
5. **Type Annotations**: Type annotations are recommended for public functions.
