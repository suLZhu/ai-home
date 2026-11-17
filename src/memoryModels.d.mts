export type MemoryModelSlot = { vendorId: string; model: string }
export type MemoryModels = { organize: MemoryModelSlot; embed: MemoryModelSlot }
export type EmbeddingTarget = { endpoint: string; apiKey: string; model: string }

export const MEMORY_MODELS_KEY: string
export const EMPTY_MEMORY_MODELS: MemoryModels
export function normalizeMemoryModels(raw: unknown): MemoryModels
export function readMemoryModels(): MemoryModels
export function writeMemoryModels(next: MemoryModels): MemoryModels
export function embeddingTarget(vendors: any[], slot: MemoryModelSlot): EmbeddingTarget | null
export function embedText(target: EmbeddingTarget | null, input: string, fetchImpl?: typeof fetch): Promise<number[] | null>
export function cosine(a: unknown, b: unknown): number
