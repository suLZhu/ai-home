// 消息操作（修改 / 删除 / 重新生成 / id 迁移）纯函数单测
import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveRegenerateContext, alignMessageIds } from '../src/messageOps.mjs'

const user = (content, id) => ({ role: 'user', content, ...(id ? { id } : {}) })
const assistant = (content, id, extra) => ({ role: 'assistant', content, ...(id ? { id } : {}), ...(extra || {}) })

// ── resolveRegenerateContext ──

test('重新生成：定位最后一条 AI 回复及其触发用户消息', () => {
  const list = [
    user('第一句', 'u1'),
    assistant('回一句', 'a1'),
    user('第二句', 'u2'),
    assistant('再回一句', 'a2'),
  ]
  const ctx = resolveRegenerateContext(list, 'a2')
  assert.ok(ctx)
  assert.equal(ctx.userIndex, 2)
  assert.equal(ctx.assistantIndex, 3)
  assert.equal(ctx.userMessage.content, '第二句')
  assert.equal(ctx.original.content, '再回一句')
})

test('重新生成：非最新一条 AI 回复返回 null（不支持对历史回复重新生成）', () => {
  const list = [user('第一句', 'u1'), assistant('旧回复', 'a1'), user('第二句', 'u2'), assistant('新回复', 'a2')]
  assert.equal(resolveRegenerateContext(list, 'a1'), null)
})

test('重新生成：找不到 id / 不是 AI 消息 / 缺用户消息均返回 null', () => {
  assert.equal(resolveRegenerateContext([user('hi', 'u1'), assistant('yo', 'a1')], 'nope'), null)
  assert.equal(resolveRegenerateContext([user('hi', 'u1'), assistant('yo', 'a1')], 'u1'), null)
  assert.equal(resolveRegenerateContext([assistant('只有我', 'a1')], 'a1'), null)
  assert.equal(resolveRegenerateContext(null, 'a1'), null)
})

test('重新生成：定时任务结果（taskRunId）不可重新生成', () => {
  const list = [user('跑个任务', 'u1'), assistant('结果', 'a1', { taskRunId: 'task-9' })]
  assert.equal(resolveRegenerateContext(list, 'a1'), null)
})

// ── alignMessageIds ──

test('id 迁移：两边都缺 id 时补齐，且视图采用持久化侧 id（同一份消息同一个 id）', () => {
  const view = [user('你好'), assistant('在的')]
  const conv = [user('你好'), assistant('在的')]
  const r = alignMessageIds(view, conv)
  assert.equal(r.changed, true)
  assert.ok(r.view[0].id && r.view[1].id)
  assert.equal(r.view[0].id, r.conv[0].id)
  assert.equal(r.view[1].id, r.conv[1].id)
  assert.notEqual(r.conv[0].id, r.conv[1].id)
  // 内容不被改动
  assert.equal(r.view[1].content, '在的')
})

test('id 迁移：视图缺 id、持久化侧已有 id 时，视图直接采用持久化侧 id', () => {
  const view = [user('你好'), assistant('在的')]
  const conv = [user('你好', 'u-fixed'), assistant('在的', 'a-fixed')]
  const r = alignMessageIds(view, conv)
  assert.equal(r.changed, true)
  assert.equal(r.view[0].id, 'u-fixed')
  assert.equal(r.view[1].id, 'a-fixed')
  assert.equal(r.conv[0].id, 'u-fixed')
})

test('id 迁移：内容漂移时各自独立补齐，绝不覆盖任何一侧内容', () => {
  const view = [user('视图里的旧草稿'), assistant('视图回复')]
  const conv = [user('持久化的原文', 'u1'), assistant('持久化回复', 'a1')]
  const r = alignMessageIds(view, conv)
  assert.equal(r.changed, true)
  // 两侧内容都保持原样
  assert.equal(r.view[0].content, '视图里的旧草稿')
  assert.equal(r.conv[0].content, '持久化的原文')
  assert.equal(r.conv[0].id, 'u1')
  assert.equal(r.conv[1].id, 'a1')
  // 内容不一致时无法对齐，视图侧只独立补 id（不冒充持久化侧 id）
  assert.ok(r.view[0].id && r.view[1].id)
  assert.notEqual(r.view[0].id, 'u1')
  assert.notEqual(r.view[1].id, 'a1')
})

test('id 迁移：两边已齐全且对齐时返回原数组引用（changed=false，effect 不会循环）', () => {
  const view = [user('你好', 'u1'), assistant('在的', 'a1')]
  const conv = [user('你好', 'u1'), assistant('在的', 'a1')]
  const r = alignMessageIds(view, conv)
  assert.equal(r.changed, false)
  assert.equal(r.view, view)
  assert.equal(r.conv, conv)
  // 再跑一遍仍然收敛
  const r2 = alignMessageIds(r.view, r.conv)
  assert.equal(r2.changed, false)
  assert.equal(r2.view, r.view)
})

test('id 迁移：持久化侧缺 id 时先补齐，视图侧采用补齐后的同一套 id', () => {
  const view = [user('你好', 'u1'), assistant('在的', 'a1')]
  const conv = [user('你好'), assistant('在的')] // 持久化侧缺 id（老数据）
  const r = alignMessageIds(view, conv)
  assert.equal(r.changed, true)
  assert.ok(r.conv[0].id && r.conv[1].id)
  // 内容一致 → 视图采用持久化侧（补齐后）的 id，两边同 id，编辑才能同时写进两边
  assert.equal(r.view[0].id, r.conv[0].id)
  assert.equal(r.view[1].id, r.conv[1].id)
  assert.equal(r.view[0].content, '你好')
  assert.equal(r.conv[1].content, '在的')
  // 补齐后再跑一遍即收敛
  const r2 = alignMessageIds(r.view, r.conv)
  assert.equal(r2.changed, false)
  assert.equal(r2.view, r.view)
})
