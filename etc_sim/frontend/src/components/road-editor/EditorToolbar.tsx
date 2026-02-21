import React from 'react';
import { useI18nStore } from '../../stores/i18nStore';

interface EditorToolbarProps {
    mode: 'select' | 'pen' | 'gantry' | 'on_ramp' | 'off_ramp';
    setMode: (m: 'select' | 'pen' | 'gantry' | 'on_ramp' | 'off_ramp') => void;
    showGrid: boolean;
    setShowGrid: (v: boolean) => void;
    onClear: () => void;
    onUndo: () => void;
    onRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
}

export function EditorToolbar({
    mode, setMode, showGrid, setShowGrid, onClear, onUndo, onRedo, canUndo, canRedo
}: EditorToolbarProps) {
    const { t } = useI18nStore();

    const tools = [
        { id: 'select', icon: '👆', label: 'Select' },
        { id: 'pen', icon: '🖊️', label: 'Pen' },
        { id: 'gantry', icon: '⛩️', label: 'ETC' },
        { id: 'on_ramp', icon: '↘️', label: 'On-Ramp' },
        { id: 'off_ramp', icon: '↗️', label: 'Off-Ramp' },
    ] as const;

    return (
        <div className="flex items-center gap-4">
            {/* Tools Group */}
            <div className="flex bg-[rgba(255,255,255,0.05)] rounded-lg p-1 gap-1">
                {tools.map(tool => (
                    <button
                        key={tool.id}
                        onClick={() => setMode(tool.id)}
                        className={`p-2 rounded flex items-center gap-2 text-sm transition-all ${mode === tool.id
                            ? 'bg-[var(--accent-blue)] text-white shadow-lg'
                            : 'hover:bg-[rgba(255,255,255,0.1)] text-[var(--text-secondary)]'
                            }`}
                        title={tool.label}
                    >
                        <span>{tool.icon}</span>
                        <span className="hidden lg:inline">{tool.label}</span>
                    </button>
                ))}
            </div>

            <div className="w-px h-6 bg-[var(--glass-border)] mx-2" />

            {/* Actions Group */}
            <div className="flex gap-2">
                <button
                    onClick={() => setShowGrid(!showGrid)}
                    className={`p-2 rounded text-sm ${showGrid ? 'bg-[var(--accent-blue)]/20 text-[var(--accent-blue)]' : 'text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.1)]'}`}
                    title="Toggle Grid"
                >
                    ▦
                </button>

                <button
                    onClick={onUndo} disabled={!canUndo}
                    className="p-2 rounded text-sm text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.1)] disabled:opacity-30"
                    title="Undo"
                >
                    ↩
                </button>
                <button
                    onClick={onRedo} disabled={!canRedo}
                    className="p-2 rounded text-sm text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.1)] disabled:opacity-30"
                    title="Redo"
                >
                    ↪
                </button>

                <div className="w-px h-6 bg-[var(--glass-border)] mx-2" />

                <button
                    onClick={() => confirm('Clear all?') && onClear()}
                    className="p-2 rounded text-sm text-red-400 hover:bg-red-400/10"
                    title="Clear All"
                >
                    🗑️
                </button>
            </div>
        </div>
    );
}
