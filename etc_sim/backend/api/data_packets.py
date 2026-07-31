"""Read and store simulation alert data packets without executing user code."""

import glob
import json
import logging
import os
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel


router = APIRouter()
logger = logging.getLogger(__name__)
PACKETS_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'packets')
os.makedirs(PACKETS_DIR, exist_ok=True)


class PacketSummary(BaseModel):
    packet_id: str
    session_id: str = ''
    created_at: str = ''
    duration_s: float = 0
    alert_count: int = 0
    truth_count: int = 0
    severity_counts: dict[str, int] = {}
    avg_speed_kmh: float = 0
    weather: str = 'clear'


def _packet_path(packet_id: str) -> str:
    if not packet_id or any(character in packet_id for character in "/\\"):
        raise HTTPException(status_code=400, detail="Invalid packet id")
    return os.path.join(PACKETS_DIR, f"packet_{packet_id}.json")


def _load_packet(packet_id: str) -> dict[str, Any]:
    path = _packet_path(packet_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Packet not found")
    with open(path, encoding="utf-8") as file:
        return json.load(file)


@router.get("/", response_model=list[PacketSummary])
async def list_packets():
    summaries = []
    for path in sorted(glob.glob.glob(os.path.join(PACKETS_DIR, "packet_*.json")), reverse=True):
        try:
            with open(path, encoding="utf-8") as file:
                data = json.load(file)
            alerts = data.get("alerts", [])
            severity_counts: dict[str, int] = {}
            for alert in alerts:
                severity = alert.get("severity", "medium")
                severity_counts[severity] = severity_counts.get(severity, 0) + 1
            summaries.append(PacketSummary(
                packet_id=data.get("packet_id", ""), session_id=data.get("session_id", ""),
                created_at=data.get("created_at", ""), duration_s=data.get("duration_s", 0),
                alert_count=len(alerts), truth_count=len(data.get("ground_truths", [])),
                severity_counts=severity_counts,
                avg_speed_kmh=data.get("snapshot", {}).get("avg_speed_kmh", 0),
                weather=data.get("snapshot", {}).get("weather", "clear"),
            ))
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Skipping invalid packet %s: %s", path, exc)
    return summaries


@router.get("/{packet_id}")
async def get_packet(packet_id: str):
    return {"success": True, "data": _load_packet(packet_id)}


@router.delete("/{packet_id}")
async def delete_packet(packet_id: str):
    path = _packet_path(packet_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Packet not found")
    os.remove(path)
    return {"success": True}


@router.post("/store")
async def store_packet(data: dict[str, Any]):
    from ..models_import import AlertDataPacket

    try:
        packet = AlertDataPacket.from_dict(data)
        return {"success": True, "packet_id": packet.packet_id, "filepath": packet.save(PACKETS_DIR)}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid packet: {exc}") from exc
