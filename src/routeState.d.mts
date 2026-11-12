import type { ModelRoute } from './modelRoutes.d.mts'

export type RouteState = {
  routes: ModelRoute[]
  active: Record<string, string>
  fixed: Record<string, string>
}

export declare const ROUTE_STATE_KEY: string
export declare const ROUTES_STORAGE_KEY: string

export declare function normalizeRouteState(raw: unknown): RouteState
export declare function activeLogicalId(state: unknown, person: string, fallbackModelId?: string): string
export declare function fixedRouteId(state: unknown, person: string): string
export declare function selectLogicalModel(state: RouteState, person: string, logicalId: string): RouteState
export declare function setFixedRoute(state: RouteState, person: string, routeId: string): RouteState
export declare function addRoute(state: RouteState, logicalId: string, patch?: Partial<ModelRoute>, id?: string): RouteState
export declare function updateRoute(state: RouteState, routeId: string, patch: Partial<ModelRoute>): RouteState
export declare function removeRoute(state: RouteState, routeId: string): RouteState
export declare function primaryRoute(state: RouteState, logicalId: string, routeId: string): RouteState
export declare function exportRouteState(state: RouteState): Omit<RouteState, 'routes'> & { routes: Partial<ModelRoute>[] }
