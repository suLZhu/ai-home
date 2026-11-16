// 动态时间上下文验收套件。
// 覆盖：跨日、时区换算、上午/下午/深夜边界、非法时区回退、
// 独立 system 消息注入（不覆盖原有 system）、Runner 每轮携带当前时间、
// 用户配置时区在 Runner 生效、不注入天气/位置信息。
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import {
  DEFAULT_TIME_ZONE, normalizeTimeZone, partOfDayOf,
  buildTimeContext, timeContextText, injectTimeContext,
} from '../src/timeContext.mjs'
import { initAgentRuns, createAgentRun } from '../src/server/agent/AgentRunStore.mjs'
import { AgentEventBus } from '../src/server/agent/AgentEventBus.mjs'
import { AgentRunner } from '../src/server/agent/AgentRunner.mjs'
import { initToolLogs } from '../src/toolLog.mjs'
import { initToolPolicies } from '../src/server/agent/ToolPolicy.mjs'
import { initMemoryStore } from '../src/server/agent/MemoryStore.mjs'
import { initInbox } from '../src/inbox.mjs'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

// --- 纯函数：格式与时区 -----------------------------------------------------

test('buildTimeContext 输出 YYYY-MM-DD、星期X、HH:mm 24 小时制', () => {
  // 2026-10-26T16:30:00Z = 上海时间 2026-10-27 00:30（星期二，跨日）
  const ctx = buildTimeContext(new Date('2026-10-26T16:30:00Z'), 'Asia/Shanghai')
  assert.equal(ctx.date, '2026-10-27')
  assert.equal(ctx.weekday, '星期二')
  assert.equal(ctx.time, '00:30')
  assert.match(ctx.time, /^\d{2}:\d{2}$/)
  assert.equal(ctx.timeZone, 'Asia/Shanghai')
  assert.equal(ctx.utcOffset, 'UTC+08:00')
})

test('跨日：UTC 晚间在东八区已是次日凌晨，时段判为深夜', () => {
  const ctx = buildTimeContext(new Date('2026-10-26T16:30:00Z'), 'Asia/Shanghai')
  assert.equal(ctx.date, '2026-10-27') // 日期翻页
  assert.equal(ctx.partOfDay, '深夜')
})

test('同一时刻不同时区得到不同日期与时间', () => {
  const instant = new Date('2026-10-26T20:00:00Z')
  const sh = buildTimeContext(instant, 'Asia/Shanghai') // 次日 04:00
  const ny = buildTimeContext(instant, 'America/New_York') // 当日 16:00（10 月仍处 EDT UTC-4）
  assert.equal(sh.date, '2026-10-27')
  assert.equal(sh.time, '04:00')
  assert.equal(ny.date, '2026-10-26')
  assert.equal(ny.time, '16:00')
  assert.equal(sh.partOfDay, '深夜')
  assert.equal(ny.partOfDay, '下午')
})

test('时段边界：9 点是上午不是睡觉时间，23 点/凌晨是深夜', () => {
  assert.equal(partOfDayOf(9), '上午')
  assert.equal(partOfDayOf(8), '早晨')
  assert.equal(partOfDayOf(5), '早晨')
  assert.equal(partOfDayOf(4), '深夜')
  assert.equal(partOfDayOf(23), '深夜')
  assert.equal(partOfDayOf(0), '深夜')
  assert.equal(partOfDayOf(11), '上午')
  assert.equal(partOfDayOf(12), '下午')
  assert.equal(partOfDayOf(17), '下午')
  assert.equal(partOfDayOf(18), '晚上')
  assert.equal(partOfDayOf(22), '晚上')
  // 边界分钟
  assert.equal(partOfDayOf(8.999) , '早晨') // 小数小时按数值比较仍落在早晨
  assert.equal(partOfDayOf(11.5), '上午')
})

test('9:00 整在 Asia/Shanghai 判为上午', () => {
  // 2026-10-27T01:00:00Z = 上海 09:00
  const ctx = buildTimeContext(new Date('2026-10-27T01:00:00Z'), 'Asia/Shanghai')
  assert.equal(ctx.time, '09:00')
  assert.equal(ctx.partOfDay, '上午')
})

test('非法或空时区回退 Asia/Shanghai', () => {
  assert.equal(normalizeTimeZone('Not/AZone'), DEFAULT_TIME_ZONE)
  assert.equal(normalizeTimeZone(''), DEFAULT_TIME_ZONE)
  assert.equal(normalizeTimeZone(null), DEFAULT_TIME_ZONE)
  assert.equal(normalizeTimeZone(undefined), DEFAULT_TIME_ZONE)
  const ctx = buildTimeContext(new Date('2026-10-26T16:30:00Z'), 'Mars/Olympus')
  assert.equal(ctx.timeZone, 'Asia/Shanghai')
  assert.equal(ctx.date, '2026-10-27')
})

// --- 纯函数：注入形态与文案 -------------------------------------------------

