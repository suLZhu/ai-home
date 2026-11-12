export type RouteAttempt = {
  routeId: string
  label: string
  status: number
  ok: boolean
  kind: string
  retryable: boolean
  reason: string
}

export type RouteReport = {
  logicalId: string
  attempts: RouteAttempt[]
  usedRouteId: string
  usedRouteLabel: string
  failureReason: string
  startedAt: string
}

export declare const MAX_ROUTE_ATTEMPTS: number

export declare function isRetryableRouteStatus(status: unknown): boolean
export declare function isAuthOrConfigStatus(status: unknown): boolean
export declare function isRetryableRouteError(error: unknown, aborted?: boolean): boolean
export declare function classifyRouteFailure(args?: { status?: number; error?: unknown; aborted?: boolean; responseText?: string }): { kind: string; retryable: boolean; reason: string }
export declare function shouldFallbackRoute(args?: {
  status?: number
  error?: unknown
  aborted?: boolean
  responseText?: string
  streamStarted?: boolean
  attempt?: number
  maxAttempts?: number
  remainingRoutes?: number
}): boolean
export declare function createRouteReport(logicalId?: string): RouteReport
export declare function recordRouteAttempt(report: RouteReport, args?: { routeId?: string; label?: string; status?: number; error?: unknown; aborted?: boolean; responseText?: string; ok?: boolean }): RouteReport
export declare function finishRouteReport(report: RouteReport, args?: { usedRouteId?: string; usedRouteLabel?: string; failureReason?: string }): RouteReport
export declare function summarizeRouteReport(report: RouteReport | null): string
