// Orchestration helpers that bridge the pure deferred-send state machine with the
// chat UI. Pure functions only — no React, no network, no storage side effects.
import { isDue } from './deferredSend.mjs'

// Among persisted batches, pick the one that should flush next: only 'pending'
// batches that are due qualify (a 'sending' batch must never be double-fired and a
// 'needs_review' batch must never be retried without explicit user confirmation).
// Ties and simultaneous dues resolve to the earliest deadline first.
export function selectDueBatch(batches, now = Date.now()) {
  let bestKey = null
  let bestDueAt = Infinity
  for (const [key, batch] of Object.entries(batches || {})) {
    if (!isDue(batch, now)) continue
    if (batch.dueAt < bestDueAt) { bestKey = key; bestDueAt = batch.dueAt }
  }
  return bestKey
}

// The IDs of messages still held in a batch, for UI chips and history filtering.
export function queuedIdSet(batch) {
  return new Set((batch?.messages || []).map(m => m.id))
}

// Merge a batch's queued messages into ONE model-request payload.
// Displayed chat messages are the source of truth for attachments: image dataURLs
// are intentionally not duplicated into the batch (localStorage weight), so the
// rendered message's preview (a data: URL) is restored as dataUrl here.
// Conversation messages are matched by id; a missing one (e.g. deleted) falls back
// to the batch record so the text is never silently dropped.
export function mergeQueuedForRequest(batch, conversationMessages) {
  const texts = []
  const attachments = []
  for (const item of batch?.messages || []) {
    const shown = (conversationMessages || []).find(m => m && m.id === item.id)
    texts.push(String(shown?.content ?? item.content ?? ''))
    for (const a of (shown?.attachments ?? item.attachments ?? [])) {
      if (!a) continue
      const preview = typeof a.preview === 'string' ? a.preview : ''
      attachments.push({ ...a, dataUrl: a.dataUrl || (preview.startsWith('data:') ? preview : undefined) })
    }
  }
  return { text: texts.filter(Boolean).join('\n\n'), attachments }
}

// Cancel semantics: the queued messages were never accepted by the model, so they
// must leave the conversation history too — otherwise they would read as sent.
export function removeMessagesByIds(messages, ids) {
  const drop = ids instanceof Set ? ids : new Set(ids || [])
  return (messages || []).filter(m => !(m && m.id && drop.has(m.id)))
}
