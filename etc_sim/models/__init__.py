"""
扩展模型模块
包含异常检测、反应时间、响应强度、多车道耦合、排队检测、幽灵堵车、
ETC异常检测、环境影响、预警规则引擎等模型
"""

from .anomaly import AnomalyModel
from .reaction import ReactionTimeModel
from .response import ResponseIntensityModel
from .coupling import MultiLaneCoupling
from .queue import QueueFormationModel
from .phantom_jam import PhantomJamDetector
from .etc_anomaly_detector import ETCAnomalyDetector, ETCTransaction, AnomalyAlert
from .etc_noise_simulator import ETCNoiseSimulator, NoiseConfig, NoiseType
from .environment import EnvironmentModel, EnvironmentConfig, WeatherType, WeatherEffect
from .alert_context import AlertContext, AlertEvent
from .alert_conditions import Condition, CONDITION_REGISTRY, get_all_condition_types
from .alert_rules import (
    AlertRule, AlertRuleEngine, Action, ACTION_REGISTRY,
    create_default_rules, get_all_action_types
)
from .alert_evaluator import AlertEvaluator, GroundTruthEvent, EvaluationMetrics
from .alert_optimizer import AlertOptimizer, ParamRange, OptimizationResult

__all__ = [
    'AnomalyModel',
    'ReactionTimeModel',
    'ResponseIntensityModel',
    'MultiLaneCoupling',
    'QueueFormationModel',
    'PhantomJamDetector',
    'ETCAnomalyDetector',
    'ETCTransaction',
    'AnomalyAlert',
    'ETCNoiseSimulator',
    'NoiseConfig',
    'NoiseType',
    'EnvironmentModel',
    'EnvironmentConfig',
    'WeatherType',
    'WeatherEffect',
    # 预警规则引擎
    'AlertContext',
    'AlertEvent',
    'Condition',
    'CONDITION_REGISTRY',
    'get_all_condition_types',
    'AlertRule',
    'AlertRuleEngine',
    'Action',
    'ACTION_REGISTRY',
    'create_default_rules',
    'get_all_action_types',
    # 评估系统
    'AlertEvaluator',
    'GroundTruthEvent',
    'EvaluationMetrics',
    'AlertOptimizer',
    'ParamRange',
    'OptimizationResult',
]
