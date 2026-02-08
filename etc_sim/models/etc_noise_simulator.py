"""
ETC 噪声注入模块
模拟真实 ETC 系统的硬件异常和通信问题

可扩展设计：
- 使用策略模式，每种噪声类型是独立的注入器
- 通过配置控制各类噪声的比例
- 支持自定义注入器的注册
"""

import random
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Callable, Tuple
from enum import Enum


class NoiseType(Enum):
    """噪声类型枚举"""
    MISSED_READ = "missed_read"       # 漏读
    DUPLICATE_READ = "duplicate_read"  # 重复读
    DELAYED_UPLOAD = "delayed_upload"  # 延迟上传
    CLOCK_DRIFT = "clock_drift"        # 时钟偏移


@dataclass
class NoiseConfig:
    """噪声配置
    
    Attributes:
        missed_read_rate: 漏读概率 (0.0-1.0)
        duplicate_read_rate: 重复读概率 (0.0-1.0)
        delayed_upload_rate: 延迟上传概率 (0.0-1.0)
        delayed_upload_range: 延迟时间范围 (秒)
        clock_drift_rate: 时钟偏移概率 (0.0-1.0)
        clock_drift_range: 时钟偏移范围 (秒)
    """
    missed_read_rate: float = 0.03
    duplicate_read_rate: float = 0.02
    delayed_upload_rate: float = 0.05
    delayed_upload_range: Tuple[float, float] = (1.0, 5.0)
    clock_drift_rate: float = 0.10
    clock_drift_range: Tuple[float, float] = (-0.5, 0.5)
    
    # 控制开关
    enabled: bool = True
    
    def to_dict(self) -> dict:
        return {
            'missed_read_rate': self.missed_read_rate,
            'duplicate_read_rate': self.duplicate_read_rate,
            'delayed_upload_rate': self.delayed_upload_rate,
            'delayed_upload_range': list(self.delayed_upload_range),
            'clock_drift_rate': self.clock_drift_rate,
            'clock_drift_range': list(self.clock_drift_range),
            'enabled': self.enabled
        }


@dataclass
class NoiseEvent:
    """噪声事件记录"""
    noise_type: NoiseType
    vehicle_id: int
    gate_id: str
    original_timestamp: float
    modified_timestamp: Optional[float] = None
    is_dropped: bool = False
    duplicate_count: int = 1
    description: str = ""


class NoiseInjector(ABC):
    """噪声注入器基类 (策略模式)"""
    
    @abstractmethod
    def should_inject(self, config: NoiseConfig) -> bool:
        """判断是否应该注入噪声"""
        pass
    
    @abstractmethod
    def inject(self, transaction: dict, config: NoiseConfig) -> Tuple[List[dict], NoiseEvent]:
        """
        注入噪声
        
        Args:
            transaction: 原始交易记录
            config: 噪声配置
            
        Returns:
            (修改后的交易列表, 噪声事件记录)
            - 列表可能为空（漏读）、单个（正常/修改）、多个（重复读）
        """
        pass


class MissedReadInjector(NoiseInjector):
    """漏读注入器：模拟车辆经过但未被识别"""
    
    def should_inject(self, config: NoiseConfig) -> bool:
        return random.random() < config.missed_read_rate
    
    def inject(self, transaction: dict, config: NoiseConfig) -> Tuple[List[dict], NoiseEvent]:
        event = NoiseEvent(
            noise_type=NoiseType.MISSED_READ,
            vehicle_id=transaction['vehicle_id'],
            gate_id=transaction['gate_id'],
            original_timestamp=transaction['timestamp'],
            is_dropped=True,
            description="交易被漏读，未生成记录"
        )
        return [], event


class DuplicateReadInjector(NoiseInjector):
    """重复读注入器：模拟同一车辆被识别多次"""
    
    def should_inject(self, config: NoiseConfig) -> bool:
        return random.random() < config.duplicate_read_rate
    
    def inject(self, transaction: dict, config: NoiseConfig) -> Tuple[List[dict], NoiseEvent]:
        # 生成 2-3 条重复记录
        dup_count = random.choice([2, 3])
        transactions = []
        
        for i in range(dup_count):
            dup_trans = transaction.copy()
            # 重复记录的时间戳略有不同 (±0.1s)
            dup_trans['timestamp'] = transaction['timestamp'] + random.uniform(-0.1, 0.1) * i
            dup_trans['is_duplicate'] = i > 0
            transactions.append(dup_trans)
        
        event = NoiseEvent(
            noise_type=NoiseType.DUPLICATE_READ,
            vehicle_id=transaction['vehicle_id'],
            gate_id=transaction['gate_id'],
            original_timestamp=transaction['timestamp'],
            duplicate_count=dup_count,
            description=f"生成 {dup_count} 条重复记录"
        )
        return transactions, event


