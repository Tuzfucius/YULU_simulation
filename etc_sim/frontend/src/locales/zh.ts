/**
 * 简体中文翻译
 */

export const zh = {
    common: {
        start: '启动',
        stop: '停止',
        pause: '暂停',
        resume: '恢复',
        reset: '重置',
        export: '导出',
        import: '导入',
        language: '语言',
        theme: '主题',
        light: '明亮',
        dark: '深色',
    },
    simulation: {
        title: 'ETC 车流仿真',
        status: '状态',
        running: '运行中',
        paused: '已暂停',
        stopped: '已停止',
        time: '仿真时间',
        vehicles: '车辆',
        total: '总数',
        active: '活跃',
        completed: '完成',
    },
    config: {
        title: '参数配置',
        roadLength: '道路长度(km)',
        numLanes: '车道数',
        targetVehicles: '目标车辆数',
        reset: '重置为默认',

        // 车辆比例
        carRatio: '轿车比例',
        truckRatio: '卡车比例',
        busRatio: '客车比例',

        // 驾驶风格
        driverStyles: '驾驶风格',
        aggressive: '激进型',
        conservative: '保守型',
        normal: '普通型',

        // 异常设定
        anomalies: '异常设定',
        anomalyRate: '异常概率',
        startTime: '开始时间',
        safeRunTime: '安全行驶时间',

        // 交通逻辑
        trafficLogic: '交通逻辑',
        laneChangeDelay: '换道延迟',
        impactThreshold: '影响阈值',
        impactDist: '影响距离',
    },
    charts: {
        title: '仿真分析',
        subtitle: '可视化仿真结果',
        vehicleType: '车辆类型分布',
        driverStyle: '驾驶风格分布',
        laneChange: '换道原因分析',
        laneChangeByStyle: '各风格换道统计',
        avgSpeed: '平均速度 (km/h)',
        progress: '仿真进度',
        speedHeatmap: '速度热力图 (时空)',
        trajectory: '车辆轨迹 (采样)',
        speedProfile: '车流速度画像',
        summary: '统计摘要',
        totalVehicles: '总车辆数',
        totalLaneChanges: '总换道次数',
        anomalyEvents: '异常事件',
        forcedLaneChanges: '强制换道',
        completed: '已完成',
        active: '活跃',
        totalTime: '总时间',
        noData: '无数据',
    },
    logs: {
        title: '运行日志',
        clear: '清空',
    },
};

export type Translation = typeof zh;
