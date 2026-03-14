type ScreenHeaderProps = {
    title: string;
    subtitle: string;
    selectedRoadFile: string;
    timestampLabel: string;
};

export function ScreenHeader({
    title,
    subtitle,
    selectedRoadFile,
    timestampLabel,
}: ScreenHeaderProps) {
    return (
        <header className="screen-header-bar px-6 py-4">
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">
                        {subtitle}
                    </div>
                    <h1 className="mt-1 text-3xl font-semibold tracking-[0.18em] text-cyan-200">
                        {title}
                    </h1>
                </div>
                <div className="flex items-center gap-4 text-sm text-cyan-100/85">
                    <div className="screen-chip rounded-full px-4 py-1.5">
                        {selectedRoadFile || '未选择路网'}
                    </div>
                    <div className="screen-chip rounded-full px-4 py-1.5">
                        {timestampLabel}
                    </div>
                </div>
            </div>
        </header>
    );
}
