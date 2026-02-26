"""
轨迹数据存储抽象层
支持 MessagePack 帧式存储（v2）和 JSON 扁平存储（v1）的读写兼容
"""

import os
import json
import logging
from typing import Optional
from pathlib import Path

try:
    import msgpack
except ImportError:
    msgpack = None  # 降级为仅支持 JSON

logger = logging.getLogger(__name__)

# anomaly_state 编码映射
_ANOMALY_STATE_ENCODE = {
    'normal': 0,
    'triggered': 1,
    'active': 2,
    'resolved': 3,
}
_ANOMALY_STATE_DECODE = {v: k for k, v in _ANOMALY_STATE_ENCODE.items()}


def _encode_flags(is_affected: bool, anomaly_state: str) -> int:
    """将 is_affected + anomaly_state 编码为单个整数"""
    state_code = _ANOMALY_STATE_ENCODE.get(anomaly_state, 0)
    return (state_code << 1) | (1 if is_affected else 0)


def _decode_flags(flags: int) -> dict:
    """将 flags 整数解码为 is_affected + anomaly_state"""
    is_affected = bool(flags & 1)
    state_code = (flags >> 1) & 0x3
    anomaly_state = _ANOMALY_STATE_DECODE.get(state_code, 'normal')
    return {'is_affected': is_affected, 'anomaly_state': anomaly_state}


