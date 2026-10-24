// Agent Runner acceptance suite (stage 8): the 15 scenarios from the spec,
// run in-process against an in-memory SQLite database.
//
// The "model" is a scripted fetch stub — every reply (tool_calls or final
// text) is pre-written, so the loop is deterministic. MCP is the local Fake
// MCP server (src/server/fakeMcp.mjs); no network, no real keys.
//
// Run with: npm test   (node --test tests/)
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { initAgentRuns, createAgentRun, finishAgentRun, getAgentRun, listAgentRuns } from '../src/server/agent/AgentRunStore.mjs'
import { AgentEventBus } from '../src/server/agent/AgentEventBus.mjs'
import { AgentRunner } from '../src/server/agent/AgentRunner.mjs'
import { initToolLogs, listToolLogs } from '../src/toolLog.mjs'
import { initToolPolicies, setPolicy } from '../src/server/agent/ToolPolicy.mjs'
import { decideApproval, pendingList } from '../src/server/agent/ApprovalGate.mjs'
import { createTaskScheduler } from '../src/server/agent/TaskScheduler.mjs'
import { createToolRegistry } from '../src/server/agent/ToolRegistry.mjs'
import { createFakeMcpServer, fakeMcpConnection } from '../src/server/fakeMcp.mjs'
import { initProactive } from '../src/proactive.mjs'
import { initProactiveHeat, dispatchProactiveRun } from '../src/server/agent/ProactiveHeat.mjs'
import { initMemoryStore, SQLiteMemoryProvider } from '../src/server/agent/MemoryStore.mjs'
import { migrateDatabase, migrateSnapshot } from '../src/server/identity.mjs'

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
  return db
}

// Scripted OpenAI-compatible endpoint. Each fetch() consumes the next reply;
// every request body is recorded so tests can assert what the model saw.
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

const usage = { prompt_tokens: 10, completion_tokens: 5 }
const textReply = text => ({ choices: [{ message: { content: text } }], usage })
const toolReply = calls => ({
  choices: [{ message: { content: '', tool_calls: calls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args || {}) } })) } }],
  usage,
})

function makeCtx(db, fake) {
  const bus = new AgentEventBus()
  return {
    db, bus,
    providerFor: () => ({ endpoint: 'https://fake.test/v1', apiKey: 'sk-test', model: 'fake-model' }),
    displayNameFor: () => '测试助手',
    mcpList: row => fake.list(row),
    mcpCall: (row, name, args) => fake.call(name, args),
  }
}

const PERSON = 'assistant-yanweixi'
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function waitFor(predicate, timeoutMs = 3000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true
    await sleep(20)
  }
  return false
}

// ============================================================================
// 1) 单工具成功：模型调用一次工具 -> 真实执行 -> 记录成功 -> 最终回复
// ============================================================================
test('1 单工具成功', async () => {
  const db = makeDb()
  const fake = createFakeMcpServer()
  const { row } = fakeMcpConnection(db, PERSON, fake)
  const echoName = 'mcp_' + row.id.slice(0, 8) + '_echo'
  const requests = installModel([
    toolReply([{ id: 'c1', name: echoName, args: { text: 'ping' } }]),
    textReply('工具返回了 ping'),
  ])
  const ctx = makeCtx(db, fake)
  const runner = new AgentRunner(ctx)
  const run = createAgentRun(db, { assistantId: PERSON, source: 'manual', prompt: 'echo 一下' })
  const finished = await runner.start(run).promise

  assert.equal(finished.status, 'succeeded')
  assert.equal(finished.toolCalls, 1)
  assert.match(finished.answer, /ping/)
  const logs = listToolLogs(db, { runId: run.id })
  assert.equal(logs.length, 1)
  assert.equal(logs[0].status, 'succeeded')
  assert.equal(logs[0].source, 'mcp')
  assert.match(JSON.stringify(logs[0].resultSummary), /ping/)
  // 第二轮请求带上了 role=tool 的真实回执
  const toolMsg = requests[1].messages.find(m => m.role === 'tool')
  assert.equal(toolMsg.tool_call_id, 'c1')
  assert.match(toolMsg.content, /ping/)
})

