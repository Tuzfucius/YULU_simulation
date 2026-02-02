"""
CSV输出
"""

import csv
import os
from typing import List, Dict


class CSVWriter:
    """CSV文件输出器"""
    
    def __init__(self, output_dir: str):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
    
    def save_vehicles(self, vehicles: List[Dict], filename: str = 'vehicles.csv'):
        """保存车辆记录"""
        filepath = os.path.join(self.output_dir, filename)
        
        if not vehicles:
            return
        
        fieldnames = vehicles[0].keys()
        
        with open(filepath, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(vehicles)
        
        print(f"  已保存: {filepath}")
    
    def save_trajectories(self, trajectories: List[Dict], filename: str = 'trajectories.csv'):
        """保存轨迹数据"""
        filepath = os.path.join(self.output_dir, filename)
        
        if not trajectories:
            return
        
        fieldnames = trajectories[0].keys()
        
        with open(filepath, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(trajectories)
        
        print(f"  已保存: {filepath}")
    
    def save_anomalies(self, anomalies: List[Dict], filename: str = 'anomalies.csv'):
        """保存异常记录"""
        filepath = os.path.join(self.output_dir, filename)
        
        if not anomalies:
            return
        
        fieldnames = anomalies[0].keys()
        
        with open(filepath, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(anomalies)
        
        print(f"  已保存: {filepath}")
    
    def save_segment_speeds(self, speeds: List[Dict], filename: str = 'segment_speeds.csv'):
        """保存区间速度历史"""
        filepath = os.path.join(self.output_dir, filename)
        
        if not speeds:
            return
        
        fieldnames = speeds[0].keys()
        
        with open(filepath, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(speeds)
        
        print(f"  已保存: {filepath}")
    
    def save_safety_data(self, safety_data: List[Dict], filename: str = 'safety_data.csv'):
        """保存安全数据"""
        filepath = os.path.join(self.output_dir, filename)
        
        if not safety_data:
            return
        
        fieldnames = safety_data[0].keys()
        
        with open(filepath, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(safety_data)
        
        print(f"  已保存: {filepath}")
