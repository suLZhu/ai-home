import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pendingScopeKey, makePending, setPending, clearPending, patchPendingText,
  markNeedsReview, recoverPending, loadPendingSends, savePendingSends, PENDING_VERSION,
} from '../src/pendingSend.mjs'

const A = { assistantId: 'a', conversationId: 'c1' }
const B = { assistantId: 'b', conversationId: 'c1' }

test('scope key 强绑定 assistant + conversation，缺字段抛错', () => {
  assert.equal(pendingScopeKey('a', 'c1'), JSON.stringify(['a', 'c1']))
  assert.throws(() => pendingScopeKey('', 'c1'))
  assert.throws(() => pendingScopeKey('a', ''))
  assert.throws(() => makePending('hi', [], { assistantId: 'a' }))
})

test('makePending 产出合法 item，附件保留 dataUrl', () => {
  const item = makePending('你好', [{ name: 'x.png', type: 'image/png', dataUrl: 'data:image/png;base64,AAA', textContent: undefined }], { ...A, id: 'p1', now: 1000 })
  assert.equal(item.version, PENDING_VERSION)
  assert.equal(item.id, 'p1')
  assert.equal(item.assistantId, 'a')
  assert.equal(item.conversationId, 'c1')
  assert.equal(item.text, '你好')
  assert.equal(item.status, 'pending')
  assert.equal(item.createdAt, 1000)
  assert.equal(item.updatedAt, 1000)
  assert.equal(item.attachments[0].dataUrl, 'data:image/png;base64,AAA')
})

test('setPending 单 scope 仅 1 条：新内容覆盖旧内容', () => {
  const first = makePending('第一句', [], { ...A, id: 'p1', now: 1 })
  const second = makePending('第二句', [], { ...A, id: 'p2', now: 2 })
  const store = setPending(setPending({}, first), second)
  const key = pendingScopeKey('a', 'c1')
  assert.equal(Object.keys(store).length, 1, '一个 scope 至多一条')
  assert.equal(store[key].text, '第二句', '新内容覆盖旧内容')
  assert.equal(store[key].id, 'p2')
})

test('跨会话/跨助手不串：A 的 pending 不影响 B', () => {
  const aItem = makePending('A 的话', [], { ...A, id: 'pa', now: 1 })
  const bItem = makePending('B 的话', [], { ...B, id: 'pb', now: 1 })
  const store = setPending(setPending({}, aItem), bItem)
  assert.equal(Object.keys(store).length, 2)
  assert.equal(store[pendingScopeKey('a', 'c1')].text, 'A 的话')
  assert.equal(store[pendingScopeKey('b', 'c1')].text, 'B 的话')
})

test('clearPending 移除指定 scope', () => {
  const item = makePending('hi', [], { ...A, id: 'p1', now: 1 })
  const store = setPending({}, item)
  const cleared = clearPending(store, 'a', 'c1')
  assert.equal(cleared[pendingScopeKey('a', 'c1')], undefined)
  // 不存在的 key 不影响原对象
  assert.deepEqual(clearPending(store, 'x', 'y'), store)
})

test('patchPendingText 改文字、状态回 pending、updatedAt 刷新', () => {
  const item = makePending('原话', [], { ...A, id: 'p1', now: 1 })
  const store = setPending({}, item)
  const patched = patchPendingText(store, 'a', 'c1', '改后的话')
  assert.equal(patched[pendingScopeKey('a', 'c1')].text, '改后的话')
  assert.equal(patched[pendingScopeKey('a', 'c1')].status, 'pending')
  assert.ok(patched[pendingScopeKey('a', 'c1')].updatedAt >= 1)
  // 不存在时原样返回
  assert.deepEqual(patchPendingText(store, 'x', 'y', 'z'), store)
})

test('markNeedsReview 把 pending 标记为需用户确认', () => {
  const item = makePending('hi', [], { ...A, id: 'p1', now: 1 })
  const store = setPending({}, item)
  const reviewed = markNeedsReview(store, 'a', 'c1')
  assert.equal(reviewed[pendingScopeKey('a', 'c1')].status, 'needs_review')
  assert.deepEqual(markNeedsReview(store, 'x', 'y'), store)
})

