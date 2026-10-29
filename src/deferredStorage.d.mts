import type { DeferredBatch } from './deferredSend.d.mts'

export const DEFERRED_STORAGE_KEY: string

export type DeferredStorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** scopeKey = JSON.stringify([assistantId, conversationId]) — one batch per scope. */
export function deferredScopeKey(assistantId: string, conversationId: string): string

export function loadDeferredBatches(storage: DeferredStorageLike): Record<string, DeferredBatch>

export function saveDeferredBatches(
  storage: DeferredStorageLike,
  batches: Record<string, DeferredBatch> | null | undefined,
): Record<string, DeferredBatch>
