import React, { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ConfigPanel } from './components/ConfigPanel';
import { ControlBar } from './components/ControlBar';
import { ChartsPanel } from './components/ChartsPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { LogConsole } from './components/LogConsole';
import { RoadNetworkOverview } from './components/RoadNetworkOverview';
import { SegmentInspector } from './components/SegmentInspector';
import { MicroscopicInspector } from './components/MicroscopicInspector';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SituationScreenPage } from './components/pages/SituationScreenPage';
import { useI18nStore } from './stores/i18nStore';
import { useSimStore } from './stores/simStore';
import { engine } from './engine/SimulationEngine';
import { useTheme } from './utils/useTheme';

const ReplayPage = React.lazy(() => import('./components/pages/ReplayPage').then(m => ({ default: m.ReplayPage })));
const DashboardPage = React.lazy(() => import('./components/pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const ScenariosPage = React.lazy(() => import('./components/pages/ScenariosPage').then(m => ({ default: m.ScenariosPage })));
const WorkflowPage = React.lazy(() => import('./components/pages/WorkflowPage').then(m => ({ default: m.WorkflowPage })));
const FileManagerPage = React.lazy(() => import('./components/pages/FileManagerPage').then(m => ({ default: m.FileManagerPage })));
const RoadEditorPage = React.lazy(() => import('./components/pages/RoadEditorPage').then(m => ({ default: m.RoadEditorPage })));
const PredictBuilderPage = React.lazy(() => import('./components/pages/PredictBuilderPage').then(m => ({ default: m.PredictBuilderPage })));

const NAV_ITEMS = [
  { path: '/sim', icon: '🚦', label: '仿真控制', labelEn: 'Simulation' },
  { path: '/replay', icon: '🎞️', label: '可视回放', labelEn: 'Replay' },
  { path: '/dashboard', icon: '📊', label: '预警仪表盘', labelEn: 'Dashboard' },
  { path: '/scenarios', icon: '🧩', label: '场景模板', labelEn: 'Scenarios' },
  { path: '/workflow', icon: '🧭', label: '工作流编辑', labelEn: 'Workflow' },
  { path: '/files', icon: '🗂️', label: '文件管理器', labelEn: 'File Manager' },
  { path: '/editor', icon: '🛣️', label: '路径编辑', labelEn: 'Editor' },
  { path: '/predict-builder', icon: '📈', label: '时序预测工作台', labelEn: 'Predict Builder' },
  { path: '/screen', icon: '🖥️', label: '态势大屏', labelEn: 'Situation Screen' },
];

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
      <aside className="w-80 flex flex-col glass-panel z-20 shrink-0 border-r border-[var(--glass-border)]">
        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
          <ConfigPanel disabled={isRunning} />
        </div>
        <div className="p-4 border-t border-[var(--glass-border)] text-xs text-[var(--text-muted)]">
          {t('app.footer')}
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative overflow-hidden bg-[var(--bg-base)]">
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

        <div className="flex-1 overflow-y-auto overflow-x-hidden relative">
          <div className="max-w-[1600px] mx-auto p-8 space-y-8">
            <div className="glass-card p-6">
              <h3 className="text-lg font-medium mb-4 text-[var(--text-primary)]">{t('app.simulationStats')}</h3>
              <ResultsPanel />
            </div>
            <div ref={chartsRef} className="space-y-4">
              <RoadNetworkOverview />
              <SegmentInspector />
              <MicroscopicInspector />
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
  const { theme, setTheme, themes } = useTheme();
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [showFullName, setShowFullName] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setThemeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const engineTheme = theme === 'light' ? 'light' : 'dark';
    engine.setTheme(engineTheme);
  }, [theme]);

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="flex h-screen w-screen bg-[var(--bg-base)] text-[var(--text-primary)] font-sans overflow-hidden">
        <nav className={`flex flex-col border-r border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-xl shrink-0 transition-[width] duration-300 ${navCollapsed ? 'w-16' : 'w-52'}`}>
          <div
            className="h-16 flex items-center justify-center px-3 border-b border-[var(--glass-border)] cursor-pointer hover:bg-[rgba(255,255,255,0.05)] transition-colors overflow-hidden"
            onClick={() => setShowFullName(!showFullName)}
          >
            {showFullName ? (
              <span className="text-sm font-medium tracking-tight text-[var(--text-primary)] text-center flex-1 leading-tight" style={{ whiteSpace: 'pre-line' }}>
                {navCollapsed ? 'ETC\n系统' : 'ETC 交通仿真与预警分析系统'}
              </span>
            ) : (
              <>
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)] flex items-center justify-center text-black font-bold shadow-[0_0_15px_rgba(168,199,250,0.3)] shrink-0">
                  E
                </div>
                {!navCollapsed && (
                  <span className="ml-3 text-base font-medium tracking-tight text-[var(--text-primary)] truncate shrink-0">
                    ETC Sim
                  </span>
                )}
              </>
            )}
          </div>

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

          <div className="p-3 border-t border-[var(--glass-border)] space-y-2">
            <div ref={themeMenuRef} className="relative">
              <button
                onClick={() => setThemeMenuOpen(open => !open)}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
              >
                <span className="text-lg">{themes.find(item => item.id === theme)?.icon ?? '🎨'}</span>
                {!navCollapsed && (
                  <span className="flex-1 text-left">
                    {lang === 'zh'
                      ? (themes.find(item => item.id === theme)?.label ?? '主题')
                      : (themes.find(item => item.id === theme)?.labelEn ?? 'Theme')}
                  </span>
                )}
                {!navCollapsed && <span className="text-xs opacity-50">{themeMenuOpen ? '▲' : '▼'}</span>}
              </button>
              {themeMenuOpen && (
                <div
                  className="absolute bottom-full left-0 right-0 mb-1 rounded-lg overflow-hidden shadow-xl"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--glass-border)', zIndex: 100 }}
                >
                  {themes.map(item => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setTheme(item.id);
                        setThemeMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors text-left"
                      style={{
                        background: item.id === theme ? 'var(--glass-bg-hover)' : 'transparent',
                        color: item.id === theme ? 'var(--accent-blue)' : 'var(--text-secondary)',
                      }}
                    >
                      <span className="text-base shrink-0">{item.icon}</span>
                      {!navCollapsed && <span>{lang === 'zh' ? item.label : item.labelEn}</span>}
                      {item.id === theme && <span className="ml-auto text-xs">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
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

        <div className="flex-1 overflow-hidden">
          <ErrorBoundary>
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
                  <div className="text-center">
                    <div className="animate-spin w-8 h-8 border-2 border-[var(--accent-blue)] border-t-transparent rounded-full mx-auto mb-3" />
                    <span className="text-sm">加载中...</span>
                  </div>
                </div>
              }
            >
              <AnimatedRoutes />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </BrowserRouter>
  );
}

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
          <Route path="/files" element={<FileManagerPage />} />
          <Route path="/editor" element={<RoadEditorPage />} />
          <Route path="/predict-builder" element={<PredictBuilderPage />} />
          <Route path="/screen" element={<SituationScreenPage />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export default App;