test('recoverPending 校验非法数据，绝不静默接受', () => {
  assert.equal(recoverPending(null), null)
  assert.equal(recoverPending({}), null)
  assert.equal(recoverPending({ version: PENDING_VERSION - 1, id: 'x', assistantId: 'a', conversationId: 'c1', text: 't', attachments: [], status: 'pending', createdAt: 1, updatedAt: 1 }), null, '版本不符拒绝')
  assert.equal(recoverPending({ version: PENDING_VERSION, id: 'x', assistantId: 'a', conversationId: 'c1', text: 't', attachments: 'no', status: 'pending', createdAt: 1, updatedAt: 1 }), null, 'attachments 非数组拒绝')
  assert.equal(recoverPending({ version: PENDING_VERSION, id: 'x', assistantId: 'a', conversationId: 'c1', text: 't', attachments: [], status: 'bogus', createdAt: 1, updatedAt: 1 }), null, '非法 status 拒绝')
  const ok = recoverPending({ version: PENDING_VERSION, id: 'x', assistantId: 'a', conversationId: 'c1', text: 't', attachments: [{ name: 'f' }], status: 'pending', createdAt: 1, updatedAt: 2 })
  assert.ok(ok)
  assert.equal(ok.updatedAt, 2)
})

// 模拟 localStorage 的轻量实现，验证跨刷新持久化语义。
function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial))
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)) },
    _dump: () => Object.fromEntries(m),
  }
}

test('save/load 往返：刷新后 pending 不丢，且经 recover 规范化', () => {
  const item = makePending('待发的话', [{ name: 'a.png', type: 'image/png', dataUrl: 'data:img' }], { ...A, id: 'p1', now: 1 })
  const store = setPending({}, item)
  const storage = fakeStorage()
  savePendingSends(storage, store)
  const loaded = loadPendingSends(storage)
  assert.equal(Object.keys(loaded).length, 1)
  const key = pendingScopeKey('a', 'c1')
  assert.equal(loaded[key].text, '待发的话')
  assert.equal(loaded[key].attachments[0].dataUrl, 'data:img')
})

test('load 容忍损坏的 JSON 与非法条目（不崩溃、跳过脏数据）', () => {
  const storage = fakeStorage({ 'ai-home.pendingSends.v1': '{ not valid json' })
  assert.deepEqual(loadPendingSends(storage), {})
  const dirty = fakeStorage({ 'ai-home.pendingSends.v1': JSON.stringify({ 'a|c1': { version: 999, id: 'x', assistantId: 'a', conversationId: 'c1', text: 't', attachments: [], status: 'pending', createdAt: 1, updatedAt: 1 } }) })
  assert.deepEqual(loadPendingSends(dirty), {})
})

test('两端协同：生成成功后 pending 自动补发（逻辑层）—— 先 setPending，成功后 clearPending', () => {
  const item = makePending('下一轮', [], { ...A, id: 'p1', now: 1 })
  let store = setPending({}, item)
  const key = pendingScopeKey('a', 'c1')
  assert.equal(store[key].status, 'pending', '生成中：仍在等待补发')
  // 模拟 send() 返回 ok → 出队
  store = clearPending(store, 'a', 'c1')
  assert.equal(store[key], undefined, '成功后 pending 已清空，绝不再发第二次')
})

test('两端协同：生成报错 pending 保留为 needs_review，不自动发', () => {
  const item = makePending('再试一次', [], { ...A, id: 'p1', now: 1 })
  let store = setPending({}, item)
  // 模拟 send() 返回 fail → 标记 needs_review
  store = markNeedsReview(store, 'a', 'c1')
  const key = pendingScopeKey('a', 'c1')
  assert.equal(store[key].status, 'needs_review', '报错后保留，等待用户确认')
})
