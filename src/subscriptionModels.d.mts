export type ModelState = { available: string[]; picked: string[] | null }

export declare const SUBSCRIPTION_MODEL_CANDIDATES: Record<string, string[]>
export declare function subscriptionModelCandidates(channelId?: string): string[]
export declare function normalizeModelIds(values: unknown, limit?: number): string[]
export declare function mergeAvailableModels(fetched?: unknown, channelId?: string): string[]
export declare function buildSubscriptionModels(
  existing: unknown,
  available: unknown,
  picked?: string[] | null,
): { id: string; name: string; selected: boolean; source: string }[]
export declare function applySubscriptionModels(vendors: unknown, vendorId: string, models: unknown): any[]
export declare function clearSubscriptionModels(vendors: unknown, vendorId: string): any[]
export declare function pickedModelIds(vendor: unknown): string[]
