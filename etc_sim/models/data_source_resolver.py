"""
数据源解析器模块
将前端工作流编辑器导出的 data_source 配置解析为可执行的数据查询逻辑，
在规则评估前从 AlertContext 中提取具体数据子集。

设计理念：
- 每种 data_source type 对应一个解析方法
- 返回 ResolvedData: 包含提取的门架列表和数据快照
- AlertRule 在 evaluate 时先调用 resolver 获取作用域

使用示例:
    resolver = DataSourceResolver()
    resolved = resolver.resolve(
        {'type': 'etc_data', 'params': {'scope': 'single', 'gate_id': 'G04', 'metric': 'avg_speed'}},
        context
    )
    # resolved.target_gate_ids → ['G04']
    # resolved.data → {'G04': {'avg_speed': 85.2, ...}}
"""

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional
from .alert_context import AlertContext

logger = logging.getLogger(__name__)


@dataclass
class ResolvedData:
    """数据源解析结果"""
    source_type: str = ''
    # 解析出的目标门架 ID 集合（空 = 全部）
    target_gate_ids: List[str] = field(default_factory=list)
    # 解析出的目标区间 ID 集合
    target_segment_ids: List[int] = field(default_factory=list)
    # 提取的数据快照
    data: Dict[str, Any] = field(default_factory=dict)
    # 推荐注入到条件的 gate_id（取首个，或 '*'）
    resolved_gate_id: str = '*'


