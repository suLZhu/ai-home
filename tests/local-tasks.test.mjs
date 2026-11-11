// 本地模式定时任务：纯函数状态机 + LocalBackend 路由（不依赖云端 / 常驻进程）。
// node 环境没有 localStorage —— 注入内存实现（localBackend 按需读取，不依赖 import 时机）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeLocalTask, makeLocalTask, dueLocalTasks, nextRunAt, advanceLocalTask } from '../src/localTasks.mjs'
import { localHandle } from '../src/localBackend.mjs'

function memStorage() {
  const m = new Map()
  return {
    getItem: k => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => { m.set(String(k), String(v)) },
    removeItem: k => { m.delete(String(k)) },
    clear: () => { m.clear() },
    key: i => [...m.keys()][i] ?? null,
    get length() { return m.size },
  }
}
globalThis.localStorage = memStorage()

const call = async (path, init) => {
  const res = await localHandle(path, init)
  return { status: res.status, data: await res.json() }
}
const post = (path, body) => call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const put = (path, body) => call(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const del = (path, body) => call(path, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

const T0 = Date.parse('2026-11-11T19:00:00.000Z')
const iso = ms => new Date(ms).toISOString()
const base = { person: 'assistant-001', title: '提醒洗衣服', prompt: '该洗衣服啦' }

test('makeLocalTask 校验必填与时间，字段与云端 scheduled_tasks 同构', () => {
  assert.equal(makeLocalTask({ ...base, runAt: '不是时间' }, 'x'), null)
  assert.equal(makeLocalTask({ ...base, title: '', runAt: iso(T0) }, 'x'), null)
  const t = makeLocalTask({ ...base, runAt: iso(T0), recurrence: 'weekly', conversationId: 'conv-1' }, 't1', T0)
  assert.equal(t.id, 't1')
  assert.equal(t.run_at, iso(T0))
  assert.equal(t.recurrence, 'weekly')
  assert.equal(t.status, 'scheduled')
  assert.equal(t.conversation_id, 'conv-1')
  assert.equal(t.last_run_at, null)
  assert.equal(t.created_by, 'assistant-001')
  assert.equal(normalizeLocalTask({ id: 'bad', run_at: 'oops' }), null)
  assert.equal(normalizeLocalTask({ id: 'ok', run_at: iso(T0), recurrence: '别的' }).recurrence, 'once')
})

test('dueLocalTasks 只挑已到期且启用的，按时间升序', () => {
  const tasks = [
    { id: 'late', run_at: iso(T0 + 60000), status: 'scheduled', title: '', person: 'a' },
    { id: 'paused', run_at: iso(T0 - 60000), status: 'paused', title: '', person: 'a' },
    { id: 'done', run_at: iso(T0 - 30000), status: 'completed', title: '', person: 'a' },
    { id: 'first', run_at: iso(T0 - 120000), status: 'scheduled', title: '', person: 'a' },
    { id: 'second', run_at: iso(T0), status: 'scheduled', title: '', person: 'a' },
  ]
  assert.deepEqual(dueLocalTasks(tasks, T0).map(t => t.id), ['first', 'second'])
  assert.deepEqual(dueLocalTasks(undefined, T0), [])
})

test('nextRunAt 把过期重复任务直接递推到未来的下一次，不会补发历史提醒', () => {
  const daily = { run_at: iso(T0 - 3 * 86_400_000 - 3600_000), recurrence: 'daily' }
  assert.equal(nextRunAt(daily, T0), iso(T0 - 3600_000 + 86_400_000))
  const weekly = { run_at: iso(T0 - 7_000_000), recurrence: 'weekly' }
  assert.equal(nextRunAt(weekly, T0), iso(T0 - 7_000_000 + 604_800_000))
  assert.equal(nextRunAt({ run_at: iso(T0), recurrence: 'once' }, T0), null)
  assert.equal(nextRunAt({ run_at: 'oops', recurrence: 'daily' }, T0), null)
  // 离线很久也不能死循环
  assert.ok(Date.parse(nextRunAt({ run_at: iso(0), recurrence: 'daily' }, T0)) > T0)
})

test('advanceLocalTask：重复任务继续启用，一次性任务标记完成', () => {
  const repeating = normalizeLocalTask({ id: 'r', person: 'a', title: 't', run_at: iso(T0 - 1000), recurrence: 'daily', status: 'scheduled' })
  const next = advanceLocalTask(repeating, T0)
  assert.equal(next.status, 'scheduled')
  assert.ok(Date.parse(next.run_at) > T0)
  assert.equal(next.last_run_at, iso(T0))
  const once = normalizeLocalTask({ id: 'o', person: 'a', title: 't', run_at: iso(T0 - 1000), recurrence: 'once', status: 'scheduled' })
  const done = advanceLocalTask(once, T0)
  assert.equal(done.status, 'completed')
  assert.equal(done.run_at, iso(T0 - 1000))
})

test('LocalBackend：创建 → 列表 → 结算 → 会话提醒 → 重复任务排下一次', async () => {
  localStorage.clear()
  const created = await post('/api/tasks', { ...base, runAt: iso(T0 - 1000), recurrence: 'daily' })
  assert.equal(created.status, 201)
  assert.equal(created.data.task.status, 'scheduled')
  assert.equal((await call('/api/tasks?person=assistant-001')).data.tasks.length, 1)
  assert.equal((await call('/api/tasks?person=assistant-002')).data.tasks.length, 0)

  const run = await post('/api/tasks/run', { now: iso(T0) })
  assert.equal(run.status, 200)
  assert.equal(run.data.fired.length, 1)
  assert.equal(run.data.fired[0].person, 'assistant-001')
  assert.ok(run.data.fired[0].answer.includes('提醒洗衣服'))
  assert.ok(run.data.fired[0].runId.startsWith('local-'))
  // 重复任务推进到未来，第二次结算不会重复触发
  assert.ok(Date.parse(run.data.tasks[0].run_at) > T0)
  assert.equal(run.data.tasks[0].status, 'scheduled')
  assert.equal((await post('/api/tasks/run', { now: iso(T0) })).data.fired.length, 0)
  // 收件箱留一条，前台横幅轮询会弹出
  const inbox = (await call('/api/inbox')).data.messages
  assert.equal(inbox.length, 1)
  assert.equal(inbox[0].kind, 'task_notice')
})

test('LocalBackend：暂停不触发，恢复后触发，一次性任务结算后完成', async () => {
  localStorage.clear()
  const c = await post('/api/tasks', { ...base, runAt: iso(T0 - 1000), recurrence: 'once' })
  const id = c.data.task.id
  assert.equal((await put('/api/tasks/' + id, { person: 'assistant-001', status: 'paused' })).status, 200)
  assert.equal((await post('/api/tasks/run', { now: iso(T0) })).data.fired.length, 0)
  assert.equal((await put('/api/tasks/' + id, { person: 'assistant-001', status: 'scheduled' })).status, 200)
  const run = await post('/api/tasks/run', { now: iso(T0) })
  assert.equal(run.data.fired.length, 1)
  assert.equal(run.data.tasks[0].status, 'completed')
  assert.equal((await post('/api/tasks/run', { now: iso(T0 + 86_400_000) })).data.fired.length, 0)
  assert.equal((await del('/api/tasks/' + id, { person: 'assistant-001' })).status, 200)
  assert.equal((await call('/api/tasks?person=assistant-001')).data.tasks.length, 0)
})

test('LocalBackend：助手工具调用走 /api/workflows/manage，本地也能创建与管理', async () => {
  localStorage.clear()
  const c = await post('/api/workflows/manage', {
    person: 'assistant-001', action: 'create', title: '定时喝水', prompt: '喝一杯水',
    runAt: iso(T0 + 60_000), recurrence: 'once', temporary: true, conversationId: 'conv-2',
  })
  assert.equal(c.status, 201)
  assert.equal(c.data.task.created_by, 'assistant-001')
  assert.equal(c.data.task.conversation_id, 'conv-2')
  const id = c.data.task.id
  assert.equal((await post('/api/workflows/manage', { person: 'assistant-001', action: 'pause', id })).data.ok, true)
  assert.equal((await call('/api/tasks?person=assistant-001')).data.tasks[0].status, 'paused')
  assert.equal((await post('/api/workflows/manage', { person: 'assistant-001', action: 'resume', id })).data.ok, true)
  assert.equal((await post('/api/workflows/manage', { person: 'assistant-001', action: 'delete', id })).data.ok, true)
  assert.equal((await call('/api/tasks?person=assistant-001')).data.tasks.length, 0)
})

test('LocalBackend：无效创建返回 400，且不再出现「需要云端」的降级文案', async () => {
  localStorage.clear()
  const bad = await post('/api/tasks', { ...base, runAt: 'nope' })
  assert.equal(bad.status, 400)
  const bad2 = await post('/api/workflows/manage', { person: 'assistant-001', action: 'create', title: '', prompt: '', runAt: iso(T0) })
  assert.equal(bad2.status, 400)
  assert.ok(!JSON.stringify([bad.data, bad2.data]).includes('配置云服务器'))
})
