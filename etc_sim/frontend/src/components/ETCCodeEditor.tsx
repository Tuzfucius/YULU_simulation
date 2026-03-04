/**
 * ETC 代码编辑器
 *
 * 支持 Python 代码编辑和在 conda 虚拟环境中执行。
 * 使用 Monaco Editor 提供语法高亮，调用后端 /api/code/execute 接口。
 */

import { useState, useCallback, useEffect } from 'react';
import Editor from '@monaco-editor/react';

import { API } from '../config/api';

const API_BASE = API.CODE;

const DEFAULT_CODE = `"""
ETC 预警自定义分析脚本

可用变量：
  alert_data: dict  —— 预警数据包 (如果有注入)
    - session_id: 仿真会话 ID
    - alerts: 预警记录列表
    - snapshot: 仿真快照
    - ground_truths: 真值事件

你可以使用标准 Python 库来分析数据。
"""

# 如果存在注入的预警数据包
try:
    if alert_data:
        print(f"📦 数据包 session: {alert_data.get('session_id', 'N/A')}")
        alerts = alert_data.get('alerts', [])
        print(f"📊 共 {len(alerts)} 条预警记录")
        for i, a in enumerate(alerts[:5]):
            print(f"  [{i+1}] {a.get('rule_name', '?')} - {a.get('severity', '?')}")
    else:
        print("⚠️ 没有注入预警数据包")
except NameError:
    print("⚠️ 未注入预警数据包，使用示例数据")
    print()

# 基本数据分析示例
import random
print("\\n📈 正在生成示例分析 ...")
speeds = [random.gauss(80, 15) for _ in range(100)]
avg_speed = sum(speeds) / len(speeds)
print(f"  平均速度: {avg_speed:.1f} km/h")
print(f"  最低速度: {min(speeds):.1f} km/h")
print(f"  速度 < 40 km/h 的比例: {sum(1 for s in speeds if s < 40) / len(speeds) * 100:.1f}%")
print("\\n✅ 分析完成")
`;

interface EnvironmentInfo {
    name: string;
    python_version?: string;
}