// ============================================================================
// 2) 工具失败并回传模型：失败以 role=tool 回传，模型基于错误如实回答
// ============================================================================
test('2 工具失败并回传模型', async () => {
  const db = makeDb()
  const fake = createFakeMcpServer()
  const { row } = fakeMcpConnection(db, PERSON, fake)
  const failName = 'mcp_' + row.id.slice(0, 8) + '_always_fail'
  const requests = installModel([
    toolReply([{ id: 'c1', name: failName, args: { reason: '鉴权过期' } }]),
    textReply('工具调用失败了，原因是鉴权过期'),
  ])
  const runner = new AgentRunner(makeCtx(db, fake))
  const run = createAgentRun(db, { assistantId: PERSON, source: 'manual', prompt: '调用必然失败的工具' })
  const finished = await runner.start(run).promise

  assert.equal(finished.status, 'succeeded') // 运行本身不因工具失败而崩溃
  assert.match(finished.answer, /失败/)
  const logs = listToolLogs(db, { runId: run.id })
  assert.equal(logs[0].status, 'failed')
  assert.match(logs[0].errorMessage, /鉴权过期/)
  const toolMsg = requests[1].messages.find(m => m.role === 'tool')
  assert.match(toolMsg.content, /^\[错误\]/) // 模型收到的是真实错误回执
  assert.equal(toolMsg.tool_call_id, 'c1')
})

// ============================================================================
// 3) 连续两步工具调用：两轮各调用一次工具，全部落账
// ============================================================================
test('3 连续两步工具调用', async () => {
  const db = makeDb()
  const fake = createFakeMcpServer()
  const { row } = fakeMcpConnection(db, PERSON, fake)
  const echoName = 'mcp_' + row.id.slice(0, 8) + '_echo'
  installModel([
    toolReply([{ id: 'c1', name: echoName, args: { text: '第一步' } }]),
    toolReply([{ id: 'c2', name: echoName, args: { text: '第二步' } }]),
    textReply('两步都完成了'),
  ])
  const runner = new AgentRunner(makeCtx(db, fake))
  const run = createAgentRun(db, { assistantId: PERSON, source: 'manual', prompt: '连续调用两次工具' })
  const finished = await runner.start(run).promise

  assert.equal(finished.status, 'succeeded')
  assert.equal(finished.toolCalls, 2)
  assert.equal(finished.rounds, 3) // 两轮工具 + 一轮总结
  const logs = listToolLogs(db, { runId: run.id })
  assert.equal(logs.length, 2)
  assert.ok(logs.every(l => l.status === 'succeeded'))
})

// ============================================================================
// 4) 多工具并行请求按 tool_call_id 正确对应结果
// ============================================================================
test('4 并行多工具按 tool_call_id 对应', async () => {
  const db = makeDb()
  const fake = createFakeMcpServer()
  const { row } = fakeMcpConnection(db, PERSON, fake)
  const echoName = 'mcp_' + row.id.slice(0, 8) + '_echo'
  const requests = installModel([
    toolReply([
      { id: 'call_a', name: echoName, args: { text: 'AAA' } },
      { id: 'call_b', name: echoName, args: { text: 'BBB' } },
    ]),
    textReply('两个结果都拿到了'),
  ])
  const runner = new AgentRunner(makeCtx(db, fake))
  const run = createAgentRun(db, { assistantId: PERSON, source: 'manual', prompt: '并行调用两个工具' })
  const finished = await runner.start(run).promise

  assert.equal(finished.toolCalls, 2)
  const toolMsgs = requests[1].messages.filter(m => m.role === 'tool')
  assert.equal(toolMsgs.length, 2)
  const byId = Object.fromEntries(toolMsgs.map(m => [m.tool_call_id, m.content]))
  assert.match(byId.call_a, /AAA/) // 各自的结果回到各自的 id，不串
  assert.match(byId.call_b, /BBB/)
})

