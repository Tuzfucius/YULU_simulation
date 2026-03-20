"""File management and script execution API."""

# - list output files
# - manage scripts
# - execute sandboxed python scripts




from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pathlib import Path
from typing import Optional
import os
import sys
import json
import subprocess
import tempfile
import datetime
import logging

from etc_sim.backend.services.run_repository import (
    build_gate_descriptors,
    build_path_geometry,
    load_run_manifest,
    load_run_summary,
)
from etc_sim.backend.services.trajectory_storage import TrajectoryStorage

logger = logging.getLogger(__name__)
router = APIRouter()

# 缁熶竴鏁版嵁鏍圭洰褰? etc_sim/data/
ETC_SIM_DIR = Path(__file__).resolve().parents[2]   # etc_sim/
DATA_ROOT = ETC_SIM_DIR / "data"
OUTPUT_DIR = DATA_ROOT / "simulations"               # 浠跨湡杩愯鏁版嵁
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
SCRIPTS_DIR = ETC_SIM_DIR / "scripts"


# ============================================
# 鍘嗗彶鏁版嵁鏂囦欢娴忚
# ============================================

def _scan_files(directory: Path, extensions: set = None) -> list:
    """Recursively scan a directory and return file metadata."""
    results = []
    if not directory.exists():
        return results
    
    for item in sorted(directory.rglob("*")):
        if item.is_file():
            if extensions and item.suffix.lower() not in extensions:
                continue
            try:
                stat = item.stat()
                results.append({
                    "name": item.name,
                    "path": str(item.relative_to(directory)),
                    "size": stat.st_size,
                    "modified": datetime.datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "extension": item.suffix.lower(),
                })
            except Exception:
                pass
    return results


def _scan_tree(directory: Path) -> list:
    """Scan a directory tree."""
    result = []
    if not directory.exists():
        return result
    
    for item in sorted(directory.iterdir()):
        node = {
            "name": item.name,
            "path": str(item.relative_to(directory)),
            "isDir": item.is_dir(),
        }
        if item.is_dir():
            node["children"] = _scan_tree(item)
        else:
            try:
                stat = item.stat()
                node["size"] = stat.st_size
                node["modified"] = datetime.datetime.fromtimestamp(stat.st_mtime).isoformat()
            except Exception:
                pass
        result.append(node)
    return result


@router.get("/output-files")
async def list_output_files():
    """List output data files."""
    files = _scan_files(OUTPUT_DIR, extensions={".csv", ".json"})
    
    # 瀵?JSON 鏂囦欢灏濊瘯鎻愬彇浠跨湡鍙傛暟鎽樿
    for f in files:
        if f["extension"] == ".json":
            try:
                fpath = OUTPUT_DIR / f["path"]
                with open(fpath, "r", encoding="utf-8") as fp:
                    # 鍙鍓?2000 瀛楃蹇€熸彁鍙?
                    head = fp.read(2000)
                data = json.loads(head if head.rstrip().endswith('}') else head + ']}')
            except Exception:
                try:
                    data = json.loads((OUTPUT_DIR / f["path"]).read_text(encoding="utf-8"))
                except Exception:
                    data = {}
            
            meta = {}
            # 浠?metadata 鎴?config 鎴?statistics 涓彁鍙栧叧閿弬鏁?
            cfg = data.get("metadata", {}).get("config", data.get("config", {}))
            stats = data.get("statistics", data.get("metadata", {}).get("statistics", {}))
            
            if cfg:
                if "totalVehicles" in cfg or "total_vehicles" in cfg:
                    meta["vehicles"] = cfg.get("totalVehicles", cfg.get("total_vehicles"))
                if "numLanes" in cfg or "num_lanes" in cfg:
                    meta["lanes"] = cfg.get("numLanes", cfg.get("num_lanes"))
                if "roadLength" in cfg or "road_length" in cfg:
                    meta["road_km"] = round((cfg.get("roadLength", cfg.get("road_length", 0))) / 1000, 1)
                if "simulationTime" in cfg or "simulation_time" in cfg:
                    meta["sim_time"] = cfg.get("simulationTime", cfg.get("simulation_time"))
            
            if stats:
                if "avgSpeed" in stats:
                    meta["avg_speed"] = round(stats["avgSpeed"], 1)
                if "totalAnomalies" in stats:
                    meta["anomalies"] = stats["totalAnomalies"]
            
            if data.get("metadata", {}).get("exported_at"):
                meta["exported_at"] = data["metadata"]["exported_at"]
            
            f["meta"] = meta
    
    return {"dir": str(OUTPUT_DIR), "files": files}


