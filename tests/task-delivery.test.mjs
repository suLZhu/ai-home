// P0-3 acceptance suite: 定时任务结果投递闭环。
// 任务到期 → Runner 执行 → 生成结果 → 投递 inbox → 写入指定会话 → 前端显示。
//
// 与 agent-acceptance 共用同一套路脚架：内存 SQLite + 脚本化 fetch 桩，
// 不碰任何正式数据。前端消费判定（decideTaskConsumption）是前后端共享的
// 纯函数——这里测的就是生产代码本身，不是复制品。
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initAgentRuns, createAgentRun, getAgentRun } from '../src/server/agent/AgentRunStore.mjs'
import { AgentEventBus } from '../src/server/agent/AgentEventBus.mjs'
import { AgentRunner } from '../src/server/agent/AgentRunner.mjs'
import { initToolLogs } from '../src/toolLog.mjs'
import { initToolPolicies } from '../src/server/agent/ToolPolicy.mjs'
import { createTaskScheduler, recoverInterruptedTasks } from '../src/server/agent/TaskScheduler.mjs'
import { initInbox, addInboxMessage, addTaskResult, listInbox, markInboxRead } from '../src/inbox.mjs'
import { decideTaskConsumption, parseTaskEnvelope, taskResultEnvelope } from '../src/taskResult.mjs'
import { createRollingBackup } from '../src/server/backup.mjs'
import { initMemoryStore } from '../src/server/agent/MemoryStore.mjs'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

// --- helpers ---------------------------------------------------------------

