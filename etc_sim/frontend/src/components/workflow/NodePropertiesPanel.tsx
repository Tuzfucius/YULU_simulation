/**
 * 节点属性编辑面板 — 右侧面板，编辑选中节点的参数
 */

import React, { useMemo } from 'react';
import { useWorkflowStore } from '../../stores/workflowStore';
import { useSimStore } from '../../stores/simStore';
import type { LogicType, ParamFieldMeta } from '../../types/workflow';
import { DATA_SOURCE_FIELDS } from '../../types/workflow';

const LOGIC_OPTIONS: { value: LogicType; label: string }[] = [
    { value: 'AND', label: 'AND (全部满足)' },
    { value: 'OR', label: 'OR (任一满足)' },
    { value: 'NOT', label: 'NOT (取反)' },
    { value: 'GT', label: '> (大于)' },
    { value: 'LT', label: '< (小于)' },
    { value: 'EQ', label: '= (等于)' },
    { value: 'THRESHOLD', label: '⊕ (阈值判断)' },
];

const inputCls = `w-full px-2.5 py-1.5 text-xs rounded-md
    bg-[var(--glass-bg)] border border-[var(--glass-border)]
    text-[var(--text-primary)] outline-none
    focus:border-[var(--accent-blue)] transition-colors`;

export function NodePropertiesPanel() {
    const { nodes, selectedNodeId, updateNodeData, removeNode } = useWorkflowStore();
    const { config: simConfig } = useSimStore();

    // 动态生成门架列表
    const GATE_OPTIONS = useMemo(() => {
        if (simConfig.customGantryPositionsKm && simConfig.customGantryPositionsKm.length > 0) {
            return simConfig.customGantryPositionsKm.map((km, i) => {
                const id = `G${(i + 1).toString().padStart(2, '0')}`;
                return { value: id, label: `${id} (${km.toFixed(1)}km)` };
            });
        }
        // 默认按间隔生成
        const interval = simConfig.etcGateIntervalKm || 2;
        const length = simConfig.roadLengthKm || 20;
        const count = Math.floor(length / interval);
        return Array.from({ length: count }, (_, i) => {
            const km = (i + 1) * interval;
            const id = `G${km.toString().padStart(2, '0')}`;
            return { value: id, label: `${id} (${km}km)` };
        });
    }, [simConfig]);

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

    /** 检查 showWhen 条件是否满足 */
    const isFieldVisible = (field: ParamFieldMeta): boolean => {
        if (!field.showWhen) return true;
        const currentValue = String(data.params[field.showWhen.key] ?? '');
        return field.showWhen.value.includes(currentValue);
    };

    /** 渲染单个元数据驱动的字段 */
    const renderMetaField = (field: ParamFieldMeta) => {
        if (!isFieldVisible(field)) return null;

        return (
            <div key={field.key}>
                <label className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">
                    {field.label}
                </label>
                {field.type === 'select' && field.options ? (
                    <select
                        value={String(data.params[field.key] ?? '')}
                        onChange={e => handleParamChange(field.key, e.target.value)}
                        className={inputCls}
                    >
                        {field.options.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                ) : field.type === 'gate_id' ? (
                    <select
                        value={String(data.params[field.key] ?? 'G04')}
                        onChange={e => handleParamChange(field.key, e.target.value)}
                        className={inputCls}
                    >
                        {GATE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                ) : field.type === 'number' ? (
                    <input
                        type="number"
                        value={data.params[field.key] as number ?? 0}
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        onChange={e => handleParamChange(field.key, e.target.value)}
                        className={inputCls}
                    />
                ) : (
                    <input
                        type="text"
                        value={String(data.params[field.key] ?? '')}
                        onChange={e => handleParamChange(field.key, e.target.value)}
                        className={inputCls}
                    />
                )}
            </div>
        );
    };

    // 数据源节点的字段元数据
    const sourceFields = data.category === 'source' ? DATA_SOURCE_FIELDS[data.subType] : null;

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

                {/* ═══════ 数据源节点 — 元数据驱动表单 ═══════ */}
                {data.category === 'source' && sourceFields && (
                    <div className="space-y-3">
                        <div className="text-[11px] font-semibold text-[var(--accent-blue)] flex items-center gap-1.5 pb-1 border-b border-[var(--glass-border)]">
                            <span>📋</span> 数据源参数
                        </div>
                        {sourceFields.map(renderMetaField)}
                    </div>
                )}

                {/* ═══════ 逻辑节点 — 逻辑类型选择 ═══════ */}
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
                            className={inputCls}
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
                                className={inputCls}
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
                                className={inputCls}
                            >
                                <option value="&gt;">{'>'} 大于</option>
                                <option value="&lt;">{'<'} 小于</option>
                                <option value="&gt;=">{'≥'} 大于等于</option>
                                <option value="&lt;=">{'≤'} 小于等于</option>
                                <option value="==">{'=='} 等于</option>
                            </select>
                        </div>
                    </>
                )}

                {/* ═══════ 条件节点 — 门架 ID ═══════ */}
                {data.category === 'condition' && (
                    <div>
                        <label className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">
                            门架 ID
                        </label>
                        <select
                            value={String(data.gateId || '*')}
                            onChange={e => handleGateIdChange(e.target.value)}
                            className={inputCls}
                        >
                            <option value="*">* (所有门架 / 由数据源传播)</option>
                            {GATE_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        <p className="text-[10px] text-[var(--text-muted)] mt-1">
                            设为 * 时，将继承上游数据源的门架设置
                        </p>
                    </div>
                )}

                {/* ═══════ 条件/动作节点 — 通用参数列表 ═══════ */}
                {(data.category === 'condition' || data.category === 'action') &&
                    Object.entries(data.params || {}).map(([key, val]) => (
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
                                    className={inputCls}
                                    placeholder="逗号分隔"
                                />
                            ) : (
                                <input
                                    type="text"
                                    value={String(val)}
                                    onChange={e => handleParamChange(key, e.target.value)}
                                    className={inputCls}
                                />
                            )}
                        </div>
                    ))
                }

                {/* 逻辑节点 — 非阈值的通用参数 */}
                {data.category === 'logic' &&
                    Object.entries(data.params || {}).map(([key, val]) => {
                        if (key === 'threshold' || key === 'operator') return null;
                        return (
                            <div key={key}>
                                <label className="text-[11px] font-medium text-[var(--text-secondary)] block mb-1">
                                    {key}
                                </label>
                                <input
                                    type="text"
                                    value={String(val)}
                                    onChange={e => handleParamChange(key, e.target.value)}
                                    className={inputCls}
                                />
                            </div>
                        );
                    })
                }

                {Object.keys(data.params || {}).length === 0 && data.category !== 'logic' && data.category !== 'source' && (
                    <p className="text-xs text-[var(--text-muted)] text-center py-4">
                        此节点无可配置参数
                    </p>
                )}
            </div>
        </div>
    );
}
