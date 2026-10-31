// 模型请求诊断纯函数层的类型声明（对应 requestDiag.mjs）。
export interface DiagMessage {
  role: string
  content?: unknown
  tool_calls?: Array<{ id?: string; type?: string; function?: { name?: string; arguments?: string } }>
  tool_call_id?: string
}
export interface DiagSnapshot {
  id: string
  at: string
  assistantId: string
  conversationId: string
  trigger: string
  round: number
  provider: string
  model: string
  endpoint: string
  stream?: boolean
  messagesTotal: number
  roles: Record<string, number>
  messages: DiagMessage[]
  serverInjects: Array<{ role: string; note: string }>
  tools: { count: number; names: string[]; toolChoice?: unknown }
  params: Record<string, unknown>
  requestChars: number
  historyTrimmed: boolean
  historyBefore?: number
  historyAfter?: number
  raw: unknown
  memoryNote?: string
}
export declare const DIAG_STORAGE_KEY: string
export declare const MAX_DIAG_LOGS: number
export declare function redactEndpoint(raw: string): string
export declare function omittedSize(len: number): string
export declare function redactDataUrl(url: string): string
export declare function clipText(text: unknown, max?: number): string
export declare function sanitizeMessage(m: unknown): DiagMessage
export declare function sanitizeMessages(messages: unknown): DiagMessage[]
export declare function summarizeMessages(messages: unknown): { total: number; roles: Record<string, number> }
export declare function extractParameters(requestBody: unknown): Record<string, unknown>
export declare function extractTools(requestBody: unknown): { count: number; names: string[]; toolChoice?: unknown }
export declare function redactPayload(value: unknown, depth?: number): unknown
export declare function buildDiagSnapshot(input: {
  requestBody?: unknown
  assistantId?: string
  conversationId?: string
  trigger?: string
  round?: number
  provider?: string
  endpoint?: string
  historyTrimmed?: boolean
  historyBefore?: number
  historyAfter?: number
  memoryNote?: string
  requestChars?: number
}): DiagSnapshot
export declare function appendDiagLog(list: DiagSnapshot[] | null | undefined, snapshot: DiagSnapshot): DiagSnapshot[]
export declare function loadDiagLogs(storage: { getItem(key: string): string | null }): DiagSnapshot[]
export declare function saveDiagLogs(storage: { setItem(key: string, value: string): void }, logs: DiagSnapshot[]): void
export declare function formatDiagSummary(s: DiagSnapshot | null | undefined): string