class DelayedUploadInjector(NoiseInjector):
    """延迟上传注入器：模拟网络延迟导致记录延迟到达"""
    
    def should_inject(self, config: NoiseConfig) -> bool:
        return random.random() < config.delayed_upload_rate
    
    def inject(self, transaction: dict, config: NoiseConfig) -> Tuple[List[dict], NoiseEvent]:
        delay = random.uniform(*config.delayed_upload_range)
        
        delayed_trans = transaction.copy()
        delayed_trans['upload_delay'] = delay
        delayed_trans['actual_upload_time'] = transaction['timestamp'] + delay
        
        event = NoiseEvent(
            noise_type=NoiseType.DELAYED_UPLOAD,
            vehicle_id=transaction['vehicle_id'],
            gate_id=transaction['gate_id'],
            original_timestamp=transaction['timestamp'],
            modified_timestamp=transaction['timestamp'] + delay,
            description=f"上传延迟 {delay:.2f} 秒"
        )
        return [delayed_trans], event


class ClockDriftInjector(NoiseInjector):
    """时钟偏移注入器：模拟门架时钟不同步"""
    
    def should_inject(self, config: NoiseConfig) -> bool:
        return random.random() < config.clock_drift_rate
    
    def inject(self, transaction: dict, config: NoiseConfig) -> Tuple[List[dict], NoiseEvent]:
        drift = random.uniform(*config.clock_drift_range)
        
        drifted_trans = transaction.copy()
        drifted_trans['timestamp'] = transaction['timestamp'] + drift
        drifted_trans['clock_drift'] = drift
        
        event = NoiseEvent(
            noise_type=NoiseType.CLOCK_DRIFT,
            vehicle_id=transaction['vehicle_id'],
            gate_id=transaction['gate_id'],
            original_timestamp=transaction['timestamp'],
            modified_timestamp=transaction['timestamp'] + drift,
            description=f"时钟偏移 {drift:+.3f} 秒"
        )
        return [drifted_trans], event


class ETCNoiseSimulator:
    """ETC 噪声模拟器
    
    可扩展的噪声注入系统，支持：
    - 多种预置噪声类型
    - 自定义噪声注入器注册
    - 噪声事件追踪和统计
    
    使用示例:
        simulator = ETCNoiseSimulator()
        simulator.config.missed_read_rate = 0.05  # 调整漏读率
        
        noisy_transactions, events = simulator.process(transaction)
    """
    
    def __init__(self, config: NoiseConfig = None):
        self.config = config or NoiseConfig()
        self.noise_events: List[NoiseEvent] = []
        
        # 注册默认注入器（按优先级排序）
        self._injectors: List[NoiseInjector] = [
            MissedReadInjector(),      # 最高优先级：漏读直接丢弃
            DuplicateReadInjector(),   # 重复读
            DelayedUploadInjector(),   # 延迟上传
            ClockDriftInjector(),      # 时钟偏移（可叠加）
        ]
        
        # 统计计数器
        self._stats = {
            NoiseType.MISSED_READ: 0,
            NoiseType.DUPLICATE_READ: 0,
            NoiseType.DELAYED_UPLOAD: 0,
            NoiseType.CLOCK_DRIFT: 0,
        }
        self._total_processed = 0
    
    def register_injector(self, injector: NoiseInjector, priority: int = -1):
        """注册自定义噪声注入器
        
        Args:
            injector: 噪声注入器实例
            priority: 插入位置，-1 表示末尾
        """
        if priority < 0:
            self._injectors.append(injector)
        else:
            self._injectors.insert(priority, injector)
    
    def process(self, transaction: dict) -> Tuple[List[dict], List[NoiseEvent]]:
        """处理单条交易，注入噪声
        
        Args:
            transaction: 原始交易记录 (dict)
            
        Returns:
            (处理后的交易列表, 噪声事件列表)
        """
        if not self.config.enabled:
            return [transaction], []
        
        self._total_processed += 1
        events = []
        current_transactions = [transaction]
        
        for injector in self._injectors:
            if not injector.should_inject(self.config):
                continue
            
            # 对当前所有交易应用注入器
            new_transactions = []
            for trans in current_transactions:
                result_trans, event = injector.inject(trans, self.config)
                new_transactions.extend(result_trans)
                events.append(event)
                self.noise_events.append(event)
                self._stats[event.noise_type] += 1
                
                # 如果是漏读，直接返回空
                if event.is_dropped:
                    return [], events
            
            current_transactions = new_transactions
        
        return current_transactions if current_transactions else [transaction], events
    
    def get_statistics(self) -> Dict:
        """获取噪声注入统计"""
        return {
            'total_processed': self._total_processed,
            'missed_read_count': self._stats[NoiseType.MISSED_READ],
            'duplicate_read_count': self._stats[NoiseType.DUPLICATE_READ],
            'delayed_upload_count': self._stats[NoiseType.DELAYED_UPLOAD],
            'clock_drift_count': self._stats[NoiseType.CLOCK_DRIFT],
            'missed_read_rate_actual': self._stats[NoiseType.MISSED_READ] / max(1, self._total_processed),
            'duplicate_read_rate_actual': self._stats[NoiseType.DUPLICATE_READ] / max(1, self._total_processed),
        }
    
    def reset_statistics(self):
        """重置统计计数器"""
        for noise_type in self._stats:
            self._stats[noise_type] = 0
        self._total_processed = 0
        self.noise_events.clear()
