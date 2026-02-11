/**
 * 工作流编辑器状态管理
 */

import { create } from 'zustand';
import type { Node, Edge } from '@xyflow/react';
import type { WorkflowNodeData, NodeTypeConfig, RuleDefinition } from '../types/workflow';

// ==================== 可用节点类型 ====================

export const NODE_TYPE_CONFIGS: NodeTypeConfig[] = [
    // 数据源
    { type: 'etc_data', label: 'ETC 门架数据', category: 'source', icon: '📡', color: '#60a5fa', description: '门架交易记录和统计', defaultParams: {} },
    { type: 'vehicle_data', label: '车辆状态数据', category: 'source', icon: '🚗', color: '#34d399', description: '车辆实时速度/位置', defaultParams: {} },
    { type: 'env_data', label: '环境数据', category: 'source', icon: '🌤️', color: '#fbbf24', description: '天气和环境状态', defaultParams: {} },

    // 条件
    { type: 'speed_below_threshold', label: '速度低于阈值', category: 'condition', icon: '⚡', color: '#f97316', description: '平均速度低于阈值', defaultParams: { threshold_kmh: 40, min_samples: 3 } },
    { type: 'speed_std_high', label: '速度波动大', category: 'condition', icon: '📈', color: '#f97316', description: '速度标准差过高', defaultParams: { std_threshold_kmh: 15, min_samples: 5 } },
    { type: 'travel_time_outlier', label: '行程时间异常', category: 'condition', icon: '⏱️', color: '#f97316', description: '行程时间显著偏高', defaultParams: { z_score_threshold: 2.5, ratio_threshold: 1.5 } },
    { type: 'flow_imbalance', label: '流量不平衡', category: 'condition', icon: '⚖️', color: '#f97316', description: '上下游流量不平衡', defaultParams: { ratio_threshold: 0.5, time_window_s: 60 } },
    { type: 'consecutive_alerts', label: '连续异常', category: 'condition', icon: '🔁', color: '#f97316', description: '连续异常次数超限', defaultParams: { count_threshold: 3 } },
    { type: 'queue_length_exceeds', label: '排队超限', category: 'condition', icon: '🚦', color: '#f97316', description: '排队长度超限', defaultParams: { length_threshold_m: 500 } },
    { type: 'segment_speed_drop', label: '区间速度骤降', category: 'condition', icon: '📉', color: '#f97316', description: '区间平均速度骤降', defaultParams: { threshold_kmh: 30 } },
    { type: 'weather_condition', label: '天气条件', category: 'condition', icon: '🌧️', color: '#f97316', description: '天气条件匹配', defaultParams: { weather_types: ['rain', 'fog', 'snow'] } },
    { type: 'high_missed_read_rate', label: '漏读率过高', category: 'condition', icon: '❌', color: '#f97316', description: 'ETC 漏读率过高', defaultParams: { rate_threshold: 0.1 } },

    // 逻辑组合
    { type: 'logic_and', label: 'AND', category: 'logic', icon: '&', color: '#a78bfa', description: '所有条件都满足', defaultParams: {} },
    { type: 'logic_or', label: 'OR', category: 'logic', icon: '|', color: '#a78bfa', description: '任一条件满足', defaultParams: {} },

    // 动作
    { type: 'action_log', label: '记录日志', category: 'action', icon: '📝', color: '#ef4444', description: '记录到系统日志', defaultParams: { level: 'warning' } },
    { type: 'action_notify', label: '推送通知', category: 'action', icon: '🔔', color: '#ef4444', description: '推送到前端通知', defaultParams: {} },
    { type: 'action_speed_limit', label: '建议限速', category: 'action', icon: '🚸', color: '#ef4444', description: '建议限速', defaultParams: { limit_kmh: 60 } },
    { type: 'action_lane_control', label: '车道管控', category: 'action', icon: '🚧', color: '#ef4444', description: '车道管控建议', defaultParams: { action: 'divert' } },
];

// ==================== Store ====================

interface WorkflowState {
    nodes: Node<WorkflowNodeData>[];
    edges: Edge[];
    selectedNodeId: string | null;
    workflowName: string;
    workflowDescription: string;
    isDirty: boolean;

    // Actions
    setNodes: (nodes: Node<WorkflowNodeData>[]) => void;
    setEdges: (edges: Edge[]) => void;
    addNode: (nodeConfig: NodeTypeConfig, position: { x: number; y: number }) => void;
    removeNode: (nodeId: string) => void;
    updateNodeData: (nodeId: string, data: Partial<WorkflowNodeData>) => void;
    selectNode: (nodeId: string | null) => void;
    setWorkflowMeta: (name: string, description: string) => void;

    // Serialization
    exportToRules: () => RuleDefinition[];
    loadRules: (rules: RuleDefinition[]) => void;
    clearAll: () => void;
}

