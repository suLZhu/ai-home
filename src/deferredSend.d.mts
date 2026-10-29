export const DEFAULT_DEFER_MS: number
export const DEFERRED_BATCH_VERSION: number

export type DeferredQueuedMessage = {
  id: string
  content: string
  attachments?: Array<Record<string, unknown>>
}

export type DeferredBatchStatus = 'pending' | 'sending' | 'needs_review'

export type DeferredBatch = {
  version: number
  id: string
  assistantId: string
  conversationId: string
  messages: DeferredQueuedMessage[]
  dueAt: number
  status: DeferredBatchStatus
}

export function queueMessage(
  batch: DeferredBatch | null | undefined,
  args: {
    assistantId: string
    conversationId: string
    message: { id: string; content?: string; attachments?: Array<Record<string, unknown>> }
    now?: number
    delayMs?: number
  },
): DeferredBatch

export function isDue(batch: DeferredBatch | null | undefined, now?: number): boolean

export function remainingMs(batch: DeferredBatch | null | undefined, now?: number): number

export function removeQueuedMessage(
  batch: DeferredBatch | null | undefined,
  messageId: string,
): DeferredBatch | null

export function markSending(batch: DeferredBatch | null | undefined): DeferredBatch

export function recoverBatch(raw: unknown): DeferredBatch | null
