export type ChatRoute = {
  routeId: string
  label: string
  endpoint: string
  chatUrl: string
  apiPath: string
  model: string
  apiKeys: string[]
}

export type RouteChatResult = {
  ok: boolean
  upstream?: Response
  routeId?: string
  routeLabel?: string
  report: {
    logicalId: string
    attempts: Array<{ routeId: string; label: string; status: number; ok: boolean; kind: string; retryable: boolean; reason: string }>
    usedRouteId: string
    usedRouteLabel: string
    failureReason: string
    startedAt: string
  }
  error?: string
  status?: number
  responseText?: string
}

export declare function normalizeChatRoutes(raw: unknown): ChatRoute[]
export declare function routeChatTarget(route: ChatRoute): string
export declare function runRouteChat(args: {
  routes?: unknown
  body?: Record<string, unknown>
  timeZone?: string
  signal?: AbortSignal | null
  fetchImpl?: typeof fetch
  maxAttempts?: number
  now?: Date
}): Promise<RouteChatResult>
