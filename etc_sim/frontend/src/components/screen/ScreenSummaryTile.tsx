type ScreenSummaryTileProps = {
    label: string;
    value: string;
    hint?: string;
};

export function ScreenSummaryTile({ label, value, hint }: ScreenSummaryTileProps) {
    return (
        <div className="rounded-2xl border border-cyan-300/15 bg-[rgba(6,18,40,0.88)] px-4 py-3 shadow-[inset_0_1px_0_rgba(120,190,255,0.08)]">
            <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/60">{label}</div>
            <div className="mt-2 text-2xl font-semibold text-cyan-50">{value}</div>
            {hint ? <div className="mt-1 text-xs text-cyan-300/55">{hint}</div> : null}
        </div>
    );
}
