/**
 * EditorCanvas - 道路编辑器画布
 * 功能：圆弧过渡绘制、ETC 门架吸附、比例尺、中键拖拽
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { CustomRoadData } from '../pages/RoadEditorPage';
import { useThemeStore } from '../../stores/themeStore';

interface EditorCanvasProps {
    data: CustomRoadData;
    setData: React.Dispatch<React.SetStateAction<CustomRoadData>>;
    mode: 'select' | 'pen' | 'gantry';
    showGrid: boolean;
    defaultRadius?: number; // 默认圆弧半径（米）
}

// ─── 常量 ────────────────────────────────────────────────────
const GRID_PX = 50;           // 每格像素数
const SCALE_M_PER_UNIT = 2;   // 1 画布单位 = 2 米（1格50px = 100m）
const SNAP_THRESHOLD_PX = 40; // ETC 吸附阈值（像素）

// ─── 几何工具 ────────────────────────────────────────────────

/** 点到线段最近点 */
function closestPointOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return { x: ax, y: ay, t: 0, dist: Math.hypot(px - ax, py - ay) };
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    const cx = ax + t * dx, cy = ay + t * dy;
    return { x: cx, y: cy, t, dist: Math.hypot(px - cx, py - cy) };
}

/** 在折线上找最近点 */
function closestPointOnPolyline(px: number, py: number, nodes: { x: number; y: number }[]) {
    if (nodes.length < 2) return null;
    let best: { x: number; y: number; segmentIndex: number; t: number; dist: number } | null = null;
    for (let i = 0; i < nodes.length - 1; i++) {
        const res = closestPointOnSegment(px, py, nodes[i].x, nodes[i].y, nodes[i + 1].x, nodes[i + 1].y);
        if (!best || res.dist < best.dist) best = { ...res, segmentIndex: i };
    }
    return best;
}

/** 按路径里程排序门架并重编号 ETC-1, ETC-2, ... */
function sortGantriesByMileage(gantries: CustomRoadData['gantries']): CustomRoadData['gantries'] {
    // 按 segmentIndex 升序，同 segment 内按 t 升序（即按路径从起点到终点排列）
    const sorted = [...gantries].sort((a, b) => {
        const segA = a.segmentIndex ?? 0;
        const segB = b.segmentIndex ?? 0;
        if (segA !== segB) return segA - segB;
        return (a.t ?? 0) - (b.t ?? 0);
    });
    // 重编号
    return sorted.map((g, i) => ({ ...g, name: `ETC-${i + 1}` }));
}

/**
 * 计算在 B 点处，从 A→B→C 方向插入半径 R 圆弧的切点
 * 返回 { t1: 切点在 AB 上的参数, t2: 切点在 BC 上的参数, cx, cy: 圆心 }
 * 如果 R=0 或角度太小，返回 null（直接尖角）
 */
function computeArcParams(
    ax: number, ay: number,
    bx: number, by: number,
    cx: number, cy: number,
    R: number // 世界坐标下的半径
) {
    if (R <= 0) return null;
    const v1x = ax - bx, v1y = ay - by;
    const v2x = cx - bx, v2y = cy - by;
    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);
    if (len1 < 1e-6 || len2 < 1e-6) return null;
    const u1x = v1x / len1, u1y = v1y / len1;
    const u2x = v2x / len2, u2y = v2y / len2;
    const dot = u1x * u2x + u1y * u2y;
    const halfAngle = Math.acos(Math.max(-1, Math.min(1, dot))) / 2;
    if (halfAngle < 0.01) return null; // 几乎平行，不插入圆弧
    const d = R / Math.tan(halfAngle); // 切点到顶点的距离
    if (d > len1 || d > len2) return null; // 圆弧太大放不下
    return {
        t1x: bx + u1x * d, t1y: by + u1y * d, // 切点1（在 AB 上）
        t2x: bx + u2x * d, t2y: by + u2y * d, // 切点2（在 BC 上）
    };
}

/** 计算"整数"比例尺长度（100m, 200m, 500m, 1km...） */
function niceScaleLength(zoom: number): { px: number; label: string } {
    const mPerPx = SCALE_M_PER_UNIT / zoom;
    const targetPx = 100; // 目标比例尺像素长度
    const rawM = mPerPx * targetPx;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawM)));
    const nice = [1, 2, 5, 10].map(f => f * magnitude).find(v => v / mPerPx >= 60) || magnitude * 10;
    const px = nice / mPerPx;
    const label = nice >= 1000 ? `${nice / 1000}km` : `${nice}m`;
    return { px, label };
}

// ─── 主组件 ──────────────────────────────────────────────────

