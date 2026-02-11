/**
 * 节点面板 — 左侧可拖拽节点列表
 */

import React from 'react';
import { NODE_TYPE_CONFIGS, useWorkflowStore } from '../../stores/workflowStore';
import type { NodeCategory, NodeTypeConfig } from '../../types/workflow';

const CATEGORY_LABELS: Record<NodeCategory, { label: string; icon: string }> = {
    source: { label: '数据源', icon: '📡' },
    condition: { label: '条件', icon: '⚙️' },
    logic: { label: '逻辑', icon: '🔀' },
    action: { label: '动作', icon: '🎯' },
};

const CATEGORY_ORDER: NodeCategory[] = ['source', 'condition', 'logic', 'action'];

export function NodePalette() {
    const addNode = useWorkflowStore(s => s.addNode);

    const grouped = CATEGORY_ORDER.map(cat => ({
        category: cat,
        ...CATEGORY_LABELS[cat],
        items: NODE_TYPE_CONFIGS.filter(c => c.category === cat),
    }));

    const onDragStart = (event: React.DragEvent, config: NodeTypeConfig) => {
        event.dataTransfer.setData('application/workflow-node', JSON.stringify(config));
        event.dataTransfer.effectAllowed = 'move';
    };

    return (
        <div className="flex flex-col h-full">
            <div className="p-3 border-b border-[var(--glass-border)]">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">节点面板</h3>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">拖拽节点到画布中</p>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-3 scrollbar-thin">
                {grouped.map(group => (
                    <div key={group.category}>
                        <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                            <span>{group.icon}</span>
                            <span>{group.label}</span>
                            <span className="text-[var(--text-muted)]">({group.items.length})</span>
                        </div>
                        <div className="space-y-1 mt-1">
                            {group.items.map(item => (
                                <div
                                    key={item.type}
                                    draggable
                                    onDragStart={(e) => onDragStart(e, item)}
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-grab
                    hover:bg-[rgba(255,255,255,0.05)] active:cursor-grabbing
                    border border-transparent hover:border-[var(--glass-border)]
                    transition-all select-none group"
                                    title={item.description}
                                >
                                    <span className="text-base shrink-0">{item.icon}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                                            {item.label}
                                        </div>
                                        <div className="text-[10px] text-[var(--text-muted)] truncate opacity-0 group-hover:opacity-100 transition-opacity">
                                            {item.description}
                                        </div>
                                    </div>
                                    <span
                                        className="w-2 h-2 rounded-full shrink-0"
                                        style={{ background: item.color }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
