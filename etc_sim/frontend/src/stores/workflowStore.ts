/**
 * 工作流编辑器状态管理
 */

import { create } from 'zustand';
import type { Node, Edge } from '@xyflow/react';
import type {
    WorkflowNodeData, NodeTypeConfig, RuleDefinition, ConditionParams,
    PortDefinition, LogicType,
} from '../types/workflow';
import { PORT_TEMPLATES as PORTS } from '../types/workflow';

// ==================== 常量 ====================
const STORAGE_KEY = 'yulu_workflow_draft';
const MAX_HISTORY = 50;
const AUTOSAVE_DELAY_MS = 2000;

/** 深拷贝辅助 */
function deepClone<T>(obj: T): T {
    if (typeof structuredClone === 'function') {
        return structuredClone(obj);
    }
    return JSON.parse(JSON.stringify(obj));
}

/** 历史快照结构 */
interface HistorySnapshot {
    nodes: Node<WorkflowNodeData>[];
    edges: Edge[];
}

// 自动保存定时器
let _autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let _deferredHistoryTimer: ReturnType<typeof setTimeout> | null = null;

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
    {
        type: 'etc_data', label: 'ETC 门架数据', category: 'source', icon: '📡', color: '#60a5fa',
        description: '指定门架的交易量/速度/行程时间统计',
        defaultParams: { scope: 'single', gate_id: 'G04', gate_from: 'G02', gate_to: 'G08', metric: 'avg_speed' }
    },
    {
        type: 'vehicle_data', label: '车辆状态数据', category: 'source', icon: '🚗', color: '#34d399',
        description: '指定范围内车辆的实时速度/位置/车道',
        defaultParams: { scope: 'segment', segment_id: 0, center_km: 5, radius_km: 1, metric: 'speed' }
    },
    {
        type: 'env_data', label: '环境数据', category: 'source', icon: '🌤️', color: '#fbbf24',
        description: '天气、噪声等环境状态',
        defaultParams: { metric: 'weather_type' }
    },
    {
        type: 'history_data', label: '历史预警', category: 'source', icon: '📂', color: '#818cf8',
        description: '查询最近 N 秒内的历史预警事件',
        defaultParams: { lookback_s: 300, severity_filter: 'all' }
    },
    {
        type: 'aggregation_data', label: '统计聚合', category: 'source', icon: '📊', color: '#c084fc',
        description: '在时间窗口内对指标做聚合计算',
        defaultParams: { scope: 'all', gate_id: 'G04', source_metric: 'avg_speed', window_s: 60, method: 'mean' }
    },
    {
        type: 'gate_corr_data', label: '门架关联', category: 'source', icon: '🔗', color: '#22d3ee',
        description: '上下游门架的流量/速度差异',
        defaultParams: { upstream_gate: 'G04', downstream_gate: 'G06', metric: 'flow_diff' }
    },
    {
        type: 'realtime_calc', label: '实时计算', category: 'source', icon: '⚡', color: '#fb923c',
        description: '滑动窗口实时指标计算',
        defaultParams: { scope: 'all', gate_id: 'G04', target: 'avg_speed', window_s: 30, metric: 'moving_avg' }
    },

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
    { type: 'custom_expression', label: '自定义表达式', category: 'condition', icon: '🧮', color: '#f97316', description: '用户简单单行表达式判断', defaultParams: { expression: 'avg_speed < 30' } },
    { type: 'custom_script', label: '自定义算法 (Python)', category: 'condition', icon: '💻', color: '#10b981', description: '支持复杂 Python 代码执行的类 CanvasMind 节点', defaultParams: { script: "def predict(context):\n    # Return pre-warning prob\n    return 0.8\n" } },

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

    // 撤销/重做
    history: HistorySnapshot[];
    historyIndex: number;
    canUndo: boolean;
    canRedo: boolean;

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

    // 撤销/重做
    undo: () => void;
    redo: () => void;
    /** 内部: 推送当前状态到历史栈 */
    _pushHistory: () => void;

    // 本地持久化
    saveToLocal: () => void;
    loadFromLocal: () => boolean;

    // Serialization
    exportToRules: () => RuleDefinition[];
    loadRules: (rules: RuleDefinition[]) => void;
    clearAll: () => void;
}

let nodeIdCounter = 0;

/** 触发自动保存到 localStorage（debounce） */
function scheduleAutosave(store: WorkflowState) {
    if (_autosaveTimer) clearTimeout(_autosaveTimer);
    _autosaveTimer = setTimeout(() => {
        _autosaveTimer = null;
        store.saveToLocal();
    }, AUTOSAVE_DELAY_MS);
}

