import React, { useCallback, useEffect, useState } from 'react';
import { useI18nStore } from '../../stores/i18nStore';

interface GateInfo {
    id: string;
    position_m: number;
    position_km: number;
    segment: number;
}

interface SimulationRun {
    name: string;
    path: string;
}

export const DashboardPage: React.FC = () => {
    const { lang } = useI18nStore();
    const isEn = lang === 'en';
    const [runs, setRuns] = useState<SimulationRun[]>([]);
    const [selectedRun, setSelectedRun] = useState('');
    const [gates, setGates] = useState<GateInfo[]>([]);
    const [loading, setLoading] = useState(false);

    const loadRuns = useCallback(async () => {
        const response = await fetch('/api/files/output-files');
        if (!response.ok) return;
        const payload = await response.json();
        setRuns((payload.files || [])
            .filter((file: { name: string }) => file.name === 'data.json')
            .map((file: { path: string }) => ({
                name: file.path.replace(/[\\/]data\.json$/, ''),
                path: file.path.replace(/[\\/]data\.json$/, ''),
            })));
    }, []);

    const loadGates = useCallback(async (runPath: string) => {
        setSelectedRun(runPath);
        setGates([]);
        if (!runPath) return;
        setLoading(true);
        try {
            const response = await fetch(`/api/files/simulation-gates?path=${encodeURIComponent(runPath)}`);
            if (response.ok) setGates((await response.json()).gates || []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void loadRuns(); }, [loadRuns]);

    return (
        <main className="h-full overflow-auto bg-[var(--bg-base)] p-6">
            <section className="mx-auto max-w-5xl">
                <header className="mb-6 flex items-center justify-between gap-4">
                    <h1 className="text-xl font-semibold text-[var(--text-primary)]">
                        {isEn ? 'Simulation Records' : '仿真记录'}
                    </h1>
                    <button type="button" onClick={() => void loadRuns()} className="px-3 py-1.5 text-sm text-[var(--text-secondary)] border border-[var(--glass-border)] hover:text-[var(--text-primary)]">
                        {isEn ? 'Refresh' : '刷新'}
                    </button>
                </header>
                <label className="mb-6 block text-sm text-[var(--text-secondary)]">
                    {isEn ? 'Record' : '记录'}
                    <select value={selectedRun} onChange={(event) => void loadGates(event.target.value)} className="mt-2 block w-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2 text-[var(--text-primary)]">
                        <option value="">{isEn ? 'Select a simulation record' : '选择仿真记录'}</option>
                        {runs.map((run) => <option key={run.path} value={run.path}>{run.name}</option>)}
                    </select>
                </label>
                {loading && <p className="text-sm text-[var(--text-muted)]">{isEn ? 'Loading...' : '加载中...'}</p>}
                {!loading && selectedRun && (
                    <div className="overflow-hidden border border-[var(--glass-border)]">
                        {gates.map((gate) => (
                            <div key={gate.id} className="grid grid-cols-3 border-b border-[var(--glass-border)] px-4 py-3 last:border-b-0 text-sm">
                                <span className="font-mono text-[var(--accent-blue)]">{gate.id}</span>
                                <span>{gate.position_km} km</span>
                                <span className="text-[var(--text-secondary)]">{isEn ? `Segment ${gate.segment}` : `区段 ${gate.segment}`}</span>
                            </div>
                        ))}
                        {gates.length === 0 && <p className="px-4 py-6 text-sm text-[var(--text-muted)]">{isEn ? 'No gate data.' : '没有门架数据。'}</p>}
                    </div>
                )}
            </section>
        </main>
    );
};
