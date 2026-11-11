export type OAuthProfile = {
  channelId: string
  label: string
  flow: 'pkce' | 'device'
  authorizeUrl?: string
  tokenUrl?: string
  clientId?: string
  redirectUri?: string
  scope?: string
  loginUrl?: string
  deviceUrl?: string
  callbackHint: string
  note: string
}
export const OAUTH_PROFILES: Record<string, OAuthProfile>
export const GATEWAY_REFERENCES: { name: string; url: string }[]
export function oauthProfile(channelId: string): OAuthProfile | null
export function oauthLoginUrl(channelId: string): string
export function makePkce(): Promise<{ verifier: string; challenge: string; state: string }>
export function buildAuthorizeUrl(channelId: string, opts?: { codeChallenge?: string; state?: string; clientId?: string }): string
export function exchangeOAuthCode(args: { channelId: string; code: string; codeVerifier: string; state?: string; userAgent?: string; fetchImpl?: typeof fetch }): Promise<{ token: string; refreshToken: string; expiresIn: number }>
export function looksLikeToken(v: unknown): boolean
export function parseOAuthCallback(raw: unknown, expectedState?: string): { ok: boolean; error?: string; token?: string; code?: string; state?: string }
