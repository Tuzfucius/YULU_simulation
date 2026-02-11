"""
数据导出模块

提供：
- 标准化 ETC 流水数据导出（CSV/JSON）
- 仿真轨迹数据记录（供前端回放）
- 异常标注数据集生成（供 ML 训练）
- 自定义保存路径支持
"""

import os
import csv
import json
import random
import string
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta


@dataclass
class ETCFlowRecord:
    """ETC 标准化流水记录"""
    record_id: str                  # 唯一流水号
    plate_number: str               # 车牌号（模拟）
    gate_id: str                    # 门架编号
    gate_position_km: float         # 门架位置（公里）
    timestamp: str                  # ISO 格式时间戳
    timestamp_ms: int               # 毫秒级时间戳
    speed_kmh: float                # 通过速度（km/h）
    vehicle_type: str               # 车辆类型
    lane: int                       # 车道号
    obu_id: str                     # OBU 设备 ID
    transaction_status: str         # 交易状态 (success/failed/delayed)
    noise_type: Optional[str]       # 噪声类型 (none/missed/duplicate/delayed/drift)


@dataclass
class AnomalyLabel:
    """异常标注记录"""
    event_id: str
    event_type: str                 # single_stop / temp_fluctuation / long_fluctuation
    severity: str                   # low / medium / high / critical
    start_time: float               # 开始时间（仿真秒数）
    end_time: Optional[float]       # 结束时间
    position_km: float              # 位置
    lane: int                       # 车道
    vehicle_id: int                 # 车辆 ID
    vehicle_type: str               # 车辆类型
    affected_vehicles: int          # 受影响车辆数
    min_speed_kmh: float            # 最低速度
    congestion_length_m: float      # 拥堵长度
    response_time_s: Optional[float]  # 响应时间
    detected_by_etc: bool           # 是否被 ETC 检测到


