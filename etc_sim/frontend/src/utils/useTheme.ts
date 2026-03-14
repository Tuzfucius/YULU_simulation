/**
 * Theme switch hook.
 * Supports light / dark and persists to localStorage.
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