// ============================================================================
// 5) MCP 掉线不影响普通聊天
// ============================================================================
test('5 MCP 掉线不影响普通聊天', async () => {
  const db = makeDb()
  const fake = createFakeMcpServer()
  fakeMcpConnection(db, PERSON, fake)
  // 服务器列表接口直接抛错（掉线）；注册表必须优雅跳过
  const ctx = makeCtx(db, fake)
  ctx.mcpList = () => { throw new Error('connect ECONNREFUSED') }
  installModel([textReply('没有工具我也能回答')])
  const runner = new AgentRunner(ctx)
  const run = createAgentRun(db, { assistantId: PERSON, source: 'manual', prompt: '随便聊聊' })
  const finished = await runner.start(run).promise
  assert.equal(finished.status, 'succeeded')
  assert.equal(finished.answer, '没有工具我也能回答')
  assert.equal(finished.toolCalls, 0)

  // 反向：服务器列表成功但调用时掉线 -> 错误回传，运行不崩
  const fake2 = createFakeMcpServer()
  const conn2 = fakeMcpConnection(db, PERSON, fake2)
  const echoName = 'mcp_' + conn2.row.id.slice(0, 8) + '_echo'
  const requests = installModel([
    toolReply([{ id: 'c1', name: echoName, args: { text: 'hi' } }]),
    textReply('工具暂时不可用，稍后再试'),
  ])
  const ctx2 = makeCtx(db, fake2)
  ctx2.mcpCall = () => { throw new Error('socket hang up') }
  const run2 = createAgentRun(db, { assistantId: PERSON, source: 'manual', prompt: '调用会掉线的工具' })
  const finished2 = await new AgentRunner(ctx2).start(run2).promise
  assert.equal(finished2.status, 'succeeded')
  const toolMsg = requests[1].messages.find(m => m.role === 'tool')
  assert.match(toolMsg.content, /^\[错误\]/)
})

// ============================================================================
// 6) 写工具等待审批：policy=ask 挂起 -> 批准 -> 真实执行
// ============================================================================
test('6 写工具等待审批后执行', async () => {
  const db = makeDb()
  const fake = createFakeMcpServer()
  const { row } = fakeMcpConnection(db, PERSON, fake)
  const toolName = 'mcp_' + row.id.slice(0, 8) + '_requires_approval'
  setPolicy(db, PERSON, toolName, 'ask')
  const requests = installModel([
    toolReply([{ id: 'c1', name: toolName, args: { action: '发送通知' } }]),
    textReply('已按你的批准执行'),
  ])
  const runner = new AgentRunner(makeCtx(db, fake))
  const run = createAgentRun(db, { assistantId: PERSON, source: 'manual', prompt: '执行需要审批的操作' })
  const handle = runner.start(run)

  const appeared = await waitFor(() => pendingList().some(p => p.runId === run.id))
  assert.ok(appeared, '工具应挂起等待审批')
  const pending = pendingList().find(p => p.runId === run.id)
  assert.equal(decideApproval(pending.logId, 'approve'), 'approved')

  const finished = await handle.promise
  assert.equal(finished.status, 'succeeded')
  const logs = listToolLogs(db, { runId: run.id })
  assert.equal(logs[0].status, 'succeeded') // 批准后真实执行并成功
  assert.equal(fake.calls.filter(c => c.tool === 'requires_approval').length, 1)
  const toolMsg = requests[1].messages.find(m => m.role === 'tool')
  assert.doesNotMatch(toolMsg.content, /^\[(错误|未批准)\]/) // 模型收到的是真实结果
})

