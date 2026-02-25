"""
存储服务
"""

import json
import os
import numpy as np
from typing import Optional, Dict, Any
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class NumpyEncoder(json.JSONEncoder):
    """安全处理 numpy 类型的 JSON 编码器"""
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, np.bool_):
            return bool(obj)
        return super().default(obj)


class StorageService:
    """仿真数据存储服务"""
    
    def __init__(self, base_dir: str = None):
        self.base_dir = base_dir or os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "data"
        )
        self.config_dir = os.path.join(self.base_dir, "config")
        self.simulations_dir = os.path.join(self.base_dir, "simulations")
        self.charts_dir = os.path.join(self.base_dir, "charts")
        self.layouts_dir = os.path.join(self.base_dir, "layouts")
        
        # 确保目录存在
        for dir_path in [self.config_dir, self.simulations_dir, 
                        self.charts_dir, self.layouts_dir]:
            os.makedirs(dir_path, exist_ok=True)
    
    def save_config(self, config_id: str, config_data: dict) -> str:
        """保存配置"""
        filepath = os.path.join(self.config_dir, f"{config_id}.json")
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(config_data, f, indent=2, ensure_ascii=False)
        return filepath
    
    def load_config(self, config_id: str) -> Optional[dict]:
        """加载配置"""
        filepath = os.path.join(self.config_dir, f"{config_id}.json")
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        return None
    
    def delete_config(self, config_id: str) -> bool:
        """删除配置"""
        filepath = os.path.join(self.config_dir, f"{config_id}.json")
        if os.path.exists(filepath):
            os.remove(filepath)
            return True
        return False
    
    def list_configs(self) -> list:
        """列出所有配置"""
        configs = []
        for filename in os.listdir(self.config_dir):
            if filename.endswith('.json'):
                config_id = filename[:-5]
                config = self.load_config(config_id)
                if config:
                    configs.append({
                        "id": config_id,
                        "name": config.get("name", config_id),
                        "created_at": config.get("created_at")
                    })
        return configs
    
    def save_results(self, simulation_id: str, results_data: dict) -> str:
        """保存仿真结果"""
        sim_dir = os.path.join(self.simulations_dir, simulation_id)
        os.makedirs(sim_dir, exist_ok=True)
        filepath = os.path.join(sim_dir, "data.json")
        
        # 添加元数据
        results_data["_metadata"] = {
            "saved_at": datetime.utcnow().isoformat(),
            "simulation_id": simulation_id
        }
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(results_data, f, indent=2, ensure_ascii=False, cls=NumpyEncoder)
        
        return filepath
    
    def load_results(self, simulation_id: str) -> Optional[dict]:
        """加载仿真结果"""
        filepath = os.path.join(self.simulations_dir, simulation_id, "data.json")
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        return None
    
    def delete_results(self, simulation_id: str) -> bool:
        """删除仿真结果"""
        import shutil
        sim_dir = os.path.join(self.simulations_dir, simulation_id)
        if os.path.exists(sim_dir):
            shutil.rmtree(sim_dir)
            return True
        return False
    
    def list_results(self) -> list:
        """列出所有仿真结果"""
        results = []
        if not os.path.exists(self.simulations_dir):
            return results
        for dirname in os.listdir(self.simulations_dir):
            sim_dir = os.path.join(self.simulations_dir, dirname)
            if os.path.isdir(sim_dir) and os.path.exists(os.path.join(sim_dir, "data.json")):
                simulation_id = dirname
                result = self.load_results(simulation_id)
                if result:
                    metadata = result.get("_metadata", {})
                    results.append({
                        "id": simulation_id,
                        "status": result.get("status", "unknown"),
                        "created_at": metadata.get("saved_at")
                    })
        return sorted(results, key=lambda x: x.get("created_at", ""), reverse=True)
    
    def export_results_csv(self, simulation_id: str, data_type: str = "vehicle_records") -> str:
        """导出结果为 CSV"""
        results = self.load_results(simulation_id)
        if not results:
            return None
        
        data = results.get(data_type, [])
        if not data:
            return None
        
        # 简单 CSV 导出
        if isinstance(data, list) and len(data) > 0:
            if isinstance(data[0], dict):
                headers = list(data[0].keys())
                rows = [[str(row.get(h, "")) for h in headers] for row in data]
                
                filepath = os.path.join(
                    self.simulations_dir, 
                    simulation_id,
                    f"{data_type}.csv"
                )
                
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(",".join(headers) + "\n")
                    for row in rows:
                        f.write(",".join(row) + "\n")
                
                return filepath
        
        return None
    
    def save_chart_favorite(self, favorite_id: str, favorite_data: dict) -> str:
        """保存图表收藏"""
        filepath = os.path.join(self.charts_dir, f"{favorite_id}.json")
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(favorite_data, f, indent=2, ensure_ascii=False)
        return filepath
    
    def list_chart_favorites(self) -> list:
        """列出所有图表收藏"""
        favorites = []
        for filename in os.listdir(self.charts_dir):
            if filename.endswith('.json') and filename.startswith('favorite_'):
                with open(os.path.join(self.charts_dir, filename), 'r') as f:
                    fav = json.load(f)
                    favorites.append(fav)
        return favorites
    
    def save_layout(self, layout_id: str, layout_data: dict) -> str:
        """保存布局"""
        filepath = os.path.join(self.layouts_dir, f"{layout_id}.json")
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(layout_data, f, indent=2, ensure_ascii=False)
        return filepath
    
    def list_layouts(self) -> list:
        """列出所有布局"""
        layouts = []
        for filename in os.listdir(self.layouts_dir):
            if filename.endswith('.json'):
                with open(os.path.join(self.layouts_dir, filename), 'r') as f:
                    layout = json.load(f)
                    layouts.append(layout)
        return layouts
