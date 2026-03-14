/**
 * 主题管理 Store
 * 支持 light / dark 两种主题切换
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ThemeId, THEMES } from '../themes';

const DEFAULT_THEME: ThemeId = 'dark';

function normalizeTheme(theme: string | undefined): ThemeId {
    return THEMES.some(item => item.id === theme) ? (theme as ThemeId) : DEFAULT_THEME;
}

interface ThemeStore {
    theme: ThemeId;
    toggleTheme: () => void;
    setTheme: (theme: ThemeId) => void;
}

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set, get) => ({
            theme: DEFAULT_THEME,
            toggleTheme: () => {
                const currentIdx = THEMES.findIndex(t => t.id === get().theme);
                const nextIdx = (currentIdx + 1) % THEMES.length;
                set({ theme: THEMES[nextIdx].id });
            },
            setTheme: (theme) => set({ theme: normalizeTheme(theme) }),
        }),
        {
            name: 'etc-sim-theme',
            merge: (persistedState, currentState) => {
                const persisted = persistedState as Partial<{ theme: string }> | undefined;
                return {
                    ...currentState,
                    theme: normalizeTheme(persisted?.theme),
                };
            },
        }
    )
);

// 鍏煎鏃у鍑猴紝鏂逛究宸叉湁浠ｇ爜鐩存帴寮曠敤 Theme 绫诲瀷
export type { ThemeId as Theme };

