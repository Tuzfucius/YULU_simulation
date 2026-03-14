"""
运行历史 API。
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from .files import OUTPUT_DIR, _get_frames_for_file
from ..services.run_repository import (
    DATA_FILENAME,
    RUN_SCHEMA_VERSION,
    load_run_manifest,
    load_run_summary,
    resolve_run_dir,
    list_runs,
)

router = APIRouter()


class RunRenameModel(BaseModel):
    new_name: str


def _sanitize_run_name(name: str) -> str:
    normalized = re.sub(r'[<>:"/\\|?*]+', "_", (name or "").strip())
    normalized = re.sub(r"\s+", "_", normalized).strip("._")
    if not normalized:
        raise HTTPException(status_code=400, detail="运行名称不能为空")
    return normalized


def _open_folder_in_explorer(path: Path):
    folder = path if path.is_dir() else path.parent
    if os.name == "nt":
        subprocess.Popen(["explorer", str(folder)])
    else:
        raise HTTPException(status_code=501, detail="当前仅支持 Windows 打开文件夹")


def _available_copy_dir(source_path: Path) -> Path:
    base_name = source_path.name
    for index in range(1, 1000):
        candidate = source_path.parent / f"{base_name}_copy{index}"
        if not candidate.exists():
            return candidate
    raise HTTPException(status_code=500, detail="无法生成可用的复制名称")


def _resolve_run(run_id: str) -> Path:
    try:
        run_dir = resolve_run_dir(OUTPUT_DIR, run_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not run_dir.exists() or not run_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"运行不存在: {run_id}")
    return run_dir


def _load_run_cache(run_dir: Path) -> dict:
    data_file = run_dir / DATA_FILENAME
    if not data_file.exists():
        raise HTTPException(status_code=404, detail=f"运行缺少数据文件: {run_dir.name}")
    return _get_frames_for_file(data_file)


def _load_run_data_json(run_dir: Path) -> dict:
    data_file = run_dir / DATA_FILENAME
    if not data_file.exists():
        raise HTTPException(status_code=404, detail=f"运行缺少数据文件: {run_dir.name}")

    try:
        with open(data_file, 'r', encoding='utf-8') as file:
            return json.load(file)
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"运行数据读取失败: {run_dir.name}") from exc


def _build_speed_timeline(segment_history: list[dict]) -> list[dict]:
    buckets: dict[float, dict] = {}
    for entry in segment_history:
        time_value = float(entry.get('time', 0.0))
        bucket = buckets.setdefault(
            time_value,
            {'time': time_value, 'speed_sum': 0.0, 'density_sum': 0.0, 'flow_sum': 0.0, 'vehicle_count': 0, 'samples': 0},
        )
        bucket['speed_sum'] += float(entry.get('avg_speed', 0.0))
        bucket['density_sum'] += float(entry.get('density', 0.0))
        bucket['flow_sum'] += float(entry.get('flow', 0.0))
        bucket['vehicle_count'] += int(entry.get('vehicle_count', 0))
        bucket['samples'] += 1

    timeline = []
    for item in sorted(buckets.values(), key=lambda value: value['time']):
        samples = max(1, item['samples'])
        timeline.append(
            {
                'time': item['time'],
                'avg_speed': round(item['speed_sum'] / samples, 3),
                'avg_density': round(item['density_sum'] / samples, 3),
                'avg_flow': round(item['flow_sum'] / samples, 3),
                'vehicle_count': item['vehicle_count'],
            }
        )
    return timeline


def _build_segment_heatmap(segment_history: list[dict]) -> list[dict]:
    if not segment_history:
        return []

    max_speed = max(float(entry.get('avg_speed', 0.0)) for entry in segment_history) or 1.0
    ordered_times = sorted({float(entry.get('time', 0.0)) for entry in segment_history})
    time_to_index = {value: index for index, value in enumerate(ordered_times)}

    heatmap = []
    for entry in segment_history:
        avg_speed = float(entry.get('avg_speed', 0.0))
        intensity = 1.0 - min(1.0, avg_speed / max_speed)
        heatmap.append(
            {
                'position': float(entry.get('segment', 0)),
                'time': time_to_index.get(float(entry.get('time', 0.0)), 0),
                'intensity': round(intensity, 4),
            }
        )
    return heatmap


def _build_anomaly_timeline(anomaly_logs: list[dict], bucket_size: int) -> list[dict]:
    if bucket_size <= 0:
        bucket_size = 60

    buckets: dict[int, dict] = {}
    for entry in anomaly_logs:
        time_value = int(float(entry.get('time', entry.get('timestamp', 0.0))))
        bucket_start = (time_value // bucket_size) * bucket_size
        item = buckets.setdefault(bucket_start, {'time': bucket_start, 'anomaly_count': 0})
        item['anomaly_count'] += 1

    return [buckets[key] for key in sorted(buckets.keys())]


def _build_event_breakdown(data: dict) -> list[dict]:
    return [
        {'name': '异常事件', 'value': len(data.get('anomaly_logs', []))},
        {'name': '排队事件', 'value': len(data.get('queue_events', []))},
        {'name': '幻象拥堵', 'value': len(data.get('phantom_jam_events', []))},
        {'name': 'ETC告警', 'value': len(data.get('alert_logs', []))},
        {'name': '交易记录', 'value': len(data.get('etc_transactions', []))},
    ]


@router.get('')
async def get_runs():
    """列出历史运行。"""
    return {'runs': list_runs(OUTPUT_DIR)}


@router.get('/{run_id}')
async def get_run_detail(run_id: str):
    """获取单个运行的摘要与清单。"""
    run_dir = _resolve_run(run_id)
    summary = load_run_summary(run_dir)
    manifest = load_run_manifest(run_dir)

    if not summary and not manifest:
        raise HTTPException(status_code=404, detail=f"运行缺少元数据: {run_id}")

    return {
        'run_id': run_id,
        'schema_version': (summary or {}).get('schema_version', RUN_SCHEMA_VERSION),
        'summary': summary or {},
        'manifest': manifest or {},
    }


@router.get('/{run_id}/replay/meta')
async def get_run_replay_meta(run_id: str):
    """获取回放元信息。"""
    run_dir = _resolve_run(run_id)
    summary = load_run_summary(run_dir) or {}
    manifest = load_run_manifest(run_dir) or {}
    cache = _load_run_cache(run_dir)
    road_geometry = manifest.get('road_geometry', {})

    return {
        'run_id': run_id,
        'schema_version': manifest.get('schema_version', summary.get('schema_version', RUN_SCHEMA_VERSION)),
        'total_frames': cache.get('total_frames', 0),
        'config': cache.get('config', {}),
        'summary': summary.get('summary', {}),
        'sampling': manifest.get('sampling', {}),
        'gates': road_geometry.get('gates', []),
        'path_geometry': road_geometry.get('path_geometry', {}),
        'artifacts': manifest.get('artifacts', {}),
        'chunks': manifest.get('chunks', {}),
    }


@router.get('/{run_id}/replay/frames')
async def get_run_replay_frames(
    run_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=2000),
):
    """分页读取回放帧。"""
    run_dir = _resolve_run(run_id)
    cache = _load_run_cache(run_dir)
    frames = cache.get('frames', [])
    chunk = frames[offset: offset + limit]
    manifest = load_run_manifest(run_dir) or {}
    road_geometry = manifest.get('road_geometry', {})

    return {
        'run_id': run_id,
        'frames': chunk,
        'offset': offset,
        'limit': limit,
        'total_frames': cache.get('total_frames', 0),
        'has_more': offset + limit < cache.get('total_frames', 0),
        'config': cache.get('config', {}) if offset == 0 else None,
        'gates': road_geometry.get('gates', []) if offset == 0 else None,
        'path_geometry': road_geometry.get('path_geometry', {}) if offset == 0 else None,
    }


@router.get('/{run_id}/events')
async def get_run_events(run_id: str, event_type: Optional[str] = None):
    """读取运行事件流。"""
    run_dir = _resolve_run(run_id)
    cache = _load_run_cache(run_dir)
    data = _load_run_data_json(run_dir)

    events = {
        'anomaly_logs': data.get('anomaly_logs', []),
        'queue_events': data.get('queue_events', []),
        'phantom_jam_events': data.get('phantom_jam_events', []),
        'alert_logs': data.get('alert_logs', []),
        'etc_transactions': data.get('etc_transactions', []),
    }

    if event_type:
        if event_type not in events:
            raise HTTPException(status_code=404, detail=f"不支持的事件类型: {event_type}")
        return {'run_id': run_id, 'event_type': event_type, 'events': events[event_type]}

    return {
        'run_id': run_id,
        'events': events,
        'frame_count': cache.get('total_frames', 0),
    }


@router.get('/{run_id}/analysis')
async def get_run_analysis(run_id: str):
    """读取运行历史分析所需的轻量图表数据。"""
    run_dir = _resolve_run(run_id)
    summary = load_run_summary(run_dir) or {}
    data = _load_run_data_json(run_dir)

    segment_history = data.get('segment_speed_history', [])
    anomaly_logs = data.get('anomaly_logs', [])
    simulation_time = float((summary.get('summary') or {}).get('simulation_time', 0.0))
    if simulation_time <= 0 and segment_history:
        simulation_time = max(float(entry.get('time', 0.0)) for entry in segment_history)
    if simulation_time <= 0 and anomaly_logs:
        simulation_time = max(float(entry.get('time', entry.get('timestamp', 0.0))) for entry in anomaly_logs)
    if simulation_time <= 0:
        simulation_time = 1.0

    anomaly_bucket_size = max(60, int(simulation_time // 24) or 60)
    speed_timeline = _build_speed_timeline(segment_history)

    return {
        'run_id': run_id,
        'summary': summary.get('summary', {}),
        'charts': {
            'speed_timeline': speed_timeline,
            'segment_heatmap': _build_segment_heatmap(segment_history),
            'anomaly_timeline': _build_anomaly_timeline(anomaly_logs, anomaly_bucket_size),
            'event_breakdown': _build_event_breakdown(data),
        },
        'meta': {
            'time_bins': len({item['time'] for item in speed_timeline}),
            'max_position': max((float(entry.get('segment', 0)) for entry in segment_history), default=0.0) + 1.0,
            'duration': simulation_time,
            'anomaly_bucket_size': anomaly_bucket_size,
        },
    }


@router.put('/{run_id}/rename')
async def rename_run(run_id: str, request: RunRenameModel):
    """重命名历史运行目录。"""
    run_dir = _resolve_run(run_id)
    new_name = _sanitize_run_name(request.new_name)
    target_dir = run_dir.parent / new_name
    if target_dir.exists():
        raise HTTPException(status_code=409, detail=f"名称已存在: {new_name}")

    try:
        run_dir.rename(target_dir)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"重命名失败: {exc}") from exc

    return {"success": True, "run_id": new_name}


@router.post('/{run_id}/copy')
async def copy_run(run_id: str):
    """复制历史运行目录。"""
    run_dir = _resolve_run(run_id)
    target_dir = _available_copy_dir(run_dir)

    try:
        shutil.copytree(run_dir, target_dir)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"复制失败: {exc}") from exc

    return {"success": True, "run_id": target_dir.name}


@router.delete('/{run_id}')
async def delete_run(run_id: str):
    """删除历史运行目录。"""
    run_dir = _resolve_run(run_id)
    try:
        shutil.rmtree(run_dir)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"删除失败: {exc}") from exc

    return {"success": True, "message": f"运行已删除: {run_id}"}


@router.post('/{run_id}/open-folder')
async def open_run_folder(run_id: str):
    """在资源管理器中打开运行目录。"""
    run_dir = _resolve_run(run_id)
    _open_folder_in_explorer(run_dir)
    return {"success": True, "folder": str(run_dir)}


@router.get('/{run_id}/gates')
async def get_run_gates(run_id: str):
    """读取运行门架与路径几何。"""
    run_dir = _resolve_run(run_id)
    manifest = load_run_manifest(run_dir) or {}
    road_geometry = manifest.get('road_geometry', {})

    return {
        'run_id': run_id,
        'gates': road_geometry.get('gates', []),
        'path_geometry': road_geometry.get('path_geometry', {}),
    }
