/**
 * 图片灯箱组件
 * 全屏放大预览图片，支持缩放、拖动、键盘导航
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';

interface ImageLightboxProps {
    isOpen: boolean;
    imageUrl: string;
    title: string;
    onClose: () => void;
    onDownload?: () => void;
    onFavorite?: () => void;
    isFavorited?: boolean;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
    isOpen,
    imageUrl,
    title,
    onClose,
    onDownload,
    onFavorite,
    isFavorited = false,
}) => {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    // 重置状态
    useEffect(() => {
        if (isOpen) {
            setScale(1);
            setPosition({ x: 0, y: 0 });
        }
    }, [isOpen, imageUrl]);

    // 键盘事件
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;

            switch (e.key) {
                case 'Escape':
                    onClose();
                    break;
                case '+':
                case '=':
                    setScale(s => Math.min(s + 0.25, 4));
                    break;
                case '-':
                    setScale(s => Math.max(s - 0.25, 0.5));
                    break;
                case '0':
                    setScale(1);
                    setPosition({ x: 0, y: 0 });
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // 滚轮缩放
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setScale(s => Math.min(Math.max(s + delta, 0.5), 4));
    }, []);

    // 拖动开始
    const handleMouseDown = (e: React.MouseEvent) => {
        if (scale > 1) {
            setIsDragging(true);
            setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
        }
    };

    // 拖动中
    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) {
            setPosition({
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y,
            });
        }
    };

    // 拖动结束
    const handleMouseUp = () => {
        setIsDragging(false);
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.9)' }}
            onClick={onClose}
        >
            {/* 顶部工具栏 */}
            <div
                className="absolute top-0 left-0 right-0 h-16 flex items-center justify-between px-6 bg-gradient-to-b from-black/80 to-transparent z-10"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-white text-lg font-medium">{title}</h2>
                <div className="flex items-center gap-3">
                    {/* 缩放控制 */}
                    <div className="flex items-center gap-2 bg-white/10 rounded-full px-3 py-1.5">
                        <button
                            onClick={() => setScale(s => Math.max(s - 0.25, 0.5))}
                            className="w-7 h-7 flex items-center justify-center text-white hover:bg-white/10 rounded-full transition-colors"
                        >
                            −
                        </button>
                        <span className="text-white text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
                        <button
                            onClick={() => setScale(s => Math.min(s + 0.25, 4))}
                            className="w-7 h-7 flex items-center justify-center text-white hover:bg-white/10 rounded-full transition-colors"
                        >
                            +
                        </button>
                    </div>

                    {/* 重置 */}
                    <button
                        onClick={() => { setScale(1); setPosition({ x: 0, y: 0 }); }}
                        className="w-9 h-9 flex items-center justify-center text-white hover:bg-white/10 rounded-full transition-colors"
                        title="重置 (0)"
                    >
                        ↺
                    </button>

                    {/* 收藏 */}
                    {onFavorite && (
                        <button
                            onClick={onFavorite}
                            className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${isFavorited ? 'bg-yellow-500/20 text-yellow-400' : 'text-white hover:bg-white/10'
                                }`}
                            title={isFavorited ? '取消收藏' : '收藏'}
                        >
                            {isFavorited ? '★' : '☆'}
                        </button>
                    )}

                    {/* 下载 */}
                    {onDownload && (
                        <button
                            onClick={onDownload}
                            className="w-9 h-9 flex items-center justify-center text-white hover:bg-white/10 rounded-full transition-colors"
                            title="下载"
                        >
                            ↓
                        </button>
                    )}

                    {/* 关闭 */}
                    <button
                        onClick={onClose}
                        className="w-9 h-9 flex items-center justify-center text-white hover:bg-white/10 rounded-full transition-colors"
                        title="关闭 (ESC)"
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* 图片容器 */}
            <div
                ref={containerRef}
                className="w-full h-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
                onClick={(e) => e.stopPropagation()}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <img
                    src={imageUrl}
                    alt={title}
                    className="max-w-full max-h-full object-contain select-none"
                    style={{
                        transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                        transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                    }}
                    draggable={false}
                />
            </div>

            {/* 底部提示 */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
                滚轮缩放 • 拖动平移 • ESC 关闭 • +/- 缩放 • 0 重置
            </div>
        </div>
    );
};
