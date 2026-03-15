import ReactECharts from 'echarts-for-react';
import type { ScreenGantry } from './ScreenMapStage';

export type TrafficSeriesPoint = {
    time: number;
    avgSpeed: number;
    density: number;
    flow: number;
    vehicleCount: number;
};

export type GantryTrafficProfile = {
    series: TrafficSeriesPoint[];
    latestFlow: number | null;
    latestSpeed: number | null;
    latestDensity: number | null;
    peakFlow: number | null;
    segmentLabel: string;
};

type ScreenTrafficProfilePanelProps = {
    gantry: ScreenGantry | null;
    profile: GantryTrafficProfile | null;
};

function formatMetric(value: number | null, digits = 1) {
    if (value == null || !Number.isFinite(value)) {
        return '--';
    }
    return value.toFixed(digits);
}

export function ScreenTrafficProfilePanel({
    gantry,
    profile,
}: ScreenTrafficProfilePanelProps) {
    const chartOption = {
        backgroundColor: 'transparent',
        animation: false,
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(2, 10, 24, 0.96)',
            borderColor: 'rgba(110, 231, 255, 0.2)',
            textStyle: { color: '#e6fbff', fontSize: 11 },
        },
        legend: {
            top: 0,
            itemWidth: 10,
            itemHeight: 6,
            textStyle: { color: 'rgba(186, 230, 253, 0.7)', fontSize: 10 },
            data: ['流量', '速度'],
        },
        grid: {
            left: 8,
            right: 8,
            top: 28,
            bottom: 8,
            containLabel: true,
        },
        xAxis: {
            type: 'category',
            boundaryGap: false,
            data: profile?.series.map(item => `${Math.round(item.time)}s`) ?? [],
            axisLine: { lineStyle: { color: 'rgba(103, 232, 249, 0.14)' } },
            axisLabel: { color: 'rgba(186, 230, 253, 0.5)', fontSize: 10 },
        },
        yAxis: [
            {
                type: 'value',
                name: 'veh/h',
                nameTextStyle: { color: 'rgba(186, 230, 253, 0.52)', fontSize: 10 },
                axisLine: { show: false },
                splitLine: { lineStyle: { color: 'rgba(56, 189, 248, 0.08)' } },
                axisLabel: { color: 'rgba(186, 230, 253, 0.52)', fontSize: 10 },
            },
            {
                type: 'value',
                name: 'km/h',
                nameTextStyle: { color: 'rgba(186, 230, 253, 0.52)', fontSize: 10 },
                axisLine: { show: false },
                splitLine: { show: false },
                axisLabel: { color: 'rgba(186, 230, 253, 0.52)', fontSize: 10 },
            },
        ],
        series: [
            {
                name: '流量',
                type: 'line',
                smooth: true,
                showSymbol: false,
                yAxisIndex: 0,
                lineStyle: { color: '#22d3ee', width: 2 },
                areaStyle: { color: 'rgba(34, 211, 238, 0.12)' },
                data: profile?.series.map(item => Number(item.flow.toFixed(0))) ?? [],
            },
            {
                name: '速度',
                type: 'line',
                smooth: true,
                showSymbol: false,
                yAxisIndex: 1,
                lineStyle: { color: '#fbbf24', width: 2 },
                data: profile?.series.map(item => Number(item.avgSpeed.toFixed(1))) ?? [],
            },
        ],
    };

    return (
        <div className="pointer-events-none absolute right-4 top-16 z-20 w-[360px] rounded-3xl border border-cyan-300/15 bg-[rgba(2,10,24,0.92)] p-4 shadow-[0_24px_60px_rgba(2,12,24,0.45)] backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="text-xs uppercase tracking-[0.24em] text-cyan-300/65">Hover Insight</div>
                    <div className="mt-1 text-lg font-semibold text-cyan-50">
                        {gantry?.name || gantry?.id || '门架流量'}
                    </div>
                    <div className="mt-1 text-xs text-cyan-200/65">
                        {profile?.segmentLabel ?? '未匹配到区间时序数据'}
                    </div>
                </div>
                <div className="rounded-full border border-cyan-300/20 px-3 py-1 text-xs text-cyan-100/80">
                    悬浮联动
                </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-2xl border border-cyan-400/10 bg-[rgba(6,25,48,0.65)] px-3 py-2">
                    <div className="text-[11px] text-cyan-300/60">当前流量</div>
                    <div className="mt-1 text-cyan-50">{formatMetric(profile?.latestFlow ?? null, 0)}</div>
                </div>
                <div className="rounded-2xl border border-cyan-400/10 bg-[rgba(6,25,48,0.65)] px-3 py-2">
                    <div className="text-[11px] text-cyan-300/60">当前速度</div>
                    <div className="mt-1 text-cyan-50">{formatMetric(profile?.latestSpeed ?? null, 1)}</div>
                </div>
                <div className="rounded-2xl border border-cyan-400/10 bg-[rgba(6,25,48,0.65)] px-3 py-2">
                    <div className="text-[11px] text-cyan-300/60">峰值流量</div>
                    <div className="mt-1 text-cyan-50">{formatMetric(profile?.peakFlow ?? null, 0)}</div>
                </div>
            </div>

            <div className="mt-3 h-[188px] overflow-hidden rounded-2xl border border-cyan-400/10 bg-[rgba(6,25,48,0.6)] p-2">
                {profile && profile.series.length > 0 ? (
                    <ReactECharts option={chartOption} style={{ height: '100%', width: '100%' }} />
                ) : (
                    <div className="flex h-full items-center justify-center text-sm text-cyan-200/60">
                        当前门架没有可用的车流时序数据
                    </div>
                )}
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] text-cyan-200/55">
                <span>密度 {formatMetric(profile?.latestDensity ?? null, 1)} veh/km</span>
                <span>采样点 {profile?.series.length ?? 0} 个</span>
            </div>
        </div>
    );
}
