// 20 秒缓发端到端流程测试：连续发送重置倒计时、合并为一次请求、助手/会话隔离、
// 失败与中断绝不自动重发、取消撤回、成功后不重复发送。
import test from 'node:test'
import assert from 'node:assert/strict'
import { queueMessage, markSending, recoverBatch, isDue, DEFAULT_DEFER_MS } from '../src/deferredSend.mjs'
import { deferredScopeKey, saveDeferredBatches, loadDeferredBatches } from '../src/deferredStorage.mjs'
import { selectDueBatch, queuedIdSet, mergeQueuedForRequest, removeMessagesByIds } from '../src/deferredChat.mjs'

const A = { assistantId: 'assistant-yanweixi', conversationId: 'chat-1' }
const B = { assistantId: 'assistant-yanshuo', conversationId: 'chat-1' }

function storage() {
  const map = new Map()
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) }
}

test('连续发送：每条新消息重置 20 秒倒计时，最终合并为一个批次', () => {
  let batch = queueMessage(null, { ...A, message: { id: 'm1', content: '第一句' }, now: 1_000 })
  assert.equal(batch.dueAt, 1_000 + DEFAULT_DEFER_MS)
  batch = queueMessage(batch, { ...A, message: { id: 'm2', content: '第二句' }, now: 8_000 })
  batch = queueMessage(batch, { ...A, message: { id: 'm3', content: '第三句' }, now: 15_000 })
  assert.equal(batch.messages.length, 3)
  assert.equal(batch.dueAt, 15_000 + DEFAULT_DEFER_MS, '倒计时随最后一条消息重新开始')
  assert.equal(isDue(batch, 15_000 + DEFAULT_DEFER_MS - 1), false)
  assert.equal(isDue(batch, 15_000 + DEFAULT_DEFER_MS), true)
  // 合并：一次请求载荷包含全部三条消息，顺序保持。
  const { text } = mergeQueuedForRequest(batch, [])
  assert.equal(text, '第一句\n\n第二句\n\n第三句')
})

test('合并载荷：附件按消息顺序拼接，图片 dataURL 从会话气泡 preview 取回', () => {
  const batch = queueMessage(null, {
    ...A,
    message: { id: 'm1', content: '看图', attachments: [{ name: 'a.png', type: 'image/png', size: 10 }] },
    now: 0,
  })
  // 队列里只存轻量附件；真实 dataURL 在会话气泡的 preview 上。
  const shown = [{ id: 'm1', content: '看图', attachments: [{ name: 'a.png', type: 'image/png', size: 10, preview: 'data:image/png;base64,AAA' }] }]
  const merged = mergeQueuedForRequest(batch, shown)
  assert.equal(merged.text, '看图')
  assert.equal(merged.attachments.length, 1)
  assert.equal(merged.attachments[0].dataUrl, 'data:image/png;base64,AAA', 'flush 时恢复图片内容，模型仍能收到图')
})

test('合并载荷：会话里的气泡被删除时退回队列记录，文本绝不静默丢失', () => {
  const batch = queueMessage(null, { ...A, message: { id: 'm1', content: '别丢我' }, now: 0 })
  const merged = mergeQueuedForRequest(batch, [])
  assert.equal(merged.text, '别丢我')
})

test('隔离：不同助手 / 不同会话各是各的队列，选出的到期批次互不越界', () => {
  const now = 10_000
  const a = queueMessage(null, { ...A, message: { id: 'a1', content: 'A 的话' }, now })
  const b = queueMessage(null, { ...B, message: { id: 'b1', content: 'B 的话' }, now: now - 5_000 })
  const keyA = deferredScopeKey(A.assistantId, A.conversationId)
  const keyB = deferredScopeKey(B.assistantId, B.conversationId)
  const batches = { [keyA]: a, [keyB]: b }
  // 两个批次都已到期（B 的 dueAt 更早）→ 先选 B；A 的批次原封不动。
  const picked = selectDueBatch(batches, now + DEFAULT_DEFER_MS)
  assert.equal(picked, keyB)
  assert.equal(batches[keyA].messages[0].id, 'a1')
  // 跨 scope 混入被状态机直接拒绝。
  assert.throws(() => queueMessage(a, { ...B, message: { id: 'x' }, now }))
})

