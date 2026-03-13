/**
 * ECharts 主题配色工具
 * 根据当前主题 ID 返回匹配的 ECharts 颜色配置，
 * 各图表组件引入此工具，确保配色随主题切换自动更新。
 */

import type { ThemeId } from '../themes';

/** ECharts 通用颜色配置 */
export interface EChartsThemeColors {
    /** 主色（线条、柱状图等主要数据颜色）*/
    primary: string;
    /** 辅助色 1 */
    secondary: string;
    /** 辅助色 2 */
    tertiary: string;
    /** 警告/异常色 */
    warning: string;
    /** 危险色 */
    danger: string;
    /** 背景色 */
    background: string;
    /** 表面色（grid 背景等）*/
    surface: string;
    /** 次要文字色 */
    textMuted: string;
    /** 边框 / 分割线色 */
    border: string;
    /** 调色板（多系列时按序取色）*/
    palette: string[];
}

const DARK_COLORS: EChartsThemeColors = {
    primary: '#A8C7FA',
    secondary: '#D0BCFF',
    tertiary: '#6DD58C',
    warning: '#FFB74D',
    danger: '#F2B8B5',
    background: '#131314',
    surface: '#1E1F20',
    textMuted: '#8E918F',
    border: 'rgba(255,255,255,0.08)',
    palette: ['#A8C7FA', '#D0BCFF', '#6DD58C', '#FFB74D', '#F2B8B5', '#4DD0E1', '#CE93D8'],
};

const LIGHT_COLORS: EChartsThemeColors = {
    primary: '#1A73E8',
    secondary: '#7C4DFF',
    tertiary: '#0F9D58',
    warning: '#F9A825',
    danger: '#D93025',
    background: '#F8F9FA',
    surface: '#FFFFFF',
    textMuted: '#9AA0A6',
    border: 'rgba(0,0,0,0.08)',
    palette: ['#1A73E8', '#7C4DFF', '#0F9D58', '#F9A825', '#D93025', '#0097A7', '#9C27B0'],
};

const RETRO_TECH_COLORS: EChartsThemeColors = {
    primary: '#00d4ff',
    secondary: '#7b68ee',
    tertiary: '#39e75f',
    warning: '#ffaa33',
    danger: '#ff4455',
    background: '#080d1a',
    surface: '#0c1829',
    textMuted: '#3a6880',
    border: 'rgba(0,212,255,0.15)',
    palette: ['#00d4ff', '#7b68ee', '#39e75f', '#ffaa33', '#ff4455', '#00fff0', '#ff00ff'],
};

/** 根据主题 ID 获取 ECharts 颜色配置 */
export const getEChartsTheme = (themeId: ThemeId): EChartsThemeColors => {
    switch (themeId) {
        case 'light': return LIGHT_COLORS;
        case 'retro-tech': return RETRO_TECH_COLORS;
        default: return DARK_COLORS;
    }
};

/** 生成 ECharts 通用 grid/axis 配置（基于当前主题）*/
export const getEChartsBaseOption = (themeId: ThemeId) => {
    const c = getEChartsTheme(themeId);
    return {
        backgroundColor: 'transparent',
        color: c.palette,
        textStyle: { color: c.textMuted },
        grid: {
            borderColor: c.border,
        },
        xAxis: {
            axisLine: { lineStyle: { color: c.border } },
            axisTick: { lineStyle: { color: c.border } },
            axisLabel: { color: c.textMuted },
            splitLine: { lineStyle: { color: c.border } },
        },
        yAxis: {
            axisLine: { lineStyle: { color: c.border } },
            axisTick: { lineStyle: { color: c.border } },
            axisLabel: { color: c.textMuted },
            splitLine: { lineStyle: { color: c.border } },
        },
        legend: {
            textStyle: { color: c.textMuted },
        },
        tooltip: {
            backgroundColor: c.surface,
            borderColor: c.border,
            textStyle: { color: themeId === 'retro-tech' ? '#d8f0ff' : undefined },
        },
    };
};
