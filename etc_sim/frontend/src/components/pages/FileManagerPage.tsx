import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { API } from '../../config/api';
import {
    WorkflowLibraryPanel,
    type DatasetInfo,
    type FileCategory,
    type HistoryRunItem,
    type ModelInfo,
    type SavedWorkflowItem,
} from '../workflow/WorkflowLibraryPanel';
import { WorkflowAnalysisView, type RunAnalysisPayload } from '../workflow/WorkflowAnalysisView';

type ActiveView = 'run' | 'model' | 'dataset' | 'workflow';

const API_BASE = API.WORKFLOWS;
const RUNS_API = `${API.BASE}/runs`;
const PREDICTION_API = `${API.BASE}/prediction`;

export function FileManagerPage() {
    const navigate = useNavigate();
    const [statusMsg, setStatusMsg] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [fileCategory, setFileCategory] = useState<FileCategory>('runs');
    const [activeView, setActiveView] = useState<ActiveView>('run');
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

    const selectedRun = useMemo(() => historyRuns.find((item) => item.run_id === selectedRunId) || null, [historyRuns, selectedRunId]);
    const selectedModel = useMemo(() => savedModels.find((item) => item.model_id === selectedModelId) || null, [savedModels, selectedModelId]);
    const selectedDataset = useMemo(() => datasets.find((item) => item.name === selectedDatasetName) || null, [datasets, selectedDatasetName]);

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
            await Promise.all([fetchSavedWorkflows(), fetchHistoryRuns(), fetchSavedModels(), fetchDatasets()]);
        } finally {
            setIsLoading(false);
        }
    }, [fetchDatasets, fetchHistoryRuns, fetchSavedModels, fetchSavedWorkflows]);

    useEffect(() => {
        refreshFileManager();
    }, [refreshFileManager]);

    const openWorkflowFolder = async (name?: string | null) => {
        setIsLoading(true);
        try {
            const query = name ? `?name=${encodeURIComponent(name)}` : '';
            const response = await fetch(`${API_BASE}/workflows/files/open-folder${query}`, { method: 'POST' });
            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.detail || '打开失败');
            }
            showStatus(name ? `已打开工作流目录: ${name}` : '已打开工作流目录');
        } catch (error) {
            showStatus(`打开目录失败: ${String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };

    const renameSavedWorkflow = async (targetName?: string | null) => {
        const target = targetName || selectedWorkflowName;
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
                body: JSON.stringify({ old_name: target, new_name: nextName.trim() }),
            });
            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.detail || '重命名失败');
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

    const openPredictionFolder = async (type: 'model' | 'dataset', id: string | null) => {
        if (!id) {
            showStatus(type === 'model' ? '请先选择一个模型' : '请先选择一个数据集');
            return;
        }
        setIsLoading(true);
        try {
            const response = await fetch(`${PREDICTION_API}/${type === 'model' ? 'models' : 'datasets'}/${encodeURIComponent(id)}/open-folder`, { method: 'POST' });
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
            const response = await fetch(`${PREDICTION_API}/${type === 'model' ? 'models' : 'datasets'}/${encodeURIComponent(id)}/rename`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_name: nextName.trim() }),
            });
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
            const response = await fetch(`${PREDICTION_API}/${type === 'model' ? 'models' : 'datasets'}/${encodeURIComponent(id)}/copy`, { method: 'POST' });
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
            const response = await fetch(`${PREDICTION_API}/${type === 'model' ? 'models' : 'datasets'}/${encodeURIComponent(id)}`, { method: 'DELETE' });
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
        setFileCategory('models');
        setActiveView('model');
    };

    const showDatasetDetail = (datasetName: string | null) => {
        if (!datasetName) {
            showStatus('请先选择一个数据集');
            return;
        }
        setSelectedDatasetName(datasetName);
        setFileCategory('datasets');
        setActiveView('dataset');
    };

    const editWorkflow = (name: string | null) => {
        const target = name || selectedWorkflowName;
        if (!target) {
            showStatus('请先选择一个工作流');
            return;
        }
        navigate(`/workflow?load=${encodeURIComponent(target)}`);
    };

    return (
        <div className="flex h-full overflow-hidden bg-[var(--bg-base)]">
            <aside className="w-80 shrink-0 border-r border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-lg">
                <WorkflowLibraryPanel
                    fileCategory={fileCategory}
                    setFileCategory={(value) => {
                        setFileCategory(value);
                        setActiveView(value === 'runs' ? 'run' : value === 'models' ? 'model' : value === 'datasets' ? 'dataset' : 'workflow');
                    }}
                    isLoading={isLoading}
                    onRefresh={refreshFileManager}
                    historyRuns={historyRuns}
                    selectedRunId={selectedRunId}
                    onSelectRun={setSelectedRunId}
                    onAnalyzeRun={showRunAnalysis}
                    onRenameRun={renameRun}
                    onCopyRun={copyRun}
                    onDeleteRun={deleteRun}
                    onOpenRunFolder={openRunFolder}
                    models={savedModels}
                    selectedModelId={selectedModelId}
                    onSelectModel={setSelectedModelId}
                    onShowModel={showModelDetail}
                    onOpenModelFolder={(id) => openPredictionFolder('model', id)}
                    onRenameModel={(id) => renamePredictionItem('model', id)}
                    onCopyModel={(id) => copyPredictionItem('model', id)}
                    onDeleteModel={(id) => deletePredictionItem('model', id)}
                    datasets={datasets}
                    selectedDatasetName={selectedDatasetName}
                    onSelectDataset={setSelectedDatasetName}
                    onShowDataset={showDatasetDetail}
                    onOpenDatasetFolder={(id) => openPredictionFolder('dataset', id)}
                    onRenameDataset={(id) => renamePredictionItem('dataset', id)}
                    onCopyDataset={(id) => copyPredictionItem('dataset', id)}
                    onDeleteDataset={(id) => deletePredictionItem('dataset', id)}
                    workflows={savedWorkflows}
                    selectedWorkflowName={selectedWorkflowName}
                    workflowName={selectedWorkflowName || 'workflow'}
                    onSelectWorkflow={(name) => {
                        setSelectedWorkflowName(name);
                        setFileCategory('workflows');
                        setActiveView('workflow');
                    }}
                    onLoadWorkflow={editWorkflow}
                    onRenameWorkflow={renameSavedWorkflow}
                    onCopyWorkflow={copyWorkflow}
                    onDeleteWorkflow={deleteWorkflow}
                    onOpenWorkflowFolder={openWorkflowFolder}
                />
            </aside>

            <main className="relative flex min-w-0 flex-1 flex-col">
                <div className="flex min-h-16 items-center justify-between gap-4 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] px-5 py-3 backdrop-blur-md">
                    <div>
                        <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">资源管理</div>
                        <div className="mt-1 text-lg font-semibold text-[var(--text-primary)]">文件管理器</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => navigate('/workflow')}
                            className="rounded-lg border border-[var(--glass-border)] px-3 py-2 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.05)]"
                        >
                            打开工作流编辑器
                        </button>
                        <button
                            type="button"
                            onClick={refreshFileManager}
                            className="rounded-lg bg-[var(--accent-blue)]/15 px-3 py-2 text-xs text-[var(--accent-blue)] transition-colors hover:bg-[var(--accent-blue)]/25"
                        >
                            刷新资源
                        </button>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden">
                    <WorkflowAnalysisView
                        activeView={activeView}
                        run={selectedRun}
                        analysis={runAnalysis}
                        model={selectedModel}
                        dataset={selectedDataset}
                    />
                </div>

                {statusMsg && (
                    <div className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-2 text-xs text-[var(--text-primary)] shadow-lg backdrop-blur-xl">
                        {statusMsg}
                    </div>
                )}
            </main>
        </div>
    );
}
