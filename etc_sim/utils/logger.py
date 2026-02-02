"""
增强日志系统
"""

from collections import defaultdict
from datetime import datetime


class EnhancedLogger:
    """增强型日志系统"""
    
    def __init__(self, debug_mode: bool = False):
        self.debug_mode = debug_mode
        self.log_buffer = []
        self.event_counts = defaultdict(int)
        self.last_report_time = 0
        self.report_interval = 200
    
    def debug_log(self, msg: str, vehicle_id: int = None):
        """调试日志"""
        if not self.debug_mode:
            return
        self._log('调试', msg, vehicle_id)
    
    def info(self, msg: str, vehicle_id: int = None):
        """信息日志"""
        self._log('信息', msg, vehicle_id)
    
    def warning(self, msg: str, vehicle_id: int = None):
        """警告日志"""
        self._log('警告', msg, vehicle_id)
    
    def _log(self, level: str, msg: str, vehicle_id: int = None):
        """内部日志方法"""
        prefix = f"[{level}]"
        if vehicle_id is not None:
            prefix += f" [车辆:{vehicle_id}]"
        formatted = f"{prefix} {msg}"
        print(formatted)
        self.log_buffer.append({
            'level': level,
            'message': msg,
            'vehicle_id': vehicle_id,
            'timestamp': datetime.now().isoformat()
        })
    
    def log_lane_change(self, vehicle, from_lane: int, to_lane: int, 
                       reason: str, politeness: float):
        """记录换道事件"""
        self._log('信息', f"换道 车道{from_lane+1}→{to_lane+1} ({reason}) 礼貌系数:{politeness:.2f}", vehicle.id)
        self.event_counts['换道'] += 1
    
    def log_anomaly_trigger(self, vehicle, anomaly_type: int, position_km: float):
        """记录异常触发"""
        severity_map = {1: '严重', 2: '中等', 3: '轻微'}
        type_map = {1: '完全静止', 2: '短暂波动', 3: '长时波动'}
        severity = severity_map.get(anomaly_type, '未知')
        type_name = type_map.get(anomaly_type, '未知')
        self._log('警告', f"异常触发 #{severity} | 类型:{type_name} | 位置:{position_km:.2f}公里", vehicle.id)
        self.event_counts['异常'] += 1
    
    def log_congestion(self, segment_idx: int, avg_speed: float, 
                      density: float, vehicle_count: int):
        """记录拥堵预警"""
        if avg_speed < 40:
            self._log('警告', f"拥堵预警 | 区间:{segment_idx+1} | "
                          f"均速:{avg_speed:.1f}km/h | 密度:{density:.1f}veh/km | 车辆:{vehicle_count}")
            self.event_counts['拥堵'] += 1
    
    def periodic_report(self, current_time: float, active_count: int, finished_count: int):
        """定期报告"""
        if current_time - self.last_report_time >= self.report_interval:
            print(f"\n{'='*60}")
            print(f"时间: {int(current_time)}秒 | 活跃: {active_count} | 完成: {finished_count}")
            print(f"事件统计: 异常:{self.event_counts['异常']} | "
                  f"换道:{self.event_counts['换道']} | "
                  f"拥堵:{self.event_counts['拥堵']}")
            print(f"{'='*60}\n")
            self.last_report_time = current_time
    
    def get_stats(self) -> dict:
        """获取统计信息"""
        return dict(self.event_counts)
