/**
 * 工作流编辑器状态管理
 */

import { create } from 'zustand';
import type { Node, Edge } from '@xyflow/react';
import type {
    WorkflowNodeData, NodeTypeConfig, RuleDefinition,
    PortDefinition, LogicType,
} from '../types/workflow';
import { PORT_TEMPLATES as PORTS } from '../types/workflow';

// ==================== 辅助：根据 category 获取默认端口 ====================

function getDefaultPorts(category: string, nodeType?: string): PortDefinition[] {
    if (category === 'source') return [...PORTS.sourceOnly];
    if (category === 'action') return [...PORTS.actionOnly];
    if (category === 'logic') {
        // NOT 和 THRESHOLD 是单输入
        if (nodeType === 'logic_not' || nodeType === 'logic_threshold') {
            return [...PORTS.singleIO];
        }
        return [...PORTS.dualInput];
    }
    // condition: 单输入 + 单输出
    return [...PORTS.singleIO];
}

// ==================== 可用节点类型 ====================

export const NODE_TYPE_CONFIGS: NodeTypeConfig[] = [
    // ────────── 数据源 ──────────
    { type: 'etc_data', label: 'ETC 门架数据', category: 'source', icon: '📡', color: '#60a5fa', description: '门架交易记录和统计', defaultParams: {} },
    { type: 'vehicle_data', label: '车辆状态数据', category: 'source', icon: '🚗', color: '#34d399', description: '车辆实时速度/位置', defaultParams: {} },
    { type: 'env_data', label: '环境数据', category: 'source', icon: '🌤️', color: '#fbbf24', description: '天气和环境状态', defaultParams: {} },
    { type: 'history_data', label: '历史数据', category: 'source', icon: '📂', color: '#818cf8', description: '查询历史仿真记录', defaultParams: { lookback_s: 300 } },
    { type: 'aggregation_data', label: '统计聚合', category: 'source', icon: '📊', color: '#c084fc', description: '对时间窗口内数据做聚合', defaultParams: { window_s: 60, method: 'mean' } },
    { type: 'gate_corr_data', label: '门架关联', category: 'source', icon: '🔗', color: '#22d3ee', description: '上下游门架关联数据', defaultParams: {} },
    { type: 'realtime_calc', label: '实时计算', category: 'source', icon: '⚡', color: '#fb923c', description: '滑动窗口实时指标计算', defaultParams: { window_s: 30, metric: 'moving_avg' } },

    // ────────── 条件 ──────────
    { type: 'speed_below_threshold', label: '速度低于阈值', category: 'condition', icon: '⚡', color: '#f97316', description: '平均速度低于阈值', defaultParams: { threshold_kmh: 40, min_samples: 3 } },
    { type: 'speed_std_high', label: '速度波动大', category: 'condition', icon: '📈', color: '#f97316', description: '速度标准差过高', defaultParams: { std_threshold_kmh: 15, min_samples: 5 } },
    { type: 'travel_time_outlier', label: '行程时间异常', category: 'condition', icon: '⏱️', color: '#f97316', description: '行程时间显著偏高', defaultParams: { z_score_threshold: 2.5, ratio_threshold: 1.5 } },
    { type: 'flow_imbalance', label: '流量不平衡', category: 'condition', icon: '⚖️', color: '#f97316', description: '上下游流量不平衡', defaultParams: { ratio_threshold: 0.5, time_window_s: 60 } },
    { type: 'consecutive_alerts', label: '连续异常', category: 'condition', icon: '🔁', color: '#f97316', description: '连续异常次数超限', defaultParams: { count_threshold: 3 } },
    { type: 'queue_length_exceeds', label: '排队超限', category: 'condition', icon: '🚦', color: '#f97316', description: '排队长度超限', defaultParams: { length_threshold_m: 500 } },
    { type: 'segment_speed_drop', label: '区间速度骤降', category: 'condition', icon: '📉', color: '#f97316', description: '区间平均速度骤降', defaultParams: { threshold_kmh: 30 } },
    { type: 'weather_condition', label: '天气条件', category: 'condition', icon: '🌧️', color: '#f97316', description: '天气条件匹配', defaultParams: { weather_types: ['rain', 'fog', 'snow'] } },
    { type: 'high_missed_read_rate', label: '漏读率过高', category: 'condition', icon: '❌', color: '#f97316', description: 'ETC 漏读率过高', defaultParams: { rate_threshold: 0.1 } },
    // 新增条件
    { type: 'speed_change_rate', label: '速度变化率', category: 'condition', icon: '📐', color: '#f97316', description: '速度梯度超阈值（加/减速异常）', defaultParams: { rate_threshold: 10, direction: 'decel' } },
    { type: 'occupancy_high', label: '占有率过高', category: 'condition', icon: '🅿️', color: '#f97316', description: '路段空间占有率超限', defaultParams: { threshold_pct: 80 } },
    { type: 'headway_anomaly', label: '车头时距异常', category: 'condition', icon: '↔️', color: '#f97316', description: '车头时距过短（追尾风险）', defaultParams: { min_headway_s: 1.5 } },
    { type: 'density_exceeds', label: '密度超限', category: 'condition', icon: '🔥', color: '#f97316', description: '交通密度超过阈值', defaultParams: { threshold_veh_km: 80 } },
    { type: 'custom_expression', label: '自定义表达式', category: 'condition', icon: '🧮', color: '#f97316', description: '用户输入 Python 表达式判断', defaultParams: { expression: 'avg_speed < 30' } },

    // ────────── 逻辑组合 ──────────
    { type: 'logic_and', label: 'AND', category: 'logic', icon: '&', color: '#a78bfa', description: '两个条件都满足', defaultParams: {} },
    { type: 'logic_or', label: 'OR', category: 'logic', icon: '|', color: '#a78bfa', description: '任一条件满足', defaultParams: {} },
    { type: 'logic_not', label: 'NOT', category: 'logic', icon: '!', color: '#a78bfa', description: '条件取反', defaultParams: {} },
    { type: 'logic_gt', label: 'A > B', category: 'logic', icon: '>', color: '#a78bfa', description: '左值大于右值', defaultParams: {} },
    { type: 'logic_lt', label: 'A < B', category: 'logic', icon: '<', color: '#a78bfa', description: '左值小于右值', defaultParams: {} },
    { type: 'logic_eq', label: 'A = B', category: 'logic', icon: '=', color: '#a78bfa', description: '左值等于右值', defaultParams: {} },
    { type: 'logic_threshold', label: '阈值判断', category: 'logic', icon: '⊕', color: '#a78bfa', description: '输入值与阈值比较', defaultParams: { threshold: 0, operator: '>' } },

    // ────────── 动作 ──────────
    { type: 'action_log', label: '记录日志', category: 'action', icon: '📝', color: '#ef4444', description: '记录到系统日志', defaultParams: { level: 'warning' } },
    { type: 'action_notify', label: '推送通知', category: 'action', icon: '🔔', color: '#ef4444', description: '推送到前端通知', defaultParams: {} },
    { type: 'action_speed_limit', label: '建议限速', category: 'action', icon: '🚸', color: '#ef4444', description: '建议限速', defaultParams: { limit_kmh: 60 } },
    { type: 'action_lane_control', label: '车道管控', category: 'action', icon: '🚧', color: '#ef4444', description: '车道管控建议', defaultParams: { action: 'divert' } },
];

