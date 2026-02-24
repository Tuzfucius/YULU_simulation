import pandas as pd
import numpy as np
import math
from typing import List, Dict, Optional, Tuple, Any
from collections import defaultdict

# 导入现有系统数据结构
from .etc_anomaly_detector import ETCTransaction
from .alert_evaluator import GroundTruthEvent

class TimeSeriesFeatureExtractor:
    """
    时序特征切片引擎
    将原始 ETC 流水按给定步长积分并提取衍生特征，最后配合 ground_truths 生成 seq2seq 数据集。
    """
    def __init__(self, 
                 step_seconds: float = 60.0, 
                 window_size_steps: int = 5):
        """
        :param step_seconds: 切分步长 (如 60s)
        :param window_size_steps: 时间窗大小 (如 5，即包含过去的 5 步)
        """
        self.step_seconds = step_seconds
        self.window_size_steps = window_size_steps

    def _pair_transactions(self, transactions: List[ETCTransaction]) -> pd.DataFrame:
        """
        配对上下游门架流水，计算行程时间 (Travel Time) 和平均速度等。
        假定门架按照 position_km 排序。
        """
        if not transactions:
            return pd.DataFrame()
        
        # 将原始对象转成字典便于 DataFrame 构造
        df_raw = pd.DataFrame([{
            'vehicle_id': t.vehicle_id,
            'gate_id': t.gate_id,
            'gate_position_km': t.gate_position_km,
            'timestamp': t.timestamp,
            'speed_kmh': t.speed * 3.6
        } for t in transactions])
        
        # 按车辆与门架位置排序：确保按照行驶方向排列 (假设 position_km 递增的方向)
        df_raw = df_raw.sort_values(['vehicle_id', 'timestamp'])
        
        # 取上一行，如果是同一辆车，表示其来源于上游门架
        df_raw['prev_gate'] = df_raw.groupby('vehicle_id')['gate_id'].shift(1)
        df_raw['prev_pos'] = df_raw.groupby('vehicle_id')['gate_position_km'].shift(1)
        df_raw['prev_time'] = df_raw.groupby('vehicle_id')['timestamp'].shift(1)
        
        # 仅保留具有上一门架配对的数据（即完成了区间通行的记录）
        df_paired = df_raw.dropna(subset=['prev_gate']).copy()
        df_paired['segment_id'] = df_paired['prev_gate'] + '-' + df_paired['gate_id']
        df_paired['distance_km'] = abs(df_paired['gate_position_km'] - df_paired['prev_pos'])
        df_paired['travel_time_s'] = df_paired['timestamp'] - df_paired['prev_time']
        
        return df_paired, df_raw

    def extract_segment_features(self, transactions: List[ETCTransaction]) -> pd.DataFrame:
        """
        提取以门架区间(segment)为空间维度、步长为时间维度的基础统计特征。
        """
        df_paired, df_raw = self._pair_transactions(transactions)
        if df_paired.empty:
            return pd.DataFrame()

        # 计算最大结束时间与最小开始时间
        min_time = df_raw['timestamp'].min()
        max_time = df_raw['timestamp'].max()
        
        # 为了包含所有时刻，将其按步长切分离散化
        time_bins = np.arange(math.floor(min_time / self.step_seconds) * self.step_seconds, 
                              math.ceil(max_time / self.step_seconds) * self.step_seconds + self.step_seconds, 
                              self.step_seconds)
        
        segments = df_paired['segment_id'].unique()
        all_features = []

        for segment in segments:
            # 区间进出匹配数据
            seg_paired = df_paired[df_paired['segment_id'] == segment]
            source_gate = seg_paired['prev_gate'].iloc[0]
            target_gate = seg_paired['gate_id'].iloc[0]
            
            # 以出区间时间戳(到达 target_gate 的时间) 归置到 Time Bin
            seg_paired['time_bin'] = pd.cut(seg_paired['timestamp'], bins=time_bins, labels=time_bins[:-1], right=False)
            
            # 统计指标 1: 出区间的行程时间与到达速度
            stats = seg_paired.groupby('time_bin', observed=False).agg(
                delta_t_mean=('travel_time_s', 'mean'),
                delta_t_std=('travel_time_s', 'std'),
                avg_speed_out=('speed_kmh', 'mean'),
                flow_out=('vehicle_id', 'count')
            ).reset_index()
            
            # 统计指标 2: 进入区间的数据量 (计算 flow_in)
            seg_in = df_raw[df_raw['gate_id'] == source_gate].copy()
            seg_in['time_bin'] = pd.cut(seg_in['timestamp'], bins=time_bins, labels=time_bins[:-1], right=False)
            stats_in = seg_in.groupby('time_bin', observed=False).agg(
                flow_in=('vehicle_id', 'count')
            ).reset_index()
            
            # 合并
            stats = pd.merge(stats, stats_in, on='time_bin', how='left')
            stats['segment_id'] = segment
            
            # 处理 NaN 与异常计算流率比例
            stats = stats.fillna({'flow_in': 0, 'flow_out': 0, 'avg_speed_out': -1})
            stats['flow_ratio'] = stats['flow_out'] / stats['flow_in'].replace(0, 1) # 避免除以0
            
            # Forward Fill 时序补全那些没有车辆通过的时刻 (继承上一时刻状态)
            stats['delta_t_mean'] = stats['delta_t_mean'].ffill().fillna(-1)
            stats['delta_t_std'] = stats['delta_t_std'].fillna(0)
            
            all_features.append(stats)
            
        if not all_features:
            return pd.DataFrame()
            
        df_features = pd.concat(all_features, ignore_index=True)
        # 确保排好序，方便后续推窗
        df_features = df_features.sort_values(by=['segment_id', 'time_bin'])
        return df_features

    def build_dataset(self, 
                      transactions: List[ETCTransaction], 
                      ground_truths: List[GroundTruthEvent],
                      run_id: str = "default_run") -> Dict[str, Any]:
        """
        构建包含 X_sequence 与 Y_sequence 的序列预测数据集。
        """
        df_features = self.extract_segment_features(transactions)
        if df_features.empty:
            return {"metadata": {}, "samples": []}
        
        # 特征列定义
        feature_cols = ['delta_t_mean', 'delta_t_std', 'avg_speed_out', 'flow_in', 'flow_out', 'flow_ratio']
        
        # 对 GroundTruth 建立索引便于快速查询
        gt_active_intervals = []
        for gt in ground_truths:
            end_t = gt.resolved_time if gt.resolved_time else (gt.trigger_time + 600) # 若无解除时间，假设影响10分钟
            gt_active_intervals.append({
                'start': gt.trigger_time,
                'end': end_t,
                'pos_km': gt.position_km,
                'type': gt.anomaly_type,
                'vehicle_id': gt.vehicle_id
            })
            
        # 根据特征提取时空位置坐标
        seg_positions = {}
        for t in transactions:
            seg_positions[t.gate_id] = t.gate_position_km
            
        samples = []
        
        # 按区间切分滑动窗口
        for segment, group in df_features.groupby('segment_id'):
            source_gate, target_gate = segment.split('-')
            src_pos = seg_positions.get(source_gate, 0)
            tgt_pos = seg_positions.get(target_gate, 0)
            min_pos = min(src_pos, tgt_pos)
            max_pos = max(src_pos, tgt_pos)
            
            group = group.sort_values('time_bin').reset_index(drop=True)
            
            # 滑动窗口
            for i in range(self.window_size_steps, len(group) + 1):
                window_data = group.iloc[i - self.window_size_steps:i]
                current_time = window_data.iloc[-1]['time_bin']
                
                # 构造 X_sequence
                x_seq = window_data[feature_cols].values.tolist()
                
                # 构造 Y_sequence (对窗口内的每一个 time_bin 进行标记)
                y_seq = []
                primary_anomaly = 0
                suspect_vehicles = set()
                
                for step_idx in range(self.window_size_steps):
                    t_bin = window_data.iloc[step_idx]['time_bin']
                    # 检查此 time_bin 区间 [t_bin, t_bin + step] 内，是否包含异常
                    # TODO: 更加细致的网络态势衍生 (如区分源头还是缓行波及)
                    # 当前简化为主：如果异常位置在区间及其下游一定范围内，且时间匹配，则为波及
                    state = 0
                    for gt in gt_active_intervals:
                        # 空间判断：事件如果在本区间发生，或者在前方不远处发生
                        # 假设异常在 max_pos 和 max_pos + 5km 内发生，且时间有叠合
                        space_match = (min_pos - 1.0 <= gt['pos_km'] <= max_pos + 10.0)
                        time_match = (gt['start'] <= t_bin + self.step_seconds) and (gt['end'] >= t_bin)
                        
                        if space_match and time_match:
                            if min_pos <= gt['pos_km'] <= max_pos:
                                state = 1  # 发生源头区
                            else:
                                state = 2  # 受波及区
                            primary_anomaly = gt['type']
                            suspect_vehicles.add(gt['vehicle_id'])
                            break # 取最严重的状态
                    y_seq.append(state)
                    
                samples.append({
                    "sample_id": f"{segment}_t{int(current_time)}",
                    "target_segment": segment,
                    "timestamp": float(current_time),
                    "X_sequence": x_seq,
                    "Y_sequence": y_seq,
                    "Y_details": {
                        "primary_anomaly_type": primary_anomaly,
                        "suspected_source_vehicles": list(suspect_vehicles)
                    }
                })

        dataset = {
            "metadata": {
                "simulation_run": run_id,
                "window_size_steps": self.window_size_steps,
                "time_step_seconds": self.step_seconds,
                "features": feature_cols
            },
            "samples": samples
        }
        return dataset
