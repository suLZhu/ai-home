import test from 'node:test'
import assert from 'node:assert/strict'
import { queueMessage, isDue, removeQueuedMessage, markSending } from '../src/deferredSend.mjs'

const base = { assistantId: 'assistant-yanweixi', conversationId: 'chat-1' }

test('debounce deadline resets after another message', () => {
  const first = queueMessage(null, { ...base, message: { id: 'a', content: 'hello' }, now: 1000 })
  const second = queueMessage(first, { ...base, message: { id: 'b', content: 'world' }, now: 9000 })
  assert.equal(first.dueAt, 21000)
  assert.equal(second.dueAt, 29000)
  assert.equal(second.id, first.id)
  assert.deepEqual(second.messages.map(m => m.id), ['a', 'b'])
  assert.equal(isDue(second, 28999), false)
  assert.equal(isDue(second, 29000), true)
})

test('cannot combine different conversations or assistants', () => {
  const first = queueMessage(null, { ...base, message: { id: 'a' }, now: 0 })
  assert.throws(() => queueMessage(first, { ...base, conversationId: 'chat-2', message: { id: 'b' } }))
  assert.throws(() => queueMessage(first, { ...base, assistantId: 'assistant-yanshuo', message: { id: 'b' } }))
})

test('duplicate message IDs do not enqueue twice', () => {
  const first = queueMessage(null, { ...base, message: { id: 'a' }, now: 0 })
  const duplicate = queueMessage(first, { ...base, message: { id: 'a' }, now: 5000 })
  assert.deepEqual(duplicate, first)
})

test('cancel removes message, deleting empty batch', () => {
  const first = queueMessage(null, { ...base, message: { id: 'a' }, now: 0 })
  assert.equal(removeQueuedMessage(first, 'a'), null)
})

test('sending batches are not due and cannot be resent', () => {
  const first = queueMessage(null, { ...base, message: { id: 'a' }, now: 0 })
  const sending = markSending(first)
  assert.equal(isDue(sending, 50000), false)
  assert.throws(() => markSending(sending))
})

test('restored in-flight batch requires review instead of automatic resend', async () => {
  const { recoverBatch, remainingMs } = await import('../src/deferredSend.mjs')
  const first = queueMessage(null, { ...base, message: { id: 'a' }, now: 1000 })
  const restored = recoverBatch(JSON.parse(JSON.stringify(markSending(first))))
  assert.equal(restored.status, 'needs_review')
  assert.equal(isDue(restored, 999999), false)
  assert.equal(remainingMs(first, 5000), 16000)
})

test('reject corrupt or duplicate persisted batch entries', async () => {
  const { recoverBatch } = await import('../src/deferredSend.mjs')
  const first = queueMessage(null, { ...base, message: { id: 'a' }, now: 0 })
  assert.equal(recoverBatch({ ...first, messages: [{ id: 'a' }, { id: 'a' }] }), null)
  assert.equal(recoverBatch({ ...first, dueAt: Infinity }), null)
  assert.equal(recoverBatch({ ...first, version: 999 }), null)
})
