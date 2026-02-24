import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useI18nStore } from '../../stores/i18nStore';
import { PredictionHeatmap } from '../charts/PredictionHeatmap';

export function PredictBuilderPage() {
    const { lang } = useI18nStore();
    const [availableFiles, setAvailableFiles] = useState<string[]>([]);
    const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
    const [modelType, setModelType] = useState('xgboost_flat');
    const [hyperparams, setHyperparams] = useState({ n_estimators: 100, max_depth: 10 });
    const [loading, setLoading] = useState(false);
    const [trainingResult, setTrainingResult] = useState<any>(null);

    // 获取可用的含有 ML Dataset 的历史文件
    useEffect(() => {
        fetch('http://localhost:8000/api/files/output-files')
            .then((res) => res.json())
            .then((data) => {
                if (data.status === 'success' && data.files) {
                    setAvailableFiles(data.files.map((f: any) => f.name));
                }
            })
            .catch((err) => console.error(err));
    }, []);

    const handleTrain = async () => {
        if (selectedFiles.length === 0) {
            alert(lang === 'zh' ? '请至少选择一个数据文件' : 'Please select at least one file');
            return;
        }
        setLoading(true);
        try {
            const response = await fetch('http://localhost:8000/api/prediction/train', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_names: selectedFiles,
                    model_type: modelType,
                    hyperparameters: hyperparams,
                }),
            });
            const data = await response.json();
            if (data.status === 'success') {
                setTrainingResult(data);
            } else {
                alert(data.detail || 'Training failed');
            }
        } catch (err) {
            console.error(err);
            alert('Network error');
        } finally {
            setLoading(false);
        }
    };

    const toggleFile = (name: string) => {
        setSelectedFiles(prev =>
            prev.includes(name) ? prev.filter(f => f !== name) : [...prev, name]
        );
    };

    return (
        <div className="h-full flex flex-col relative overflow-hidden bg-[var(--bg-base)] text-[var(--text-primary)]">
            {/* 顶部标题区 */}
            <div className="h-20 shrink-0 flex items-center px-8 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md z-10">
                <h1 className="text-xl font-semibold flex items-center gap-3">
                    <span className="text-2xl">🧠</span>
                    {lang === 'zh' ? '时序预测智能工作台 (Predictive Builder)' : 'Predictive Model Builder'}
                </h1>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-7xl mx-auto space-y-8">

                    {/* A区：数据选型 */}
                    <section className="glass-card p-6">
                        <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                            <span className="text-[var(--accent-blue)]">■</span>
                            {lang === 'zh' ? 'A. 训练数据采集池' : 'A. Data Pipeline'}
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {availableFiles.map(file => (
                                <div
                                    key={file}
                                    onClick={() => toggleFile(file)}
                                    className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedFiles.includes(file)
                                        ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 ring-1 ring-[var(--accent-blue)]'
                                        : 'border-[var(--glass-border)] hover:bg-[rgba(255,255,255,0.05)]'
                                        }`}
                                >
                                    <div className="text-sm truncate">{file}</div>
                                </div>
                            ))}
                            {availableFiles.length === 0 && (
                                <div className="text-[var(--text-muted)] text-sm col-span-full">
                                    {lang === 'zh' ? '暂无可用的历史仿真跑批数据。请先执行一次仿真。' : 'No simulation run data available.'}
                                </div>
                            )}
                        </div>
                    </section>

                    {/* B区：模型建立与训练中心 */}
                    <section className="glass-card p-6">
                        <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                            <span className="text-[var(--accent-purple)]">■</span>
                            {lang === 'zh' ? 'B. 模型引擎与超参调优' : 'B. Model Engine & Tuning'}
                        </h2>
                        <div className="flex gap-8">
                            <div className="w-1/3 space-y-4">
                                <div>
                                    <label className="block text-sm text-[var(--text-secondary)] mb-1">
                                        {lang === 'zh' ? '模型架构拓扑' : 'Model Architecture'}
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
                                                <span>{lang === 'zh' ? '最大树深度 (max_depth)' : 'Max Depth'}</span>
                                                <span>{hyperparams.max_depth}</span>
                                            </label>
                                            <input
                                                type="range" min="3" max="20"
                                                value={hyperparams.max_depth}
                                                onChange={(e) => setHyperparams({ ...hyperparams, max_depth: parseInt(e.target.value) })}
                                                className="w-full accent-[var(--accent-purple)]"
                                            />
                                        </div>
                                        <div>
                                            <label className="flex justify-between text-sm text-[var(--text-secondary)] mb-1">
                                                <span>{lang === 'zh' ? '基学习器数量 (n_estimators)' : 'N Estimators'}</span>
                                                <span>{hyperparams.n_estimators}</span>
                                            </label>
                                            <input
                                                type="range" min="10" max="300" step="10"
                                                value={hyperparams.n_estimators}
                                                onChange={(e) => setHyperparams({ ...hyperparams, n_estimators: parseInt(e.target.value) })}
                                                className="w-full accent-[var(--accent-purple)]"
                                            />
                                        </div>
                                    </>
                                )}

                                <button
                                    onClick={handleTrain}
                                    disabled={loading || selectedFiles.length === 0}
                                    className="w-full py-2.5 mt-4 bg-[var(--accent-blue)] text-white rounded-md font-medium hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50 transition-all flex justify-center items-center gap-2"
                                >
                                    {loading && <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />}
                                    {lang === 'zh' ? (loading ? '正在训练...' : '🚀 开始拟合训练') : (loading ? 'Training...' : '🚀 Start Training')}
                                </button>
                            </div>

                            {/* 训练核心与指标速览区 */}
                            <div className="flex-1 bg-[rgba(0,0,0,0.2)] border border-[var(--glass-border)] rounded-lg p-6 relative overflow-hidden">
                                {!trainingResult && !loading && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--text-muted)]">
                                        <span className="text-4xl mb-4">💤</span>
                                        <p>{lang === 'zh' ? '等待发起训练任务...' : 'Waiting to start training task...'}</p>
                                    </div>
                                )}
                                {loading && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--accent-blue)]">
                                        <div className="text-center font-mono text-sm space-y-2">
                                            <p>Extracting [ {selectedFiles.length} ] datasets...</p>
                                            <p>Flattening T=5 sequences...</p>
                                            <p>Fitting decision boundaries...</p>
                                        </div>
                                    </div>
                                )}
                                {trainingResult && !loading && (
                                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="h-full flex flex-col">
                                        <h3 className="text-lg font-medium text-green-400 mb-4 flex items-center gap-2">
                                            <span>✓</span> {lang === 'zh' ? '训练完毕 (Validation Scores)' : 'Training Complete'}
                                        </h3>
                                        <div className="grid grid-cols-3 gap-4 mb-6">
                                            <div className="bg-[rgba(255,255,255,0.05)] p-4 rounded-md text-center border border-[var(--glass-border)]">
                                                <div className="text-[var(--text-secondary)] text-sm">F1-Score</div>
                                                <div className="text-2xl font-bold mt-1 text-white">{(trainingResult.metrics.f1_macro * 100).toFixed(1)}<span className="text-sm font-normal text-gray-400">%</span></div>
                                            </div>
                                            <div className="bg-[rgba(255,255,255,0.05)] p-4 rounded-md text-center border border-[var(--glass-border)]">
                                                <div className="text-[var(--text-secondary)] text-sm">Precision (防止误报)</div>
                                                <div className="text-2xl font-bold mt-1 text-white">{(trainingResult.metrics.precision_macro * 100).toFixed(1)}<span className="text-sm font-normal text-gray-400">%</span></div>
                                            </div>
                                            <div className="bg-[rgba(255,255,255,0.05)] p-4 rounded-md text-center border border-[var(--glass-border)]">
                                                <div className="text-[var(--text-secondary)] text-sm">Recall (防止漏报)</div>
                                                <div className="text-2xl font-bold mt-1 text-[var(--accent-red)]">{(trainingResult.metrics.recall_macro * 100).toFixed(1)}<span className="text-sm font-normal text-[var(--accent-red)]">%</span></div>
                                            </div>
                                        </div>

                                        {/* 特征重要性条形图 */}
                                        <div className="flex-1 overflow-y-auto pr-2">
                                            <h4 className="text-sm text-[var(--text-secondary)] mb-2">Feature Importance (Aggregated over sequence)</h4>
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
                                                                <div
                                                                    className="h-full bg-[var(--accent-purple)] rounded-full"
                                                                    style={{ width: `${(imp as number) * 100}%` }}
                                                                />
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

                    {/* C区占位：可视化评估大屏 */}
                    <section className="glass-card p-6">
                        <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                            <span className="text-[var(--accent-red)]">■</span>
                            {lang === 'zh' ? 'C. 交互式评测大屏 (Evaluation Dashboard)' : 'C. Evaluation Dashboard'}
                        </h2>
                        <div className="h-[400px] border border-[var(--glass-border)] rounded-lg bg-[rgba(0,0,0,0.1)] relative">
                            {!trainingResult || !trainingResult.metrics?.test_details ? (
                                <div className="absolute inset-0 flex items-center justify-center text-[var(--text-muted)]">
                                    {lang === 'zh' ? '训练完成后渲染测试集验证结果...' : 'Waiting for test set validation results...'}
                                </div>
                            ) : (
                                <PredictionHeatmap data={trainingResult.metrics.test_details} />
                            )}
                        </div>
                    </section>

                </div>
            </div>
        </div>
    );
}
