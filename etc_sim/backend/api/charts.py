"""
图表 API 路由
提供图表列表、获取、收藏、下载、生成功能
"""

from fastapi import APIRouter, HTTPException, Body, BackgroundTasks
from fastapi.responses import FileResponse
from pathlib import Path
from typing import List, Dict, Any
import shutil
import os
import json
import subprocess
import sys
from datetime import datetime

router = APIRouter()


# 图表目录配置
# 统一数据根
ETC_SIM_DIR = Path(__file__).resolve().parents[2]  # etc_sim/
OUTPUT_DIR = ETC_SIM_DIR / "data" / "charts_output"
CHARTS_DIR = OUTPUT_DIR / "charts"
FAVORITES_DIR = OUTPUT_DIR / "favorites"

# Global state for latest batch
LATEST_BATCH_DIR = None

# 确保目录存在
CHARTS_DIR.mkdir(parents=True, exist_ok=True)
FAVORITES_DIR.mkdir(parents=True, exist_ok=True)

# 图表元数据
CHART_METADATA = {
    "speed_profile": {"name": "车流画像", "description": "分区间的车辆速度-时间轨迹"},
    "anomaly_distribution": {"name": "异常分布", "description": "各区间异常事件堆叠柱状图"},
    "trajectory": {"name": "时空图", "description": "车辆位置-时间轨迹"},
    "speed_heatmap": {"name": "车速热力图", "description": "区间-时间的速度热力图"},
    "cumulative_delay": {"name": "累计延误", "description": "各区间总延误柱状图"},
    "recovery_curve": {"name": "异常恢复曲线", "description": "异常前后速度变化"},
    "lane_distribution": {"name": "车道分布", "description": "车道占用堆叠面积图"},
    "vehicle_type_distribution": {"name": "车辆类型", "description": "类型分布/速度/换道"},
    "trajectory_animation": {"name": "轨迹动画", "description": "GIF 动画"},
    "fundamental_diagram": {"name": "交通流基本图", "description": "q-k, v-k, q-v 散点图"},
    "lane_change_analysis": {"name": "换道分析", "description": "换道原因/风格/分布"},
    "congestion_propagation": {"name": "拥堵传播", "description": "交通状态时空演化"},
    "driver_style_impact": {"name": "驾驶风格", "description": "各风格速度对比"},
    "anomaly_timeline": {"name": "异常时间线", "description": "异常事件散点图"},
    "etc_performance": {"name": "ETC性能", "description": "响应时间/检测延迟"},
    "spatial_exclusivity": {"name": "空间排他性", "description": "Type1 影响范围"},
    "curve_analysis": {"name": "弯道分析", "description": "弯道曲率、事故位置与车速分布"},
}


def get_current_charts_dir() -> Path:
    """获取当前图表目录 (最新生成的批次或默认目录)"""
    global LATEST_BATCH_DIR
    if LATEST_BATCH_DIR and LATEST_BATCH_DIR.exists():
        return LATEST_BATCH_DIR
    
    # Try to find the latest folder in output if LATEST_BATCH_DIR is not set
    # (Optional auto-discovery could go here)
    
    return CHARTS_DIR


def get_chart_path(chart_id: str) -> Path:
    """获取图表文件路径"""
    current_dir = get_current_charts_dir()
    
    # 尝试 PNG 和 GIF 扩展名
    for ext in [".png", ".gif"]:
        path = current_dir / f"{chart_id}{ext}"
        if path.exists():
            return path
            
    # Fallback to default charts dir if not found in latest batch
    if current_dir != CHARTS_DIR:
        for ext in [".png", ".gif"]:
            path = CHARTS_DIR / f"{chart_id}{ext}"
            if path.exists():
                return path
                
    return None


def is_favorited(chart_id: str) -> bool:
    """检查图表是否已收藏"""
    for ext in [".png", ".gif"]:
        if (FAVORITES_DIR / f"{chart_id}{ext}").exists():
            return True
    return False