test('injectTimeContext 追加独立 system 消息，不覆盖原 system、不改动原数组', () => {
  const original = [
    { role: 'system', content: '【当前扮演角色】你是测试角色。' },
    { role: 'user', content: '你好' },
  ]
  const snapshot = JSON.stringify(original)
  const frozen = Object.freeze(original.map(m => Object.freeze({ ...m })))
  const out = injectTimeContext(frozen, new Date('2026-10-26T16:30:00Z'), 'Asia/Shanghai')
  assert.equal(JSON.stringify(original), snapshot) // 原数组未被修改
  assert.equal(out.length, 3)
  assert.equal(out[0].role, 'system')
  assert.match(out[0].content, /【当前时间上下文】/)
  assert.match(out[0].content, /2026-10-27/) // 当前（该时区）日期
  assert.equal(out[1].content, '【当前扮演角色】你是测试角色。') // 原 system 原样保留
  assert.equal(out[2].content, '你好')
})

test('injectTimeContext 对空/非数组消息也返回合法数组', () => {
  const out = injectTimeContext(undefined, new Date(), 'Asia/Shanghai')
  assert.equal(out.length, 1)
  assert.equal(out[0].role, 'system')
})

test('时间上下文文案含星期、时段与「补觉/上夜班以对话为准」，且不含天气/位置数据', () => {
  const text = timeContextText(buildTimeContext(new Date('2026-10-27T01:00:00Z'), 'Asia/Shanghai'))
  assert.match(text, /星期二/)
  assert.match(text, /时段：上午/)
  assert.match(text, /24 小时制/)
  assert.match(text, /补觉/)
  assert.match(text, /上夜班/)
  assert.match(text, /以用户所说的为准/)
  // 不注入任何天气/位置/温度数据
  assert.doesNotMatch(text, /°C|摄氏|humidity|温度|经度|纬度|坐标/)
  // 明确上午 9 点不是睡觉时间的示例
  assert.match(text, /上午 9 点/)
})

// --- Runner 集成：每轮请求携带当前时间 -------------------------------------

function makeDb(timeZonePayload) {
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
  db.prepare('INSERT INTO app_state (id,payload,updated_at) VALUES (1,?,?)')
    .run(JSON.stringify(timeZonePayload || {}), new Date().toISOString())
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

test('Runner 每一轮请求都带独立时间 system 消息，历史里不累积重复', async () => {
  const db = makeDb()
  const runner = new AgentRunner(makeCtx(db))
  const run = createAgentRun(db, { assistantId: 'assistant-yanweixi', prompt: '查一下账本' })
  const requests = installModel([
    { choices: [{ message: { content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'ledger_list', arguments: '{}' } }] } }], usage },
    { choices: [{ message: { content: '账本为空。' } }], usage },
  ])
  const finished = await runner.start(run).promise
  assert.equal(finished.status, 'succeeded')
  assert.equal(requests.length, 2)
  for (const req of requests) {
    const timeMsgs = req.messages.filter(m => m.role === 'system' && String(m.content).includes('【当前时间上下文】'))
    assert.equal(timeMsgs.length, 1, '每轮恰好一条时间上下文消息')
    assert.match(timeMsgs[0].content, /\d{4}-\d{2}-\d{2}/)
  }
  // 角色 system 消息保留，且不再含旧的【执行日期】行
  assert.match(requests[0].messages[0].content, /当前扮演角色/)
  assert.doesNotMatch(requests[0].messages[0].content, /【执行日期】/)
  // 第二轮历史包含工具往返，但时间消息仍只有一条（不随轮次累积）
  assert.ok(requests[1].messages.some(m => m.role === 'tool'))
})

test('Runner 使用用户在 app_state 配置的时区', async () => {
  const db = makeDb({ timeZone: 'America/New_York' })
  const runner = new AgentRunner(makeCtx(db))
  const run = createAgentRun(db, { assistantId: 'assistant-yanweixi', prompt: '现在几点' })
  const requests = installModel([
    { choices: [{ message: { content: '现在是当地时间下午。' } }], usage },
  ])
  await runner.start(run).promise
  const timeMsg = requests[0].messages.find(m => m.role === 'system' && String(m.content).includes('【当前时间上下文】'))
  assert.ok(timeMsg)
  assert.match(timeMsg.content, /America\/New_York/)
  // 纽约比上海慢 12/13 小时：UTC 12:00 时纽约是 08:00（冬令时）——只断言格式与非上海时区即可
  assert.doesNotMatch(timeMsg.content, /Asia\/Shanghai（/)
})

test('app_state 时区非法时 Runner 回退默认时区', async () => {
  const db = makeDb({ timeZone: 'Nowhere/Land' })
  const runner = new AgentRunner(makeCtx(db))
  const run = createAgentRun(db, { assistantId: 'assistant-yanweixi', prompt: '你好' })
  const requests = installModel([
    { choices: [{ message: { content: '你好。' } }], usage },
  ])
  await runner.start(run).promise
  const timeMsg = requests[0].messages.find(m => m.role === 'system' && String(m.content).includes('【当前时间上下文】'))
  assert.match(timeMsg.content, /Asia\/Shanghai/)
})
