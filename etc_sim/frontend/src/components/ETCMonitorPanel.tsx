/**
 * ETC 监控面板
 * 门架流量、异常警报、噪声统计 + 代码编辑器
 */

import React, { useState, useEffect } from 'react';
import { useSimStore } from '../stores/simStore';
import { useI18nStore } from '../stores/i18nStore';
import { ETCCodeEditor } from './ETCCodeEditor';

interface ETCStats {
    transactions_count: number;
    alerts_count: number;
    noise_stats: {
        missed_read_count: number;
        duplicate_read_count: number;
        delayed_upload_count: number;
        clock_drift_count: number;
        missed_read_rate_actual: number;
    };
    gate_stats: Record<string, {
        total_transactions: number;
        avg_speed: number;
    }>;
}

interface Alert {
    type: string;
    gate_id: string;
    timestamp: number;
    severity: string;
    description?: string;
}

export const ETCMonitorPanel: React.FC = () => {
    const { isComplete, simulationData } = useSimStore();
    const { t } = useI18nStore();
    const [stats, setStats] = useState<ETCStats | null>(null);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [activeTab, setActiveTab] = useState<'stats' | 'code'>('stats');

    useEffect(() => {
        if (isComplete && simulationData) {
            // 从仿真结果中提取 ETC 数据
            const etcData = simulationData.etc_detection;
            if (etcData) {
                setStats({
                    transactions_count: simulationData.statistics?.etc_transactions_count || 0,
                    alerts_count: simulationData.statistics?.etc_alerts_count || 0,
                    noise_stats: etcData.noise_statistics || {},
                    gate_stats: etcData.gate_stats || {}
                });
                setAlerts(etcData.alerts || []);
            }
        }
    }, [isComplete, simulationData]);

    return (
        <div className="flex flex-col h-full">
            {/* Tab 标签 */}
            <div className="flex border-b border-[var(--glass-border)]">
                <button
                    onClick={() => setActiveTab('stats')}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'stats'
                        ? 'border-b-2 border-[var(--accent-blue)] text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                >
                    📊 {t('config.etc.tabs.stats')}
                </button>
                <button
                    onClick={() => setActiveTab('code')}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'code'
                        ? 'border-b-2 border-[var(--accent-purple)] text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                >
                    💻 {t('config.etc.tabs.code')}
                </button>
            </div>

            {/* Tab 内容 */}
            <div className="flex-1 overflow-auto p-4">
                {activeTab === 'stats' ? (
                    // 统计数据 Tab
                    !isComplete ? (
                        <div className="text-center text-[var(--text-muted)]">
                            <p className="text-sm">{t('simulation.waitingForCompletion')}</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* 交易统计 */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 rounded-lg bg-gradient-to-br from-blue-500/10 to-blue-600/10 border border-blue-500/20">
                                    <p className="text-xs text-[var(--text-muted)]">{t('config.etc.stats.totalTransactions')}</p>
                                    <p className="text-xl font-bold text-blue-400">{stats?.transactions_count || 0}</p>
                                </div>
                                <div className="p-3 rounded-lg bg-gradient-to-br from-red-500/10 to-red-600/10 border border-red-500/20">
                                    <p className="text-xs text-[var(--text-muted)]">{t('config.etc.stats.alerts')}</p>
                                    <p className="text-xl font-bold text-red-400">{stats?.alerts_count || 0}</p>
                                </div>
                            </div>

                            {/* 噪声统计 */}
                            {stats?.noise_stats && (
                                <div className="p-3 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                                    <p className="text-xs text-[var(--text-muted)] mb-2">{t('config.etc.stats.noiseStats')}</p>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="flex justify-between">
                                            <span>{t('config.etc.stats.missedRead')}</span>
                                            <span className="text-yellow-400">
                                                {stats.noise_stats.missed_read_count}
                                                ({((stats.noise_stats.missed_read_rate_actual || 0) * 100).toFixed(1)}%)
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>{t('config.etc.stats.duplicateRead')}</span>
                                            <span className="text-orange-400">{stats.noise_stats.duplicate_read_count}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>{t('config.etc.stats.delayedUpload')}</span>
                                            <span className="text-purple-400">{stats.noise_stats.delayed_upload_count}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>{t('config.etc.stats.clockDrift')}</span>
                                            <span className="text-cyan-400">{stats.noise_stats.clock_drift_count}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 警报列表 */}
                            {alerts.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs text-[var(--text-muted)]">{t('config.etc.stats.recentAlerts')}</p>
                                    <div className="max-h-40 overflow-y-auto space-y-1">
                                        {alerts.slice(0, 5).map((alert, i) => (
                                            <div
                                                key={i}
                                                className={`
                                  p-2 rounded text-xs flex items-center gap-2
                                  ${alert.severity === 'high'
                                                        ? 'bg-red-500/10 border-l-2 border-red-500'
                                                        : 'bg-yellow-500/10 border-l-2 border-yellow-500'
                                                    }
                                `}
                                            >
                                                <span className="font-mono">{alert.gate_id}</span>
                                                <span className="text-[var(--text-muted)]">{alert.type}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 门架统计 */}
                            {stats?.gate_stats && Object.keys(stats.gate_stats).length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs text-[var(--text-muted)]">{t('config.etc.stats.gateTraffic')}</p>
                                    <div className="grid grid-cols-3 gap-2">
                                        {Object.entries(stats.gate_stats).slice(0, 6).map(([gateId, data]) => (
                                            <div key={gateId} className="p-2 rounded bg-[rgba(255,255,255,0.03)] text-center">
                                                <p className="text-xs font-mono text-[var(--text-muted)]">{gateId}</p>
                                                <p className="text-sm font-medium">{data.total_transactions}</p>
                                                <p className="text-xs text-green-400">{data.avg_speed?.toFixed(1)} km/h</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                ) : (
                    // 代码编辑器 Tab
                    <ETCCodeEditor />
                )}
            </div>
        </div>
    );
};
