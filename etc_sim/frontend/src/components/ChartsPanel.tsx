/**
 * 图表面板 - 静态图片展示
 * 从后端 API 获取 matplotlib 生成的图表图片
 * 支持收藏、下载、放大预览
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSimStore } from '../stores/simStore';
import { useI18nStore } from '../stores/i18nStore';
import { ImageLightbox } from './ImageLightbox';

interface ChartInfo {
    id: string;
    name: string;
    description: string;
    available: boolean;
    favorited: boolean;
    url: string | null;
}

// API 基础路径
const API_BASE = 'http://localhost:8000/api';

export const ChartsPanel: React.FC = () => {
    const { isRunning, isComplete } = useSimStore();
    const { t } = useI18nStore();
    const [charts, setCharts] = useState<ChartInfo[]>([]);
    const [favorites, setFavorites] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
    const [retryCount, setRetryCount] = useState(0);

    // 灯箱状态
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [selectedChart, setSelectedChart] = useState<ChartInfo | null>(null);

    const prevRunningRef = useRef(isRunning);

    // 使用 ref 追踪重试次数，避免闭包问题
    const retryCountRef = useRef(0);

    // 获取图表列表
    const fetchCharts = useCallback(async (isRetry = false) => {
        try {
            if (!isRetry) setLoading(true);

            const res = await fetch(`${API_BASE}/charts`);
            if (!res.ok) throw new Error('Failed to fetch charts');
            const data = await res.json();

            const fetchedCharts: ChartInfo[] = data.charts || [];
            setCharts(fetchedCharts);

            // 更新收藏状态
            const backendFavorites = fetchedCharts.filter(c => c.favorited).map(c => c.id);
            setFavorites(backendFavorites);
            setError(null);

            // 检查是否有生成的图表
            const anyAvailable = fetchedCharts.some(c => c.available);

            if (anyAvailable) {
                // 成功获取到图表
                if (retryCountRef.current > 0) {
                    useSimStore.getState().addLog({
                        timestamp: Date.now() / 1000,
                        level: 'INFO',
                        category: 'SYSTEM',
                        message: 'Charts generated successfully.',
                    });
                }
                retryCountRef.current = 0;
                setRetryCount(0);
                setLoading(false);
            } else if (isRetry && retryCountRef.current < 20) {
                // 继续重试
                retryCountRef.current += 1;
                setRetryCount(retryCountRef.current);

                // 安排下一次重试
                setTimeout(() => {
                    fetchCharts(true);
                }, 3000);
            } else if (retryCountRef.current >= 20) {
                setError(t('charts.generationTimeout'));
                setLoading(false);
            }

        } catch (e: any) {
            console.error('Fetch charts error:', e);
            if (isRetry && retryCountRef.current < 20) {
                retryCountRef.current += 1;
                setRetryCount(retryCountRef.current);
                setTimeout(() => fetchCharts(true), 3000);
            } else {
                setError(t('charts.waitingNetwork'));
                setLoading(false);
            }
        }
    }, []); // 无依赖，避免重建

    // 监听仿真状态，仿真结束时触发第一次获取
    useEffect(() => {
        if (prevRunningRef.current && !isRunning) {
            // 仿真刚结束，开始轮询
            retryCountRef.current = 0;
            setRetryCount(0);
            fetchCharts(true);
        }
        prevRunningRef.current = isRunning;
    }, [isRunning, fetchCharts]);

    // 组件挂载时获取一次
    useEffect(() => {
        if (!isRunning) {
            fetchCharts(false);
        }
    }, []);

    // 收藏/取消收藏
    const toggleFavorite = useCallback(async (chartId: string) => {
        const isFav = favorites.includes(chartId);
        try {
            const res = await fetch(`${API_BASE}/charts/${chartId}/favorite`, {
                method: isFav ? 'DELETE' : 'POST',
            });
            if (res.ok) {
                setFavorites(prev =>
                    isFav ? prev.filter(id => id !== chartId) : [...prev, chartId]
                );
            }
        } catch (e) {
            console.error('Toggle favorite error:', e);
        }
    }, [favorites]);

    // 下载图表
    const downloadChart = useCallback(async (chartId: string) => {
        const link = document.createElement('a');
        link.href = `${API_BASE}/charts/${chartId}/download`;
        link.download = `${chartId}.png`;
        link.click();
    }, []);

    // 打开灯箱
    const openLightbox = (chart: ChartInfo) => {
        setSelectedChart(chart);
        setLightboxOpen(true);
    };

    // 过滤图表
    const displayedCharts = showFavoritesOnly
        ? charts.filter(c => favorites.includes(c.id))
        : charts;

    // 运行中状态展示
    if (isRunning) {
        return (
            <div className="backdrop-blur-2xl bg-[var(--surface)]/60 rounded-3xl p-12 text-center border border-[var(--border)]/10">
                <div className="text-4xl mb-4 animate-pulse">⏳</div>
                <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">{t('charts.simulating')}</h3>
                <p className="text-[var(--text-tertiary)]">{t('charts.willGenerate')}</p>
            </div>
        );
    }

    if (error && charts.length === 0) {
        return (
            <div className="backdrop-blur-2xl bg-[var(--surface)]/60 rounded-3xl p-8 text-center border border-[var(--border)]/10">
                <div className="text-4xl mb-4 opacity-50">📊</div>
                <p className="text-[var(--text-tertiary)] mb-4">{t('charts.generationTimeout')}</p>
                <div className="flex gap-2 justify-center">
                    <button
                        onClick={() => fetchCharts(true)}
                        className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
                    >
                        {t('common.refresh')}
                    </button>
                    {retryCount > 0 && (
                        <span className="self-center text-sm text-[var(--text-tertiary)]">{t('common.retrying')} ({retryCount}/20)</span>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6" id="charts-panel">
            {/* 标题栏 */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--accent-light)] to-[var(--accent)] flex items-center justify-center">
                        <span className="text-xl">📊</span>
                    </div>
                    <div>
                        <h2 className="text-xl font-medium text-[var(--text-primary)]">{t('charts.title')}</h2>
                    </div>
                </div>

                {/* 筛选器 */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${showFavoritesOnly
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-[var(--surface-variant)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            }`}
                    >
                        <span>{showFavoritesOnly ? '★' : '☆'}</span>
                        <span>{showFavoritesOnly ? t('common.favorites') : t('common.all')}</span>
                        {favorites.length > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-yellow-500/30 text-xs">
                                {favorites.length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => fetchCharts(true)}
                        className={`w-10 h-10 flex items-center justify-center rounded-xl bg-[var(--surface-variant)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors ${loading ? 'animate-spin' : ''}`}
                        title={t('common.refresh')}
                    >
                        ↻
                    </button>
                </div>
            </div>


            {/* 顶部提示栏：生成中 */}
            {retryCount > 0 && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 mb-4 flex items-center justify-center gap-3 animate-pulse">
                    <span className="text-xl">⏳</span>
                    <span className="text-blue-200 font-medium">{t('charts.pleaseWait')} ({retryCount}/20)</span>
                </div>
            )}

            {/* 图表网格 */}
            {displayedCharts.length === 0 ? (
                <div className="backdrop-blur-2xl bg-[var(--surface)]/60 rounded-3xl p-12 text-center text-[var(--text-tertiary)]">
                    {t('charts.noCharts')}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {displayedCharts.map(chart => (
                        <div
                            key={chart.id}
                            className={`group backdrop-blur-2xl bg-[var(--surface)]/60 rounded-3xl overflow-hidden border border-[var(--border)]/10 transition-all hover:shadow-lg hover:scale-[1.02] ${!chart.available ? 'opacity-50' : ''
                                }`}
                        >
                            {/* 图片区域 */}
                            <div
                                className="relative aspect-[16/10] bg-[rgba(0,0,0,0.1)] cursor-pointer overflow-hidden border border-[var(--glass-border)] rounded-lg"
                                onClick={() => chart.available && openLightbox(chart)}
                            >
                                {chart.available ? (
                                    <>
                                        <img
                                            src={`${API_BASE}/charts/${chart.id}?t=${Date.now()}`} // 添加时间戳防止缓存
                                            alt={chart.name}
                                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                            loading="lazy"
                                            onError={(e) => {
                                                // 图片可能还没完全写完，或者404
                                                (e.target as HTMLImageElement).style.display = 'none';
                                                (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                            }}
                                        />
                                        {/* 悬浮操作层 */}
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                            <span className="text-white text-3xl opacity-0 group-hover:opacity-100 transition-opacity">
                                                🔍
                                            </span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[var(--text-tertiary)]">
                                        <div className="text-center">
                                            <div className="text-4xl mb-2 opacity-30">📊</div>
                                            <span className="text-sm">{t('charts.notGenerated')}</span>
                                        </div>
                                    </div>
                                )}

                                {/* 收藏标记 */}
                                {favorites.includes(chart.id) && (
                                    <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-yellow-500/90 flex items-center justify-center text-white shadow-lg z-10">
                                        ★
                                    </div>
                                )}
                            </div>

                            {/* 信息区域 */}
                            <div className="p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-medium text-[var(--text-primary)] truncate" title={chart.name}>
                                            {chart.name}
                                        </h3>
                                        <p className="text-sm text-[var(--text-tertiary)] truncate" title={chart.description}>
                                            {chart.description}
                                        </p>
                                    </div>

                                    {/* 操作按钮 */}
                                    {chart.available && (
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleFavorite(chart.id);
                                                }}
                                                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${favorites.includes(chart.id)
                                                    ? 'text-yellow-400 hover:bg-yellow-500/10'
                                                    : 'text-[var(--text-tertiary)] hover:text-yellow-400 hover:bg-[var(--surface-variant)]'
                                                    }`}
                                                title={favorites.includes(chart.id) ? t('common.removeFavorite') : t('common.addFavorite')}
                                            >
                                                {favorites.includes(chart.id) ? '★' : '☆'}
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    downloadChart(chart.id);
                                                }}
                                                className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--surface-variant)] transition-colors"
                                                title={t('common.download')}
                                            >
                                                ↓
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* 灯箱 */}
            {selectedChart && (
                <ImageLightbox
                    isOpen={lightboxOpen}
                    imageUrl={`${API_BASE}/charts/${selectedChart.id}?t=${Date.now()}`}
                    title={selectedChart.name}
                    onClose={() => setLightboxOpen(false)}
                    onDownload={() => downloadChart(selectedChart.id)}
                    onFavorite={() => toggleFavorite(selectedChart.id)}
                    isFavorited={favorites.includes(selectedChart.id)}
                />
            )}
        </div>
    );
};