@router.get("/output-file")
async def read_output_file(path: str):
    """Read a small output file."""
    target = (OUTPUT_DIR / path).resolve()
    if not str(target).startswith(str(OUTPUT_DIR)):
        raise HTTPException(400, "????")
    if not target.exists():
        raise HTTPException(404, "?????")
    
    # 澶ф枃浠朵繚鎶?
    size = target.stat().st_size
    if size > 20 * 1024 * 1024:
        raise HTTPException(
            413,
            f"鏂囦欢杩囧ぇ ({size / 1024 / 1024:.1f}MB)锛岃浣跨敤鍒嗗潡鍔犺浇 API: /output-file-info + /output-file-chunk"
        )
    
    content = target.read_text(encoding="utf-8")
    
    if target.suffix.lower() == ".json":
        try:
            return {"type": "json", "data": json.loads(content)}
        except json.JSONDecodeError:
            return {"type": "text", "data": content}
    else:
        return {"type": "text", "data": content}


# ============================================
# 澶ф枃浠跺垎鍧楀姞杞?API
# ============================================

def _default_path_id(lane: int, config: Optional[dict] = None) -> str:
    prefix = "custom_lane" if (config or {}).get("custom_road_path") else "main_lane"
    return f"{prefix}_{lane}"


def _vehicle_path_fields(entry: dict, lane: int, config: Optional[dict] = None) -> dict:
    x_pos = entry.get("pos", entry.get("x", 0))
    return {
        "path_id": entry.get("path_id", _default_path_id(lane, config)),
        "s": entry.get("s", x_pos),
        "offset": entry.get("offset", 0.0),
    }


def _resolve_replay_geometry(
    config: Optional[dict] = None,
    gates: Optional[list] = None,
    path_geometry: Optional[dict] = None,
):
    resolved_config = config or {}
    resolved_gates = gates or build_gate_descriptors(resolved_config)
    resolved_path_geometry = path_geometry or build_path_geometry(resolved_config)
    return resolved_gates, resolved_path_geometry


