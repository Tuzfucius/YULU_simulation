/**
 * 日志控制台组件
 * Glassmorphism 风格
 */

import React, { useRef, useEffect, useState } from 'react';
import { useSimStore } from '../stores/simStore';
import { useI18nStore } from '../stores/i18nStore';

const LOG_LEVEL_STYLES = {
    INFO: {
        bg: 'hover:bg-[var(--accent-blue)]/10',
        text: 'text-[var(--text-primary)]',
        badge: 'text-[var(--accent-blue)] border border-[var(--accent-blue)]/30',
    },
    WARNING: {
        bg: 'bg-[var(--accent-red)]/10',
        text: 'text-[var(--accent-red)]',
        badge: 'text-[var(--accent-red)] border border-[var(--accent-red)]/30',
    },
    ERROR: {
        bg: 'bg-[var(--accent-red)]/20',
        text: 'text-[#ff8a80]',
        badge: 'bg-[var(--accent-red)] text-black font-bold',
    },
};

export const LogConsole: React.FC = () => {
    const { logs, clearLogs, isRunning } = useSimStore();
    const { t } = useI18nStore();
    const containerRef = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const [filter, setFilter] = useState<'ALL' | 'INFO' | 'WARNING' | 'ERROR'>('ALL');

    useEffect(() => {
        if (autoScroll && containerRef.current) {
            const element = containerRef.current;
            element.scrollTo({
                top: element.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, [logs, autoScroll, filter]);

    const formatTime = (timestamp: number) => {
        const minutes = Math.floor(timestamp / 60);
        const seconds = (timestamp % 60).toFixed(1);
        return `${minutes.toString().padStart(2, '0')}:${seconds.padStart(4, '0')}`;
    };

    const handleExport = () => {
        const text = logs.map(
            (log) => `[${formatTime(log.timestamp)}] [${log.level}] [${log.category}] ${log.message}`
        ).join('\n');
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `simulation_log.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const filteredLogs = filter === 'ALL' ? logs : logs.filter(log => log.level === filter);

    return (
        <div className="flex flex-col h-full w-full">
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-2 shrink-0">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--text-tertiary)] font-mono">
                        {filteredLogs.length} events
                    </span>
                    {isRunning && (
                        <span className="w-2 h-2 rounded-full bg-[var(--accent-green)] animate-pulse" title="Live" />
                    )}
                </div>

                <div className="flex items-center gap-1">
                    <div className="flex bg-[rgba(255,255,255,0.05)] rounded-lg p-0.5 mr-2">
                        {(['ALL', 'INFO', 'WARNING', 'ERROR'] as const).map((level) => (
                            <button
                                key={level}
                                onClick={() => setFilter(level)}
                                className={`px-2 py-0.5 text-[10px] rounded-md transition-all ${filter === level
                                    ? 'bg-[var(--accent-blue)] text-black font-medium'
                                    : 'text-[var(--text-secondary)] hover:text-white'
                                    }`}
                            >
                                {level}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => setAutoScroll(!autoScroll)}
                        className={`p-1.5 rounded-lg transition-colors ${autoScroll ? 'text-[var(--accent-blue)] bg-[var(--accent-blue)]/10' : 'text-[var(--text-tertiary)] hover:text-white'
                            }`}
                        title="Auto Scroll"
                    >
                        ⬇
                    </button>
                    <button onClick={handleExport} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-white hover:bg-[rgba(255,255,255,0.05)]" title="Export">
                        📥
                    </button>
                    <button onClick={clearLogs} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent-red)] hover:bg-[rgba(255,255,255,0.05)]" title="Clear">
                        🗑️
                    </button>
                </div>
            </div>

            {/* Log List */}
            <div
                ref={containerRef}
                className="flex-1 overflow-y-auto space-y-0.5 font-mono text-xs pr-2 scrollbar-thin"
            >
                {filteredLogs.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-[var(--text-muted)] opacity-50">
                        No logs available
                    </div>
                ) : (
                    filteredLogs.map((log, idx) => {
                        const styles = LOG_LEVEL_STYLES[log.level] || LOG_LEVEL_STYLES.INFO;
                        return (
                            <div
                                key={idx}
                                className={`flex items-start gap-2 px-2 py-1.5 rounded-lg transition-colors ${styles.bg}`}
                            >
                                <span className="text-[var(--text-muted)] shrink-0 min-w-[50px]">{formatTime(log.timestamp)}</span>
                                <span className={`px-1.5 py-px rounded text-[9px] uppercase tracking-wide shrink-0 ${styles.badge}`}>
                                    {log.level}
                                </span>
                                <span className="text-[var(--text-secondary)] opacity-70 shrink-0">[{log.category}]</span>
                                <span className={`${styles.text} break-all`}>{log.message}</span>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};
