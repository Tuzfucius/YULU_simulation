/**
 * ETC 代码编辑器组件
 * 使用 Monaco Editor，支持 Python 语法和 ETC 数据分析
 */

import React, { useState, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useSimStore } from '../stores/simStore';
import { useTheme } from '../utils/useTheme';

const EXAMPLE_CODE = `# ETC 车流特征分析示例
def analyze_traffic_patterns(etc_data):
    """
    分析 ETC 门架数据，识别异常模式
    
    参数:
        etc_data: {
            'gate_stats': {...},      # 各门架统计
            'transactions': [...],     # 交易记录列表
            'noise_stats': {...}       # 噪声统计
        }
    
    返回:
        alerts: 异常警报列表
    """
    alerts = []
    
    # 获取门架统计数据
    gate_stats = etc_data.get('gate_stats', {})
    
    # 1. 检测流量突降（可能事故）
    for gate_id, stats in gate_stats.items():
        flow_per_min = stats.get('total_transactions', 0) / 60  # 粗略估算
        if flow_per_min < 5:  # 阈值可调
            alerts.append({
                'type': 'LOW_FLOW',
                'gate': gate_id,
                'severity': 'high',
                'message': f'{gate_id} 流量异常低: {flow_per_min:.1f} veh/min'
            })
    
    # 2. 检测速度骤降区域
    for gate_id, stats in gate_stats.items():
        avg_speed = stats.get('avg_speed', 0)
        if avg_speed < 40:  # km/h
            alerts.append({
                'type': 'SLOW_SPEED',
                'gate': gate_id,
                'severity': 'medium',
                'message': f'{gate_id} 平均速度过低: {avg_speed:.1f} km/h'
            })
    
    # 3. 上下游流量不匹配（检测拥堵传播）
    gate_ids = sorted(gate_stats.keys())
    for i in range(len(gate_ids) - 1):
        upstream = gate_stats[gate_ids[i]].get('total_transactions', 0)
        downstream = gate_stats[gate_ids[i+1]].get('total_transactions', 0)
        ratio = downstream / upstream if upstream > 0 else 0
        
        if ratio < 0.7:  # 流出/流入 < 70%
            alerts.append({
                'type': 'FLOW_IMBALANCE',
                'gate': f'{gate_ids[i]} → {gate_ids[i+1]}',
                'severity': 'high',
                'message': f'上下游流量不匹配: {ratio:.1%}'
            })
    
    # 4. 检测噪声异常（硬件故障）
    noise_stats = etc_data.get('noise_statistics', {})
    missed_rate = noise_stats.get('missed_read_rate_actual', 0)
    if missed_rate > 0.05:  # 漏读率超过5%
        alerts.append({
            'type': 'HARDWARE_FAULT',
            'gate': 'SYSTEM',
            'severity': 'critical',
            'message': f'漏读率异常高: {missed_rate:.1%}，可能硬件故障'
        })
    
    return alerts


# 执行分析
print("🚀 开始分析 ETC 数据...")
results = analyze_traffic_patterns(etc_data)
print(f"✅ 发现 {len(results)} 个异常")
for idx, alert in enumerate(results, 1):
    severity_icon = {'critical': '🔴', 'high': '🟠', 'medium': '🟡'}.get(alert['severity'], '⚪')
    print(f"{idx}. {severity_icon} [{alert['type']}] {alert['message']}")
`;

interface Alert {
    type: string;
    gate: string;
    severity: string;
    message: string;
}

