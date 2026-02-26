# ETC 交通仿真系统 - 开发者指南

本文档包含了项目在二次开发、组件扩展以及代码交互规范上的核心指导原则。无论您是开发新的预警规则、增加前端图表还是进行算法上的改进，都可以参考本指南。

## 1. 快速开发环境搭建

### 后端依赖
```bash
conda create -n etc_sim python=3.13
conda activate etc_sim
pip install -r etc_sim/requirements.txt
```

### 前端依赖
```bash
cd etc_sim/frontend
npm install
npm run dev
```

### IDE 推荐配置
- **VS Code 扩展**：Python, ESLint, Tailwind CSS IntelliSense

---

## 2. 代码风格与规范

### 2.1 命名约定
- **类名**: `PascalCase` (如 `TrafficSimulation`)
- **函数/变量**: `snake_case` (如 `calc_shockwave_speed`)
- **常量**: `UPPER_SNAKE_CASE` (如 `MAX_DELAY`)
- **私有成员**: 前缀 `_` (如 `_init_vehicle_type`)

### 2.2 错误与类型处理
对公共函数使用 Type Hint 类型注解。关键 I/O 操作务必使用 `try-except` 包裹。

```python
from typing import List, Dict

def process_vehicles(vehicles: List[Vehicle]) -> int:
    try:
        # processing
        pass
    except Exception as e:
        logger.error(f"处理失败: {e}")
```

### 2.3 目录结构与模块说明
```
etc_sim/
├── frontend/          # React + Vite 前端
│   └── src/
│       ├── components/pages/  # 页面组件
│       ├── engine/            # 仿真核心前端支持
│       └── stores/            # Zustand
├── backend/           # FastAPI 后端
│   ├── api/           # 路由端点
│   └── main.py        # FastAPI 主程序
├── config/            # 仿真参数
├── models/            # 预警引擎、分析模型
├── simulation/        # Python 仿真引擎主程序
├── main.py            # CLI 入口
└── start.bat          # 启动脚本
```

---

## 3. 预警系统功能扩展

### 3.1 添加新的条件原子 (Condition)
在 `models/alert_conditions.py` 中注册新条件：
```python
from etc_sim.models.alert_conditions import Condition, register_condition

@register_condition('my_new_condition')
class MyNewCondition(Condition):
    def __init__(self, params: dict, gate_id: str = '*'):
        super().__init__(params, gate_id)
        self.threshold = params.get('threshold', 100)
    
    def evaluate(self, context: AlertContext) -> bool:
        # 具体评估逻辑
        return True
```

**同步修改前端：**
在 `frontend/src/stores/workflowStore.ts` 中 `NODE_TYPE_CONFIGS` 追加：
```typescript
{
  type: 'my_new_condition',
  label: '我的新条件',
  subType: 'my_new_condition',
  category: 'condition',
  icon: '🔥',
  color: '#f97316',
  description: '当满足某条件时触发',
  defaultParams: { threshold: 100 }
}
```

### 3.2 添加新的动作 (Action)
在 `models/alert_rules.py` 中注册：
```python
from etc_sim.models.alert_rules import Action, register_action

@register_action('my_action')
class MyAction(Action):
    def execute(self, context: AlertContext, event: AlertEvent):
        logger.info(f"执行动作: {event.description}")
        # 功能逻辑
```

前端节点配置方法与 Condition 相同。

---

## 4. 前端开发与分析数据流

### 4.1 新增前端页面
1. 在 `frontend/src/components/pages/` 创建 `MyPage.tsx`
2. 在 `App.tsx` 的 `navItems` 中注册路由组件

### 4.2 交互式分析数据流机制
当仿真结束后，前端 `SimulationEngine` 会将原始数据对象存入 `simStore.statistics`：
- `segmentBoundaries`: 路段边界
- `segmentSpeedHistory`: 时、流、速、密矩阵序列
- `sampledTrajectory`: 采样的车辆单车运行数据（供微观展示）

如果新增分析图表，应从 Zustand store 中通过 Selector 获取所需切片，避免订阅整个 Store 以保障性能：
```typescript
// ✅ 最佳实践：只订阅关心的切片
const nodes = useWorkflowStore(state => state.nodes);
```

### 4.3 样式系统
使用项目标准的玻璃态组件和全局 CSS 变量体系：
```css
--bg-base: #0a0e1a
--text-primary: #e5e7eb
--accent-blue: #60a5fa
```
HTML JSX 中请使用如 `className="glass-card"` 获取基础磨砂半透明质感容器。

---

## 5. 测试与调试指南

### 5.1 后端调试
可以在重要路径打印 Logger 信息。通过终端直接调用测试入口：
```bash
# 测试特定模型模块
python -c "from etc_sim.models import create_default_rules; print(create_default_rules())"
```

### 5.2 前端 WebSocket 调试
如果需要监听后端实时推送的快照，直接在浏览器 Console 捕获：
```javascript
const ws = new WebSocket('ws://localhost:8000/ws/simulation/test');
ws.addEventListener('message', e => console.log(JSON.parse(e.data)));
```

---

**开源许可**
MIT License
