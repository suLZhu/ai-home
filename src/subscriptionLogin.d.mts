export const DEFAULT_LOGIN_PATH: string
export const DEFAULT_TOKEN_PATH: string
export declare function subscriptionSiteRoot(endpoint: string): string
export declare function subscriptionLoginUrl(endpoint: string, loginPath?: string): string
export declare function subscriptionTokenUrl(endpoint: string, tokenPath?: string): string
export declare function extractAccessToken(payload: unknown, headers?: unknown): { token: string; source: string } | null
export declare function performSubscriptionLogin(options: {
  endpoint: string
  loginPath?: string
  tokenPath?: string
  username: string
  password: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): Promise<{ token: string; source: string; loginUrl: string; username: string }>
