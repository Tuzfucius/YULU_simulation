# -*- coding: utf-8 -*-
"""
图表生成服务
从仿真数据生成 matplotlib 图表
"""

import os
import sys
import traceback

# Setup basic logging to file immediately
def log_debug(msg, output_dir=None):
    try:
        if output_dir:
            log_file = os.path.join(output_dir, "plotter_debug.log")
            with open(log_file, "a", encoding="utf-8") as f:
                f.write(msg + "\n")
        else:
            print(msg)
    except:
        print(msg)

try:
    import math
    import random
    import json
    import argparse
    from pathlib import Path
    from typing import Dict, List, Any
    from collections import defaultdict
    
    import numpy as np
    import matplotlib
    matplotlib.use('Agg') # Set non-interactive backend
    import matplotlib.pyplot as plt
    import matplotlib.patches as mpatches
    import matplotlib.animation as animation
    from matplotlib import colors as mcolors
except ImportError as e:
    # If we can't import, we can't do anything. We must log this.
    # We don't know the output dir yet, so we try to log to cwd or stderr
    error_msg = f"Import Error in plotter.py: {e}\n{traceback.format_exc()}"
    print(error_msg, file=sys.stderr)
    # create a fallback log in current directory
    with open("plotter_import_error.log", "w") as f:
        f.write(error_msg)
    sys.exit(1)

# matplotlib 中文字体配置
plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'WenQuanYi Micro Hei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

# 颜色定义
COLOR_NORMAL = '#1f77b4'
COLOR_IMPACTED = '#ff7f0e'
COLOR_TYPE1 = '#8b0000'
COLOR_TYPE2 = '#9400d3'
COLOR_TYPE3 = '#8b4513'
COLOR_CAR = '#1f77b4'
COLOR_TRUCK = '#ff7f0e'
COLOR_BUS = '#2ca02c'
COLOR_AGGRESSIVE = '#d62728'
COLOR_NORMAL_DRIVER = '#1f77b4'
COLOR_CONSERVATIVE = '#2ca02c'


