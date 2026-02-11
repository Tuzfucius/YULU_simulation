/**
 * 工作流自定义节点组件
 * 使用 @xyflow/react Handle 实现可连接的拖拽节点
 */

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { WorkflowNodeData } from '../../types/workflow';

// 分类颜色映射
const CATEGORY_STYLES: Record<string, { bg: string; border: string; headerBg: string }> = {
    source: { bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.35)', headerBg: 'rgba(96,165,250,0.15)' },
    condition: { bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.35)', headerBg: 'rgba(249,115,22,0.15)' },
    logic: { bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.35)', headerBg: 'rgba(167,139,250,0.15)' },
    action: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.35)', headerBg: 'rgba(239,68,68,0.15)' },
};

const SEVERITY_COLORS: Record<string, string> = {
    low: '#22c55e',
    medium: '#f59e0b',
    high: '#ef4444',
    critical: '#dc2626',
};

function WorkflowNodeComponent({ data, selected }: NodeProps) {
    const nodeData = data as unknown as WorkflowNodeData;
    const style = CATEGORY_STYLES[nodeData.category] || CATEGORY_STYLES.condition;
    const isLogic = nodeData.category === 'logic';

    // 简化参数显示
    const paramEntries = Object.entries(nodeData.params || {}).slice(0, 3);

    return (
        <div
            className="workflow-node"
            style={{
                minWidth: isLogic ? 60 : 180,
                maxWidth: isLogic ? 80 : 240,
                background: style.bg,
                border: `1.5px solid ${selected ? nodeData.color : style.border}`,
                borderRadius: isLogic ? '50%' : '10px',
                boxShadow: selected
                    ? `0 0 16px ${nodeData.color}40, 0 2px 8px rgba(0,0,0,0.3)`
                    : '0 2px 8px rgba(0,0,0,0.2)',
                transition: 'box-shadow 0.2s, border-color 0.2s',
                overflow: 'hidden',
                cursor: 'grab',
            }}
        >
            {/* Input handle(s) */}
            {nodeData.category !== 'source' && (
                <Handle
                    type="target"
                    position={Position.Left}
                    style={{
                        width: 10,
                        height: 10,
                        background: nodeData.color,
                        border: `2px solid ${style.border}`,
                    }}
                />
            )}

            {isLogic ? (
                /* 逻辑节点 - 圆形 */
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 60,
                        height: 60,
                        fontSize: '18px',
                        fontWeight: 'bold',
                        color: nodeData.color,
                    }}
                >
                    {nodeData.logic || 'AND'}
                </div>
            ) : (
                <>
                    {/* 标题栏 */}
                    <div
                        style={{
                            padding: '6px 10px',
                            background: style.headerBg,
                            borderBottom: `1px solid ${style.border}`,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                        }}
                    >
                        <span style={{ fontSize: '14px' }}>{nodeData.icon}</span>
                        <span
                            style={{
                                fontSize: '12px',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}
                        >
                            {nodeData.label}
                        </span>
                    </div>

                    {/* 参数区 */}
                    {paramEntries.length > 0 && (
                        <div style={{ padding: '5px 10px' }}>
                            {paramEntries.map(([key, val]) => (
                                <div
                                    key={key}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        fontSize: '10px',
                                        color: 'var(--text-muted)',
                                        lineHeight: '16px',
                                    }}
                                >
                                    <span style={{ opacity: 0.7 }}>{key}</span>
                                    <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
                                        {Array.isArray(val) ? val.join(',') : String(val)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* 门架 ID / 严重度标签 */}
                    {(nodeData.gateId || nodeData.severity) && (
                        <div
                            style={{
                                padding: '3px 10px 5px',
                                display: 'flex',
                                gap: '4px',
                            }}
                        >
                            {nodeData.gateId && nodeData.gateId !== '*' && (
                                <span
                                    style={{
                                        fontSize: '9px',
                                        padding: '1px 5px',
                                        borderRadius: '3px',
                                        background: 'rgba(96,165,250,0.15)',
                                        color: '#60a5fa',
                                    }}
                                >
                                    {nodeData.gateId}
                                </span>
                            )}
                            {nodeData.severity && (
                                <span
                                    style={{
                                        fontSize: '9px',
                                        padding: '1px 5px',
                                        borderRadius: '3px',
                                        background: `${SEVERITY_COLORS[nodeData.severity] || '#888'}22`,
                                        color: SEVERITY_COLORS[nodeData.severity] || '#888',
                                    }}
                                >
                                    {nodeData.severity}
                                </span>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* Output handle(s) */}
            {nodeData.category !== 'action' && (
                <Handle
                    type="source"
                    position={Position.Right}
                    style={{
                        width: 10,
                        height: 10,
                        background: nodeData.color,
                        border: `2px solid ${style.border}`,
                    }}
                />
            )}
        </div>
    );
}

export const WorkflowNode = memo(WorkflowNodeComponent);