class TrajectoryStorage:
    """轨迹数据读写抽象层"""

    MSGPACK_FILENAME = "trajectory.msgpack"
    DATA_JSON_FILENAME = "data.json"
    CURRENT_VERSION = 2

    # --- 写入 ---

    @staticmethod
    def save(sim_dir: str, trajectory_data: list, vehicle_meta: Optional[dict] = None,
             config: Optional[dict] = None):
        """
        将轨迹数据保存为 trajectory.msgpack（帧式结构）。

        Args:
            sim_dir: 仿真结果目录路径
            trajectory_data: 扁平轨迹列表 (旧格式 list[dict]) 或已转换的帧列表
            vehicle_meta: 车辆元信息 {id_str: {type, style}}，为 None 则从 trajectory_data 提取
            config: 仿真配置
        """
        if msgpack is None:
            logger.warning("msgpack 未安装，降级为 JSON 存储")
            TrajectoryStorage._save_json_fallback(sim_dir, trajectory_data)
            return

        os.makedirs(sim_dir, exist_ok=True)
        filepath = os.path.join(sim_dir, TrajectoryStorage.MSGPACK_FILENAME)

        # 如果输入已经是帧式结构
        if trajectory_data and isinstance(trajectory_data, list) and \
           len(trajectory_data) > 0 and 't' in (trajectory_data[0] if isinstance(trajectory_data[0], dict) else {}):
            frames = trajectory_data
            meta = vehicle_meta or {}
        else:
            # 从扁平列表转换为帧式结构
            frames, meta = TrajectoryStorage._flat_to_frames(trajectory_data)
            if vehicle_meta:
                meta.update(vehicle_meta)

        payload = {
            'version': TrajectoryStorage.CURRENT_VERSION,
            'config': config or {},
            'vehicle_meta': meta,
            'frames': frames,
        }

        with open(filepath, 'wb') as f:
            msgpack.pack(payload, f, use_bin_type=True)

        total_vehicles = sum(len(frame.get('v', [])) for frame in frames)
        logger.info(
            f"轨迹数据已保存: {filepath} "
            f"({len(frames)} 帧, {total_vehicles} 条记录, "
            f"{os.path.getsize(filepath) / 1024:.1f} KB)"
        )

    @staticmethod
    def _save_json_fallback(sim_dir: str, trajectory_data: list):
        """msgpack 不可用时的 JSON 降级保存"""
        filepath = os.path.join(sim_dir, "trajectory.json")
        frames, meta = TrajectoryStorage._flat_to_frames(trajectory_data)
        payload = {
            'version': TrajectoryStorage.CURRENT_VERSION,
            'vehicle_meta': meta,
            'frames': frames,
        }
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False)
        logger.info(f"轨迹数据已保存 (JSON 降级): {filepath}")

    @staticmethod
    def _flat_to_frames(flat_data: list) -> tuple:
        """
        扁平轨迹列表 → 帧式结构

        Returns:
            (frames_list, vehicle_meta_dict)
        """
        from collections import defaultdict

        # 按时间分组
        time_groups = defaultdict(list)
        vehicle_meta = {}

        for point in flat_data:
            t = point.get('time', 0)
            vid = point.get('id', 0)

            # 提取元信息（每车只记一次）
            vid_str = str(vid)
            if vid_str not in vehicle_meta:
                vehicle_meta[vid_str] = {
                    'type': point.get('vehicle_type', point.get('type', 'CAR')),
                    'style': point.get('driver_style', point.get('style', 'normal')),
                }

            # 编码 flags
            flags = _encode_flags(
                point.get('is_affected', False),
                point.get('anomaly_state', 'normal')
            )

            # 精度截断
            pos = round(point.get('pos', 0), 1)
            speed = round(point.get('speed', 0), 1)
            anomaly_type = point.get('anomaly_type', 0)

            time_groups[t].append([vid, pos, point.get('lane', 0), speed, anomaly_type, flags])

        # 排序并构建帧列表
        frames = []
        for t in sorted(time_groups.keys()):
            frames.append({
                't': t,
                'v': time_groups[t],
            })

        return frames, vehicle_meta

    # --- 读取 ---

    @staticmethod
    def load(sim_dir: str) -> Optional[dict]:
        """
        加载轨迹数据，自动检测格式。

        优先级：
          1. trajectory.msgpack（v2 帧式）
          2. trajectory.json（降级格式）
          3. data.json 中的 trajectory_data（v1 旧格式）

        Returns:
            {version, frames, vehicle_meta, config} 或 None
        """
        sim_path = Path(sim_dir)

        # 1. 尝试 MessagePack
        msgpack_file = sim_path / TrajectoryStorage.MSGPACK_FILENAME
        if msgpack_file.exists() and msgpack is not None:
            try:
                with open(msgpack_file, 'rb') as f:
                    data = msgpack.unpack(f, raw=False)
                logger.debug(f"从 MessagePack 加载轨迹: {msgpack_file}")
                return data
            except Exception as e:
                logger.warning(f"MessagePack 加载失败: {e}")

        # 2. 尝试 JSON 降级文件
        json_traj_file = sim_path / "trajectory.json"
        if json_traj_file.exists():
            try:
                with open(json_traj_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                logger.debug(f"从 trajectory.json 加载轨迹: {json_traj_file}")
                return data
            except Exception as e:
                logger.warning(f"trajectory.json 加载失败: {e}")

        # 3. 回退到 data.json
        data_json_file = sim_path / TrajectoryStorage.DATA_JSON_FILENAME
        if data_json_file.exists():
            try:
                with open(data_json_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                flat_traj = data.get('trajectory_data', [])
                if flat_traj:
                    frames, meta = TrajectoryStorage._flat_to_frames(flat_traj)
                    logger.debug(f"从 data.json 加载旧格式轨迹: {len(flat_traj)} 条")
                    return {
                        'version': 1,
                        'frames': frames,
                        'vehicle_meta': meta,
                        'config': data.get('config', {}),
                    }
            except Exception as e:
                logger.warning(f"data.json 加载失败: {e}")

        return None

    # --- 格式转换 ---

    @staticmethod
    def to_flat_trajectory(frames_data: dict) -> list:
        """
        帧式结构 → 扁平轨迹列表（兼容旧消费者）

        Args:
            frames_data: load() 返回的 dict

        Returns:
            list[dict]，格式与旧 trajectory_data 完全一致
        """
        if not frames_data:
            return []

        frames = frames_data.get('frames', [])
        vehicle_meta = frames_data.get('vehicle_meta', {})
        result = []

        for frame in frames:
            t = frame.get('t', 0)
            for vehicle_arr in frame.get('v', []):
                # vehicle_arr = [id, pos, lane, speed, anomaly_type, flags]
                vid = vehicle_arr[0]
                pos = vehicle_arr[1]
                lane = vehicle_arr[2]
                speed = vehicle_arr[3]
                anomaly_type = vehicle_arr[4] if len(vehicle_arr) > 4 else 0
                flags = vehicle_arr[5] if len(vehicle_arr) > 5 else 0

                decoded = _decode_flags(flags)
                vid_str = str(vid)
                meta = vehicle_meta.get(vid_str, {})

                result.append({
                    'id': vid,
                    'time': t,
                    'pos': pos,
                    'lane': lane,
                    'speed': speed,
                    'anomaly_type': anomaly_type,
                    'anomaly_state': decoded['anomaly_state'],
                    'is_affected': decoded['is_affected'],
                    'vehicle_type': meta.get('type', 'CAR'),
                    'driver_style': meta.get('style', 'normal'),
                })

        return result

    # --- 辅助 ---

    @staticmethod
    def get_record_count(sim_dir: str) -> int:
        """
        快速获取轨迹记录总数（不加载全部数据到内存）。
        """
        sim_path = Path(sim_dir)

        # 1. MessagePack — 需要加载，但比 JSON 快得多
        msgpack_file = sim_path / TrajectoryStorage.MSGPACK_FILENAME
        if msgpack_file.exists() and msgpack is not None:
            try:
                with open(msgpack_file, 'rb') as f:
                    data = msgpack.unpack(f, raw=False)
                return sum(len(frame.get('v', [])) for frame in data.get('frames', []))
            except Exception:
                pass

        # 2. trajectory.json
        json_traj_file = sim_path / "trajectory.json"
        if json_traj_file.exists():
            try:
                with open(json_traj_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                return sum(len(frame.get('v', [])) for frame in data.get('frames', []))
            except Exception:
                pass

        # 3. data.json
        data_json_file = sim_path / TrajectoryStorage.DATA_JSON_FILENAME
        if data_json_file.exists():
            try:
                with open(data_json_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                return len(data.get('trajectory_data', []))
            except Exception:
                pass

        return 0

    @staticmethod
    def exists(sim_dir: str) -> bool:
        """检查仿真目录是否包含轨迹数据"""
        sim_path = Path(sim_dir)
        return (
            (sim_path / TrajectoryStorage.MSGPACK_FILENAME).exists() or
            (sim_path / "trajectory.json").exists() or
            (sim_path / TrajectoryStorage.DATA_JSON_FILENAME).exists()
        )
