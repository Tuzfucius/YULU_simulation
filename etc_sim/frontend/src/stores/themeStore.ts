/**
 * 主题管理 Store
 * 支持明亮模式和深色模式切换
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark';

interface ThemeStore {
    theme: Theme;
    toggleTheme: () => void;
    setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set) => ({
            theme: 'dark',
            toggleTheme: () =>
                set((state) => ({
                    theme: state.theme === 'light' ? 'dark' : 'light',
                })),
            setTheme: (theme) => set({ theme }),
        }),
        {
            name: 'etc-sim-theme',
        }
    )
);
