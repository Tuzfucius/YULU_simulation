/**
 * 道路交通可视化组件
 * 提供实时的道路交通流展示
 */
import React, { useEffect, useRef } from 'react';
import { useSimStore } from '../stores/simStore';
import { useI18nStore } from '../stores/i18nStore';

export const RoadViewer: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { config, isRunning, isPaused, progress, turboMode } = useSimStore();
    const { t } = useI18nStore();

    // 动画引用
    const animationFrameRef = useRef<number>();
    const vehiclesRef = useRef<Array<{ x: number; y: number; speed: number; lane: number; type: number; color: string }>>([]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // 如果是极速模式且正在运行，停止渲染以节省算力
        if (turboMode && isRunning) {
            return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resizeCanvas = () => {
            if (canvas.parentElement) {
                canvas.width = canvas.parentElement.clientWidth;
                canvas.height = canvas.parentElement.clientHeight;
            }
        };

        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        // 车辆生成器
        const generateVehicles = () => {
            const count = Math.floor(config.numLanes * 2); // 保持一定数量的展示车辆
            if (vehiclesRef.current.length < count && Math.random() > 0.95) {
                const lane = Math.floor(Math.random() * config.numLanes);
                const type = Math.random();
                let color = '#D0BCFF'; // Car
                let speed = 2 + Math.random() * 2;

                if (type > 0.8) { // Truck
                    color = '#F2B8B5';
                    speed *= 0.8;
                } else if (type > 0.6) { // Bus
                    color = '#6DD58C';
                    speed *= 0.9;
                }

                vehiclesRef.current.push({
                    x: -50,
                    y: 0,
                    lane,
                    speed,
                    type,
                    color
                });
            }
        };

        const render = () => {
            if (!ctx) return;
            const width = canvas.width;
            const height = canvas.height;

            // 清空画布
            ctx.clearRect(0, 0, width, height);

            // 绘制背景
            // 实际上这里的背景色会由父容器决定，这里主要绘制道路纹理

            // 计算道路参数
            const roadPadding = 40;
            const availableHeight = height - roadPadding * 2;
            const laneHeight = availableHeight / config.numLanes;

            // 绘制车道
            for (let i = 0; i <= config.numLanes; i++) {
                const y = roadPadding + i * laneHeight;

                ctx.beginPath();
                if (i === 0 || i === config.numLanes) {
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([]);
                } else {
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([15, 15]);
                }
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }

            // 绘制车辆 (仅在运行或暂停时显示)
            if (isRunning || isPaused) {
                if (!isPaused) {
                    generateVehicles();
                    // 更新位置
                    vehiclesRef.current.forEach(v => {
                        v.x += v.speed * (width / 500); // 速度比例
                    });
                    // 移除超出屏幕的车辆
                    vehiclesRef.current = vehiclesRef.current.filter(v => v.x < width + 50);
                }

                // 绘制
                vehiclesRef.current.forEach(v => {
                    const y = roadPadding + v.lane * laneHeight + laneHeight / 2;

                    ctx.fillStyle = v.color;
                    ctx.shadowColor = v.color;
                    ctx.shadowBlur = 10;

                    // 简单的车辆形状
                    const vWidth = 30; // 长度
                    const vHeight = laneHeight * 0.4; // 宽度

                    ctx.beginPath();
                    ctx.roundRect(v.x, y - vHeight / 2, vWidth, vHeight, 4);
                    ctx.fill();

                    // 复位阴影
                    ctx.shadowBlur = 0;
                });
            } else {
                vehiclesRef.current = [];
            }

            // 绘制 ETC 门架示意
            const etcX = width * 0.7;
            ctx.strokeStyle = 'rgba(208, 188, 255, 0.3)';
            ctx.lineWidth = 4;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(etcX, roadPadding);
            ctx.lineTo(etcX, height - roadPadding);
            ctx.stroke();

            // ETC 文字
            ctx.fillStyle = 'rgba(208, 188, 255, 0.5)';
            ctx.font = '12px monospace';
            ctx.fillText('ETC GATE', etcX + 5, roadPadding - 5);

            animationFrameRef.current = requestAnimationFrame(render);
        };

        render();

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [config.numLanes, isRunning, isPaused, turboMode]);

    return (
        <div className="w-full h-full relative group">
            <canvas ref={canvasRef} className="w-full h-full block" />

            {/* 状态覆盖层 */}
            <div className="absolute top-4 left-4 pointer-events-none">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--text-tertiary)]'}`} />
                    <span className="text-xs font-mono text-[var(--text-secondary)]">
                        {isRunning
                            ? (isPaused ? t('simulation.paused') : `${t('simulation.running')} - ${(progress.progress || 0).toFixed(1)}%`)
                            : t('simulation.status')}
                    </span>
                </div>
            </div>

            {/* 说明 */}
            <div className="absolute bottom-4 right-4 text-xs text-[var(--text-tertiary)] opacity-50 group-hover:opacity-100 transition-opacity">
                Simulated View
            </div>
        </div>
    );
};
