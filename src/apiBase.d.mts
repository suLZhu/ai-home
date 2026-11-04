// 统一 API Base URL 机制的类型声明（对应 apiBase.mjs）。
export declare const API_BASE_STORAGE_KEY: string
export declare const SESSION_TOKEN_STORAGE_KEY: string
export declare function getSessionToken(): string
export declare function setSessionToken(token: unknown): void
export declare function clearSessionToken(): void
export declare function normalizeApiBase(raw: unknown): string
export declare function resolveApiBase(input: { override?: unknown; buildBase?: unknown }): string
export declare function apiUrl(path: unknown, base?: string): string
export declare function assetUrl(preview: unknown, base?: string): string
export declare function setApiBase(base: unknown): void
export declare function getApiBase(): string
// true = 未配置服务器地址，/api/* 由浏览器内 LocalBackend 应答（本地模式）。
export declare function isLocalMode(): boolean
export declare function apiFetch(path: unknown, init?: RequestInit, fetchImpl?: typeof fetch): Promise<Response>
