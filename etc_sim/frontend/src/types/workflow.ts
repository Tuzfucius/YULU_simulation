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
    /** 关联的数据源配置 */
    data_sources?: DataSourceConfig[];
}

/** 数据源配置（导出到后端的格式） */
export interface DataSourceConfig {
    type: string;
    params: ConditionParams;
}

// ==================== 参数元数据（驱动属性面板渲染） ====================

/** 参数字段元信息 — 控制 UI 渲染方式 */
export interface ParamFieldMeta {
    key: string;
    label: string;
    type: 'number' | 'text' | 'select' | 'gate_id';
    options?: { value: string; label: string }[];
    min?: number; max?: number; step?: number;
    /** 条件显示：当指定 key 的值在 value 列表中时才渲染 */
    showWhen?: { key: string; value: string[] };
}

/**
 * 各数据源类型的参数字段元信息映射
 * key = 数据源 subType, value = 字段列表
 */
export const DATA_SOURCE_FIELDS: Record<string, ParamFieldMeta[]> = {
    etc_data: [
        { key: 'scope', label: '数据范围', type: 'select', options: [
            { value: 'single', label: '单个门架' },
            { value: 'range', label: '门架区间' },
            { value: 'all', label: '全部门架' },
        ]},
        { key: 'gate_id', label: '门架编号', type: 'gate_id',
          showWhen: { key: 'scope', value: ['single'] } },
        { key: 'gate_from', label: '起始门架', type: 'gate_id',
          showWhen: { key: 'scope', value: ['range'] } },
        { key: 'gate_to', label: '结束门架', type: 'gate_id',
          showWhen: { key: 'scope', value: ['range'] } },
        { key: 'metric', label: '提取指标', type: 'select', options: [
            { value: 'avg_speed', label: '平均速度' },
            { value: 'flow_rate', label: '流量' },
            { value: 'avg_travel_time', label: '平均行程时间' },
            { value: 'outlier_count', label: '离群计数' },
            { value: 'consecutive_outliers', label: '连续异常计数' },
        ]},
    ],
    vehicle_data: [
        { key: 'scope', label: '数据范围', type: 'select', options: [
            { value: 'segment', label: '按区间' },
            { value: 'radius', label: '按范围' },
            { value: 'all', label: '全部车辆' },
        ]},
        { key: 'segment_id', label: '区间编号', type: 'number', min: 0, max: 20, step: 1,
          showWhen: { key: 'scope', value: ['segment'] } },
        { key: 'center_km', label: '中心位置 (km)', type: 'number', min: 0, max: 30, step: 0.5,
          showWhen: { key: 'scope', value: ['radius'] } },
        { key: 'radius_km', label: '半径 (km)', type: 'number', min: 0.1, max: 5, step: 0.1,
          showWhen: { key: 'scope', value: ['radius'] } },
        { key: 'metric', label: '车辆指标', type: 'select', options: [
            { value: 'speed', label: '速度' },
            { value: 'position', label: '位置' },
            { value: 'lane', label: '车道' },
            { value: 'anomaly_state', label: '异常状态' },
        ]},
    ],
    env_data: [
        { key: 'metric', label: '环境指标', type: 'select', options: [
            { value: 'weather_type', label: '天气类型' },
            { value: 'noise_stats', label: '噪声统计' },
        ]},
    ],
    history_data: [
        { key: 'lookback_s', label: '回溯窗口 (秒)', type: 'number', min: 30, max: 3600, step: 30 },
        { key: 'severity_filter', label: '严重等级过滤', type: 'select', options: [
            { value: 'all', label: '全部' },
            { value: 'low', label: '低' },
            { value: 'medium', label: '中' },
            { value: 'high', label: '高' },
            { value: 'critical', label: '严重' },
        ]},
    ],
    aggregation_data: [
        { key: 'scope', label: '数据范围', type: 'select', options: [
            { value: 'single', label: '单个门架' },
            { value: 'all', label: '全部门架' },
        ]},
        { key: 'gate_id', label: '门架编号', type: 'gate_id',
          showWhen: { key: 'scope', value: ['single'] } },
        { key: 'source_metric', label: '聚合源指标', type: 'select', options: [
            { value: 'avg_speed', label: '平均速度' },
            { value: 'flow_rate', label: '流量' },
            { value: 'avg_travel_time', label: '平均行程时间' },
        ]},
        { key: 'window_s', label: '时间窗口 (秒)', type: 'number', min: 10, max: 600, step: 10 },
        { key: 'method', label: '聚合方法', type: 'select', options: [
            { value: 'mean', label: '均值' },
            { value: 'max', label: '最大值' },
            { value: 'min', label: '最小值' },
            { value: 'std', label: '标准差' },
            { value: 'count', label: '计数' },
        ]},
    ],
    gate_corr_data: [
        { key: 'upstream_gate', label: '上游门架', type: 'gate_id' },
        { key: 'downstream_gate', label: '下游门架', type: 'gate_id' },
        { key: 'metric', label: '关联指标', type: 'select', options: [
            { value: 'flow_diff', label: '流量差' },
            { value: 'speed_diff', label: '速度差' },
            { value: 'travel_time_ratio', label: '行程时间比' },
        ]},
    ],
    realtime_calc: [
        { key: 'scope', label: '数据范围', type: 'select', options: [
            { value: 'single', label: '单个门架' },
            { value: 'all', label: '全部门架' },
        ]},
        { key: 'gate_id', label: '门架编号', type: 'gate_id',
          showWhen: { key: 'scope', value: ['single'] } },
        { key: 'target', label: '计算目标', type: 'select', options: [
            { value: 'avg_speed', label: '平均速度' },
            { value: 'flow_rate', label: '流量' },
            { value: 'density', label: '密度' },
        ]},
        { key: 'window_s', label: '窗口大小 (秒)', type: 'number', min: 5, max: 300, step: 5 },
        { key: 'metric', label: '计算方法', type: 'select', options: [
            { value: 'moving_avg', label: '移动平均' },
            { value: 'slope', label: '变化斜率' },
            { value: 'ema', label: '指数平滑' },
        ]},
    ],
};

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
