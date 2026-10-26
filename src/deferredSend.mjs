// Pure, serializable deferred-send state machine. No network or storage side effects.
// A batch is scoped to an exact assistant + conversation pair.
export const DEFAULT_DEFER_MS = 20_000
export const DEFERRED_BATCH_VERSION = 1

export function queueMessage(batch, { assistantId, conversationId, message, now = Date.now(), delayMs = DEFAULT_DEFER_MS }) {
  if (!assistantId || !conversationId || !message?.id) throw new Error('Deferred message requires stable IDs')
  if (!Number.isFinite(now) || !Number.isFinite(delayMs) || delayMs < 0) throw new Error('Invalid deadline')
  if (batch && (batch.assistantId !== assistantId || batch.conversationId !== conversationId)) {
    throw new Error('Cannot mix deferred messages from different conversations')
  }
  if (batch && batch.status !== 'pending') throw new Error('Cannot append to a non-pending batch')
  if (batch?.messages.some(item => item.id === message.id)) return batch
  return {
    version: DEFERRED_BATCH_VERSION,
    id: batch?.id ?? crypto.randomUUID(),
    assistantId,
    conversationId,
    messages: [...(batch?.messages ?? []), message],
    dueAt: now + delayMs,
    status: 'pending',
  }
}

export function isDue(batch, now = Date.now()) {
  return !!batch && batch.status === 'pending' && now >= batch.dueAt
}

export function remainingMs(batch, now = Date.now()) {
  return batch?.status === 'pending' ? Math.max(0, batch.dueAt - now) : 0
}

export function removeQueuedMessage(batch, messageId) {
  if (!batch || batch.status !== 'pending') return batch
  const messages = batch.messages.filter(item => item.id !== messageId)
  return messages.length ? { ...batch, messages } : null
}

export function markSending(batch) {
  if (!batch || batch.status !== 'pending') throw new Error('Batch not pending')
  return { ...batch, status: 'sending' }
}

// An interrupted request must not be silently retried: the upstream may already
// have received it. Require an explicit reconciliation/confirmation before retry.
export function recoverBatch(raw) {
  if (!raw || raw.version !== DEFERRED_BATCH_VERSION ||
      typeof raw.id !== 'string' || !raw.id ||
      typeof raw.assistantId !== 'string' || !raw.assistantId ||
      typeof raw.conversationId !== 'string' || !raw.conversationId ||
      !Array.isArray(raw.messages) || raw.messages.length === 0 ||
      !raw.messages.every(m => m && typeof m.id === 'string' && m.id) ||
      !Number.isFinite(raw.dueAt) ||
      !['pending', 'sending', 'needs_review'].includes(raw.status)) return null
  const ids = raw.messages.map(m => m.id)
  if (new Set(ids).size !== ids.length) return null
  return {
    version: DEFERRED_BATCH_VERSION,
    id: raw.id,
    assistantId: raw.assistantId,
    conversationId: raw.conversationId,
    messages: raw.messages,
    dueAt: raw.dueAt,
    status: raw.status === 'sending' ? 'needs_review' : raw.status,
  }
}
