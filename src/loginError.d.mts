export type LoginErrorInfo = {
  kind: 'region' | 'denied' | 'config' | 'network' | 'timeout' | 'generic' | 'friendly'
  title: string
  hint: string
  detail: string
}
export declare function formatLoginError(raw: unknown): LoginErrorInfo
