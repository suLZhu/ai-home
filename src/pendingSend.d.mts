export const PENDING_STORAGE_KEY: string
export const PENDING_VERSION: number

export type PendingStatus = 'pending' | 'needs_review'

export type PendingItem = {
  version: number
  id: string
  assistantId: string
  conversationId: string
  text: string
  attachments: Array<{ name?: string; type?: string; size?: number; dataUrl?: string; textContent?: string; preview?: string; assetId?: string }>
  status: PendingStatus
  createdAt: number
  updatedAt: number
}

export function pendingScopeKey(assistantId: string, conversationId: string): string
export function makePending(
  text: string,
  attachments?: Array<any>,
  opts?: { assistantId?: string; conversationId?: string; id?: string | null; now?: number },
): PendingItem
export function setPending(store: Record<string, PendingItem> | null | undefined, item: PendingItem): Record<string, PendingItem>
export function clearPending(store: Record<string, PendingItem> | null | undefined, assistantId: string, conversationId: string): Record<string, PendingItem>
export function patchPendingText(store: Record<string, PendingItem> | null | undefined, assistantId: string, conversationId: string, text: string): Record<string, PendingItem>
export function markNeedsReview(store: Record<string, PendingItem> | null | undefined, assistantId: string, conversationId: string): Record<string, PendingItem>
export function recoverPending(raw: unknown): PendingItem | null
export function loadPendingSends(storage: { getItem(k: string): string | null } | null | undefined): Record<string, PendingItem>
export function savePendingSends(storage: { setItem(k: string, v: string): void } | null | undefined, store: Record<string, PendingItem> | null | undefined): Record<string, PendingItem>
