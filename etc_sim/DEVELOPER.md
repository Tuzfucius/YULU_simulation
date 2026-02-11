# ETC 仿真系统开发者文档

## 开发环境设置

### 依赖安装

```bash
# 后端
conda create -n etc_sim python=3.12
conda activate etc_sim
pip install fastapi uvicorn websockets numpy matplotlib scipy pydantic

# 前端
cd frontend
npm install
```

### IDE 推荐配置

**VS Code 扩展：**
- Python
- ESLint
- Tailwind CSS IntelliSense
- TypeScript Vue Plugin (Volar)

## 添加新的条件原子

### 1. 后端实现

在 `models/alert_conditions.py` 中：

```python
@register_condition('my_new_condition')
class MyNewCondition(Condition):
    """条件说明"""
    
    def __init__(self, params: dict, gate_id: str = '*'):
        super().__init__(params, gate_id)
        # 提取参数
        self.threshold = params.get('threshold', 100)
        self.min_samples = params.get('min_samples', 5)
    
    def evaluate(self, context: AlertContext) -> bool:
        """评估逻辑"""
        if self.gate_id == '*':
            # 全局评估
            stats = context.gate_stats.values()
        else:
            # 特定门架
            stats = [context.gate_stats.get(self.gate_id)]
        
        for stat in stats:
            if stat and len(stat.recent_speeds) >= self.min_samples:
                avg_speed = sum(stat.recent_speeds) / len(stat.recent_speeds)
                if avg_speed < self.threshold:
                    return True
        return False
```

### 2. 前端节点配置

在 `frontend/src/stores/workflowStore.ts` 中的 `NODE_TYPE_CONFIGS` 数组添加：

```typescript
{
  type: 'my_new_condition',
  label: '我的新条件',
  subType: 'my_new_condition',
  category: 'condition',
  icon: '🔥',
  color: '#f97316',
  description: '当满足某条件时触发',
  defaultParams: {
    threshold: 100,
    min_samples: 5
  }
}
```

### 3. 验证

```bash
# 后端
python -c "from etc_sim.models import CONDITION_REGISTRY; print(CONDITION_REGISTRY)"

# 前端
npm run dev
# 访问 /workflow 页面检查新节点
```

## 添加新的动作类型

### 1. 后端实现

在 `models/alert_rules.py` 中：

```python
@register_action('my_action')
class MyAction(Action):
    """动作说明"""
    
    def execute(self, context: AlertContext, event: AlertEvent):
        """执行逻辑"""
        logger.info(f"执行自定义动作: {event.description}")
        # 实现你的动作逻辑
        # 例如：发送邮件、调用外部 API、修改配置等
```

### 2. 前端节点配置

同样在 `workflowStore.ts` 中添加：

```typescript
{
  type: 'my_action',
  label: '我的动作',
  subType: 'my_action',
  category: 'action',
  icon: '⚡',
  color: '#ef4444',
  description: '执行自定义动作',
  defaultParams: {}
}
```

## 扩展评估指标

### 添加自定义指标

在 `models/alert_evaluator.py` 的 `EvaluationMetrics` 类中：

```python
@dataclass
class EvaluationMetrics:
    # 现有字段...
    
    # 新增字段
    custom_metric: float = 0.0
    
    @property
    def custom_score(self) -> float:
        """自定义得分计算"""
        return self.custom_metric * 2.0
    
    def to_dict(self) -> dict:
        result = {
            # 现有字段...
            'custom_metric': round(self.custom_metric, 4),
            'custom_score': round(self.custom_score, 4),
        }
        return result
```

## 前端页面开发

### 创建新页面

1. 在 `frontend/src/components/pages/` 创建 `MyPage.tsx`：

```typescript
export function MyPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1400px] mx-auto p-6">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">
          我的页面
        </h1>
        {/* 页面内容 */}
      </div>
    </div>
  );
}
```

2. 在 `App.tsx` 中注册路由：

```typescript
import { MyPage } from './components/pages/MyPage';

const navItems = [
  // ...
  { path: '/my-page', icon: '🎨', label: '我的页面', labelEn: 'My Page' },
];

// 在 Routes 中添加
<Route path="/my-page" element={<MyPage />} />
```

## 样式规范

### CSS 变量

使用预定义的 CSS 变量确保主题一致性：

```css
/* 背景 */
--bg-base: #0a0e1a
--glass-bg: rgba(20, 25, 40, 0.6)
--glass-border: rgba(255, 255, 255, 0.1)

/* 文字 */
--text-primary: #e5e7eb
--text-secondary: #9ca3af
--text-muted: #6b7280

/* 强调色 */
--accent-blue: #60a5fa
--accent-purple: #a78bfa
--accent-green: #34d399
```

### 玻璃态卡片

```tsx
<div className="glass-card p-4">
  {/* 内容自动应用玻璃态效果 */}
</div>
```

## 测试

### 后端测试

```bash
# 模块导入测试
python -c "from etc_sim.models import AlertRuleEngine, AlertEvaluator; print('OK')"

# 规则引擎测试
python -c "
from etc_sim.models import create_default_rules
rules = create_default_rules()
print(f'Loaded {len(rules)} rules')
for r in rules:
    print(f'  - {r.name}: {len(r.conditions)} conditions')
"
```

### 前端测试

```bash
# TypeScript 类型检查
npx tsc --noEmit

# 构建测试
npm run build

# 开发服务器
npm run dev
```

## 性能优化建议

### 后端

1. **规则缓存** — 避免重复加载规则定义
2. **条件短路** — 在 AND 逻辑中优先评估快速失败的条件
3. **批量评估** — 对多个上下文使用批处理

### 前端

1. **React.memo** — 对重渲染的组件使用 memo
2. **虚拟滚动** — 大量数据表格使用虚拟列表
3. **Zustand 选择器** — 精确订阅需要的状态切片

```typescript
// ❌ 订阅整个 store
const store = useWorkflowStore();

// ✅ 只订阅需要的部分
const nodes = useWorkflowStore(s => s.nodes);
```

## 调试技巧

### 后端日志

```python
import logging
logger = logging.getLogger(__name__)

# 在关键位置添加日志
logger.info(f"规则 '{rule.name}' 评估结果: {result}")
logger.debug(f"上下文数据: {context.gate_stats}")
```

### 前端调试

```typescript
// 使用 React DevTools
console.log('State:', useWorkflowStore.getState());

// WebSocket 消息监控
const ws = new WebSocket(url);
ws.addEventListener('message', (event) => {
  console.log('[WS]', JSON.parse(event.data));
});
```

## 常见问题

### Q: 如何持久化自定义规则？

A: 使用工作流导出功能：
```typescript
const rules = exportToRules();
localStorage.setItem('custom_rules', JSON.stringify(rules));
```

### Q: 评估指标如何计算？

A: 使用时空窗口匹配算法：
1. 对每个真值事件，在时间窗口（默认 120s）和距离窗口（默认 2km）内搜索最近的预警事件
2. 计算 TP（匹配成功）、FP（误报）、FN（漏报）
3. 计算 Precision = TP / (TP + FP)、Recall = TP / (TP + FN)、F1 = 2PR / (P + R)

### Q: 如何优化规则阈值？

A: 使用评估面板的"优化"功能：
1. 选择要优化的规则和条件索引
2. 系统自动在参数范围内网格搜索
3. 选择 F1 最大的参数组合

---

## 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m '添加某功能'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

## 许可证

MIT License
