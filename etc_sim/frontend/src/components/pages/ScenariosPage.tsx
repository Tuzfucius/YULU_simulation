/**
 * 场景模板页面
 * 
 * 功能：
 * - 预设场景库（早高峰、晚高峰、事故、雨天等）
 * - 一键加载场景参数
 * - 组合场景支持
 */

import React, { useState, useCallback } from 'react';

interface ScenarioTemplate {
    id: string;
    name: string;
    icon: string;
    description: string;
    category: 'traffic' | 'weather' | 'incident' | 'special';
    params: Record<string, any>;
    tags: string[];
}

const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
    {
        id: 'morning_peak',
        name: '早高峰',
        icon: '🌅',
        description: '模拟 7:00-9:00 早高峰车流，流量逐渐增加到峰值后回落',
        category: 'traffic',
        params: { flow_mode: 'peak_morning', total_vehicles: 1500, num_lanes: 4 },
        tags: ['高峰', '大流量'],
    },
    {
        id: 'evening_peak',
        name: '晚高峰',
        icon: '🌆',
        description: '模拟 17:00-19:00 晚高峰车流',
        category: 'traffic',
        params: { flow_mode: 'peak_evening', total_vehicles: 1500, num_lanes: 4 },
        tags: ['高峰', '大流量'],
    },
    {
        id: 'dual_peak',
        name: '双高峰',
        icon: '📈',
        description: '模拟早晚双高峰模式，中间有明显低谷',
        category: 'traffic',
        params: { flow_mode: 'peak_both', total_vehicles: 2000, num_lanes: 4, simulation_time: 3600 },
        tags: ['高峰', '长时间'],
    },
    {
        id: 'night_traffic',
        name: '夜间低流量',
        icon: '🌙',
        description: '模拟夜间低流量交通环境',
        category: 'traffic',
        params: { flow_mode: 'night', total_vehicles: 300, num_lanes: 4 },
        tags: ['低流量', '夜间'],
    },
    {
        id: 'rain_moderate',
        name: '中雨',
        icon: '🌧️',
        description: '中雨天气：能见度下降、路面湿滑、车辆限速',
        category: 'weather',
        params: { weather: 'rain', speed_factor: 0.8, safe_dist_factor: 1.3 },
        tags: ['天气', '降速'],
    },
    {
        id: 'heavy_fog',
        name: '浓雾',
        icon: '🌫️',
        description: '浓雾天气：能见度极低（<100m），严重影响驾驶',
        category: 'weather',
        params: { weather: 'heavy_fog', speed_factor: 0.5, safe_dist_factor: 2.0, visibility: 100 },
        tags: ['天气', '危险'],
    },
    {
        id: 'snow',
        name: '雪天',
        icon: '❄️',
        description: '雪天：路面结冰、制动距离增大',
        category: 'weather',
        params: { weather: 'snow', speed_factor: 0.6, safe_dist_factor: 1.8, friction: 0.5 },
        tags: ['天气', '降速'],
    },
    {
        id: 'single_accident',
        name: '单车事故',
        icon: '🚗💥',
        description: '模拟单辆车在中间路段发生故障停驶',
        category: 'incident',
        params: { anomaly_ratio: 0.03, anomaly_type: 1, incident_position: 0.5 },
        tags: ['事故', '异常'],
    },
    {
        id: 'chain_collision',
        name: '连锁追尾',
        icon: '💥💥',
        description: '模拟高速上多车连锁追尾事故',
        category: 'incident',
        params: { anomaly_ratio: 0.05, chain_collision: true, total_vehicles: 1200 },
        tags: ['事故', '严重'],
    },
    {
        id: 'construction',
        name: '施工路段',
        icon: '🚧',
        description: '部分车道关闭施工，设有限速区和引导变道区',
        category: 'incident',
        params: { construction: true, closed_lanes: [0], speed_limit: 60, zone_start: 8000, zone_end: 10000 },
        tags: ['施工', '限速'],
    },
    {
        id: 'peak_rain',
        name: '高峰 + 雨天',
        icon: '🌅🌧️',
        description: '早高峰叠加中雨天气，模拟最常见的复杂场景',
        category: 'special',
        params: { flow_mode: 'peak_morning', weather: 'rain', speed_factor: 0.8, total_vehicles: 1500 },
        tags: ['组合', '常见'],
    },
    {
        id: 'peak_accident',
        name: '高峰 + 事故',
        icon: '📈💥',
        description: '高峰时段发生事故，观察拥堵传播过程',
        category: 'special',
        params: { flow_mode: 'peak_morning', anomaly_ratio: 0.05, total_vehicles: 1500 },
        tags: ['组合', '拥堵'],
    },
    {
        id: 'fog_construction',
        name: '大雾 + 施工',
        icon: '🌫️🚧',
        description: '大雾中遭遇施工区域，极端危险场景',
        category: 'special',
        params: { weather: 'fog', construction: true, speed_factor: 0.5, closed_lanes: [0] },
        tags: ['组合', '危险'],
    },
];

