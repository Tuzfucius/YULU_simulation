"""
空间索引模块
基于网格的车辆快速检索，将前车查找从 O(N^2) 优化到 O(N)
"""

from typing import List, Dict, Optional, TYPE_CHECKING
from collections import defaultdict

if TYPE_CHECKING:
    from ..core.vehicle import Vehicle


class SpatialIndex:
    """基于网格的空间索引
    
    将道路划分为固定长度的网格（Cell），每辆车根据位置映射到对应网格。
    查找前车时只需检索当前网格及其前方相邻网格，避免全量遍历。
    
    Attributes:
        cell_size: 网格大小（米）
        road_length: 道路总长度（米）
        num_lanes: 车道数量
    """
    
    def __init__(self, road_length_km: float = 20.0, num_lanes: int = 4, cell_size: float = 100.0):
        """初始化空间索引
        
        Args:
            road_length_km: 道路长度（公里）
            num_lanes: 车道数量
            cell_size: 网格大小（米），默认100米
        """
        self.cell_size = cell_size
        self.road_length = road_length_km * 1000  # 转换为米
        self.num_lanes = num_lanes
        self.num_cells = int(self.road_length / cell_size) + 1
        
        # 网格索引: {(lane, cell_idx): [vehicle_id, ...]}
        self._grid: Dict[tuple, List[int]] = defaultdict(list)
        # 车辆ID到车辆对象的映射
        self._vehicles: Dict[int, 'Vehicle'] = {}
        # 车辆ID到网格位置的映射（用于快速更新）
        self._vehicle_cells: Dict[int, tuple] = {}
    
    def clear(self):
        """清空索引"""
        self._grid.clear()
        self._vehicles.clear()
        self._vehicle_cells.clear()
    
    def _get_cell_idx(self, pos: float) -> int:
        """根据位置获取网格索引"""
        return max(0, min(int(pos / self.cell_size), self.num_cells - 1))
    
    def add_vehicle(self, vehicle: 'Vehicle'):
        """添加车辆到索引
        
        Args:
            vehicle: 车辆对象
        """
        cell_idx = self._get_cell_idx(vehicle.pos)
        key = (vehicle.lane, cell_idx)
        
        self._grid[key].append(vehicle.id)
        self._vehicles[vehicle.id] = vehicle
        self._vehicle_cells[vehicle.id] = key
    
    def remove_vehicle(self, vehicle_id: int):
        """从索引中移除车辆
        
        Args:
            vehicle_id: 车辆ID
        """
        if vehicle_id not in self._vehicle_cells:
            return
        
        key = self._vehicle_cells[vehicle_id]
        if vehicle_id in self._grid[key]:
            self._grid[key].remove(vehicle_id)
        
        del self._vehicle_cells[vehicle_id]
        if vehicle_id in self._vehicles:
            del self._vehicles[vehicle_id]
    
    def update_vehicle(self, vehicle: 'Vehicle'):
        """更新车辆位置（换道或移动后调用）
        
        Args:
            vehicle: 车辆对象
        """
        new_cell_idx = self._get_cell_idx(vehicle.pos)
        new_key = (vehicle.lane, new_cell_idx)
        
        if vehicle.id in self._vehicle_cells:
            old_key = self._vehicle_cells[vehicle.id]
            if old_key != new_key:
                # 位置发生变化，需要更新
                if vehicle.id in self._grid[old_key]:
                    self._grid[old_key].remove(vehicle.id)
                self._grid[new_key].append(vehicle.id)
                self._vehicle_cells[vehicle.id] = new_key
        else:
            # 新车辆，直接添加
            self.add_vehicle(vehicle)
        
        # 更新车辆引用
        self._vehicles[vehicle.id] = vehicle
    
    def rebuild(self, vehicles: List['Vehicle']):
        """重建整个索引
        
        Args:
            vehicles: 车辆列表
        """
        self.clear()
        for v in vehicles:
            if not v.finished:
                self.add_vehicle(v)
    
    def find_leader(self, vehicle: 'Vehicle', search_range: int = 3) -> Optional['Vehicle']:
        """查找同车道前车
        
        Args:
            vehicle: 当前车辆
            search_range: 向前搜索的网格数量
        
        Returns:
            前车对象，若无则返回 None
        """
        current_cell = self._get_cell_idx(vehicle.pos)
        min_dist = float('inf')
        leader = None
        
        # 只搜索当前网格及其前方若干个网格
        for offset in range(search_range + 1):
            cell_idx = current_cell + offset
            if cell_idx >= self.num_cells:
                break
            
            key = (vehicle.lane, cell_idx)
            for vid in self._grid.get(key, []):
                if vid == vehicle.id:
                    continue
                other = self._vehicles.get(vid)
                if other and other.pos > vehicle.pos:
                    dist = other.pos - vehicle.pos
                    if dist < min_dist:
                        min_dist = dist
                        leader = other
        
        return leader
    
    def find_leader_in_lane(self, vehicle: 'Vehicle', target_lane: int, search_range: int = 3) -> Optional['Vehicle']:
        """查找指定车道前车
        
        Args:
            vehicle: 当前车辆
            target_lane: 目标车道
            search_range: 向前搜索的网格数量
        
        Returns:
            前车对象，若无则返回 None
        """
        current_cell = self._get_cell_idx(vehicle.pos)
        min_dist = float('inf')
        leader = None
        
        for offset in range(search_range + 1):
            cell_idx = current_cell + offset
            if cell_idx >= self.num_cells:
                break
            
            key = (target_lane, cell_idx)
            for vid in self._grid.get(key, []):
                other = self._vehicles.get(vid)
                if other and other.pos > vehicle.pos:
                    dist = other.pos - vehicle.pos
                    if dist < min_dist:
                        min_dist = dist
                        leader = other
        
        return leader
    
    def find_follower_in_lane(self, vehicle: 'Vehicle', target_lane: int, search_range: int = 3) -> Optional['Vehicle']:
        """查找指定车道后车
        
        Args:
            vehicle: 当前车辆
            target_lane: 目标车道
            search_range: 向后搜索的网格数量
        
        Returns:
            后车对象，若无则返回 None
        """
        current_cell = self._get_cell_idx(vehicle.pos)
        min_dist = float('inf')
        follower = None
        
        for offset in range(search_range + 1):
            cell_idx = current_cell - offset
            if cell_idx < 0:
                break
            
            key = (target_lane, cell_idx)
            for vid in self._grid.get(key, []):
                other = self._vehicles.get(vid)
                if other and other.pos < vehicle.pos:
                    dist = vehicle.pos - other.pos
                    if dist < min_dist:
                        min_dist = dist
                        follower = other
        
        return follower
    
    def get_nearby_vehicles(self, vehicle: 'Vehicle', range_cells: int = 2) -> List['Vehicle']:
        """获取附近的车辆（用于换道决策等）
        
        Args:
            vehicle: 当前车辆
            range_cells: 搜索范围（网格数）
        
        Returns:
            附近车辆列表
        """
        current_cell = self._get_cell_idx(vehicle.pos)
        nearby = []
        
        for lane in range(self.num_lanes):
            for offset in range(-range_cells, range_cells + 1):
                cell_idx = current_cell + offset
                if 0 <= cell_idx < self.num_cells:
                    key = (lane, cell_idx)
                    for vid in self._grid.get(key, []):
                        if vid != vehicle.id:
                            other = self._vehicles.get(vid)
                            if other:
                                nearby.append(other)
        
        return nearby
    
    def get_vehicles_in_segment(self, start_pos: float, end_pos: float) -> List['Vehicle']:
        """获取指定位置范围内的所有车辆
        
        Args:
            start_pos: 起始位置（米）
            end_pos: 结束位置（米）
        
        Returns:
            范围内的车辆列表
        """
        start_cell = self._get_cell_idx(start_pos)
        end_cell = self._get_cell_idx(end_pos)
        
        vehicles = []
        for lane in range(self.num_lanes):
            for cell_idx in range(start_cell, end_cell + 1):
                key = (lane, cell_idx)
                for vid in self._grid.get(key, []):
                    v = self._vehicles.get(vid)
                    if v and start_pos <= v.pos <= end_pos:
                        vehicles.append(v)
        
        return vehicles
    
    def get_cell_density(self, lane: int, cell_idx: int) -> int:
        """获取指定网格的车辆密度
        
        Args:
            lane: 车道索引
            cell_idx: 网格索引
        
        Returns:
            网格内车辆数量
        """
        return len(self._grid.get((lane, cell_idx), []))
    
    def get_high_density_cells(self, threshold: int = 5) -> List[tuple]:
        """获取高密度网格列表（用于幽灵堵车检测优化）
        
        Args:
            threshold: 密度阈值
        
        Returns:
            高密度网格的 (lane, cell_idx) 列表
        """
        high_density = []
        for key, vehicle_ids in self._grid.items():
            if len(vehicle_ids) >= threshold:
                high_density.append(key)
        return high_density