@router.post("/generate")
async def generate_charts(
    background_tasks: BackgroundTasks,
    data: Dict[str, Any] = Body(...)
):
    """
    接收仿真数据并生成图表 (调用独立进程)
    """
    global LATEST_BATCH_DIR
    
    # 1. 创建带时间戳的输出目录
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    batch_dir = OUTPUT_DIR / f"run_{timestamp}"
    batch_dir.mkdir(parents=True, exist_ok=True)
    
    # 2. 保存数据到 JSON
    data_file = batch_dir / "data.json"
    with open(data_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
        
    # 3. 更新最新批次目录
    LATEST_BATCH_DIR = batch_dir
    
    # 4. 调用绘图脚本 (subprocess)
    # Correct path to plotter.py
    script_path = ETC_SIM_DIR / "backend" / "plotter.py"

    # 尝试找到 low_numpy 环境的 python
    # 假设当前是 D:\Anaconda3\python.exe
    current_python = Path(sys.executable)
    possible_envs_paths = [
        # 标准 Anaconda/Miniconda envs 目录
        current_python.parent / "envs" / "low_numpy" / "python.exe",
        current_python.parent.parent / "envs" / "low_numpy" / "python.exe",
        # 常见路径
        Path("D:/Anaconda3/envs/low_numpy/python.exe"),
        Path("C:/Anaconda3/envs/low_numpy/python.exe"),
        Path(os.path.expanduser("~")) / "anaconda3" / "envs" / "low_numpy" / "python.exe",
        Path(os.path.expanduser("~")) / "miniconda3" / "envs" / "low_numpy" / "python.exe",
    ]
    
    target_python = sys.executable
    for p in possible_envs_paths:
        if p.exists():
            target_python = str(p)
            print(f"Found specific python env: {target_python}")
            break
        
    # 获取主题参数 (默认为 dark)
    theme = data.get("theme", "dark")
    
    cmd = [target_python, str(script_path), str(data_file), str(batch_dir), "--theme", theme]
    
    # Redirect output to file for debugging
    log_path = batch_dir / "launcher.log"
    with open(log_path, "w") as log_file:
        subprocess.Popen(cmd, stdout=log_file, stderr=log_file)
    
    print(f"Launching plotter: {' '.join(cmd)} > {log_path}")
    
    return {
        "status": "processing", 
        "message": "Chart generation started in background process",
        "batch_id": f"run_{timestamp}",
        "output_path": str(batch_dir)
    }


@router.get("")
async def list_charts():
    """获取所有图表列表"""
    charts = []
    current_dir = get_current_charts_dir()
    
    for chart_id, meta in CHART_METADATA.items():
        path = get_chart_path(chart_id)
        charts.append({
            "id": chart_id,
            "name": meta["name"],
            "description": meta["description"],
            "available": path is not None,
            "favorited": is_favorited(chart_id),
            "url": f"/api/charts/{chart_id}" if path else None,
            "source": "latest" if path and path.parent == current_dir else "archive"
        })
    return {"charts": charts, "batch_source": current_dir.name}


@router.get("/favorites")
async def list_favorites():
    """获取收藏列表"""
    favorites = []
    for chart_id, meta in CHART_METADATA.items():
        if is_favorited(chart_id):
            favorites.append({
                "id": chart_id,
                "name": meta["name"],
                "description": meta["description"],
                "url": f"/api/charts/{chart_id}",
            })
    return {"favorites": favorites}


@router.get("/{chart_id}")
async def get_chart(chart_id: str):
    """获取指定图表图片"""
    path = get_chart_path(chart_id)
    if not path:
        raise HTTPException(status_code=404, detail=f"Chart '{chart_id}' not found")
    
    media_type = "image/gif" if path.suffix == ".gif" else "image/png"
    return FileResponse(path, media_type=media_type)


@router.get("/{chart_id}/download")
async def download_chart(chart_id: str):
    """下载图表"""
    path = get_chart_path(chart_id)
    if not path:
        raise HTTPException(status_code=404, detail=f"Chart '{chart_id}' not found")
    
    return FileResponse(
        path,
        media_type="application/octet-stream",
        filename=path.name
    )


@router.post("/{chart_id}/favorite")
async def favorite_chart(chart_id: str):
    """收藏图表"""
    path = get_chart_path(chart_id)
    if not path:
        raise HTTPException(status_code=404, detail=f"Chart '{chart_id}' not found")
    
    dest = FAVORITES_DIR / path.name
    shutil.copy2(path, dest)
    return {"success": True, "message": f"Chart '{chart_id}' favorited"}


@router.delete("/{chart_id}/favorite")
async def unfavorite_chart(chart_id: str):
    """取消收藏"""
    for ext in [".png", ".gif"]:
        fav_path = FAVORITES_DIR / f"{chart_id}{ext}"
        if fav_path.exists():
            fav_path.unlink()
            return {"success": True, "message": f"Chart '{chart_id}' unfavorited"}
    
    raise HTTPException(status_code=404, detail=f"Chart '{chart_id}' not in favorites")

