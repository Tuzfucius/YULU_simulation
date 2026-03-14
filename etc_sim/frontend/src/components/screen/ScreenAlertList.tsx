export type ScreenAlertRecord = {
    id: string;
    title: string;
    level: 'high' | 'medium' | 'low';
    timeLabel: string;
    locationLabel: string;
};

type ScreenAlertListProps = {
    alerts: ScreenAlertRecord[];
    selectedAlertId: string | null;
    onSelectAlert: (id: string) => void;
};

const levelStyleMap = {
    high: {
        badge: '高优先级',
        border: 'border-rose-400/45',
        background: 'bg-[linear-gradient(135deg,rgba(120,20,30,0.68),rgba(53,13,18,0.22))]',
        dot: 'bg-rose-400',
    },
    medium: {
        badge: '重点关注',
        border: 'border-amber-300/45',
        background: 'bg-[linear-gradient(135deg,rgba(102,38,14,0.68),rgba(63,17,17,0.22))]',
        dot: 'bg-amber-300',
    },
    low: {
        badge: '路网提示',
        border: 'border-cyan-300/30',
        background: 'bg-[rgba(4,13,30,0.72)]',
        dot: 'bg-cyan-300',
    },
} as const;

export function ScreenAlertList({
    alerts,
    selectedAlertId,
    onSelectAlert,
}: ScreenAlertListProps) {
    return (
        <div className="space-y-2 overflow-y-auto pr-1">
            {alerts.map(alert => {
                const levelStyle = levelStyleMap[alert.level];
                const active = alert.id === selectedAlertId;

                return (
                    <button
                        key={alert.id}
                        onClick={() => onSelectAlert(alert.id)}
                        className={`w-full rounded-xl border px-3 py-3 text-left transition ${levelStyle.border} ${levelStyle.background} ${
                            active ? 'shadow-[0_0_0_1px_rgba(186,230,253,0.35)]' : ''
                        }`}
                    >
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <span className={`h-2.5 w-2.5 rounded-full ${levelStyle.dot}`} />
                                <span className="text-sm font-medium text-cyan-50">{alert.title}</span>
                            </div>
                            <span className="text-[10px] tracking-[0.18em] text-cyan-100/65">
                                {levelStyle.badge}
                            </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-cyan-100/70">
                            <span>{alert.locationLabel}</span>
                            <span>{alert.timeLabel}</span>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
