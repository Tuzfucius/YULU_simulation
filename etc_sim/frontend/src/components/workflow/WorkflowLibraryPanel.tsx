import React, { useCallback, useState } from 'react';
import { ContextMenu, type ContextMenuState } from '../charts/ContextMenu';

export type FileCategory = 'runs' | 'models' | 'datasets' | 'workflows';

export interface SavedWorkflowItem {
    name: string;
    file_name: string;
    path: string;
    description?: string;
    rule_count: number;
    modified_at: string;
}

export interface HistoryRunItem {
    run_id: string;
    name: string;
    path: string;
    modified?: string;
    summary?: {
        total_vehicles?: number;
        total_anomalies?: number;
        simulation_time?: number;
        ml_samples?: number;
    };
}

export interface DatasetInfo {
    name: string;
    filename: string;
    size: number;
    modified: number;
    meta?: {
        total_samples?: number;
        feature_names?: string[];
        step_seconds?: number;
        window_size_steps?: number;
        extra_features?: string[];
        source_files?: string[];
        created_at?: string;
    };
}

export interface ModelInfo {
    model_id: string;
    filename: string;
    size: number;
    created_at: number;
    meta?: {
        model_id: string;
        created_at: string;
        source_datasets?: string[];
        source_simulations?: string[];
        source_run_ids?: string[];
        model_type?: string;
        metrics?: Record<string, number>;
        hyperparameters?: Record<string, number>;
        trained_samples?: number;
        validated_samples?: number;
    } | null;
}

interface WorkflowLibraryPanelProps {
    fileCategory: FileCategory;
    setFileCategory: (value: FileCategory) => void;
    isLoading: boolean;
    onRefresh: () => void;
    historyRuns: HistoryRunItem[];
    selectedRunId: string | null;
    onSelectRun: (runId: string) => void;
    onAnalyzeRun: (runId: string | null) => void;
    onRenameRun: (runId: string | null) => void;
    onCopyRun: (runId: string | null) => void;
    onDeleteRun: (runId: string | null) => void;
    onOpenRunFolder: (runId: string | null) => void;
    models: ModelInfo[];
    selectedModelId: string | null;
    onSelectModel: (modelId: string) => void;
    onShowModel: (modelId: string | null) => void;
    onOpenModelFolder: (modelId: string | null) => void;
    onRenameModel: (modelId: string | null) => void;
    onCopyModel: (modelId: string | null) => void;
    onDeleteModel: (modelId: string | null) => void;
    datasets: DatasetInfo[];
    selectedDatasetName: string | null;
    onSelectDataset: (datasetName: string) => void;
    onShowDataset: (datasetName: string | null) => void;
    onOpenDatasetFolder: (datasetName: string | null) => void;
    onRenameDataset: (datasetName: string | null) => void;
    onCopyDataset: (datasetName: string | null) => void;
    onDeleteDataset: (datasetName: string | null) => void;
    workflows: SavedWorkflowItem[];
    selectedWorkflowName: string | null;
    workflowName: string;
    onSelectWorkflow: (workflowName: string) => void;
    onLoadWorkflow: (workflowName: string | null) => void;
    onRenameWorkflow: (workflowName: string | null) => void;
    onCopyWorkflow: (workflowName: string | null) => void;
    onDeleteWorkflow: (workflowName: string | null) => void;
    onOpenWorkflowFolder: (workflowName: string | null) => void;
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

function formatDuration(seconds?: number) {
    if (!seconds) {
        return '--';
    }
    if (seconds < 60) {
        return `${seconds.toFixed(0)} 秒`;
    }
    if (seconds < 3600) {
        return `${(seconds / 60).toFixed(1)} 分钟`;
    }
    return `${(seconds / 3600).toFixed(2)} 小时`;
}

function formatSize(size?: number) {
    if (!size) {
        return '--';
    }
    if (size < 1024) {
        return `${size} B`;
    }
    if (size < 1024 * 1024) {
        return `${(size / 1024).toFixed(1)} KB`;
    }
    return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

export function WorkflowLibraryPanel(props: WorkflowLibraryPanelProps) {
    const {
        fileCategory,
        setFileCategory,
        isLoading,
        onRefresh,
        historyRuns,
        selectedRunId,
        onSelectRun,
        onAnalyzeRun,
        onRenameRun,
        onCopyRun,
        onDeleteRun,
        onOpenRunFolder,
        models,
        selectedModelId,
        onSelectModel,
        onShowModel,
        onOpenModelFolder,
        onRenameModel,
        onCopyModel,
        onDeleteModel,
        datasets,
        selectedDatasetName,
        onSelectDataset,
        onShowDataset,
        onOpenDatasetFolder,
        onRenameDataset,
        onCopyDataset,
        onDeleteDataset,
        workflows,
        selectedWorkflowName,
        workflowName,
        onSelectWorkflow,
        onLoadWorkflow,
        onRenameWorkflow,
        onCopyWorkflow,
        onDeleteWorkflow,
        onOpenWorkflowFolder,
    } = props;
    const [menu, setMenu] = useState<ContextMenuState | null>(null);

    const showMenu = useCallback((event: React.MouseEvent, items: ContextMenuState['items']) => {
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY, items });
    }, []);