export function ETCCodeEditor() {
    const [code, setCode] = useState(DEFAULT_CODE);
    const [output, setOutput] = useState<string>('');
    const [isRunning, setIsRunning] = useState(false);
    const [executionTime, setExecutionTime] = useState<number | null>(null);
    const [environments, setEnvironments] = useState<EnvironmentInfo[]>([]);
    const [selectedEnv, setSelectedEnv] = useState('base');
    const [showEnvManager, setShowEnvManager] = useState(false);

    // 加载可用环境列表
    const loadEnvironments = useCallback(async () => {
        try {
            const resp = await fetch(`${API_BASE}/environments`);
            if (resp.ok) {
                const data = await resp.json();
                setEnvironments(data);
            }
        } catch {
            // 后端不可用时使用默认
            setEnvironments([{ name: 'base' }]);
        }
    }, []);

    useEffect(() => {
        loadEnvironments();
    }, [loadEnvironments]);

    // 运行代码
    const runCode = async () => {
        setIsRunning(true);
        setOutput('⏳ 正在执行...\n');
        setExecutionTime(null);

        try {
            const resp = await fetch(`${API_BASE}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code,
                    environment: selectedEnv,
                    timeout: 30,
                }),
            });

            const data = await resp.json();

            if (data.success) {
                setOutput(data.output || '(无输出)');
            } else {
                setOutput(
                    `❌ 执行失败:\n${data.error || '未知错误'}\n\n` +
                    (data.output ? `--- 输出 ---\n${data.output}` : '')
                );
            }
            setExecutionTime(data.execution_time || null);
        } catch (err) {
            setOutput(`❌ 网络错误: ${err}\n\n提示: 请确认后端正在运行 (http://localhost:8000)`);
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[var(--bg-base)]">
            {/* 工具栏 */}
            <div className="h-12 flex items-center justify-between px-4 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md shrink-0">
                <div className="flex items-center gap-3">
                    <span className="text-lg">💻</span>
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                        代码编辑器
                    </span>
                    {/* 环境选择 */}
                    <select
                        value={selectedEnv}
                        onChange={e => setSelectedEnv(e.target.value)}
                        className="text-xs px-2 py-1 rounded-md bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] outline-none"
                    >
                        {environments.map(env => (
                            <option key={env.name} value={env.name}>
                                🐍 {env.name}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={() => setShowEnvManager(!showEnvManager)}
                        className="text-[11px] px-2 py-1 rounded-md text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                        title="管理虚拟环境"
                    >
                        ⚙️ 环境管理
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    {executionTime !== null && (
                        <span className="text-[10px] text-[var(--text-muted)]">
                            ⏱ {executionTime.toFixed(2)}s
                        </span>
                    )}
                    <button
                        onClick={runCode}
                        disabled={isRunning}
                        className="text-sm px-4 py-1.5 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors disabled:opacity-50 font-medium"
                    >
                        {isRunning ? '⏳ 执行中...' : '▶ 运行'}
                    </button>
                </div>
            </div>

            {/* 环境管理面板 */}
            {showEnvManager && <EnvironmentManagerPanel
                onClose={() => setShowEnvManager(false)}
                onRefresh={loadEnvironments}
            />}

            {/* 主体 */}
            <div className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>
                {/* 编辑器 */}
                <div className="flex-1 border-r border-[var(--glass-border)]">
                    <Editor
                        height="100%"
                        defaultLanguage="python"
                        value={code}
                        onChange={(value) => setCode(value || '')}
                        theme="vs-dark"
                        options={{
                            fontSize: 13,
                            minimap: { enabled: false },
                            padding: { top: 12 },
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            tabSize: 4,
                            wordWrap: 'on',
                        }}
                    />
                </div>

                {/* 输出面板 */}
                <div className="w-[40%] flex flex-col bg-[rgba(0,0,0,0.2)]">
                    <div className="px-3 py-2 border-b border-[var(--glass-border)] text-xs text-[var(--text-secondary)] font-medium">
                        📟 输出
                    </div>
                    <pre
                        className="flex-1 p-3 overflow-auto text-xs text-[var(--text-primary)] font-mono leading-relaxed whitespace-pre-wrap scrollbar-thin"
                        style={{ margin: 0 }}
                    >
                        {output || '点击 ▶ 运行 按钮执行代码'}
                    </pre>
                </div>
            </div>
        </div>
    );
}


/**
 * 虚拟环境管理面板
 */
function EnvironmentManagerPanel({
    onClose,
    onRefresh,
}: {
    onClose: () => void;
    onRefresh: () => void;
}) {
    const [newEnvName, setNewEnvName] = useState('');
    const [newPythonVer, setNewPythonVer] = useState('3.10');
    const [packages, setPackages] = useState('');
    const [status, setStatus] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const createEnv = async () => {
        if (!newEnvName.trim()) return;
        setIsCreating(true);
        setStatus('正在创建环境...');

        try {
            const resp = await fetch(`${API_BASE}/environments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newEnvName.trim(),
                    python_version: newPythonVer,
                    packages: packages.split(',').map(s => s.trim()).filter(Boolean),
                }),
            });
            const data = await resp.json();
            setStatus(data.message || '创建完成');
            onRefresh();
            setNewEnvName('');
            setPackages('');
        } catch (err) {
            setStatus(`创建失败: ${err}`);
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="p-4 border-b border-[var(--glass-border)] bg-[rgba(30,30,50,0.5)] backdrop-blur-md space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[var(--text-primary)]">🛠️ 虚拟环境管理</h4>
                <button onClick={onClose} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕ 关闭</button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
                <input
                    type="text"
                    value={newEnvName}
                    onChange={e => setNewEnvName(e.target.value)}
                    placeholder="环境名称"
                    className="text-xs px-2.5 py-1.5 rounded-md bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] outline-none w-32"
                />
                <select
                    value={newPythonVer}
                    onChange={e => setNewPythonVer(e.target.value)}
                    className="text-xs px-2 py-1.5 rounded-md bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] outline-none"
                >
                    <option value="3.9">Python 3.9</option>
                    <option value="3.10">Python 3.10</option>
                    <option value="3.11">Python 3.11</option>
                    <option value="3.12">Python 3.12</option>
                </select>
                <input
                    type="text"
                    value={packages}
                    onChange={e => setPackages(e.target.value)}
                    placeholder="附带安装的包（逗号分隔）"
                    className="text-xs px-2.5 py-1.5 rounded-md bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] outline-none flex-1 min-w-[120px]"
                />
                <button
                    onClick={createEnv}
                    disabled={isCreating || !newEnvName.trim()}
                    className="text-xs px-3 py-1.5 rounded-md bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/25 transition-colors disabled:opacity-40"
                >
                    {isCreating ? '创建中...' : '创建环境'}
                </button>
            </div>
            {status && (
                <p className="text-[11px] text-[var(--text-muted)]">{status}</p>
            )}
        </div>
    );
}
