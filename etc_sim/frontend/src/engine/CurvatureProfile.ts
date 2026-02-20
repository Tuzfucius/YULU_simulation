/**
 * CurvatureProfile.ts
 * 弯道曲率档案模块
 *
 * 功能：
 * 1. 将路径编辑器节点（含 radius 字段）转换为里程→曲率半径映射表
 * 2. 根据车辆里程位置查询当前弯道半径
 * 3. 计算弯道最大安全速度（HCM 横向摩擦力模型）
 * 4. 计算弯道事故率增益系数（AASHTO HSM 幂次关系）
 */

// ─── 常量 ────────────────────────────────────────────────────

/** 侧向摩擦系数（干燥沥青高速公路） */
const MU_DEFAULT = 0.50;
/** 超高率（高速公路设计值） */
const E_DEFAULT = 0.06;
/** 重力加速度 */
const G = 9.81;
/** "安全基准半径"（m）：半径 >= 此值视为直道 */
export const SAFE_RADIUS_M = 500;
/** AASHTO HSM 曲率敏感指数 */
const BETA = 0.7;

// ─── 类型定义 ─────────────────────────────────────────────────

/**
 * 一段弯道区间
 */
export interface CurveSegment {
    /** 区间起始里程（米） */
    startM: number;
    /** 区间结束里程（米） */
    endM: number;
    /** 曲率半径（米），Infinity 表示直道 */
    radiusM: number;
}

// ─── 核心函数 ─────────────────────────────────────────────────

/**
 * 根据路径节点构建曲率档案
 *
 * @param nodes   路径节点数组 {x, y, radius?}（画布坐标 + 可选弧度半径，画布单位）
 * @param scaleM  画布单位 → 米 的换算系数（SCALE_M_PER_UNIT）
 * @returns       CurveSegment[]，按里程升序排列
 */
export function buildCurveProfile(
    nodes: { x: number; y: number; radius?: number }[],
    scaleM: number
): CurveSegment[] {
    if (nodes.length < 2) return [];

    const segments: CurveSegment[] = [];
    let currentMeter = 0;

    for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodes[i];
        const b = nodes[i + 1];
        const segLenM = Math.hypot(b.x - a.x, b.y - a.y) * scaleM;

        // 节点的 radius 是"折点圆弧半径"，即 A→B→C 处圆弧的半径（画布单位）
        // 用当前节点（折点 B = nodes[i+1]）的 radius 代表该线段的弯曲程度
        // 注：第一段使用 nodes[1].radius，其余类推
        const nodeRadius = nodes[i + 1].radius;
        const radiusM = (nodeRadius && nodeRadius > 0)
            ? nodeRadius * scaleM
            : Infinity;

        segments.push({
            startM: currentMeter,
            endM: currentMeter + segLenM,
            radiusM,
        });

        currentMeter += segLenM;
    }

    return segments;
}

/**
 * 根据当前里程位置查询弯道半径
 *
 * @param posM    车辆当前里程（米）
 * @param profile 曲率档案（buildCurveProfile 生成）
 * @returns       弯道半径（米），若为直道则返回 Infinity
 */
export function getCurveRadius(posM: number, profile: CurveSegment[]): number {
    if (profile.length === 0) return Infinity;

    for (const seg of profile) {
        if (posM >= seg.startM && posM < seg.endM) {
            return seg.radiusM;
        }
    }
    return Infinity; // 超出档案范围（已驶出，视为直道）
}

/**
 * 计算弯道最大安全速度（HCM 横向摩擦力模型）
 *
 * 公式：V_safe = √(μ + e) × g × R    单位：m/s
 *
 * @param radiusM 弯道半径（米）
 * @param mu      侧向摩擦系数（默认 0.50）
 * @param e       超高率（默认 0.06）
 * @returns       最大安全速度（m/s）；直道（Infinity）返回 Infinity
 */
export function calcSafeSpeed(
    radiusM: number,
    mu: number = MU_DEFAULT,
    e: number = E_DEFAULT
): number {
    if (!isFinite(radiusM) || radiusM <= 0) return Infinity;
    return Math.sqrt((mu + e) * G * radiusM);
}

/**
 * 计算弯道事故率增益系数（AASHTO HSM 幂次关系）
 *
 * 公式：factor = (R_ref / R)^β
 * 半径越小（弯道越急），事故率越高。
 *
 * @param radiusM     当前弯道半径（米）
 * @param currentSpeedMs 车辆当前速度（m/s），用于计算超速叠加
 * @param safeSpeedMs    最大安全速度（m/s）
 * @returns          事故率倍数（1.0 表示与直道相同）
 */
export function calcAccidentFactor(
    radiusM: number,
    currentSpeedMs: number,
    safeSpeedMs: number
): number {
    // 直道：无增益
    if (!isFinite(radiusM) || radiusM >= SAFE_RADIUS_M) return 1.0;

    // 曲率因子
    const curveFactor = Math.pow(SAFE_RADIUS_M / radiusM, BETA);

    // 超速叠加因子（仅超速时生效）
    const speedFactor = (isFinite(safeSpeedMs) && currentSpeedMs > safeSpeedMs)
        ? Math.pow(currentSpeedMs / safeSpeedMs, 2)
        : 1.0;

    return curveFactor * speedFactor;
}
