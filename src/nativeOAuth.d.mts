export type OAuthLoginConfig = {
  channelId: string
  url: string
  callbackPrefixes: string[]
  state: string
  tokenUrl: string
  tokenBody: Record<string, string>
  tokenHeaders: Record<string, string>
}
export type NativeLoginResult = { token: string; refreshToken: string; expiresIn: number }
export function nativeOAuthAvailable(): boolean
export function startOAuthLogin(config: OAuthLoginConfig): Promise<NativeLoginResult>