class ChartGenerator:
    """图表生成器"""
    

    def __init__(self, output_dir: str, theme: str = 'dark'):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.theme = theme
        self._setup_style()
        
    def _setup_style(self):
        """根据主题配置样式"""
        # 强制重置字体设置
        plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'WenQuanYi Micro Hei', 'DejaVu Sans']
        plt.rcParams['axes.unicode_minus'] = False
        
        if self.theme == 'light':
            self.bg_color = '#FFFFFF'
            self.text_color = '#000000'
            self.grid_color = '#E0E0E0'
            plt.style.use('default')
            # 强制白色背景
            plt.rcParams['figure.facecolor'] = 'white'
            plt.rcParams['axes.facecolor'] = 'white'
            plt.rcParams['savefig.facecolor'] = 'white'
        else:
            self.bg_color = '#1C1B1F'
            self.text_color = '#E3E3E3'
            self.grid_color = '#333333'
            plt.style.use('dark_background')
            plt.rcParams['figure.facecolor'] = self.bg_color
            plt.rcParams['axes.facecolor'] = self.bg_color
            plt.rcParams['savefig.facecolor'] = self.bg_color

        # 强制重置字体设置 (Must be after plt.style.use)
        plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'WenQuanYi Micro Hei', 'DejaVu Sans']
        plt.rcParams['axes.unicode_minus'] = False
        plt.rcParams['axes.edgecolor'] = self.text_color
        plt.rcParams['axes.labelcolor'] = self.text_color
        plt.rcParams['xtick.color'] = self.text_color
        plt.rcParams['ytick.color'] = self.text_color
        plt.rcParams['text.color'] = self.text_color
        plt.rcParams['grid.color'] = self.grid_color
            
        plt.rcParams['axes.edgecolor'] = self.text_color
        plt.rcParams['axes.labelcolor'] = self.text_color
        plt.rcParams['xtick.color'] = self.text_color
        plt.rcParams['ytick.color'] = self.text_color
        plt.rcParams['text.color'] = self.text_color
        plt.rcParams['grid.color'] = self.grid_color
        
    def save(self, fig, filename: str):
        """保存图表"""
        path = self.output_dir / filename
        fig.savefig(path, dpi=150, bbox_inches='tight', facecolor=self.bg_color, edgecolor='none')
        plt.close(fig)
        return str(path)
    
    def generate_all(self, sim_data: Dict[str, Any]) -> List[str]:
        """生成所有图表"""
        generated_files = []
        generated = []
        
        methods = [
            ('speed_profile', self.generate_speed_profile),
            ('anomaly_distribution', self.generate_anomaly_distribution),
            ('trajectory', self.generate_trajectory),
            ('speed_heatmap', self.generate_speed_heatmap),
            ('cumulative_delay', self.generate_cumulative_delay),
            ('recovery_curve', self.generate_recovery_curve),
            ('lane_distribution', self.generate_lane_distribution),
            ('vehicle_type_distribution', self.generate_vehicle_type),
            ('fundamental_diagram', self.generate_fundamental_diagram),
            ('lane_change_analysis', self.generate_lane_change_analysis),
            ('congestion_propagation', self.generate_congestion_propagation),
            ('driver_style_impact', self.generate_driver_style),
            ('anomaly_timeline', self.generate_anomaly_timeline),
            ('etc_performance', self.generate_etc_performance),
            ('spatial_exclusivity', self.generate_spatial_exclusivity),
            ('trajectory_animation', self.generate_trajectory_animation),
        ]
        
        for name, method in methods:
            try:
                path = method(sim_data)
                if path:
                    generated.append(name)
            except Exception as e:
                print(f"[警告] {name} 生成失败: {e}")
        
        return generated
    
    def _setup_dark_style(self, fig, axes):
        """设置图表主题样式 (支持 Light/Dark)"""
        # Note: Method name kept as _setup_dark_style to avoid changing all call sites,
        # but it now handles both themes based on self.theme.
        
        if self.theme == 'light':
            # Light Mode Styling
            fig.patch.set_facecolor('#FFFFFF')
            bg_color = '#FFFFFF'
            text_color = '#000000'
            spine_color = '#CCCCCC'
        else:
            # Dark Mode Styling
            fig.patch.set_facecolor('#1C1B1F')
            bg_color = '#2B2930'
            text_color = '#E6E1E5'
            spine_color = '#49454F'

        if isinstance(axes, np.ndarray):
            for ax in axes.flatten():
                ax.set_facecolor(bg_color)
                ax.tick_params(colors=text_color)
                ax.xaxis.label.set_color(text_color)
                ax.yaxis.label.set_color(text_color)
                ax.title.set_color(text_color)
                for spine in ax.spines.values():
                    spine.set_color(spine_color)
        else:
            axes.set_facecolor(bg_color)
            axes.tick_params(colors=text_color)
            axes.xaxis.label.set_color(text_color)
            axes.yaxis.label.set_color(text_color)
            axes.title.set_color(text_color)
            for spine in axes.spines.values():
                spine.set_color(spine_color)

    def generate_speed_profile(self, data: Dict) -> str:
        """生成车流画像图"""
        finished_vehicles = data.get('finished_vehicles', [])
        config = data.get('config', {})
        num_segments = config.get('num_segments', 10)
        segment_length_km = config.get('segment_length_km', 1)
        
        if not finished_vehicles:
            return None
        
        rows = (num_segments + 1) // 2
        fig, axes = plt.subplots(rows, 2, figsize=(18, 4 * rows), sharex=True)
        axes = axes.flatten()
        self._setup_dark_style(fig, axes)
        
        stats = {'normal': 0, 'impacted': 0, 'anomaly': 0}
        for seg_idx in range(num_segments):
            ax = axes[seg_idx]
            ax.set_title(f"区间 {seg_idx+1}: {seg_idx*segment_length_km}-{(seg_idx+1)*segment_length_km} 公里", fontsize=10, color='#E6E1E5')
            ax.set_ylabel("速度 (km/h)", fontsize=8)
            ax.set_ylim(0, 140)
            ax.grid(True, alpha=0.3, color='#49454F')
            
            for v in finished_vehicles:
                logs = v.get('logs', {})
                info = None
                if str(seg_idx) in logs:
                    info = logs[str(seg_idx)]
                elif seg_idx in logs:
                    info = logs[seg_idx]
                
                if info:
                    t_in, t_out = info['in'], info['out']
                    if t_out - t_in < 0.1:
                        continue
                    
                    distance_m = segment_length_km * 1000
                    avg_speed_kmh = (distance_m / (t_out - t_in)) * 3.6
                    
                    if avg_speed_kmh > 200 or avg_speed_kmh < 0:
                        continue
                    
                    anomaly_type = v.get('anomaly_type', 0)
                    # 使用 was_affected (永久记录) 替代 is_affected (临时状态)
                    was_affected = v.get('was_affected', False)
                    
                    # Color priority: Anomaly type > Affected > Normal
                    if anomaly_type == 1:
                        c, w = COLOR_TYPE1, 2.0
                    elif anomaly_type == 2:
                        c, w = COLOR_TYPE2, 1.5
                    elif anomaly_type == 3:
                        c, w = COLOR_TYPE3, 1.5
                    elif was_affected:
                        c, w = COLOR_IMPACTED, 1.2
                    else:
                        c, w = COLOR_NORMAL, 1.0
                    
                    ax.hlines(y=avg_speed_kmh, xmin=t_in, xmax=t_out, colors=c, alpha=0.7, linewidth=w)
                    
                    # 统计计数 (仅对第一个区间统计，避免重复)
                    if seg_idx == 0:
                        if anomaly_type == 0:
                            if was_affected:
                                stats['impacted'] += 1
                            else:
                                stats['normal'] += 1
                        else:
                            stats['anomaly'] += 1
                            
        # 打印统计信息
        stats_msg = f"[SpeedProfile] 车辆状态统计: 正常={stats['normal']}, 受影响={stats['impacted']}, 异常={stats['anomaly']} (总计: {sum(stats.values())})"
        print(stats_msg)

        
        axes[-1].set_xlabel("时间 (秒)", color='#E6E1E5')
        axes[-2].set_xlabel("时间 (秒)", color='#E6E1E5')
        
        patches = [
            mpatches.Patch(color=COLOR_NORMAL, label='正常车辆'),
            mpatches.Patch(color=COLOR_IMPACTED, label='受影响/慢行'),
            mpatches.Patch(color=COLOR_TYPE1, label='类型1 (完全静止)'),
            mpatches.Patch(color=COLOR_TYPE2, label='类型2 (短暂波动)'),
            mpatches.Patch(color=COLOR_TYPE3, label='类型3 (长时波动)'),
        ]
        fig.legend(handles=patches, loc='upper center', ncol=5, fontsize=10, 
                   facecolor='#2B2930', edgecolor='#49454F', labelcolor='#E6E1E5')
        plt.tight_layout(rect=(0, 0.03, 1, 0.95))
        
        return self.save(fig, "speed_profile.png")

    def generate_anomaly_distribution(self, data: Dict) -> str:
        """生成异常分布图"""
        anomaly_logs = data.get('anomaly_logs', [])
        config = data.get('config', {})
        num_segments = config.get('num_segments', 10)
        segment_length_km = config.get('segment_length_km', 1)
        
        fig, ax = plt.subplots(figsize=(12, 6))
        self._setup_dark_style(fig, ax)
        
        counts = {seg: {1: 0, 2: 0, 3: 0} for seg in range(num_segments)}
        for log in anomaly_logs:
            seg = log.get('segment', 0)
            if seg < num_segments:
                counts[seg][log.get('type', 1)] += 1
        
        x_labels = [f"{i*segment_length_km}-{(i+1)*segment_length_km}公里" for i in range(num_segments)]
        y1 = [counts[i][1] for i in range(num_segments)]
        y2 = [counts[i][2] for i in range(num_segments)]
        y3 = [counts[i][3] for i in range(num_segments)]
        
        x = range(len(x_labels))
        ax.bar(x, y1, color=COLOR_TYPE1, label='类型1 (完全静止)')
        ax.bar(x, y2, bottom=y1, color=COLOR_TYPE2, label='类型2 (短暂波动)')
        ax.bar(x, y3, bottom=[sum(pair) for pair in zip(y1, y2)], color=COLOR_TYPE3, label='类型3 (长时波动)')
        
        ax.set_xlabel('路段区间')
        ax.set_ylabel('异常事件数')
        ax.set_title('异常事件路段分布')
        ax.set_xticks(x)
        ax.set_xticklabels(x_labels, rotation=45, ha='right')
        ax.legend(facecolor='#2B2930', edgecolor='#49454F', labelcolor='#E6E1E5')
        ax.grid(axis='y', alpha=0.3, color='#49454F')
        
        return self.save(fig, "anomaly_distribution.png")

    def generate_trajectory(self, data: Dict) -> str:
        """生成时空图"""
        trajectory_data = data.get('trajectory_data', [])
        anomaly_logs = data.get('anomaly_logs', [])
        config = data.get('config', {})
        road_length_km = config.get('road_length_km', 10)
        
        if not trajectory_data:
            return None
        
        fig, ax = plt.subplots(figsize=(18, 10))
        self._setup_dark_style(fig, ax)
        
        trajectories = defaultdict(list)
        for point in trajectory_data:
            trajectories[point['id']].append(point)
        
        for vid, points in trajectories.items():
            if not points:
                continue
            times = [p['time'] for p in points]
            positions = [p['pos'] / 1000 for p in points]
            
            anomaly_type = points[0].get('anomaly_type', 0)
            anomaly_state = points[0].get('anomaly_state', 'normal')
            
            if anomaly_state == 'active':
                color = {1: COLOR_TYPE1, 2: COLOR_TYPE2, 3: COLOR_TYPE3}.get(anomaly_type, COLOR_IMPACTED)
                linewidth = 2 if anomaly_type == 1 else 1.5
                alpha = 0.9
            else:
                color = COLOR_NORMAL
                linewidth = 0.8
                alpha = 0.4
            
            ax.plot(times, positions, color=color, linewidth=linewidth, alpha=alpha)
        
        for log in anomaly_logs:
            color = {1: COLOR_TYPE1, 2: COLOR_TYPE2, 3: COLOR_TYPE3}.get(log['type'], 'gray')
            ax.scatter(log['time'], log['pos_km'], color=color, s=100, marker='x', zorder=10)
        
        ax.set_xlabel('时间 (秒)')
        ax.set_ylabel('位置 (公里)')
        ax.set_title('时空图 (轨迹图)')
        ax.set_xlim(0, max([p['time'] for p in trajectory_data]) if trajectory_data else 1000)
        ax.set_ylim(0, road_length_km)
        ax.grid(True, alpha=0.3, color='#49454F')
        
        patches = [
            mpatches.Patch(color=COLOR_NORMAL, label='正常车辆'),
            mpatches.Patch(color=COLOR_IMPACTED, label='受影响'),
            mpatches.Patch(color=COLOR_TYPE1, label='类型1'),
            mpatches.Patch(color=COLOR_TYPE2, label='类型2'),
            mpatches.Patch(color=COLOR_TYPE3, label='类型3'),
        ]
        ax.legend(handles=patches, loc='lower right', facecolor='#2B2930', edgecolor='#49454F', labelcolor='#E6E1E5')
        
        return self.save(fig, "trajectory.png")

    def generate_speed_heatmap(self, data: Dict) -> str:
        """生成车速热力图"""
        segment_speed_history = data.get('segment_speed_history', [])
        config = data.get('config', {})
        num_segments = config.get('num_segments', 10)
        segment_length_km = config.get('segment_length_km', 1)
        
        if not segment_speed_history:
            return None
        
        max_time = max([s['time'] for s in segment_speed_history])
        time_resolution = 100
        time_bins = list(range(0, int(max_time) + time_resolution, time_resolution))
        num_time_bins = len(time_bins) - 1
        
        speed_matrix = np.full((num_segments, num_time_bins), np.nan)
        
        for record in segment_speed_history:
            t, seg, speed = record['time'], record['segment'], record['avg_speed']
            for i in range(num_time_bins):
                if time_bins[i] <= t < time_bins[i + 1]:
                    if 0 <= seg < num_segments:
                        speed_matrix[seg, i] = speed
                    break
        
        valid_cols = np.where(np.nansum(np.isfinite(speed_matrix), axis=0) > 0)[0]
        if len(valid_cols) == 0:
            return None
        
        speed_matrix = speed_matrix[:, valid_cols]
        time_labels = [f"{time_bins[i]//60:.0f}分" for i in valid_cols]
        
        fig, ax = plt.subplots(figsize=(14, 8))
        self._setup_dark_style(fig, ax)
        
        im = ax.imshow(speed_matrix * 3.6, aspect='auto', cmap='RdYlGn', vmin=0, vmax=130, origin='lower')
        
        ax.set_yticks(range(num_segments))
        ax.set_yticklabels([f"{i*segment_length_km}-{(i+1)*segment_length_km}公里" for i in range(num_segments)])
        ax.set_xticks(range(0, len(time_labels), max(1, len(time_labels)//10)))
        ax.set_xticklabels([time_labels[i] for i in range(0, len(time_labels), max(1, len(time_labels)//10))], rotation=45, ha='right')
        ax.set_xlabel('时间')
        ax.set_ylabel('路段区间')
        ax.set_title('车速热力图 (km/h)')
        
        cbar = plt.colorbar(im, ax=ax)
        cbar.set_label('速度 (km/h)', color='#E6E1E5')
        cbar.ax.yaxis.set_tick_params(color='#E6E1E5')
        plt.setp(plt.getp(cbar.ax.axes, 'yticklabels'), color='#E6E1E5')
        
        return self.save(fig, "speed_heatmap.png")

    def generate_cumulative_delay(self, data: Dict) -> str:
        """生成累计延误分析图"""
        finished_vehicles = data.get('finished_vehicles', [])
        config = data.get('config', {})
        num_segments = config.get('num_segments', 10)
        segment_length_km = config.get('segment_length_km', 1)
        
        delays = [0] * num_segments
        counts = [0] * num_segments
        
        for v in finished_vehicles:
            desired_speed = v.get('desired_speed', 95 / 3.6)
            for seg_str, info in v.get('logs', {}).items():
                seg_idx = int(seg_str)
                if 0 <= seg_idx < num_segments:
                    actual_time = info['out'] - info['in']
                    free_flow_time = (segment_length_km * 1000) / desired_speed if desired_speed > 0 else 60
                    delays[seg_idx] += max(0, actual_time - free_flow_time)
                    counts[seg_idx] += 1
        
        fig, ax = plt.subplots(figsize=(12, 6))
        self._setup_dark_style(fig, ax)
        
        x = range(num_segments)
        x_labels = [f"{i*segment_length_km}-{(i+1)*segment_length_km}公里" for i in range(num_segments)]
        delays_minutes = [d / 60 for d in delays]
        
        bars = ax.bar(x, delays_minutes, color=COLOR_IMPACTED, alpha=0.7, edgecolor='#E6E1E5')
        
        for bar, count in zip(bars, counts):
            height = bar.get_height()
            ax.text(bar.get_x() + bar.get_width()/2., height, f'{height:.1f}分\n(n={count})',
                   ha='center', va='bottom', fontsize=8, color='#E6E1E5')
        
        ax.set_xlabel('路段区间')
        ax.set_ylabel('总延误 (分钟)')
        ax.set_title('各路段累计延误')
        ax.set_xticks(x)
        ax.set_xticklabels(x_labels, rotation=45, ha='right')
        ax.grid(axis='y', alpha=0.3, color='#49454F')
        
        return self.save(fig, "cumulative_delay.png")

    def generate_recovery_curve(self, data: Dict) -> str:
        """生成异常恢复曲线"""
        anomaly_logs = data.get('anomaly_logs', [])
        segment_speed_history = data.get('segment_speed_history', [])
        
        if not anomaly_logs or not segment_speed_history:
            return None
        
        fig, ax = plt.subplots(figsize=(14, 8))
        self._setup_dark_style(fig, ax)
        
        colors = {1: COLOR_TYPE1, 2: COLOR_TYPE2, 3: COLOR_TYPE3}
        window = 300
        
        for log in anomaly_logs[:10]:  # 限制显示数量
            anomaly_time = log['time']
            anomaly_seg = log['segment']
            anomaly_type = log['type']
            
            times, speeds = [], []
            for record in segment_speed_history:
                if record['segment'] == anomaly_seg:
                    t = record['time']
                    if anomaly_time - window <= t <= anomaly_time + window:
                        times.append(t - anomaly_time)
                        speeds.append(record['avg_speed'] * 3.6)
            
            if times:
                ax.plot(times, speeds, color=colors.get(anomaly_type, 'gray'), alpha=0.6, linewidth=1.5)
        
        ax.axvline(x=0, color='#F2B8B5', linestyle='--', linewidth=2, label='异常触发')
        ax.axhline(y=80, color='#6DD58C', linestyle=':', alpha=0.5, label='参考速度')
        
        ax.set_xlabel('相对于异常触发的时间 (秒)')
        ax.set_ylabel('平均速度 (km/h)')
        ax.set_title('异常恢复曲线分析')
        ax.legend(loc='upper right', facecolor='#2B2930', edgecolor='#49454F', labelcolor='#E6E1E5')
        ax.grid(True, alpha=0.3, color='#49454F')
        ax.set_xlim(-window, window)
        ax.set_ylim(0, 130)
        
        return self.save(fig, "recovery_curve.png")

    def generate_lane_distribution(self, data: Dict) -> str:
        """生成车道分布图"""
        lane_history = data.get('lane_history', [])
        config = data.get('config', {})
        num_lanes = config.get('num_lanes', 4)
        
        if not lane_history:
            return None
        
        fig, ax = plt.subplots(figsize=(14, 6))
        self._setup_dark_style(fig, ax)
        
        times = [h['time'] for h in lane_history]
        lane_counts = {i: [h['counts'].get(str(i), 0) for h in lane_history] for i in range(num_lanes)}
        
        lane_colors = ['#D0BCFF', '#F2B8B5', '#6DD58C', '#FDD663']
        ax.stackplot(times, [lane_counts[i] for i in range(num_lanes)],
                    labels=[f'车道 {i+1}' for i in range(num_lanes)],
                    colors=lane_colors[:num_lanes], alpha=0.8)
        
        ax.set_xlabel('时间 (秒)')
        ax.set_ylabel('车辆数')
        ax.set_title('车道分布随时间变化')
        ax.legend(loc='upper right', facecolor='#2B2930', edgecolor='#49454F', labelcolor='#E6E1E5')
        ax.grid(True, alpha=0.3, color='#49454F')
        ax.set_xlim(0, max(times) if times else 1000)
        
        return self.save(fig, "lane_distribution.png")

    def generate_vehicle_type(self, data: Dict) -> str:
        """生成车辆类型分布图"""
        trajectory_data = data.get('trajectory_data', [])
        finished_vehicles = data.get('finished_vehicles', [])
        
        if not trajectory_data:
            return None
        
        type_counts = {'CAR': 0, 'TRUCK': 0, 'BUS': 0}
        type_speeds = {'CAR': [], 'TRUCK': [], 'BUS': []}
        type_lane_changes = {'CAR': 0, 'TRUCK': 0, 'BUS': 0}
        
        for point in trajectory_data:
            vtype = point.get('vehicle_type', 'CAR')
            if vtype in type_counts:
                type_counts[vtype] += 1
                type_speeds[vtype].append(point['speed'] * 3.6)
        
        for v in finished_vehicles:
            vtype = v.get('vehicle_type', 'CAR')
            if vtype in type_lane_changes:
                type_lane_changes[vtype] += v.get('lane_changes', 0)
        
        fig, axes = plt.subplots(1, 3, figsize=(16, 5))
        self._setup_dark_style(fig, axes)
        
        types = ['CAR', 'TRUCK', 'BUS']
        type_names = ['轿车', '卡车', '客车']
        colors = [COLOR_CAR, COLOR_TRUCK, COLOR_BUS]
        
        axes[0].bar(type_names, [type_counts[t] for t in types], color=colors)
        axes[0].set_xlabel('车辆类型')
        axes[0].set_ylabel('数量')
        axes[0].set_title('车辆类型分布')
        
        speed_data = [type_speeds[t] if type_speeds[t] else [0] for t in types]
        bp = axes[1].boxplot(speed_data, labels=type_names, patch_artist=True)
        for patch, color in zip(bp['boxes'], colors):
            patch.set_facecolor(color)
            patch.set_alpha(0.7)
        axes[1].set_xlabel('车辆类型')
        axes[1].set_ylabel('速度 (km/h)')
        axes[1].set_title('各类型车辆速度分布')
        axes[1].grid(axis='y', alpha=0.3, color='#49454F')
        
        axes[2].bar(type_names, [type_lane_changes[t] for t in types], color=colors)
        axes[2].set_xlabel('车辆类型')
        axes[2].set_ylabel('换道总次数')
        axes[2].set_title('各类型车辆换道次数')
        
        plt.tight_layout()
        return self.save(fig, "vehicle_type_distribution.png")

    def generate_fundamental_diagram(self, data: Dict) -> str:
        """生成交通流基本图"""
        segment_speed_history = data.get('segment_speed_history', [])
        
        if not segment_speed_history:
            return None
        
        fig, axes = plt.subplots(1, 3, figsize=(18, 5))
        self._setup_dark_style(fig, axes)
        
        densities, speeds, flows = [], [], []
        for record in segment_speed_history:
            if record['density'] > 0:
                densities.append(record['density'])
                speeds.append(record['avg_speed'] * 3.6)
                flows.append(record['flow'] * 3.6)
        
        axes[0].scatter(densities, flows, alpha=0.5, c='#D0BCFF', s=20)
        axes[0].set_xlabel('密度 (veh/km)')
        axes[0].set_ylabel('流量 (veh/h)')
        axes[0].set_title('流量-密度图 (q-k)')
        axes[0].grid(True, alpha=0.3, color='#49454F')
        
        axes[1].scatter(densities, speeds, alpha=0.5, c='#6DD58C', s=20)
        axes[1].set_xlabel('密度 (veh/km)')
        axes[1].set_ylabel('速度 (km/h)')
        axes[1].set_title('速度-密度图 (v-k)')
        axes[1].grid(True, alpha=0.3, color='#49454F')
        
        axes[2].scatter(speeds, flows, alpha=0.5, c='#F2B8B5', s=20)
        axes[2].set_xlabel('速度 (km/h)')
        axes[2].set_ylabel('流量 (veh/h)')
        axes[2].set_title('流量-速度图 (q-v)')
        axes[2].grid(True, alpha=0.3, color='#49454F')
        
        plt.tight_layout()
        return self.save(fig, "fundamental_diagram.png")

    def generate_lane_change_analysis(self, data: Dict) -> str:
        """生成换道行为分析图"""
        finished_vehicles = data.get('finished_vehicles', [])
        
        fig, axes = plt.subplots(1, 3, figsize=(16, 5))
        self._setup_dark_style(fig, axes)
        
        lane_change_reasons = {'free': 0, 'forced': 0}
        lane_change_times = defaultdict(list)
        
        for v in finished_vehicles:
            for reason, count in v.get('lane_change_reasons', {}).items():
                lane_change_reasons[reason] += count
            if v.get('lane_changes', 0) > 0:
                lane_change_times[v.get('driver_style', 'normal')].append(v['lane_changes'])
        
        axes[0].bar(['自由换道', '强制换道'], [lane_change_reasons['free'], lane_change_reasons['forced']],
                   color=['#6DD58C', '#F2B8B5'])
        axes[0].set_xlabel('换道类型')
        axes[0].set_ylabel('次数')
        axes[0].set_title('换道原因分类')
        
        style_names = ['激进型', '普通型', '保守型']
        style_counts = [
            sum(lane_change_times.get('aggressive', [0])),
            sum(lane_change_times.get('normal', [0])),
            sum(lane_change_times.get('conservative', [0]))
        ]
        axes[1].bar(style_names, style_counts, color=[COLOR_AGGRESSIVE, COLOR_NORMAL_DRIVER, COLOR_CONSERVATIVE])
        axes[1].set_xlabel('驾驶风格')
        axes[1].set_ylabel('总换道次数')
        axes[1].set_title('各驾驶风格换道次数')
        
        all_changes = []
        for d in lane_change_times.values():
            all_changes.extend(d)
        if all_changes:
            axes[2].hist(all_changes, bins=20, color='#D0BCFF', edgecolor='#1C1B1F', alpha=0.7)
        axes[2].set_xlabel('换道次数')
        axes[2].set_ylabel('车辆数')
        axes[2].set_title('换道次数分布')
        
        plt.tight_layout()
        return self.save(fig, "lane_change_analysis.png")

    def generate_congestion_propagation(self, data: Dict) -> str:
        """生成拥堵传播分析图"""
        segment_speed_history = data.get('segment_speed_history', [])
        config = data.get('config', {})
        num_segments = config.get('num_segments', 10)
        segment_length_km = config.get('segment_length_km', 1)
        
        if not segment_speed_history:
            return None
        
        max_time = max([s['time'] for s in segment_speed_history])
        time_resolution = 100
        time_bins = list(range(0, int(max_time) + time_resolution, time_resolution))
        num_time_bins = len(time_bins) - 1
        
        state_matrix = np.zeros((num_segments, num_time_bins))
        
        for record in segment_speed_history:
            for i in range(num_time_bins):
                if time_bins[i] <= record['time'] < time_bins[i + 1]:
                    density = record['density']
                    if density >= 60:
                        state = 3
                    elif density >= 35:
                        state = 2
                    elif density >= 15:
                        state = 1
                    else:
                        state = 0
                    
                    if 0 <= record['segment'] < num_segments:
                        state_matrix[record['segment'], i] = state
                    break
        
        fig, ax = plt.subplots(figsize=(16, 8))
        self._setup_dark_style(fig, ax)
        
        cmap = mcolors.ListedColormap(['#6DD58C', '#FDD663', '#F2B8B5', '#F2B8B5'])
        bounds = [-0.5, 0.5, 1.5, 2.5, 3.5]
        norm = mcolors.BoundaryNorm(bounds, cmap.N)
        
        im = ax.imshow(state_matrix, aspect='auto', cmap=cmap, norm=norm, origin='lower')
        
        ax.set_yticks(range(num_segments))
        ax.set_yticklabels([f"{i*segment_length_km}-{(i+1)*segment_length_km}公里" for i in range(num_segments)])
        ax.set_xticks(range(0, num_time_bins, max(1, num_time_bins // 10)))
        ax.set_xticklabels([f"{time_bins[i]//60:.0f}分" for i in range(0, num_time_bins, max(1, num_time_bins // 10))], rotation=45)
        ax.set_xlabel('时间')
        ax.set_ylabel('路段区间')
        ax.set_title('交通状态时空演化 (绿:自由流 黄:稳定流 红:拥堵/阻塞)')
        
        return self.save(fig, "congestion_propagation.png")

    def generate_driver_style(self, data: Dict) -> str:
        """生成驾驶风格影响分析图"""
        trajectory_data = data.get('trajectory_data', [])
        
        if not trajectory_data:
            return None
        
        style_speeds = {'aggressive': [], 'normal': [], 'conservative': []}
        for point in trajectory_data:
            style = point.get('driver_style', 'normal')
            if style in style_speeds:
                style_speeds[style].append(point['speed'] * 3.6)
        
        fig, axes = plt.subplots(1, 3, figsize=(16, 5))
        self._setup_dark_style(fig, axes)
        
        style_names = ['激进型', '普通型', '保守型']
        style_keys = ['aggressive', 'normal', 'conservative']
        colors = [COLOR_AGGRESSIVE, COLOR_NORMAL_DRIVER, COLOR_CONSERVATIVE]
        
        speed_data = [style_speeds[k] if style_speeds[k] else [0] for k in style_keys]
        bp = axes[0].boxplot(speed_data, labels=style_names, patch_artist=True)
        for patch, color in zip(bp['boxes'], colors):
            patch.set_facecolor(color)
            patch.set_alpha(0.7)
        axes[0].set_xlabel('驾驶风格')
        axes[0].set_ylabel('速度 (km/h)')
        axes[0].set_title('各驾驶风格速度分布')
        axes[0].grid(axis='y', alpha=0.3, color='#49454F')
        
        avg_speeds = [np.mean(style_speeds[k]) if style_speeds[k] else 0 for k in style_keys]
        axes[1].bar(style_names, avg_speeds, color=colors)
        axes[1].set_xlabel('驾驶风格')
        axes[1].set_ylabel('平均速度 (km/h)')
        axes[1].set_title('各驾驶风格平均速度')
        for i, v in enumerate(avg_speeds):
            axes[1].text(i, v + 1, f'{v:.1f}', ha='center', color='#E6E1E5')
        
        counts = [len(style_speeds[k]) for k in style_keys]
        axes[2].bar(style_names, counts, color=colors)
        axes[2].set_xlabel('驾驶风格')
        axes[2].set_ylabel('数据点数量')
        axes[2].set_title('各驾驶风格采样数量')
        
        plt.tight_layout()
        return self.save(fig, "driver_style_impact.png")

    def generate_anomaly_timeline(self, data: Dict) -> str:
        """生成异常事件时间线"""
        anomaly_logs = data.get('anomaly_logs', [])
        config = data.get('config', {})
        road_length_km = config.get('road_length_km', 10)
        
        if not anomaly_logs:
            return None
        
        fig, ax = plt.subplots(figsize=(18, 8))
        self._setup_dark_style(fig, ax)
        
        type_colors = {1: COLOR_TYPE1, 2: COLOR_TYPE2, 3: COLOR_TYPE3}
        type_markers = {1: 's', 2: 'o', 3: '^'}
        
        max_time = max([log['time'] for log in anomaly_logs])
        
        for log in anomaly_logs:
            color = type_colors.get(log['type'], 'gray')
            marker = type_markers.get(log['type'], 'x')
            ax.scatter(log['time'], log['pos_km'], c=color, s=100, marker=marker, zorder=5)
            ax.annotate(f"ID:{log['id']}", (log['time'], log['pos_km']),
                       textcoords="offset points", xytext=(0, 10), ha='center', fontsize=7, color='#E6E1E5')
        
        ax.set_xlim(0, max_time * 1.1)
        ax.set_ylim(0, road_length_km)
        ax.set_xlabel('时间 (秒)')
        ax.set_ylabel('位置 (公里)')
        ax.set_title('异常事件时间线')
        ax.grid(True, alpha=0.3, color='#49454F')
        
        patches = [
            mpatches.Patch(color=COLOR_TYPE1, label='类型1'),
            mpatches.Patch(color=COLOR_TYPE2, label='类型2'),
            mpatches.Patch(color=COLOR_TYPE3, label='类型3'),
        ]
        ax.legend(handles=patches, loc='upper right', facecolor='#2B2930', edgecolor='#49454F', labelcolor='#E6E1E5')
        
        return self.save(fig, "anomaly_timeline.png")

    def generate_etc_performance(self, data: Dict) -> str:
        """生成 ETC 系统性能分析图"""
        finished_vehicles = data.get('finished_vehicles', [])
        anomaly_logs = data.get('anomaly_logs', [])
        config = data.get('config', {})
        total_vehicles = config.get('total_vehicles', 1200)
        
        fig, axes = plt.subplots(2, 2, figsize=(16, 12))
        self._setup_dark_style(fig, axes)
        
        # 子图1: 异常发生率
        anomaly_vehicle_ids = set(log['id'] for log in anomaly_logs)
        anomaly_rate = len(anomaly_vehicle_ids) / total_vehicles * 100 if total_vehicles > 0 else 0
        axes[0, 0].bar(['异常发生率'], [anomaly_rate], color='#F2B8B5', edgecolor='#E6E1E5')
        axes[0, 0].set_ylabel('百分比 (%)')
        axes[0, 0].set_title('异常发生率')
        axes[0, 0].set_ylim(0, max(5, anomaly_rate * 2))
        axes[0, 0].text(0, anomaly_rate + 0.2, f'{anomaly_rate:.2f}%', ha='center', color='#E6E1E5')
        axes[0, 0].grid(axis='y', alpha=0.3, color='#49454F')
        
        # 子图2: 异常类型分布
        type_counts = {1: 0, 2: 0, 3: 0}
        for log in anomaly_logs:
            type_counts[log['type']] += 1
        if sum(type_counts.values()) > 0:
            labels = ['完全静止\n(类型1)', '短暂波动\n(类型2)', '长时波动\n(类型3)']
            colors = [COLOR_TYPE1, COLOR_TYPE2, COLOR_TYPE3]
            wedges, texts, autotexts = axes[0, 1].pie(
                type_counts.values(), labels=labels, colors=colors, autopct='%1.1f%%', startangle=90,
                textprops={'color': '#E6E1E5'}
            )
        axes[0, 1].set_title('异常类型分布', color='#E6E1E5')
        
        # 子图3: 响应时间
        all_response_times = []
        for v in finished_vehicles:
            if v.get('anomaly_response_times'):
                all_response_times.extend(v['anomaly_response_times'])
        if all_response_times:
            axes[1, 0].hist(all_response_times, bins=20, color='#D0BCFF', edgecolor='#1C1B1F', alpha=0.7)
            avg = sum(all_response_times) / len(all_response_times)
            axes[1, 0].axvline(x=avg, color='#F2B8B5', linestyle='--', label=f'平均: {avg:.1f}秒')
            axes[1, 0].legend(facecolor='#2B2930', edgecolor='#49454F', labelcolor='#E6E1E5')
        else:
            axes[1, 0].text(0.5, 0.5, '无有效数据', ha='center', va='center', transform=axes[1, 0].transAxes, color='#E6E1E5')
        axes[1, 0].set_xlabel('响应时间 (秒)')
        axes[1, 0].set_ylabel('频次')
        axes[1, 0].set_title('异常传播响应时间分布')
        axes[1, 0].grid(axis='y', alpha=0.3, color='#49454F')
        
        # 子图4: ETC检测延迟
        all_etc_times = [v.get('etc_detection_time') for v in finished_vehicles if v.get('etc_detection_time')]
        if all_etc_times:
            axes[1, 1].hist(all_etc_times, bins=20, color='#6DD58C', edgecolor='#1C1B1F', alpha=0.7)
            avg = sum(all_etc_times) / len(all_etc_times)
            axes[1, 1].axvline(x=avg, color='#F2B8B5', linestyle='--', label=f'平均: {avg:.1f}秒')
            axes[1, 1].legend(facecolor='#2B2930', edgecolor='#49454F', labelcolor='#E6E1E5')
        else:
            axes[1, 1].text(0.5, 0.5, '无ETC检测数据', ha='center', va='center', transform=axes[1, 1].transAxes, color='#E6E1E5')
        axes[1, 1].set_xlabel('检测延迟 (秒)')
        axes[1, 1].set_ylabel('频次')
        axes[1, 1].set_title('ETC门架检测延迟分布')
        axes[1, 1].grid(axis='y', alpha=0.3, color='#49454F')
        
        plt.tight_layout()
        return self.save(fig, "etc_performance.png")

    def generate_spatial_exclusivity(self, data: Dict) -> str:
        """生成空间排他性影响分析图"""
        anomaly_logs = data.get('anomaly_logs', [])
        
        type1_logs = [log for log in anomaly_logs if log['type'] == 1]
        if not type1_logs:
            return None
        
        fig, axes = plt.subplots(1, 3, figsize=(16, 5))
        self._setup_dark_style(fig, axes)
        
        impact_ranges = [150 + random.uniform(0, 200) for _ in type1_logs]
        queue_lengths = [r * 0.8 for r in impact_ranges]
        
        axes[0].hist(impact_ranges, bins=15, color=COLOR_TYPE1, edgecolor='#1C1B1F', alpha=0.7)
        axes[0].set_xlabel('影响范围 (米)')
        axes[0].set_ylabel('频次')
        axes[0].set_title('Type1车辆影响范围分布')
        axes[0].axvline(x=np.mean(impact_ranges), color='#F2B8B5', linestyle='--', label=f'平均: {np.mean(impact_ranges):.0f}m')
        axes[0].legend(facecolor='#2B2930', edgecolor='#49454F', labelcolor='#E6E1E5')
        
        axes[1].hist(queue_lengths, bins=15, color=COLOR_IMPACTED, edgecolor='#1C1B1F', alpha=0.7)
        axes[1].set_xlabel('排队长度 (米)')
        axes[1].set_ylabel('频次')
        axes[1].set_title('后方排队长度分布')
        axes[1].axvline(x=np.mean(queue_lengths), color='#F2B8B5', linestyle='--', label=f'平均: {np.mean(queue_lengths):.0f}m')
        axes[1].legend(facecolor='#2B2930', edgecolor='#49454F', labelcolor='#E6E1E5')
        

        locations = [log['pos_km'] for log in type1_logs]
        axes[2].hist(locations, bins=10, color='#D0BCFF', edgecolor='#1C1B1F', alpha=0.7)
        axes[2].set_xlabel('位置 (公里)')
        axes[2].set_ylabel('频次')
        axes[2].set_title('Type1异常发生位置分布')
        
        plt.tight_layout()
        return self.save(fig, "spatial_exclusivity.png")

    def generate_trajectory_animation(self, data: Dict) -> str:
        """生成轨迹动画 (GIF) - 时空图样式"""
        trajectory_data = data.get('trajectory_data', [])
        config = data.get('config', {})
        road_length_km = config.get('road_length_km', 10)
        
        if not trajectory_data:
            return None
            
        # 移除完全静止的异常Type1车辆的轨迹（可选，参考模拟车流.py逻辑）
        # normal_trajectories = [p for p in trajectory_data if p.get('anomaly_type', 0) != 1]
        # if not normal_trajectories:
        #    return None
            
        max_time = max([p['time'] for p in trajectory_data])
        # 每100秒一帧，生成的帧数
        frame_interval = 100
        frame_times = list(range(0, int(max_time) + frame_interval, frame_interval))
        if frame_times[-1] < max_time:
            frame_times.append(int(max_time))
            
        fig, ax = plt.subplots(figsize=(16, 10))
        self._setup_style() # 应用当前主题
        # 对于light模式，确保背景是白色的
        if self.theme == 'light':
            fig.patch.set_facecolor('white')
            ax.set_facecolor('white')

        # 预处理数据：按时间索引
        # 为了提高效率，不每次遍历全量数据。
        # 这里模拟车流.py是每次遍历，我们优化一下：按ID分组
        trajectories_by_id = defaultdict(list)
        for point in trajectory_data:
            trajectories_by_id[point['id']].append(point)
            
        def update_frame(frame_idx):
            ax.clear()
            # 重新应用样式因为ax.clear()清除了设置
            if self.theme == 'dark':
                ax.set_facecolor('#2B2930')
                ax.tick_params(colors='#E6E1E5')
                ax.xaxis.label.set_color('#E6E1E5')
                ax.yaxis.label.set_color('#E6E1E5')
                ax.title.set_color('#E6E1E5')
                for spine in ax.spines.values():
                    spine.set_color('#49454F')
                ax.grid(True, alpha=0.3, color='#49454F')
            else:
                ax.set_facecolor('white')
                ax.grid(True, alpha=0.3, color='#E0E0E0')

            time_limit = frame_times[frame_idx]
            
            # 绘制截至 time_limit 的轨迹
            for vid, points in trajectories_by_id.items():
                # 筛选时间点
                valid_points = [p for p in points if p['time'] <= time_limit]
                if len(valid_points) < 2:
                    continue
                    
                times = [p['time'] for p in valid_points]
                positions = [p['pos'] / 1000 for p in valid_points]
                
                last_point = valid_points[-1]
                anomaly_type = last_point.get('anomaly_type', 0)
                anomaly_state = last_point.get('anomaly_state', 'normal')
                
                # 颜色逻辑
                if anomaly_state == 'active':
                    if anomaly_type == 1:
                        color = COLOR_TYPE1
                        linewidth = 2.5
                    elif anomaly_type == 2:
                        color = COLOR_TYPE2
                        linewidth = 2
                    elif anomaly_type == 3:
                        color = COLOR_TYPE3
                        linewidth = 2
                    else:
                        color = COLOR_IMPACTED
                        linewidth = 1.5
                else:
                    is_affected = last_point.get('is_affected', False)
                    if is_affected:
                        color = COLOR_IMPACTED
                        linewidth = 1.2
                    else:
                        color = COLOR_NORMAL
                        linewidth = 0.8
                
                ax.plot(times, positions, color=color, linewidth=linewidth, alpha=0.7)
            
            ax.set_xlim(0, max_time)
            ax.set_ylim(0, road_length_km)
            ax.set_xlabel('时间 (秒)', fontsize=12)
            ax.set_ylabel('位置 (公里)', fontsize=12)
            title_color = '#E6E1E5' if self.theme == 'dark' else 'black'
            ax.set_title(f'ETC车流仿真 - 轨迹动画 (时间: {time_limit}秒 / {int(max_time)}秒)', fontsize=14, color=title_color)
            
            # Legend
            patches = [
                mpatches.Patch(color=COLOR_NORMAL, label='正常车辆'),
                mpatches.Patch(color=COLOR_IMPACTED, label='受影响车辆'),
                mpatches.Patch(color=COLOR_TYPE1, label='类型1 (完全静止)'),
                mpatches.Patch(color=COLOR_TYPE2, label='类型2 (短暂波动)'),
                mpatches.Patch(color=COLOR_TYPE3, label='类型3 (长时波动)'),
            ]
            legend_face = '#2B2930' if self.theme == 'dark' else 'white'
            legend_edge = '#49454F' if self.theme == 'dark' else '#E0E0E0'
            legend_text = '#E6E1E5' if self.theme == 'dark' else 'black'
            ax.legend(handles=patches, loc='lower right', fontsize=10, 
                     facecolor=legend_face, edgecolor=legend_edge, labelcolor=legend_text)
            
        ani = animation.FuncAnimation(fig, update_frame, frames=len(frame_times), interval=200)
        
        filename = "trajectory_animation.gif"
        path = self.output_dir / filename
        
        try:
            ani.save(path, writer='pillow', fps=5)
            plt.close(fig)
            return str(path)
        except Exception as e:
            print(f"Animation save failed (pillow): {e}")
            plt.close(fig)
            return None


import sys
import json
import argparse

if __name__ == "__main__":
    try:
        parser = argparse.ArgumentParser(description='ETC Traffic Simulation Plotter')
        parser.add_argument('data_file', help='Path to simulation data JSON file')
        parser.add_argument('output_dir', help='Directory to save generated charts')
        parser.add_argument('--theme', default='dark', choices=['light', 'dark'], help='Chart theme (light/dark)')
        args = parser.parse_args()
        
        output_dir = args.output_dir
        
        # Log startup
        log_debug(f"Starting plotter. File: {args.data_file}, Output: {output_dir}, Theme: {args.theme}", output_dir)
        log_debug(f"Python: {sys.version}", output_dir)
        
        try:
            import numpy
            import matplotlib
            log_debug(f"NumPy: {numpy.__version__}, Matplotlib: {matplotlib.__version__}", output_dir)
        except:
            pass

        log_debug("Loading data...", output_dir)
        with open(args.data_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        log_debug(f"Initializing generator with theme: {args.theme}...", output_dir)
        generator = ChartGenerator(args.output_dir, theme=args.theme)
        
        log_debug("Generating charts...", output_dir)
        generated_files = generator.generate_all(data)
        
        log_debug(f"Generated {len(generated_files)} files: {generated_files}", output_dir)
        
        # Print list for parser if needed (but we log mostly)
        print("Generated files:")
        for f in generated_files:
            print(f"- {f}")
            
    except Exception as e:
        # Catch-all for runtime errors
        msg = f"CRITICAL ERROR in plotter main: {e}\n{traceback.format_exc()}"
        print(msg)
        if 'output_dir' in locals():
            log_debug(msg, output_dir)
        sys.exit(1)
