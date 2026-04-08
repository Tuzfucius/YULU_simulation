import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import '@xyflow/react/dist/style.css';

import { WorkflowNode } from '../workflow/WorkflowNode';
import { NodePalette } from '../workflow/NodePalette';
import { NodePropertiesPanel } from '../workflow/NodePropertiesPanel';
import {
    type DatasetInfo,
    type FileCategory,
    type HistoryRunItem,
    type ModelInfo,
    type SavedWorkflowItem,
} from '../workflow/WorkflowLibraryPanel';
import { type RunAnalysisPayload } from '../workflow/WorkflowAnalysisView';
import { useWorkflowStore } from '../../stores/workflowStore';
import { useI18nStore } from '../../stores/i18nStore';
import { API } from '../../config/api';
void AnimatePresence;

const nodeTypes = { workflowNode: WorkflowNode };
const API_BASE = API.WORKFLOWS;
const RUNS_API = `${API.BASE}/runs`;
const PREDICTION_API = `${API.BASE}/prediction`;
type SideTab = 'nodes' | 'files';
type ActiveView = 'canvas' | 'run' | 'model' | 'dataset';

interface WorkflowFilePayload {
    name?: string;
    description?: string;
    rules?: unknown[];
}

function formatTime(value?: string | number) {
    if (value === undefined || value === null || value === '') {
        return '--';
    }

    if (typeof value === 'number') {
        return new Date(value * 1000).toLocaleString('zh-CN', { hour12: false });
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString('zh-CN', { hour12: false });
}
void formatTime;

export function WorkflowPage() {
    const {
        nodes,
        edges,
        setNodes,
        setEdges,
        addNode,
        selectNode,
        exportToRules,
        loadRules,
        clearAll,
        workflowName,
        workflowDescription,
        setWorkflowMeta,
        canConnect,
        undo,
        redo,
        canUndo,
        canRedo,
        loadFromLocal,
    } = useWorkflowStore();
    const { t } = useI18nStore();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
    const [statusMsg, setStatusMsg] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [sideTab, setSideTab] = useState<SideTab>('nodes');
    const [fileCategory, setFileCategory] = useState<FileCategory>('runs');
    const [activeView, setActiveView] = useState<ActiveView>('canvas');
    const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflowItem[]>([]);
    const [historyRuns, setHistoryRuns] = useState<HistoryRunItem[]>([]);
    const [savedModels, setSavedModels] = useState<ModelInfo[]>([]);
    const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
    const [selectedWorkflowName, setSelectedWorkflowName] = useState<string | null>(null);
    const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
    const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
    const [selectedDatasetName, setSelectedDatasetName] = useState<string | null>(null);
    const [runAnalysis, setRunAnalysis] = useState<RunAnalysisPayload | null>(null);

    const showStatus = useCallback((message: string) => {
        setStatusMsg(message);
        window.setTimeout(() => setStatusMsg(null), 3000);
    }, []);

    const selectedRun = historyRuns.find((item) => item.run_id === selectedRunId) || null;
    const selectedModel = savedModels.find((item) => item.model_id === selectedModelId) || null;
    const selectedDataset = datasets.find((item) => item.name === selectedDatasetName) || null;
    void sideTab;
    void fileCategory;
    void activeView;
    void savedWorkflows;
    void runAnalysis;
    void selectedRun;
    void selectedModel;
    void selectedDataset;

    const fetchSavedWorkflows = useCallback(async (keepSelection = true) => {
        try {
            const response = await fetch(`${API_BASE}/workflows/files`);
            const payload = await response.json();
            const items = Array.isArray(payload.data) ? payload.data : [];
            setSavedWorkflows(items);
            setSelectedWorkflowName((current) => {
                if (!keepSelection) {
                    return items[0]?.name ?? null;
                }
                if (current && items.some((item: SavedWorkflowItem) => item.name === current)) {
                    return current;
                }
                return items[0]?.name ?? null;
            });
        } catch (error) {
            showStatus(`读取工作流文件失败: ${String(error)}`);
        }
    }, [showStatus]);

    const fetchHistoryRuns = useCallback(async () => {
        try {
            const response = await fetch(RUNS_API);
            const payload = await response.json();
            const items = Array.isArray(payload.runs) ? payload.runs : [];
            setHistoryRuns(items);
            setSelectedRunId((current) => current && items.some((item: HistoryRunItem) => item.run_id === current) ? current : items[0]?.run_id ?? null);
        } catch (error) {
            showStatus(`读取历史运行失败: ${String(error)}`);
        }
    }, [showStatus]);

    const fetchSavedModels = useCallback(async () => {
        try {
            const response = await fetch(`${PREDICTION_API}/models`);
            const payload = await response.json();
            const items = Array.isArray(payload.models) ? payload.models : [];
            setSavedModels(items);
            setSelectedModelId((current) => current && items.some((item: ModelInfo) => item.model_id === current) ? current : items[0]?.model_id ?? null);
        } catch (error) {
            showStatus(`读取模型列表失败: ${String(error)}`);
        }
    }, [showStatus]);

    const fetchDatasets = useCallback(async () => {
        try {
            const response = await fetch(`${PREDICTION_API}/datasets`);
            const payload = await response.json();
            const items = Array.isArray(payload.datasets) ? payload.datasets : [];
            setDatasets(items);
            setSelectedDatasetName((current) => current && items.some((item: DatasetInfo) => item.name === current) ? current : items[0]?.name ?? null);
        } catch (error) {
            showStatus(`读取数据集列表失败: ${String(error)}`);
        }
    }, [showStatus]);

    const refreshFileManager = useCallback(async () => {
        setIsLoading(true);
        try {
            await Promise.all([
                fetchSavedWorkflows(),
                fetchHistoryRuns(),
                fetchSavedModels(),
                fetchDatasets(),
            ]);
        } finally {
            setIsLoading(false);
        }
    }, [fetchDatasets, fetchHistoryRuns, fetchSavedModels, fetchSavedWorkflows]);

    useEffect(() => {
        const restored = loadFromLocal();
        if (restored) {
            showStatus('已从本地草稿恢复当前工作流');
        }
        refreshFileManager();
    }, [loadFromLocal, refreshFileManager, showStatus]);

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
                event.preventDefault();
                if (event.shiftKey) {
                    redo();
                } else {
                    undo();
                }
            }
            if ((event.ctrlKey || event.metaKey) && event.key === 'y') {
                event.preventDefault();
                redo();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [redo, undo]);

    const onNodesChange: OnNodesChange = useCallback(
        (changes) => setNodes(applyNodeChanges(changes, nodes) as any),
        [nodes, setNodes]
    );

    const onEdgesChange: OnEdgesChange = useCallback(
        (changes) => setEdges(applyEdgeChanges(changes, edges)),
        [edges, setEdges]
    );

    const onConnect: OnConnect = useCallback(
        (params: Connection) => {
            const valid = canConnect(
                params.source || '',
                params.target || '',
                params.sourceHandle || null,
                params.targetHandle || null
            );
            if (!valid) {
                showStatus(t('workflow.connectionDenied'));
                return;
            }
            setEdges(
                addEdge(
                    { ...params, animated: true, style: { stroke: '#a78bfa' } },
                    edges
                )
            );
        },
        [canConnect, edges, setEdges, showStatus, t]
    );

    const onNodeClick = useCallback((_: React.MouseEvent, node: any) => {
        selectNode(node.id);
    }, [selectNode]);

    const onPaneClick = useCallback(() => {
        selectNode(null);
    }, [selectNode]);

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        const raw = event.dataTransfer.getData('application/workflow-node');
        if (!raw) {
            return;
        }

        const config = JSON.parse(raw);
        const bounds = reactFlowWrapper.current?.getBoundingClientRect();
        if (!bounds || !rfInstance) {
            return;
        }

        const position = rfInstance.screenToFlowPosition({
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
        });

        addNode(config, position);
    }, [addNode, rfInstance]);

    const saveToBackend = async () => {
        const rules = exportToRules();
        if (rules.length === 0) {
            showStatus(t('workflow.noRulesToExport'));
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE}/workflows/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rules }),
            });
            const payload = await response.json();
            if (payload.success) {
                showStatus(t('workflow.savedRules').replace('{count}', String(payload.data.imported_count)));
            } else {
                showStatus(`${t('workflow.saveFailed')}: ${payload.detail || 'Unknown Error'}`);
            }
        } catch (error) {
            showStatus(`${t('workflow.networkError')}: ${String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };

    const loadFromBackend = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE}/rules`);
            const payload = await response.json();
            if (payload.success && payload.data.length > 0) {
                loadRules(payload.data);
                setSideTab('nodes');
                setActiveView('canvas');
                showStatus(t('workflow.loadedRules').replace('{count}', String(payload.data.length)));
            } else {
                showStatus(t('workflow.noRulesInBackend'));
            }
        } catch (error) {
            showStatus(`${t('workflow.loadFailed')}: ${String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };

    const loadDefaults = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE}/workflows/reset`, { method: 'POST' });
            const payload = await response.json();
            if (payload.success) {
                loadRules(payload.data);
                setSideTab('nodes');
                setActiveView('canvas');
                showStatus(t('workflow.loadedDefaultRules').replace('{count}', String(payload.data.length)));
            }
        } catch (error) {
            showStatus(`${t('workflow.resetFailed')}: ${String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };

    const saveWorkflowFile = async () => {
        const rules = exportToRules();
        if (rules.length === 0) {
            showStatus('当前工作流没有可保存的规则');
            return;
        }
        if (!workflowName.trim()) {
            showStatus('请先填写工作流名称');
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE}/workflows/files/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: workflowName,
                    description: workflowDescription,
                    rules,
                }),
            });
            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.detail || '保存失败');
            }
            setSelectedWorkflowName(payload.data?.name ?? workflowName);
            await fetchSavedWorkflows();
            showStatus(`工作流已保存: ${workflowName}`);
        } catch (error) {
            showStatus(`保存工作流失败: ${String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };

    const loadSavedWorkflow = async (name: string) => {
        if (!name) {
            showStatus('请先选择一个工作流');
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE}/workflows/files/read?name=${encodeURIComponent(name)}`);
            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.detail || '读取失败');
            }

            const workflow = payload.data as WorkflowFilePayload;
            const rules = Array.isArray(workflow.rules) ? workflow.rules : [];
            loadRules(rules as any);
            setWorkflowMeta(workflow.name || name, workflow.description || '');
            setSelectedWorkflowName(workflow.name || name);
            setSideTab('nodes');
            setActiveView('canvas');
            showStatus(`已加载工作流: ${workflow.name || name}`);
        } catch (error) {
            showStatus(`加载工作流失败: ${String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const workflowToLoad = searchParams.get('load');
        if (!workflowToLoad) {
            return;
        }
        loadSavedWorkflow(workflowToLoad);
        setSearchParams({}, { replace: true });
    }, [loadSavedWorkflow, searchParams, setSearchParams]);

    const renameSavedWorkflow = async (targetName?: string | null) => {
        const target = targetName || selectedWorkflowName || workflowName;
        if (!target) {
            showStatus('请先选择一个工作流');
            return;
        }

        const nextName = window.prompt('请输入新的工作流名称', target);
        if (!nextName || nextName.trim() === '' || nextName.trim() === target) {
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE}/workflows/files/rename`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    old_name: target,
                    new_name: nextName.trim(),
                }),
            });
            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.detail || '重命名失败');
            }

            if (workflowName === target) {
                setWorkflowMeta(nextName.trim(), workflowDescription);
            }
            setSelectedWorkflowName(nextName.trim());
            await fetchSavedWorkflows(false);
            showStatus(`工作流已重命名为: ${nextName.trim()}`);
        } catch (error) {
            showStatus(`重命名失败: ${String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };

    const openWorkflowFolder = async (name?: string | null) => {
        setIsLoading(true);
        try {
            const query = name ? `?name=${encodeURIComponent(name)}` : '';
            const response = await fetch(`${API_BASE}/workflows/files/open-folder${query}`, {
                method: 'POST',
            });
            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.detail || '打开失败');
            }
            showStatus(name ? `已打开工作流所在目录: ${name}` : '已打开工作流目录');
        } catch (error) {
            showStatus(`打开目录失败: ${String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };

    const openPredictionFolder = async (type: 'model' | 'dataset', id: string | null) => {
        if (!id) {
            showStatus(type === 'model' ? '请先选择一个模型' : '请先选择一个数据集');
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch(
                `${PREDICTION_API}/${type === 'model' ? 'models' : 'datasets'}/${encodeURIComponent(id)}/open-folder`,
                { method: 'POST' }
            );
            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.detail || '打开失败');
            }
            showStatus(`已打开${type === 'model' ? '模型' : '数据集'}目录: ${id}`);
        } catch (error) {
            showStatus(`打开目录失败: ${String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };

    const renameRun = async (runId: string | null) => {
        if (!runId) {
            showStatus('请先选择一条历史运行');
            return;
        }
        const nextName = window.prompt('请输入新的历史运行名称', runId);
        if (!nextName || nextName.trim() === '' || nextName.trim() === runId) {
            return;
        }
        setIsLoading(true);
        try {
            const response = await fetch(`${RUNS_API}/${encodeURIComponent(runId)}/rename`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_name: nextName.trim() }),
            });
            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.detail || '重命名失败');
            }
            await fetchHistoryRuns();
            if (selectedRunId === runId) {
                setSelectedRunId(payload.run_id || nextName.trim());
            }
            showStatus(`历史运行已重命名为: ${payload.run_id || nextName.trim()}`);
        } catch (error) {
            showStatus(`重命名失败: ${String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };

    const copyRun = async (runId: string | null) => {
        if (!runId) {
            showStatus('请先选择一条历史运行');
            return;
        }
        setIsLoading(true);
        try {
            const response = await fetch(`${RUNS_API}/${encodeURIComponent(runId)}/copy`, { method: 'POST' });
            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.detail || '复制失败');
            }
            await fetchHistoryRuns();
            showStatus(`历史运行已复制为: ${payload.run_id}`);
        } catch (error) {
            showStatus(`复制失败: ${String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };

    const deleteRun = async (runId: string | null) => {
        if (!runId) {
            showStatus('请先选择一条历史运行');
            return;
        }
        if (!window.confirm(`确认删除历史运行 "${runId}"？此操作不可恢复。`)) {
            return;
        }
        setIsLoading(true);
        try {
            const response = await fetch(`${RUNS_API}/${encodeURIComponent(runId)}`, { method: 'DELETE' });
            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.detail || '删除失败');
            }
            if (selectedRunId === runId) {
                setRunAnalysis(null);
            }
            await fetchHistoryRuns();
            showStatus(`历史运行已删除: ${runId}`);
        } catch (error) {
            showStatus(`删除失败: ${String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };

    const openRunFolder = async (runId: string | null) => {
        if (!runId) {
            showStatus('请先选择一条历史运行');
            return;
        }
        setIsLoading(true);
        try {
            const response = await fetch(`${RUNS_API}/${encodeURIComponent(runId)}/open-folder`, { method: 'POST' });
            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.detail || '打开失败');
            }
            showStatus(`已打开历史运行目录: ${runId}`);
        } catch (error) {
            showStatus(`打开目录失败: ${String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };

    const renamePredictionItem = async (type: 'model' | 'dataset', id: string | null) => {
        if (!id) {
            showStatus(type === 'model' ? '请先选择一个模型' : '请先选择一个数据集');
            return;
        }
        const nextName = window.prompt(`请输入新的${type === 'model' ? '模型' : '数据集'}名称`, id);
        if (!nextName || nextName.trim() === '' || nextName.trim() === id) {
            return;
        }
        setIsLoading(true);
        try {
            const response = await fetch(
                `${PREDICTION_API}/${type === 'model' ? 'models' : 'datasets'}/${encodeURIComponent(id)}/rename`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ new_name: nextName.trim() }),
                }
            );
            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.detail || '重命名失败');
            }
            if (type === 'model') {
                await fetchSavedModels();
                setSelectedModelId(payload.new_model_id || nextName.trim());
            } else {
                await fetchDatasets();
                setSelectedDatasetName(payload.new_name || nextName.trim());
            }
            showStatus(`${type === 'model' ? '模型' : '数据集'}已重命名为: ${nextName.trim()}`);
        } catch (error) {
            showStatus(`重命名失败: ${String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };

    const copyPredictionItem = async (type: 'model' | 'dataset', id: string | null) => {
        if (!id) {
            showStatus(type === 'model' ? '请先选择一个模型' : '请先选择一个数据集');
            return;
        }
        setIsLoading(true);
        try {
            const response = await fetch(
                `${PREDICTION_API}/${type === 'model' ? 'models' : 'datasets'}/${encodeURIComponent(id)}/copy`,
                { method: 'POST' }
            );
            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.detail || '复制失败');
            }
            if (type === 'model') {
                await fetchSavedModels();
            } else {
                await fetchDatasets();
            }
            showStatus(`${type === 'model' ? '模型' : '数据集'}已复制`);
        } catch (error) {
            showStatus(`复制失败: ${String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };

    const deletePredictionItem = async (type: 'model' | 'dataset', id: string | null) => {
        if (!id) {
            showStatus(type === 'model' ? '请先选择一个模型' : '请先选择一个数据集');
            return;
        }
        if (!window.confirm(`确认删除${type === 'model' ? '模型' : '数据集'} "${id}"？此操作不可恢复。`)) {
            return;
        }
        setIsLoading(true);
        try {
            const response = await fetch(
                `${PREDICTION_API}/${type === 'model' ? 'models' : 'datasets'}/${encodeURIComponent(id)}`,
                { method: 'DELETE' }
            );
            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.detail || '删除失败');
            }
            if (type === 'model') {
                await fetchSavedModels();
            } else {
                await fetchDatasets();
            }
            showStatus(`${type === 'model' ? '模型' : '数据集'}已删除: ${id}`);
        } catch (error) {
            showStatus(`删除失败: ${String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };

    const copyWorkflow = async (name: string | null) => {
        if (!name) {
            showStatus('请先选择一个工作流');
            return;
        }
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE}/workflows/files/copy?name=${encodeURIComponent(name)}`, { method: 'POST' });
            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.detail || '复制失败');
            }
            await fetchSavedWorkflows(false);
            showStatus(`工作流已复制为: ${payload.data?.name || payload.data?.path}`);
        } catch (error) {
            showStatus(`复制失败: ${String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };

    const deleteWorkflow = async (name: string | null) => {
        if (!name) {
            showStatus('请先选择一个工作流');
            return;
        }
        if (!window.confirm(`确认删除工作流 "${name}"？此操作不可恢复。`)) {
            return;
        }
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE}/workflows/files?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.detail || '删除失败');
            }
            await fetchSavedWorkflows(false);
            showStatus(`工作流已删除: ${name}`);
        } catch (error) {
            showStatus(`删除失败: ${String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };

    const showRunAnalysis = async (runId: string | null) => {
        if (!runId) {
            showStatus('请先选择一条历史运行');
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch(`${RUNS_API}/${encodeURIComponent(runId)}/analysis`);
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.detail || '分析加载失败');
            }
            setSelectedRunId(runId);
            setRunAnalysis(payload);
            setSideTab('files');
            setFileCategory('runs');
            setActiveView('run');
            showStatus(`已切换到历史数据分析视图: ${runId}`);
        } catch (error) {
            showStatus(`历史分析加载失败: ${String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };

    const showModelDetail = (modelId: string | null) => {
        if (!modelId) {
            showStatus('请先选择一个模型');
            return;
        }
        setSelectedModelId(modelId);
        setSideTab('files');
        setFileCategory('models');
        setActiveView('model');
    };

    const showDatasetDetail = (datasetName: string | null) => {
        if (!datasetName) {
            showStatus('请先选择一个数据集');
            return;
        }
        setSelectedDatasetName(datasetName);
        setSideTab('files');
        setFileCategory('datasets');
        setActiveView('dataset');
    };

    void renameSavedWorkflow;
    void openWorkflowFolder;
    void openPredictionFolder;
    void renameRun;
    void copyRun;
    void deleteRun;
    void openRunFolder;
    void renamePredictionItem;
    void copyPredictionItem;
    void deletePredictionItem;
    void copyWorkflow;
    void deleteWorkflow;
    void showRunAnalysis;
    void showModelDetail;
    void showDatasetDetail;

    const exportJSON = () => {
        const rules = exportToRules();
        const blob = new Blob([JSON.stringify({ rules }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `workflow_${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
        showStatus(t('workflow.exportedRules').replace('{count}', String(rules.length)));
    };

    const importJSON = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (event: Event) => {
            const target = event.target as HTMLInputElement;
            const file = target.files?.[0];
            if (!file) {
                return;
            }

            const reader = new FileReader();
            reader.onload = (loadEvent) => {
                try {
                    const payload = JSON.parse(String(loadEvent.target?.result || '{}'));
                    if (!payload.rules || !Array.isArray(payload.rules)) {
                        showStatus('无效的工作流文件，缺少 rules 数组');
                        return;
                    }
                    loadRules(payload.rules);
                    if (payload.name || payload.description) {
                        setWorkflowMeta(payload.name || workflowName, payload.description || '');
                    }
                    setSideTab('nodes');
                    setActiveView('canvas');
                    showStatus(t('workflow.importedRules').replace('{count}', String(payload.rules.length)));
                } catch (error) {
                    showStatus(`${t('workflow.invalidJson')}: ${String(error)}`);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    return (
        <div className="flex h-full overflow-hidden">
            <aside className="w-80 flex flex-col border-r border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-lg shrink-0">
                <div className="border-b border-[var(--glass-border)] p-3">
                    <div className="rounded-lg bg-[var(--accent-blue)]/10 px-3 py-2 text-sm text-[var(--accent-blue)]">
                        节点面板
                    </div>
                </div>
                <div className="flex-1 min-h-0">
                    <NodePalette />
                </div>
            </aside>

            <main className="flex-1 flex flex-col relative">
                <div className="min-h-16 flex items-center justify-between gap-4 px-4 py-3 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md z-10 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col gap-1">
                            <input
                                type="text"
                                value={workflowName}
                                onChange={(event) => setWorkflowMeta(event.target.value, workflowDescription)}
                                className="text-sm font-medium bg-transparent border-none outline-none text-[var(--text-primary)] w-52"
                                placeholder={t('workflow.workflowName')}
                            />
                            <input
                                type="text"
                                value={workflowDescription}
                                onChange={(event) => setWorkflowMeta(workflowName, event.target.value)}
                                className="text-[11px] bg-transparent border-none outline-none text-[var(--text-muted)] w-72"
                                placeholder="填写工作流说明，便于后续检索"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        <button
                            type="button"
                            onClick={() => navigate('/files')}
                            className="text-[11px] px-3 py-1.5 rounded-md bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/25 transition-colors"
                        >
                            打开文件管理器
                        </button>
                        <button
                            onClick={undo}
                            disabled={!canUndo}
                            title="撤销 (Ctrl+Z)"
                            className="text-[11px] px-2 py-1.5 rounded-md text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)] transition-colors disabled:opacity-30"
                        >
                            撤销
                        </button>
                        <button
                            onClick={redo}
                            disabled={!canRedo}
                            title="重做 (Ctrl+Shift+Z)"
                            className="text-[11px] px-2 py-1.5 rounded-md text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)] transition-colors disabled:opacity-30"
                        >
                            重做
                        </button>
                        <span className="w-px h-5 bg-[var(--glass-border)]" />
                        <button
                            onClick={saveWorkflowFile}
                            disabled={isLoading}
                            className="text-[11px] px-3 py-1.5 rounded-md bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
                        >
                            保存工作流
                        </button>
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

                <div className="flex-1 overflow-hidden relative">
                    <motion.div
                        key="canvas"
                        initial={{ opacity: 0, x: 32 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.24 }}
                        className="absolute inset-0"
                    >
                        <div ref={reactFlowWrapper} className="h-full">
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
                                <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.06)" />
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
                                    nodeColor={(node: any) => node.data?.color || '#888'}
                                    maskColor="rgba(0,0,0,0.5)"
                                />
                            </ReactFlow>
                        </div>
                    </motion.div>
                </div>

                {statusMsg && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] backdrop-blur-xl text-xs text-[var(--text-primary)] shadow-lg z-50 animate-fade-in">
                        {statusMsg}
                    </div>
                )}
            </main>

            <aside className="w-56 flex flex-col border-l border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-lg shrink-0">
                <NodePropertiesPanel />
            </aside>
        </div>
    );
}