// ============================================================================
// 7) 拒绝审批后模型收到拒绝结果
// ============================================================================
test('7 拒绝审批后模型收到拒绝', async () => {
  const db = makeDb()
  const fake = createFakeMcpServer()
  const { row } = fakeMcpConnection(db, PERSON, fake)
  const toolName = 'mcp_' + row.id.slice(0, 8) + '_requires_approval'
  setPolicy(db, PERSON, toolName, 'ask')
  const requests = installModel([
    toolReply([{ id: 'c1', name: toolName, args: { action: '危险操作' } }]),
    textReply('你拒绝了这次操作，我没有执行'),
  ])
  const runner = new AgentRunner(makeCtx(db, fake))
  const run = createAgentRun(db, { assistantId: PERSON, source: 'manual', prompt: '执行被拒绝的操作' })
  const handle = runner.start(run)

  await waitFor(() => pendingList().some(p => p.runId === run.id))
  const pending = pendingList().find(p => p.runId === run.id)
  assert.equal(decideApproval(pending.logId, 'reject'), 'rejected')

  const finished = await handle.promise
  assert.equal(finished.status, 'succeeded')
  const logs = listToolLogs(db, { runId: run.id })
  assert.equal(logs[0].status, 'cancelled')
  assert.equal(logs[0].errorCode, 'APPROVAL_REJECTED')
  const toolMsg = requests[1].messages.find(m => m.role === 'tool')
  assert.match(toolMsg.content, /^\[未批准\]/) // 拒绝结果回传给模型
  assert.equal(fake.calls.length, 0) // 拒绝后工具绝不执行
})

// ============================================================================
// 8) 取消运行：AbortController 生效，状态 cancelled
// ============================================================================
test('8 取消运行', async () => {
  const db = makeDb()
  const fake = createFakeMcpServer()
  const { row } = fakeMcpConnection(db, PERSON, fake)
  const slowName = 'mcp_' + row.id.slice(0, 8) + '_delayed_success'
  installModel([
    toolReply([{ id: 'c1', name: slowName, args: { delayMs: 1500 } }]),
    textReply('不应该到达这一句'),
  ])
  const runner = new AgentRunner(makeCtx(db, fake))
  const run = createAgentRun(db, { assistantId: PERSON, source: 'manual', prompt: '执行慢工具' })
  const handle = runner.start(run)
  await sleep(150)
  assert.equal(runner.cancel(run.id), true)
  const finished = await handle.promise

  assert.equal(finished.status, 'cancelled')
  assert.equal(finished.errorCode, 'ABORTED')
  const logs = listToolLogs(db, { runId: run.id })
  // 工具本身（fake）不监听 abort，可能先执行成功；关键是运行被取消且不再有新一轮
  assert.ok(logs.length === 0 || ['cancelled', 'succeeded'].includes(logs[0].status))
})

// ============================================================================
// 9) 刷新/重启后恢复运行状态和调用记录（全部持久化在 SQLite）
// ============================================================================
test('9 运行状态与调用记录持久化可恢复', async () => {
  const db = makeDb()
  const fake = createFakeMcpServer()
  const { row } = fakeMcpConnection(db, PERSON, fake)
  const echoName = 'mcp_' + row.id.slice(0, 8) + '_echo'
  installModel([
    toolReply([{ id: 'c1', name: echoName, args: { text: 'hello' } }]),
    textReply('完成'),
  ])
  const runner = new AgentRunner(makeCtx(db, fake))
  const run = createAgentRun(db, { assistantId: PERSON, source: 'manual', prompt: '留下记录' })
  await runner.start(run).promise

  // "刷新页面"：前端只依赖服务端数据，重新查询必须完整还原
  const restored = getAgentRun(db, run.id)
  assert.equal(restored.status, 'succeeded')
  assert.equal(restored.answer, '完成')
  assert.equal(listToolLogs(db, { runId: run.id }).length, 1)
  assert.equal(listAgentRuns(db, { assistantId: PERSON }).length, 1)

  // "服务重启"：孤儿 running 行在 boot 时被标记失败，绝不永远转圈
  const orphan = createAgentRun(db, { assistantId: PERSON, source: 'manual', prompt: '重启前未完成' })
  initAgentRuns(db) // 模拟重启时的初始化
  assert.equal(getAgentRun(db, orphan.id).status, 'failed')
  assert.equal(getAgentRun(db, orphan.id).errorCode, 'SERVER_RESTART')
  // 终态不受重启影响
  assert.equal(getAgentRun(db, run.id).status, 'succeeded')
})

