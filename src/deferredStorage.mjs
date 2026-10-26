// Deferred queue persistence is intentionally separate from chat history.
// Never store credentials or API configuration here.
import { recoverBatch } from './deferredSend.mjs'

export const DEFERRED_STORAGE_KEY = 'ai-home.deferredBatches.v1'

export function deferredScopeKey(assistantId, conversationId) {
  if (!assistantId || !conversationId) throw new Error('Missing deferred queue scope')
  return JSON.stringify([assistantId, conversationId])
}

export function loadDeferredBatches(storage) {
  let raw
  try { raw = JSON.parse(storage.getItem(DEFERRED_STORAGE_KEY) || '{}') }
  catch { return {} }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const valid = {}
  for (const [key, value] of Object.entries(raw)) {
    const batch = recoverBatch(value)
    if (!batch) continue
    if (deferredScopeKey(batch.assistantId, batch.conversationId) !== key) continue
    valid[key] = batch
  }
  return valid
}

export function saveDeferredBatches(storage, batches) {
  const sanitized = {}
  for (const [key, value] of Object.entries(batches || {})) {
    const batch = recoverBatch(value)
    if (!batch || deferredScopeKey(batch.assistantId, batch.conversationId) !== key) continue
    sanitized[key] = batch
  }
  storage.setItem(DEFERRED_STORAGE_KEY, JSON.stringify(sanitized))
  return sanitized
}