let nodeIdCounter = 0;

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
    nodes: [],
    edges: [],
    selectedNodeId: null,
    workflowName: '新工作流',
    workflowDescription: '',
    isDirty: false,

    setNodes: (nodes) => set({ nodes, isDirty: true }),
    setEdges: (edges) => set({ edges, isDirty: true }),

    addNode: (nodeConfig, position) => {
        const id = `node_${++nodeIdCounter}_${Date.now()}`;
        const newNode: Node<WorkflowNodeData> = {
            id,
            type: 'workflowNode',
            position,
            data: {
                label: nodeConfig.label,
                category: nodeConfig.category,
                subType: nodeConfig.type,
                icon: nodeConfig.icon,
                color: nodeConfig.color,
                params: { ...(nodeConfig.defaultParams || {}) },
                gateId: '*',
                severity: nodeConfig.category === 'action' ? 'medium' : undefined,
                logic: nodeConfig.type === 'logic_and' ? 'AND' : nodeConfig.type === 'logic_or' ? 'OR' : undefined,
            },
        };
        set((state) => ({ nodes: [...state.nodes, newNode], isDirty: true }));
    },

    removeNode: (nodeId) => {
        set((state) => ({
            nodes: state.nodes.filter(n => n.id !== nodeId),
            edges: state.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
            selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
            isDirty: true,
        }));
    },

    updateNodeData: (nodeId, data) => {
        set((state) => ({
            nodes: state.nodes.map(n =>
                n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
            ),
            isDirty: true,
        }));
    },

    selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

    setWorkflowMeta: (name, description) => set({ workflowName: name, workflowDescription: description, isDirty: true }),

    exportToRules: () => {
        // Simple export: group connected subgraphs into rules
        const { nodes, edges } = get();
        const rules: RuleDefinition[] = [];

        // Find logic nodes as rule centers
        const logicNodes = nodes.filter(n => n.data.category === 'logic');

        if (logicNodes.length === 0) {
            // No logic nodes: treat all conditions as a single AND rule
            const conditions = nodes.filter(n => n.data.category === 'condition');
            const actions = nodes.filter(n => n.data.category === 'action');

            if (conditions.length > 0) {
                rules.push({
                    name: get().workflowName || '自定义规则',
                    description: get().workflowDescription || '',
                    conditions: conditions.map(n => ({
                        type: n.data.subType,
                        params: n.data.params,
                        gate_id: n.data.gateId || '*',
                    })),
                    logic: 'AND',
                    severity: 'medium',
                    actions: actions.map(n => ({
                        type: n.data.subType.replace('action_', ''),
                        params: n.data.params,
                    })),
                    cooldown_s: 60,
                    enabled: true,
                });
            }
        } else {
            // Each logic node = one rule
            for (const logicNode of logicNodes) {
                const incomingEdges = edges.filter(e => e.target === logicNode.id);
                const outgoingEdges = edges.filter(e => e.source === logicNode.id);

                const conditionNodes = incomingEdges
                    .map(e => nodes.find(n => n.id === e.source))
                    .filter((n): n is Node<WorkflowNodeData> => n !== undefined && n.data.category === 'condition');

                const actionNodes = outgoingEdges
                    .map(e => nodes.find(n => n.id === e.target))
                    .filter((n): n is Node<WorkflowNodeData> => n !== undefined && n.data.category === 'action');

                if (conditionNodes.length > 0) {
                    rules.push({
                        name: `${logicNode.data.label}_${logicNode.id.slice(-4)}`,
                        description: '',
                        conditions: conditionNodes.map(n => ({
                            type: n.data.subType,
                            params: n.data.params,
                            gate_id: n.data.gateId || '*',
                        })),
                        logic: logicNode.data.logic || 'AND',
                        severity: 'medium',
                        actions: actionNodes.map(n => ({
                            type: n.data.subType.replace('action_', ''),
                            params: n.data.params,
                        })),
                        cooldown_s: 60,
                        enabled: true,
                    });
                }
            }
        }

        return rules;
    },

    loadRules: (rules) => {
        const newNodes: Node<WorkflowNodeData>[] = [];
        const newEdges: Edge[] = [];

        rules.forEach((rule, ruleIdx) => {
            const baseX = 100;
            const baseY = ruleIdx * 300 + 50;

            // Logic node
            const logicId = `logic_${++nodeIdCounter}`;
            newNodes.push({
                id: logicId,
                type: 'workflowNode',
                position: { x: baseX + 350, y: baseY + 60 },
                data: {
                    label: rule.logic,
                    category: 'logic',
                    subType: rule.logic === 'AND' ? 'logic_and' : 'logic_or',
                    icon: rule.logic === 'AND' ? '&' : '|',
                    color: '#a78bfa',
                    params: {},
                    logic: rule.logic,
                },
            });

            // Condition nodes
            rule.conditions.forEach((cond, ci) => {
                const condConfig = NODE_TYPE_CONFIGS.find(c => c.type === cond.type);
                const condId = `cond_${++nodeIdCounter}`;
                newNodes.push({
                    id: condId,
                    type: 'workflowNode',
                    position: { x: baseX, y: baseY + ci * 80 },
                    data: {
                        label: condConfig?.label || cond.type,
                        category: 'condition',
                        subType: cond.type,
                        icon: condConfig?.icon || '❓',
                        color: condConfig?.color || '#f97316',
                        params: cond.params,
                        gateId: cond.gate_id,
                    },
                });
                newEdges.push({
                    id: `edge_${condId}_${logicId}`,
                    source: condId,
                    target: logicId,
                });
            });

            // Action nodes
            rule.actions.forEach((action, ai) => {
                const actionConfig = NODE_TYPE_CONFIGS.find(c => c.type === `action_${action.type}`);
                const actionId = `action_${++nodeIdCounter}`;
                newNodes.push({
                    id: actionId,
                    type: 'workflowNode',
                    position: { x: baseX + 700, y: baseY + ai * 80 },
                    data: {
                        label: actionConfig?.label || action.type,
                        category: 'action',
                        subType: `action_${action.type}`,
                        icon: actionConfig?.icon || '⚙️',
                        color: actionConfig?.color || '#ef4444',
                        params: action.params,
                    },
                });
                newEdges.push({
                    id: `edge_${logicId}_${actionId}`,
                    source: logicId,
                    target: actionId,
                });
            });
        });

        set({ nodes: newNodes, edges: newEdges, isDirty: false });
    },

    clearAll: () => set({ nodes: [], edges: [], selectedNodeId: null, isDirty: false }),
}));
