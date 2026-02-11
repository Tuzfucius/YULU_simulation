/**
 * 节点属性编辑面板 — 右侧面板，编辑选中节点的参数
 */

import React from 'react';
import { useWorkflowStore } from '../../stores/workflowStore';

export function NodePropertiesPanel() {
    const { nodes, selectedNodeId, updateNodeData, removeNode } = useWorkflowStore();
    const selectedNode = nodes.find(n => n.id === selectedNodeId);

    if (!selectedNode) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <span className="text-3xl mb-3 opacity-40">🖱️</span>
                <p className="text-sm text-[var(--text-muted)]">点击节点查看属性</p>
            </div>
        );
    }

    const { data } = selectedNode;

    const handleParamChange = (key: string, value: string) => {
        const params = { ...data.params };
        // 尝试转数字
        const num = Number(value);
        if (!isNaN(num) && value.trim() !== '') {
            params[key] = num;
        } else {
            params[key] = value;
        }
        updateNodeData(selectedNode.id, { params });
    };

    const handleGateIdChange = (value: string) => {
        updateNodeData(selectedNode.id, { gateId: value });
    };

    return (
        <div className="flex flex-col h-full">
            {/* 标题 */}
            <div className="p-3 border-b border-[var(--glass-border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-lg">{data.icon}</span>
                    <div>
                        <h4 className="text-sm font-semibold text-[var(--text-primary)]">{data.label}</h4>
                        <p className="text-[10px] text-[var(--text-muted)]">{data.subType}</p>
                    </div>
                </div>
                <button
                    onClick={() => removeNode(selectedNode.id)}
                    className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                >
                    删除
                </button>
            </div>

            {/* 参数编辑 */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
                {/* 门架 ID */}
                {data.category === 'condition' && (
                    <div>
                        <label className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">
                            门架 ID
                        </label>
                        <input
                            type="text"
                            value={data.gateId || '*'}
                            onChange={e => handleGateIdChange(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs rounded-md
                bg-[var(--glass-bg)] border border-[var(--glass-border)]
                text-[var(--text-primary)] outline-none
                focus:border-[var(--accent-blue)] transition-colors"
                            placeholder="* 表示所有门架"
                        />
                    </div>
                )}

                {/* 参数列表 */}
                {Object.entries(data.params || {}).map(([key, val]) => (
                    <div key={key}>
                        <label className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">
                            {key}
                        </label>
                        {Array.isArray(val) ? (
                            <input
                                type="text"
                                value={val.join(', ')}
                                onChange={e => {
                                    const params = { ...data.params };
                                    params[key] = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                                    updateNodeData(selectedNode.id, { params });
                                }}
                                className="w-full px-2.5 py-1.5 text-xs rounded-md
                  bg-[var(--glass-bg)] border border-[var(--glass-border)]
                  text-[var(--text-primary)] outline-none
                  focus:border-[var(--accent-blue)] transition-colors"
                                placeholder="逗号分隔"
                            />
                        ) : (
                            <input
                                type="text"
                                value={String(val)}
                                onChange={e => handleParamChange(key, e.target.value)}
                                className="w-full px-2.5 py-1.5 text-xs rounded-md
                  bg-[var(--glass-bg)] border border-[var(--glass-border)]
                  text-[var(--text-primary)] outline-none
                  focus:border-[var(--accent-blue)] transition-colors"
                            />
                        )}
                    </div>
                ))}

                {Object.keys(data.params || {}).length === 0 && data.category !== 'logic' && (
                    <p className="text-xs text-[var(--text-muted)] text-center py-4">
                        此节点无可配置参数
                    </p>
                )}
            </div>
        </div>
    );
}