const CATEGORIES = [
    { key: 'all', label: '全部', icon: '📋' },
    { key: 'traffic', label: '交通模式', icon: '🚗' },
    { key: 'weather', label: '天气条件', icon: '🌤️' },
    { key: 'incident', label: '事故场景', icon: '⚠️' },
    { key: 'special', label: '组合场景', icon: '🔗' },
];

export const ScenariosPage: React.FC = () => {
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [selectedScenarios, setSelectedScenarios] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');

    const filteredScenarios = SCENARIO_TEMPLATES.filter(s => {
        if (selectedCategory !== 'all' && s.category !== selectedCategory) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return s.name.includes(q) || s.description.includes(q) || s.tags.some(t => t.includes(q));
        }
        return true;
    });

    const toggleScenario = (id: string) => {
        setSelectedScenarios(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleApply = useCallback(() => {
        const params: Record<string, any> = {};
        for (const id of selectedScenarios) {
            const t = SCENARIO_TEMPLATES.find(s => s.id === id);
            if (t) Object.assign(params, t.params);
        }
        console.log('Apply scenario params:', params);
        // TODO: 将 params 发送到仿真配置
        alert(`已加载 ${selectedScenarios.size} 个场景配置`);
    }, [selectedScenarios]);

    return (
        <div className="flex flex-col h-full bg-[var(--bg-base)] overflow-y-auto">
            {/* 顶部 */}
            <div className="h-14 flex items-center justify-between px-6 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md shrink-0">
                <h2 className="text-lg font-medium text-[var(--text-primary)]">🧪 场景模板库</h2>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-[var(--text-muted)]">
                        已选 {selectedScenarios.size} 个场景
                    </span>
                    <button
                        onClick={handleApply}
                        disabled={selectedScenarios.size === 0}
                        className="px-4 py-1.5 text-sm rounded-lg bg-[var(--accent-blue)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
                    >
                        ⚡ 应用到仿真
                    </button>
                </div>
            </div>

            <div className="flex-1 p-6 max-w-[1600px] mx-auto w-full space-y-6">
                {/* 搜索和筛选 */}
                <div className="flex items-center gap-4">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="🔍 搜索场景..."
                        className="px-4 py-2 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] w-64 text-sm"
                    />
                    <div className="flex gap-2">
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat.key}
                                onClick={() => setSelectedCategory(cat.key)}
                                className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${selectedCategory === cat.key
                                        ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/20 text-[var(--accent-blue)]'
                                        : 'border-[var(--glass-border)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg)]'
                                    }`}
                            >
                                {cat.icon} {cat.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 场景网格 */}
                <div className="grid grid-cols-3 gap-4">
                    {filteredScenarios.map(scenario => (
                        <button
                            key={scenario.id}
                            onClick={() => toggleScenario(scenario.id)}
                            className={`p-5 rounded-xl border text-left transition-all hover:scale-[1.02] ${selectedScenarios.has(scenario.id)
                                    ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 ring-2 ring-[var(--accent-blue)]/30'
                                    : 'border-[var(--glass-border)] bg-[var(--glass-bg)] hover:border-[var(--text-muted)]'
                                }`}
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div className="text-3xl">{scenario.icon}</div>
                                {selectedScenarios.has(scenario.id) && (
                                    <div className="w-6 h-6 rounded-full bg-[var(--accent-blue)] text-white flex items-center justify-center text-xs">✓</div>
                                )}
                            </div>
                            <h4 className="text-base font-medium text-[var(--text-primary)] mb-1">{scenario.name}</h4>
                            <p className="text-xs text-[var(--text-muted)] mb-3 leading-relaxed">{scenario.description}</p>
                            <div className="flex flex-wrap gap-1">
                                {scenario.tags.map(tag => (
                                    <span key={tag} className="px-2 py-0.5 text-[10px] rounded-full border border-[var(--glass-border)] text-[var(--text-muted)]">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </button>
                    ))}
                </div>

                {/* 选中的参数预览 */}
                {selectedScenarios.size > 0 && (
                    <div className="glass-card p-5">
                        <h3 className="text-base font-medium text-[var(--text-primary)] mb-3">📋 合并后参数预览</h3>
                        <pre className="text-xs text-[var(--text-secondary)] bg-[rgba(0,0,0,0.2)] p-4 rounded-lg overflow-x-auto">
                            {JSON.stringify(
                                (() => {
                                    const p: Record<string, any> = {};
                                    for (const id of selectedScenarios) {
                                        const t = SCENARIO_TEMPLATES.find(s => s.id === id);
                                        if (t) Object.assign(p, t.params);
                                    }
                                    return p;
                                })(),
                                null,
                                2
                            )}
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
};
