/**
 * 预警仪表盘 — 代码编辑器 + ETC 门架数据面板
 * 
 * 用户可通过 Monaco 代码编辑器编写 JS 脚本，
 * 读取 ETCGateData 类的门架数据来自定义预警逻辑。
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useI18nStore } from '../../stores/i18nStore';

// ETC 门架数据类型（展示给用户的文档接口）
interface ETCGateRecord {
    gateId: string;
    positionKm: number;
    timestamp: number;
    vehicleId: number;
    speed: number;
    lane: number;
    vehicleType: string;
}

// 模拟门架数据
function generateMockGateData(): ETCGateRecord[] {
    const data: ETCGateRecord[] = [];
    const now = Date.now();
    for (let g = 1; g <= 10; g++) {
        for (let i = 0; i < 20; i++) {
            data.push({
                gateId: `G${g}`,
                positionKm: g * 2,
                timestamp: now - (20 - i) * 3000 + Math.random() * 1000,
                vehicleId: 1000 + g * 100 + i,
                speed: 60 + Math.random() * 60,
                lane: Math.floor(Math.random() * 4),
                vehicleType: Math.random() > 0.7 ? 'TRUCK' : 'CAR',
            });
        }
    }
    return data;
}

const DEFAULT_SCRIPT = `/**
 * ETC 门架预警脚本
 * 
 * 可用变量：
 *   gateData: ETCGateRecord[] — 所有门架通行记录
 *   gates:    string[]        — 门架 ID 列表
 * 
 * 可用辅助函数：
 *   getGateRecords(gateId) → 获取指定门架的记录
 *   getAvgSpeed(gateId)    → 获取指定门架的平均速度
 *   getFlowRate(gateId)    → 获取指定门架的流量 (辆/min)
 *   alert(message)         → 输出预警信息到面板
 *   log(message)           → 输出普通日志
 * 
 * 编写示例：检测平均速度低于阈值时报警
 */

const SPEED_THRESHOLD = 60; // km/h
const FLOW_THRESHOLD = 5;   // vehicles/min

