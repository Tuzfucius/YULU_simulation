"""
辅助函数
"""


def kmh_to_ms(v: float) -> float:
    """公里/小时转米/秒"""
    return v / 3.6


def ms_to_kmh(v: float) -> float:
    """米/秒转公里/小时"""
    return v * 3.6


def calc_subplot_layout(num_segments: int, cols: int = 2):
    """计算子图布局"""
    rows = (num_segments + cols - 1) // cols
    return rows, cols


def format_time(seconds: float) -> str:
    """格式化时间"""
    if seconds < 60:
        return f"{seconds:.0f}秒"
    elif seconds < 3600:
        minutes = seconds / 60
        return f"{minutes:.1f}分钟"
    else:
        hours = seconds / 3600
        minutes = (seconds % 3600) / 60
        return f"{hours:.0f}小时{minutes:.0f}分钟"


def format_distance(meters: float) -> str:
    """格式化距离"""
    if meters < 1000:
        return f"{meters:.0f}米"
    else:
        return f"{meters/1000:.1f}公里"


def format_speed(ms_speed: float) -> str:
    """格式化速度"""
    return f"{ms_speed * 3.6:.1f}km/h"
