/**
 * ECharts theme palette helpers.
 */

import type { ThemeId } from '../themes';

export interface EChartsThemeColors {
    primary: string;
    secondary: string;
    tertiary: string;
    warning: string;
    danger: string;
    background: string;
    surface: string;
    textMuted: string;
    border: string;
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

export const getEChartsTheme = (themeId: ThemeId): EChartsThemeColors => {
    switch (themeId) {
        case 'light':
            return LIGHT_COLORS;
        default:
            return DARK_COLORS;
    }
};

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
            textStyle: { color: undefined },
        },
    };
};
