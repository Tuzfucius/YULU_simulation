"""
车辆投放器
"""

import random
from typing import List


class VehicleSpawner:
    """车辆投放器
    
    管理车辆的生成和投放计划
    """
    
    def __init__(self, total_vehicles: int = 1200, num_lanes: int = 4):
        self.total_vehicles = total_vehicles
        self.num_lanes = num_lanes
        self.spawn_schedule: List[float] = []
        self._generate_schedule()
    
    def _generate_schedule(self):
        """生成投放计划：每10秒投放2-8辆"""
        total_generated = 0
        t_cycle = 0
        
        while total_generated < self.total_vehicles:
            n = random.randint(2, 8)
            if total_generated + n > self.total_vehicles:
                n = self.total_vehicles - total_generated
            
            timestamps = sorted([t_cycle + random.uniform(0, 10) for _ in range(n)])
            self.spawn_schedule.extend(timestamps)
            
            total_generated += n
            t_cycle += 10
    
    def get_spawn_times(self) -> List[float]:
        """获取投放时间列表"""
        return sorted(self.spawn_schedule)
    
    def get_next_spawn_time(self, current_time: float) -> List[float]:
        """获取当前时间之后的所有投放时间"""
        return [t for t in self.spawn_schedule if t > current_time]
    
    def get_next_batch(self, current_time: float, max_count: int = 8) -> List[float]:
        """获取下一批投放时间（最多max_count个）"""
        times = [t for t in self.spawn_schedule if t > current_time]
        return sorted(times)[:max_count]
    
    def select_lane(self, occupied_lanes: set) -> int:
        """选择投放车道（优先选择空闲车道）"""
        available = [i for i in range(self.num_lanes) if i not in occupied_lanes]
        if available:
            return random.choice(available)
        return random.randint(0, self.num_lanes - 1)
    
    def can_spawn(self, vehicle_id: int, current_time: float, 
                  lane: int, existing_vehicles: list) -> bool:
        """检查是否可以在指定车道投放车辆"""
        # 检查车道入口是否有车阻挡
        for v in existing_vehicles:
            if v.lane == lane and v.pos < 50:
                return False
        return True
    
    @property
    def last_spawn_time(self) -> float:
        """最后投放时间"""
        return max(self.spawn_schedule) if self.spawn_schedule else 0
    
    def remaining_count(self, current_time: float) -> int:
        """剩余未投放车辆数"""
        return sum(1 for t in self.spawn_schedule if t > current_time)
