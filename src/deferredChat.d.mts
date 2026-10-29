import type { DeferredBatch } from './deferredSend.d.mts'

export function selectDueBatch(
  batches: Record<string, DeferredBatch> | null | undefined,
  now?: number,
): string | null

export function queuedIdSet(batch: DeferredBatch | null | undefined): Set<string>

export function mergeQueuedForRequest(
  batch: DeferredBatch | null | undefined,
  conversationMessages: Array<{ id?: string; content?: string; attachments?: Array<Record<string, unknown>> }> | null | undefined,
): { text: string; attachments: Array<Record<string, unknown>> }

export function removeMessagesByIds<T extends { id?: string }>(
  messages: T[] | null | undefined,
  ids: Set<string> | string[],
): T[]
