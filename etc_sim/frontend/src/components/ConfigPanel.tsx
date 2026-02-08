/**
 * 参数配置面板组件
 * Glassmorphism 风格
 */

import React, { useState } from 'react';
import { useSimStore } from '../stores/simStore';
import { useI18nStore } from '../stores/i18nStore';
import { EnvironmentConfig } from './EnvironmentConfig';
import { RoadNetworkConfig } from './RoadNetworkConfig';
import { ETCMonitorPanel } from './ETCMonitorPanel';

interface ParamInputProps {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    disabled?: boolean;
}

const ParamInput: React.FC<ParamInputProps> = ({
    label,
    value,
    onChange,
    min = 0,
    max = 100,
    step = 1,
    unit = '',
    disabled = false,
}) => (
    <div className="mb-5 group">
        <label className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-2 font-medium">
            <span>{label}</span>
            <span className="text-[var(--accent-blue)] font-mono">
                {typeof value === 'number' ? value.toFixed(step < 1 ? 2 : 0) : value}
                {unit && <span className="text-[var(--text-muted)] ml-1">{unit}</span>}
            </span>
        </label>
        <div className="relative h-6 flex items-center">
            <input
                type="range"
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                min={min}
                max={max}
                step={step}
                disabled={disabled}
                className="w-full h-1 bg-[rgba(255,255,255,0.1)] rounded-full appearance-none cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none
                   [&::-webkit-slider-thumb]:w-3
                   [&::-webkit-slider-thumb]:h-3
                   [&::-webkit-slider-thumb]:rounded-full
                   [&::-webkit-slider-thumb]:bg-[var(--accent-blue)]
                   [&::-webkit-slider-thumb]:shadow-[0_0_10px_var(--accent-blue)]
                   [&::-webkit-slider-thumb]:transition-all
                   [&::-webkit-slider-thumb]:hover:scale-125
                   disabled:opacity-50"
            />
        </div>
    </div>
);