// ============================================================================
// 10) 同一 idempotencyKey 不重复执行写操作
// ============================================================================
test('10 幂等键防止重复执行', async () => {
  const db = makeDb()
  const fake = createFakeMcpServer()
  const { row } = fakeMcpConnection(db, PERSON, fake)
  const writeName = 'mcp_' + row.id.slice(0, 8) + '_write_once'
  const requests = installModel([
    toolReply([{ id: 'c1', name: writeName, args: { key: 'order-1', value: '42' } }]),
    textReply('写入完成'),
  ])
  const runner = new AgentRunner(makeCtx(db, fake))

  // 同一个幂等键提交两次 -> 复用同一条运行，工具只执行一次
  const first = createAgentRun(db, { assistantId: PERSON, source: 'manual', prompt: '写入订单 1', idempotencyKey: 'order-1' })
  assert.equal(first.reused, false)
  await runner.start(first).promise
  const second = createAgentRun(db, { assistantId: PERSON, source: 'manual', prompt: '写入订单 1', idempotencyKey: 'order-1' })
  assert.equal(second.reused, true)
  assert.equal(second.id, first.id)

  assert.equal(fake.calls.filter(c => c.tool === 'write_once').length, 1)
  assert.equal(listAgentRuns(db, { assistantId: PERSON }).length, 1)
  // 不同的键仍然是新的运行
  const third = createAgentRun(db, { assistantId: PERSON, source: 'manual', prompt: '写入订单 2', idempotencyKey: 'order-2' })
  assert.equal(third.reused, false)
  assert.notEqual(third.id, first.id)
  assert.ok(requests.length >= 2)
})

// ============================================================================
// 11) 助手 A 无法访问助手 B 的 MCP、记忆和会话
// ============================================================================
test('11 助手之间完全隔离', async () => {
  const db = makeDb()
  const fakeA = createFakeMcpServer()
  const fakeB = createFakeMcpServer()
  const connA = fakeMcpConnection(db, 'assistant-yanweixi', fakeA)
  const connB = fakeMcpConnection(db, 'assistant-yanshuo', fakeB)

  // MCP：A 的注册表只看得到 A 的连接
  const regA = await createToolRegistry({ db, person: 'assistant-yanweixi', mcpList: r => fakeA.list(r), mcpCall: (r, n, a) => fakeA.call(n, a) })
  const regB = await createToolRegistry({ db, person: 'assistant-yanshuo', mcpList: r => fakeB.list(r), mcpCall: (r, n, a) => fakeB.call(n, a) })
  assert.ok(regA.mcpTools.length > 0)
  assert.ok(regA.mcpTools.every(t => t.includes(connA.row.id.slice(0, 8))), 'A 的工具都来自 A 的连接')
  assert.ok(!regA.mcpTools.some(t => t.includes(connB.row.id.slice(0, 8))), 'A 看不到 B 的工具')
  assert.ok(regB.mcpTools.every(t => t.includes(connB.row.id.slice(0, 8))), 'B 的工具都来自 B 的连接')

  // 记忆：A 写入的 active 记忆，B 搜不到
  const memA = SQLiteMemoryProvider(db)
  memA.propose({ person: 'assistant-yanweixi', title: 'A 的记忆', content: '只有 A 知道的秘密约定', createdBy: 'user' })
  assert.equal(memA.search({ person: 'assistant-yanweixi', query: '秘密约定' }).length, 1)
  assert.equal(memA.search({ person: 'assistant-yanshuo', query: '秘密约定' }).length, 0)

  // 运行记录：按 assistantId 隔离
  createAgentRun(db, { assistantId: 'assistant-yanshuo', source: 'manual', prompt: 'B 的任务' })
  assert.equal(listAgentRuns(db, { assistantId: 'assistant-yanweixi' }).length, 0)
  assert.equal(listAgentRuns(db, { assistantId: 'assistant-yanshuo' }).length, 1)
})