def _read_json_payload(target: Path) -> dict:
    try:
        payload = json.loads(target.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {"frames": payload}
    except Exception:
        return {}


def _load_replay_metadata(target: Path) -> dict:
    run_dir = target.parent
    summary = load_run_summary(run_dir)
    manifest = load_run_manifest(run_dir)

    config = {}
    etc_gates = None
    path_geometry = None
    total_frames = 0
    finished_vehicles_count = 0
    anomaly_count = 0

    if manifest:
        config = manifest.get("config", {}) or {}
        road_geometry = manifest.get("road_geometry", {}) or {}
        etc_gates = road_geometry.get("gates")
        path_geometry = road_geometry.get("path_geometry")
        chunks = manifest.get("chunks", {}) or {}
        trajectory_chunks = chunks.get("trajectory", []) if isinstance(chunks, dict) else []
        if trajectory_chunks:
            total_frames = int(trajectory_chunks[0].get("record_count", 0) or 0)
        summary_fields = manifest.get("summary", {}) or {}
        finished_vehicles_count = int(summary_fields.get("total_vehicles", 0) or 0)
        anomaly_count = int(summary_fields.get("total_anomalies", 0) or 0)

    if summary:
        summary_fields = summary.get("summary", {}) or {}
        if not finished_vehicles_count:
            finished_vehicles_count = int(summary_fields.get("total_vehicles", 0) or 0)
        if not anomaly_count:
            anomaly_count = int(summary_fields.get("total_anomalies", 0) or 0)

    if not config or not total_frames:
        data = _read_json_payload(target)
        if not config:
            config = data.get("config", {}) or {}
        if etc_gates is None:
            etc_gates = data.get("etcGates")
        if path_geometry is None:
            path_geometry = data.get("pathGeometry")
        if not total_frames:
            if isinstance(data.get("trajectory_data"), list):
                total_frames = len(data["trajectory_data"])
            elif isinstance(data.get("frames"), list):
                total_frames = len(data["frames"])
            elif isinstance(data, list):
                total_frames = len(data)
        if not finished_vehicles_count:
            finished_vehicles_count = len(data.get("finished_vehicles", []))
        if not anomaly_count:
            anomaly_count = len(data.get("anomaly_logs", []))

    etc_gates, path_geometry = _resolve_replay_geometry(config, etc_gates, path_geometry)

    return {
        "config": config,
        "etcGates": etc_gates,
        "pathGeometry": path_geometry,
        "total_frames": total_frames,
        "finished_vehicles_count": finished_vehicles_count,
        "anomaly_count": anomaly_count,
    }


def _trajectory_to_frames(trajectory_data: list, config: dict = None) -> list:
    """Convert flat trajectory records into replay frames."""
    from collections import defaultdict

    frame_map = defaultdict(list)
    for entry in trajectory_data:
        t = entry.get("time", 0)
        rt = round(t * 2) / 2
        lane = entry.get("lane", 0)
        vehicle = {
            "id": entry.get("id", 0),
            "x": entry.get("pos", entry.get("x", 0)),
            "lane": lane,
            "speed": entry.get("speed", 0),
            "type": entry.get("vehicle_type", entry.get("type", "CAR")),
            "anomaly": entry.get("anomaly_type", entry.get("anomaly", 0)),
        }
        vehicle.update(_vehicle_path_fields(entry, lane, config))
        frame_map[rt].append(vehicle)

    frames = [{"time": t, "vehicles": frame_map[t]} for t in sorted(frame_map.keys())]
    return frames


# ????????????
_frame_cache: dict = {}  # {file_path: {'frames': [...], 'config': {...}, 'ts': mtime}}


def _msgpack_frames_to_api_frames(traj_data: dict, config: dict = None) -> list:
    """Convert trajectory storage frames into replay frames."""
    frames = traj_data.get("frames", [])
    vehicle_meta = traj_data.get("vehicle_meta", {})
    path_registry = traj_data.get("path_registry", {})
    api_frames = []

    for frame in frames:
        t = frame.get("t", 0)
        vehicles = []
        for v_arr in frame.get("v", []):
            vid = v_arr[0]
            lane = v_arr[2]
            path_code = v_arr[6] if len(v_arr) > 6 else lane
            path_id = path_registry.get(str(path_code), _default_path_id(lane, config))
            meta = vehicle_meta.get(str(vid), {})
            vehicles.append({
                "id": vid,
                "x": v_arr[1],
                "lane": lane,
                "speed": v_arr[3],
                "type": meta.get("type", "CAR"),
                "anomaly": v_arr[4] if len(v_arr) > 4 else 0,
                "path_id": path_id,
                "s": v_arr[1],
                "offset": 0.0,
            })
        api_frames.append({"time": t, "vehicles": vehicles})

    return api_frames


def _get_frames_for_file(target: Path) -> dict:
    """Load replay frames for a target file with cache support."""
    global _frame_cache
    mtime = target.stat().st_mtime
    cache_key = str(target)
    
    if cache_key in _frame_cache and _frame_cache[cache_key]['ts'] == mtime:
        return _frame_cache[cache_key]
    
    metadata = _load_replay_metadata(target)
    config = metadata["config"]
    etc_gates = metadata["etcGates"]
    path_geometry = metadata["pathGeometry"]
    total_frames = metadata["total_frames"]
    finished_vehicles_count = metadata["finished_vehicles_count"]
    anomaly_count = metadata["anomaly_count"]

    # 优先读取轨迹存储，避免为回放元数据重复展开 data.json
    sim_dir = str(target.parent)
    traj_data = TrajectoryStorage.load(sim_dir)
    frames = []

    if traj_data and traj_data.get("frames"):
        frames = _msgpack_frames_to_api_frames(traj_data, config)
        if not total_frames:
            total_frames = len(frames)
    else:
        data = _read_json_payload(target)
        if not config:
            config = data.get("config", {})
        if "trajectory_data" in data:
            frames = _trajectory_to_frames(data["trajectory_data"], config)
        elif "frames" in data:
            frames = data["frames"]
        elif isinstance(data, list):
            frames = data
        if not etc_gates:
            etc_gates = data.get("etcGates")
        if not path_geometry:
            path_geometry = data.get("pathGeometry")
        if not finished_vehicles_count:
            finished_vehicles_count = len(data.get("finished_vehicles", []))
        if not anomaly_count:
            anomaly_count = len(data.get("anomaly_logs", []))
        if not total_frames:
            total_frames = len(frames)

    etc_gates, path_geometry = _resolve_replay_geometry(config, etc_gates, path_geometry)

    result = {
        "frames": frames,
        "config": config,
        "ts": mtime,
        "total_frames": total_frames,
        "anomaly_count": anomaly_count,
        "finished_vehicles_count": finished_vehicles_count,
        "etcGates": etc_gates,
        "pathGeometry": path_geometry,
    }
    
    # 浠呯紦瀛樻渶杩?3 涓枃浠讹紝閬垮厤鍐呭瓨鐖嗙偢
    if len(_frame_cache) >= 3:
        oldest_key = min(_frame_cache, key=lambda k: _frame_cache[k]['ts'])
        del _frame_cache[oldest_key]
    
    _frame_cache[cache_key] = result
    return result


@router.get("/output-file-info")
async def get_output_file_info(path: str):
    """Get file metadata without returning frame payloads."""
    target = (OUTPUT_DIR / path).resolve()
    if not str(target).startswith(str(OUTPUT_DIR)):
        raise HTTPException(400, "????")
    if not target.exists():
        raise HTTPException(404, "?????")
    
    size = target.stat().st_size
    
    if target.suffix.lower() != '.json':
        # CSV 鏂囦欢锛氳绠楄鏁?
        line_count = 0
        with open(target, 'r', encoding='utf-8') as f:
            for _ in f:
                line_count += 1
        return {
            "path": path,
            "size": size,
            "type": "csv",
            "total_lines": line_count,
            "total_frames": 0,
        }
    
    try:
        metadata = _load_replay_metadata(target)
        return {
            "path": path,
            "size": size,
            "type": "json",
            "total_frames": metadata["total_frames"],
            "config": metadata["config"],
            "finished_vehicles_count": metadata["finished_vehicles_count"],
            "anomaly_count": metadata["anomaly_count"],
            "etcGates": metadata["etcGates"],
            "pathGeometry": metadata["pathGeometry"],
        }
    except Exception as e:
        logger.error(f"瑙ｆ瀽鏂囦欢淇℃伅澶辫触: {e}")
        raise HTTPException(500, f"瑙ｆ瀽澶辫触: {e}")


@router.get("/output-file-chunk")
async def get_output_file_chunk(path: str, offset: int = 0, limit: int = 500):
    """Read frame chunks from a large output file."""










    target = (OUTPUT_DIR / path).resolve()
    if not str(target).startswith(str(OUTPUT_DIR)):
        raise HTTPException(400, "????")
    if not target.exists():
        raise HTTPException(404, "?????")
    
    limit = min(limit, 2000)  # 纭笂闄?
    
    if target.suffix.lower() == '.csv':
        # CSV 鍒嗗潡璇诲彇
        lines = []
        headers = None
        current_line = 0
        with open(target, 'r', encoding='utf-8') as f:
            for line in f:
                if current_line == 0:
                    headers = line.strip()
                elif current_line > offset and current_line <= offset + limit:
                    lines.append(line.strip())
                elif current_line > offset + limit:
                    break
                current_line += 1
        
        total_lines = current_line
        csv_text = headers + '\n' + '\n'.join(lines) if headers else '\n'.join(lines)
        return {
            "type": "csv",
            "data": csv_text,
            "offset": offset,
            "limit": limit,
            "total_lines": total_lines,
            "has_more": offset + limit < total_lines,
        }
    
    try:
        cache = _get_frames_for_file(target)
        frames = cache['frames']
        total = cache['total_frames']
        
        chunk = frames[offset:offset + limit]
        
        result = {
            "type": "json",
            "frames": chunk,
            "config": cache['config'] if offset == 0 else None,  # 浠呴娆¤繑鍥?config
            "etcGates": cache['etcGates'] if offset == 0 else None,
            "pathGeometry": cache['pathGeometry'] if offset == 0 else None,
            "offset": offset,
            "limit": limit,
            "total_frames": total,
            "has_more": offset + limit < total,
        }
        return result
    except Exception as e:
        logger.error(f"鍒嗗潡璇诲彇澶辫触: {e}")
        raise HTTPException(500, f"璇诲彇澶辫触: {e}")


# ============================================
# 浠跨湡璁板綍闂ㄦ灦淇℃伅鎻愬彇
# ============================================

@router.get("/simulation-gates")
async def get_simulation_gates(path: str):
    """Extract gate information from a simulation record."""








    target_dir = (OUTPUT_DIR / path).resolve()
    if not str(target_dir).startswith(str(OUTPUT_DIR)):
        raise HTTPException(400, "????")
    
    data_file = target_dir / "data.json"
    if not data_file.exists():
        raise HTTPException(404, f"?????????: {path}/data.json")
    
    try:
        with open(data_file, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError:
        raise HTTPException(500, "??????????????? JSON")
    
    # 鎻愬彇闂ㄦ灦淇℃伅
    raw_gates = data.get("etcGates", [])
    config = data.get("config", {})
    
    gates = []
    for i, gate in enumerate(raw_gates):
        position_m = gate.get("position", 0)
        position_km = round(position_m / 1000.0, 3)
        segment = gate.get("segment", i + 1)
        gates.append({
            "id": f"G{segment:02d}",
            "position_m": position_m,
            "position_km": position_km,
            "segment": segment,
        })
    
    # 濡傛灉 JSON 涓病鏈?etcGates锛屽皾璇曚粠 config 鍥為€€璁＄畻
    if not gates and config:
        road_length_km = config.get("custom_road_length_km") or config.get("road_length_km") or 20.0
        segment_length_km = config.get("segment_length_km") or 2.0
        custom_gantries = config.get("custom_gantry_positions", [])
        
        if custom_gantries:
            for idx, g_km in enumerate(custom_gantries):
                gates.append({
                    "id": f"G{idx + 1:02d}",
                    "position_m": round(float(g_km) * 1000),
                    "position_km": round(float(g_km), 3),
                    "segment": idx + 1,
                })
        else:
            pos_km = float(segment_length_km)
            seg = 1
            while pos_km < float(road_length_km):
                gates.append({
                    "id": f"G{seg:02d}",
                    "position_m": round(pos_km * 1000),
                    "position_km": round(pos_km, 3),
                    "segment": seg,
                })
                pos_km += float(segment_length_km)
                seg += 1
    
    # 鎻愬彇绮剧畝鐨?config 鎽樿
    config_summary = {}
    if config:
        for key in ["road_length_km", "custom_road_length_km", "segment_length_km",
                     "num_lanes", "total_vehicles", "simulation_time", "max_simulation_time"]:
            if key in config:
                config_summary[key] = config[key]
    
    return {
        "gates": gates,
        "config": config_summary,
        "run_dir": path,
    }


# ============================================
# 鑴氭湰绠＄悊
# ============================================

@router.get("/scripts/tree")
async def get_scripts_tree():
    """Get the scripts directory tree."""
    SCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
    tree = _scan_tree(SCRIPTS_DIR)
    return {"dir": str(SCRIPTS_DIR), "tree": tree}


@router.get("/scripts/list")
async def list_scripts():
    """List Python scripts."""
    SCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
    files = _scan_files(SCRIPTS_DIR, extensions={".py"})
    return {"dir": str(SCRIPTS_DIR), "files": files}


@router.get("/scripts/read")
async def read_script(path: str):
    """Read a script file."""
    target = (SCRIPTS_DIR / path).resolve()
    if not str(target).startswith(str(SCRIPTS_DIR)):
        raise HTTPException(400, "????")
    if not target.exists():
        raise HTTPException(404, "?????")
    return {"path": path, "content": target.read_text(encoding="utf-8")}


class SaveScriptRequest(BaseModel):
    path: str
    content: str


@router.post("/scripts/save")
async def save_script(req: SaveScriptRequest):
    """Save a script file."""
    target = (SCRIPTS_DIR / req.path).resolve()
    if not str(target).startswith(str(SCRIPTS_DIR)):
        raise HTTPException(400, "????")
    
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(req.content, encoding="utf-8")
    logger.info(f"Script saved: {target}")
    return {"status": "ok", "path": str(target)}


class RunScriptRequest(BaseModel):
    code: str
    timeout: int = 10
    sim_run_dir: Optional[str] = None  # 缁戝畾鐨勪豢鐪熻褰曠洰褰曪紙鐩稿璺緞锛?


@router.post("/scripts/run")
async def run_script(req: RunScriptRequest):
    """Run a sandboxed Python script."""





    # 纭畾鏁版嵁鐩綍
    if req.sim_run_dir:
        data_dir = (OUTPUT_DIR / req.sim_run_dir).resolve()
        if not str(data_dir).startswith(str(OUTPUT_DIR)) or not data_dir.exists():
            data_dir = OUTPUT_DIR
    else:
        data_dir = OUTPUT_DIR
    
    # 棰勮浠跨湡鏁版嵁锛堝鏋滄寚瀹氫簡 sim_run_dir锛?
    sim_data_json = "None"
    if req.sim_run_dir:
        data_json_path = data_dir / "data.json"
        if data_json_path.exists():
            try:
                raw = data_json_path.read_text(encoding="utf-8")
                # 楠岃瘉鏄悎娉?JSON
                json.loads(raw)
                sim_data_json = f'json.loads(r"""{raw}""")'
            except Exception:
                sim_data_json = "None"
    
    # 鏋勫缓瀹屾暣鑴氭湰锛堟敞鍏ュ伐鍏峰簱锛?
    full_script = f'''
import sys, os, json, csv
from pathlib import Path
from collections import Counter, defaultdict

# 棰勬敞鍏ヨ矾寰?
OUTPUT_DIR = r"{str(data_dir)}"

class ETCGateData:
    """ETC gate data reader."""
    
    def __init__(self, output_dir=OUTPUT_DIR):
        self.output_dir = Path(output_dir)
    
    def list_files(self, ext=".csv"):
        """List data files."""
        return [str(f.relative_to(self.output_dir)) for f in self.output_dir.rglob(f"*{{ext}}")]
    
    def read_csv(self, path):
        """Read a CSV file into dict rows."""
        full = self.output_dir / path
        if not full.exists():
            return []
        with open(full, "r", encoding="utf-8") as f:
            return list(csv.DictReader(f))
    
    def read_json(self, path):
        """Read a JSON file."""
        full = self.output_dir / path
        if not full.exists():
            return None
        with open(full, "r", encoding="utf-8") as f:
            return json.load(f)

# 瀹炰緥鍖栧伐鍏?
gate_data = ETCGateData()

# ===== 棰勫姞杞界殑浠跨湡鏁版嵁 =====
sim_data = {sim_data_json}
sim_config = sim_data.get("config", {{}}) if sim_data else None
sim_gates = sim_data.get("etcGates", []) if sim_data else None
sim_stats = sim_data.get("statistics", {{}}) if sim_data else None

# ===== 鐢ㄦ埛鑴氭湰寮€濮?=====
{req.code}
'''
    
    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False, encoding="utf-8") as tmp:
            tmp.write(full_script)
            tmp_path = tmp.name
        
        result = subprocess.run(
            [sys.executable if hasattr(sys, 'executable') else "python", tmp_path],
            capture_output=True,
            text=True,
            timeout=req.timeout,
            cwd=str(ETC_SIM_DIR),
        )
        
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": f"鈴?鑴氭湰鎵ц瓒呮椂 ({req.timeout}s)", "returncode": -1}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "returncode": -1}
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