for (const gateId of gates) {
  const avgSpeed = getAvgSpeed(gateId);
  const flowRate = getFlowRate(gateId);
  
  if (avgSpeed < SPEED_THRESHOLD) {
    alert(\`⚠️ \${gateId} 平均速度 \${avgSpeed.toFixed(1)} km/h < 阈值 \${SPEED_THRESHOLD}\`);
  }
  
  if (flowRate > FLOW_THRESHOLD) {
    log(\`📊 \${gateId} 流量 \${flowRate.toFixed(1)} 辆/min\`);
  }
}

log("✅ 预警脚本执行完毕");
`;

export const DashboardPage: React.FC = () => {
    const { lang } = useI18nStore();
    const isEn = lang === 'en';

    const [script, setScript] = useState(DEFAULT_SCRIPT);
    const [output, setOutput] = useState<{ type: 'log' | 'alert' | 'error'; msg: string; time: string }[]>([]);
    const [gateData] = useState(generateMockGateData);
    const [isRunning, setIsRunning] = useState(false);
    const outputRef = useRef<HTMLDivElement>(null);

    // 门架统计
    const gateIds = [...new Set(gateData.map(r => r.gateId))].sort();

    const gateStats = gateIds.map(id => {
        const records = gateData.filter(r => r.gateId === id);
        const avgSpeed = records.reduce((s, r) => s + r.speed, 0) / records.length;
        return { id, count: records.length, avgSpeed };
    });

    // 自动滚动输出
    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [output]);

    // 执行脚本
    const runScript = useCallback(() => {
        setIsRunning(true);
        setOutput([]);

        const logs: typeof output = [];
        const now = () => new Date().toLocaleTimeString();

        // 构建沙箱辅助函数
        const getGateRecords = (gateId: string) => gateData.filter(r => r.gateId === gateId);
        const getAvgSpeed = (gateId: string) => {
            const records = getGateRecords(gateId);
            return records.length ? records.reduce((s, r) => s + r.speed, 0) / records.length : 0;
        };
        const getFlowRate = (gateId: string) => {
            const records = getGateRecords(gateId);
            if (records.length < 2) return 0;
            const minT = Math.min(...records.map(r => r.timestamp));
            const maxT = Math.max(...records.map(r => r.timestamp));
            const minutes = (maxT - minT) / 60000;
            return minutes > 0 ? records.length / minutes : 0;
        };
        const alertFn = (msg: string) => { logs.push({ type: 'alert', msg, time: now() }); };
        const logFn = (msg: string) => { logs.push({ type: 'log', msg, time: now() }); };

        try {
            const fn = new Function('gateData', 'gates', 'getGateRecords', 'getAvgSpeed', 'getFlowRate', 'alert', 'log', script);
            fn(gateData, gateIds, getGateRecords, getAvgSpeed, getFlowRate, alertFn, logFn);
            setOutput(logs);
        } catch (err: any) {
            setOutput([...logs, { type: 'error', msg: `❌ ${err.message}`, time: now() }]);
        }

        setIsRunning(false);
    }, [script, gateData, gateIds]);

    return (
        <div className="flex flex-col h-full bg-[var(--bg-base)]">
            {/* 顶部 */}
            <div className="h-14 flex items-center justify-between px-6 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md shrink-0">
                <h2 className="text-lg font-medium text-[var(--text-primary)]">
                    📊 {isEn ? 'Alert Dashboard — Script Editor' : '预警仪表盘 — 脚本编辑器'}
                </h2>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-[var(--text-muted)]">
                        {isEn ? `${gateData.length} records from ${gateIds.length} gates` : `${gateIds.length} 个门架 · ${gateData.length} 条记录`}
                    </span>
                    <button
                        onClick={runScript}
                        disabled={isRunning}
                        className="px-4 py-1.5 text-sm rounded-lg bg-[var(--accent-green,#34d399)] text-black font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                        ▶ {isEn ? 'Run Script' : '运行脚本'}
                    </button>
                </div>
            </div>

            {/* 主体 */}
            <div className="flex-1 flex overflow-hidden">
                {/* 左侧：代码编辑器 */}
                <div className="flex-1 flex flex-col border-r border-[var(--glass-border)]">
                    <div className="px-4 py-2 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] text-xs text-[var(--text-muted)]">
                        📝 {isEn ? 'Alert Script (JavaScript)' : '预警脚本 (JavaScript)'}
                    </div>
                    <div className="flex-1">
                        <Editor
                            language="javascript"
                            theme="vs-dark"
                            value={script}
                            onChange={(v) => setScript(v || '')}
                            options={{
                                fontSize: 13,
                                minimap: { enabled: false },
                                lineNumbers: 'on',
                                scrollBeyondLastLine: false,
                                wordWrap: 'on',
                                padding: { top: 10 },
                                tabSize: 2,
                            }}
                        />
                    </div>

                    {/* 输出面板 */}
                    <div className="h-48 border-t border-[var(--glass-border)] flex flex-col">
                        <div className="px-4 py-1.5 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] flex items-center justify-between">
                            <span className="text-xs text-[var(--text-muted)]">
                                💬 {isEn ? 'Output' : '输出'} ({output.length})
                            </span>
                            <button onClick={() => setOutput([])} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                                {isEn ? 'Clear' : '清空'}
                            </button>
                        </div>
                        <div ref={outputRef} className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-xs scrollbar-thin">
                            {output.length === 0 && (
                                <p className="text-[var(--text-muted)]">{isEn ? 'Run the script to see output...' : '运行脚本查看输出...'}</p>
                            )}
                            {output.map((o, i) => (
                                <div key={i} className={`flex gap-2 ${o.type === 'alert' ? 'text-yellow-400' : o.type === 'error' ? 'text-red-400' : 'text-[var(--text-secondary)]'}`}>
                                    <span className="text-[var(--text-muted)] shrink-0">[{o.time}]</span>
                                    <span>{o.msg}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 右侧：门架数据面板 */}
                <div className="w-80 flex flex-col shrink-0 bg-[var(--glass-bg)]">
                    <div className="px-4 py-2 border-b border-[var(--glass-border)] text-xs text-[var(--text-muted)]">
                        🚦 {isEn ? 'Gate Data Overview' : '门架数据概览'}
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
                        {gateStats.map(gate => (
                            <div key={gate.id} className="p-3 rounded-lg border border-[var(--glass-border)] bg-[rgba(0,0,0,0.15)]">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-medium text-[var(--text-primary)]">{gate.id}</span>
                                    <div className={`w-2.5 h-2.5 rounded-full ${gate.avgSpeed > 80 ? 'bg-green-400' : gate.avgSpeed > 60 ? 'bg-yellow-400' : 'bg-red-400'}`} />
                                </div>
                                <div className="text-xs text-[var(--text-muted)] space-y-0.5">
                                    <div>{isEn ? 'Records' : '记录数'}: {gate.count}</div>
                                    <div>{isEn ? 'Avg Speed' : '平均速度'}: {gate.avgSpeed.toFixed(1)} km/h</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* API 文档 */}
                    <div className="p-3 border-t border-[var(--glass-border)]">
                        <h4 className="text-xs font-medium text-[var(--text-primary)] mb-2">
                            📖 {isEn ? 'Available API' : '可用接口'}
                        </h4>
                        <div className="text-[10px] text-[var(--text-muted)] space-y-1 font-mono">
                            <div>gateData: ETCGateRecord[]</div>
                            <div>gates: string[]</div>
                            <div>getGateRecords(id) → Record[]</div>
                            <div>getAvgSpeed(id) → number</div>
                            <div>getFlowRate(id) → number</div>
                            <div>alert(msg) → void</div>
                            <div>log(msg) → void</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