function makeDb() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE app_state (id INTEGER PRIMARY KEY CHECK (id=1), payload TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE ledger_entries (id TEXT PRIMARY KEY, kind TEXT NOT NULL, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL,
      category TEXT NOT NULL, note TEXT NOT NULL, entry_date TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE ledger_operations (request_id TEXT PRIMARY KEY, entry_id TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE mcp_connections (id TEXT PRIMARY KEY, person TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL,
      transport TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, token_enc TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE scheduled_tasks (id TEXT PRIMARY KEY, person TEXT NOT NULL, title TEXT NOT NULL, prompt TEXT NOT NULL,
      run_at TEXT NOT NULL, recurrence TEXT NOT NULL DEFAULT 'once', status TEXT NOT NULL DEFAULT 'scheduled',
      last_run_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      created_by TEXT NOT NULL DEFAULT 'user', temporary INTEGER NOT NULL DEFAULT 0, conversation_id TEXT);
  `)
  initAgentRuns(db)
  initToolLogs(db)
  initToolPolicies(db)
  initMemoryStore(db)
  initInbox(db)
  return db
}

function makeCtx(db) {
  return {
    db,
    bus: new AgentEventBus(),
    providerFor: () => ({ endpoint: 'https://fake.test/v1', apiKey: 'sk-test', model: 'fake-model' }),
    displayNameFor: () => '测试助手',
    mcpList: () => [],
    mcpCall: () => { throw new Error('no mcp in this suite') },
  }
}

const usage = { prompt_tokens: 10, completion_tokens: 5 }
const textReply = text => ({ choices: [{ message: { content: text } }], usage })

function installModel(script) {
  const queue = [...script]
  const requests = []
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(init.body))
    const next = queue.shift()
    if (!next) throw new Error('model script exhausted')
    return new Response(JSON.stringify(next), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return requests
}

// 上游永远不响应；仅在 abort 时以 AbortError 拒绝（模拟真实 fetch 对 signal 的行为）。
function installHangingModel() {
  globalThis.fetch = (_url, init) => new Promise((_resolve, reject) => {
    const signal = init?.signal
    if (signal?.aborted) { reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); return }
    signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true })
  })
}

function installFailingModel(status = 500) {
  globalThis.fetch = async () => new Response('upstream boom', { status })
}

const PERSON = 'assistant-yanweixi'
const OTHER = 'assistant-yanshuo'
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function waitFor(predicate, timeoutMs = 3000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true
    await sleep(20)
  }
  return false
}

let taskSeq = 0
function insertTask(db, { person = PERSON, recurrence = 'once', conversationId = 'conv-target', runAtOffsetMs = -1000, title = '测试任务' } = {}) {
  const id = 'task-' + (++taskSeq) + '-' + Date.now().toString(36)
  const now = new Date()
  db.prepare(`INSERT INTO scheduled_tasks (id,person,title,prompt,run_at,recurrence,status,created_at,updated_at,conversation_id)
    VALUES (?,?,?,?,?,?,'scheduled',?,?,?)`)
    .run(id, person, title, '执行测试内容', new Date(now.getTime() + runAtOffsetMs).toISOString(), recurrence, now.toISOString(), now.toISOString(), conversationId)
  return id
}

// 模拟前端消费一轮：对一个「助手的会话集合」执行与 App.tsx 消费 effect
// 相同的决策（decideTaskConsumption 是共享生产代码），返回新集合与动作记录。
function consumeOnce(conversations, inboxRows) {
  const actions = []
  for (const row of inboxRows) {
    if (row.kind !== 'task_result' || row.read_at) continue
    const decision = decideTaskConsumption(conversations[row.person], row.content)
    if (decision.action === 'write') {
      const env = decision.envelope
      const list = conversations[row.person] || []
      conversations = {
        ...conversations,
        [row.person]: list.map(c => c.id === decision.conversationId
          ? { ...c, messages: [...(c.messages || []), { role: 'assistant', content: env.answer, id: 'task-' + env.runId, taskRunId: env.runId }] }
          : c),
      }
      actions.push({ id: row.id, action: 'write', conversationId: decision.conversationId, runId: env.runId })
    } else {
      actions.push({ id: row.id, action: decision.action })
    }
  }
  return { conversations, actions }
}

function findRunMessage(conversations, person, conversationId, runId) {
  const conv = (conversations[person] || []).find(c => c.id === conversationId)
  return conv && (conv.messages || []).find(m => m && m.taskRunId === runId) || null
}

// ============================================================================
// 1) 正常执行并写回：run 成功 → inbox 有 task_result 行，信封字段齐全
// ============================================================================
test('1 正常执行并写回原会话', async () => {
  const db = makeDb()
  installModel([textReply('今天的天气是晴天')])
  const runner = new AgentRunner(makeCtx(db))
  const bus = new AgentEventBus()
  const taskId = insertTask(db, { conversationId: 'conv-morning' })
  let runId = null
  bus.subscribe(e => { if (e.type === 'run_created' && e.taskId === taskId) runId = e.runId })

  const scheduler = createTaskScheduler({ db, runner, bus, deliverTask: entry => addTaskResult(db, entry) })
  assert.equal(scheduler.tick(), 1)
  assert.ok(await waitFor(() => runId && getAgentRun(db, runId)?.status !== 'running'), '运行应完成')

  const results = listInbox(db).filter(m => m.kind === 'task_result')
  assert.equal(results.length, 1)
  assert.equal(results[0].id, 'task-' + runId)
  assert.equal(results[0].person, PERSON)
  assert.equal(results[0].read_at, null)
  const env = parseTaskEnvelope(results[0].content)
  assert.equal(env.runId, runId)
  assert.equal(env.taskId, taskId)
  assert.equal(env.conversationId, 'conv-morning')
  assert.equal(env.answer, '今天的天气是晴天')
  assert.equal(db.prepare('SELECT status FROM scheduled_tasks WHERE id=?').get(taskId).status, 'completed')
})

// ============================================================================
// 2) 执行期间切换会话：写回目标永远是任务绑定的会话，与「当前视图」无关
// ============================================================================
test('2 执行期间切换会话不改变写回目标', async () => {
  const db = makeDb()
  installModel([textReply('结果已生成')])
  const runner = new AgentRunner(makeCtx(db))
  const taskId = insertTask(db, { conversationId: 'conv-original' })
  let runId = null
  const bus = new AgentEventBus()
  bus.subscribe(e => { if (e.type === 'run_created' && e.taskId === taskId) runId = e.runId })
  createTaskScheduler({ db, runner, bus, deliverTask: entry => addTaskResult(db, entry) }).tick()
  assert.ok(await waitFor(() => runId && getAgentRun(db, runId)?.status !== 'running'))

  // 用户此刻正看另一条会话（active=conv-other）——消费决策只认信封里的 conversationId
  const conversations = {
    [PERSON]: [
      { id: 'conv-other', title: '当前视图', messages: [{ role: 'user', content: 'hi' }] },
      { id: 'conv-original', title: '任务来源', messages: [] },
    ],
  }
  const { actions, conversations: after } = consumeOnce(conversations, listInbox(db))
  assert.equal(actions[0].action, 'write')
  assert.equal(actions[0].conversationId, 'conv-original')
  assert.ok(findRunMessage(after, PERSON, 'conv-original', runId), '结果写进任务绑定的会话')
  assert.equal((after[PERSON].find(c => c.id === 'conv-other').messages || []).length, 1, '用户当前视图未被污染')
})

// ============================================================================
// 3) 执行期间切换助手：每位助手的结果只进自己的 person 收件箱与会话
// ============================================================================
test('3 执行期间切换助手不串投', async () => {
  const db = makeDb()
  installModel([textReply('A 的结果'), textReply('B 的结果')])
  const runner = new AgentRunner(makeCtx(db))
  const bus = new AgentEventBus()
  const taskA = insertTask(db, { person: PERSON, conversationId: 'conv-a' })
  const taskB = insertTask(db, { person: OTHER, conversationId: 'conv-b' })
  const ids = {}
  bus.subscribe(e => { if (e.type === 'run_created') ids[e.taskId] = e.runId })
  createTaskScheduler({ db, runner, bus, deliverTask: entry => addTaskResult(db, entry) }).tick()
  assert.ok(await waitFor(() => ids[taskA] && ids[taskB]
    && getAgentRun(db, ids[taskA])?.status !== 'running' && getAgentRun(db, ids[taskB])?.status !== 'running'))

  const results = listInbox(db).filter(m => m.kind === 'task_result')
  assert.equal(results.length, 2)
  const byPerson = Object.fromEntries(results.map(r => [r.person, r]))
  assert.equal(parseTaskEnvelope(byPerson[PERSON].content).answer, 'A 的结果')
  assert.equal(parseTaskEnvelope(byPerson[OTHER].content).answer, 'B 的结果')

  const conversations = {
    [PERSON]: [{ id: 'conv-a', title: 'A', messages: [] }],
    [OTHER]: [{ id: 'conv-b', title: 'B', messages: [] }],
  }
  const { actions, conversations: after } = consumeOnce(conversations, results)
  assert.equal(actions.length, 2)
  assert.ok(findRunMessage(after, PERSON, 'conv-a', ids[taskA]), 'A 的结果进 A 的会话')
  assert.ok(findRunMessage(after, OTHER, 'conv-b', ids[taskB]), 'B 的结果进 B 的会话')
})

// ============================================================================
// 4) 页面关闭时任务完成：投递不依赖前端在线；未确认的行保持未读
// ============================================================================
test('4 页面关闭时任务照常完成并投递', async () => {
  const db = makeDb()
  installModel([textReply('离线期间完成')])
  const runner = new AgentRunner(makeCtx(db))
  const taskId = insertTask(db, {})
  let runId = null
  const bus = new AgentEventBus()
  bus.subscribe(e => { if (e.type === 'run_created' && e.taskId === taskId) runId = e.runId })
  createTaskScheduler({ db, runner, bus, deliverTask: entry => addTaskResult(db, entry) }).tick()
  assert.ok(await waitFor(() => runId && getAgentRun(db, runId)?.status !== 'running'))

  // 没有任何前端轮询/消费——行照样在，且未读（read_at 为空）
  const row = listInbox(db).find(m => m.id === 'task-' + runId)
  assert.ok(row, '页面关闭期间投递仍落盘')
  assert.equal(row.read_at, null)
})

// ============================================================================
// 5) 页面重开收到结果：重新拉取 → 消费决策 write → 写入后补确认
// ============================================================================
test('5 页面重开后消费并确认', async () => {
  const db = makeDb()
  installModel([textReply('重开后的结果')])
  const runner = new AgentRunner(makeCtx(db))
  const taskId = insertTask(db, { conversationId: 'conv-reopen' })
  let runId = null
  const bus = new AgentEventBus()
  bus.subscribe(e => { if (e.type === 'run_created' && e.taskId === taskId) runId = e.runId })
  createTaskScheduler({ db, runner, bus, deliverTask: entry => addTaskResult(db, entry) }).tick()
  assert.ok(await waitFor(() => runId && getAgentRun(db, runId)?.status !== 'running'))

  // 「重开页面」：全新会话集合（从云端快照恢复），inbox 重新拉取
  const conversations = { [PERSON]: [{ id: 'conv-reopen', title: 'R', messages: [] }] }
  const first = consumeOnce(conversations, listInbox(db))
  assert.equal(first.actions[0].action, 'write')
  assert.ok(findRunMessage(first.conversations, PERSON, 'conv-reopen', runId))

  // 持久化成功后才确认（模拟云保存成功 → ack）
  assert.equal(markInboxRead(db, first.actions[0].id), true)
  // 确认后重拉：read_at 已设置，消费循环跳过它
  const second = consumeOnce(first.conversations, listInbox(db))
  assert.equal(second.actions.filter(a => a.action === 'write').length, 0)
})

// ============================================================================
// 6) inbox 重复轮询：多次拉取同一行不重复写入（持久化幂等，非内存去重）
// ============================================================================
test('6 重复轮询不重复写入', async () => {
  const db = makeDb()
  const envelopeContent = taskResultEnvelope({ runId: 'run-x', taskId: 't-x', conversationId: 'conv-x', title: 'X', answer: '只应出现一次' })
  db.prepare('INSERT INTO assistant_inbox(id,person,content,kind,created_at) VALUES (?,?,?,\'task_result\',?)')
    .run('task-run-x', PERSON, envelopeContent, new Date().toISOString())

  const conversations = { [PERSON]: [{ id: 'conv-x', title: 'X', messages: [] }] }
  // 连续三轮轮询（同一行反复到达），中间不确认已读
  let state = conversations
  for (let i = 0; i < 3; i++) {
    state = consumeOnce(state, listInbox(db)).conversations
  }
  const conv = state[PERSON].find(c => c.id === 'conv-x')
  assert.equal(conv.messages.filter(m => m.taskRunId === 'run-x').length, 1, '三轮轮询后仍只有一条')

  // 确认后再轮询（行仍在列表里但已读）——同样不写
  markInboxRead(db, 'task-run-x')
  const after = consumeOnce(state, listInbox(db))
  assert.equal(after.actions.length, 0)
  assert.equal(after.conversations[PERSON].find(c => c.id === 'conv-x').messages.filter(m => m.taskRunId === 'run-x').length, 1)
})

// ============================================================================
// 7) 消费前重启：inbox 行与运行记录都持久化在 SQLite，重启后原样可消费
// ============================================================================
test('7 消费前重启不丢结果', async () => {
  const db = makeDb()
  installModel([textReply('重启前投递')])
  const runner = new AgentRunner(makeCtx(db))
  const taskId = insertTask(db, { conversationId: 'conv-restart' })
  let runId = null
  const bus = new AgentEventBus()
  bus.subscribe(e => { if (e.type === 'run_created' && e.taskId === taskId) runId = e.runId })
  createTaskScheduler({ db, runner, bus, deliverTask: entry => addTaskResult(db, entry) }).tick()
  assert.ok(await waitFor(() => runId && getAgentRun(db, runId)?.status !== 'running'))

  // 「重启」：boot 时的孤儿清理与 inbox 初始化重放一遍（幂等）
  initAgentRuns(db)
  initInbox(db)
  const row = listInbox(db).find(m => m.id === 'task-' + runId)
  assert.ok(row, '重启后 inbox 行仍在')
  assert.equal(row.read_at, null)
  assert.equal(getAgentRun(db, runId).status, 'succeeded', '终态运行记录不受重启影响')

  const conversations = { [PERSON]: [{ id: 'conv-restart', title: 'S', messages: [] }] }
  const { actions, conversations: after } = consumeOnce(conversations, listInbox(db))
  assert.equal(actions[0].action, 'write')
  assert.ok(findRunMessage(after, PERSON, 'conv-restart', runId))
})

// ============================================================================
// 8) 消费后重启：已读状态与已写入消息都保留，不重复消费
// ============================================================================
test('8 消费后重启不重复写入', async () => {
  const db = makeDb()
  installModel([textReply('消费后重启')])
  const runner = new AgentRunner(makeCtx(db))
  const taskId = insertTask(db, { conversationId: 'conv-after' })
  let runId = null
  const bus = new AgentEventBus()
  bus.subscribe(e => { if (e.type === 'run_created' && e.taskId === taskId) runId = e.runId })
  createTaskScheduler({ db, runner, bus, deliverTask: entry => addTaskResult(db, entry) }).tick()
  assert.ok(await waitFor(() => runId && getAgentRun(db, runId)?.status !== 'running'))

  const conversations = { [PERSON]: [{ id: 'conv-after', title: 'A', messages: [] }] }
  const first = consumeOnce(conversations, listInbox(db))
  assert.equal(first.actions[0].action, 'write')

  // 最危险窗口：写入后、确认前崩溃——行仍未读，会话快照已含消息。
  // 「重启」后从持久化快照恢复会话 + 重新拉 inbox：幂等判定必须靠
  // conversations 里已含的 runId（持久化状态），而不是内存去重。
  initInbox(db)
  const restored = JSON.parse(JSON.stringify(first.conversations))
  const second = consumeOnce(restored, listInbox(db))
  assert.equal(second.actions.filter(a => a.action === 'write').length, 0, '重启后不重复写入')
  assert.equal(second.actions.filter(a => a.action === 'already').length, 1, '已持久化的消息判定为 already')

  // 补确认后重启：行已读，消费循环直接跳过它
  assert.equal(markInboxRead(db, first.actions[0].id), true)
  initInbox(db)
  const third = consumeOnce(JSON.parse(JSON.stringify(second.conversations)), listInbox(db))
  assert.equal(third.actions.length, 0, '已读的行不再产生任何动作')
  assert.equal(markInboxRead(db, first.actions[0].id), false, '已读的行重复确认是幂等 no-op')
})

// ============================================================================
// 9) 目标会话不存在：安全失败——不建新会话、不写入、不确认已读
// ============================================================================
test('9 目标会话不存在安全失败', async () => {
  const db = makeDb()
  const content = taskResultEnvelope({ runId: 'run-gone', taskId: 't-gone', conversationId: 'conv-gone', title: 'G', answer: '找不到家的结果' })
  db.prepare('INSERT INTO assistant_inbox(id,person,content,kind,created_at) VALUES (?,?,?,\'task_result\',?)')
    .run('task-run-gone', PERSON, content, new Date().toISOString())

  const conversations = { [PERSON]: [{ id: 'conv-exists', title: 'E', messages: [] }] }
  const { actions, conversations: after } = consumeOnce(conversations, listInbox(db))
  assert.equal(actions[0].action, 'skip_missing_conversation')
  assert.equal(after[PERSON].length, 1, '不自动创建新会话')
  assert.equal(after[PERSON][0].messages.length, 0, '不写入其他会话')
  // 未确认：行保持未读，用户仍可在收件箱里看到它
  assert.equal(listInbox(db).find(m => m.id === 'task-run-gone').read_at, null)
})

// ============================================================================
// 10) 两助手任务同时执行：一次 tick 双派发，各自独立投递
// ============================================================================
test('10 两助手任务同时执行', async () => {
  const db = makeDb()
  installModel([textReply('第一个结果'), textReply('第二个结果')])
  const runner = new AgentRunner(makeCtx(db))
  const bus = new AgentEventBus()
  const task1 = insertTask(db, { person: PERSON, conversationId: 'conv-1' })
  const task2 = insertTask(db, { person: OTHER, conversationId: 'conv-2' })
  const ids = {}
  bus.subscribe(e => { if (e.type === 'run_created') ids[e.taskId] = e.runId })
  const scheduler = createTaskScheduler({ db, runner, bus, deliverTask: entry => addTaskResult(db, entry) })
  assert.equal(scheduler.tick(), 2, '一次 tick 派发两个到期任务')
  assert.ok(await waitFor(() => ids[task1] && ids[task2]
    && getAgentRun(db, ids[task1])?.status !== 'running' && getAgentRun(db, ids[task2])?.status !== 'running'))

  const results = listInbox(db).filter(m => m.kind === 'task_result')
  assert.equal(results.length, 2)
  assert.deepEqual(results.map(r => r.id).sort(), ['task-' + ids[task1], 'task-' + ids[task2]].sort())
  assert.equal(db.prepare("SELECT status FROM scheduled_tasks WHERE id=?").get(task1).status, 'completed')
  assert.equal(db.prepare("SELECT status FROM scheduled_tasks WHERE id=?").get(task2).status, 'completed')
})

// ============================================================================
// 11) 模型执行失败：不投递、任务不显示为成功、错误可追踪
// ============================================================================
test('11 模型执行失败保留可追踪状态', async () => {
  const db = makeDb()
  installFailingModel(500)
  const runner = new AgentRunner(makeCtx(db))
  const taskId = insertTask(db, {})
  let runId = null
  const bus = new AgentEventBus()
  const events = []
  bus.subscribe(e => { events.push(e); if (e.type === 'run_created' && e.taskId === taskId) runId = e.runId })
  createTaskScheduler({ db, runner, bus, deliverTask: entry => addTaskResult(db, entry) }).tick()
  assert.ok(await waitFor(() => runId && getAgentRun(db, runId)?.status !== 'running'))

  const run = getAgentRun(db, runId)
  assert.equal(run.status, 'failed')
  assert.equal(run.errorCode, 'UPSTREAM_ERROR')
  assert.ok(run.errorMessage, '错误信息可追踪')
  assert.equal(listInbox(db).filter(m => m.kind === 'task_result').length, 0, '失败不投递结果消息')
  // 失败的 once 任务不得显示为成功（completed），也不得留在 ready（会无限重跑）→ paused
  assert.equal(db.prepare('SELECT status FROM scheduled_tasks WHERE id=?').get(taskId).status, 'paused')
  const finishedEvent = events.find(e => e.type === 'task_finished')
  assert.equal(finishedEvent.status, 'failed')
  assert.equal(finishedEvent.delivered, false)
})

// ============================================================================
// 12) 任务取消：运行中取消 → cancelled，不投递、任务不显示为成功
// ============================================================================
test('12 任务取消不显示为成功', async () => {
  const db = makeDb()
  // 挂起模型 + 取消：模拟运行中用户从看板取消
  installHangingModel()
  const runner = new AgentRunner(makeCtx(db))
  const taskId = insertTask(db, {})
  let runId = null
  const bus = new AgentEventBus()
  bus.subscribe(e => { if (e.type === 'run_created' && e.taskId === taskId) runId = e.runId })
  createTaskScheduler({ db, runner, bus, deliverTask: entry => addTaskResult(db, entry) }).tick()
  assert.ok(await waitFor(() => runId), '运行已创建')
  assert.equal(runner.cancel(runId), true)
  assert.ok(await waitFor(() => getAgentRun(db, runId)?.status !== 'running'))

  const run = getAgentRun(db, runId)
  assert.equal(run.status, 'cancelled')
  assert.equal(run.errorCode, 'ABORTED')
  assert.equal(listInbox(db).filter(m => m.kind === 'task_result').length, 0, '取消不投递')
  assert.equal(db.prepare('SELECT status FROM scheduled_tasks WHERE id=?').get(taskId).status, 'paused', '取消不显示为成功')
})

// ============================================================================
// 13) 任务超时：run 级 deadline 触发 → timed_out，不投递、任务不显示为成功
// ============================================================================
test('13 任务超时记为 timed_out', async () => {
  const db = makeDb()
  installHangingModel()
  const ctx = makeCtx(db)
  ctx.runTimeoutMs = 150 // 极小超时用于测试
  const runner = new AgentRunner(ctx)
  const taskId = insertTask(db, {})
  let runId = null
  const bus = new AgentEventBus()
  bus.subscribe(e => { if (e.type === 'run_created' && e.taskId === taskId) runId = e.runId })
  createTaskScheduler({ db, runner, bus, deliverTask: entry => addTaskResult(db, entry) }).tick()
  assert.ok(await waitFor(() => runId && getAgentRun(db, runId)?.status !== 'running', 5000))

  const run = getAgentRun(db, runId)
  assert.equal(run.status, 'timed_out')
  assert.equal(run.errorCode, 'RUN_TIMEOUT')
  assert.equal(listInbox(db).filter(m => m.kind === 'task_result').length, 0, '超时不投递')
  assert.equal(db.prepare('SELECT status FROM scheduled_tasks WHERE id=?').get(taskId).status, 'paused', '超时不显示为成功')
})

// ============================================================================
// 14) 重复任务（daily）失败后按既定周期继续，不中断也不假装成功
// ============================================================================
test('14 重复任务失败后仍按周期继续', async () => {
  const db = makeDb()
  installFailingModel(500)
  const runner = new AgentRunner(makeCtx(db))
  const taskId = insertTask(db, { recurrence: 'daily', conversationId: null })
  let runId = null
  const bus = new AgentEventBus()
  bus.subscribe(e => { if (e.type === 'run_created' && e.taskId === taskId) runId = e.runId })
  createTaskScheduler({ db, runner, bus, deliverTask: entry => addTaskResult(db, entry) }).tick()
  assert.ok(await waitFor(() => runId && getAgentRun(db, runId)?.status !== 'running'))

  const row = db.prepare('SELECT status, run_at FROM scheduled_tasks WHERE id=?').get(taskId)
  assert.equal(row.status, 'scheduled', '重复任务保持 scheduled 以按周期继续')
  assert.ok(new Date(row.run_at) > new Date(), '下一次执行时间已顺延到未来')
  assert.equal(listInbox(db).filter(m => m.kind === 'task_result').length, 0)
})

// ============================================================================
// 15) 无绑定会话的旧任务：结果留在收件箱可追溯，不自动建会话
// ============================================================================
test('15 无绑定会话的任务安全降级', async () => {
  const db = makeDb()
  installModel([textReply('没有绑定会话的结果')])
  const runner = new AgentRunner(makeCtx(db))
  const taskId = insertTask(db, { conversationId: null })
  let runId = null
  const bus = new AgentEventBus()
  bus.subscribe(e => { if (e.type === 'run_created' && e.taskId === taskId) runId = e.runId })
  createTaskScheduler({ db, runner, bus, deliverTask: entry => addTaskResult(db, entry) }).tick()
  assert.ok(await waitFor(() => runId && getAgentRun(db, runId)?.status !== 'running'))

  // 仍投递（结果不丢），但前端决策是 skip_no_conversation——绝不建新会话
  const row = listInbox(db).find(m => m.id === 'task-' + runId)
  assert.ok(row, '无绑定会话也投递，结果保留在收件箱')
  const { actions, conversations: after } = consumeOnce({ [PERSON]: [{ id: 'conv-z', title: 'Z', messages: [] }] }, listInbox(db))
  assert.equal(actions[0].action, 'skip_no_conversation')
  assert.equal(after[PERSON].length, 1, '不自动创建会话')
})

// ============================================================================
// 16) 新助手身份可投递：inbox 身份校验与 isValidAssistantId 对齐
// ============================================================================
test('16 新建助手的任务结果可投递', () => {
  const db = makeDb()
  const fresh = 'assistant-newguy1'
  const result = addTaskResult(db, { person: fresh, runId: 'run-new', taskId: 't-new', conversationId: 'conv-new', title: '新助手', answer: '新助手的结果' })
  assert.equal(result.inserted, true)
  assert.equal(result.message.person, fresh)
  // 普通消息通道同样接受新助手
  const msg = addInboxMessage(db, { person: fresh, content: '普通消息', kind: 'message' })
  assert.equal(msg.person, fresh)
  // 非法身份仍然拒绝
  assert.throws(() => addTaskResult(db, { person: 'not-an-assistant', runId: 'r', answer: 'x' }), /无效人物/)
  assert.throws(() => addTaskResult(db, { person: fresh, runId: '', answer: 'x' }), /运行标识无效/)
})

// ============================================================================
// 17) 信封健壮性：坏 JSON / 缺 runId 一律 skip_invalid，绝不渲染
// ============================================================================
test('17 坏信封安全跳过', () => {
  assert.equal(decideTaskConsumption([], 'not json').action, 'skip_invalid')
  assert.equal(decideTaskConsumption([], JSON.stringify({ hello: 'world' })).action, 'skip_invalid')
  assert.equal(decideTaskConsumption([], JSON.stringify({ runId: '' })).action, 'skip_invalid')
  assert.equal(decideTaskConsumption(null, null).action, 'skip_invalid')
  // 正常信封解析
  const env = parseTaskEnvelope(taskResultEnvelope({ runId: 'r1', taskId: 't1', conversationId: 'c1', title: 'T', answer: 'A' }))
  assert.deepEqual(env, { runId: 'r1', taskId: 't1', conversationId: 'c1', title: 'T', answer: 'A' })
})

// ============================================================================
// 18) 备份文件可实际打开读取（第一轮复核项 4）
// ============================================================================
test('18 SQLite 备份文件可打开读取', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ai-home-backup-'))
  try {
    const dbPath = join(dir, 'ai-home.sqlite')
    const db = new DatabaseSync(dbPath)
    db.exec('CREATE TABLE memories (id TEXT PRIMARY KEY, content TEXT NOT NULL)')
    db.prepare('INSERT INTO memories VALUES (?,?)').run('m1', '备份里的记忆')

    const result = createRollingBackup(db, dbPath)
    assert.equal(result.ok, true)
    // 用只读方式打开备份文件，真实读回数据
    const backup = new DatabaseSync(result.target, { readOnly: true })
    const row = backup.prepare('SELECT content FROM memories WHERE id=?').get('m1')
    assert.equal(row.content, '备份里的记忆')
    backup.close()
    db.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ============================================================================
// 19) 备份保留份数与失败行为（第一轮复核项 5）
// ============================================================================
test('19 备份保留份数限制与失败不阻断', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ai-home-backup-keep-'))
  try {
    const dbPath = join(dir, 'ai-home.sqlite')
    const db = new DatabaseSync(dbPath)
    db.exec('CREATE TABLE t (x TEXT)')
    const backupDir = join(dir, 'backups')
    // 预先放置 7 个旧备份（文件名按时间排序，旧的在前）
    mkdirSync(backupDir, { recursive: true })
    for (let i = 1; i <= 7; i++) {
      writeFileSync(join(backupDir, `ai-home-2020-01-0${i}T00-00-00-000Z.sqlite`), 'old')
    }
    const result = createRollingBackup(db, dbPath)
    assert.equal(result.ok, true)
    const files = readdirSync(backupDir).filter(f => /^ai-home-.*\.sqlite$/.test(f))
    assert.equal(files.length, 5, '7 旧 + 1 新 → 收敛到保留上限 5 份（含最新）')
    assert.ok(!files.includes('ai-home-2020-01-01T00-00-00-000Z.sqlite'), '最旧的备份被清理')
    assert.ok(!files.includes('ai-home-2020-01-03T00-00-00-000Z.sqlite'), '超出保留窗口的旧备份被清理')
    assert.ok(files.includes('ai-home-2020-01-04T00-00-00-000Z.sqlite'), '保留窗口内的备份不被误删')

    // 失败行为：备份目录无法创建（父路径是一个文件）→ 返回 ok:false 且不抛错
    const blocker = join(dir, 'blocker')
    writeFileSync(blocker, 'not a dir')
    const failed = createRollingBackup(db, join(blocker, 'nested', 'ai-home.sqlite'))
    assert.equal(failed.ok, false)
    assert.ok(failed.error, '失败带可诊断的错误信息')
    db.close()
  } finally {
    // Windows 下 sqlite 句柄释放可能有延迟，临时目录清理失败不影响断言结论。
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* best-effort */ }
  }
})

// ============================================================================
// 20) 崩溃遗留的 ready 任务：boot 恢复重排后重跑并投递（调度器认领语义修复的回归）
// ============================================================================
test('20 崩溃遗留 ready 任务在启动时恢复重跑', async () => {
  const db = makeDb()
  // 模拟崩溃现场：任务已认领（ready）但进程死了；boot 时孤儿 run 被标 SERVER_RESTART
  const taskId = insertTask(db, { conversationId: 'conv-crash' })
  db.prepare(`UPDATE scheduled_tasks SET status='ready' WHERE id=?`).run(taskId)
  const orphan = createAgentRun(db, {
    assistantId: PERSON, source: 'scheduled', prompt: '执行测试内容',
    taskId, conversationId: 'conv-crash',
  })
  initAgentRuns(db) // boot 孤儿清理
  assert.equal(getAgentRun(db, orphan.id).status, 'failed')
  assert.equal(getAgentRun(db, orphan.id).errorCode, 'SERVER_RESTART')

  // boot 恢复：ready → scheduled，下个 tick 重跑
  assert.equal(recoverInterruptedTasks(db), 1)
  assert.equal(db.prepare('SELECT status FROM scheduled_tasks WHERE id=?').get(taskId).status, 'scheduled')

  installModel([textReply('崩溃恢复后的结果')])
  const runner = new AgentRunner(makeCtx(db))
  const bus = new AgentEventBus()
  let runId = null
  bus.subscribe(e => { if (e.type === 'run_created' && e.taskId === taskId) runId = e.runId })
  createTaskScheduler({ db, runner, bus, deliverTask: entry => addTaskResult(db, entry) }).tick()
  assert.ok(await waitFor(() => runId && getAgentRun(db, runId)?.status !== 'running'))
  assert.notEqual(runId, orphan.id, '恢复后创建的是新 run')

  const row = listInbox(db).find(m => m.kind === 'task_result')
  assert.ok(row, '恢复的运行照常投递')
  assert.equal(parseTaskEnvelope(row.content).answer, '崩溃恢复后的结果')
  assert.equal(db.prepare('SELECT status FROM scheduled_tasks WHERE id=?').get(taskId).status, 'completed')
})

console.log('task delivery suite: 20 scenarios registered')
