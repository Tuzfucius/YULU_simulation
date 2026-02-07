/**
 * 多语言翻译导出
 */

import { zh } from './zh';
import { en } from './en';

export type Lang = 'zh' | 'en';

export const translations = {
    zh,
    en,
} as const;

export { zh, en };
