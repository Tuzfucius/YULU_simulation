/**
 * 环境配置组件
 * 天气选择器 + 坡度配置
 */

import React, { useState, useEffect } from 'react';

interface WeatherType {
  type: string;
  name: string;
  description: string;
  speed_factor: number;
  headway_factor: number;
}

interface GradientSegment {
  start_km: number;
  end_km: number;
  gradient_percent: number;
}

const WEATHER_ICONS: Record<string, string> = {
  clear: '☀️',
  rain: '🌧️',
  snow: '❄️',
  fog: '🌫️',
  heavy_rain: '⛈️'
};

const WEATHER_COLORS: Record<string, string> = {
  clear: 'from-yellow-400 to-orange-400',
  rain: 'from-blue-400 to-blue-600',
  snow: 'from-gray-200 to-blue-200',
  fog: 'from-gray-400 to-gray-500',
  heavy_rain: 'from-blue-600 to-purple-600'
};

export const EnvironmentConfig: React.FC<{ disabled?: boolean }> = ({ disabled }) => {
  const [weatherTypes, setWeatherTypes] = useState<WeatherType[]>([]);
  const [selectedWeather, setSelectedWeather] = useState('clear');
  const [enabled, setEnabled] = useState(true);
  const [gradients, setGradients] = useState<GradientSegment[]>([]);
  const [newGradient, setNewGradient] = useState({ start_km: 0, end_km: 0, gradient_percent: 0 });

  useEffect(() => {
    // 加载天气类型
    fetch('/api/environment/weather-types')
      .then(res => res.json())
      .then(data => setWeatherTypes(data))
      .catch(console.error);
  }, []);

  const handleWeatherChange = async (type: string) => {
    if (disabled) return;
    setSelectedWeather(type);
    
    try {
      await fetch('/api/environment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weather_type: type,
          enabled,
          gradient_segments: gradients
        })
      });
    } catch (err) {
      console.error('Failed to update weather:', err);
    }
  };

  const addGradient = async () => {
    if (newGradient.start_km >= newGradient.end_km) return;
    
    const updated = [...gradients, newGradient];
    setGradients(updated);
    setNewGradient({ start_km: 0, end_km: 0, gradient_percent: 0 });
    
    try {
      await fetch('/api/environment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weather_type: selectedWeather,
          enabled,
          gradient_segments: updated
        })
      });
    } catch (err) {
      console.error('Failed to add gradient:', err);
    }
  };

  const selectedWeatherInfo = weatherTypes.find(w => w.type === selectedWeather);

  return (
    <div className="space-y-4">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--text-secondary)]">🌤️ 环境设置</h3>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
            disabled={disabled}
            className="rounded"
          />
          <span className="text-xs text-[var(--text-muted)]">启用</span>
        </label>
      </div>

      {/* 天气选择器 */}
      <div className={`transition-opacity ${!enabled ? 'opacity-50' : ''}`}>
        <p className="text-xs text-[var(--text-muted)] mb-2">天气条件</p>
        <div className="grid grid-cols-5 gap-2">
          {weatherTypes.map(w => (
            <button
              key={w.type}
              onClick={() => handleWeatherChange(w.type)}
              disabled={disabled || !enabled}
              className={`
                p-3 rounded-lg border transition-all text-center
                ${selectedWeather === w.type
                  ? `border-[var(--accent-blue)] bg-gradient-to-br ${WEATHER_COLORS[w.type]} text-white shadow-lg`
                  : 'border-[var(--glass-border)] bg-[var(--glass-bg)] hover:border-[var(--accent-blue)]/50'
                }
              `}
              title={w.description}
            >
              <span className="text-2xl">{WEATHER_ICONS[w.type]}</span>
              <p className="text-xs mt-1 truncate">{w.name}</p>
            </button>
          ))}
        </div>

        {/* 当前天气效果 */}
        {selectedWeatherInfo && (
          <div className="mt-3 p-3 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)]">
            <p className="text-xs text-[var(--text-muted)]">{selectedWeatherInfo.description}</p>
            <div className="flex gap-4 mt-2 text-xs">
              <span>速度: <span className="text-[var(--accent-blue)]">{(selectedWeatherInfo.speed_factor * 100).toFixed(0)}%</span></span>
              <span>间隔: <span className="text-[var(--accent-purple)]">{(selectedWeatherInfo.headway_factor * 100).toFixed(0)}%</span></span>
            </div>
          </div>
        )}
      </div>

      {/* 坡度配置 */}
      <div className={`transition-opacity ${!enabled ? 'opacity-50' : ''}`}>
        <p className="text-xs text-[var(--text-muted)] mb-2">道路坡度 ({gradients.length} 段)</p>
        
        {gradients.length > 0 && (
          <div className="space-y-1 mb-2">
            {gradients.map((g, i) => (
              <div key={i} className="flex items-center justify-between text-xs p-2 rounded bg-[rgba(255,255,255,0.03)]">
                <span>{g.start_km}-{g.end_km} km</span>
                <span className={g.gradient_percent > 0 ? 'text-red-400' : 'text-green-400'}>
                  {g.gradient_percent > 0 ? '↗️' : '↘️'} {Math.abs(g.gradient_percent)}%
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 添加坡度 */}
        <div className="grid grid-cols-4 gap-2">
          <input
            type="number"
            placeholder="起点 km"
            value={newGradient.start_km || ''}
            onChange={e => setNewGradient({ ...newGradient, start_km: +e.target.value })}
            disabled={disabled || !enabled}
            className="p-2 text-xs rounded border border-[var(--glass-border)] bg-[var(--glass-bg)]"
          />
          <input
            type="number"
            placeholder="终点 km"
            value={newGradient.end_km || ''}
            onChange={e => setNewGradient({ ...newGradient, end_km: +e.target.value })}
            disabled={disabled || !enabled}
            className="p-2 text-xs rounded border border-[var(--glass-border)] bg-[var(--glass-bg)]"
          />
          <input
            type="number"
            placeholder="坡度 %"
            value={newGradient.gradient_percent || ''}
            onChange={e => setNewGradient({ ...newGradient, gradient_percent: +e.target.value })}
            disabled={disabled || !enabled}
            className="p-2 text-xs rounded border border-[var(--glass-border)] bg-[var(--glass-bg)]"
          />
          <button
            onClick={addGradient}
            disabled={disabled || !enabled}
            className="p-2 text-xs rounded bg-[var(--accent-blue)] text-black font-medium hover:opacity-80"
          >
            添加
          </button>
        </div>
      </div>
    </div>
  );
};