// ============================================================================
// 12) 定时任务写回原 conversationId
// ============================================================================
test('12 定时任务绑定原会话', async () => {
  const db = makeDb()
  const fake = createFakeMcpServer()
  installModel([textReply('定时任务完成')])
  const runner = new AgentRunner(makeCtx(db, fake))

  const now = new Date()
  db.prepare(`INSERT INTO scheduled_tasks (id,person,title,prompt,run_at,recurrence,status,created_at,updated_at,conversation_id)
    VALUES ('task-1',?, '早报', '生成早报', ?, 'once', 'scheduled', ?, ?, 'conv-timer-1')`)
    .run(PERSON, new Date(now.getTime() - 1000).toISOString(), now.toISOString(), now.toISOString())

  let runId = null
  const bus = new AgentEventBus()
  bus.subscribe(e => { if (e.type === 'run_created' && e.taskId === 'task-1') runId = e.runId })
  const scheduler = createTaskScheduler({ db, runner, bus })
  assert.equal(scheduler.tick(), 1)

  const gotRun = await waitFor(() => runId && getAgentRun(db, runId)?.status !== 'running')
  assert.ok(gotRun, '定时任务运行应完成')
  const finished = getAgentRun(db, runId)
  assert.equal(finished.status, 'succeeded')
  assert.equal(finished.source, 'scheduled')
  assert.equal(finished.conversationId, 'conv-timer-1') // 写回原会话
  assert.equal(finished.taskId, 'task-1')
  // once 任务完成后进入 completed
  assert.equal(db.prepare('SELECT status FROM scheduled_tasks WHERE id=?').get('task-1').status, 'completed')
})

// ============================================================================
// 13) 主动任务写回原 conversationId
// ============================================================================
test('13 主动任务绑定原会话并投递', async () => {
  const db = makeDb()
  const fake = createFakeMcpServer()
  initProactive(db)
  initProactiveHeat(db)
  installModel([textReply('突然想提醒你带伞')])
  const runner = new AgentRunner(makeCtx(db, fake))
  const delivered = []
  const bus = new AgentEventBus()
  db.prepare(`INSERT INTO proactive_events (id,person,reason,mood,status,created_at,updated_at)
    VALUES ('evt-1',?, 'heat', 'calm', 'pending', ?, ?)`)
    .run(PERSON, new Date().toISOString(), new Date().toISOString())

  assert.equal(dispatchProactiveRun({
    db, runner, bus, person: PERSON, eventId: 'evt-1', reason: 'heat_threshold',
    conversationId: 'conv-home',
    deliver: (person, content) => delivered.push({ person, content }),
  }), true)

  const done = await waitFor(() => {
    const evt = db.prepare('SELECT status, run_id FROM proactive_events WHERE id=?').get('evt-1')
    return evt.run_id && evt.status !== 'pending'
  })
  assert.ok(done, '主动运行应完成并结算')
  const runId = db.prepare('SELECT run_id FROM proactive_events WHERE id=?').get('evt-1').run_id
  const run = getAgentRun(db, runId)
  assert.equal(run.source, 'proactive')
  assert.equal(run.conversationId, 'conv-home') // 写回原会话
  assert.equal(delivered.length, 1)
  assert.match(delivered[0].content, /带伞/)
  assert.equal(db.prepare('SELECT status FROM proactive_events WHERE id=?').get('evt-1').status, 'sent')
})

// ============================================================================
// 14) 模型声称完成但没有成功工具回执 -> 不显示"已验证执行"
// ============================================================================
test('14 无成功回执不得显示已验证执行', async () => {
  const db = makeDb()
  const fake = createFakeMcpServer()
  const { row } = fakeMcpConnection(db, PERSON, fake)
  const failName = 'mcp_' + row.id.slice(0, 8) + '_always_fail'
  installModel([
    toolReply([{ id: 'c1', name: failName, args: {} }]),
    textReply('我已经完成了全部操作 ✓'), // 模型口头声称完成
  ])
  const runner = new AgentRunner(makeCtx(db, fake))
  const run = createAgentRun(db, { assistantId: PERSON, source: 'manual', prompt: '执行操作' })
  const finished = await runner.start(run).promise

  assert.match(finished.answer, /完成/) // 模型确实声称完成了
  // 但真实的执行记录里没有任何一条成功回执 -> UI（只渲染真实记录）不可能显示"已验证执行"
  const logs = listToolLogs(db, { runId: run.id })
  assert.equal(logs.length, 1)
  assert.equal(logs[0].status, 'failed')
  assert.ok(!logs.some(l => l.status === 'succeeded'), '不存在成功回执')
})

