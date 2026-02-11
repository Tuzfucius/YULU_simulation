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

// 门架信息（展示用）
const ETC_GATES = Array.from({ length: 10 }, (_, i) => ({
    id: `G${String(i + 1).padStart(2, '0')}`,
    positionKm: (i + 1) * 2,
    segment: i + 1,
    description_zh: `第 ${i + 1} 号 ETC 门架（里程 ${(i + 1) * 2} km）`,
    description_en: `ETC Gate #${i + 1} at ${(i + 1) * 2} km`,
}));

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

    const refreshTree = useCallback(async () => {
        try {
            const res = await fetch('/api/files/scripts/tree');
            if (res.ok) { const d = await res.json(); setScriptTree(d.tree || []); setScriptsDir(d.dir || ''); }
        } catch { }
    }, []);

    useEffect(() => { refreshTree(); }, [refreshTree]);
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
            const res = await fetch('/api/files/scripts/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: script, timeout: 15 }) });
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
    }, [script, isEn]);

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
                    /* 门架信息列表 */
                    <div className="flex-1 overflow-y-auto scrollbar-thin">
                        <div className="px-3 py-2 border-b border-[var(--glass-border)]">
                            <p className="text-[10px] text-[var(--text-muted)]">{isEn ? 'ETC gate positions and IDs' : 'ETC 门架编号与位置信息'}</p>
                        </div>
                        {ETC_GATES.map(gate => (
                            <div key={gate.id} className="px-3 py-2.5 border-b border-[var(--glass-border)]/50 hover:bg-[rgba(255,255,255,0.03)]">
                                <div className="flex items-center gap-2">
                                    <span className="w-12 text-xs font-mono font-medium text-[var(--accent-blue)]">{gate.id}</span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-purple)]/10 text-[var(--accent-purple)]">
                                        {gate.positionKm} km
                                    </span>
                                    <span className="text-[10px] text-[var(--text-muted)]">Seg {gate.segment}</span>
                                </div>
                                <p className="text-[10px] text-[var(--text-muted)] mt-0.5 ml-14">
                                    {isEn ? gate.description_en : gate.description_zh}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ===== 中间：编辑器 + 输出 ===== */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="h-12 flex items-center justify-between px-4 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] shrink-0">
                    <div className="flex items-center gap-3">
                        <h2 className="text-sm font-medium text-[var(--text-primary)]">📊 {isEn ? 'Alert Dashboard' : '预警仪表盘'}</h2>
                        <span className="text-xs text-[var(--text-muted)]">—</span>
                        <span className="text-xs text-[var(--text-secondary)] font-mono">
                            {currentPath || (isEn ? 'Unsaved' : '未保存')}
                            {isModified && <span className="text-yellow-400 ml-1">●</span>}
                        </span>
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
                        ) : output.map((o, i) => (
                            <pre key={i} className={`whitespace-pre-wrap ${o.type === 'stderr' ? 'text-red-400' : 'text-[var(--text-secondary)]'}`}>{o.text}</pre>
                        ))}
                    </div>
                </div>
            </div>

            {/* ===== 右侧：API 文档 ===== */}
            <div className="w-72 flex flex-col border-l border-[var(--glass-border)] bg-[var(--glass-bg)] shrink-0 overflow-y-auto scrollbar-thin">
                <div className="px-4 py-3 border-b border-[var(--glass-border)]">
                    <h3 className="text-sm font-medium text-[var(--text-primary)]">📖 {isEn ? 'API Reference' : '接口文档'}</h3>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">
                        {isEn ? 'All available methods for your alert script' : '脚本中可直接使用的所有方法和变量'}
                    </p>
                </div>

                <div className="p-4 space-y-4">
                    {/* gate_data 变量 */}
                    <div>
                        <h4 className="text-xs font-medium text-[var(--accent-blue)] mb-1">gate_data</h4>
                        <p className="text-[10px] text-[var(--text-muted)] mb-2">
                            {isEn ? 'Pre-initialized ETCGateData instance. Provides access to all simulation output data in the output/ directory.' : '预初始化的 ETCGateData 实例。可以访问 output/ 目录下的所有仿真输出数据。'}
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

                    {/* 快捷键 */}
                    <div>
                        <h4 className="text-xs font-medium text-[var(--text-primary)] mb-1.5">⌨️ {isEn ? 'Shortcuts' : '快捷键'}</h4>
                        <div className="text-[10px] text-[var(--text-muted)] space-y-1">
                            <div className="flex justify-between"><span className="font-mono">Ctrl+S</span><span>{isEn ? 'Save script' : '保存脚本'}</span></div>
                            <div className="flex justify-between"><span className="font-mono">Ctrl+Enter</span><span>{isEn ? 'Run script (future)' : '运行脚本（计划）'}</span></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
