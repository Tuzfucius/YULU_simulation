/**
 * 主题注册表
 * 定义所有可用主题的元数据，新增主题只需在此添加记录
 */

export type ThemeId = 'light' | 'dark' | 'retro-tech' | 'ops-screen';

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
    {
        id: 'retro-tech',
        label: '复古科技',
        labelEn: 'Retro Tech',
        icon: '🔮',
        description: '赛博朋克科技风',
        descriptionEn: 'Cyberpunk retro-tech style',
    },
    {
        id: 'ops-screen',
        label: '指挥大屏',
        labelEn: 'Ops Screen',
        icon: '🖥️',
        description: '高速预警指挥大屏风格',
        descriptionEn: 'Highway operations screen theme',
    },
];

/** 按 id 查找主题元数据 */
export const getThemeMeta = (id: ThemeId): ThemeMeta =>
    THEMES.find(t => t.id === id) ?? THEMES[0];
