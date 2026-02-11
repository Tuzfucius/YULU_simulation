"""
预警规则引擎模块
规则组合（AlertRule）+ 动作（Action）+ 规则引擎（AlertRuleEngine）

设计理念：
- AlertRule = 一组 Condition 的逻辑组合 + 触发后的 Action 列表
- AlertRuleEngine 管理所有规则，在每步仿真中评估并触发匹配的规则
- 支持 JSON 序列化/反序列化（对接可视化工作流编辑器）
"""

import time as _time
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Type

from .alert_context import AlertContext, AlertEvent
from .alert_conditions import Condition, CONDITION_REGISTRY

logger = logging.getLogger(__name__)

# 全局动作注册表
ACTION_REGISTRY: Dict[str, Type['Action']] = {}


def register_action(cls):
    """动作注册装饰器"""
    ACTION_REGISTRY[cls.action_type] = cls
    return cls


# ==================== 动作基类与实现 ====================

@dataclass
class Action(ABC):
    """预警动作基类"""
    action_type: str = ''
    description: str = ''
    params: Dict[str, Any] = field(default_factory=dict)
    
    @abstractmethod
    def execute(self, event: AlertEvent, context: AlertContext) -> None:
        """执行动作
        
        Args:
            event: 触发的预警事件
            context: 当前预警上下文
        """
        ...
    
    def to_dict(self) -> dict:
        return {
            'type': self.action_type,
            'params': self.params,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'Action':
        action_type = data.get('type', '')
        if action_type in ACTION_REGISTRY:
            action_cls = ACTION_REGISTRY[action_type]
            return action_cls(params=data.get('params', {}))
        raise ValueError(f"未知动作类型: {action_type}")


@register_action
@dataclass
class LogAction(Action):
    """记录日志动作"""
    action_type: str = 'log'
    description: str = '记录到日志'
    
    def execute(self, event: AlertEvent, context: AlertContext) -> None:
        level = self.params.get('level', 'warning')
        msg = f"[预警] {event.rule_name} | {event.severity} | {event.description}"
        if level == 'error':
            logger.error(msg)
        elif level == 'warning':
            logger.warning(msg)
        else:
            logger.info(msg)


@register_action
@dataclass
class NotifyAction(Action):
    """推送通知动作（通过 WebSocket 发送到前端）"""
    action_type: str = 'notify'
    description: str = '推送通知'
    
    # 收集的待推送事件（每步清空）
    pending_notifications: List[AlertEvent] = field(default_factory=list)
    
    def execute(self, event: AlertEvent, context: AlertContext) -> None:
        self.pending_notifications.append(event)
    
    def flush(self) -> List[AlertEvent]:
        """取出并清空待推送事件"""
        events = list(self.pending_notifications)
        self.pending_notifications.clear()
        return events


@register_action
@dataclass
class SpeedLimitAction(Action):
    """建议限速动作"""
    action_type: str = 'speed_limit'
    description: str = '建议限速'
    
    recommendations: List[Dict[str, Any]] = field(default_factory=list)
    
    def execute(self, event: AlertEvent, context: AlertContext) -> None:
        limit_kmh = self.params.get('limit_kmh', 60)
        self.recommendations.append({
            'gate_id': event.gate_id,
            'position_km': event.position_km,
            'suggested_limit_kmh': limit_kmh,
            'reason': event.description,
            'timestamp': event.timestamp,
        })


@register_action
@dataclass
class LaneControlAction(Action):
    """车道管控建议动作"""
    action_type: str = 'lane_control'
    description: str = '车道管控建议'
    
    recommendations: List[Dict[str, Any]] = field(default_factory=list)
    
    def execute(self, event: AlertEvent, context: AlertContext) -> None:
        self.recommendations.append({
            'gate_id': event.gate_id,
            'position_km': event.position_km,
            'affected_lanes': event.affected_lanes,
            'action': self.params.get('action', 'divert'),
            'reason': event.description,
            'timestamp': event.timestamp,
        })


# ==================== 规则定义 ====================

@dataclass
class AlertRule:
    """预警规则 = 条件组合 + 动作
    
    Attributes:
        name: 规则名称（唯一标识）
        description: 规则描述
        conditions: 条件列表
        logic: 条件组合逻辑 ('AND' 或 'OR')
        severity: 触发时的严重等级
        actions: 触发后执行的动作列表
        cooldown_s: 冷却时间（避免重复触发）
        enabled: 是否启用
    """
    name: str = ''
    description: str = ''
    conditions: List[Condition] = field(default_factory=list)
    logic: str = 'AND'              # 'AND' / 'OR'
    severity: str = 'medium'        # 'low' / 'medium' / 'high' / 'critical'
    actions: List[Action] = field(default_factory=list)
    cooldown_s: float = 60.0
    enabled: bool = True
    
    # 内部状态
    _last_trigger_time: float = field(default=0.0, repr=False)
    
    def evaluate(self, context: AlertContext) -> Optional[AlertEvent]:
        """评估规则，如满足条件则返回预警事件
        
        Args:
            context: 预警上下文
            
        Returns:
            预警事件，若条件不满足则返回 None
        """
        if not self.enabled or not self.conditions:
            return None
        
        # 检查冷却时间
        if context.current_time - self._last_trigger_time < self.cooldown_s:
            return None
        
        # 评估条件组合
        if self.logic == 'AND':
            triggered = all(c.evaluate(context) for c in self.conditions)
        elif self.logic == 'OR':
            triggered = any(c.evaluate(context) for c in self.conditions)
        else:
            triggered = all(c.evaluate(context) for c in self.conditions)
        
        if not triggered:
            return None
        
        # 构建预警事件
        self._last_trigger_time = context.current_time
        
        # 尝试从条件中获取门架信息
        gate_id = ''
        position_km = 0.0
        for cond in self.conditions:
            if cond.gate_id != '*':
                gate_id = cond.gate_id
                stat = context.gate_stats.get(gate_id)
                if stat:
                    position_km = getattr(stat, 'position_km', 0.0)
                break
        
        event = AlertEvent(
            rule_name=self.name,
            severity=self.severity,
            timestamp=context.current_time,
            gate_id=gate_id,
            position_km=position_km,
            description=self.description or self.name,
            confidence=0.8,
            metadata={'logic': self.logic, 'conditions': len(self.conditions)},
        )
        
        # 执行动作
        for action in self.actions:
            try:
                action.execute(event, context)
            except Exception as e:
                logger.error(f"执行动作 {action.action_type} 失败: {e}")
        
        return event
    
    def to_dict(self) -> dict:
        """序列化为字典"""
        return {
            'name': self.name,
            'description': self.description,
            'conditions': [c.to_dict() for c in self.conditions],
            'logic': self.logic,
            'severity': self.severity,
            'actions': [a.to_dict() for a in self.actions],
            'cooldown_s': self.cooldown_s,
            'enabled': self.enabled,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'AlertRule':
        """从字典反序列化"""
        conditions = [Condition.from_dict(c) for c in data.get('conditions', [])]
        actions = [Action.from_dict(a) for a in data.get('actions', [])]
        
        return cls(
            name=data.get('name', ''),
            description=data.get('description', ''),
            conditions=conditions,
            logic=data.get('logic', 'AND'),
            severity=data.get('severity', 'medium'),
            actions=actions,
            cooldown_s=data.get('cooldown_s', 60.0),
            enabled=data.get('enabled', True),
        )


# ==================== 规则引擎 ====================

class AlertRuleEngine:
    """预警规则引擎
    
    管理和执行预警规则。在每步仿真中：
    1. 接收 AlertContext
    2. 逐条评估所有已启用的规则
    3. 收集触发的 AlertEvent
    4. 执行关联的 Action
    
    使用示例::
    
        engine = AlertRuleEngine()
        
        # 添加规则
        rule = AlertRule(
            name='拥堵检测',
            conditions=[SpeedBelowThreshold(params={'threshold_kmh': 40})],
            severity='medium',
            actions=[LogAction(), NotifyAction()],
        )
        engine.add_rule(rule)
        
        # 每步仿真中评估
        events = engine.evaluate_all(context)
    """
    
    def __init__(self):
        self.rules: List[AlertRule] = []
        self.event_history: List[AlertEvent] = []
        self._rules_by_name: Dict[str, AlertRule] = {}
    
    def add_rule(self, rule: AlertRule) -> None:
        """添加规则"""
        if rule.name in self._rules_by_name:
            # 替换同名规则
            self.rules = [r for r in self.rules if r.name != rule.name]
        self.rules.append(rule)
        self._rules_by_name[rule.name] = rule
    
    def remove_rule(self, rule_name: str) -> bool:
        """移除规则"""
        if rule_name in self._rules_by_name:
            self.rules = [r for r in self.rules if r.name != rule_name]
            del self._rules_by_name[rule_name]
            return True
        return False
    
    def get_rule(self, rule_name: str) -> Optional[AlertRule]:
        """获取规则"""
        return self._rules_by_name.get(rule_name)
    
    def enable_rule(self, rule_name: str, enabled: bool = True) -> bool:
        """启用/禁用规则"""
        rule = self._rules_by_name.get(rule_name)
        if rule:
            rule.enabled = enabled
            return True
        return False
    
    def evaluate_all(self, context: AlertContext) -> List[AlertEvent]:
        """评估所有规则
        
        Args:
            context: 当前预警上下文
            
        Returns:
            本步触发的预警事件列表
        """
        events = []
        for rule in self.rules:
            try:
                event = rule.evaluate(context)
                if event:
                    events.append(event)
            except Exception as e:
                logger.error(f"评估规则 '{rule.name}' 时异常: {e}")
        
        self.event_history.extend(events)
        return events
    
    def get_recent_events(self, max_age: float = 300.0, 
                          current_time: float = 0.0) -> List[AlertEvent]:
        """获取最近的预警事件"""
        return [
            e for e in self.event_history
            if current_time - e.timestamp <= max_age
        ]
    
    def clear_history(self) -> None:
        """清空历史"""
        self.event_history.clear()
    
    def reset(self) -> None:
        """重置引擎状态（保留规则定义）"""
        self.event_history.clear()
        for rule in self.rules:
            rule._last_trigger_time = 0.0
    
    # ==================== JSON 序列化 ====================
    
    def load_from_json(self, json_data: dict) -> None:
        """从 JSON 加载规则
        
        Args:
            json_data: 包含 'rules' 键的字典
        """
        rules_data = json_data.get('rules', [])
        for rule_data in rules_data:
            try:
                rule = AlertRule.from_dict(rule_data)
                self.add_rule(rule)
            except Exception as e:
                logger.error(f"加载规则失败: {e}, data={rule_data}")
    
    def export_to_json(self) -> dict:
        """导出规则为 JSON"""
        return {
            'rules': [r.to_dict() for r in self.rules],
        }
    
    def to_dict(self) -> dict:
        """导出引擎状态"""
        return {
            'rules_count': len(self.rules),
            'enabled_rules_count': sum(1 for r in self.rules if r.enabled),
            'total_events': len(self.event_history),
            'rules': [
                {
                    'name': r.name,
                    'enabled': r.enabled,
                    'severity': r.severity,
                    'conditions_count': len(r.conditions),
                    'last_trigger_time': r._last_trigger_time,
                }
                for r in self.rules
            ],
        }


# ==================== 预置规则工厂 ====================

def create_default_rules() -> List[AlertRule]:
    """创建默认预警规则集
    
    提供一组覆盖常见场景的预置规则，用户可基于此修改。
    """
    from .alert_conditions import (
        SpeedBelowThreshold, TravelTimeOutlier, FlowImbalance,
        ConsecutiveAlerts, QueueLengthExceeds, SpeedStdDevHigh,
        SegmentSpeedDrop, WeatherCondition, HighMissedReadRate
    )
    
    rules = []
    
    # 规则1：拥堵检测（速度低 + 行程时间偏高）
    rules.append(AlertRule(
        name='拥堵检测',
        description='门架区间速度持续低于阈值且行程时间异常',
        conditions=[
            SpeedBelowThreshold(params={'threshold_kmh': 40.0, 'min_samples': 3}),
            TravelTimeOutlier(params={'z_score_threshold': 2.0}),
        ],
        logic='AND',
        severity='medium',
        actions=[LogAction(), NotifyAction()],
        cooldown_s=60.0,
    ))
    
    # 规则2：疑似事故（流量不平衡 + 连续异常）
    rules.append(AlertRule(
        name='疑似事故',
        description='上下游流量严重不平衡，可能存在事故',
        conditions=[
            FlowImbalance(params={'ratio_threshold': 0.3}),
            ConsecutiveAlerts(params={'count_threshold': 5}),
        ],
        logic='OR',
        severity='high',
        actions=[LogAction(), NotifyAction(), SpeedLimitAction(params={'limit_kmh': 40})],
        cooldown_s=120.0,
    ))
    
    # 规则3：缓行预警（速度持续低于 60 km/h）
    rules.append(AlertRule(
        name='缓行预警',
        description='区间平均速度低于缓行阈值',
        conditions=[
            SpeedBelowThreshold(params={'threshold_kmh': 60.0, 'min_samples': 5}),
        ],
        logic='AND',
        severity='low',
        actions=[LogAction(), NotifyAction()],
        cooldown_s=30.0,
    ))
    
    # 规则4：交通震荡波预警
    rules.append(AlertRule(
        name='交通震荡预警',
        description='速度波动大，可能形成交通震荡波',
        conditions=[
            SpeedStdDevHigh(params={'std_threshold_kmh': 20.0}),
        ],
        logic='AND',
        severity='medium',
        actions=[LogAction(), NotifyAction()],
        cooldown_s=45.0,
    ))
    
    # 规则5：严重排队预警
    rules.append(AlertRule(
        name='严重排队',
        description='排队长度超过限制',
        conditions=[
            QueueLengthExceeds(params={'length_threshold_m': 800.0}),
        ],
        logic='AND',
        severity='high',
        actions=[LogAction(), NotifyAction(), LaneControlAction()],
        cooldown_s=90.0,
    ))
    
    # 规则6：恶劣天气 + 低速（高级组合）
    rules.append(AlertRule(
        name='恶劣天气低速预警',
        description='恶劣天气条件下速度过低，安全风险高',
        conditions=[
            WeatherCondition(params={'weather_types': ['rain', 'fog', 'snow']}),
            SpeedBelowThreshold(params={'threshold_kmh': 50.0}),
        ],
        logic='AND',
        severity='high',
        actions=[LogAction(), NotifyAction(), SpeedLimitAction(params={'limit_kmh': 40})],
        cooldown_s=60.0,
    ))
    
    # 规则7：ETC 设备异常
    rules.append(AlertRule(
        name='ETC设备异常',
        description='ETC 漏读率过高，可能硬件故障',
        conditions=[
            HighMissedReadRate(params={'rate_threshold': 0.15}),
        ],
        logic='AND',
        severity='critical',
        actions=[LogAction(), NotifyAction()],
        cooldown_s=300.0,
    ))
    
    return rules


def get_all_action_types() -> List[Dict[str, Any]]:
    """获取所有已注册的动作类型"""
    result = []
    for action_type, action_cls in ACTION_REGISTRY.items():
        temp = action_cls()
        result.append({
            'type': action_type,
            'description': temp.description,
        })
    return result
