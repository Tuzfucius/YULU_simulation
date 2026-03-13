/**
 * 主题切换 Hook
 * 支持 light / dark / retro-tech 多主题切换，持久化到 localStorage
 */

import { useEffect } from 'react';
import { ThemeId, THEMES } from '../themes';
import { useThemeStore } from '../stores/themeStore';

export const useTheme = () => {
    const { theme, setTheme, toggleTheme } = useThemeStore();

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    return { theme, toggleTheme, setTheme, themes: THEMES };
};

export type { ThemeId };
