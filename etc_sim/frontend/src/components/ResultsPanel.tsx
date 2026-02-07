/**
 * 结果展示面板组件
 * Glassmorphism 风格
 */

import React from 'react';
import { useSimStore } from '../stores/simStore';
import { useI18nStore } from '../stores/i18nStore';

export const ResultsPanel: React.FC = () => {
    const { statistics, isComplete, isRunning, config, progress } = useSimStore();
    const { t } = useI18nStore();

    const handleExportCSV = () => {
        if (!statistics) return;
        // ... (export logic same as before) ...
        const csvContent = [
            'Metric,Value,Unit',
            `Simulation Time,${statistics.simulationTime.toFixed(1)},seconds`,
            `Total Vehicles,${statistics.totalVehicles},vehicles`,
            `Completed Vehicles,${statistics.completedVehicles},vehicles`,
            `Average Speed,${statistics.avgSpeed.toFixed(2)},km/h`,
            `Average Travel Time,${statistics.avgTravelTime.toFixed(2)},seconds`,
            `Anomaly Events,${statistics.totalAnomalies},events`,
            `Affected Vehicles,${statistics.affectedByAnomaly},vehicles`,
            `Lane Changes,${statistics.totalLaneChanges},changes`,
            `Max Congestion Length,${statistics.maxCongestionLength.toFixed(2)},meters`,
        ].join('\n');

        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `simulation_results.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // 显示条件：运行中或已完成
    const showResults = isRunning || isComplete || statistics;

    if (!showResults) {
        return (
            <div className="flex flex-col items-center justify-center p-8 opacity-50 space-y-4">
                <div className="text-4xl">📊</div>
                <div className="text-[var(--text-secondary)] text-sm">Start simulation to see real-time statistics</div>
            </div>
        );
    }

    const data = statistics || {
        simulationTime: progress.currentTime,
        totalVehicles: config.totalVehicles,
        completedVehicles: progress.completedVehicles,
        avgSpeed: 0,
        avgTravelTime: 0,
        totalAnomalies: progress.activeAnomalies,
        affectedByAnomaly: 0,
        totalLaneChanges: 0,
        maxCongestionLength: 0,
    };

    const statItems = [
        { label: t('simulation.time'), value: `${data.simulationTime.toFixed(0)}s`, icon: '⏱️', color: 'text-[var(--accent-blue)]' },
        { label: t('charts.completed'), value: `${data.completedVehicles}`, icon: '✅', color: 'text-[var(--accent-green)]' },
        { label: t('charts.avgSpeed'), value: `${data.avgSpeed.toFixed(1)} km/h`, icon: '🚀', color: 'text-[var(--accent-purple)]' },
        { label: 'Events', value: `${data.totalAnomalies}`, icon: '⚠️', color: 'text-[var(--accent-red)]' },
    ];

    return (
        <div className="w-full">
            {/* Header / Actions */}
            <div className="flex items-center justify-between mb-4">
                <div className="text-xs text-[var(--text-tertiary)] flex gap-4">
                    <span>Target: {config.totalVehicles}</span>
                    <span>Progress: {progress.progress.toFixed(1)}%</span>
                </div>
                {isComplete && (
                    <button
                        onClick={handleExportCSV}
                        className="glass-btn text-xs py-1.5 px-3 hover:bg-[var(--accent-green)]/20 hover:text-[var(--accent-green)]"
                    >
                        Export CSV
                    </button>
                )}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {statItems.map((item, idx) => (
                    <div
                        key={idx}
                        className="glass-panel rounded-xl p-3 flex flex-col items-center justify-center text-center hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                    >
                        <div className={`text-xl font-mono font-medium ${item.color} mb-1`}>{item.value}</div>
                        <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1 opacity-80">
                            <span>{item.icon}</span> {item.label}
                        </div>
                    </div>
                ))}
            </div>

            {/* Progress Bar for Visual Feedback when running */}
            {isRunning && (
                <div className="mt-4 h-1 bg-[rgba(255,255,255,0.1)] rounded-full overflow-hidden">
                    <div
                        className="h-full bg-[var(--accent-blue)] transition-all duration-300 shadow-[0_0_10px_var(--accent-blue)]"
                        style={{ width: `${progress.progress}%` }}
                    />
                </div>
            )}
        </div>
    );
};
