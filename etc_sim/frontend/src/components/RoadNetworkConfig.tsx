/**
 * 路网配置组件
 * 模板选择 + SVG 预览 + 参数调整
 */

import React, { useState, useEffect } from 'react';
import { useI18nStore } from '../stores/i18nStore';
import { useSimStore } from '../stores/simStore';

interface NetworkTemplate {
    id: string;
    name: string;
    description: string;
    icon: string;
}

interface NetworkNode {
    node_id: string;
    node_type: string;
    x: number;
    y: number;
}

interface NetworkEdge {
    edge_id: string;
    from_node: string;
    to_node: string;
    is_ramp: boolean;
}

interface NetworkGraph {
    nodes: NetworkNode[];
    edges: NetworkEdge[];
    paths: Record<string, any>;
}

const NODE_COLORS: Record<string, string> = {
    origin: '#4ade80',
    destination: '#f87171',
    merge: '#60a5fa',
    diverge: '#a78bfa'
};

export const RoadNetworkConfig: React.FC<{ disabled?: boolean }> = ({ disabled }) => {
    const [templates, setTemplates] = useState<NetworkTemplate[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState('simple_mainline');
    const [customFiles, setCustomFiles] = useState<string[]>([]);
    const [customLength, setCustomLength] = useState<number | null>(null); // 自定义路径实际里程
    const [config, setConfig] = useState({
        main_length_km: 20,
        num_lanes: 4,
        ramp_position_km: 8,
        exit_probability: 0.2,
        custom_file_path: ''
    });
    const [preview, setPreview] = useState<NetworkGraph | null>(null);

    const { t } = useI18nStore();
    const { setConfig: setSimConfig } = useSimStore();

    useEffect(() => {
        fetch('/api/road-network/templates')
            .then(res => res.json())
            .then(setTemplates)
            .catch(console.error);

        // Fetch custom files
        fetch('/api/custom-roads/')
            .then(res => res.json())
            .then((files: any[]) => setCustomFiles(files.map(f => f.filename)))
            .catch(console.error);
    }, []);

    useEffect(() => {
        updateConfig();
    }, [selectedTemplate, config]);

    const updateConfig = async () => {
        try {
            await fetch('/api/road-network/current', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    template: selectedTemplate,
                    ...config,
                    ramp_position_km: selectedTemplate !== 'simple_mainline' ? config.ramp_position_km : null,
                    custom_file_path: selectedTemplate === 'custom' ? config.custom_file_path : null
                })
            });

            const previewRes = await fetch('/api/road-network/preview');
            const previewData = await previewRes.json();
            setPreview(previewData);

            // 自定义路径：从 preview 返回的 paths 中读取实际里程，并同步到 simStore
            if (selectedTemplate === 'custom') {
                const totalKm: number | null = previewData.paths?.total_length_km ?? null;
                const gantryPositions: number[] = previewData.paths?.gantry_positions_km ?? [];
                const filePath: string = config.custom_file_path;
                setCustomLength(totalKm);

                // 同步到 simStore，供 ConfigPanel 读取并禁用相关参数
                setSimConfig({
                    customRoadPath: filePath,
                    customRoadLengthKm: totalKm ?? undefined,
                    customGantryPositionsKm: gantryPositions,
                    // 同时更新 roadLengthKm 使仿真引擎使用正确值
                    ...(totalKm !== null ? { roadLengthKm: totalKm } : {}),
                });
            } else {
                setCustomLength(null);
                // 清除自定义路径状态
                setSimConfig({
                    customRoadPath: undefined,
                    customRoadLengthKm: undefined,
                    customGantryPositionsKm: undefined,
                });
            }

        } catch (err) {

            console.error('Failed to update network config:', err);
        }
    };

    const showRampConfig = ['on_ramp', 'off_ramp'].includes(selectedTemplate);
    const isCustom = selectedTemplate === 'custom';

    // Helper to translate template names dynamically if needed, 
    // or map IDs to translation keys.
    const getTemplateName = (id: string) => {
        if (id === 'simple_mainline') return t('config.roadNetwork.simpleMainline');
        if (id === 'on_ramp') return t('config.roadNetwork.onRamp');
        if (id === 'off_ramp') return t('config.roadNetwork.offRamp');
        if (id === 'custom') return t('config.roadNetwork.custom', 'Custom Path');
        return id;
    }

    return (
        <div className="space-y-4">
            {/* 标题 */}
            {/* <h3 className="text-sm font-medium text-[var(--text-secondary)]">{t('config.roadNetwork.title')}</h3> */}

            {/* 模板选择 */}
            <div className="grid grid-cols-2 gap-2">
                {templates.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setSelectedTemplate(t.id)}
                        disabled={disabled}
                        className={`
              p-3 rounded-lg border text-center transition-all
              ${selectedTemplate === t.id
                                ? 'border-[var(--accent-purple)] bg-[var(--accent-purple)]/10'
                                : 'border-[var(--glass-border)] bg-[var(--glass-bg)] hover:border-[var(--accent-purple)]/50'
                            }
            `}
                    >
                        <span className="text-xl">{t.icon}</span>
                        <p className="text-xs mt-1">{getTemplateName(t.id)}</p>
                    </button>
                ))}
            </div>

            {/* 自定义路径选择 */}
            {isCustom && (
                <div>
                    <label className="text-xs text-[var(--text-muted)]">{t('config.roadNetwork.selectPath', 'Select Path')}</label>
                    <select
                        value={config.custom_file_path}
                        onChange={e => setConfig({ ...config, custom_file_path: e.target.value })}
                        className="w-full bg-[var(--bg-card)] border border-[var(--glass-border)] rounded p-2 text-sm mt-1"
                    >
                        <option value="">-- Select a File --</option>
                        {customFiles.map(f => (
                            <option key={f} value={f}>{f}</option>
                        ))}
                    </select>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">
                        Create paths in <a href="/editor" className="text-[var(--accent-blue)] underline">Road Editor</a>
                    </p>
                </div>
            )}

            {/* 基础参数 */}
            <div className="space-y-3">
                <div className={isCustom ? 'opacity-40 pointer-events-none' : ''}>
                    <label className="text-xs text-[var(--text-muted)]">
                        {t('config.roadLength')}:
                        {isCustom && customLength !== null
                            ? <span className="text-[var(--accent-blue)] ml-1 font-medium">{customLength.toFixed(2)} km <span className="text-[10px] opacity-60">(自定义路径)</span></span>
                            : <span className="ml-1">{config.main_length_km} km</span>
                        }
                    </label>
                    {!isCustom && (
                        <input
                            type="range"
                            min={10}
                            max={50}
                            value={config.main_length_km}
                            onChange={e => setConfig({ ...config, main_length_km: +e.target.value })}
                            disabled={disabled}
                            className="w-full"
                        />
                    )}
                    {isCustom && customLength === null && (
                        <p className="text-[10px] text-[var(--text-muted)] mt-1">请先选择路径文件</p>
                    )}
                </div>

                <div className={isCustom ? 'opacity-40 pointer-events-none' : ''}>
                    <label className="text-xs text-[var(--text-muted)]">{t('config.numLanes')}: {config.num_lanes}</label>
                    <input
                        type="range"
                        min={2}
                        max={8}
                        value={config.num_lanes}
                        onChange={e => setConfig({ ...config, num_lanes: +e.target.value })}
                        disabled={disabled || isCustom}
                        className="w-full"
                    />
                </div>

                {/* 匝道参数 */}
                {showRampConfig && (
                    <>
                        {selectedTemplate === 'on_ramp' && (
                            <div>
                                <label className="text-xs text-[var(--text-muted)]">
                                    {t('config.roadNetwork.rampTraffic')}: {(config.ramp_traffic_ratio || 20)}%
                                    <span className="text-[var(--accent-green)] ml-2">
                                        ~{Math.round((config.ramp_traffic_ratio || 20) / 100 * 1000)} {t('config.roadNetwork.vehiclesEntering')}
                                    </span>
                                </label>
                                <input
                                    type="range"
                                    min={5}
                                    max={50}
                                    value={config.ramp_traffic_ratio || 20}
                                    onChange={e => setConfig({ ...config, ramp_traffic_ratio: +e.target.value })}
                                    disabled={disabled}
                                    className="w-full"
                                />
                            </div>
                        )}

                        <div>
                            <label className="text-xs text-[var(--text-muted)]">{t('config.roadNetwork.rampPosition')}: {config.ramp_position_km} km</label>
                            <input
                                type="range"
                                min={2}
                                max={config.main_length_km - 2}
                                value={config.ramp_position_km}
                                onChange={e => setConfig({ ...config, ramp_position_km: +e.target.value })}
                                disabled={disabled}
                                className="w-full"
                            />
                        </div>

                        {selectedTemplate === 'off_ramp' && (
                            <div>
                                <label className="text-xs text-[var(--text-muted)]">{t('config.roadNetwork.exitProbability')}: {(config.exit_probability * 100).toFixed(0)}%</label>
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    value={config.exit_probability * 100}
                                    onChange={e => setConfig({ ...config, exit_probability: +e.target.value / 100 })}
                                    disabled={disabled}
                                    className="w-full"
                                />
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* SVG 预览 */}
            {preview && (
                <div className="p-4 rounded-lg border border-[var(--glass-border)] bg-black/30">
                    <p className="text-xs text-[var(--text-muted)] mb-2">{t('common.preview')}</p>
                    <svg viewBox={`-1 -2 ${isCustom ? (preview.nodes[preview.nodes.length - 1]?.position_km || 24) + 2 : 24} 4`} className="w-full h-16" preserveAspectRatio="none">
                        {/* 边 */}
                        {preview.edges.map(edge => {
                            const from = preview.nodes.find(n => n.node_id === edge.from_node);
                            const to = preview.nodes.find(n => n.node_id === edge.to_node);
                            if (!from || !to) return null;

                            // For custom, we might want to scale x to fit or use a scrollable view
                            // But keeping it simple for now, using position_km as x for visualization logic reuse
                            // Or better: use x,y from nodes if they exist and meaningful?
                            // Logic below uses from.x and to.x. 

                            return (
                                <line
                                    key={edge.edge_id}
                                    x1={from.x}
                                    y1={from.y}
                                    x2={to.x}
                                    y2={to.y}
                                    stroke={edge.is_ramp ? '#a78bfa' : '#60a5fa'}
                                    strokeWidth={edge.is_ramp ? 0.15 : 0.3}
                                    strokeLinecap="round"
                                />
                            );
                        })}

                        {/* 节点 */}
                        {preview.nodes.map(node => (
                            <g key={node.node_id}>
                                <circle
                                    cx={node.x}
                                    cy={node.y}
                                    r={0.4}
                                    fill={NODE_COLORS[node.node_type] || '#888'}
                                />
                                <text
                                    x={node.x}
                                    y={node.y + 1.2}
                                    fontSize={0.5}
                                    fill="#888"
                                    textAnchor="middle"
                                >
                                    {node.node_type === 'merge' ? t('config.roadNetwork.merge') : node.node_type === 'diverge' ? t('config.roadNetwork.diverge') : ''}
                                </text>
                            </g>
                        ))}
                    </svg>
                </div>
            )}
        </div>
    );
};
