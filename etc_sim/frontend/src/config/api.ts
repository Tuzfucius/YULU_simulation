/**
 * API 配置
 * 统一管理 API 基础地址，从环境变量读取，避免硬编码
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const API = {
    /** API 根路径 */
    BASE: `${BASE_URL}/api`,
    /** 工作流 API */
    WORKFLOWS: `${BASE_URL}/api/workflows`,
    /** 代码执行 API */
    CODE: `${BASE_URL}/api/code`,
} as const;
