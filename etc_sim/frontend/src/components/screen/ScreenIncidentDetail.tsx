import type { ScreenAlertRecord } from './ScreenAlertList';
import type { ScreenGantry } from './ScreenMapStage';

type ScreenIncidentDetailProps = {
    gantry: ScreenGantry | null;
    alert: ScreenAlertRecord | null;
};

export function ScreenIncidentDetail({ gantry, alert }: ScreenIncidentDetailProps) {
    if (!gantry || !alert) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-cyan-200/65">
                选择一条告警后查看详情
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-amber-300/35 bg-[linear-gradient(135deg,rgba(102,38,14,0.7),rgba(63,17,17,0.22))] p-4">
                <div className="text-xs tracking-[0.24em] text-amber-200/75">事件详情</div>
                <div className="mt-2 text-2xl font-semibold text-amber-100">
                    {alert.title}
                </div>
                <div className="mt-2 text-sm text-amber-50/80">
                    事件定位到 {gantry.name || gantry.id}，已与地图主舞台联动。后续将继续接入真实异常时间窗、区间速度散点和轨迹热力层。
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-cyan-300/20 bg-[rgba(4,13,30,0.76)] p-3">
                    <div className="text-xs text-cyan-300/65">门架坐标</div>
                    <div className="mt-2 text-lg text-cyan-50">
                        {gantry.x.toFixed(0)} / {gantry.y.toFixed(0)}
                    </div>
                </div>
                <div className="rounded-xl border border-cyan-300/20 bg-[rgba(4,13,30,0.76)] p-3">
                    <div className="text-xs text-cyan-300/65">最近更新时间</div>
                    <div className="mt-2 text-lg text-cyan-50">{alert.timeLabel}</div>
                </div>
            </div>

            <div className="rounded-xl border border-cyan-300/20 bg-[rgba(4,13,30,0.76)] p-3">
                <div className="mb-2 text-xs text-cyan-300/65">联动信息</div>
                <ul className="space-y-2 text-sm text-cyan-50/80">
                    <li>定位对象：{gantry.name || gantry.id}</li>
                    <li>告警区域：{alert.locationLabel}</li>
                    <li>计划接入：异常时间窗、区间速度散点、轨迹热力层</li>
                </ul>
            </div>
        </div>
    );
}
