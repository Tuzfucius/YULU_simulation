/**
 * API 配置
 * 统一管理 API 基础地址，优先读取环境变量，默认走同源 `/api` 代理。
 */

const rawBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim();
const normalizedBaseUrl = rawBaseUrl.replace(/\/+$/, '');
const apiRoot = normalizedBaseUrl
    ? (normalizedBaseUrl.endsWith('/api') ? normalizedBaseUrl : `${normalizedBaseUrl}/api`)
    : '/api';

export const API = {
    BASE: apiRoot,
    WORKFLOWS: `${apiRoot}/workflows`,
    CODE: `${apiRoot}/code`,
} as const;
