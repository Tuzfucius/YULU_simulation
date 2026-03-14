type ScreenMetricCardProps = {
    label: string;
    value: string;
    unit: string;
};

export function ScreenMetricCard({ label, value, unit }: ScreenMetricCardProps) {
    return (
        <div className="screen-panel screen-kpi rounded-2xl px-4 py-3">
            <div className="screen-panel-title text-xs text-cyan-200/65">{label}</div>
            <div className="mt-2 flex items-end gap-2">
                <div className="screen-kpi-value text-3xl font-semibold">{value}</div>
                <div className="pb-1 text-xs uppercase tracking-[0.22em] text-cyan-300/70">{unit}</div>
            </div>
        </div>
    );
}
