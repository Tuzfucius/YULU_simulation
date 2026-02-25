import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useI18nStore } from '../../stores/i18nStore';
import { HeatmapChart } from '../charts/HeatmapChart';
import { TimelineChart } from '../charts/TimelineChart';
import { ResidualChart } from '../charts/ResidualChart';
import { DriftChart } from '../charts/DriftChart';

interface FileInfo {
    name: string;
    path: string;
    size: number;
    modified: number;
    meta?: {
        vehicles?: number;
        anomalies?: number;
        sim_time?: number;
        ml_samples?: number;
    };
}

interface DatasetInfo {
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

// ml_dataset JSON 结构示例 (供右侧预览面板展示)
const DATASET_STRUCTURE_EXAMPLE = `{
  "metadata": {
    "feature_names": [
      "delta_t_mean",   // 平均行程时间(s)
      "delta_t_std",    // 行程时间标准差
      "avg_speed_out",  // 出口平均速度(km/h)
      "flow_in",        // 进入车流量
      "flow_out",       // 驶出车流量
      "flow_ratio"      // 流量比 (出/进)
    ],
    "window_size": 5,   // 滑动窗口步数
    "step_seconds": 60  // 每步时长(秒)
  },
  "samples": [
    {
      "sample_id": "seg_0_t5",
      "X_sequence": [   // 5步 × 6维特征
        [12.3, 1.1, 95.2, 8, 7, 0.87],
        [13.5, 1.8, 88.1, 10, 8, 0.80],
        [18.7, 4.2, 65.3, 12, 6, 0.50],
        [25.1, 6.8, 42.0, 15, 4, 0.27],
        [30.2, 8.1, 28.5, 18, 3, 0.17]
      ],
      "Y_sequence": [0, 0, 1, 2, 3]
      // 0=正常  1=轻微拥堵
      // 2=中度拥堵  3=严重拥堵
    }
  ]
}`;

export function PredictBuilderPage() {
    const { lang } = useI18nStore();
    // Section A: 历史文件 + 转换
    const [availableFiles, setAvailableFiles] = useState<FileInfo[]>([]);
    const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [stepSeconds, setStepSeconds] = useState(60);
    const [windowSize, setWindowSize] = useState(5);
    const [selectedExtraFeatures, setSelectedExtraFeatures] = useState<string[]>([]);
    const [extracting, setExtracting] = useState(false);
    const [extractResult, setExtractResult] = useState<any>(null);

    // Section B: 数据集 + 训练
    const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
    const [selectedDataset, setSelectedDataset] = useState<string>('');
    const [modelType, setModelType] = useState('xgboost_flat');
    const [hyperparams, setHyperparams] = useState({ n_estimators: 100, max_depth: 10 });
    const [loading, setLoading] = useState(false);
    const [trainingResult, setTrainingResult] = useState<any>(null);

    // Section B2: 已保存模型导入 + 评估
    interface ModelMeta { model_id: string; created_at: string; source_datasets: string[]; source_simulations: string[]; model_type: string; metrics: any; trained_samples: number; }
    interface ModelInfo { model_id: string; filename: string; size: number; created_at: number; meta?: ModelMeta | null; }
    const [savedModels, setSavedModels] = useState<ModelInfo[]>([]);
    const [selectedModel, setSelectedModel] = useState('');
    const [loadingModel, setLoadingModel] = useState(false);
    const [loadedModelId, setLoadedModelId] = useState<string | null>(null);
    const [evalDataset, setEvalDataset] = useState('');
    const [evaluating, setEvaluating] = useState(false);
    const [customExpressions, setCustomExpressions] = useState('');
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    // 获取历史仿真文件列表
    useEffect(() => {
        setFetchError(null);
        fetch('/api/prediction/results')
            .then(res => res.json())
            .then(data => { if (data.files) setAvailableFiles(data.files); })
            .catch(() => setFetchError(lang === 'zh' ? '无法连接后端，请确认后端服务已启动' : 'Cannot connect to backend'));
    }, []);

    // 获取已提取数据集列表
    const refreshDatasets = () => {
        fetch('/api/prediction/datasets')
            .then(res => res.json())
            .then(data => { if (data.datasets) setDatasets(data.datasets); })
            .catch(() => { });
    };
    useEffect(() => { refreshDatasets(); }, []);

    // 获取已保存模型列表
    const refreshModels = () => {
        fetch('/api/prediction/models')
            .then(res => res.json())
            .then(data => { if (data.models) setSavedModels(data.models); })
            .catch(() => { });
    };
    useEffect(() => { refreshModels(); }, []);

    const toggleFile = (filePath: string) => {
        setSelectedFiles(prev =>
            prev.includes(filePath) ? prev.filter(f => f !== filePath) : [...prev, filePath]
        );
    };

    // 转换历史数据为训练数据集
    const handleExtract = async () => {
        if (selectedFiles.length === 0) return;
        setExtracting(true);
        setExtractResult(null);
        try {
            const res = await fetch('/api/prediction/extract-dataset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_names: selectedFiles,
                    step_seconds: stepSeconds,
                    window_size_steps: windowSize,
                    selected_features: selectedExtraFeatures,
                    custom_expressions: customExpressions.split('\n').filter(l => l.trim()),
                }),
            });
            const data = await res.json();
            if (data.status === 'success') {
                setExtractResult(data);
                refreshDatasets();
            } else {
                alert(data.detail || '提取失败');
            }
        } catch (err) {
            alert('网络错误');
        } finally {
            setExtracting(false);
        }
    };

    // 训练模型 (使用已提取的数据集)
    const handleTrain = async () => {
        if (!selectedDataset) {
            alert(lang === 'zh' ? '请在 Section B 选择一个数据集' : 'Please select a dataset');
            return;
        }
        setLoading(true);
        try {
            const res = await fetch('/api/prediction/train', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_names: [selectedDataset + '.json'],
                    model_type: modelType,
                    hyperparameters: hyperparams,
                    step_seconds: stepSeconds,
                    window_size_steps: windowSize,
                    selected_features: selectedExtraFeatures,
                }),
            });
            const data = await res.json();
            if (data.status === 'success') {
                setTrainingResult(data);
                refreshModels();
            } else {
                alert(data.detail || 'Training failed');
            }
        } catch (err) {
            alert('Network error');
        } finally {
            setLoading(false);
        }
    };

    // 加载已保存的模型
    const handleLoadModel = async () => {
        if (!selectedModel) return;
        setLoadingModel(true);
        try {
            const res = await fetch('/api/prediction/load', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model_id: selectedModel }),
            });
            const data = await res.json();
            if (data.status === 'success') {
                setLoadedModelId(selectedModel);
            } else {
                alert(data.detail || '模型加载失败');
            }
        } catch { alert('网络错误'); }
        finally { setLoadingModel(false); }
    };

    // 用已加载的模型对数据集进行评估
    const handleEvaluate = async () => {
        if (!loadedModelId || !evalDataset) return;
        setEvaluating(true);
        try {
            const res = await fetch('/api/prediction/evaluate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_name: evalDataset }),
            });
            const data = await res.json();
            if (data.status === 'success') {
                setTrainingResult(data);
            } else {
                alert(data.detail || '评估失败');
            }
        } catch { alert('网络错误'); }
        finally { setEvaluating(false); }
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const nFeatures = 6 + selectedExtraFeatures.length;

    return (
        <div className="h-full flex flex-col relative overflow-hidden bg-[var(--bg-base)] text-[var(--text-primary)]">
            {/* 顶部标题区 */}
            <div className="h-16 shrink-0 flex items-center px-6 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md z-10">
                <h1 className="text-lg font-semibold flex items-center gap-3">
                    <span className="text-xl">🧠</span>
                    {lang === 'zh' ? '时序预测智能工作台' : 'Predictive Model Builder'}
                </h1>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* ========== 左侧边栏 ========== */}
                <aside className={`${sidebarCollapsed ? 'w-12' : 'w-72'} shrink-0 border-r border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md flex flex-col transition-[width] duration-300 overflow-hidden`}>
                    {/* 折叠按钮 */}
                    <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="h-10 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-xs border-b border-[var(--glass-border)]">
                        {sidebarCollapsed ? '▶' : '◀ 收起'}
                    </button>

                    {!sidebarCollapsed && (
                        <div className="flex-1 overflow-y-auto p-3 space-y-4">
                            {/* --- 已保存模型 --- */}
                            <div>
                                <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center gap-1.5">📦 {lang === 'zh' ? '已保存模型' : 'Saved Models'}</h3>
                                <div className="space-y-1.5">
                                    {savedModels.length === 0 && <div className="text-[10px] text-[var(--text-muted)] py-2">暂无已保存模型</div>}
                                    {savedModels.map(m => {
                                        const isSelected = selectedModel === m.model_id;
                                        const f1 = m.meta?.metrics?.f1_macro;
                                        const srcDs = m.meta?.source_datasets || [];
                                        return (
                                            <div key={m.model_id}
                                                onClick={() => { setSelectedModel(m.model_id); setLoadedModelId(null); }}
                                                className={`p-2 rounded-md cursor-pointer transition-all text-[11px] border ${isSelected ? 'border-[var(--accent-purple)] bg-[var(--accent-purple)]/10' : 'border-transparent hover:bg-[rgba(255,255,255,0.04)]'
                                                    }`}>
                                                <div className="font-medium truncate" title={m.model_id}>🌲 {m.model_id}</div>
                                                <div className="text-[var(--text-muted)] mt-0.5 flex gap-2">
                                                    <span>{formatSize(m.size)}</span>
                                                    {f1 !== undefined && <span className="text-green-400">F1:{(f1 * 100).toFixed(0)}%</span>}
                                                </div>
                                                {srcDs.length > 0 && (
                                                    <div className="text-[var(--text-muted)] mt-0.5 truncate" title={srcDs.join(', ')}>
                                                        ← {srcDs.map(s => s.replace('.json', '')).join(', ')}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="h-px bg-[var(--glass-border)]" />

                            {/* --- 已提取数据集 --- */}
                            <div>
                                <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center gap-1.5">📊 {lang === 'zh' ? '已提取数据集' : 'Datasets'}</h3>
                                <div className="space-y-1.5">
                                    {datasets.length === 0 && <div className="text-[10px] text-[var(--text-muted)] py-2">暂无数据集</div>}
                                    {datasets.map(ds => {
                                        // 检查是否被当前选中的模型关联
                                        const activeModel = savedModels.find(m => m.model_id === selectedModel);
                                        const isLinked = activeModel?.meta?.source_datasets?.some(s => s.replace('.json', '') === ds.name) || false;
                                        return (
                                            <div key={ds.name}
                                                onClick={() => { setSelectedDataset(ds.name); setEvalDataset(ds.name); }}
                                                className={`p-2 rounded-md cursor-pointer transition-all text-[11px] border ${isLinked ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 ring-1 ring-[var(--accent-blue)]/30'
                                                    : (selectedDataset === ds.name ? 'border-[var(--accent-blue)]/50 bg-[rgba(255,255,255,0.04)]' : 'border-transparent hover:bg-[rgba(255,255,255,0.04)]')
                                                    }`}>
                                                <div className="font-medium truncate">📊 {ds.name}</div>
                                                <div className="text-[var(--text-muted)] mt-0.5">
                                                    {ds.meta?.total_samples || 0} 样本
                                                    {isLinked && <span className="text-[var(--accent-blue)] ml-1">← 关联</span>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </aside>

                {/* ========== 右侧主区域 ========== */}
                <div className="flex-1 overflow-y-auto p-8">
                    <div className="max-w-7xl mx-auto space-y-8">

                        {/* =================== A区：数据采集 + 转换 =================== */}
                        <section className="glass-card p-6">
                            <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                                <span className="text-[var(--accent-blue)]">■</span>
                                {lang === 'zh' ? 'A. 训练数据采集池' : 'A. Data Pipeline'}
                            </h2>

                            <div className="flex gap-6">
                                {/* 左栏：文件 + 参数 + 转换 */}
                                <div className="flex-[3] space-y-5">
                                    {/* 历史文件卡片 */}
                                    <div>
                                        <h3 className="text-xs text-[var(--text-muted)] mb-2 uppercase tracking-wider">
                                            {lang === 'zh' ? '📂 历史仿真记录' : '📂 Simulation History'}
                                        </h3>
                                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 max-h-52 overflow-y-auto pr-1">
                                            {availableFiles.map(file => (
                                                <div
                                                    key={file.path}
                                                    onClick={() => toggleFile(file.path)}
                                                    className={`p-2.5 rounded-lg border cursor-pointer transition-all text-xs ${selectedFiles.includes(file.path)
                                                        ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 ring-1 ring-[var(--accent-blue)]'
                                                        : 'border-[var(--glass-border)] hover:bg-[rgba(255,255,255,0.05)]'
                                                        }`}
                                                >
                                                    <div className="font-medium truncate" title={file.name}>📁 {file.name}</div>
                                                    <div className="text-[var(--text-muted)] mt-1 flex items-center gap-1.5">
                                                        <span>{formatSize(file.size)}</span>
                                                        <span>·</span>
                                                        <span>{new Date(file.modified * 1000).toLocaleDateString()}</span>
                                                    </div>
                                                    {file.meta && (
                                                        <div className="text-[var(--text-secondary)] mt-1 space-x-1.5">
                                                            {file.meta.vehicles && <span>🚗{file.meta.vehicles}</span>}
                                                            {file.meta.anomalies !== undefined && <span>⚠️{file.meta.anomalies}</span>}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                            {availableFiles.length === 0 && !fetchError && (
                                                <div className="text-[var(--text-muted)] text-sm col-span-full py-4">
                                                    {lang === 'zh' ? '暂无历史仿真数据。请先在仿真控制页跑一次仿真，然后重启后端。' : 'No simulation data. Run a simulation first.'}
                                                </div>
                                            )}
                                            {fetchError && (
                                                <div className="text-red-400 text-sm col-span-full">⚠️ {fetchError}</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* 数据集提取参数 */}
                                    <div className="border-t border-[var(--glass-border)] pt-4">
                                        <h3 className="text-xs text-[var(--text-muted)] mb-3 uppercase tracking-wider">
                                            🔧 {lang === 'zh' ? '数据集提取参数' : 'Extraction Parameters'}
                                        </h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-xs text-[var(--text-muted)] block mb-1">
                                                    {lang === 'zh' ? '时间步长' : 'Time Step'} <span className="text-[var(--text-primary)]">{stepSeconds}s</span>
                                                </label>
                                                <input type="range" min={30} max={120} step={10} value={stepSeconds}
                                                    onChange={e => setStepSeconds(Number(e.target.value))}
                                                    className="w-full accent-[var(--accent-blue)]" />
                                            </div>
                                            <div>
                                                <label className="text-xs text-[var(--text-muted)] block mb-1">
                                                    {lang === 'zh' ? '窗口步数' : 'Window'} <span className="text-[var(--text-primary)]">{windowSize}</span>
                                                </label>
                                                <input type="range" min={3} max={10} step={1} value={windowSize}
                                                    onChange={e => setWindowSize(Number(e.target.value))}
                                                    className="w-full accent-[var(--accent-blue)]" />
                                            </div>
                                        </div>
                                        {/* 可选扩展特征 */}
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {[
                                                { id: 'speed_variance', label: lang === 'zh' ? '速度方差' : 'Speed Var' },
                                                { id: 'occupancy', label: lang === 'zh' ? '占有率' : 'Occupancy' },
                                                { id: 'headway_mean', label: lang === 'zh' ? '车头时距' : 'Headway' },
                                            ].map(feat => (
                                                <label key={feat.id}
                                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border cursor-pointer text-xs transition-all ${selectedExtraFeatures.includes(feat.id)
                                                        ? 'border-[var(--accent-green)] bg-[var(--accent-green)]/10 text-[var(--accent-green)]'
                                                        : 'border-[var(--glass-border)] text-[var(--text-secondary)]'
                                                        }`}>
                                                    <input type="checkbox" checked={selectedExtraFeatures.includes(feat.id)}
                                                        onChange={() => setSelectedExtraFeatures(prev =>
                                                            prev.includes(feat.id) ? prev.filter(f => f !== feat.id) : [...prev, feat.id]
                                                        )}
                                                        className="sr-only" />
                                                    <span className="w-3 h-3 rounded border flex items-center justify-center text-[9px]"
                                                        style={{ borderColor: selectedExtraFeatures.includes(feat.id) ? 'var(--accent-green)' : 'var(--glass-border)' }}>
                                                        {selectedExtraFeatures.includes(feat.id) && '✓'}
                                                    </span>
                                                    {feat.label}
                                                </label>
                                            ))}
                                        </div>

                                        {/* 自定义派生特征 */}
                                        <div className="mt-3">
                                            <label className="text-xs text-[var(--text-muted)] block mb-1 flex items-center gap-1.5">
                                                ✏️ {lang === 'zh' ? '自定义派生特征 (每行一个)' : 'Custom Feature Expressions (one per line)'}
                                            </label>
                                            <textarea
                                                value={customExpressions}
                                                onChange={e => setCustomExpressions(e.target.value)}
                                                placeholder={`speed_drop = avg_speed.shift(1) - avg_speed\nflow_ratio = flow / density\naccel = avg_speed.diff()`}
                                                className="w-full bg-[rgba(0,0,0,0.2)] border border-[var(--glass-border)] rounded-md px-3 py-2 text-[11px] font-mono focus:outline-none focus:border-[var(--accent-blue)] resize-y min-h-[60px]"
                                                rows={3}
                                            />
                                            <div className="text-[9px] text-[var(--text-muted)] mt-1">
                                                {lang === 'zh'
                                                    ? '可用变量: avg_speed, flow, density｜支持: .shift(), .diff(), .rolling(N).mean(), 四则运算'
                                                    : 'Variables: avg_speed, flow, density | Ops: .shift(), .diff(), .rolling(N).mean(), arithmetic'}
                                            </div>
                                        </div>

                                        {/* 维度提示 */}
                                        <div className="mt-2 text-[10px] text-[var(--text-muted)]">
                                            {lang === 'zh'
                                                ? `特征维度: ${nFeatures}${customExpressions.split('\n').filter(l => l.trim()).length > 0 ? '+' + customExpressions.split('\n').filter(l => l.trim()).length : ''} 维 × ${windowSize} 步`
                                                : `Dims: ${nFeatures}${customExpressions.split('\n').filter(l => l.trim()).length > 0 ? '+' + customExpressions.split('\n').filter(l => l.trim()).length : ''} × ${windowSize} steps`}
                                        </div>
                                    </div>

                                    {/* 转换按钮 + 结果 */}
                                    <button
                                        onClick={handleExtract}
                                        disabled={extracting || selectedFiles.length === 0}
                                        className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-md font-medium hover:from-blue-500 hover:to-cyan-500 disabled:opacity-40 transition-all flex justify-center items-center gap-2"
                                    >
                                        {extracting && <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />}
                                        {lang === 'zh'
                                            ? (extracting ? '正在提取...' : `🔄 转换为训练数据集 (${selectedFiles.length} 个文件)`)
                                            : (extracting ? 'Extracting...' : `🔄 Extract Dataset (${selectedFiles.length} files)`)}
                                    </button>
                                    {extractResult && (
                                        <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                                            className="text-xs text-green-400 bg-green-400/10 border border-green-400/30 rounded-md px-3 py-2">
                                            ✅ {lang === 'zh' ? '提取成功' : 'Success'}:
                                            <span className="font-mono ml-1">{extractResult.dataset_name}</span> ·
                                            {extractResult.total_samples} 样本 ·
                                            {extractResult.input_vector_dim}维输入
                                        </motion.div>
                                    )}
                                </div>

                                {/* 右栏：数据集结构预览 */}
                                <div className="flex-[2] bg-[rgba(0,0,0,0.25)] border border-[var(--glass-border)] rounded-lg p-4 overflow-hidden flex flex-col">
                                    <h3 className="text-xs text-[var(--text-muted)] mb-2 uppercase tracking-wider flex items-center gap-1.5">
                                        📋 {lang === 'zh' ? '数据集结构预览' : 'Dataset Structure'}
                                    </h3>
                                    <pre className="flex-1 overflow-auto text-[10px] leading-relaxed text-[var(--text-secondary)] font-mono whitespace-pre">
                                        {DATASET_STRUCTURE_EXAMPLE}
                                    </pre>
                                    <div className="mt-2 pt-2 border-t border-[var(--glass-border)] text-[10px] text-[var(--text-muted)] space-y-0.5">
                                        <div>• <b>X_sequence</b>: {windowSize}步 × {nFeatures}维特征矩阵</div>
                                        <div>• <b>Y_sequence</b>: 每步的交通状态标签 (0~3)</div>
                                        <div>• 训练时展平为 <b>{nFeatures * windowSize}维</b> 输入向量</div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* =================== B区：模型训练 =================== */}
                        <section className="glass-card p-6">
                            <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                                <span className="text-[var(--accent-purple)]">■</span>
                                {lang === 'zh' ? 'B. 模型引擎与超参调优' : 'B. Model Engine & Tuning'}
                            </h2>
                            <div className="flex gap-8">
                                <div className="w-1/3 space-y-4">
                                    {/* 数据集选择 */}
                                    <div>
                                        <label className="block text-sm text-[var(--text-secondary)] mb-1">
                                            {lang === 'zh' ? '选择训练数据集' : 'Select Dataset'}
                                        </label>
                                        <select
                                            value={selectedDataset}
                                            onChange={(e) => setSelectedDataset(e.target.value)}
                                            className="w-full bg-[rgba(0,0,0,0.2)] border border-[var(--glass-border)] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent-blue)]"
                                        >
                                            <option value="">{lang === 'zh' ? '-- 请先在 A 区提取数据集 --' : '-- Extract dataset first --'}</option>
                                            {datasets.map(ds => (
                                                <option key={ds.name} value={ds.name}>
                                                    📊 {ds.name} ({ds.meta?.total_samples || 0} 样本)
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* 模型类型 */}
                                    <div>
                                        <label className="block text-sm text-[var(--text-secondary)] mb-1">
                                            {lang === 'zh' ? '模型架构' : 'Model Architecture'}
                                        </label>
                                        <select
                                            value={modelType}
                                            onChange={(e) => setModelType(e.target.value)}
                                            className="w-full bg-[rgba(0,0,0,0.2)] border border-[var(--glass-border)] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent-blue)]"
                                        >
                                            <option value="xgboost_flat">🌲 Random Forest / XGBoost (Flat Seq)</option>
                                            <option value="lstm_seq" disabled>🔄 LSTM Sequence Network (Coming Soon)</option>
                                        </select>
                                    </div>

                                    {modelType === 'xgboost_flat' && (
                                        <>
                                            <div>
                                                <label className="flex justify-between text-sm text-[var(--text-secondary)] mb-1">
                                                    <span>{lang === 'zh' ? '最大树深度' : 'Max Depth'}</span>
                                                    <span>{hyperparams.max_depth}</span>
                                                </label>
                                                <input type="range" min="3" max="20"
                                                    value={hyperparams.max_depth}
                                                    onChange={(e) => setHyperparams({ ...hyperparams, max_depth: parseInt(e.target.value) })}
                                                    className="w-full accent-[var(--accent-purple)]" />
                                            </div>
                                            <div>
                                                <label className="flex justify-between text-sm text-[var(--text-secondary)] mb-1">
                                                    <span>{lang === 'zh' ? '基学习器数量' : 'N Estimators'}</span>
                                                    <span>{hyperparams.n_estimators}</span>
                                                </label>
                                                <input type="range" min="10" max="300" step="10"
                                                    value={hyperparams.n_estimators}
                                                    onChange={(e) => setHyperparams({ ...hyperparams, n_estimators: parseInt(e.target.value) })}
                                                    className="w-full accent-[var(--accent-purple)]" />
                                            </div>
                                        </>
                                    )}

                                    <button
                                        onClick={handleTrain}
                                        disabled={loading || !selectedDataset}
                                        className="w-full py-2.5 mt-4 bg-[var(--accent-blue)] text-white rounded-md font-medium hover:bg-blue-600 disabled:opacity-50 transition-all flex justify-center items-center gap-2"
                                    >
                                        {loading && <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />}
                                        {lang === 'zh' ? (loading ? '正在训练...' : '🚀 开始拟合训练') : (loading ? 'Training...' : '🚀 Start Training')}
                                    </button>

                                    {/* 分隔线 — 或者直接导入已有模型 */}
                                    <div className="flex items-center gap-3 mt-6 mb-2">
                                        <div className="flex-1 h-px bg-[var(--glass-border)]" />
                                        <span className="text-xs text-[var(--text-muted)]">{lang === 'zh' ? '或导入已训练模型' : 'Or load saved model'}</span>
                                        <div className="flex-1 h-px bg-[var(--glass-border)]" />
                                    </div>

                                    <div>
                                        <label className="block text-sm text-[var(--text-secondary)] mb-1">
                                            {lang === 'zh' ? '选择已保存模型' : 'Select Saved Model'}
                                        </label>
                                        <select
                                            value={selectedModel}
                                            onChange={(e) => { setSelectedModel(e.target.value); setLoadedModelId(null); }}
                                            className="w-full bg-[rgba(0,0,0,0.2)] border border-[var(--glass-border)] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent-purple)]"
                                        >
                                            <option value="">{lang === 'zh' ? '-- 无已保存模型 --' : '-- No saved models --'}</option>
                                            {savedModels.map(m => (
                                                <option key={m.model_id} value={m.model_id}>
                                                    📦 {m.model_id} ({formatSize(m.size)})
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <button
                                        onClick={handleLoadModel}
                                        disabled={loadingModel || !selectedModel}
                                        className="w-full py-2 bg-[var(--accent-purple)] text-white rounded-md text-sm font-medium hover:bg-purple-600 disabled:opacity-50 transition-all flex justify-center items-center gap-2"
                                    >
                                        {loadingModel && <span className="animate-spin inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full" />}
                                        {lang === 'zh' ? (loadingModel ? '正在加载...' : '📥 将模型加载到内存') : (loadingModel ? 'Loading...' : '📥 Load Model')}
                                    </button>

                                    {loadedModelId && (
                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-green-400 bg-green-400/10 border border-green-400/30 rounded-md px-3 py-2">
                                            ✅ 模型 <span className="font-mono">{loadedModelId}</span> 已就绪
                                        </motion.div>
                                    )}

                                    {loadedModelId && (
                                        <>
                                            <div>
                                                <label className="block text-sm text-[var(--text-secondary)] mb-1">
                                                    {lang === 'zh' ? '选择评估数据集' : 'Select Eval Dataset'}
                                                </label>
                                                <select
                                                    value={evalDataset}
                                                    onChange={(e) => setEvalDataset(e.target.value)}
                                                    className="w-full bg-[rgba(0,0,0,0.2)] border border-[var(--glass-border)] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent-purple)]"
                                                >
                                                    <option value="">{lang === 'zh' ? '-- 选择数据集 --' : '-- Select --'}</option>
                                                    {datasets.map(ds => (
                                                        <option key={ds.name} value={ds.name}>
                                                            📊 {ds.name} ({ds.meta?.total_samples || 0} 样本)
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <button
                                                onClick={handleEvaluate}
                                                disabled={evaluating || !evalDataset}
                                                className="w-full py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-md text-sm font-medium hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 transition-all flex justify-center items-center gap-2"
                                            >
                                                {evaluating && <span className="animate-spin inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full" />}
                                                {lang === 'zh' ? (evaluating ? '评估中...' : '🔍 运行评估') : (evaluating ? 'Evaluating...' : '🔍 Run Evaluation')}
                                            </button>
                                        </>
                                    )}
                                </div>

                                {/* 训练结果面板 */}
                                <div className="flex-1 bg-[rgba(0,0,0,0.2)] border border-[var(--glass-border)] rounded-lg p-6 relative overflow-hidden">
                                    {!trainingResult && !loading && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--text-muted)]">
                                            <span className="text-4xl mb-4">💤</span>
                                            <p>{lang === 'zh' ? '等待发起训练任务...' : 'Waiting to start training...'}</p>
                                        </div>
                                    )}
                                    {loading && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--accent-blue)]">
                                            <div className="text-center font-mono text-sm space-y-2">
                                                <p>Fitting model on dataset: {selectedDataset}...</p>
                                                <p>Flattening T={windowSize} windows...</p>
                                            </div>
                                        </div>
                                    )}
                                    {trainingResult && !loading && (
                                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="h-full flex flex-col">
                                            <h3 className="text-lg font-medium text-green-400 mb-4 flex items-center gap-2">
                                                <span>✓</span> {lang === 'zh' ? '训练完毕' : 'Training Complete'}
                                            </h3>
                                            <div className="grid grid-cols-3 gap-4 mb-6">
                                                <div className="bg-[rgba(255,255,255,0.05)] p-4 rounded-md text-center border border-[var(--glass-border)]">
                                                    <div className="text-[var(--text-secondary)] text-sm">F1-Score</div>
                                                    <div className="text-2xl font-bold mt-1 text-white">{(trainingResult.metrics.f1_macro * 100).toFixed(1)}<span className="text-sm font-normal text-gray-400">%</span></div>
                                                </div>
                                                <div className="bg-[rgba(255,255,255,0.05)] p-4 rounded-md text-center border border-[var(--glass-border)]">
                                                    <div className="text-[var(--text-secondary)] text-sm">Precision</div>
                                                    <div className="text-2xl font-bold mt-1 text-white">{(trainingResult.metrics.precision_macro * 100).toFixed(1)}<span className="text-sm font-normal text-gray-400">%</span></div>
                                                </div>
                                                <div className="bg-[rgba(255,255,255,0.05)] p-4 rounded-md text-center border border-[var(--glass-border)]">
                                                    <div className="text-[var(--text-secondary)] text-sm">Recall</div>
                                                    <div className="text-2xl font-bold mt-1 text-[var(--accent-red)]">{(trainingResult.metrics.recall_macro * 100).toFixed(1)}<span className="text-sm font-normal text-[var(--accent-red)]">%</span></div>
                                                </div>
                                            </div>
                                            <div className="flex-1 overflow-y-auto pr-2">
                                                <h4 className="text-sm text-[var(--text-secondary)] mb-2">Feature Importance</h4>
                                                <div className="space-y-3">
                                                    {Object.entries(trainingResult.feature_importances)
                                                        .sort((a, b) => (b[1] as number) - (a[1] as number))
                                                        .map(([feat, imp]) => (
                                                            <div key={feat}>
                                                                <div className="flex justify-between text-xs mb-1">
                                                                    <span>{feat}</span>
                                                                    <span className="text-[var(--text-secondary)]">{((imp as number) * 100).toFixed(1)}%</span>
                                                                </div>
                                                                <div className="h-1.5 w-full bg-[rgba(255,255,255,0.1)] rounded-full overflow-hidden">
                                                                    <div className="h-full bg-[var(--accent-purple)] rounded-full"
                                                                        style={{ width: `${(imp as number) * 100}%` }} />
                                                                </div>
                                                            </div>
                                                        ))}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </div>
                            </div>
                        </section>

                        {/* C区：评估大屏 */}
                        <section className="glass-card p-6">
                            <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                                <span className="text-[var(--accent-red)]">■</span>
                                {lang === 'zh' ? 'C. 交互式评测大屏 (Evaluation Dashboard)' : 'C. Evaluation Dashboard'}
                            </h2>
                            <div className="flex flex-col gap-6">
                                {!trainingResult || !trainingResult.test_context ? (
                                    <div className="h-[400px] border border-[var(--glass-border)] rounded-lg bg-[rgba(0,0,0,0.1)] flex items-center justify-center text-[var(--text-muted)]">
                                        {lang === 'zh' ? '训练完成后渲染多维交互式结果...' : 'Waiting for multidimensional validation results...'}
                                    </div>
                                ) : (
                                    (() => {
                                        const { predict_results, ground_truth_anomalies, segment_speed_history } = trainingResult.test_context;

                                        // 组装时间线
                                        const timelineAlerts = predict_results.filter((p: any) => p.y_pred > 0).map((p: any) => ({
                                            timestamp: p.timestamp, label: `预警: ${p.target_segment}`, type: 'alert', severity: p.y_pred === 3 ? 'critical' : 'medium'
                                        }));
                                        const timelineTruths = ground_truth_anomalies.map((gt: any) => ({
                                            timestamp: gt.time, label: `真实异常 (类型 ${gt.type})`, type: 'truth'
                                        }));

                                        // 组装热力图 (预警分布)
                                        const heatmapData = predict_results.map((p: any) => {
                                            const match = p.target_segment.match(/\d+/g);
                                            const pos = match ? parseInt(match[0], 10) : 0;
                                            return { position: pos, time: Math.floor(p.timestamp / 60), intensity: p.y_pred ? (p.y_pred / 3) : 0 };
                                        });

                                        // 计算总体评价指标中的详细真假阳性
                                        const confMatrix = trainingResult.metrics.confusion_matrix || [[0, 0], [0, 0]];
                                        // 由于是多分类，简化取类总和（除对角线外的均视为误差等）
                                        // 下面仅用来配合原有展示的占位变量，原预测工作台已在 B 区展示了宏观 P/R/F1

                                        return (
                                            <div className="space-y-6">
                                                {/* 图表组 1：宏观时空评估 */}
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="rounded-xl border border-[var(--glass-border)] bg-[rgba(0,0,0,0.15)] p-4">
                                                        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                                                            <span>🗺️</span> 预警分布热力图
                                                        </h3>
                                                        <HeatmapChart
                                                            data={heatmapData}
                                                            maxPosition={6}
                                                            timeBins={15}
                                                            width={520}
                                                            height={230}
                                                            title=""
                                                        />
                                                    </div>
                                                    <div className="rounded-xl border border-[var(--glass-border)] bg-[rgba(0,0,0,0.15)] p-4">
                                                        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                                                            <span>📈</span> 动作事件时间轴
                                                        </h3>
                                                        <TimelineChart
                                                            alerts={timelineAlerts}
                                                            truths={timelineTruths}
                                                            duration={900}
                                                            width={520}
                                                            height={230}
                                                        />
                                                    </div>
                                                </div>

                                                {/* 图表组 2：微观差距分析 */}
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="rounded-xl border border-[var(--glass-border)] bg-[rgba(0,0,0,0.15)] p-4">
                                                        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                                                            <span>🔬</span> 残差拟合验证 (Residual Curve)
                                                        </h3>
                                                        <ResidualChart
                                                            speedHistory={segment_speed_history}
                                                            predictResults={predict_results}
                                                        />
                                                    </div>
                                                    <div className="rounded-xl border border-[var(--glass-border)] bg-[rgba(0,0,0,0.15)] p-4">
                                                        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                                                            <span>🎯</span> 时空错位象限 (Drift Scatter)
                                                        </h3>
                                                        <DriftChart
                                                            groundTruths={ground_truth_anomalies}
                                                            predictResults={predict_results}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()
                                )}
                            </div>
                        </section>

                    </div>
                </div>
            </div>
        </div>
    );
}
