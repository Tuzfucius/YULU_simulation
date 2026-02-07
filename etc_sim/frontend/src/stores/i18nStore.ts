/**
 * 多语言管理 Store
 * 支持中文和英文切换
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { translations, type Lang } from '../locales';

interface I18nStore {
    lang: Lang;
    setLang: (lang: Lang) => void;
    t: (key: string) => string;
}

export const useI18nStore = create<I18nStore>()(
    persist(
        (set, get) => ({
            lang: 'zh',
            setLang: (lang) => set({ lang }),
            t: (key: string) => {
                const lang = get().lang;
                const keys = key.split('.');
                let value: any = translations[lang];

                for (const k of keys) {
                    value = value?.[k];
                    if (value === undefined) break;
                }

                return value || key;
            },
        }),
        {
            name: 'etc-sim-lang',
        }
    )
);
