/**
 * 节点属性编辑面板 — 右侧面板，编辑选中节点的参数
 */


import { useWorkflowStore } from '../../stores/workflowStore';
import type { LogicType } from '../../types/workflow';

const LOGIC_OPTIONS: { value: LogicType; label: string }[] = [
    { value: 'AND', label: 'AND (全部满足)' },
    { value: 'OR', label: 'OR (任一满足)' },
    { value: 'NOT', label: 'NOT (取反)' },
    { value: 'GT', label: '> (大于)' },
    { value: 'LT', label: '< (小于)' },
    { value: 'EQ', label: '= (等于)' },
    { value: 'THRESHOLD', label: '⊕ (阈值判断)' },
];

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

                {/* 端口信息 */}
                {data.ports && data.ports.length > 0 && (
                    <div>
                        <label className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">
                            端口
                        </label>
                        <div className="flex flex-wrap gap-1">
                            {data.ports.map(port => (
                                <span
                                    key={port.id}
                                    className="text-[9px] px-1.5 py-0.5 rounded"
                                    style={{
                                        background: port.direction === 'input'
                                            ? 'rgba(96,165,250,0.12)' : 'rgba(34,197,94,0.12)',
                                        color: port.direction === 'input' ? '#60a5fa' : '#22c55e',
                                    }}
                                >
                                    {port.direction === 'input' ? '⬅' : '➡'} {port.label}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* 逻辑节点 — 逻辑类型选择 */}
                {data.category === 'logic' && (
                    <div>
                        <label className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">
                            逻辑类型
                        </label>
                        <select
                            value={data.logic || 'AND'}
                            onChange={e => updateNodeData(selectedNode.id, {
                                logic: e.target.value as LogicType,
                                label: LOGIC_OPTIONS.find(o => o.value === e.target.value)?.label.split(' ')[0] || e.target.value,
                            })}
                            className="w-full px-2.5 py-1.5 text-xs rounded-md
                bg-[var(--glass-bg)] border border-[var(--glass-border)]
                text-[var(--text-primary)] outline-none
                focus:border-[var(--accent-blue)] transition-colors"
                        >
                            {LOGIC_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* 阈值判断参数 */}
                {data.category === 'logic' && data.logic === 'THRESHOLD' && (
                    <>
                        <div>
                            <label className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">
                                阈值
                            </label>
                            <input
                                type="number"
                                value={typeof data.params.threshold === 'number' ? data.params.threshold : 0}
                                onChange={e => handleParamChange('threshold', e.target.value)}
                                className="w-full px-2.5 py-1.5 text-xs rounded-md
                    bg-[var(--glass-bg)] border border-[var(--glass-border)]
                    text-[var(--text-primary)] outline-none
                    focus:border-[var(--accent-blue)] transition-colors"
                            />
                        </div>
                        <div>
                            <label className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">
                                运算符
                            </label>
                            <select
                                value={String(data.params.operator || '>')}
                                onChange={e => {
                                    const params = { ...data.params, operator: e.target.value };
                                    updateNodeData(selectedNode.id, { params });
                                }}
                                className="w-full px-2.5 py-1.5 text-xs rounded-md
                    bg-[var(--glass-bg)] border border-[var(--glass-border)]
                    text-[var(--text-primary)] outline-none
                    focus:border-[var(--accent-blue)] transition-colors"
                            >
                                <option value=">">{'>'} 大于</option>
                                <option value="<">{'<'} 小于</option>
                                <option value=">=">{'>='} 大于等于</option>
                                <option value="<=">{'<='} 小于等于</option>
                                <option value="==">{'=='} 等于</option>
                            </select>
                        </div>
                    </>
                )}

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
                {Object.entries(data.params || {}).map(([key, val]) => {
                    // 跳过已在上面渲染的阈值参数
                    if (data.category === 'logic' && (key === 'threshold' || key === 'operator')) return null;
                    return (
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
                    );
                })}

                {Object.keys(data.params || {}).length === 0 && data.category !== 'logic' && (
                    <p className="text-xs text-[var(--text-muted)] text-center py-4">
                        此节点无可配置参数
                    </p>
                )}
            </div>
        </div>
    );
}