// ==================== 逻辑节点 type -> LogicType 映射 ====================

const LOGIC_TYPE_MAP: Record<string, LogicType> = {
    logic_and: 'AND',
    logic_or: 'OR',
    logic_not: 'NOT',
    logic_gt: 'GT',
    logic_lt: 'LT',
    logic_eq: 'EQ',
    logic_threshold: 'THRESHOLD',
};

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

    /** 检查连接是否合法（同一 targetHandle 不能多次连接） */
    canConnect: (sourceId: string, targetId: string, sourceHandle: string | null, targetHandle: string | null) => boolean;

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
        const ports = nodeConfig.ports
            ? [...nodeConfig.ports]
            : getDefaultPorts(nodeConfig.category, nodeConfig.type);
        const logicType = LOGIC_TYPE_MAP[nodeConfig.type];

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
                logic: logicType,
                ports,
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

    canConnect: (sourceId, targetId, sourceHandle, targetHandle) => {
        const { edges } = get();
        // 不允许自连接
        if (sourceId === targetId) return false;
        // 不允许同一 targetHandle 被多次连接（每个输入端口只允许一条线）
        if (targetHandle) {
            const existing = edges.find(
                e => e.target === targetId && e.targetHandle === targetHandle
            );
            if (existing) return false;
        }
        // 不允许重复连接
        const duplicate = edges.find(
            e => e.source === sourceId && e.target === targetId
                && e.sourceHandle === sourceHandle && e.targetHandle === targetHandle
        );
        if (duplicate) return false;
        return true;
    },

    exportToRules: () => {
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
                // 支持 handleId 区分的入边
                const incomingEdges = edges.filter(e => e.target === logicNode.id);
                const outgoingEdges = edges.filter(e => e.source === logicNode.id);

                // 递归收集上游条件节点（跳过中间的逻辑节点链）
                const conditionNodes = incomingEdges
                    .map(e => nodes.find(n => n.id === e.source))
                    .filter((n): n is Node<WorkflowNodeData> =>
                        n !== undefined && (n.data.category === 'condition' || n.data.category === 'source')
                    );

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
                        logic: (logicNode.data.logic as RuleDefinition['logic']) || 'AND',
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
            const logicSubType = rule.logic === 'OR' ? 'logic_or' : 'logic_and';
            const logicPorts = getDefaultPorts('logic', logicSubType);
            newNodes.push({
                id: logicId,
                type: 'workflowNode',
                position: { x: baseX + 400, y: baseY + 60 },
                data: {
                    label: rule.logic,
                    category: 'logic',
                    subType: logicSubType,
                    icon: rule.logic === 'AND' ? '&' : '|',
                    color: '#a78bfa',
                    params: {},
                    logic: rule.logic as LogicType,
                    ports: logicPorts,
                },
            });

            // Condition nodes
            rule.conditions.forEach((cond, ci) => {
                const condConfig = NODE_TYPE_CONFIGS.find(c => c.type === cond.type);
                const condId = `cond_${++nodeIdCounter}`;
                const condPorts = getDefaultPorts('condition', cond.type);
                newNodes.push({
                    id: condId,
                    type: 'workflowNode',
                    position: { x: baseX, y: baseY + ci * 90 },
                    data: {
                        label: condConfig?.label || cond.type,
                        category: 'condition',
                        subType: cond.type,
                        icon: condConfig?.icon || '❓',
                        color: condConfig?.color || '#f97316',
                        params: cond.params,
                        gateId: cond.gate_id,
                        ports: condPorts,
                    },
                });

                // 连接到逻辑节点 — 交替分配到 input-a 和 input-b
                const targetHandle = ci % 2 === 0 ? 'input-a' : 'input-b';
                newEdges.push({
                    id: `edge_${condId}_${logicId}`,
                    source: condId,
                    target: logicId,
                    sourceHandle: 'output',
                    targetHandle: targetHandle,
                });
            });

            // Action nodes
            rule.actions.forEach((action, ai) => {
                const actionConfig = NODE_TYPE_CONFIGS.find(c => c.type === `action_${action.type}`);
                const actionId = `action_${++nodeIdCounter}`;
                const actionPorts = getDefaultPorts('action');
                newNodes.push({
                    id: actionId,
                    type: 'workflowNode',
                    position: { x: baseX + 800, y: baseY + ai * 90 },
                    data: {
                        label: actionConfig?.label || action.type,
                        category: 'action',
                        subType: `action_${action.type}`,
                        icon: actionConfig?.icon || '⚙️',
                        color: actionConfig?.color || '#ef4444',
                        params: action.params,
                        ports: actionPorts,
                    },
                });
                newEdges.push({
                    id: `edge_${logicId}_${actionId}`,
                    source: logicId,
                    target: actionId,
                    sourceHandle: 'output',
                    targetHandle: 'input',
                });
            });
        });

        set({ nodes: newNodes, edges: newEdges, isDirty: false });
    },

    clearAll: () => set({ nodes: [], edges: [], selectedNodeId: null, isDirty: false }),
}));