    return (
        <section className="flex-1 min-h-0 flex flex-col">
            <div className="p-3 border-b border-[var(--glass-border)]">
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">文件管理器</h3>
                        <p className="text-[10px] text-[var(--text-muted)] mt-1">统一管理历史数据、模型、数据集与工作流</p>
                    </div>
                    <button
                        type="button"
                        onClick={onRefresh}
                        className="px-2 py-1 rounded-md text-[10px] text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)]"
                    >
                        刷新
                    </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setFileCategory('runs')} className={`rounded-md px-2 py-1.5 text-[11px] ${fileCategory === 'runs' ? 'bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]' : 'text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)]'}`}>历史数据</button>
                    <button type="button" onClick={() => setFileCategory('models')} className={`rounded-md px-2 py-1.5 text-[11px] ${fileCategory === 'models' ? 'bg-[var(--accent-purple)]/15 text-[var(--accent-purple)]' : 'text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)]'}`}>训练模型</button>
                    <button type="button" onClick={() => setFileCategory('datasets')} className={`rounded-md px-2 py-1.5 text-[11px] ${fileCategory === 'datasets' ? 'bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]' : 'text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)]'}`}>数据集</button>
                    <button type="button" onClick={() => setFileCategory('workflows')} className={`rounded-md px-2 py-1.5 text-[11px] ${fileCategory === 'workflows' ? 'bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]' : 'text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)]'}`}>工作流</button>
                </div>

                {fileCategory === 'runs' && (
                    <div className="mt-3 grid grid-cols-1 gap-2">
                        <button type="button" onClick={() => onAnalyzeRun(selectedRunId)} disabled={!selectedRunId || isLoading} className="px-2 py-1.5 rounded-md text-[11px] bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] disabled:opacity-40">切屏分析</button>
                    </div>
                )}