test('不自动重发：sending 与 needs_review 批次永远不会被倒计时选中', () => {
  const now = 0
  const sending = markSending(queueMessage(null, { ...A, message: { id: 's1' }, now }))
  const key = deferredScopeKey(A.assistantId, A.conversationId)
  assert.equal(selectDueBatch({ [key]: sending }, now + 999_999), null, '发送中不重复提交')
  // 刷新恢复：sending → needs_review，依然不会自动到期。
  const restored = recoverBatch(JSON.parse(JSON.stringify(sending)))
  assert.equal(restored.status, 'needs_review')
  assert.equal(selectDueBatch({ [key]: restored }, now + 999_999), null, '中断后必须用户确认才重发')
})

test('成功后出队：批次消失，同一消息绝不再发第二次', () => {
  const now = 0
  const batch = queueMessage(null, { ...A, message: { id: 'f1', content: '完成' }, now })
  const key = deferredScopeKey(A.assistantId, A.conversationId)
  const batches = { [key]: batch }
  assert.equal(selectDueBatch(batches, now + DEFAULT_DEFER_MS), key)
  // flush 成功 → 删掉该 key（App 的 outcome==='ok' 分支）。
  delete batches[key]
  assert.equal(selectDueBatch(batches, now + DEFAULT_DEFER_MS * 10), null)
})

test('取消待发：只撤回待发消息本身，不动会话里的其他内容', () => {
  const batch = queueMessage(null, { ...A, message: { id: 'c1', content: '撤回我' }, now: 0 })
  const history = [
    { id: 'old-1', role: 'user', content: '早前的话' },
    { id: 'old-2', role: 'assistant', content: '早前的回复' },
    { id: 'c1', role: 'user', content: '撤回我' },
  ]
  const next = removeMessagesByIds(history, queuedIdSet(batch))
  assert.deepEqual(next.map(m => m.id), ['old-1', 'old-2'])
  // 无 id 的旧消息（历史遗留）不受影响。
  const legacy = [{ role: 'user', content: '无 id 旧消息' }, { id: 'c1', role: 'user', content: '撤回我' }]
  assert.deepEqual(removeMessagesByIds(legacy, new Set(['c1'])).map(m => m.content), ['无 id 旧消息'])
})

test('刷新恢复：pending 批次带着剩余时间回来，过期即刻可发', () => {
  const dueAt = 100_000
  const batch = queueMessage(null, { ...A, message: { id: 'r1', content: '刷新也要记得我' }, now: dueAt - DEFAULT_DEFER_MS })
  const s = storage()
  const key = deferredScopeKey(batch.assistantId, batch.conversationId)
  saveDeferredBatches(s, { [key]: batch })
  const restored = loadDeferredBatches(s)
  assert.equal(restored[key].status, 'pending')
  assert.equal(selectDueBatch(restored, dueAt - 1), null, '没到期继续等')
  assert.equal(selectDueBatch(restored, dueAt), key, '到期立即可发')
})

test('端到端：排队 → 到期合并发送 → 成功清空；再次到期不再触发', () => {
  const s = storage()
  const key = deferredScopeKey(A.assistantId, A.conversationId)
  // 1) 三条消息陆续排队（模拟连续发送）。
  let batches = {}
  for (const [i, msg] of [['m1', '在吗'], ['m2', '晚上一起吃饭'], ['m3', '老地方']].entries()) {
    const scope = { ...A, message: { id: msg[0], content: msg[1] }, now: 1_000 * (i + 1) }
    batches = { ...batches, [key]: queueMessage(batches[key] ?? null, scope) }
    saveDeferredBatches(s, batches)
  }
  // 2) 到期 → 选出 → 合并载荷 → 标记发送（与 App flushDeferred 同一顺序）。
  const dueAt = 3_000 + DEFAULT_DEFER_MS
  const picked = selectDueBatch(loadDeferredBatches(s), dueAt)
  assert.equal(picked, key)
  const batch = loadDeferredBatches(s)[key]
  const { text } = mergeQueuedForRequest(batch, [])
  assert.equal(text, '在吗\n\n晚上一起吃饭\n\n老地方')
  batches = { [key]: markSending(batch) }
  saveDeferredBatches(s, batches)
  // 3) 请求中途刷新：恢复为 needs_review，不会被再次自动选出。
  const midFlight = loadDeferredBatches(s)
  assert.equal(midFlight[key].status, 'needs_review')
  assert.equal(selectDueBatch(midFlight, dueAt + 999_999), null)
  // 4) 用户确认重发并成功 → 出队；之后任何时刻都不再触发。
  const confirmed = { ...recoverBatch(midFlight[key]), status: 'sending' }
  assert.equal(confirmed.status, 'sending')
  batches = {}
  saveDeferredBatches(s, batches)
  assert.equal(selectDueBatch(loadDeferredBatches(s), dueAt + 999_999), null)
})