function clearDeferredWorkflowTimers() {
    if (_deferredHistoryTimer) {
        clearTimeout(_deferredHistoryTimer);
        _deferredHistoryTimer = null;
    }
    if (_autosaveTimer) {
        clearTimeout(_autosaveTimer);
        _autosaveTimer = null;
    }
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
    nodes: [],
    edges: [],
    selectedNodeId: null,
    workflowName: '新工作流',
    workflowDescription: '',
    isDirty: false,
    history: [],
    historyIndex: -1,
    canUndo: false,
    canRedo: false,

    _pushHistory: () => {
        const { nodes, edges, history, historyIndex } = get();
        const snapshot: HistorySnapshot = { nodes: deepClone(nodes), edges: deepClone(edges) };
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(snapshot);
        if (newHistory.length > MAX_HISTORY) newHistory.shift();
        const newIndex = newHistory.length - 1;
        set({ history: newHistory, historyIndex: newIndex, canUndo: newIndex > 0, canRedo: false });
    },

    saveToLocal: () => {
        try {
            const { nodes, edges, workflowName, workflowDescription } = get();
            const data = { nodes, edges, workflowName, workflowDescription, savedAt: Date.now() };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('宸ヤ綔娴佽嚜鍔ㄤ繚瀛樺け璐?', e);
        }
    },

    loadFromLocal: () => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (data.nodes && Array.isArray(data.nodes)) {
                clearDeferredWorkflowTimers();
                set({
                    nodes: data.nodes,
                    edges: data.edges || [],
                    workflowName: data.workflowName || '鏂板伐浣滄祦',
                    workflowDescription: data.workflowDescription || '',
                    isDirty: false,
                });
                const maxId = data.nodes.reduce((max: number, n: any) => {
                    const match = n.id?.match(/\d+/);
                    return match ? Math.max(max, parseInt(match[0], 10)) : max;
                }, 0);
                nodeIdCounter = maxId + 1;
                get()._pushHistory();
                return true;
            }
        } catch (e) {
            console.warn('鍔犺浇鏈湴宸ヤ綔娴佸け璐?', e);
        }
        return false;
    },

    setNodes: (nodes) => {
        clearDeferredWorkflowTimers();
        set({ nodes, isDirty: true });
        _deferredHistoryTimer = setTimeout(() => {
            _deferredHistoryTimer = null;
            get()._pushHistory();
            scheduleAutosave(get());
        }, AUTOSAVE_DELAY_MS);
    },
    setEdges: (edges) => {
        clearDeferredWorkflowTimers();
        set({ edges, isDirty: true });
        _deferredHistoryTimer = setTimeout(() => {
            _deferredHistoryTimer = null;
            get()._pushHistory();
            scheduleAutosave(get());
        }, AUTOSAVE_DELAY_MS);
    },
    addNode: (nodeConfig, position) => {
        clearDeferredWorkflowTimers();
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
        get()._pushHistory();
        scheduleAutosave(get());
    },

    removeNode: (nodeId) => {
        clearDeferredWorkflowTimers();
        set((state) => ({
            nodes: state.nodes.filter(n => n.id !== nodeId),
            edges: state.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
            selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
            isDirty: true,
        }));
        get()._pushHistory();
        scheduleAutosave(get());
    },

    updateNodeData: (nodeId, data) => {
        clearDeferredWorkflowTimers();
        set((state) => ({
            nodes: state.nodes.map(n =>
                n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
            ),
            isDirty: true,
        }));
        _deferredHistoryTimer = setTimeout(() => {
            _deferredHistoryTimer = null;
            get()._pushHistory();
            scheduleAutosave(get());
        }, AUTOSAVE_DELAY_MS);
    },

    selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

    setWorkflowMeta: (name, description) => {
        set({ workflowName: name, workflowDescription: description, isDirty: true });
        scheduleAutosave(get());
    },

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

        /** 从上游数据源节点收集 data_sources 配置 */
        const collectDataSources = (nodeIds: string[]) => {
            return nodeIds
                .map(id => nodes.find(n => n.id === id))
                .filter((n): n is Node<WorkflowNodeData> => n !== undefined && n.data.category === 'source')
                .map(n => ({ type: n.data.subType, params: { ...n.data.params } }));
        };

        /**
         * 从关联的数据源推导 gate_id（注入到每个条件的 gate_id）
         * 优先级：条件自带 gateId > 数据源的 gate_id > '*'
         */
        const resolveGateId = (condNode: Node<WorkflowNodeData>, dataSources: { type: string; params: ConditionParams }[]) => {
            // 条件节点自带 gateId 优先
            if (condNode.data.gateId && condNode.data.gateId !== '*') return String(condNode.data.gateId);
            // 从数据源继承
            for (const ds of dataSources) {
                if (ds.params.scope === 'single' && ds.params.gate_id) return String(ds.params.gate_id);
            }
            return '*';
        };

        const logicNodes = nodes.filter(n => n.data.category === 'logic');

        if (logicNodes.length === 0) {
            const conditions = nodes.filter(n => n.data.category === 'condition');
            const actions = nodes.filter(n => n.data.category === 'action');
            const sources = nodes.filter(n => n.data.category === 'source');
            const dataSources = sources.map(n => ({ type: n.data.subType, params: { ...n.data.params } }));

            if (conditions.length > 0) {
                rules.push({
                    name: get().workflowName || '自定义规则',
                    description: get().workflowDescription || '',
                    conditions: conditions.map(n => ({
                        type: n.data.subType,
                        params: n.data.params,
                        gate_id: resolveGateId(n, dataSources),
                    })),
                    logic: 'AND',
                    severity: 'medium',
                    actions: actions.map(n => ({
                        type: n.data.subType.replace('action_', ''),
                        params: n.data.params,
                    })),
                    cooldown_s: 60,
                    enabled: true,
                    data_sources: dataSources.length > 0 ? dataSources : undefined,
                });
            }
        } else {
            for (const logicNode of logicNodes) {
                const incomingEdges = edges.filter(e => e.target === logicNode.id);
                const outgoingEdges = edges.filter(e => e.source === logicNode.id);

                // 上游所有直连节点 id
                const upstreamIds = incomingEdges.map(e => e.source);

                // 分离 condition 和 source 节点
                const conditionNodes = upstreamIds
                    .map(id => nodes.find(n => n.id === id))
                    .filter((n): n is Node<WorkflowNodeData> => n !== undefined && n.data.category === 'condition');

                // 也尝试收集间接上游：condition 节点的上游 source 节点
                const allSourceIds = new Set<string>();
                // 直连到逻辑节点的 source
                upstreamIds.forEach(id => {
                    const n = nodes.find(nd => nd.id === id);
                    if (n && n.data.category === 'source') allSourceIds.add(id);
                });
                // condition 节点上游的 source
                for (const cond of conditionNodes) {
                    const condInputEdges = edges.filter(e => e.target === cond.id);
                    condInputEdges.forEach(e => {
                        const src = nodes.find(n => n.id === e.source);
                        if (src && src.data.category === 'source') allSourceIds.add(src.id);
                    });
                }

                const dataSources = collectDataSources([...allSourceIds]);
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
                            gate_id: resolveGateId(n, dataSources),
                        })),
                        logic: (logicNode.data.logic as RuleDefinition['logic']) || 'AND',
                        severity: 'medium',
                        actions: actionNodes.map(n => ({
                            type: n.data.subType.replace('action_', ''),
                            params: n.data.params,
                        })),
                        cooldown_s: 60,
                        enabled: true,
                        data_sources: dataSources.length > 0 ? dataSources : undefined,
                    });
                }
            }
        }

        return rules;
    },

    loadRules: (rules) => {
        clearDeferredWorkflowTimers();
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
        get()._pushHistory();
        scheduleAutosave(get());
    },

    clearAll: () => {
        clearDeferredWorkflowTimers();
        set({ nodes: [], edges: [], selectedNodeId: null, isDirty: false, history: [], historyIndex: -1, canUndo: false, canRedo: false });
        try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* ignore */ }
    },

    // ==================== 撤销/重做 ====================

    _pushHistory: () => {
        const { nodes, edges, history, historyIndex } = get();
        const snapshot: HistorySnapshot = { nodes: deepClone(nodes), edges: deepClone(edges) };
        // 截断 redo 分支
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(snapshot);
        // 限制历史长度
        if (newHistory.length > MAX_HISTORY) newHistory.shift();
        const newIndex = newHistory.length - 1;
        set({ history: newHistory, historyIndex: newIndex, canUndo: newIndex > 0, canRedo: false });
    },

    undo: () => {
        clearDeferredWorkflowTimers();
        const { history, historyIndex } = get();
        if (historyIndex <= 0) return;
        const prev = history[historyIndex - 1];
        const newIndex = historyIndex - 1;
        set({
            nodes: deepClone(prev.nodes),
            edges: deepClone(prev.edges),
            historyIndex: newIndex,
            isDirty: true,
            canUndo: newIndex > 0,
            canRedo: true,
        });
        scheduleAutosave(get());
    },

    redo: () => {
        clearDeferredWorkflowTimers();
        const { history, historyIndex } = get();
        if (historyIndex >= history.length - 1) return;
        const next = history[historyIndex + 1];
        const newIndex = historyIndex + 1;
        set({
            nodes: deepClone(next.nodes),
            edges: deepClone(next.edges),
            historyIndex: newIndex,
            isDirty: true,
            canUndo: true,
            canRedo: newIndex < history.length - 1,
        });
        scheduleAutosave(get());
    },

    // ==================== 本地持久化 ====================

    saveToLocal: () => {
        try {
            const { nodes, edges, workflowName, workflowDescription } = get();
            const data = { nodes, edges, workflowName, workflowDescription, savedAt: Date.now() };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('工作流自动保存失败:', e);
        }
    },

    loadFromLocal: () => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (data.nodes && Array.isArray(data.nodes)) {
                clearDeferredWorkflowTimers();
                set({
                    nodes: data.nodes,
                    edges: data.edges || [],
                    workflowName: data.workflowName || '新工作流',
                    workflowDescription: data.workflowDescription || '',
                    isDirty: false,
                });
                // 重建 nodeIdCounter 避免 ID 冲突
                const maxId = data.nodes.reduce((max: number, n: any) => {
                    const match = n.id?.match(/\d+/);
                    return match ? Math.max(max, parseInt(match[0], 10)) : max;
                }, 0);
                nodeIdCounter = maxId + 1;
                get()._pushHistory(); // 初始快照
                return true;
            }
        } catch (e) {
            console.warn('加载本地工作流失败:', e);
        }
        return false;
    },
}));
