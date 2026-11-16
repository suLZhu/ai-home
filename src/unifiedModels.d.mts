import type { ModelRoute } from './modelRoutes.d.mts'

export type UnifiedModel = {
  id: string
  name: string
  model: string
  profileIds: string[]
  primaryProfileId: string
  vendorIds: string[]
  vendorNames: string[]
  sources: ('api' | 'subscription')[]
  endpoint: string
  routeCount: number
  implicitRouteCount: number
  hasExplicitRoutes: boolean
  isSubscription: boolean
  isApi: boolean
  isMultiSource: boolean
  routes: ModelRoute[]
}

export declare const CATALOG_FILTERS: string[]

export declare function buildModelCatalog(args?: {
  profiles?: unknown
  vendors?: unknown
  routes?: unknown
  subscriptionVendorIds?: unknown
}): UnifiedModel[]
export declare function filterCatalog(catalog: unknown, args?: { filter?: string; query?: string; favorites?: string[] }): UnifiedModel[]
export declare function profileIdForCatalogEntry(entry: unknown): string
export declare function catalogEntryById(catalog: unknown, id: string): UnifiedModel | null