class DataExporter:
    """数据导出器"""
    
    def __init__(self, output_dir: str = None, project_root: str = None):
        """
        Args:
            output_dir: 自定义输出目录（默认使用项目目录下的 output/）
            project_root: 项目根目录
        """
        if output_dir:
            self.output_dir = output_dir
        elif project_root:
            self.output_dir = os.path.join(project_root, 'output')
        else:
            self.output_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'output')
        
        os.makedirs(self.output_dir, exist_ok=True)
        self._plate_cache: Dict[int, str] = {}
        self._obu_cache: Dict[int, str] = {}
    
    def _generate_plate(self, vehicle_id: int) -> str:
        """生成模拟车牌号"""
        if vehicle_id in self._plate_cache:
            return self._plate_cache[vehicle_id]
        
        provinces = '京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼宁'
        letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
        
        province = random.choice(provinces)
        city = random.choice(letters)
        digits = ''.join(random.choices(string.digits + letters, k=5))
        plate = f"{province}{city}{digits}"
        
        self._plate_cache[vehicle_id] = plate
        return plate
    
    def _generate_obu_id(self, vehicle_id: int) -> str:
        """生成模拟 OBU ID"""
        if vehicle_id in self._obu_cache:
            return self._obu_cache[vehicle_id]
        
        obu = f"OBU-{vehicle_id:06d}-{''.join(random.choices(string.hexdigits[:16], k=4)).upper()}"
        self._obu_cache[vehicle_id] = obu
        return obu
    
    def export_etc_flow(self, transactions: List[Dict], 
                         base_datetime: datetime = None,
                         format: str = 'csv',
                         filename: str = None) -> str:
        """
        导出标准化 ETC 流水数据
        
        Args:
            transactions: 仿真产生的 ETC 交易列表
            base_datetime: 基准时间（仿真 t=0 对应的真实时间）
            format: 输出格式 ('csv' 或 'json')
            filename: 自定义文件名
        
        Returns:
            输出文件路径
        """
        if base_datetime is None:
            base_datetime = datetime.now().replace(hour=7, minute=0, second=0, microsecond=0)
        
        records: List[ETCFlowRecord] = []
        
        for i, tx in enumerate(transactions):
            sim_time = tx.get('timestamp', tx.get('time', 0))
            real_time = base_datetime + timedelta(seconds=sim_time)
            
            record = ETCFlowRecord(
                record_id=f"TX-{i:08d}",
                plate_number=self._generate_plate(tx.get('vehicle_id', i)),
                gate_id=f"G{tx.get('gate_id', tx.get('segment', 0)):03d}",
                gate_position_km=tx.get('gate_position_km', 0),
                timestamp=real_time.isoformat(timespec='milliseconds'),
                timestamp_ms=int(real_time.timestamp() * 1000),
                speed_kmh=round(tx.get('speed', tx.get('speed_kmh', 0)), 1),
                vehicle_type=tx.get('vehicle_type', 'CAR'),
                lane=tx.get('lane', 0),
                obu_id=self._generate_obu_id(tx.get('vehicle_id', i)),
                transaction_status=tx.get('status', 'success'),
                noise_type=tx.get('noise_type', 'none'),
            )
            records.append(record)
        
        if filename is None:
            ts = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"etc_flow_{ts}"
        
        if format == 'csv':
            return self._write_csv(records, filename)
        else:
            return self._write_json([asdict(r) for r in records], filename)
    
    def export_trajectory(self, vehicles: List, 
                           time_range: tuple = None,
                           sample_interval: float = 0.5,
                           config: dict = None) -> str:
        """
        导出仿真轨迹数据（供前端俯视图回放）
        
        Args:
            vehicles: 车辆对象列表
            time_range: 时间范围 (start, end)
            sample_interval: 采样间隔（秒）
            config: 仿真配置信息
        
        Returns:
            输出文件路径
        """
        # 从车辆轨迹重建帧序列
        all_times = set()
        vehicle_data: Dict[int, List[Dict]] = {}
        
        for v in vehicles:
            if hasattr(v, 'trajectory') and v.trajectory:
                for point in v.trajectory:
                    t = point.get('time', 0)
                    all_times.add(t)
                    vehicle_data.setdefault(v.id, []).append(point)
            elif hasattr(v, 'logs') and v.logs:
                # 从日志数据重建
                for seg_idx, times in v.logs.items():
                    t = times.get('in', 0)
                    all_times.add(t)
        
        if not all_times:
            # 如果没有详细轨迹，生成基本帧
            all_times = {0.0}
        
        sorted_times = sorted(all_times)
        
        # 采样
        if time_range:
            sorted_times = [t for t in sorted_times if time_range[0] <= t <= time_range[1]]
        
        sampled_times = []
        last_t = -999
        for t in sorted_times:
            if t - last_t >= sample_interval:
                sampled_times.append(t)
                last_t = t
        
        # 构建帧序列
        frames = []
        for t in sampled_times:
            frame_vehicles = []
            for v in vehicles:
                # 简化：用最后已知位置
                pos = v.pos if hasattr(v, 'pos') else 0
                frame_vehicles.append({
                    'id': v.id,
                    'x': pos,
                    'lane': v.lane if hasattr(v, 'lane') else 0,
                    'speed': v.speed if hasattr(v, 'speed') else 0,
                    'type': v.vehicle_type if hasattr(v, 'vehicle_type') else 'CAR',
                    'anomaly': v.anomaly_type if hasattr(v, 'anomaly_type') else 0,
                })
            
            frames.append({
                'time': t,
                'vehicles': frame_vehicles,
            })
        
        output = {
            'frames': frames,
            'config': config or {},
            'metadata': {
                'total_frames': len(frames),
                'total_vehicles': len(vehicles),
                'time_range': [sorted_times[0] if sorted_times else 0, 
                               sorted_times[-1] if sorted_times else 0],
                'exported_at': datetime.now().isoformat(),
            }
        }
        
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        filepath = os.path.join(self.output_dir, f"trajectory_{ts}.json")
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        
        return filepath
    
    def export_anomaly_labels(self, anomaly_events: List[Dict],
                               vehicles: List = None) -> str:
        """
        导出异常标注数据集（供 ML 训练）
        
        Args:
            anomaly_events: 异常事件列表
            vehicles: 车辆列表（用于补充信息）
        
        Returns:
            输出文件路径
        """
        labels: List[AnomalyLabel] = []
        
        type_map = {1: 'single_stop', 2: 'temp_fluctuation', 3: 'long_fluctuation'}
        severity_map = {1: 'critical', 2: 'medium', 3: 'high'}
        
        for i, event in enumerate(anomaly_events):
            anomaly_type = event.get('type', 0)
            
            label = AnomalyLabel(
                event_id=f"ANO-{i:06d}",
                event_type=type_map.get(anomaly_type, 'unknown'),
                severity=severity_map.get(anomaly_type, 'low'),
                start_time=event.get('time', 0),
                end_time=event.get('end_time'),
                position_km=event.get('pos_km', 0),
                lane=event.get('lane', 0),
                vehicle_id=event.get('id', 0),
                vehicle_type=event.get('vehicle_type', 'CAR'),
                affected_vehicles=event.get('affected_count', 0),
                min_speed_kmh=event.get('min_speed', 0),
                congestion_length_m=event.get('congestion_length', 0),
                response_time_s=event.get('response_time'),
                detected_by_etc=event.get('etc_detected', False),
            )
            labels.append(label)
        
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        # 同时输出 CSV 和 JSON
        csv_path = self._write_csv(labels, f"anomaly_labels_{ts}")
        json_path = self._write_json(
            [asdict(l) for l in labels], 
            f"anomaly_labels_{ts}"
        )
        
        # ML 元数据
        meta = {
            'dataset_name': 'ETC Traffic Anomaly Labels',
            'total_samples': len(labels),
            'label_distribution': {},
            'features': list(asdict(labels[0]).keys()) if labels else [],
            'csv_path': csv_path,
            'json_path': json_path,
            'created_at': datetime.now().isoformat(),
        }
        
        for label in labels:
            meta['label_distribution'][label.event_type] = \
                meta['label_distribution'].get(label.event_type, 0) + 1
        
        meta_path = os.path.join(self.output_dir, f"anomaly_labels_{ts}_meta.json")
        with open(meta_path, 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
        
        return json_path
    
    def _write_csv(self, records: list, filename: str) -> str:
        """写入 CSV 文件"""
        filepath = os.path.join(self.output_dir, f"{filename}.csv")
        
        if not records:
            with open(filepath, 'w', encoding='utf-8-sig') as f:
                f.write('')
            return filepath
        
        data = [asdict(r) if hasattr(r, '__dataclass_fields__') else r for r in records]
        fieldnames = list(data[0].keys())
        
        with open(filepath, 'w', newline='', encoding='utf-8-sig') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(data)
        
        return filepath
    
    def _write_json(self, data: Any, filename: str) -> str:
        """写入 JSON 文件"""
        filepath = os.path.join(self.output_dir, f"{filename}.json")
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        return filepath
    
    def set_output_dir(self, path: str):
        """修改输出目录"""
        self.output_dir = path
        os.makedirs(self.output_dir, exist_ok=True)
