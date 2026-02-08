/**
 * ETC 交通仿真系统 - Modern UI (Glassmorphism)
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ConfigPanel } from './components/ConfigPanel';
import { ControlBar } from './components/ControlBar';
import { ChartsPanel } from './components/ChartsPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { LogConsole } from './components/LogConsole';
import { RoadViewer } from './components/RoadViewer';
import { useI18nStore } from './stores/i18nStore';
import { useSimStore } from './stores/simStore';
import { engine } from './engine/SimulationEngine';
import { useTheme } from './utils/useTheme';

function App() {
  const { isRunning, isComplete, turboMode, setTurboMode } = useSimStore();
  const { lang, setLang, t } = useI18nStore();
  const { theme, toggleTheme } = useTheme();
  const chartsRef = React.useRef<HTMLDivElement>(null);
  const prevRunningRef = React.useRef(isRunning);

  // ... (useEffect remains same)

  // Sync theme to engine
  useEffect(() => {
    engine.setTheme(theme);
  }, [theme]);

  // 引擎控制回调
  const handleStart = useCallback(() => engine.start(), []);
  const handlePause = useCallback(() => engine.pause(), []);
  const handleResume = useCallback(() => engine.resume(), []);
  const handleStop = useCallback(() => engine.stop(), []);
  const handleReset = useCallback(() => engine.reset(), []);

  return (
    <div className="flex h-screen w-screen bg-[var(--bg-base)] text-[var(--text-primary)] font-sans overflow-hidden">

      {/* 左侧侧边栏 - 配置与信息 */}
      <aside className="w-80 flex flex-col glass-panel z-20 shrink-0 border-r border-[var(--glass-border)]">
        {/* Title & Switchers */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-[var(--glass-border)]">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)] flex items-center justify-center text-black font-bold mr-3 shadow-[0_0_15px_rgba(168,199,250,0.3)]">
              E
            </div>
            <span className="text-lg font-medium tracking-tight text-white">{t('app.title')}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-1.5 text-lg rounded border border-[var(--glass-border)] bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] transition-colors"
              title={theme === 'dark' ? t('app.themeToggle.toLight') : t('app.themeToggle.toDark')}
            >
              {theme === 'dark' ? '🌙' : '☀️'}
            </button>

            {/* Language Toggle */}
            <button
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              className="px-2 py-1 text-xs font-medium rounded border border-[var(--glass-border)] bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] transition-colors text-[var(--text-secondary)]"
            >
              {lang === 'zh' ? 'EN' : '中'}
            </button>
          </div>
        </div>

        {/* Config Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
          <ConfigPanel disabled={isRunning} />
        </div>

        {/* Bottom Info or Credits */}
        <div className="p-4 border-t border-[var(--glass-border)] text-xs text-[var(--text-muted)]">
          {t('app.footer')}
        </div>
      </aside>

      {/* 主内容区域 */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-[var(--bg-base)]">

        {/* 顶部控制栏 & 统计 */}
        <div className="h-20 shrink-0 flex items-center justify-between px-8 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md z-10">
          <div className="flex items-center gap-6">
            <ControlBar
              onStart={handleStart}
              onPause={handlePause}
              onResume={handleResume}
              onStop={handleStop}
              onReset={handleReset}
            />

            {/* Turbo Switch (Hidden as it is default now) */}
            {/* <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--glass-border)] bg-[rgba(255,255,255,0.03)]">
              <span className={`text-sm font-medium ${turboMode ? 'text-[var(--accent-green)]' : 'text-[var(--text-secondary)]'}`}>
                ⚡ Turbo
              </span>
              <button
                onClick={() => setTurboMode(!turboMode)}
                disabled={isRunning}
                className={`w-10 h-5 rounded-full relative transition-colors ${turboMode ? 'bg-[var(--accent-green)]' : 'bg-[var(--text-muted)]'}`}
              >
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${turboMode ? 'left-6' : 'left-1'}`} />
              </button>
            </div> */}
          </div>

          <div className="flex items-center gap-4">
            <ResultsPanel />
          </div>
        </div>

        {/* 可滚动视图区域 */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden relative">
          <div className="max-w-[1600px] mx-auto p-8 space-y-8">

            {/* 仿真视窗 (已移除 Real-time View) */}

            {/* 统计面板 */}
            <div className="glass-card p-6">
              <h3 className="text-lg font-medium mb-4 text-[var(--text-primary)]">{t('app.simulationStats')}</h3>
              <ResultsPanel />
            </div>

            {/* 图表 Grid */}
            <div ref={chartsRef} className="space-y-4">
              <h3 className="text-lg font-medium text-[var(--text-primary)] px-2">{t('app.analysisCharts')}</h3>
              <ChartsPanel />
            </div>

            {/* Log Console Floating or Embedded? Embedded for now. */}
            <div className="glass-card p-4 h-64 overflow-hidden flex flex-col">
              <h3 className="text-sm font-medium mb-2 text-[var(--text-secondary)]">{t('app.systemLogs')}</h3>
              <div className="flex-1 overflow-hidden relative">
                <LogConsole />
              </div>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}

export default App;