class DataSourceResolver:
    """数据源解析器

    将工作流导出的 data_source 配置解析为具体的数据子集。
    """

    def resolve(self, source_config: Dict[str, Any],
                context: AlertContext) -> ResolvedData:
        """解析数据源配置

        Args:
            source_config: {'type': str, 'params': dict}
            context: 当前预警上下文

        Returns:
            ResolvedData 包含提取的门架/区间/数据
        """
        src_type = source_config.get('type', '')
        params = source_config.get('params', {})

        handler = getattr(self, f'_resolve_{src_type}', None)
        if handler:
            return handler(params, context)

        logger.warning(f"未知数据源类型: {src_type}，回退为全局")
        return ResolvedData(source_type=src_type)

    # ────────── 各数据源处理方法 ──────────

    def _resolve_etc_data(self, params: dict, ctx: AlertContext) -> ResolvedData:
        """ETC 门架数据"""
        scope = params.get('scope', 'all')
        metric = params.get('metric', 'avg_speed')

        if scope == 'single':
            gate_id = str(params.get('gate_id', 'G04'))
            gate_stats = {gate_id: ctx.gate_stats.get(gate_id)} if gate_id in ctx.gate_stats else {}
            return ResolvedData(
                source_type='etc_data',
                target_gate_ids=[gate_id],
                data=self._extract_metric(gate_stats, metric),
                resolved_gate_id=gate_id,
            )
        elif scope == 'range':
            from_id = str(params.get('gate_from', 'G02'))
            to_id = str(params.get('gate_to', 'G08'))
            gate_stats = ctx.get_gates_in_range(from_id, to_id)
            gate_ids = list(gate_stats.keys())
            return ResolvedData(
                source_type='etc_data',
                target_gate_ids=gate_ids,
                data=self._extract_metric(gate_stats, metric),
                resolved_gate_id=gate_ids[0] if gate_ids else '*',
            )
        else:  # 'all'
            return ResolvedData(
                source_type='etc_data',
                target_gate_ids=list(ctx.gate_stats.keys()),
                data=self._extract_metric(ctx.gate_stats, metric),
            )

    def _resolve_vehicle_data(self, params: dict, ctx: AlertContext) -> ResolvedData:
        """车辆状态数据"""
        scope = params.get('scope', 'all')
        metric = params.get('metric', 'speed')

        if scope == 'segment':
            seg_id = int(params.get('segment_id', 0))
            vehicles = ctx.get_vehicles_in_segment(seg_id)
            return ResolvedData(
                source_type='vehicle_data',
                target_segment_ids=[seg_id],
                data={'vehicles': vehicles, 'count': len(vehicles)},
            )
        elif scope == 'radius':
            center = float(params.get('center_km', 5.0))
            radius = float(params.get('radius_km', 1.0))
            vehicles = ctx.get_vehicles_in_radius(center, radius)
            return ResolvedData(
                source_type='vehicle_data',
                data={'vehicles': vehicles, 'count': len(vehicles),
                      'center_km': center, 'radius_km': radius},
            )
        else:  # 'all'
            return ResolvedData(
                source_type='vehicle_data',
                data={'vehicles': dict(ctx.vehicle_speeds), 'count': len(ctx.vehicle_speeds)},
            )

    def _resolve_env_data(self, params: dict, ctx: AlertContext) -> ResolvedData:
        """环境数据"""
        metric = params.get('metric', 'weather_type')
        data: Dict[str, Any] = {}
        if metric == 'weather_type':
            data['weather_type'] = ctx.weather_type
        elif metric == 'noise_stats':
            data['noise_stats'] = ctx.noise_stats
        return ResolvedData(source_type='env_data', data=data)

    def _resolve_history_data(self, params: dict, ctx: AlertContext) -> ResolvedData:
        """历史预警数据"""
        lookback = float(params.get('lookback_s', 300))
        severity = params.get('severity_filter', 'all')

        events = [
            e for e in ctx.recent_alert_events
            if ctx.current_time - e.timestamp <= lookback
        ]
        if severity != 'all':
            events = [e for e in events if e.severity == severity]

        return ResolvedData(
            source_type='history_data',
            data={'events': events, 'count': len(events)},
        )

    def _resolve_aggregation_data(self, params: dict, ctx: AlertContext) -> ResolvedData:
        """统计聚合"""
        scope = params.get('scope', 'all')
        gate_id = str(params.get('gate_id', 'G04'))
        source_metric = params.get('source_metric', 'avg_speed')
        method = params.get('method', 'mean')

        # 收集值
        if scope == 'single' and gate_id in ctx.gate_stats:
            stats = {gate_id: ctx.gate_stats[gate_id]}
        else:
            stats = ctx.gate_stats

        values = []
        for gid, stat in stats.items():
            v = getattr(stat, source_metric, None) if hasattr(stat, source_metric) else None
            if v is not None and isinstance(v, (int, float)):
                values.append(v)

        result = self._aggregate(values, method)
        resolved_id = gate_id if scope == 'single' else '*'

        return ResolvedData(
            source_type='aggregation_data',
            target_gate_ids=[gate_id] if scope == 'single' else list(stats.keys()),
            data={'aggregated_value': result, 'method': method, 'sample_count': len(values)},
            resolved_gate_id=resolved_id,
        )

    def _resolve_gate_corr_data(self, params: dict, ctx: AlertContext) -> ResolvedData:
        """门架关联"""
        up = str(params.get('upstream_gate', 'G04'))
        down = str(params.get('downstream_gate', 'G06'))
        metric = params.get('metric', 'flow_diff')

        up_stat = ctx.gate_stats.get(up)
        down_stat = ctx.gate_stats.get(down)

        data: Dict[str, Any] = {
            'upstream_gate': up,
            'downstream_gate': down,
            'metric': metric,
        }

        if up_stat and down_stat:
            if metric == 'flow_diff':
                up_flow = getattr(up_stat, 'flow_rate', 0)
                down_flow = getattr(down_stat, 'flow_rate', 0)
                data['value'] = up_flow - down_flow
                data['ratio'] = down_flow / up_flow if up_flow > 0 else 0
            elif metric == 'speed_diff':
                data['value'] = getattr(up_stat, 'avg_speed', 0) - getattr(down_stat, 'avg_speed', 0)
            elif metric == 'travel_time_ratio':
                up_tt = getattr(up_stat, 'avg_travel_time', 1)
                down_tt = getattr(down_stat, 'avg_travel_time', 1)
                data['value'] = down_tt / up_tt if up_tt > 0 else 0

        return ResolvedData(
            source_type='gate_corr_data',
            target_gate_ids=[up, down],
            data=data,
            resolved_gate_id=up,
        )

    def _resolve_realtime_calc(self, params: dict, ctx: AlertContext) -> ResolvedData:
        """实时计算（简化 — 当前时间快照的指标）"""
        scope = params.get('scope', 'all')
        gate_id = str(params.get('gate_id', 'G04'))
        target = params.get('target', 'avg_speed')

        if scope == 'single' and gate_id in ctx.gate_stats:
            stats = {gate_id: ctx.gate_stats[gate_id]}
            resolved_id = gate_id
        else:
            stats = ctx.gate_stats
            resolved_id = '*'

        values = []
        for stat in stats.values():
            v = getattr(stat, target, None) if hasattr(stat, target) else None
            if v is not None and isinstance(v, (int, float)):
                values.append(v)

        current_value = sum(values) / len(values) if values else 0.0

        return ResolvedData(
            source_type='realtime_calc',
            target_gate_ids=list(stats.keys()),
            data={'current_value': current_value, 'target': target, 'sample_count': len(values)},
            resolved_gate_id=resolved_id,
        )

    # ────────── 工具方法 ──────────

    @staticmethod
    def _extract_metric(gate_stats: dict, metric: str) -> dict:
        """从 gate_stats 中提取指定指标"""
        result = {}
        for gid, stat in gate_stats.items():
            if stat is None:
                continue
            val = getattr(stat, metric, None) if hasattr(stat, metric) else None
            result[gid] = {metric: val} if val is not None else {}
        return result

    @staticmethod
    def _aggregate(values: list, method: str) -> Optional[float]:
        """对值列表做聚合"""
        if not values:
            return None
        if method == 'mean':
            return sum(values) / len(values)
        elif method == 'max':
            return max(values)
        elif method == 'min':
            return min(values)
        elif method == 'std':
            mean = sum(values) / len(values)
            variance = sum((v - mean) ** 2 for v in values) / len(values)
            return variance ** 0.5
        elif method == 'count':
            return float(len(values))
        return None