export const ETCCodeEditor: React.FC = () => {
    const { simulationData } = useSimStore();
    const { theme } = useTheme();
    const [code, setCode] = useState(EXAMPLE_CODE);
    const [output, setOutput] = useState('');
    const [isRunning, setIsRunning] = useState(false);
    const editorRef = useRef<any>(null);

    const handleEditorDidMount = (editor: any) => {
        editorRef.current = editor;
    };

    const runCode = () => {
        if (!simulationData?.etc_detection) {
            setOutput('❌ 错误：未找到仿真数据，请先运行仿真');
            return;
        }

        setIsRunning(true);
        setOutput('🚀 正在执行代码...\n');

        try {
            // 准备 ETC 数据
            const etcData = {
                gate_stats: simulationData.etc_detection.gate_stats || {},
                transactions: [], // 实际数据量太大，这里简化
                noise_statistics: simulationData.etc_detection.noise_statistics || {}
            };

            // 模拟 Python 执行（实际需要后端支持）
            // 这里用 JavaScript 重新实现示例算法
            const alerts: Alert[] = [];

            // 1. 流量检测
            Object.entries(etcData.gate_stats).forEach(([gateId, stats]: [string, any]) => {
                const flowPerMin = stats.total_transactions / 60;
                if (flowPerMin < 5) {
                    alerts.push({
                        type: 'LOW_FLOW',
                        gate: gateId,
                        severity: 'high',
                        message: `${gateId} 流量异常低: ${flowPerMin.toFixed(1)} veh/min`
                    });
                }
            });

            // 2. 速度检测
            Object.entries(etcData.gate_stats).forEach(([gateId, stats]: [string, any]) => {
                if (stats.avg_speed < 40) {
                    alerts.push({
                        type: 'SLOW_SPEED',
                        gate: gateId,
                        severity: 'medium',
                        message: `${gateId} 平均速度过低: ${stats.avg_speed.toFixed(1)} km/h`
                    });
                }
            });

            // 3. 上下游流量
            const gateIds = Object.keys(etcData.gate_stats).sort();
            for (let i = 0; i < gateIds.length - 1; i++) {
                const upstream = etcData.gate_stats[gateIds[i]].total_transactions;
                const downstream = etcData.gate_stats[gateIds[i + 1]].total_transactions;
                const ratio = upstream > 0 ? downstream / upstream : 0;

                if (ratio < 0.7) {
                    alerts.push({
                        type: 'FLOW_IMBALANCE',
                        gate: `${gateIds[i]} → ${gateIds[i + 1]}`,
                        severity: 'high',
                        message: `上下游流量不匹配: ${(ratio * 100).toFixed(1)}%`
                    });
                }
            }

            // 4. 噪声检测
            const missedRate = etcData.noise_statistics.missed_read_rate_actual || 0;
            if (missedRate > 0.05) {
                alerts.push({
                    type: 'HARDWARE_FAULT',
                    gate: 'SYSTEM',
                    severity: 'critical',
                    message: `漏读率异常高: ${(missedRate * 100).toFixed(1)}%，可能硬件故障`
                });
            }

            // 格式化输出
            let outputText = '🚀 开始分析 ETC 数据...\n';
            outputText += `✅ 发现 ${alerts.length} 个异常\n\n`;
            alerts.forEach((alert, idx) => {
                const icon = { critical: '🔴', high: '🟠', medium: '🟡' }[alert.severity] || '⚪';
                outputText += `${idx + 1}. ${icon} [${alert.type}] ${alert.message}\n`;
            });

            setOutput(outputText);
        } catch (error: any) {
            setOutput(`❌ 执行错误：${error.message}`);
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* 标题栏 */}
            <div className="flex items-center justify-between p-3 border-b border-[var(--glass-border)]">
                <h3 className="text-sm font-medium text-[var(--text-secondary)]">💻 ETC 代码编辑器</h3>
                <button
                    onClick={runCode}
                    disabled={isRunning}
                    className="px-3 py-1 text-xs rounded bg-[var(--accent-green)] text-black font-medium hover:opacity-80 disabled:opacity-50 transition-opacity"
                >
                    {isRunning ? '⏳ 运行中...' : '▶️ 运行分析'}
                </button>
            </div>

            {/* 编辑器 */}
            <div className="flex-1 overflow-hidden">
                <Editor
                    height="100%"
                    defaultLanguage="python"
                    theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
                    value={code}
                    onChange={value => setCode(value || '')}
                    onMount={handleEditorDidMount}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 12,
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                    }}
                />
            </div>

            {/* 输出区 */}
            {output && (
                <div className="border-t border-[var(--glass-border)] p-3 max-h-40 overflow-y-auto bg-[var(--glass-bg)]">
                    <pre className="text-xs font-mono whitespace-pre-wrap text-[var(--text-primary)]">
                        {output}
                    </pre>
                </div>
            )}
        </div>
    );
};
