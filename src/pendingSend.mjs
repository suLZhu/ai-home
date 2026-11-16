// Pure, serializable "pending send" state machine — a conversation queue, NOT a
// timed defer. A pending item is created while the assistant is still generating:
// the user's typed message is parked (not yet sent to the model) and auto-sent the
// moment the current generation for the same (assistant, conversation) finishes.
//
// This replaces the old 20-second timer deferred-send. Key differences:
//   - fires on generation-complete (driven by send()'s finally), not a countdown;
//   - at most ONE pending per scope; new content overwrites old;
//   - strongly bound to (assistantId, conversationId): never cross-talks;
//   - survives refresh / backgrounding via localStorage;
//   - on generation error the pending is kept as `needs_review` and is NOT
//     auto-sent (user must confirm), so a failing model never loops.
// No network or storage side effects live here; persistence is injected.

export const PENDING_STORAGE_KEY = 'ai-home.pendingSends.v1'
export const PENDING_VERSION = 1

/**
 * @typedef {Object} PendingItem
 * @property {number} version
 * @property {string} id
 * @property {string} assistantId
 * @property {string} conversationId
 * @property {string} text
 * @property {Array<{name?:string,type?:string,size?:number,dataUrl?:string,textContent?:string,preview?:string}>} attachments
 * @property {'pending'|'needs_review'} status
 * @property {number} createdAt
 * @property {number} updatedAt
 */

function randomId(now = Date.now()) {
  const c = (typeof globalThis !== 'undefined' && globalThis.crypto)
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return 'p_' + now + '_' + Math.random().toString(36).slice(2, 10)
}

// Stable per-(assistant, conversation) key. Throws on missing scope so callers
// can never silently enqueue into a global/undefined bucket.
export function pendingScopeKey(assistantId, conversationId) {
  if (!assistantId || !conversationId) throw new Error('Pending requires assistantId + conversationId')
  return JSON.stringify([assistantId, conversationId])
}

// Build a fresh pending item. `attachments` keep their dataUrl (so an image queued
// mid-generation is not lost); callers pass a stable `id` in tests.
export function makePending(text, attachments = [], opts = {}) {
  const { assistantId, conversationId, id = null, now = Date.now() } = opts
  if (!assistantId || !conversationId) throw new Error('Pending requires assistantId + conversationId')
  return {
    version: PENDING_VERSION,
    id: id || randomId(now),
    assistantId,
    conversationId,
    text: String(text),
    attachments: (attachments || []).map(a => ({
      name: a.name,
      type: a.type,
      size: a.size,
      dataUrl: a.dataUrl,
      textContent: a.textContent,
      preview: a.preview,
      assetId: a.assetId,
    })),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  }
}

// Insert/replace the single pending for an item's scope.
export function setPending(store, item) {
  if (!item || !item.assistantId || !item.conversationId) throw new Error('Pending item missing scope')
  const key = pendingScopeKey(item.assistantId, item.conversationId)
  return { ...(store || {}), [key]: item }
}

// Drop the pending for a scope (manual cancel / successful auto-send).
export function clearPending(store, assistantId, conversationId) {
  const key = pendingScopeKey(assistantId, conversationId)
  if (!store || !store[key]) return store || {}
  const next = { ...store }
  delete next[key]
  return next
}

// Overwrite the pending text for a scope (keeps id, attachments, idempotent).
export function patchPendingText(store, assistantId, conversationId, text) {
  const key = pendingScopeKey(assistantId, conversationId)
  const cur = store && store[key]
  if (!cur) return store || {}
  return { ...store, [key]: { ...cur, text: String(text), status: 'pending', updatedAt: Date.now() } }
}

// Mark a pending that failed to send: it must be user-confirmed before retrying,
// so it is never auto-fired again.
export function markNeedsReview(store, assistantId, conversationId) {
  const key = pendingScopeKey(assistantId, conversationId)
  const cur = store && store[key]
  if (!cur) return store || {}
  return { ...store, [key]: { ...cur, status: 'needs_review', updatedAt: Date.now() } }
}

// Validate & normalize a raw object from storage. Returns a clean PendingItem or null.
export function recoverPending(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (raw.version !== PENDING_VERSION) return null
  if (typeof raw.id !== 'string' || !raw.id) return null
  if (typeof raw.assistantId !== 'string' || !raw.assistantId) return null
  if (typeof raw.conversationId !== 'string' || !raw.conversationId) return null
  if (typeof raw.text !== 'string') return null
  if (!Array.isArray(raw.attachments)) return null
  if (raw.status !== 'pending' && raw.status !== 'needs_review') return null
  if (!Number.isFinite(raw.createdAt) || !Number.isFinite(raw.updatedAt)) return null
  const item = {
    version: PENDING_VERSION,
    id: raw.id,
    assistantId: raw.assistantId,
    conversationId: raw.conversationId,
    text: raw.text,
    attachments: raw.attachments.map(a => ({
      name: a && a.name,
      type: a && a.type,
      size: a && a.size,
      dataUrl: a && a.dataUrl,
      textContent: a && a.textContent,
      preview: a && a.preview,
      assetId: a && a.assetId,
    })),
    status: raw.status,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }
  // scope-key 一致性由 loadPendingSends/savePendingSends 在「key ↔ item」层面校验，
  // 这里只负责清洗字段；无 key 参数，不做重复/自比较的无效判断。
  return item
}

// Load all persisted pending items keyed by scope.
export function loadPendingSends(storage) {
  let raw
  try { raw = JSON.parse((storage && storage.getItem(PENDING_STORAGE_KEY)) || '{}') }
  catch { return {} }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const valid = {}
  for (const [key, value] of Object.entries(raw)) {
    const item = recoverPending(value)
    if (!item) continue
    if (pendingScopeKey(item.assistantId, item.conversationId) !== key) continue
    valid[key] = item
  }
  return valid
}

// Persist; best-effort — if storage is full the in-memory map is still returned.
export function savePendingSends(storage, store) {
  const sanitized = {}
  for (const [key, value] of Object.entries(store || {})) {
    const item = recoverPending(value)
    if (!item || pendingScopeKey(item.assistantId, item.conversationId) !== key) continue
    sanitized[key] = item
  }
  try { if (storage) storage.setItem(PENDING_STORAGE_KEY, JSON.stringify(sanitized)) } catch { /* keep in-memory */ }
  return sanitized
}
