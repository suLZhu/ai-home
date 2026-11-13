export declare function formatDuration(ms: unknown): string

export type TokenRow = { label: string; value: string | number }
export type TokenSummary = {
  total: number
  label: string
  rows: TokenRow[]
  hasCache: boolean
}
export declare function summarizeTokenUsage(usage: unknown): TokenSummary

export declare function summarizeToolResult(resultSummary: unknown, status: string, errorMessage?: string): string

export type ToolCardItem = {
  key: string
  label: string
  outcome: string
  status: string
  statusLabel: string
  durationMs?: number
  detail: {
    toolName: string
    arguments: unknown
    resultSummary: unknown
    errorMessage: string
    errorCode: string
    serverName: string
    startedAt: string
    finishedAt: string
    durationMs?: number
  }
}
export type ToolCardGroup = {
  total: number
  succeeded: number
  failed: number
  active: number
  icon: string
  label: string
  items: ToolCardItem[]
}
export declare function groupToolCalls(calls: unknown): ToolCardGroup

export declare function needsChineseTranslation(text: unknown): boolean
export declare function buildTranslationMessages(text: unknown): Array<{ role: 'system' | 'user'; content: string }>
