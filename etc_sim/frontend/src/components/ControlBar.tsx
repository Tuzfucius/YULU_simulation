/**
 * 控制面板组件 (仅按钮)
 * Glassmorphism 风格
 */

import React from 'react';
import { useSimStore } from '../stores/simStore';
import { useI18nStore } from '../stores/i18nStore';

interface ControlBarProps {
    onStart: () => void;
    onPause: () => void;
    onResume: () => void;
    onStop: () => void;
    onReset: () => void;
}

export const ControlBar: React.FC<ControlBarProps> = ({
    onStart,
    onPause,
    onResume,
    onStop,
    onReset,
}) => {
    const { isRunning, isPaused, isComplete } = useSimStore();
    const { t } = useI18nStore();

    return (
        <div className="flex items-center gap-3">
            {/* Start / Resume */}
            {!isRunning && !isComplete && (
                <button
                    onClick={onStart}
                    className="glass-btn-primary px-6 py-2.5 shadow-[0_0_20px_rgba(168,199,250,0.2)]"
                >
                    <span className="text-lg">▶</span>
                    <span>{t('common.start')}</span>
                </button>
            )}

            {isRunning && !isPaused && (
                <button
                    onClick={onPause}
                    className="glass-btn hover:bg-[rgba(255,216,228,0.1)] hover:text-[var(--accent-red)] border border-[rgba(255,255,255,0.1)]"
                >
                    <span className="text-lg">⏸</span>
                    <span>{t('common.pause')}</span>
                </button>
            )}

            {isRunning && isPaused && (
                <button
                    onClick={onResume}
                    className="glass-btn-primary px-6 py-2.5"
                >
                    <span className="text-lg">▶</span>
                    <span>{t('common.resume')}</span>
                </button>
            )}

            {isRunning && (
                <button
                    onClick={onStop}
                    className="glass-btn hover:bg-[rgba(242,184,181,0.1)] hover:text-[var(--accent-red)]"
                >
                    <span className="text-lg">⏹</span>
                    <span>{t('common.stop')}</span>
                </button>
            )}

            {isComplete && (
                <button
                    onClick={onReset}
                    className="glass-btn hover:bg-[rgba(255,255,255,0.1)]"
                >
                    <span>🔄</span>
                    <span>{t('common.reset')}</span>
                </button>
            )}

            {/* Stop button is also available via reset when complete? No, Stop is for interrupting. Reset is for clearing. */}
            {/* If complete, we show Reset. */}
            {!isRunning && isComplete && (
                <div className="px-3 py-1 bg-[var(--accent-green)]/20 text-[var(--accent-green)] text-xs rounded-full border border-[var(--accent-green)]/30">
                    Simulation Complete
                </div>
            )}
        </div>
    );
};