interface SectionProps {
    title: string;
    icon: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, icon, defaultOpen = true, children }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="mb-3">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-colors"
            >
                <div className="flex items-center gap-2 text-sm text-[var(--text-primary)] font-medium">
                    <span className="opacity-80">{icon}</span>
                    <span>{title}</span>
                </div>
                <span className={`text-[var(--text-muted)] text-xs transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                    ▼
                </span>
            </button>
            <div className={`transition-all duration-300 overflow-hidden ${isOpen ? 'max-h-[800px] mt-2 px-2 opacity-100' : 'max-h-0 opacity-0'}`}>
                {children}
            </div>
        </div>
    );
};

interface ConfigPanelProps {
    disabled?: boolean;
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({ disabled = false }) => {
    const { config, setConfig, resetConfig } = useSimStore();
    const { t } = useI18nStore();

    const handleExportConfig = () => {
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `simulation_config.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImportConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const imported = JSON.parse(event.target?.result as string);
                    setConfig(imported);
                } catch {
                    alert('Invalid config file format');
                }
            };
            reader.readAsText(file);
        }
    };

    return (
        <div className="flex flex-col space-y-6">
            <div>
                <Section title={t('config.title')} icon="🛣️">
                    <ParamInput
                        label={t('config.roadLength')}
                        value={config.roadLengthKm}
                        onChange={(v) => setConfig({ roadLengthKm: v })}
                        min={1}
                        max={50}
                        step={1}
                        unit="km"
                        disabled={disabled}
                    />
                    <ParamInput
                        label={t('config.numLanes')}
                        value={config.numLanes}
                        onChange={(v) => setConfig({ numLanes: v })}
                        min={2}
                        max={8}
                        step={1}
                        disabled={disabled}
                    />
                    <ParamInput
                        label="ETC Gate Interval"
                        value={config.etcGateIntervalKm}
                        onChange={(v) => setConfig({ etcGateIntervalKm: v })}
                        min={1}
                        max={10}
                        step={0.5}
                        unit="km"
                        disabled={disabled}
                    />
                </Section>

                <Section title={t('simulation.vehicles')} icon="🚗">
                    <ParamInput
                        label={t('config.targetVehicles')}
                        value={config.totalVehicles}
                        onChange={(v) => setConfig({ totalVehicles: v })}
                        min={100}
                        max={5000}
                        step={100}
                        disabled={disabled}
                    />
                    <ParamInput
                        label={t('config.carRatio')}
                        value={config.carRatio}
                        onChange={(v) => setConfig({ carRatio: v })}
                        min={0}
                        max={1}
                        step={0.05}
                        disabled={disabled}
                    />
                    <ParamInput
                        label={t('config.truckRatio')}
                        value={config.truckRatio}
                        onChange={(v) => setConfig({ truckRatio: v })}
                        min={0}
                        max={1}
                        step={0.05}
                        disabled={disabled}
                    />
                    <ParamInput
                        label={t('config.busRatio')}
                        value={config.busRatio}
                        onChange={(v) => setConfig({ busRatio: v })}
                        min={0}
                        max={1}
                        step={0.05}
                        disabled={disabled}
                    />
                </Section>

                <Section title={t('config.driverStyles')} icon="👨‍✈️">
                    <ParamInput
                        label={t('config.aggressive')}
                        value={config.aggressiveRatio}
                        onChange={(v) => setConfig({ aggressiveRatio: v })}
                        min={0}
                        max={1}
                        step={0.05}
                        disabled={disabled}
                    />
                    <ParamInput
                        label={t('config.conservative')}
                        value={config.conservativeRatio}
                        onChange={(v) => setConfig({ conservativeRatio: v })}
                        min={0}
                        max={1}
                        step={0.05}
                        disabled={disabled}
                    />
                    <div className="px-1 py-1 mb-4 text-xs text-[var(--text-tertiary)] bg-[var(--surface-variant)] rounded-lg">
                        {t('config.normal')}: {(1 - config.aggressiveRatio - config.conservativeRatio).toFixed(2)}
                    </div>
                </Section>

                <Section title={t('config.anomalies')} icon="⚠️">
                    <ParamInput
                        label={t('config.anomalyRate')}
                        value={config.anomalyRatio}
                        onChange={(v) => setConfig({ anomalyRatio: v })}
                        min={0}
                        max={0.2}
                        step={0.005}
                        disabled={disabled}
                    />
                    <ParamInput
                        label={t('config.startTime')}
                        value={config.globalAnomalyStart}
                        onChange={(v) => setConfig({ globalAnomalyStart: v })}
                        min={0}
                        max={1000}
                        step={50}
                        unit="s"
                        disabled={disabled}
                    />
                    <ParamInput
                        label={t('config.safeRunTime')}
                        value={config.vehicleSafeRunTime}
                        onChange={(v) => setConfig({ vehicleSafeRunTime: v })}
                        min={0}
                        max={500}
                        step={10}
                        unit="s"
                        disabled={disabled}
                    />
                </Section>

                <Section title={t('config.trafficLogic')} icon="🧠">
                    <ParamInput
                        label={t('config.laneChangeDelay')}
                        value={config.laneChangeDelay}
                        onChange={(v) => setConfig({ laneChangeDelay: v })}
                        min={0}
                        max={10}
                        step={0.5}
                        unit="s"
                        disabled={disabled}
                    />
                    <ParamInput
                        label={t('config.impactThreshold')}
                        value={config.impactThreshold}
                        onChange={(v) => setConfig({ impactThreshold: v })}
                        min={0.5}
                        max={1.0}
                        step={0.01}
                        disabled={disabled}
                    />
                    <ParamInput
                        label={t('config.impactDist')}
                        value={config.impactDiscoverDist}
                        onChange={(v) => setConfig({ impactDiscoverDist: v })}
                        min={50}
                        max={500}
                        step={10}
                        unit="m"
                        disabled={disabled}
                    />
                </Section>

                {/* 新增：路网配置 */}
                <Section title="Road Network" icon="🛣️" defaultOpen={false}>
                    <RoadNetworkConfig disabled={disabled} />
                </Section>

                {/* 新增：环境配置 */}
                <Section title="Environment" icon="🌤️" defaultOpen={false}>
                    <EnvironmentConfig disabled={disabled} />
                </Section>

                {/* 新增：ETC 监控 */}
                <Section title="ETC Monitor" icon="📡" defaultOpen={false}>
                    <ETCMonitorPanel />
                </Section>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-4 border-t border-[var(--glass-border)]">
                <button
                    onClick={handleExportConfig}
                    className="w-full glass-btn justify-center hover:bg-[rgba(255,255,255,0.08)]"
                >
                    Config Export
                </button>
                <label className="w-full glass-btn justify-center cursor-pointer hover:bg-[rgba(255,255,255,0.08)]">
                    Config Import
                    <input type="file" accept=".json" onChange={handleImportConfig} className="hidden" />
                </label>
                <button
                    onClick={resetConfig}
                    disabled={disabled}
                    className="w-full glass-btn justify-center text-[var(--accent-red)] hover:bg-[rgba(242,184,181,0.1)]"
                >
                    Reset Defaults
                </button>
            </div>
        </div>
    );
};
