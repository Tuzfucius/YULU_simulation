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
    # 所有可用特征定义
    BASE_FEATURES = ['flow', 'density', 'avg_speed']
    EXTRA_FEATURES = ['speed_variance', 'occupancy', 'headway_mean']
    ALL_FEATURES = BASE_FEATURES + EXTRA_FEATURES

    def __init__(self, 
                 step_seconds: float = 60.0, 
                 window_size_steps: int = 5,
                 extra_features: List[str] = None):
        """
        :param step_seconds: 切分步长 (如 60s)
        :param window_size_steps: 时间窗大小 (如 5，即包含过去的 5 步)
        :param extra_features: 额外启用的特征列表, 可选: speed_variance, occupancy, headway_mean
        """
        self.step_seconds = step_seconds
        self.window_size_steps = window_size_steps
        self.extra_features = extra_features or []

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
            
            # ===== 可选扩展特征 =====
            if 'speed_variance' in self.extra_features:
                # 区间速度方差 (反映速度离散程度，越大说明交通流越不稳定)
                speed_var = seg_paired.groupby('time_bin', observed=False).agg(
                    speed_variance=('speed_kmh', 'var')
                ).reset_index()
                stats = pd.merge(stats, speed_var, on='time_bin', how='left')
                stats['speed_variance'] = stats['speed_variance'].fillna(0)
            
            if 'occupancy' in self.extra_features:
                # 区间占有率估算 (车辆数 × 平均车长 / 区间长度)
                avg_vehicle_length_km = 0.005  # 约5米
                seg_length_km = abs(seg_paired['distance_km'].iloc[0]) if len(seg_paired) > 0 else 2.0
                stats['occupancy'] = (stats['flow_out'] * avg_vehicle_length_km / max(seg_length_km, 0.1)).clip(0, 1)
            
            if 'headway_mean' in self.extra_features:
                # 平均车头时距 (秒)，反映车辆间距紧密程度
                headway = seg_paired.groupby('time_bin', observed=False).apply(
                    lambda g: g['timestamp'].diff().mean() if len(g) > 1 else self.step_seconds,
                    include_groups=False
                ).reset_index(name='headway_mean')
                stats = pd.merge(stats, headway, on='time_bin', how='left')
                stats['headway_mean'] = stats['headway_mean'].fillna(self.step_seconds)
            
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
        
        # 特征列定义 (基础 + 用户选择的扩展特征)
        feature_cols = list(self.BASE_FEATURES)
        for ef in self.extra_features:
            if ef in self.EXTRA_FEATURES:
                feature_cols.append(ef)
        
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

    def build_dataset_from_history(self, 
                                   segment_speed_history: List[Dict[str, Any]], 
                                   anomaly_logs: List[Dict[str, Any]],
                                   config: Dict[str, Any],
                                   run_id: str = "default_run",
                                   custom_expressions: List[str] = None) -> Dict[str, Any]:
        """
        [新版] 直接利用前端引擎导出的 segment_speed_history 生成时空图特征序列。
        彻底代替依赖门架交易记录的旧方法。
        """
        if not segment_speed_history:
            return {"metadata": {}, "samples": []}
            
        df_raw = pd.DataFrame(segment_speed_history)
        if 'time' not in df_raw.columns or 'segment' not in df_raw.columns:
            return {"metadata": {}, "samples": []}
            
        # 1. 按照 step_seconds 重采样合并
        df_raw['time_bin'] = (df_raw['time'] // self.step_seconds) * self.step_seconds
        
        df_grouped = df_raw.groupby(['segment', 'time_bin']).agg(
            flow=('flow', 'mean'),             
            density=('density', 'mean'),
            avg_speed=('avg_speed', 'mean'),
            vehicle_count_mean=('vehicle_count', 'mean')
        ).reset_index()
        
        # 补全可能缺失的时序
        all_features = []
        for seg, group in df_grouped.groupby('segment'):
            min_t, max_t = group['time_bin'].min(), group['time_bin'].max()
            full_idx = pd.DataFrame({'time_bin': np.arange(min_t, max_t + self.step_seconds, self.step_seconds)})
            merged = pd.merge(full_idx, group, on='time_bin', how='left')
            merged['segment'] = seg
            merged = merged.ffill().fillna(0)
            all_features.append(merged)
            
        if not all_features:
            return {"metadata": {}, "samples": []}
            
        df_features = pd.concat(all_features, ignore_index=True)
        
        # 2. 计算用户勾选的附加特征
        if 'speed_variance' in self.extra_features:
            df_features['speed_variance'] = df_features.groupby('segment')['avg_speed'].diff().abs().fillna(0)
            
        if 'occupancy' in self.extra_features:
            max_density = config.get('num_lanes', 4) * 100
            df_features['occupancy'] = (df_features['density'] / max_density).clip(0, 1)
            
        if 'headway_mean' in self.extra_features:
            df_features['headway_mean'] = df_features['flow'].apply(lambda q: 3600 / max(q, 1))

        feature_cols = list(self.BASE_FEATURES)
        for ef in self.extra_features:
            if ef in self.EXTRA_FEATURES:
                feature_cols.append(ef)

        # 2.5 执行用户自定义派生特征表达式
        custom_cols = []
        if custom_expressions:
            for expr in custom_expressions:
                expr = expr.strip()
                if not expr or '=' not in expr:
                    continue
                col_name, formula = expr.split('=', 1)
                col_name = col_name.strip()
                formula = formula.strip()
                try:
                    # 逐路段分组计算，这样 .shift() 和 .diff() 不会跨路段
                    results = []
                    for seg, grp in df_features.groupby('segment'):
                        local_ns = {
                            'avg_speed': grp['avg_speed'],
                            'flow': grp['flow'],
                            'density': grp['density'],
                            'np': np, 'pd': pd,
                        }
                        for f in feature_cols:
                            if f not in local_ns:
                                local_ns[f] = grp[f]
                        val = eval(formula, {"__builtins__": {}}, local_ns)
                        grp = grp.copy()
                        grp[col_name] = val
                        results.append(grp)
                    df_features = pd.concat(results, ignore_index=True)
                    df_features[col_name] = df_features[col_name].fillna(0)
                    custom_cols.append(col_name)
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning(f"自定义表达式执行失败 '{expr}': {e}")
        
        feature_cols.extend(custom_cols)
                
        # 3. 构造标注 Y (基于 anomaly_logs)
        gt_active_intervals = []
        for log in anomaly_logs:
            trigger_t = log.get('time', 0)
            end_t = trigger_t + 600
            gt_active_intervals.append({
                'start': trigger_t,
                'end': end_t,
                'segment': log.get('segment', 0),
                'type': log.get('type', 1)
            })
            
        samples = []
        
        # 4. 滑动窗口切割序列
        for seg, group in df_features.groupby('segment'):
            group = group.sort_values('time_bin').reset_index(drop=True)
            
            for i in range(self.window_size_steps, len(group) + 1):
                window_data = group.iloc[i - self.window_size_steps:i]
                current_time = window_data.iloc[-1]['time_bin']
                
                x_seq = window_data[feature_cols].values.tolist()
                
                has_anomaly = any(
                    a['segment'] == seg and 
                    a['start'] <= current_time and 
                    a['end'] >= current_time
                    for a in gt_active_intervals
                )
                
                samples.append({
                    "X_sequence": x_seq,
                    "Y_label": 1 if has_anomaly else 0,
                    "metadata": {
                        "segment": str(seg),
                        "time_end": float(current_time),
                        "run_id": run_id
                    }
                })
                
        return {
            "metadata": {
                "step_seconds": self.step_seconds,
                "window_size_steps": self.window_size_steps,
                "features": feature_cols,
                "run_id": run_id,
                "source": "segment_speed_history"
            },
            "samples": samples
        }
