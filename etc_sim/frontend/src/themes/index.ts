export type ThemeId = 'light' | 'dark';

export interface ThemeMeta {
    id: ThemeId;
    label: string;
    labelEn: string;
    icon: string;
    description: string;
    descriptionEn: string;
}

export const THEMES: ThemeMeta[] = [
    {
        id: 'dark',
        label: '深色',
        labelEn: 'Dark',
        icon: '🌙',
        description: '默认深色主题',
        descriptionEn: 'Default dark theme',
    },
    {
        id: 'light',
        label: '浅色',
        labelEn: 'Light',
        icon: '☀️',
        description: '明亮浅色主题',
        descriptionEn: 'Bright light theme',
    },
];

export const getThemeMeta = (id: ThemeId): ThemeMeta =>
    THEMES.find(theme => theme.id === id) ?? THEMES[0];
