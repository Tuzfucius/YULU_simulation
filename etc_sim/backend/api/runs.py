"""
运行历史 API。
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

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


@router.get("")
async def get_runs():
    """列出历史运行。"""
    return {"runs": list_runs(OUTPUT_DIR)}


@router.get("/{run_id}")
async def get_run_detail(run_id: str):
    """获取单个运行的摘要与清单。"""
    run_dir = _resolve_run(run_id)
    summary = load_run_summary(run_dir)
    manifest = load_run_manifest(run_dir)

    if not summary and not manifest:
        raise HTTPException(status_code=404, detail=f"运行缺少元数据: {run_id}")

    return {
        "run_id": run_id,
        "schema_version": (summary or {}).get("schema_version", RUN_SCHEMA_VERSION),
        "summary": summary or {},
        "manifest": manifest or {},
    }


@router.get("/{run_id}/replay/meta")
async def get_run_replay_meta(run_id: str):
    """获取回放元信息。"""
    run_dir = _resolve_run(run_id)
    summary = load_run_summary(run_dir) or {}
    manifest = load_run_manifest(run_dir) or {}
    cache = _load_run_cache(run_dir)
    road_geometry = manifest.get("road_geometry", {})

    return {
        "run_id": run_id,
        "schema_version": manifest.get("schema_version", summary.get("schema_version", RUN_SCHEMA_VERSION)),
        "total_frames": cache.get("total_frames", 0),
        "config": cache.get("config", {}),
        "summary": summary.get("summary", {}),
        "sampling": manifest.get("sampling", {}),
        "gates": road_geometry.get("gates", []),
        "path_geometry": road_geometry.get("path_geometry", {}),
        "artifacts": manifest.get("artifacts", {}),
        "chunks": manifest.get("chunks", {}),
    }


@router.get("/{run_id}/replay/frames")
async def get_run_replay_frames(
    run_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=2000),
):
    """分页读取回放帧。"""
    run_dir = _resolve_run(run_id)
    cache = _load_run_cache(run_dir)
    frames = cache.get("frames", [])
    chunk = frames[offset : offset + limit]
    manifest = load_run_manifest(run_dir) or {}
    road_geometry = manifest.get("road_geometry", {})

    return {
        "run_id": run_id,
        "frames": chunk,
        "offset": offset,
        "limit": limit,
        "total_frames": cache.get("total_frames", 0),
        "has_more": offset + limit < cache.get("total_frames", 0),
        "config": cache.get("config", {}) if offset == 0 else None,
        "gates": road_geometry.get("gates", []) if offset == 0 else None,
        "path_geometry": road_geometry.get("path_geometry", {}) if offset == 0 else None,
    }


@router.get("/{run_id}/events")
async def get_run_events(run_id: str, event_type: Optional[str] = None):
    """读取运行事件流。"""
    run_dir = _resolve_run(run_id)
    cache = _load_run_cache(run_dir)
    data_file = run_dir / DATA_FILENAME
    data = {}
    if data_file.exists():
        import json

        with open(data_file, "r", encoding="utf-8") as file:
            data = json.load(file)

    events = {
        "anomaly_logs": data.get("anomaly_logs", []),
        "queue_events": data.get("queue_events", []),
        "phantom_jam_events": data.get("phantom_jam_events", []),
        "alert_logs": data.get("alert_logs", []),
        "etc_transactions": data.get("etc_transactions", []),
    }

    if event_type:
        if event_type not in events:
            raise HTTPException(status_code=404, detail=f"不支持的事件类型: {event_type}")
        return {"run_id": run_id, "event_type": event_type, "events": events[event_type]}

    return {
        "run_id": run_id,
        "events": events,
        "frame_count": cache.get("total_frames", 0),
    }


@router.get("/{run_id}/gates")
async def get_run_gates(run_id: str):
    """读取运行门架与路径几何。"""
    run_dir = _resolve_run(run_id)
    manifest = load_run_manifest(run_dir) or {}
    road_geometry = manifest.get("road_geometry", {})

    return {
        "run_id": run_id,
        "gates": road_geometry.get("gates", []),
        "path_geometry": road_geometry.get("path_geometry", {}),
    }
