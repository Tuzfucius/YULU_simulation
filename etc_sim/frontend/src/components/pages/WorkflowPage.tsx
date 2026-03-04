/**
 * 可视化工作流编辑器页面
 * 
 * 三栏布局：
 *  - 左侧：节点面板（拖拽添加）
 *  - 中间：React Flow 画布
 *  - 右侧：属性编辑面板
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
    type OnNodesChange,
    type OnEdgesChange,
    type OnConnect,
    type ReactFlowInstance,
    type Connection,
    BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { WorkflowNode } from '../workflow/WorkflowNode';
import { NodePalette } from '../workflow/NodePalette';
import { NodePropertiesPanel } from '../workflow/NodePropertiesPanel';
import { useWorkflowStore, NODE_TYPE_CONFIGS } from '../../stores/workflowStore';
import { useI18nStore } from '../../stores/i18nStore';
import { API } from '../../config/api';

// 自定义节点类型注册
const nodeTypes = { workflowNode: WorkflowNode };

const API_BASE = API.WORKFLOWS;

export function WorkflowPage() {
    const {
        nodes, edges, setNodes, setEdges, addNode,
        selectNode, selectedNodeId, exportToRules, loadRules, clearAll,
        workflowName, workflowDescription, setWorkflowMeta,
        canConnect,
        undo, redo, canUndo, canRedo,
        loadFromLocal,
    } = useWorkflowStore();
    const { t } = useI18nStore();

    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
    const [statusMsg, setStatusMsg] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // ===== localStorage 恢复 =====
    useEffect(() => {
        const restored = loadFromLocal();
        if (restored) {
            setStatusMsg('已从本地缓存恢复工作流');
            setTimeout(() => setStatusMsg(null), 3000);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ===== 撤销/重做快捷键 =====
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    redo();
                } else {
                    undo();
                }
            }
            // Ctrl+Y 也支持重做
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                redo();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [undo, redo]);

    // 节点变更
    const onNodesChange: OnNodesChange = useCallback(
        (changes) => setNodes(applyNodeChanges(changes, nodes) as any),
        [nodes, setNodes]
    );
    const onEdgesChange: OnEdgesChange = useCallback(
        (changes) => setEdges(applyEdgeChanges(changes, edges)),
        [edges, setEdges]
    );

    // 连接校验 + 添加
    const onConnect: OnConnect = useCallback(
        (params: Connection) => {
            // 校验：同一个输入端口不允许多条线
            const valid = canConnect(
                params.source || '',
                params.target || '',
                params.sourceHandle || null,
                params.targetHandle || null,
            );
            if (!valid) {
                setStatusMsg(t('workflow.connectionDenied'));
                setTimeout(() => setStatusMsg(null), 3000);
                return;
            }
            setEdges(addEdge(
                { ...params, animated: true, style: { stroke: '#a78bfa' } },
                edges,
            ));
        },
        [edges, setEdges, canConnect]
    );

    // 选中节点
    const onNodeClick = useCallback((_: React.MouseEvent, node: any) => {
        selectNode(node.id);
    }, [selectNode]);

    const onPaneClick = useCallback(() => {
        selectNode(null);
    }, [selectNode]);

    // 拖放节点到画布
    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            const raw = e.dataTransfer.getData('application/workflow-node');
            if (!raw) return;

            const config = JSON.parse(raw);
            const bounds = reactFlowWrapper.current?.getBoundingClientRect();
            if (!bounds || !rfInstance) return;

            const position = rfInstance.screenToFlowPosition({
                x: e.clientX - bounds.left,
                y: e.clientY - bounds.top,
            });

            addNode(config, position);
        },
        [rfInstance, addNode]
    );

    // 状态提示
    const showStatus = (msg: string) => {
        setStatusMsg(msg);
        setTimeout(() => setStatusMsg(null), 3000);
    };

    // ==================== 后端交互 ====================

    const saveToBackend = async () => {
        const rules = exportToRules();
        if (rules.length === 0) {
            showStatus(t('workflow.noRulesToExport'));
            return;
        }

        setIsLoading(true);
        try {
            const resp = await fetch(`${API_BASE}/workflows/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rules }),
            });
            const data = await resp.json();
            if (data.success) {
                showStatus(t('workflow.savedRules').replace('{count}', data.data.imported_count));
            } else {
                showStatus(`${t('workflow.saveFailed')}: ${data.detail || 'Unknown Error'}`);
            }
        } catch (err) {
            showStatus(`${t('workflow.networkError')}: ${err}`);
        } finally {
            setIsLoading(false);
        }
    };

    const loadFromBackend = async () => {
        setIsLoading(true);
        try {
            const resp = await fetch(`${API_BASE}/rules`);
            const data = await resp.json();
            if (data.success && data.data.length > 0) {
                loadRules(data.data);
                showStatus(t('workflow.loadedRules').replace('{count}', data.data.length));
            } else {
                showStatus(t('workflow.noRulesInBackend'));
            }
        } catch (err) {
            showStatus(`${t('workflow.loadFailed')}: ${err}`);
        } finally {
            setIsLoading(false);
        }
    };

    const loadDefaults = async () => {
        setIsLoading(true);
        try {
            const resp = await fetch(`${API_BASE}/workflows/reset`, { method: 'POST' });
            const data = await resp.json();
            if (data.success) {
                loadRules(data.data);
                showStatus(t('workflow.loadedDefaultRules').replace('{count}', data.data.length));
            }
        } catch (err) {
            showStatus(`${t('workflow.resetFailed')}: ${err}`);
        } finally {
            setIsLoading(false);
        }
    };

    const exportJSON = () => {
        const rules = exportToRules();
        const blob = new Blob([JSON.stringify({ rules }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `workflow_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showStatus(t('workflow.exportedRules').replace('{count}', rules.length));
    };

    const importJSON = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e: any) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target?.result as string);
                    // 基本格式校验
                    if (!data.rules || !Array.isArray(data.rules)) {
                        showStatus('❗ 无效的工作流文件：缺少 rules 字段');
                        return;
                    }
                    for (let i = 0; i < data.rules.length; i++) {
                        const r = data.rules[i];
                        if (!r.name || !Array.isArray(r.conditions)) {
                            showStatus(`❗ 规则 #${i + 1} 缺少必要字段 (name/conditions)`);
                            return;
                        }
                    }
                    loadRules(data.rules);
                    showStatus(t('workflow.importedRules').replace('{count}', data.rules.length));
                } catch {
                    showStatus(t('workflow.invalidJson'));
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    return (
        <div className="flex h-full overflow-hidden">
            {/* 左侧节点面板 */}
            <aside className="w-56 flex flex-col border-r border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-lg shrink-0">
                <NodePalette />
            </aside>

            {/* 中间画布 + 工具栏 */}
            <main className="flex-1 flex flex-col relative">
                {/* 顶部工具栏 */}
                <div className="h-12 flex items-center justify-between px-4 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md z-10 shrink-0">
                    <div className="flex items-center gap-3">
                        <span className="text-lg">🔀</span>
                        <input
                            type="text"
                            value={workflowName}
                            onChange={(e) => setWorkflowMeta(e.target.value, workflowDescription)}
                            className="text-sm font-medium bg-transparent border-none outline-none text-[var(--text-primary)] w-40"
                            placeholder={t('workflow.workflowName')}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        {/* 撤销/重做 */}
                        <button
                            onClick={undo}
                            disabled={!canUndo}
                            title="撤销 (Ctrl+Z)"
                            className="text-[11px] px-2 py-1.5 rounded-md text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)] transition-colors disabled:opacity-30"
                        >
                            ↩️
                        </button>
                        <button
                            onClick={redo}
                            disabled={!canRedo}
                            title="重做 (Ctrl+Shift+Z)"
                            className="text-[11px] px-2 py-1.5 rounded-md text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)] transition-colors disabled:opacity-30"
                        >
                            ↪️
                        </button>
                        <span className="w-px h-5 bg-[var(--glass-border)]" />
                        <button
                            onClick={loadDefaults}
                            disabled={isLoading}
                            className="text-[11px] px-3 py-1.5 rounded-md bg-[var(--accent-purple)]/15 text-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/25 transition-colors disabled:opacity-50"
                        >
                            {t('workflow.loadDefault')}
                        </button>
                        <button
                            onClick={loadFromBackend}
                            disabled={isLoading}
                            className="text-[11px] px-3 py-1.5 rounded-md bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/25 transition-colors disabled:opacity-50"
                        >
                            {t('workflow.loadFromBackend')}
                        </button>
                        <button
                            onClick={saveToBackend}
                            disabled={isLoading}
                            className="text-[11px] px-3 py-1.5 rounded-md bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors disabled:opacity-50"
                        >
                            {t('workflow.saveToBackend')}
                        </button>
                        <span className="w-px h-5 bg-[var(--glass-border)]" />
                        <button
                            onClick={importJSON}
                            className="text-[11px] px-2.5 py-1.5 rounded-md text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                        >
                            {t('common.import')}
                        </button>
                        <button
                            onClick={exportJSON}
                            className="text-[11px] px-2.5 py-1.5 rounded-md text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                        >
                            {t('common.export')}
                        </button>
                        <button
                            onClick={clearAll}
                            className="text-[11px] px-2.5 py-1.5 rounded-md text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                            {t('common.clear')}
                        </button>
                    </div>
                </div>

                {/* React Flow 画布 */}
                <div ref={reactFlowWrapper} className="flex-1">
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodeClick={onNodeClick}
                        onPaneClick={onPaneClick}
                        onInit={setRfInstance as any}
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                        nodeTypes={nodeTypes}
                        fitView
                        proOptions={{ hideAttribution: true }}
                        defaultEdgeOptions={{ animated: true, style: { stroke: '#a78bfa', strokeWidth: 1.5 } }}
                        style={{ background: 'var(--bg-base)' }}
                    >
                        <Background
                            variant={BackgroundVariant.Dots}
                            gap={20}
                            size={1}
                            color="rgba(255,255,255,0.06)"
                        />
                        <Controls
                            style={{
                                background: 'var(--glass-bg)',
                                borderRadius: '8px',
                                border: '1px solid var(--glass-border)',
                            }}
                        />
                        <MiniMap
                            style={{
                                background: 'var(--glass-bg)',
                                borderRadius: '8px',
                                border: '1px solid var(--glass-border)',
                            }}
                            nodeColor={(n: any) => n.data?.color || '#888'}
                            maskColor="rgba(0,0,0,0.5)"
                        />
                    </ReactFlow>
                </div>

                {/* 状态提示 */}
                {statusMsg && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg
            bg-[var(--glass-bg)] border border-[var(--glass-border)] backdrop-blur-xl
            text-xs text-[var(--text-primary)] shadow-lg z-50 animate-fade-in">
                        {statusMsg}
                    </div>
                )}
            </main>

            {/* 右侧属性面板 */}
            <aside className="w-56 flex flex-col border-l border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-lg shrink-0">
                <NodePropertiesPanel />
            </aside>
        </div>
    );
}
