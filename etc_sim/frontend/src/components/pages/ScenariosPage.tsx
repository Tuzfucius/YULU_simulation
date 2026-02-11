/**
 * 场景模板页面 — 分层选择（防冲突）
 * 
 * 场景分为4个维度，每个维度只能选1项：
 * 1. 时段（交通模式）
 * 2. 天气条件
 * 3. 事故/施工
 * 4. 特殊叠加（可选）
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18nStore } from '../../stores/i18nStore';
import { useSimStore } from '../../stores/simStore';

interface ScenarioOption {
    id: string;
    name: string;
    nameEn: string;
    icon: string;
    description: string;
    descriptionEn: string;
    params: Record<string, any>;
}

interface ScenarioLayer {
    key: string;
    title: string;
    titleEn: string;
    icon: string;
    description: string;
    descriptionEn: string;
    required: boolean;
    options: ScenarioOption[];
}

const SCENARIO_LAYERS: ScenarioLayer[] = [
    {
        key: 'traffic',
        title: '时段模式',
        titleEn: 'Traffic Pattern',
        icon: '🕐',
        description: '选择车流到达的时变模式（必选，仅可选一种）',
        descriptionEn: 'Select traffic arrival pattern (required, pick one)',
        required: true,
        options: [
            {
                id: 'uniform', name: '均匀流量', nameEn: 'Uniform Flow', icon: '➡️',
                description: '全时段均匀车流，无高峰', descriptionEn: 'Constant flow throughout simulation',
                params: { flow_mode: 'uniform', total_vehicles: 1200 },
            },
            {
                id: 'peak_morning', name: '早高峰', nameEn: 'Morning Peak', icon: '🌅',
                description: '7:00-9:00 流量逐渐攀升至峰值后回落', descriptionEn: 'Flow ramps up 7-9 AM then drops',
                params: { flow_mode: 'peak_morning', total_vehicles: 1500 },
            },
            {
                id: 'peak_evening', name: '晚高峰', nameEn: 'Evening Peak', icon: '🌆',
                description: '17:00-19:00 晚间高峰车流模式', descriptionEn: 'Flow ramps up 5-7 PM then drops',
                params: { flow_mode: 'peak_evening', total_vehicles: 1500 },
            },
            {
                id: 'peak_both', name: '双高峰', nameEn: 'Dual Peak', icon: '📈',
                description: '早晚双高峰，中间有低谷', descriptionEn: 'Morning + evening peak with midday dip',
                params: { flow_mode: 'peak_both', total_vehicles: 2000, simulation_time: 3600 },
            },
            {
                id: 'night', name: '夜间低流量', nameEn: 'Night Traffic', icon: '🌙',
                description: '夜间稀疏车流', descriptionEn: 'Low-volume overnight traffic',
                params: { flow_mode: 'night', total_vehicles: 300 },
            },
        ],
    },
    {
        key: 'weather',
        title: '天气条件',
        titleEn: 'Weather',
        icon: '🌤️',
        description: '选择天气条件，影响能见度和行车速度（可选）',
        descriptionEn: 'Select weather conditions affecting visibility and speed (optional)',
        required: false,
        options: [
            {
                id: 'clear', name: '晴天', nameEn: 'Clear', icon: '☀️',
                description: '良好天气，无额外限制', descriptionEn: 'Good conditions, no restrictions',
                params: { weather: 'clear' },
            },
            {
                id: 'rain', name: '中雨', nameEn: 'Rain', icon: '🌧️',
                description: '能见度下降，路面湿滑', descriptionEn: 'Reduced visibility, wet road surface',
                params: { weather: 'rain', speed_factor: 0.8, safe_dist_factor: 1.3 },
            },
            {
                id: 'snow', name: '雪天', nameEn: 'Snow', icon: '❄️',
                description: '路面结冰，制动距离增大', descriptionEn: 'Icy road, increased braking distance',
                params: { weather: 'snow', speed_factor: 0.6, safe_dist_factor: 1.8 },
            },
            {
                id: 'fog', name: '大雾', nameEn: 'Fog', icon: '🌫️',
                description: '能见度150m，需大幅降速', descriptionEn: 'Visibility ~150m, significant speed reduction',
                params: { weather: 'fog', speed_factor: 0.5, safe_dist_factor: 2.0, visibility: 150 },
            },
            {
                id: 'heavy_fog', name: '浓雾', nameEn: 'Heavy Fog', icon: '🌫️',
                description: '能见度<50m，极端危险', descriptionEn: 'Visibility <50m, extremely dangerous',
                params: { weather: 'heavy_fog', speed_factor: 0.3, safe_dist_factor: 3.0, visibility: 50 },
            },
        ],
    },
    {
        key: 'incident',
        title: '事故/施工',
        titleEn: 'Incidents',
        icon: '⚠️',
        description: '选择是否注入异常事件（可选）',
        descriptionEn: 'Inject incident or construction events (optional)',
        required: false,
        options: [
            {
                id: 'none', name: '无事故', nameEn: 'None', icon: '✅',
                description: '正常行驶，无异常事件', descriptionEn: 'Normal driving, no incidents',
                params: { anomaly_ratio: 0 },
            },
            {
                id: 'single_stop', name: '单车抛锚', nameEn: 'Single Breakdown', icon: '🚗💥',
                description: '一辆车在中间路段故障停驶', descriptionEn: 'One vehicle breaks down mid-road',
                params: { anomaly_ratio: 0.03, anomaly_type: 1 },
            },
            {
                id: 'chain_collision', name: '连锁追尾', nameEn: 'Chain Collision', icon: '💥💥',
                description: '高速多车追尾事故', descriptionEn: 'Multi-vehicle rear-end collision',
                params: { anomaly_ratio: 0.05, chain_collision: true },
            },
            {
                id: 'construction', name: '施工路段', nameEn: 'Construction Zone', icon: '🚧',
                description: '部分车道关闭 + 限速区 + 引导变道', descriptionEn: 'Lane closure + speed limit + merge zone',
                params: { construction: true, closed_lanes: [0], speed_limit: 60, zone_start: 8000, zone_end: 10000 },
            },
            {
                id: 'gradual_stop', name: '渐停抛锚', nameEn: 'Gradual Breakdown', icon: '🐌',
                description: '车辆逐渐减速直至停止', descriptionEn: 'Vehicle gradually decelerates to stop',
                params: { anomaly_ratio: 0.02, gradual_stop: true },
            },
        ],
    },
    {
        key: 'special',
        title: '附加选项',
        titleEn: 'Extra Options',
        icon: '⚙️',
        description: '额外的仿真参数调整（可选）',
        descriptionEn: 'Additional simulation parameter adjustments (optional)',
        required: false,
        options: [
            {
                id: 'platoon', name: '车队效应', nameEn: 'Platoon Effect', icon: '🚛🚛',
                description: '15%概率生成3~6辆编队车队', descriptionEn: '15% chance of 3-6 vehicle platoons',
                params: { platoon_probability: 0.15, platoon_size_range: [3, 6] },
            },
            {
                id: 'high_truck', name: '高货车比例', nameEn: 'High Truck Ratio', icon: '🚚',
                description: '货车占比提升到30%', descriptionEn: 'Truck ratio increased to 30%',
                params: { truck_ratio: 0.3 },
            },
            {
                id: 'aggressive', name: '激进驾驶', nameEn: 'Aggressive Drivers', icon: '🏎️',
                description: '更多激进型驾驶员', descriptionEn: 'More aggressive driver style',
                params: { aggressive_ratio: 0.4 },
            },
        ],
    },
];

export const ScenariosPage: React.FC = () => {
    const { lang, t } = useI18nStore();
    const navigate = useNavigate();
    const { setConfig } = useSimStore();
    const isEn = lang === 'en';

    // 每层只保留一个选中项（key → option id）
    const [selections, setSelections] = useState<Record<string, string>>({
        traffic: 'uniform',
        weather: '',
        incident: '',
        special: '',
    });

    const selectOption = (layerKey: string, optionId: string) => {
        setSelections(prev => ({
            ...prev,
            [layerKey]: prev[layerKey] === optionId ? (SCENARIO_LAYERS.find(l => l.key === layerKey)?.required ? optionId : '') : optionId,
        }));
    };

    // 合并参数
    const mergedParams = useMemo(() => {
        const params: Record<string, any> = {};
        for (const layer of SCENARIO_LAYERS) {
            const selectedId = selections[layer.key];
            if (selectedId) {
                const opt = layer.options.find(o => o.id === selectedId);
                if (opt) Object.assign(params, opt.params);
            }
        }
        return params;
    }, [selections]);

    const selectedCount = Object.values(selections).filter(Boolean).length;

    const handleApply = useCallback(() => {
        // Convert snake_case from params to camelCase for store config
        const configUpdates: any = {};
        for (const [key, value] of Object.entries(mergedParams)) {
            const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
            configUpdates[camelKey] = value;
        }

        console.log('Apply scenario params:', configUpdates);
        setConfig(configUpdates);

        // Navigate to simulation control page
        navigate('/sim');
    }, [mergedParams, setConfig, navigate]);

    const handleReset = () => {
        setSelections({ traffic: 'uniform', weather: '', incident: '', special: '' });
    };

    return (
        <div className="flex flex-col h-full bg-[var(--bg-base)] overflow-y-auto">
            {/* 顶部 */}
            <div className="h-14 flex items-center justify-between px-6 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md shrink-0">
                <h2 className="text-lg font-medium text-[var(--text-primary)]">
                    🧪 {isEn ? 'Scenario Builder' : '场景构建器'}
                </h2>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-[var(--text-muted)]">
                        {isEn ? `${selectedCount} layers selected` : `已选 ${selectedCount} 个维度`}
                    </span>
                    <button onClick={handleReset}
                        className="px-3 py-1.5 text-sm rounded-lg border border-[var(--glass-border)] text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)] transition-colors">
                        🔄 {isEn ? 'Reset' : '重置'}
                    </button>
                    <button onClick={handleApply}
                        className="px-4 py-1.5 text-sm rounded-lg bg-[var(--accent-blue)] text-white hover:opacity-90 transition-opacity">
                        ⚡ {isEn ? 'Apply to Simulation' : '应用到仿真'}
                    </button>
                </div>
            </div>

            <div className="flex-1 p-6 max-w-[1600px] mx-auto w-full space-y-6">
                {/* 分层选择面板 */}
                {SCENARIO_LAYERS.map(layer => {
                    const selected = selections[layer.key];
                    return (
                        <div key={layer.key} className="glass-card p-5">
                            {/* 层标题 */}
                            <div className="flex items-center gap-3 mb-1">
                                <span className="text-xl">{layer.icon}</span>
                                <h3 className="text-base font-medium text-[var(--text-primary)]">
                                    {isEn ? layer.titleEn : layer.title}
                                </h3>
                                {layer.required && (
                                    <span className="px-2 py-0.5 text-[10px] rounded-full bg-red-500/20 text-red-400">
                                        {isEn ? 'Required' : '必选'}
                                    </span>
                                )}
                                {!layer.required && (
                                    <span className="px-2 py-0.5 text-[10px] rounded-full bg-[var(--glass-border)] text-[var(--text-muted)]">
                                        {isEn ? 'Optional' : '可选'}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-[var(--text-muted)] mb-4 ml-9">
                                {isEn ? layer.descriptionEn : layer.description}
                            </p>

                            {/* 选项网格 */}
                            <div className="grid grid-cols-5 gap-3">
                                {layer.options.map(opt => {
                                    const isSelected = selected === opt.id;
                                    return (
                                        <button
                                            key={opt.id}
                                            onClick={() => selectOption(layer.key, opt.id)}
                                            className={`relative p-4 rounded-xl border text-left transition-all hover:scale-[1.02] ${isSelected
                                                ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 ring-2 ring-[var(--accent-blue)]/30 shadow-[0_0_20px_rgba(96,165,250,0.1)]'
                                                : 'border-[var(--glass-border)] bg-[var(--glass-bg)] hover:border-[var(--text-muted)]'
                                                }`}
                                        >
                                            {isSelected && (
                                                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[var(--accent-blue)] text-white flex items-center justify-center text-[10px]">✓</div>
                                            )}
                                            <div className="text-2xl mb-2">{opt.icon}</div>
                                            <h4 className="text-sm font-medium text-[var(--text-primary)] mb-1">
                                                {isEn ? opt.nameEn : opt.name}
                                            </h4>
                                            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                                                {isEn ? opt.descriptionEn : opt.description}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}

                {/* 合并参数预览 */}
                {selectedCount > 0 && (
                    <div className="glass-card p-5">
                        <h3 className="text-base font-medium text-[var(--text-primary)] mb-3">
                            📋 {isEn ? 'Merged Parameters Preview' : '合并参数预览'}
                        </h3>
                        <pre className="text-xs text-[var(--text-secondary)] bg-[rgba(0,0,0,0.2)] p-4 rounded-lg overflow-x-auto">
                            {JSON.stringify(mergedParams, null, 2)}
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
};
