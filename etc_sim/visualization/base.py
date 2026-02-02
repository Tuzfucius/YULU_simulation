"""
可视化基类
"""

import os
import matplotlib.pyplot as plt


class Visualizer:
    """可视化器基类"""
    
    def __init__(self, output_dir: str):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
    
    def save(self, fig, filename: str, dpi: int = 150):
        """保存图像"""
        path = os.path.join(self.output_dir, filename)
        fig.savefig(path, dpi=dpi, bbox_inches='tight')
        print(f"  已保存: {path}")
        plt.close(fig)
    
    def generate(self, *args, **kwargs):
        """生成可视化（子类实现）"""
        raise NotImplementedError
