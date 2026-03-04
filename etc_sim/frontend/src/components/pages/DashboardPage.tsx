/**
 * 预警仪表盘 — Python 脚本编辑器
 * 
 * 包含：
 * - 左侧：脚本目录树 + 门架信息列表
 * - 中间：Monaco Python 编辑器 + 输出面板
 * - 右侧：ETCGateData 类完整 API 文档和使用示例
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useI18nStore } from '../../stores/i18nStore';

interface TreeNode {
    name: string;
    path: string;
    isDir: boolean;
    children?: TreeNode[];
}

interface GateInfo {
    id: string;
    position_m: number;
    position_km: number;
    segment: number;
}

interface SimRunItem {
    name: string;
    path: string;
    meta?: Record<string, any>;
}

const DEFAULT_SCRIPT = `"""
ETC 门架预警脚本

可用变量:
    gate_data: ETCGateData 实例（门架数据工具类）

常用方法:
    gate_data.list_files(ext=".csv")  → 列出 output 目录中指定后缀的文件
    gate_data.read_csv(path)          → 将 CSV 文件读取为字典列表
    gate_data.read_json(path)         → 将 JSON 文件读取为字典/列表

提示:
    - 所有数据文件位于 output/ 目录下
    - CSV 读取后每行是一个字典, 键为列标题
    - 使用 print() 输出日志和预警信息
"""

# ===== 第 1 步：查看有哪些数据文件 =====
csv_files = gate_data.list_files(".csv")
json_files = gate_data.list_files(".json")
print(f"📂 数据概览:")
print(f"   CSV 文件: {len(csv_files)} 个")
print(f"   JSON 文件: {len(json_files)} 个")

# ===== 第 2 步：读取数据 =====
if csv_files:
    # 读取第一个 CSV 文件
    data = gate_data.read_csv(csv_files[0])
    print(f"\\n📊 读取 {csv_files[0]}:")
    print(f"   记录数: {len(data)}")
    if data:
        print(f"   列名: {list(data[0].keys())}")
        print(f"   前 3 行:")
        for row in data[:3]:
            print(f"     {row}")

# ===== 第 3 步：自定义预警逻辑 =====
# 在这里编写你的预警判断代码
# 例如：检测平均速度是否异常
# SPEED_THRESHOLD = 60  # km/h
# ...

print("\\n✅ 脚本执行完毕")
`;

export const DashboardPage: React.FC = () => {
    const { lang } = useI18nStore();
    const isEn = lang === 'en';

    const [script, setScript] = useState(DEFAULT_SCRIPT);
    const [currentPath, setCurrentPath] = useState('');
    const [isModified, setIsModified] = useState(false);
    const [output, setOutput] = useState<{ type: 'stdout' | 'stderr'; text: string }[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [scriptTree, setScriptTree] = useState<TreeNode[]>([]);
    const [scriptsDir, setScriptsDir] = useState('');
    const [newFileName, setNewFileName] = useState('');
    const [showNewFile, setShowNewFile] = useState(false);
    const [activeTab, setActiveTab] = useState<'scripts' | 'gates'>('scripts');
    const outputRef = useRef<HTMLDivElement>(null);

    // 仿真记录 & 动态门架
    const [simRuns, setSimRuns] = useState<SimRunItem[]>([]);
    const [selectedRunDir, setSelectedRunDir] = useState<string>('');
    const [gates, setGates] = useState<GateInfo[]>([]);
    const [gatesLoading, setGatesLoading] = useState(false);
    const [gatesConfig, setGatesConfig] = useState<Record<string, any>>({});

    const refreshTree = useCallback(async () => {
        try {
            const res = await fetch('/api/files/scripts/tree');
            if (res.ok) { const d = await res.json(); setScriptTree(d.tree || []); setScriptsDir(d.dir || ''); }
        } catch { }
    }, []);

    // 加载仿真运行记录列表
    const refreshSimRuns = useCallback(async () => {
        try {
            const res = await fetch('/api/files/output-files');
            if (res.ok) {
                const d = await res.json();
                // 过滤出包含 data.json 的目录（按 path 提取目录名）
                const jsonFiles = (d.files || []).filter((f: any) => f.name === 'data.json');
                const runs: SimRunItem[] = jsonFiles.map((f: any) => {
                    const dir = f.path.replace(/[\\/]data\.json$/, '');
                    return { name: dir, path: dir, meta: f.meta };
                });
                setSimRuns(runs);
            }
        } catch { }
    }, []);

    // 加载指定仿真记录的门架信息
    const loadGates = useCallback(async (runDir: string) => {
        if (!runDir) { setGates([]); setGatesConfig({}); return; }
        setGatesLoading(true);
        try {
            const res = await fetch(`/api/files/simulation-gates?path=${encodeURIComponent(runDir)}`);
            if (res.ok) {
                const d = await res.json();
                setGates(d.gates || []);
                setGatesConfig(d.config || {});
            }
        } catch { }
        setGatesLoading(false);
    }, []);

    useEffect(() => { refreshTree(); refreshSimRuns(); }, [refreshTree, refreshSimRuns]);
    useEffect(() => { if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight; }, [output]);

    const loadScript = useCallback(async (path: string) => {
        try {
            const res = await fetch(`/api/files/scripts/read?path=${encodeURIComponent(path)}`);
            if (res.ok) { const d = await res.json(); setScript(d.content); setCurrentPath(path); setIsModified(false); }
        } catch { }
    }, []);

    const saveScript = useCallback(async (path?: string) => {
        const p = path || currentPath;
        if (!p) { setShowNewFile(true); return; }
        try {
            const res = await fetch('/api/files/scripts/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p, content: script }) });
            if (res.ok) { setCurrentPath(p); setIsModified(false); refreshTree(); }
        } catch { }
    }, [script, currentPath, refreshTree]);

    const createNewFile = useCallback(async () => {
        if (!newFileName.trim()) return;
        const fn = newFileName.endsWith('.py') ? newFileName : `${newFileName}.py`;
        await saveScript(fn); setNewFileName(''); setShowNewFile(false);
    }, [newFileName, saveScript]);

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveScript(); } };
        window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
    }, [saveScript]);

    const runScript = useCallback(async () => {
        setIsRunning(true); setOutput([]);
        try {
            const body: Record<string, any> = { code: script, timeout: 15 };
            if (selectedRunDir) body.sim_run_dir = selectedRunDir;
            const res = await fetch('/api/files/scripts/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (res.ok) {
                const d = await res.json();
                const items: typeof output = [];
                if (d.stdout) items.push({ type: 'stdout', text: d.stdout });
                if (d.stderr) items.push({ type: 'stderr', text: d.stderr });
                if (items.length === 0) items.push({ type: 'stdout', text: isEn ? '(no output)' : '（无输出）' });
                setOutput(items);
            }
        } catch (e: any) { setOutput([{ type: 'stderr', text: `❌ ${e.message}` }]); }
        setIsRunning(false);
    }, [script, isEn, selectedRunDir]);

    // 目录树渲染
    const renderTree = (nodes: TreeNode[], depth = 0) => (
        <div className="space-y-0.5">
            {nodes.map(node => (
                <div key={node.path}>
                    <button onClick={() => !node.isDir && loadScript(node.path)}
                        className={`w-full text-left flex items-center gap-1.5 py-1 px-2 rounded text-xs transition-colors hover:bg-[rgba(255,255,255,0.05)] ${currentPath === node.path ? 'bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]' : 'text-[var(--text-secondary)]'}`}
                        style={{ paddingLeft: `${8 + depth * 12}px` }}>
                        <span>{node.isDir ? '📁' : '🐍'}</span>
                        <span className="truncate">{node.name}</span>
                    </button>
                    {node.isDir && node.children && renderTree(node.children, depth + 1)}
                </div>
            ))}
        </div>
    );

    return (
        <div className="flex h-full bg-[var(--bg-base)]">
            {/* ===== 左侧面板 ===== */}
            <div className="w-60 flex flex-col border-r border-[var(--glass-border)] bg-[var(--glass-bg)] shrink-0">
                {/* Tab 切换：脚本 / 门架 */}
                <div className="flex border-b border-[var(--glass-border)]">
                    <button onClick={() => setActiveTab('scripts')}
                        className={`flex-1 py-2 text-xs font-medium transition-colors ${activeTab === 'scripts' ? 'text-[var(--accent-blue)] border-b-2 border-[var(--accent-blue)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
                        📂 {isEn ? 'Scripts' : '脚本'}
                    </button>
                    <button onClick={() => setActiveTab('gates')}
                        className={`flex-1 py-2 text-xs font-medium transition-colors ${activeTab === 'gates' ? 'text-[var(--accent-blue)] border-b-2 border-[var(--accent-blue)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
                        🚦 {isEn ? 'Gates' : '门架列表'}
                    </button>
                </div>

                {activeTab === 'scripts' ? (
                    <>
                        <div className="px-3 py-2 border-b border-[var(--glass-border)] flex items-center justify-between">
                            <span className="text-[10px] text-[var(--text-muted)] font-mono truncate" title={scriptsDir}>{scriptsDir || 'scripts/'}</span>
                            <div className="flex gap-1.5">
                                <button onClick={() => setShowNewFile(true)} className="text-xs text-[var(--text-muted)] hover:text-[var(--accent-green)]" title={isEn ? 'New' : '新建'}>➕</button>
                                <button onClick={refreshTree} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">🔄</button>
                            </div>
                        </div>
                        {showNewFile && (
                            <div className="px-3 py-2 border-b border-[var(--glass-border)] flex gap-1">
                                <input value={newFileName} onChange={e => setNewFileName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createNewFile()}
                                    placeholder="filename.py" className="flex-1 text-xs px-2 py-1 rounded bg-[rgba(0,0,0,0.2)] border border-[var(--glass-border)] text-[var(--text-primary)] outline-none" autoFocus />
                                <button onClick={createNewFile} className="text-xs text-[var(--accent-green)]">✓</button>
                                <button onClick={() => setShowNewFile(false)} className="text-xs text-[var(--text-muted)]">✕</button>
                            </div>
                        )}
                        <div className="flex-1 overflow-y-auto py-1 scrollbar-thin">
                            {scriptTree.length === 0 ? (
                                <div className="px-3 py-4 text-center text-[10px] text-[var(--text-muted)]">{isEn ? 'No scripts yet. Click + to create.' : '暂无脚本，点击 + 新建'}</div>
                            ) : renderTree(scriptTree)}
                        </div>
                    </>
                ) : (
                    /* 门架信息列表 — 动态加载 */
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {/* 仿真记录选择器 */}
                        <div className="px-3 py-2 border-b border-[var(--glass-border)] space-y-1.5">
                            <label className="text-[10px] text-[var(--text-muted)]">
                                {isEn ? 'Select simulation record' : '选择仿真记录'}
                            </label>
                            <select
                                value={selectedRunDir}
                                onChange={e => { setSelectedRunDir(e.target.value); loadGates(e.target.value); }}
                                className="w-full text-xs px-2 py-1.5 rounded bg-[rgba(0,0,0,0.2)] border border-[var(--glass-border)] text-[var(--text-primary)] outline-none cursor-pointer"
                            >
                                <option value="">{isEn ? '-- Select --' : '-- 请选择 --'}</option>
                                {simRuns.map(run => (
                                    <option key={run.path} value={run.path}>{run.name}</option>
                                ))}
                            </select>
                            {selectedRunDir && gatesConfig.road_length_km && (
                                <div className="text-[9px] text-[var(--text-muted)] flex flex-wrap gap-x-3">
                                    <span>🛣️ {gatesConfig.road_length_km || gatesConfig.custom_road_length_km} km</span>
                                    {gatesConfig.num_lanes && <span>🚗 {gatesConfig.num_lanes} {isEn ? 'lanes' : '车道'}</span>}
                                    {gatesConfig.total_vehicles && <span>📊 {gatesConfig.total_vehicles} {isEn ? 'vehicles' : '车辆'}</span>}
                                </div>
                            )}
                        </div>

                        {/* 门架列表 */}
                        <div className="flex-1 overflow-y-auto scrollbar-thin">
                            {!selectedRunDir ? (
                                <div className="px-3 py-6 text-center text-[10px] text-[var(--text-muted)]">
                                    {isEn ? 'Please select a simulation record above to view gates.' : '请在上方选择一条仿真记录以查看门架信息'}
                                </div>
                            ) : gatesLoading ? (
                                <div className="px-3 py-6 text-center text-[10px] text-[var(--text-muted)]">⏳ {isEn ? 'Loading...' : '加载中...'}</div>
                            ) : gates.length === 0 ? (
                                <div className="px-3 py-6 text-center text-[10px] text-[var(--text-muted)]">
                                    {isEn ? 'No gate data found in this record.' : '该记录中未找到门架数据'}
                                </div>
                            ) : (
                                <>
                                    <div className="px-3 py-1.5 border-b border-[var(--glass-border)] text-[10px] text-[var(--text-muted)]">
                                        {isEn ? `${gates.length} gates loaded` : `已加载 ${gates.length} 个门架`}
                                    </div>
                                    {gates.map(gate => (
                                        <div key={gate.id} className="px-3 py-2.5 border-b border-[var(--glass-border)]/50 hover:bg-[rgba(255,255,255,0.03)]">
                                            <div className="flex items-center gap-2">
                                                <span className="w-12 text-xs font-mono font-medium text-[var(--accent-blue)]">{gate.id}</span>
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-purple)]/10 text-[var(--accent-purple)]">
                                                    {gate.position_km} km
                                                </span>
                                                <span className="text-[10px] text-[var(--text-muted)]">Seg {gate.segment}</span>
                                            </div>
                                            <p className="text-[10px] text-[var(--text-muted)] mt-0.5 ml-14">
                                                {isEn
                                                    ? `ETC Gate #${gate.segment} at ${gate.position_km} km`
                                                    : `第 ${gate.segment} 号 ETC 门架（里程 ${gate.position_km} km）`}
                                            </p>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ===== 中间：编辑器 + 输出 ===== */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="h-12 flex items-center justify-between px-4 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] shrink-0">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[rgba(255,255,255,0.03)] border border-[var(--glass-border)]">
                            <span className="text-xs">🐍</span>
                            <div className="flex items-center text-[11px] font-mono leading-none">
                                <span className="text-[var(--text-muted)]">scripts / </span>
                                <span className={`ml-1 ${currentPath ? 'text-[var(--accent-blue)] font-bold' : 'text-yellow-500/70 italic'}`}>
                                    {currentPath || (isEn ? 'unsaved_script.py' : '未命名脚本.py')}
                                </span>
                                {isModified && (
                                    <span className="ml-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-500 text-[10px] animate-pulse">
                                        ● {isEn ? 'Modified' : '已修改'}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => saveScript()} className="px-3 py-1 text-xs rounded-lg border border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.05)] transition-colors">
                            💾 {isEn ? 'Save' : '保存'}
                        </button>
                        <button onClick={runScript} disabled={isRunning} className="px-4 py-1 text-xs rounded-lg bg-[var(--accent-green,#34d399)] text-black font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
                            {isRunning ? '⏳' : '▶'} {isEn ? 'Run' : '运行'}
                        </button>
                    </div>
                </div>

                <div className="flex-1 min-h-0">
                    <Editor language="python" theme="vs-dark" value={script} onChange={(v) => { setScript(v || ''); setIsModified(true); }}
                        options={{ fontSize: 13, minimap: { enabled: false }, lineNumbers: 'on', scrollBeyondLastLine: false, wordWrap: 'on', padding: { top: 10 }, tabSize: 4, insertSpaces: true }} />
                </div>

                <div className="h-44 border-t border-[var(--glass-border)] flex flex-col">
                    <div className="px-4 py-1.5 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] flex items-center justify-between shrink-0">
                        <span className="text-xs text-[var(--text-muted)]">💬 {isEn ? 'Output' : '输出'}</span>
                        <button onClick={() => setOutput([])} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">{isEn ? 'Clear' : '清空'}</button>
                    </div>
                    <div ref={outputRef} className="flex-1 overflow-y-auto p-3 font-mono text-xs scrollbar-thin bg-[rgba(0,0,0,0.2)]">
                        {output.length === 0 ? (
                            <p className="text-[var(--text-muted)]">{isEn ? 'Click ▶ Run to execute...' : '点击 ▶ 运行来执行 Python 脚本...'}</p>
                        ) : output.flatMap((o, oi) => {
                            // 按行拆分，逐行检测图表标记
                            const lines = o.text.split('\n');
                            return lines.map((line, li) => {
                                const key = `${oi}-${li}`;
                                if (line.trimStart().startsWith('[JSON_CHART]')) {
                                    try {
                                        const chartData = JSON.parse(line.replace('[JSON_CHART]', '').trim());
                                        return (
                                            <div key={key} className="my-2 p-3 rounded bg-[var(--glass-bg)] border border-[var(--glass-border)]">
                                                <div className="text-[10px] font-bold mb-2 text-[var(--accent-blue)] uppercase tracking-wider">📈 {chartData.title || (isEn ? 'Chart' : '图表')}</div>
                                                <div className="h-32 flex items-end gap-1 px-2 pb-2 border-b border-[var(--glass-border)]/30">
                                                    {(chartData.series || []).map((val: number, idx: number) => {
                                                        const max = Math.max(...chartData.series, 1);
                                                        const pct = (val / max) * 100;
                                                        return (
                                                            <div key={idx} className="flex-1 flex flex-col items-center group">
                                                                <div className="w-full bg-[var(--accent-blue)]/40 hover:bg-[var(--accent-blue)] transition-all rounded-t-sm relative" style={{ height: `${pct}%` }}>
                                                                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 text-[8px] bg-black/80 px-1 rounded whitespace-nowrap">{val}</div>
                                                                </div>
                                                                <div className="mt-1 text-[8px] text-[var(--text-muted)] truncate max-w-[40px] text-center">{chartData.xAxis?.[idx] ?? idx}</div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    } catch {
                                        return <pre key={key} className="whitespace-pre-wrap text-red-400">❌ Chart JSON 解析失败</pre>;
                                    }
                                }
                                if (!line) return null;
                                return <pre key={key} className={`whitespace-pre-wrap ${o.type === 'stderr' ? 'text-red-400' : 'text-[var(--text-secondary)]'}`}>{line}</pre>;
                            });
                        })}
                    </div>
                </div>
            </div>

            {/* ===== 右侧：API 文档 ===== */}
            <div className="w-72 flex flex-col border-l border-[var(--glass-border)] bg-[var(--glass-bg)] shrink-0 overflow-y-auto scrollbar-thin">
                <div className="px-4 py-3 border-b border-[var(--glass-border)]">
                    <h3 className="text-sm font-medium text-[var(--text-primary)]">📖 {isEn ? 'API Reference' : '接口文档'}</h3>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">
                        {isEn ? 'Available variables and methods' : '可用变量与方法'}
                    </p>
                </div>

                <div className="p-4 space-y-4">
                    {/* gate_data 变量 */}
                    {/* sim_data 变量说明 */}
                    <div>
                        <h4 className="text-xs font-medium text-[var(--accent-blue)] mb-1">sim_data</h4>
                        <p className="text-[10px] text-[var(--text-muted)] mb-1.5">
                            {isEn ? 'Complete simulation result dict. Available when a simulation record is selected.' : '完整的仿真结果字典。选择仿真记录后自动注入，未选择时为 None。'}
                        </p>
                        <div className="p-2 rounded bg-[rgba(0,0,0,0.2)] text-[10px] font-mono text-[var(--text-secondary)] space-y-0.5">
                            <div className="text-[var(--text-muted)]"># {isEn ? 'Quick access aliases' : '快捷别名'}</div>
                            <div>sim_config  <span className="text-[var(--text-muted)]"># {isEn ? 'config dict' : '配置字典'}</span></div>
                            <div>sim_gates   <span className="text-[var(--text-muted)]"># {isEn ? 'gate list' : '门架列表'}</span></div>
                            <div>sim_stats   <span className="text-[var(--text-muted)]"># {isEn ? 'statistics' : '统计摘要'}</span></div>
                        </div>
                    </div>

                    <hr className="border-[var(--glass-border)]" />

                    {/* gate_data 变量 */}
                    <div>
                        <h4 className="text-xs font-medium text-[var(--accent-blue)] mb-1">gate_data</h4>
                        <p className="text-[10px] text-[var(--text-muted)] mb-2">
                            {isEn ? 'File I/O tool for the selected simulation directory.' : '文件读写工具，指向当前选中的仿真目录。'}
                        </p>
                    </div>

                    <hr className="border-[var(--glass-border)]" />

                    {/* list_files */}
                    <div>
                        <code className="text-[11px] font-mono text-[var(--accent-green)]">gate_data.list_files(ext=".csv")</code>
                        <p className="text-[10px] text-[var(--text-muted)] mt-1">
                            {isEn
                                ? 'Lists all files with the given extension in the output directory. Returns a list of relative file paths.'
                                : '列出 output 目录中指定后缀的所有文件。返回文件相对路径的列表。'}
                        </p>
                        <div className="mt-1.5 p-2 rounded bg-[rgba(0,0,0,0.2)] text-[10px] font-mono text-[var(--text-secondary)]">
                            <div className="text-[var(--text-muted)]"># {isEn ? 'Example' : '示例'}</div>
                            <div>files = gate_data.list_files(".csv")</div>
                            <div>json_files = gate_data.list_files(".json")</div>
                            <div className="text-[var(--text-muted)]"># → ["etc_flow_xxx.csv", ...]</div>
                        </div>
                        <div className="mt-1 text-[9px]">
                            <span className="text-[var(--accent-purple)]">{isEn ? 'Param' : '参数'}: </span>
                            <span className="text-[var(--text-muted)]">ext (str) — {isEn ? 'file extension filter, e.g. ".csv", ".json"' : '文件后缀过滤，如 ".csv"、".json"'}</span>
                        </div>
                        <div className="text-[9px]">
                            <span className="text-[var(--accent-purple)]">{isEn ? 'Returns' : '返回'}: </span>
                            <span className="text-[var(--text-muted)]">List[str] — {isEn ? 'list of relative file paths' : '文件相对路径列表'}</span>
                        </div>
                    </div>

                    <hr className="border-[var(--glass-border)]" />

                    {/* read_csv */}
                    <div>
                        <code className="text-[11px] font-mono text-[var(--accent-green)]">gate_data.read_csv(path)</code>
                        <p className="text-[10px] text-[var(--text-muted)] mt-1">
                            {isEn
                                ? 'Reads a CSV file and returns each row as a dictionary. Keys are the column headers from the first row.'
                                : '读取 CSV 文件，将每行转为字典。字典的键来自 CSV 第一行的列标题。'}
                        </p>
                        <div className="mt-1.5 p-2 rounded bg-[rgba(0,0,0,0.2)] text-[10px] font-mono text-[var(--text-secondary)]">
                            <div className="text-[var(--text-muted)]"># {isEn ? 'Example' : '示例'}</div>
                            <div>data = gate_data.read_csv("etc_flow_xxx.csv")</div>
                            <div>for row in data:</div>
                            <div>{'    '}print(row["speed"], row["lane"])</div>
                        </div>
                        <div className="mt-1 text-[9px]">
                            <span className="text-[var(--accent-purple)]">{isEn ? 'Param' : '参数'}: </span>
                            <span className="text-[var(--text-muted)]">path (str) — {isEn ? 'relative path from list_files()' : '来自 list_files() 的相对路径'}</span>
                        </div>
                        <div className="text-[9px]">
                            <span className="text-[var(--accent-purple)]">{isEn ? 'Returns' : '返回'}: </span>
                            <span className="text-[var(--text-muted)]">List[dict] — {isEn ? 'list of row dictionaries' : '字典列表，每个字典为一行数据'}</span>
                        </div>
                    </div>

                    <hr className="border-[var(--glass-border)]" />

                    {/* read_json */}
                    <div>
                        <code className="text-[11px] font-mono text-[var(--accent-green)]">gate_data.read_json(path)</code>
                        <p className="text-[10px] text-[var(--text-muted)] mt-1">
                            {isEn
                                ? 'Reads a JSON file and returns the parsed data structure (dict or list).'
                                : '读取 JSON 文件，返回解析后的数据结构（字典或列表）。'}
                        </p>
                        <div className="mt-1.5 p-2 rounded bg-[rgba(0,0,0,0.2)] text-[10px] font-mono text-[var(--text-secondary)]">
                            <div className="text-[var(--text-muted)]"># {isEn ? 'Example' : '示例'}</div>
                            <div>result = gate_data.read_json("simulation.json")</div>
                            <div>print(result["statistics"]["avgSpeed"])</div>
                        </div>
                        <div className="mt-1 text-[9px]">
                            <span className="text-[var(--accent-purple)]">{isEn ? 'Param' : '参数'}: </span>
                            <span className="text-[var(--text-muted)]">path (str) — {isEn ? 'relative path to JSON file' : 'JSON 文件的相对路径'}</span>
                        </div>
                        <div className="text-[9px]">
                            <span className="text-[var(--accent-purple)]">{isEn ? 'Returns' : '返回'}: </span>
                            <span className="text-[var(--text-muted)]">dict | list | None — {isEn ? 'parsed JSON, or None if not found' : '解析后的 JSON 数据，文件不存在则返回 None'}</span>
                        </div>
                    </div>

                    <hr className="border-[var(--glass-border)]" />

                    {/* print */}
                    <div>
                        <code className="text-[11px] font-mono text-[var(--accent-green)]">print(...)</code>
                        <p className="text-[10px] text-[var(--text-muted)] mt-1">
                            {isEn
                                ? 'Standard Python print. Output appears in the panel below the editor.'
                                : 'Python 标准 print 函数。输出内容会显示在编辑器下方的输出面板中。'}
                        </p>
                    </div>

                    <hr className="border-[var(--glass-border)]" />

                    {/* 代码片段 Snippets */}
                    <div>
                        <h4 className="text-xs font-medium text-[var(--text-primary)] mb-2">⚡ {isEn ? 'Snippets' : '常用算法模板'}</h4>
                        <div className="space-y-2">
                            {[
                                {
                                    name: isEn ? 'Simulation Overview' : '仿真概况解析',
                                    code: `\n# ===== 仿真概况解析 =====\nif sim_data is None:\n    print("⚠️ 请先在左侧门架列表 Tab 中选择一条仿真记录")\nelse:\n    print(f"📦 仿真配置:")\n    print(f"   路长: {sim_config.get('road_length_km', '?')} km")\n    print(f"   车道数: {sim_config.get('num_lanes', '?')}")\n    print(f"   总车辆: {sim_config.get('total_vehicles', '?')}")\n    print(f"📊 统计:")\n    print(f"   完成车辆: {sim_stats.get('total_vehicles', '?')}")\n    print(f"   异常事件: {sim_stats.get('total_anomalies', '?')}")\n    print(f"   ETC 报警: {sim_stats.get('etc_alerts_count', '?')}")\n    print(f"🚧 门架数: {len(sim_gates)} 个")\n`
                                },
                                {
                                    name: isEn ? 'Gate Transaction Chart' : '门架交易量图表',
                                    code: `\n# ===== 门架交易量统计图表 =====\nif sim_data is None:\n    print("⚠️ 请先选择仿真记录")\nelse:\n    transactions = sim_data.get("etc_detection", {}).get("transactions", [])\n    gate_counts = Counter(t["gate_id"] for t in transactions)\n    sorted_gates = sorted(gate_counts.items())\n    labels = [g[0] for g in sorted_gates]\n    values = [g[1] for g in sorted_gates]\n    print(f"📡 总交易数: {len(transactions)}")\n    for g, c in sorted_gates:\n        print(f"   {g}: {c} 笔")\n    print("[JSON_CHART] " + json.dumps({"title": "各门架交易量", "xAxis": labels, "series": values}))\n`
                                },
                                {
                                    name: isEn ? 'Anomaly Statistics' : '异常事件统计',
                                    code: `\n# ===== 异常事件统计 =====\nif sim_data is None:\n    print("⚠️ 请先选择仿真记录")\nelse:\n    logs = sim_data.get("anomaly_logs", [])\n    print(f"🚨 异常事件总数: {len(logs)}")\n    type_map = {1: "停车", 2: "缓行(短)", 3: "缓行(长)"}\n    type_counts = Counter(l.get("type", 0) for l in logs)\n    labels, values = [], []\n    for t, c in sorted(type_counts.items()):\n        name = type_map.get(t, f"类型{t}")\n        labels.append(name)\n        values.append(c)\n        print(f"   {name}: {c} 次")\n    if labels:\n        print("[JSON_CHART] " + json.dumps({"title": "异常类型分布", "xAxis": labels, "series": values}))\n`
                                }
                            ].map((s, idx) => (
                                <button key={idx} onClick={() => setScript(prev => prev + s.code)}
                                    className="w-full text-left px-2 py-1.5 rounded bg-[rgba(255,255,255,0.03)] border border-[var(--glass-border)] hover:bg-[rgba(255,255,255,0.08)] transition-colors text-[10px] text-[var(--accent-blue)]">
                                    + {s.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <hr className="border-[var(--glass-border)]" />

                    {/* 快捷键 */}
                    <div>
                        <h4 className="text-xs font-medium text-[var(--text-primary)] mb-1.5">⌨️ {isEn ? 'Shortcuts' : '快捷键'}</h4>
                        <div className="text-[10px] text-[var(--text-muted)] space-y-1">
                            <div className="flex justify-between"><span className="font-mono">Ctrl+S</span><span>{isEn ? 'Save script' : '保存脚本'}</span></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
