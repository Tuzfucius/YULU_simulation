/**
 * 工作流编辑器类型定义
 */

// ==================== 后端数据类型 ====================

/** 条件参数 */
export interface ConditionParams {
    [key: string]: number | string | boolean | string[];
}

/** 条件类型定义 */
export interface ConditionTypeDef {
    type: string;
    description: string;
    default_params: ConditionParams;
}

/** 动作类型定义 */
export interface ActionTypeDef {
    type: string;
    description: string;
}

/** 条件实例 */
export interface ConditionInstance {
    type: string;
    params: ConditionParams;
    gate_id: string;
}

/** 动作实例 */
export interface ActionInstance {
    type: string;
    params: ConditionParams;
}

/** 规则定义 */
export interface RuleDefinition {
    name: string;
    description: string;
    conditions: ConditionInstance[];
    logic: LogicType;
    severity: 'low' | 'medium' | 'high' | 'critical';
    actions: ActionInstance[];
    cooldown_s: number;
    enabled: boolean;
}

// ==================== 端口定义 ====================

/** 端口方向 */
export type PortDirection = 'input' | 'output';

/** 端口定义 */
export interface PortDefinition {
    id: string;           // Handle ID，如 'input-a', 'input-b', 'output'
    label: string;        // 显示标签
    direction: PortDirection;
    position: number;     // 在该侧的位置百分比（0-100），用于多端口的竖向排布
}

/** 预定义端口模板 */
export const PORT_TEMPLATES = {
    /** 仅输出（数据源节点） */
    sourceOnly: [
        { id: 'output', label: '输出', direction: 'output' as const, position: 50 },
    ],
    /** 一入一出（条件/NOT/阈值节点） */
    singleIO: [
        { id: 'input', label: '输入', direction: 'input' as const, position: 50 },
        { id: 'output', label: '输出', direction: 'output' as const, position: 50 },
    ],
    /** 两入一出（逻辑节点 AND/OR/比较运算） */
    dualInput: [
        { id: 'input-a', label: 'A', direction: 'input' as const, position: 35 },
        { id: 'input-b', label: 'B', direction: 'input' as const, position: 65 },
        { id: 'output', label: '输出', direction: 'output' as const, position: 50 },
    ],
    /** 仅输入（动作节点） */
    actionOnly: [
        { id: 'input', label: '输入', direction: 'input' as const, position: 50 },
    ],
} as const;

// ==================== 工作流节点类型 ====================

/** 节点类别 */
export type NodeCategory = 'source' | 'condition' | 'logic' | 'action';

/** 逻辑类型（扩展） */
export type LogicType = 'AND' | 'OR' | 'NOT' | 'GT' | 'LT' | 'EQ' | 'THRESHOLD';

/** 节点可用类型 */
export interface NodeTypeConfig {
    type: string;
    label: string;
    category: NodeCategory;
    icon: string;
    color: string;
    description: string;
    defaultParams?: ConditionParams;
    /** 端口定义（默认根据 category 自动选择） */
    ports?: PortDefinition[];
}

/** 节点数据（存储在 ReactFlow Node.data 中） */
export interface WorkflowNodeData {
    [key: string]: unknown;
    label: string;
    category: NodeCategory;
    subType: string;        // condition type or action type
    icon: string;
    color: string;
    params: ConditionParams;
    gateId?: string;
    severity?: string;
    logic?: LogicType;
    /** 端口定义列表 */
    ports: PortDefinition[];
}

// ==================== 工作流序列化 ====================

export interface SerializedWorkflow {
    name: string;
    description: string;
    nodes: SerializedNode[];
    edges: SerializedEdge[];
    rules: RuleDefinition[];
}

export interface SerializedNode {
    id: string;
    type: string;
    position: { x: number; y: number };
    data: WorkflowNodeData;
}

export interface SerializedEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
}
