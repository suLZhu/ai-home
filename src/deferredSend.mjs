// Pure, serializable deferred-send state machine. No network or storage side effects.
// A batch is scoped to an exact assistant + conversation pair.
export const DEFAULT_DEFER_MS = 20_000

export function queueMessage(batch, { assistantId, conversationId, message, now = Date.now(), delayMs = DEFAULT_DEFER_MS }) {
  if (!assistantId || !conversationId || !message?.id) throw new Error('Deferred message requires stable IDs')
  if (!Number.isFinite(now) || !Number.isFinite(delayMs) || delayMs < 0) throw new Error('Invalid deadline')
  if (batch && (batch.assistantId !== assistantId || batch.conversationId !== conversationId)) {
    throw new Error('Cannot mix deferred messages from different conversations')
  }
  if (batch?.messages.some(item => item.id === message.id)) return batch
  return {
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

export function removeQueuedMessage(batch, messageId) {
  if (!batch || batch.status !== 'pending') return batch
  const messages = batch.messages.filter(item => item.id !== messageId)
  return messages.length ? { ...batch, messages } : null
}

export function markSending(batch) {
  if (!batch || batch.status !== 'pending') throw new Error('Batch not pending')
  return { ...batch, status: 'sending' }
}
