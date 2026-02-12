/**
 * 工作流自定义节点组件
 * 使用 @xyflow/react Handle 实现多端口可连接的拖拽节点
 *
 * 端口规则：
 *  - 逻辑节点 (AND/OR/GT/LT/EQ): 2 个输入 + 1 个输出
 *  - 逻辑节点 (NOT/THRESHOLD):    1 个输入 + 1 个输出
 *  - 条件节点:                     1 个输入 + 1 个输出
 *  - 数据源节点:                   仅 1 个输出
 *  - 动作节点:                     仅 1 个输入
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { WorkflowNodeData, PortDefinition } from '../../types/workflow';

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

/** 渲染一个方向的所有端口 */
function PortHandles({
    ports,
    direction,
    color,
    borderColor,
    nodeHeight,
}: {
    ports: PortDefinition[];
    direction: 'input' | 'output';
    color: string;
    borderColor: string;
    nodeHeight: number;
}) {
    const filtered = ports.filter(p => p.direction === direction);
    if (filtered.length === 0) return null;

    return (
        <>
            {filtered.map((port) => {
                const topPx = (port.position / 100) * nodeHeight;
                return (
                    <div key={port.id} style={{ position: 'absolute', [direction === 'input' ? 'left' : 'right']: 0, top: topPx }}>
                        <Handle
                            type={direction === 'input' ? 'target' : 'source'}
                            position={direction === 'input' ? Position.Left : Position.Right}
                            id={port.id}
                            style={{
                                width: 10,
                                height: 10,
                                background: color,
                                border: `2px solid ${borderColor}`,
                                position: 'relative',
                                top: 0,
                                transform: 'translateY(-50%)',
                            }}
                        />
                        {/* 端口标签 — 仅在多端口时显示 */}
                        {filtered.length > 1 && (
                            <span
                                style={{
                                    position: 'absolute',
                                    [direction === 'input' ? 'left' : 'right']: 14,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    fontSize: '9px',
                                    fontWeight: 600,
                                    color: color,
                                    opacity: 0.8,
                                    pointerEvents: 'none',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {port.label}
                            </span>
                        )}
                    </div>
                );
            })}
        </>
    );
}

function WorkflowNodeComponent({ data, selected }: NodeProps) {
    const nodeData = data as unknown as WorkflowNodeData;
    const style = CATEGORY_STYLES[nodeData.category] || CATEGORY_STYLES.condition;
    const isLogic = nodeData.category === 'logic';
    const isDualInput = isLogic && nodeData.logic !== 'NOT' && nodeData.logic !== 'THRESHOLD';

    // 节点尺寸
    const nodeWidth = isLogic ? (isDualInput ? 90 : 70) : 200;
    const nodeHeight = isLogic ? (isDualInput ? 80 : 60) : 'auto';
    const minNodeHeight = isLogic ? (isDualInput ? 80 : 60) : 70;

    // 简化参数显示
    const paramEntries = Object.entries(nodeData.params || {}).slice(0, 3);

    // 获取端口（兼容旧数据）
    const ports: PortDefinition[] = nodeData.ports || [];

    return (
        <div
            className="workflow-node"
            style={{
                position: 'relative',
                width: nodeWidth,
                minHeight: minNodeHeight,
                background: style.bg,
                border: `1.5px solid ${selected ? nodeData.color : style.border}`,
                borderRadius: isLogic ? (isDualInput ? '16px' : '50%') : '10px',
                boxShadow: selected
                    ? `0 0 16px ${nodeData.color}40, 0 2px 8px rgba(0,0,0,0.3)`
                    : '0 2px 8px rgba(0,0,0,0.2)',
                transition: 'box-shadow 0.2s, border-color 0.2s',
                overflow: 'visible',
                cursor: 'grab',
            }}
        >
            {/* 端口渲染 — 使用端口定义系统 */}
            <PortHandles
                ports={ports}
                direction="input"
                color={nodeData.color}
                borderColor={style.border}
                nodeHeight={typeof nodeHeight === 'number' ? nodeHeight : minNodeHeight}
            />
            <PortHandles
                ports={ports}
                direction="output"
                color={nodeData.color}
                borderColor={style.border}
                nodeHeight={typeof nodeHeight === 'number' ? nodeHeight : minNodeHeight}
            />

            {isLogic ? (
                /* 逻辑节点 — 紧凑型 */
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        height: isDualInput ? 80 : 60,
                        textAlign: 'center',
                    }}
                >
                    <span
                        style={{
                            fontSize: isDualInput ? '16px' : '18px',
                            fontWeight: 'bold',
                            color: nodeData.color,
                            lineHeight: 1,
                        }}
                    >
                        {nodeData.logic || 'AND'}
                    </span>
                    {/* 端口标注 */}
                    {isDualInput && (
                        <span style={{ fontSize: '8px', color: 'var(--text-muted)', marginTop: '3px' }}>
                            2 入 1 出
                        </span>
                    )}
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
        </div>
    );
}

export const WorkflowNode = memo(WorkflowNodeComponent);
