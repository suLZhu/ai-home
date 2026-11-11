export type ModelProfile = {
  id: string
  name: string
  endpoint: string
  model: string
  vendor?: string
  vendorId?: string
  inputPrice: string
  outputPrice: string
  cachedInputPrice: string
  usdToCny: string
}

export type PersonBinding = {
  modelProfileId: string
  mcpIds: string[] | null
  keyId: string
}

export type ChatPool = {
  worldIds: string[] | null
  mcpIds: string[] | null
}

export type ModelConfigLike = {
  endpoint: string
  model: string
  inputPrice?: string
  outputPrice?: string
  cachedInputPrice?: string
  usdToCny?: string
}

export type McpConnectionLike = { id: string; name: string; enabled?: boolean; [key: string]: unknown }
export type WorldEntryLike = { id: string; boundCharacters?: string[]; [key: string]: unknown }

export declare function emptyBinding(): PersonBinding
export declare function normalizePool(raw: unknown): ChatPool
export declare function isInPool(pool: ChatPool | null | undefined, kind: 'worldIds' | 'mcpIds', id: string, allIds?: string[]): boolean
export declare function togglePool(pool: ChatPool | null | undefined, kind: 'worldIds' | 'mcpIds', id: string, checked: boolean, allIds?: string[]): ChatPool
export declare function poolLabel(index: number): string
export declare function normalizeProfiles(raw: unknown): ModelProfile[]
export declare function normalizeBindings(raw: unknown, people: string[]): Record<string, PersonBinding>
export declare function resolveModelConfig(profileId: string, profiles: unknown, fallback: ModelConfigLike): ModelConfigLike
export declare function resolveMcpConnections(connections: McpConnectionLike[] | null | undefined, binding: PersonBinding | null | undefined): McpConnectionLike[]
export declare function isWorldEntryBound(entry: WorldEntryLike | null | undefined, person: string): boolean
export declare function toggleWorldEntryBinding<T extends WorldEntryLike>(entries: T[], person: string, entryId: string, checked: boolean): T[]
export declare function toggleMcpId(binding: PersonBinding | null | undefined, connectionId: string, checked: boolean, allIds?: string[]): PersonBinding
