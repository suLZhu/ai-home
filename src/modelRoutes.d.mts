export type RoutePricing = {
  inputPerM: number
  outputPerM: number
  cachedInputPerM: number
  perRequest: number
  currency: string
  rechargeDiscount: number
  promoPrice: number
  promoExpiresAt: string
}

export type RouteStats = {
  avgLatencyMs: number
  lastLatencyMs: number
  successCount: number
  failureCount: number
  lastUsedAt: string
  lastError: string
}

export type ModelRoute = {
  id: string
  logicalId: string
  label: string
  source: 'api' | 'subscription'
  vendorId: string
  keyId: string
  apiKey: string
  baseUrl: string
  apiPath: string
  chatUrl: string
  model: string
  enabled: boolean
  primary: boolean
  priority: number
  createdAt: string
  pricing: RoutePricing
  stats: RouteStats
}

export type RouteRequestParams = {
  routeId: string
  label: string
  source: 'api' | 'subscription'
  endpoint: string
  chatUrl: string
  apiPath: string
  apiKeys: string[]
  model: string
}

export declare const ROUTES_STORAGE_KEY: string
export declare const MAX_ROUTE_ATTEMPTS: number
export declare const MAX_ROUTES_PER_MODEL: number

export declare function logicalModelId(value: unknown): string
export declare function blankPricing(): RoutePricing
export declare function blankStats(): RouteStats
export declare function blankRoute(logicalId: string, patch?: Partial<ModelRoute>, id?: string): ModelRoute
export declare function normalizeRoute(raw: unknown): ModelRoute | null
export declare function normalizeRoutes(raw: unknown): ModelRoute[]
export declare function sanitizeRoutes(routes: unknown): Partial<ModelRoute>[]
export declare function routesForModel(routes: unknown, logicalId: string): ModelRoute[]
export declare function setPrimaryRoute(routes: ModelRoute[], logicalId: string, routeId: string): ModelRoute[]
export declare function planRouteOrder(routes: ModelRoute[], logicalId: string, options?: { fixedRouteId?: string; maxAttempts?: number }): ModelRoute[]
export declare function routeRequestParams(route: ModelRoute | null, vendors?: unknown, fallbackKeys?: string[]): RouteRequestParams | null
export declare function buildRoutePlan(args: {
  routes?: ModelRoute[]
  logicalId?: string
  vendors?: unknown
  fallbackKeys?: string[]
  binding?: { fixedRouteId?: string }
  maxAttempts?: number
}): RouteRequestParams[]
