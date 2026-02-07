"""
分析 API
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional, Dict, Any
import math

router = APIRouter()


@router.get("/{simulation_id}/summary")
async def get_analysis_summary(simulation_id: str) -> dict:
    """获取仿真分析摘要"""
    # TODO: 从数据库获取实际数据
    return {
        "simulation_id": simulation_id,
        "statistics": {
            "total_vehicles": 1200,
            "completed_vehicles": 1185,
            "avg_speed": 78.5,
            "avg_travel_time": 462.3,
            "total_lane_changes": 2456,
            "anomaly_count": 24,
            "affected_vehicles": 312,
            "max_congestion_length": 580.0,
            "etc_detection_rate": 0.925,
            "ttc_violations": 8
        },
        "charts_available": [
            "speedHeatmap",
            "trajectory",
            "anomalyDistribution",
            "recoveryCurve",
            "laneChanges",
            "vehicleTypes",
            "laneDistribution",
            "safetyAnalysis",
            "delay",
            "fundamentalDiagram",
            "etcPerformance"
        ]
    }


@router.get("/{simulation_id}/charts/{chart_type}")
async def get_chart_data(
    simulation_id: str,
    chart_type: str,
    time_range: Optional[str] = Query(None, regex="^\\d+-\\d+$"),
    segments: Optional[List[int]] = Query(None)
) -> Dict[str, Any]:
    """获取图表数据"""
    valid_charts = [
        "speedHeatmap", "trajectory", "anomalyDistribution",
        "recoveryCurve", "laneChanges", "vehicleTypes",
        "laneDistribution", "safetyAnalysis", "delay",
        "fundamentalDiagram", "etcPerformance"
    ]
    
    if chart_type not in valid_charts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"无效的图表类型: {chart_type}"
        )
    
    # 返回模拟数据
    return {
        "chart_type": chart_type,
        "simulation_id": simulation_id,
        "data": generate_mock_chart_data(chart_type),
        "config": {
            "title": get_chart_title(chart_type),
            "x_label": get_chart_xlabel(chart_type),
            "y_label": get_chart_ylabel(chart_type)
        }
    }


@router.get("/{simulation_id}/statistics")
async def get_detailed_statistics(simulation_id: str) -> dict:
    """获取详细统计数据"""
    return {
        "simulation_id": simulation_id,
        "vehicle_distribution": {
            "CAR": {"count": 720, "percentage": 60.0},
            "TRUCK": {"count": 285, "percentage": 23.75},
            "BUS": {"count": 180, "percentage": 15.0}
        },
        "driver_style_distribution": {
            "aggressive": {"count": 240, "percentage": 20.0},
            "normal": {"count": 705, "percentage": 58.75},
            "conservative": {"count": 240, "percentage": 20.0}
        },
        "lane_usage": {
            "lane_0": {"count": 320, "percentage": 27.0},
            "lane_1": {"count": 290, "percentage": 24.5},
            "lane_2": {"count": 285, "percentage": 24.0},
            "lane_3": {"count": 290, "percentage": 24.5}
        },
        "anomaly_analysis": {
            "by_type": {
                "FULL_STOP": {"count": 8, "percentage": 33.3},
                "TEMP_FLUCTUATION": {"count": 10, "percentage": 41.7},
                "LONG_FLUCTUATION": {"count": 6, "percentage": 25.0}
            },
            "by_segment": {
                "0-2km": {"count": 5},
                "2-4km": {"count": 8},
                "4-6km": {"count": 6},
                "6-8km": {"count": 3},
                "8-10km": {"count": 2}
            }
        },
        "safety_metrics": {
            "ttc_violations": 8,
            "emergency_brakes": 23,
            "avg_ttc": 2.85,
            "min_ttc": 0.42
        }
    }


def generate_mock_chart_data(chart_type: str) -> dict:
    """生成模拟图表数据"""
    data_generators = {
        "speedHeatmap": lambda: {
            "segments": [f"{i}-{i+1}km" for i in range(10)],
            "time_points": [f"{i*5}min" for i in range(20)],
            "values": [[60 + (i + j) % 30 for j in range(20)] for i in range(10)]
        },
        "trajectory": lambda: {
            "vehicles": [
                {"id": i, "times": list(range(0, 600, 10)), "positions": [i * 15 + t * 0.5 for t in range(0, 600, 10)]}
                for i in range(50)
            ]
        },
        "anomalyDistribution": lambda: {
            "segments": [f"区间{i+1}" for i in range(10)],
            "type1": [8 - i for i in range(10)],
            "type2": [5 + (i % 3) for i in range(10)],
            "type3": [3 + (i % 4) for i in range(10)]
        },
        "laneChanges": lambda: {
            "time_intervals": [f"{i*5}-{(i+1)*5}min" for i in range(20)],
            "free_changes": [50 + (i % 10) * 5 for i in range(20)],
            "forced_changes": [10 + (i % 5) * 2 for i in range(20)]
        },
        "vehicleTypes": lambda: {
            "labels": ["轿车", "卡车", "客车"],
            "values": [720, 285, 180],
            "colors": ["#1f77b4", "#ff7f0e", "#2ca02c"]
        },
        "delay": lambda: {
            "segments": [f"区间{i+1}" for i in range(10)],
            "total_delay": [150 + i * 20 for i in range(10)],
            "avg_delay": [0.5 + i * 0.1 for i in range(10)]
        },
        "fundamentalDiagram": lambda: {
            "density": list(range(0, 80, 5)),
            "flow": [d * (80 - d) / 5 for d in range(0, 80, 5)],
            "speed": [80 - d * 0.8 for d in range(0, 80, 5)]
        }
    }
    
    generator = data_generators.get(chart_type)
    if generator:
        return generator()
    return {"message": f"No mock data for {chart_type}"}


def get_chart_title(chart_type: str) -> str:
    titles = {
        "speedHeatmap": "车速热力图",
        "trajectory": "时空轨迹图",
        "anomalyDistribution": "异常分布图",
        "recoveryCurve": "拥堵恢复曲线",
        "laneChanges": "换道分析",
        "vehicleTypes": "车辆类型分布",
        "laneDistribution": "车道分布",
        "safetyAnalysis": "安全分析",
        "delay": "累计延误",
        "fundamentalDiagram": "基本图",
        "etcPerformance": "ETC性能"
    }
    return titles.get(chart_type, chart_type)


def get_chart_xlabel(chart_type: str) -> str:
    xlabels = {
        "speedHeatmap": "时间",
        "trajectory": "时间 (秒)",
        "anomalyDistribution": "路段",
        "laneChanges": "时间",
        "vehicleTypes": "车辆类型",
        "delay": "路段区间",
        "fundamentalDiagram": "密度 (veh/km)"
    }
    return xlabels.get(chart_type, "")


def get_chart_ylabel(chart_type: str) -> str:
    ylabels = {
        "speedHeatmap": "路段",
        "trajectory": "位置 (km)",
        "anomalyDistribution": "异常事件数",
        "laneChanges": "换道次数",
        "vehicleTypes": "车辆数",
        "delay": "延误 (秒)",
        "fundamentalDiagram": "流量 (veh/h)"
    }
    return ylabels.get(chart_type, "")
