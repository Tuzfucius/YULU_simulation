/**
 * 主题管理 Store
 * 支持 light / dark / retro-tech 三种主题切换
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ThemeId, THEMES } from '../themes';

interface ThemeStore {
    theme: ThemeId;
    toggleTheme: () => void;
    setTheme: (theme: ThemeId) => void;
}

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set, get) => ({
            theme: 'dark',
            toggleTheme: () => {
                const currentIdx = THEMES.findIndex(t => t.id === get().theme);
                const nextIdx = (currentIdx + 1) % THEMES.length;
                set({ theme: THEMES[nextIdx].id });
            },
            setTheme: (theme) => set({ theme }),
        }),
        {
            name: 'etc-sim-theme',
        }
    )
);

// 兼容旧导出，方便已有代码直接引用 Theme 类型
export type { ThemeId as Theme };
