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
    logic: 'AND' | 'OR';
    severity: 'low' | 'medium' | 'high' | 'critical';
    actions: ActionInstance[];
    cooldown_s: number;
    enabled: boolean;
}

// ==================== 工作流节点类型 ====================

/** 节点类别 */
export type NodeCategory = 'source' | 'condition' | 'logic' | 'action';

/** 节点可用类型 */
export interface NodeTypeConfig {
    type: string;
    label: string;
    category: NodeCategory;
    icon: string;
    color: string;
    description: string;
    defaultParams?: ConditionParams;
}

/** 节点数据（存储在 ReactFlow Node.data 中） */
export interface WorkflowNodeData {
    label: string;
    category: NodeCategory;
    subType: string;        // condition type or action type
    icon: string;
    color: string;
    params: ConditionParams;
    gateId?: string;
    severity?: string;
    logic?: 'AND' | 'OR';
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
}
