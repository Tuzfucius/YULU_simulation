/**
 * ETC 交通仿真系统 - Modern UI (Multi-Page with Router)
 */

import React, { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ConfigPanel } from './components/ConfigPanel';
import { ControlBar } from './components/ControlBar';
import { ChartsPanel } from './components/ChartsPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { LogConsole } from './components/LogConsole';
import { ReplayPage } from './components/pages/ReplayPage';
import { DashboardPage } from './components/pages/DashboardPage';
import { ScenariosPage } from './components/pages/ScenariosPage';
import { WorkflowPage } from './components/pages/WorkflowPage';
import { EvaluationPage } from './components/pages/EvaluationPage';
import { RoadEditorPage } from './components/pages/RoadEditorPage';
import { useI18nStore } from './stores/i18nStore';
import { useSimStore } from './stores/simStore';
import { engine } from './engine/SimulationEngine';
import { useTheme } from './utils/useTheme';

// 导航项
const NAV_ITEMS = [
  { path: '/sim', icon: '🎯', label: '仿真控制', labelEn: 'Simulation' },
  { path: '/replay', icon: '🛣️', label: '俯视回放', labelEn: 'Replay' },
  { path: '/dashboard', icon: '📊', label: '预警仪表盘', labelEn: 'Dashboard' },
  { path: '/scenarios', icon: '🧪', label: '场景模板', labelEn: 'Scenarios' },
  { path: '/workflow', icon: '🔀', label: '工作流编辑', labelEn: 'Workflow' },
  { path: '/editor', icon: '✏️', label: '路径编辑', labelEn: 'Editor' },
  { path: '/evaluation', icon: '📊', label: '评估面板', labelEn: 'Evaluation' },
];

// 仿真主页面（原单页面内容）
function SimulationPage() {
  const { isRunning } = useSimStore();
  const { t } = useI18nStore();
  const chartsRef = React.useRef<HTMLDivElement>(null);

  const handleStart = useCallback(() => engine.start(), []);
  const handlePause = useCallback(() => engine.pause(), []);
  const handleResume = useCallback(() => engine.resume(), []);
  const handleStop = useCallback(() => engine.stop(), []);
  const handleReset = useCallback(() => engine.reset(), []);

  return (
    <div className="flex h-full">
      {/* 左侧配置面板 */}
      <aside className="w-80 flex flex-col glass-panel z-20 shrink-0 border-r border-[var(--glass-border)]">
        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
          <ConfigPanel disabled={isRunning} />
        </div>
        <div className="p-4 border-t border-[var(--glass-border)] text-xs text-[var(--text-muted)]">
          {t('app.footer')}
        </div>
      </aside>

      {/* 主内容区域 */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-[var(--bg-base)]">
        {/* 顶部控制栏 */}
        <div className="h-20 shrink-0 flex items-center justify-between px-8 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md z-10">
          <div className="flex items-center gap-6">
            <ControlBar
              onStart={handleStart}
              onPause={handlePause}
              onResume={handleResume}
              onStop={handleStop}
              onReset={handleReset}
            />
          </div>
          <div className="flex items-center gap-4">
            <ResultsPanel />
          </div>
        </div>

        {/* 可滚动视图区域 */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden relative">
          <div className="max-w-[1600px] mx-auto p-8 space-y-8">
            <div className="glass-card p-6">
              <h3 className="text-lg font-medium mb-4 text-[var(--text-primary)]">{t('app.simulationStats')}</h3>
              <ResultsPanel />
            </div>
            <div ref={chartsRef} className="space-y-4">
              <h3 className="text-lg font-medium text-[var(--text-primary)] px-2">{t('app.analysisCharts')}</h3>
              <ChartsPanel />
            </div>
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

function App() {
  const { lang, setLang } = useI18nStore();
  const { theme, toggleTheme } = useTheme();
  const [navCollapsed, setNavCollapsed] = useState(false);

  useEffect(() => {
    engine.setTheme(theme);
  }, [theme]);

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="flex h-screen w-screen bg-[var(--bg-base)] text-[var(--text-primary)] font-sans overflow-hidden">

        {/* 全局导航侧边栏 */}
        <nav className={`flex flex-col border-r border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-xl shrink-0 transition-[width] duration-300 ${navCollapsed ? 'w-16' : 'w-52'}`}>

          {/* Logo */}
          <div className="h-16 flex items-center justify-center px-4 border-b border-[var(--glass-border)]">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)] flex items-center justify-center text-black font-bold shadow-[0_0_15px_rgba(168,199,250,0.3)]">
              E
            </div>
            {!navCollapsed && (
              <span className="ml-3 text-base font-medium tracking-tight text-[var(--text-primary)] truncate">
                ETC Sim
              </span>
            )}
          </div>

          {/* 导航项 */}
          <div className="flex-1 py-4 space-y-1 px-2">
            {NAV_ITEMS.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${isActive
                    ? 'bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] font-medium'
                    : 'text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text-primary)]'
                  }`
                }
              >
                <span className="text-lg shrink-0">{item.icon}</span>
                {!navCollapsed && <span className="truncate">{lang === 'zh' ? item.label : item.labelEn}</span>}
              </NavLink>
            ))}
          </div>

          {/* 底部控制 */}
          <div className="p-3 border-t border-[var(--glass-border)] space-y-2">
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
            >
              <span className="text-lg">{theme === 'dark' ? '🌙' : '☀️'}</span>
              {!navCollapsed && <span>{lang === 'zh' ? (theme === 'dark' ? '深色' : '浅色') : (theme === 'dark' ? 'Dark' : 'Light')}</span>}
            </button>
            <button
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
            >
              <span className="text-lg">🌐</span>
              {!navCollapsed && <span>{lang === 'zh' ? 'English' : '中文'}</span>}
            </button>
            <button
              onClick={() => setNavCollapsed(!navCollapsed)}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
            >
              <span className="text-lg">{navCollapsed ? '▶' : '◀'}</span>
              {!navCollapsed && <span>{lang === 'zh' ? '收起' : 'Collapse'}</span>}
            </button>
          </div>
        </nav>

        {/* 路由内容区域 — 带过渡动画 */}
        <div className="flex-1 overflow-hidden">
          <AnimatedRoutes />
        </div>
      </div>
    </BrowserRouter>
  );
}

/** 带动画的路由切换 */
function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="h-full"
      >
        <Routes location={location}>
          <Route path="/" element={<Navigate to="/sim" replace />} />
          <Route path="/sim" element={<SimulationPage />} />
          <Route path="/replay" element={<ReplayPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/scenarios" element={<ScenariosPage />} />
          <Route path="/workflow" element={<WorkflowPage />} />
          <Route path="/editor" element={<RoadEditorPage />} />
          <Route path="/evaluation" element={<EvaluationPage />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export default App;