                {fileCategory === 'models' && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => onShowModel(selectedModelId)} disabled={!selectedModelId || isLoading} className="px-2 py-1.5 rounded-md text-[11px] bg-[var(--accent-purple)]/15 text-[var(--accent-purple)] disabled:opacity-40">查看详情</button>
                        <button type="button" onClick={() => onOpenModelFolder(selectedModelId)} disabled={!selectedModelId || isLoading} className="px-2 py-1.5 rounded-md text-[11px] text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-40">打开文件夹</button>
                    </div>
                )}

                {fileCategory === 'datasets' && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => onShowDataset(selectedDatasetName)} disabled={!selectedDatasetName || isLoading} className="px-2 py-1.5 rounded-md text-[11px] bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] disabled:opacity-40">查看详情</button>
                        <button type="button" onClick={() => onOpenDatasetFolder(selectedDatasetName)} disabled={!selectedDatasetName || isLoading} className="px-2 py-1.5 rounded-md text-[11px] text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-40">打开文件夹</button>
                    </div>
                )}

                {fileCategory === 'workflows' && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => onLoadWorkflow(selectedWorkflowName || workflowName)} disabled={!selectedWorkflowName || isLoading} className="px-2 py-1.5 rounded-md text-[11px] bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] disabled:opacity-40">编辑</button>
                        <button type="button" onClick={() => onRenameWorkflow(selectedWorkflowName || workflowName)} disabled={(!selectedWorkflowName && !workflowName) || isLoading} className="px-2 py-1.5 rounded-md text-[11px] bg-[var(--accent-purple)]/15 text-[var(--accent-purple)] disabled:opacity-40">重命名</button>
                        <button type="button" onClick={() => onOpenWorkflowFolder(selectedWorkflowName)} disabled={isLoading} className="col-span-2 px-2 py-1.5 rounded-md text-[11px] text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-40">在文件夹中打开</button>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
                {fileCategory === 'runs' && (
                    <>
                        {historyRuns.length === 0 && <div className="px-3 py-6 text-center text-xs text-[var(--text-muted)]">暂无历史运行</div>}
                        {historyRuns.map((item) => {
                            const active = selectedRunId === item.run_id;
                            return (
                                <button
                                    key={item.run_id}
                                    type="button"
                                    onClick={() => onSelectRun(item.run_id)}
                                    onDoubleClick={() => onAnalyzeRun(item.run_id)}
                                    onContextMenu={(event) => showMenu(event, [
                                        { label: '重命名', icon: '✏️', onClick: () => onRenameRun(item.run_id) },
                                        { label: '复制', icon: '📄', onClick: () => onCopyRun(item.run_id) },
                                        { label: '删除', icon: '🗑️', danger: true, onClick: () => onDeleteRun(item.run_id) },
                                        { label: '在文件夹中打开', icon: '📂', onClick: () => onOpenRunFolder(item.run_id) },
                                    ])}
                                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${active ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/10' : 'border-transparent hover:border-[var(--glass-border)] hover:bg-[rgba(255,255,255,0.04)]'}`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-medium text-[var(--text-primary)] truncate">{item.name || item.run_id}</span>
                                        <span className="text-[10px] text-[var(--text-muted)]">{item.summary?.total_anomalies ?? 0} 异常</span>
                                    </div>
                                    <div className="mt-1 text-[10px] text-[var(--text-muted)]">车辆 {item.summary?.total_vehicles ?? 0} · 时长 {formatDuration(item.summary?.simulation_time)}</div>
                                    <div className="mt-1 text-[10px] text-[var(--text-muted)]">{item.run_id}</div>
                                </button>
                            );
                        })}
                    </>
                )}

                {fileCategory === 'models' && (
                    <>
                        {models.length === 0 && <div className="px-3 py-6 text-center text-xs text-[var(--text-muted)]">暂无训练模型</div>}
                        {models.map((item) => {
                            const active = selectedModelId === item.model_id;
                            return (
                                <button
                                    key={item.model_id}
                                    type="button"
                                    onClick={() => {
                                        onSelectModel(item.model_id);
                                        onShowModel(item.model_id);
                                    }}
                                    onContextMenu={(event) => showMenu(event, [
                                        { label: '重命名', icon: '✏️', onClick: () => onRenameModel(item.model_id) },
                                        { label: '复制', icon: '📄', onClick: () => onCopyModel(item.model_id) },
                                        { label: '删除', icon: '🗑️', danger: true, onClick: () => onDeleteModel(item.model_id) },
                                        { label: '在文件夹中打开', icon: '📂', onClick: () => onOpenModelFolder(item.model_id) },
                                    ])}
                                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${active ? 'border-[var(--accent-purple)] bg-[var(--accent-purple)]/10' : 'border-transparent hover:border-[var(--glass-border)] hover:bg-[rgba(255,255,255,0.04)]'}`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-medium text-[var(--text-primary)] truncate">{item.model_id}</span>
                                        <span className="text-[10px] text-[var(--text-muted)]">{formatSize(item.size)}</span>
                                    </div>
                                    <div className="mt-1 text-[10px] text-[var(--text-muted)]">F1 {item.meta?.metrics?.f1_macro !== undefined ? `${(item.meta.metrics.f1_macro * 100).toFixed(1)}%` : '--'} · 训练样本 {item.meta?.trained_samples ?? 0}</div>
                                </button>
                            );
                        })}
                    </>
                )}

                {fileCategory === 'datasets' && (
                    <>
                        {datasets.length === 0 && <div className="px-3 py-6 text-center text-xs text-[var(--text-muted)]">暂无训练数据集</div>}
                        {datasets.map((item) => {
                            const active = selectedDatasetName === item.name;
                            return (
                                <button
                                    key={item.name}
                                    type="button"
                                    onClick={() => {
                                        onSelectDataset(item.name);
                                        onShowDataset(item.name);
                                    }}
                                    onContextMenu={(event) => showMenu(event, [
                                        { label: '重命名', icon: '✏️', onClick: () => onRenameDataset(item.name) },
                                        { label: '复制', icon: '📄', onClick: () => onCopyDataset(item.name) },
                                        { label: '删除', icon: '🗑️', danger: true, onClick: () => onDeleteDataset(item.name) },
                                        { label: '在文件夹中打开', icon: '📂', onClick: () => onOpenDatasetFolder(item.name) },
                                    ])}
                                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${active ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/10' : 'border-transparent hover:border-[var(--glass-border)] hover:bg-[rgba(255,255,255,0.04)]'}`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-medium text-[var(--text-primary)] truncate">{item.name}</span>
                                        <span className="text-[10px] text-[var(--text-muted)]">{item.meta?.total_samples ?? 0} 样本</span>
                                    </div>
                                    <div className="mt-1 text-[10px] text-[var(--text-muted)]">特征 {item.meta?.feature_names?.length ?? 0} · 窗口 {item.meta?.window_size_steps ?? '--'}</div>
                                </button>
                            );
                        })}
                    </>
                )}

                {fileCategory === 'workflows' && (
                    <>
                        {workflows.length === 0 && <div className="px-3 py-6 text-center text-xs text-[var(--text-muted)]">暂无已保存工作流</div>}
                        {workflows.map((item) => {
                            const active = selectedWorkflowName === item.name;
                            return (
                                <button
                                    key={item.file_name}
                                    type="button"
                                    onClick={() => onSelectWorkflow(item.name)}
                                    onDoubleClick={() => onLoadWorkflow(item.name)}
                                    onContextMenu={(event) => showMenu(event, [
                                        { label: '重命名', icon: '✏️', onClick: () => onRenameWorkflow(item.name) },
                                        { label: '复制', icon: '📄', onClick: () => onCopyWorkflow(item.name) },
                                        { label: '删除', icon: '🗑️', danger: true, onClick: () => onDeleteWorkflow(item.name) },
                                        { label: '在文件夹中打开', icon: '📂', onClick: () => onOpenWorkflowFolder(item.name) },
                                    ])}
                                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${active ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/10' : 'border-transparent hover:border-[var(--glass-border)] hover:bg-[rgba(255,255,255,0.04)]'}`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-medium text-[var(--text-primary)] truncate">{item.name}</span>
                                        <span className="text-[10px] text-[var(--text-muted)]">{item.rule_count} 条</span>
                                    </div>
                                    <div className="mt-1 text-[10px] text-[var(--text-muted)] line-clamp-2">{item.description || '无描述'}</div>
                                    <div className="mt-1 text-[10px] text-[var(--text-muted)]">更新时间 {formatTime(item.modified_at)}</div>
                                </button>
                            );
                        })}
                    </>
                )}
            </div>
            <ContextMenu menu={menu} onClose={() => setMenu(null)} />
        </section>
    );
}