// ============================================================================
// 15) 旧 version 2 数据迁移后不丢失、不串助手
// ============================================================================
test('15 version2 数据迁移不丢失不串助手', () => {
  const db = makeDb()
  // 旧库：person 列带 CHECK 约束 + 中文名数据
  db.exec(`CREATE TABLE mcp_legacy (
    id TEXT PRIMARY KEY, person TEXT NOT NULL CHECK(person IN ('晏未晞','言朔')),
    name TEXT NOT NULL, url TEXT NOT NULL, transport TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1, token_enc TEXT NOT NULL, updated_at TEXT NOT NULL
  )`)
  db.exec(`DROP TABLE mcp_connections`)
  db.exec(`ALTER TABLE mcp_legacy RENAME TO mcp_connections`)
  db.prepare('INSERT INTO mcp_connections (id,person,name,url,transport,token_enc,updated_at) VALUES (?,?,?,?,?,?,?)')
    .run('legacy-1', '晏未晞', '旧服务', 'https://old.example/mcp', 'streamablehttp', 'enc', new Date().toISOString())
  db.prepare('INSERT INTO mcp_connections (id,person,name,url,transport,token_enc,updated_at) VALUES (?,?,?,?,?,?,?)')
    .run('legacy-2', '言朔', '另一个服务', 'https://old2.example/mcp', 'streamablehttp', 'enc', new Date().toISOString())

  const v2 = {
    version: 2,
    conversations: { '晏未晞': [{ id: 'c1', title: '旧对话', messages: [], updatedAt: '2026-01-01T00:00:00.000Z' }] },
    memory: { '晏未晞': '旧记忆文本', '言朔': '另一个记忆' },
    modelConfig: { '晏未晞': { endpoint: 'https://api.test/v1', model: 'm' } },
  }
  migrateDatabase(db)
  const migrated = migrateSnapshot(v2)

  // 快照：键换成稳定 id，数据一条不少
  assert.equal(migrated.version, 3)
  assert.ok(migrated.conversations['assistant-yanweixi'].length === 1)
  assert.equal(migrated.conversations['assistant-yanweixi'][0].title, '旧对话')
  assert.equal(migrated.memory['assistant-yanshuo'], '另一个记忆')
  assert.equal(migrated.assistants.length, 2)

  // 数据库：person 值全部换成 id，两条连接都还在、不合并
  const rows = db.prepare('SELECT id, person, name FROM mcp_connections ORDER BY id').all()
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map(r => r.person).sort(), ['assistant-yanshuo', 'assistant-yanweixi'].sort())
  assert.ok(!rows.some(r => /未晞|言朔/.test(r.person)), '不再有中文名 person')

  // 幂等：重复迁移不复制、不丢失
  migrateDatabase(db)
  const again = migrateSnapshot(migrated)
  assert.equal(again, null) // v3 快照无需再迁移
  assert.equal(db.prepare('SELECT count(*) AS n FROM mcp_connections').get().n, 2)

  // finishAgentRun 的幂等：终态不被覆盖
  const run = createAgentRun(db, { assistantId: PERSON, source: 'manual', prompt: 'x' })
  finishAgentRun(db, run.id, { status: 'succeeded', answer: 'ok' })
  const replayed = finishAgentRun(db, run.id, { status: 'failed', answer: 'hacked' })
  assert.equal(replayed.status, 'succeeded')
  assert.equal(replayed.answer, 'ok')
})

console.log('agent acceptance suite: 15 scenarios registered')
