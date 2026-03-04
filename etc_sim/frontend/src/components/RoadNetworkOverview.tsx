/**
 * RoadNetworkOverview.tsx
 * 路网全局预览图
 *
 * 当用户导入了自定义路网（customRoadPath 存在）时，
 * 在仿真结果页面展示一张路网全局图，包含：
 * - 路网折线形状
 * - ETC 门架位置
 * - 关键里程标注（0km / 等分里程 / 全长）
 * - 总长度信息卡片
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useSimStore } from '../stores/simStore';
import { useI18nStore } from '../stores/i18nStore';

import { API } from '../config/api';

const API_BASE = API.BASE;

interface RoadNode {
    x: number;
    y: number;
    radius?: number;
    type?: string;
}

interface Gantry {
    id: string;
    x: number;
    y: number;
    name?: string;
    km?: number; // 若后端存储了里程
}

interface RoadMeta {
    total_length_km?: number;
    scale_m_per_unit?: number;
    name?: string;
}

interface RoadData {
    nodes: RoadNode[];
    gantries: Gantry[];
    meta: RoadMeta;
}

// 调色盘（与主题一致）
const COLORS = {
    road: '#D0BCFF',       // 紫色路线
    roadShadow: '#7B61FF40',
    gantry: '#F2B8B5',     // 红粉门架
    gantryCircle: '#EF4444',
    milestone: '#86EFAC',  // 绿色里程标
    startEnd: '#60A5FA',   // 蓝色起终点
    textPrimary: '#E6E1E5',
    textSecondary: '#CAC4D0',
    grid: '#2B2930',
    accent: '#8B5CF6',
};

const PADDING = 40; // Canvas 内边距（像素）

export const RoadNetworkOverview: React.FC = () => {
    const { config } = useSimStore();
    const { t } = useI18nStore();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [roadData, setRoadData] = useState<RoadData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 获取路网数据
    const fetchRoadData = useCallback(async (filename: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/custom-roads/${filename}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: RoadData = await res.json();
            setRoadData(data);
        } catch (e: any) {
            setError(t('roadOverview.loadFailed'));
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (config.customRoadPath) {
            fetchRoadData(config.customRoadPath);
        } else {
            setRoadData(null);
        }
    }, [config.customRoadPath, fetchRoadData]);

    // Canvas 绘图
    const drawRoad = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !roadData) return;
        if (roadData.nodes.length < 2) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const W = canvas.width;
        const H = canvas.height;
        ctx.clearRect(0, 0, W, H);

        const nodes = roadData.nodes;
        const gantries = roadData.gantries || [];
        const scaleM = roadData.meta?.scale_m_per_unit ?? 2;
        const totalKm = roadData.meta?.total_length_km;

        // ── 计算每个节点的累计里程（画布单位 → 米 → km）
        const cumulativeKm: number[] = [0];
        for (let i = 1; i < nodes.length; i++) {
            const dx = nodes[i].x - nodes[i - 1].x;
            const dy = nodes[i].y - nodes[i - 1].y;
            const segLenKm = Math.hypot(dx, dy) * scaleM / 1000;
            cumulativeKm.push(cumulativeKm[i - 1] + segLenKm);
        }
        const actualTotalKm = totalKm ?? cumulativeKm[cumulativeKm.length - 1];

        // ── 坐标转换：画布节点坐标 → Canvas 屏幕坐标 ───────────────────
        const xs = nodes.map(n => n.x);
        const ys = nodes.map(n => n.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);

        const drawW = W - PADDING * 2;
        const drawH = H - PADDING * 2;
        const scaleX = drawW / (maxX - minX || 1);
        const scaleY = drawH / (maxY - minY || 1);
        const sc = Math.min(scaleX, scaleY); // 保持纵横比

        const cx = (W - (maxX - minX) * sc) / 2;
        const cy = (H - (maxY - minY) * sc) / 2;

        const toScreen = (nx: number, ny: number) => ({
            x: cx + (nx - minX) * sc,
            y: cy + (ny - minY) * sc,
        });

        // ── 背景渐变 ─────────────────────────────────────────────────
        const bg = ctx.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, '#1C1B23');
        bg.addColorStop(1, '#12111A');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // ── 路网阴影（发光效果）─────────────────────────────────────
        ctx.save();
        ctx.shadowColor = COLORS.roadShadow;
        ctx.shadowBlur = 18;
        ctx.strokeStyle = '#7B61FF55';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        const start0 = toScreen(nodes[0].x, nodes[0].y);
        ctx.moveTo(start0.x, start0.y);
        for (let i = 1; i < nodes.length; i++) {
            const p = toScreen(nodes[i].x, nodes[i].y);
            ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.restore();

        // ── 主路线 ──────────────────────────────────────────────────
        ctx.save();
        const roadGrad = ctx.createLinearGradient(
            toScreen(nodes[0].x, nodes[0].y).x, toScreen(nodes[0].x, nodes[0].y).y,
            toScreen(nodes[nodes.length - 1].x, nodes[nodes.length - 1].y).x,
            toScreen(nodes[nodes.length - 1].x, nodes[nodes.length - 1].y).y
        );
        roadGrad.addColorStop(0, '#60A5FA');
        roadGrad.addColorStop(0.5, '#D0BCFF');
        roadGrad.addColorStop(1, '#F2B8B5');
        ctx.strokeStyle = roadGrad;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        const p0 = toScreen(nodes[0].x, nodes[0].y);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < nodes.length; i++) {
            const p = toScreen(nodes[i].x, nodes[i].y);
            ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.restore();

        // ── 起终点圆圈 ───────────────────────────────────────────────
        const startPt = toScreen(nodes[0].x, nodes[0].y);
        const endPt = toScreen(nodes[nodes.length - 1].x, nodes[nodes.length - 1].y);

        // 起点（蓝色）
        ctx.save();
        ctx.shadowColor = '#60A5FA80';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(startPt.x, startPt.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#60A5FA';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        // 终点（粉红色）
        ctx.save();
        ctx.shadowColor = '#F2B8B580';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(endPt.x, endPt.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#F2B8B5';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        // 起终点标签
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = COLORS.textPrimary;
        ctx.textAlign = 'center';
        ctx.fillText(t('roadOverview.startPoint'), startPt.x, startPt.y - 14);
        ctx.fillText(t('roadOverview.endPoint').replace('{km}', actualTotalKm.toFixed(2)), endPt.x, endPt.y - 14);

        // ── ETC 门架 ─────────────────────────────────────────────────
        gantries.forEach((g, idx) => {
            const gp = toScreen(g.x, g.y);

            // 竖线
            ctx.save();
            ctx.strokeStyle = COLORS.gantry;
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 3]);
            ctx.shadowColor = '#EF444460';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.moveTo(gp.x, gp.y - 20);
            ctx.lineTo(gp.x, gp.y + 20);
            ctx.stroke();
            ctx.restore();

            // 圆点
            ctx.save();
            ctx.shadowColor = '#EF444480';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(gp.x, gp.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = COLORS.gantryCircle;
            ctx.fill();
            ctx.restore();

            // 标签：门架名或序号 + 里程
            const gantryLabel = g.name ?? `G${idx + 1}`;
            let kmLabel = '';
            if (typeof g.km === 'number') {
                kmLabel = `${g.km.toFixed(1)}km`;
            }

            ctx.save();
            ctx.font = 'bold 10px system-ui, sans-serif';
            ctx.fillStyle = COLORS.gantry;
            ctx.textAlign = 'center';
            const isEven = idx % 2 === 0;
            const labelY = isEven ? gp.y - 28 : gp.y + 34;
            ctx.fillText(gantryLabel, gp.x, labelY);
            if (kmLabel) {
                ctx.font = '9px system-ui, sans-serif';
                ctx.fillStyle = COLORS.textSecondary;
                ctx.fillText(kmLabel, gp.x, labelY + 12);
            }
            ctx.restore();
        });

        // ── 里程标注（等分标注，选取 5-7 个点）────────────────────────
        const MILESTONE_COUNT = Math.min(6, nodes.length - 2);
        if (MILESTONE_COUNT > 0 && actualTotalKm > 0) {
            for (let m = 1; m <= MILESTONE_COUNT; m++) {
                const targetKm = (actualTotalKm / (MILESTONE_COUNT + 1)) * m;
                // 找最近节点
                let closestIdx = 1;
                let minDiff = Infinity;
                for (let i = 1; i < nodes.length - 1; i++) {
                    const diff = Math.abs(cumulativeKm[i] - targetKm);
                    if (diff < minDiff) { minDiff = diff; closestIdx = i; }
                }
                const mp = toScreen(nodes[closestIdx].x, nodes[closestIdx].y);

                // 小三角形标记
                ctx.save();
                ctx.shadowColor = '#86EFAC60';
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.moveTo(mp.x, mp.y - 6);
                ctx.lineTo(mp.x - 4, mp.y + 3);
                ctx.lineTo(mp.x + 4, mp.y + 3);
                ctx.closePath();
                ctx.fillStyle = COLORS.milestone;
                ctx.fill();
                ctx.restore();

                // 里程文字
                ctx.save();
                ctx.font = '9px system-ui, sans-serif';
                ctx.fillStyle = COLORS.milestone;
                ctx.textAlign = 'center';
                ctx.fillText(`${cumulativeKm[closestIdx].toFixed(1)}km`, mp.x, mp.y + 16);
                ctx.restore();
            }
        }

        // ── 图例 ─────────────────────────────────────────────────────
        const legendX = 12, legendY = H - 60;
        ctx.save();
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'left';

        const items = [
            { color: COLORS.road, label: t('roadOverview.legendRoad') },
            { color: COLORS.gantryCircle, label: t('roadOverview.legendGantry') },
            { color: COLORS.milestone, label: t('roadOverview.legendMilestone') },
        ];
        items.forEach((item, i) => {
            ctx.fillStyle = item.color;
            ctx.fillRect(legendX, legendY + i * 16, 10, 8);
            ctx.fillStyle = COLORS.textSecondary;
            ctx.fillText(item.label, legendX + 14, legendY + i * 16 + 8);
        });
        ctx.restore();

    }, [roadData]);

    // 响应式重绘
    useEffect(() => {
        drawRoad();
    }, [drawRoad]);

    // ResizeObserver 处理容器大小变化
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const observer = new ResizeObserver(() => {
            const container = canvas.parentElement;
            if (!container) return;
            canvas.width = container.clientWidth;
            canvas.height = 520;
            drawRoad();
        });
        if (canvas.parentElement) observer.observe(canvas.parentElement);
        return () => observer.disconnect();
    }, [drawRoad]);

    // 未选择路网时不渲染
    if (!config.customRoadPath) return null;

    return (
        <div className="glass-card overflow-hidden" id="road-network-overview">
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <div className="flex items-center gap-3">
                    <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                        style={{ background: 'linear-gradient(135deg, #7B61FF22, #7B61FF55)' }}
                    >
                        🗺️
                    </div>
                    <div>
                        <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {t('roadOverview.title')}
                        </h3>
                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            {config.customRoadPath}
                            {roadData?.meta?.total_length_km != null && (
                                <span className="ml-2 text-[var(--accent-purple)]">
                                    {t('roadOverview.totalLength').replace('{km}', roadData.meta.total_length_km.toFixed(2))}
                                </span>
                            )}
                            {roadData?.gantries?.length != null && (
                                <span className="ml-2 text-[var(--accent-red)]">
                                    {t('roadOverview.gantryCount').replace('{count}', roadData.gantries.length.toString())}
                                </span>
                            )}
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => fetchRoadData(config.customRoadPath!)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-sm"
                    style={{
                        background: 'var(--surface-variant)',
                        color: 'var(--text-secondary)',
                    }}
                    title={t('roadOverview.reloadData')}
                >
                    ↻
                </button>
            </div>

            {/* Canvas 区域 */}
            <div className="relative" style={{ height: 520 }}>
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center"
                        style={{ background: '#1C1B2388', color: 'var(--text-tertiary)' }}>
                        <span className="text-sm animate-pulse">{t('roadOverview.loadingData')}</span>
                    </div>
                )}
                {error && (
                    <div className="absolute inset-0 flex items-center justify-center"
                        style={{ background: '#1C1B23', color: '#F2B8B5' }}>
                        <span className="text-sm">⚠️ {error}</span>
                    </div>
                )}
                <canvas
                    ref={canvasRef}
                    style={{ width: '100%', height: 520, display: 'block' }}
                />
            </div>
        </div>
    );
};