export function EditorCanvas({ data, setData, mode, showGrid, defaultRadius = 0 }: EditorCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [pan, setPan] = useState({ x: 300, y: 250 });
    const [zoom, setZoom] = useState(1);
    const [cursor, setCursor] = useState('default');
    const [mouseWorld, setMouseWorld] = useState<{ x: number; y: number } | null>(null);
    const [snapPreview, setSnapPreview] = useState<{ x: number; y: number } | null>(null);
    const { theme } = useThemeStore();

    const isPanning = useRef(false);
    const lastMouse = useRef({ x: 0, y: 0 });

    const toWorld = useCallback((sx: number, sy: number) => ({
        x: (sx - pan.x) / zoom,
        y: (sy - pan.y) / zoom,
    }), [pan, zoom]);

    const toScreen = useCallback((wx: number, wy: number) => ({
        x: wx * zoom + pan.x,
        y: wy * zoom + pan.y,
    }), [pan, zoom]);

    // ─── 绘制 ────────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const W = container.clientWidth;
        const H = container.clientHeight;
        canvas.width = W;
        canvas.height = H;

        // 背景
        const isDark = theme === 'dark';
        ctx.fillStyle = isDark ? '#12121f' : '#f2f2f0';
        ctx.fillRect(0, 0, W, H);

        // ── 网格 ──
        if (showGrid) {
            ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            const startX = Math.floor((-pan.x / zoom) / GRID_PX) * GRID_PX;
            const startY = Math.floor((-pan.y / zoom) / GRID_PX) * GRID_PX;
            const endX = startX + W / zoom + GRID_PX * 2;
            const endY = startY + H / zoom + GRID_PX * 2;
            for (let x = startX; x <= endX; x += GRID_PX) {
                const s = toScreen(x, 0); ctx.moveTo(s.x, 0); ctx.lineTo(s.x, H);
            }
            for (let y = startY; y <= endY; y += GRID_PX) {
                const s = toScreen(0, y); ctx.moveTo(0, s.y); ctx.lineTo(W, s.y);
            }
            ctx.stroke();

            // 坐标轴
            ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.15)';
            ctx.lineWidth = 1.5;
            const o = toScreen(0, 0);
            ctx.beginPath();
            ctx.moveTo(o.x, 0); ctx.lineTo(o.x, H);
            ctx.moveTo(0, o.y); ctx.lineTo(W, o.y);
            ctx.stroke();
        }

        // ── 路径 ──
        const nodes = data.nodes;
        if (nodes.length >= 2) {
            // 路面阴影
            ctx.save();
            ctx.strokeStyle = 'rgba(77,170,255,0.12)';
            ctx.lineWidth = 20 * zoom;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            drawPath(ctx, nodes, zoom, toScreen);
            ctx.stroke();

            // 主路线
            ctx.strokeStyle = '#4daaff';
            ctx.lineWidth = 3 * zoom;
            drawPath(ctx, nodes, zoom, toScreen);
            ctx.stroke();
            ctx.restore();

            // 里程标注
            let accDist = 0;
            for (let i = 1; i < nodes.length; i++) {
                const prev = nodes[i - 1], curr = nodes[i];
                accDist += Math.hypot(curr.x - prev.x, curr.y - prev.y) * SCALE_M_PER_UNIT;
                if (zoom > 0.5) {
                    const p = toScreen(curr.x, curr.y);
                    ctx.fillStyle = isDark ? 'rgba(150,200,255,0.5)' : 'rgba(30,80,180,0.6)';
                    ctx.font = `${Math.max(9, 10 * zoom)}px monospace`;
                    ctx.fillText(`${accDist.toFixed(0)}m`, p.x + 6, p.y - 6);
                }
            }
        }

        // 绘制预览线（pen 模式，鼠标移动时）
        if (mode === 'pen' && nodes.length > 0 && mouseWorld) {
            const last = nodes[nodes.length - 1];
            const ls = toScreen(last.x, last.y);
            const ms = toScreen(mouseWorld.x, mouseWorld.y);
            ctx.strokeStyle = 'rgba(77,170,255,0.4)';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(ls.x, ls.y);
            ctx.lineTo(ms.x, ms.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // ── 节点 ──
        nodes.forEach((node, idx) => {
            const p = toScreen(node.x, node.y);
            const isStart = idx === 0;
            const isEnd = idx === nodes.length - 1 && nodes.length > 1;

            if (isStart || isEnd) {
                ctx.fillStyle = isStart ? '#50e3c2' : '#ff5b5b';
                ctx.beginPath();
                ctx.arc(p.x, p.y, 9 * zoom, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${9 * zoom}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(isStart ? 'S' : 'E', p.x, p.y);
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';
            } else {
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = '#4daaff';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4 * zoom, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }

            // 显示圆弧半径标注
            if (node.radius && node.radius > 0 && zoom > 0.6) {
                const p2 = toScreen(node.x, node.y);
                ctx.fillStyle = 'rgba(255,200,100,0.7)';
                ctx.font = `${9 * zoom}px monospace`;
                ctx.fillText(`R${node.radius}m`, p2.x + 8, p2.y + 14);
            }
        });

        // ── ETC 门架 ──
        data.gantries.forEach(g => {
            const p = toScreen(g.x, g.y);
            const hw = 14 * zoom, hh = 12 * zoom;

            ctx.strokeStyle = '#ffbd2e';
            ctx.lineWidth = 3 * zoom;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(p.x - hw, p.y + hh);
            ctx.lineTo(p.x - hw, p.y - hh);
            ctx.lineTo(p.x + hw, p.y - hh);
            ctx.lineTo(p.x + hw, p.y + hh);
            ctx.stroke();

            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 4 * zoom;
            ctx.beginPath();
            ctx.moveTo(p.x - hw, p.y - hh);
            ctx.lineTo(p.x + hw, p.y - hh);
            ctx.stroke();

            ctx.fillStyle = '#ffbd2e';
            ctx.font = `bold ${Math.max(9, 10 * zoom)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(g.name || 'ETC', p.x, p.y - hh - 6 * zoom);
            ctx.textAlign = 'left';
        });

        // ── 吸附预览（gantry 模式） ──
        if (snapPreview && mode === 'gantry') {
            const p = toScreen(snapPreview.x, snapPreview.y);
            ctx.strokeStyle = '#ffbd2e';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 12 * zoom, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(255,189,46,0.2)';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 12 * zoom, 0, Math.PI * 2);
            ctx.fill();
        }

        // ── 比例尺 ──
        drawScaleRuler(ctx, zoom, W, H);

    }, [data, pan, zoom, showGrid, mouseWorld, snapPreview, mode, toScreen]);

    // ─── 路径绘制函数（含圆弧过渡） ──────────────────────────
    function drawPath(
        ctx: CanvasRenderingContext2D,
        nodes: CustomRoadData['nodes'],
        zoom: number,
        toScreen: (wx: number, wy: number) => { x: number; y: number }
    ) {
        if (nodes.length < 2) return;

        const first = toScreen(nodes[0].x, nodes[0].y);
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);

        for (let i = 1; i < nodes.length; i++) {
            const curr = nodes[i];
            const next = nodes[i + 1];
            const cs = toScreen(curr.x, curr.y);

            // 当前节点有圆弧半径，且存在下一个节点时，用 arcTo 绘制圆弧过渡
            // ctx.arcTo(x1, y1, x2, y2, radius):
            //   - (x1,y1) = 拐角控制点（当前节点屏幕坐标）
            //   - (x2,y2) = 圆弧结束后的方向点（下一节点屏幕坐标）
            //   - radius  = 屏幕像素半径 = 米 / SCALE_M_PER_UNIT * zoom
            // Canvas 会自动计算切点，无需手动计算
            if (curr.radius && curr.radius > 0 && next) {
                const radiusPx = (curr.radius / SCALE_M_PER_UNIT) * zoom;
                const ns = toScreen(next.x, next.y);
                ctx.arcTo(cs.x, cs.y, ns.x, ns.y, radiusPx);
            } else {
                ctx.lineTo(cs.x, cs.y);
            }
        }

        // 确保路径到达最后一个节点
        const last = toScreen(nodes[nodes.length - 1].x, nodes[nodes.length - 1].y);
        ctx.lineTo(last.x, last.y);
    }

    // ─── 比例尺绘制 ──────────────────────────────────────────
    function drawScaleRuler(ctx: CanvasRenderingContext2D, zoom: number, W: number, H: number) {
        const { px, label } = niceScaleLength(zoom);
        const x = 20, y = H - 24;
        const barH = 6;

        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x - 4, y - barH - 10, px + 8, barH + 18);

        ctx.strokeStyle = '#aaa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - barH); ctx.lineTo(x, y);
        ctx.moveTo(x, y - barH / 2); ctx.lineTo(x + px, y - barH / 2);
        ctx.moveTo(x + px, y - barH); ctx.lineTo(x + px, y);
        ctx.stroke();

        ctx.fillStyle = '#ccc';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, x + px / 2, y + 10);
        ctx.textAlign = 'left';
    }

    // ─── 事件处理 ─────────────────────────────────────────────

    const getCanvasPos = (e: React.MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 1) { // 中键
            isPanning.current = true;
            lastMouse.current = { x: e.clientX, y: e.clientY };
            setCursor('grabbing');
            e.preventDefault();
            return;
        }
        if (e.button === 0 && e.altKey) { // Alt+左键 也可拖拽
            isPanning.current = true;
            lastMouse.current = { x: e.clientX, y: e.clientY };
            setCursor('grabbing');
            return;
        }
        if (e.button !== 0) return;

        const sp = getCanvasPos(e);
        const wp = toWorld(sp.x, sp.y);

        if (mode === 'pen') {
            setData(prev => ({
                ...prev,
                nodes: [...prev.nodes, { x: wp.x, y: wp.y, radius: defaultRadius }]
            }));
        } else if (mode === 'gantry') {
            if (data.nodes.length < 2) {
                alert('请先绘制路径，再放置 ETC 门架。');
                return;
            }
            const closest = closestPointOnPolyline(wp.x, wp.y, data.nodes);
            if (!closest) return;
            if (closest.dist * zoom > SNAP_THRESHOLD_PX * 3) {
                alert('请在路径附近点击以放置 ETC 门架。');
                return;
            }
            const newGantry = {
                id: `etc_${Date.now()}`,
                x: closest.x,
                y: closest.y,
                segmentIndex: closest.segmentIndex,
                t: closest.t,
                name: '' // 临时名称，排序后自动编号
            };
            setData(prev => ({
                ...prev,
                gantries: sortGantriesByMileage([...prev.gantries, newGantry])
            }));
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isPanning.current) {
            const dx = e.clientX - lastMouse.current.x;
            const dy = e.clientY - lastMouse.current.y;
            setPan(p => ({ x: p.x + dx, y: p.y + dy }));
            lastMouse.current = { x: e.clientX, y: e.clientY };
            return;
        }

        const sp = getCanvasPos(e);
        const wp = toWorld(sp.x, sp.y);
        setMouseWorld(wp);

        if (mode === 'gantry' && data.nodes.length >= 2) {
            const closest = closestPointOnPolyline(wp.x, wp.y, data.nodes);
            setSnapPreview(closest ? { x: closest.x, y: closest.y } : null);
        } else {
            setSnapPreview(null);
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if (e.button === 1 || isPanning.current) {
            isPanning.current = false;
            // 恢复光标
            if (mode === 'pen') setCursor('crosshair');
            else if (mode === 'gantry') setCursor('cell');
            else setCursor('default');
        }
    };

    // 滚轮缩放：使用原生事件监听器（passive: false）以支持 preventDefault
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const sp = {
                x: (e.clientX - rect.left - pan.x) / zoom,
                y: (e.clientY - rect.top - pan.y) / zoom,
            };
            const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
            const newZoom = Math.max(0.05, Math.min(20, zoom * factor));
            setPan(_p => ({
                x: e.clientX - rect.left - sp.x * newZoom,
                y: e.clientY - rect.top - sp.y * newZoom,
            }));
            setZoom(newZoom);
        };
        canvas.addEventListener('wheel', onWheel, { passive: false });
        return () => canvas.removeEventListener('wheel', onWheel);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [zoom, pan]);

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        if (mode === 'pen' && data.nodes.length > 0) {
            setData(prev => ({ ...prev, nodes: prev.nodes.slice(0, -1) }));
        }
    };

    const handleMouseLeave = () => {
        setMouseWorld(null);
        setSnapPreview(null);
    };

    // 根据 mode 更新光标
    useEffect(() => {
        if (!isPanning.current) {
            if (mode === 'pen') setCursor('crosshair');
            else if (mode === 'gantry') setCursor('cell');
            else setCursor('default');
        }
    }, [mode]);

    return (
        <div ref={containerRef} className="w-full h-full relative select-none">
            <canvas
                ref={canvasRef}
                className="w-full h-full"
                style={{ cursor }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onContextMenu={handleContextMenu}
            />
            {/* 操作提示 */}
            <div className="absolute top-3 right-3 text-[10px] text-white/30 pointer-events-none text-right space-y-0.5">
                {mode === 'pen' && (
                    <>
                        <p>左键：添加节点</p>
                        <p>右键：撤销上一节点</p>
                        <p>滚轮：缩放 | Alt+拖拽 / 中键：平移</p>
                    </>
                )}
                {mode === 'gantry' && (
                    <>
                        <p>点击路径附近：放置 ETC 门架（自动吸附）</p>
                        <p>滚轮：缩放 | Alt+拖拽 / 中键：平移</p>
                    </>
                )}
                {mode === 'select' && <p>滚轮：缩放 | Alt+拖拽 / 中键：平移</p>}
            </div>
        </div>
    );
}
