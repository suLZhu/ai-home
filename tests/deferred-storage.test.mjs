import test from 'node:test'
import assert from 'node:assert/strict'
import { queueMessage, markSending } from '../src/deferredSend.mjs'
import { deferredScopeKey, loadDeferredBatches, saveDeferredBatches, DEFERRED_STORAGE_KEY } from '../src/deferredStorage.mjs'

function storage() {
  const map = new Map()
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) }
}
test('queues persist separately for each assistant and conversation', () => {
  const s = storage()
  const a = queueMessage(null, { assistantId: 'assistant-a', conversationId: 'chat-1', message: { id: 'a' }, now: 1 })
  const b = queueMessage(null, { assistantId: 'assistant-b', conversationId: 'chat-1', message: { id: 'b' }, now: 2 })
  const keyA = deferredScopeKey(a.assistantId, a.conversationId)
  const keyB = deferredScopeKey(b.assistantId, b.conversationId)
  saveDeferredBatches(s, { [keyA]: a, [keyB]: b })
  const loaded = loadDeferredBatches(s)
  assert.deepEqual(Object.keys(loaded).sort(), [keyA, keyB].sort())
  assert.equal(loaded[keyA].messages[0].id, 'a')
  assert.equal(loaded[keyB].messages[0].id, 'b')
})
test('interrupted sends recover as needs_review', () => {
  const s = storage()
  const a = queueMessage(null, { assistantId: 'assistant-a', conversationId: 'chat-1', message: { id: 'a' }, now: 1 })
  const key = deferredScopeKey(a.assistantId, a.conversationId)
  saveDeferredBatches(s, { [key]: markSending(a) })
  assert.equal(loadDeferredBatches(s)[key].status, 'needs_review')
})
test('malformed or scope-swapped storage is rejected', () => {
  const s = storage()
  s.setItem(DEFERRED_STORAGE_KEY, '{broken')
  assert.deepEqual(loadDeferredBatches(s), {})
  const a = queueMessage(null, { assistantId: 'assistant-a', conversationId: 'chat-1', message: { id: 'a' }, now: 1 })
  s.setItem(DEFERRED_STORAGE_KEY, JSON.stringify({ [deferredScopeKey('assistant-b', 'chat-1')]: a }))
  assert.deepEqual(loadDeferredBatches(s), {})
})
