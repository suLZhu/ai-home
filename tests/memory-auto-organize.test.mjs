// 记忆自动整理验收：策略默认值/上下限、新材料统计、确定性触发规则、
// 调度器派发 → 模型调用 memory_add → 候选区（createdBy='model'）→ 用户确认生效。
//
// 与 agent-acceptance / task-delivery 共用套路：内存 SQLite + 脚本化 fetch，
// 不碰正式数据。
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { initAgentRuns, createAgentRun, getAgentRun } from '../src/server/agent/AgentRunStore.mjs'
import { AgentEventBus } from '../src/server/agent/AgentEventBus.mjs'
import { AgentRunner } from '../src/server/agent/AgentRunner.mjs'
import { initToolLogs } from '../src/toolLog.mjs'
import { initToolPolicies, setPolicy } from '../src/server/agent/ToolPolicy.mjs'
import { initMemoryStore, SQLiteMemoryProvider } from '../src/server/agent/MemoryStore.mjs'
import {
  initMemoryAutoOrganize, readAutoConfig, saveAutoConfig, autoConfigStatus,
  collectNewMaterialFromState, decideAutoOrganize, tickMemoryAutoOrganize, triggerAutoOrganize,
  buildAutoOrganizePrompt,
} from '../src/server/agent/MemoryAutoOrganize.mjs'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

const PERSON = 'assistant-yanweixi'
const OTHER = 'assistant-yanshuo'
const usage = { prompt_tokens: 10, completion_tokens: 5 }
const DAY = 24 * 60 * 60 * 1000

function makeDb() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE app_state (id INTEGER PRIMARY KEY CHECK (id=1), payload TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE mcp_connections (id TEXT PRIMARY KEY, person TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL,
      transport TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, token_enc TEXT NOT NULL, updated_at TEXT NOT NULL);
  `)
  initAgentRuns(db)
  initToolLogs(db)
  initToolPolicies(db)
  initMemoryStore(db)
  initMemoryAutoOrganize(db)
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

const READY_PROVIDER = { endpoint: 'https://fake.test/v1', apiKey: 'sk-test', model: 'fake-model' }

function seedState(db, conversations, extra = {}) {
  db.prepare('INSERT INTO app_state (id,payload,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at')
    .run(JSON.stringify({ conversations, ...extra }), new Date().toISOString())
}

function msg(role, content, agoMs = 60 * 60 * 1000) {
  return { role, content, at: new Date(Date.now() - agoMs).toISOString() }
}

function conversation(id, messages, title = '测试会话') {
  return { id, title, messages, updatedAt: new Date().toISOString() }
}

// n 条轮换的 user/assistant 消息，全部落在最近一小时。
function recentMessages(n, text = '今天聊了一些日常，也提到了一点计划。') {
  return Array.from({ length: n }, (_, i) => msg(i % 2 ? 'assistant' : 'user', `${text}（第 ${i + 1} 条）`))
}

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

const textReply = text => ({ choices: [{ message: { content: text } }], usage })
const toolReply = (name, args) => ({
  choices: [{ message: { content: '', tool_calls: [{ id: 'call_1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }],
  usage,
})

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(predicate, timeoutMs = 3000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true
    await sleep(20)
  }
  return false
}

// ============================================================================
// 1) 策略默认值与上下限
// ============================================================================
test('1 默认策略：开启 / 20 条 / 4000 字 / 3 天，未落库', () => {
  const db = makeDb()
  const config = readAutoConfig(db, PERSON)
  assert.equal(config.enabled, true)
  assert.equal(config.minMessages, 20)
  assert.equal(config.minChars, 4000)
  assert.equal(config.minDays, 3)
  assert.equal(config.autoConfirm, true, '默认整理后自动生效')
  assert.equal(config.rules, '')
  assert.equal(config.lastRunAt, null)
  assert.equal(db.prepare('SELECT count(*) AS n FROM memory_auto_config').get().n, 0, '读默认值不写库')
})

test('2 保存时夹取上下限，未给出的字段保持不变', () => {
  const db = makeDb()
  const saved = saveAutoConfig(db, PERSON, { minMessages: 1, minChars: 999999, minDays: 0 })
  assert.equal(saved.minMessages, 2, '低于下限夹到 2')
  assert.equal(saved.minChars, 200000, '高于上限夹到 200000')
  assert.equal(saved.minDays, 1, '低于下限夹到 1')

  const onlyEnabled = saveAutoConfig(db, PERSON, { enabled: false })
  assert.equal(onlyEnabled.enabled, false)
  assert.equal(onlyEnabled.minMessages, 2, '只改开关时阈值原样保留')
  assert.equal(onlyEnabled.minChars, 200000)

  const back = saveAutoConfig(db, PERSON, { minMessages: '8', minChars: 1500, minDays: 2 })
  assert.deepEqual([back.minMessages, back.minChars, back.minDays], [8, 1500, 2])

  const withRule = saveAutoConfig(db, PERSON, { autoConfirm: false, rules: '  只记约定和偏好  ' })
  assert.equal(withRule.autoConfirm, false)
  assert.equal(withRule.rules, '只记约定和偏好', '规则去首尾空白')
  const keep = saveAutoConfig(db, PERSON, { minDays: 5 })
  assert.equal(keep.autoConfirm, false, '只改天数时自动生效开关保持')
  assert.equal(keep.rules, '只记约定和偏好')
  assert.equal(saveAutoConfig(db, PERSON, { rules: 'x'.repeat(900) }).rules.length, 500, '规则长度上限 500')
})

// ============================================================================
// 3) 触发规则：三个阈值取「或」
// ============================================================================
test('3 三个阈值取「或」：轮数 / 字数 / 天数 / 都不满足', () => {
  const now = new Date()
  const base = { enabled: true, lastRunAt: null }

  const byMessages = decideAutoOrganize({
    config: { ...base, minMessages: 20, minChars: 100000, minDays: 30 },
    material: { totalMessages: 20, totalChars: 10, oldestMs: now.getTime() - DAY },
    now,
  })
  assert.equal(byMessages.trigger, true)
  assert.equal(byMessages.reason, 'messages')

  const byChars = decideAutoOrganize({
    config: { ...base, minMessages: 500, minChars: 4000, minDays: 30 },
    material: { totalMessages: 3, totalChars: 4000, oldestMs: now.getTime() - DAY },
    now,
  })
  assert.equal(byChars.reason, 'chars')

  const byDays = decideAutoOrganize({
    config: { ...base, minMessages: 500, minChars: 200000, minDays: 3 },
    material: { totalMessages: 1, totalChars: 20, oldestMs: now.getTime() - 4 * DAY },
    now,
  })
  assert.equal(byDays.reason, 'days')

  const below = decideAutoOrganize({
    config: { ...base, minMessages: 500, minChars: 200000, minDays: 30 },
    material: { totalMessages: 5, totalChars: 100, oldestMs: now.getTime() - 2 * DAY },
    now,
  })
  assert.equal(below.trigger, false)
  assert.equal(below.reason, 'below_threshold')
})

test('4 关闭开关后永不触发；没有新消息也不触发', () => {
  const now = new Date()
  const material = { totalMessages: 100, totalChars: 10000, oldestMs: now.getTime() - 10 * DAY }
  assert.equal(decideAutoOrganize({ config: { enabled: false, minMessages: 2, minChars: 200, minDays: 1, lastRunAt: null }, material, now }).reason, 'disabled')
  assert.equal(decideAutoOrganize({ config: { enabled: true, minMessages: 2, minChars: 200, minDays: 1, lastRunAt: null }, material: { totalMessages: 0, totalChars: 0, oldestMs: 0 }, now }).reason, 'no_new_messages')
})

// ============================================================================
// 5) 新材料统计：只算 last_run_at 之后，统计不受材料上限影响
// ============================================================================
test('5 只统计水位线之后的消息，旧消息不重复计入', () => {
  const state = {
    conversations: {
      [PERSON]: [conversation('conv-1', [
        msg('user', '很久以前说过的话', 10 * DAY),
        msg('assistant', '很久以前的回复', 10 * DAY - 1000),
        msg('user', '昨天说想去杭州', 1 * DAY),
        msg('assistant', '记下了', 1 * DAY - 1000),
      ])],
      [OTHER]: [conversation('conv-2', [msg('user', '别人的对话', 1 * DAY)])],
    },
  }
  const since = new Date(Date.now() - 2 * DAY).toISOString()
  const material = collectNewMaterialFromState(state, PERSON, { since })
  assert.equal(material.totalMessages, 2, '只有水位线之后的 2 条')
  assert.equal(material.messages.length, 2)
  assert.equal(material.messages[0].role, 'user')
  assert.ok(material.messages.every(m => m.conversationId === 'conv-1'))
  assert.ok(!JSON.stringify(material.messages).includes('别人的对话'), '助手之间严格隔离')
})

// ============================================================================
// 6) 端到端：tick → 运行 → 候选记忆（createdBy='model'）→ 用户确认生效
// ============================================================================
test('6 调度器触发整理，结果只进候选区，确认后才生效', async () => {
  const db = makeDb()
  seedState(db, { [PERSON]: [conversation('conv-1', recentMessages(25))] })
  const requests = installModel([
    toolReply('memory_add', {
      title: '喜欢桂花茶', content: '用户喜欢桂花味的茶，尤其是秋天。',
      keywords: '桂花,茶,偏好', category: '偏好习惯', scope: 'private',
    }),
    textReply('已整理完毕'),
  ])
  const bus = new AgentEventBus()
  const runner = new AgentRunner(makeCtx(db))
  saveAutoConfig(db, PERSON, { autoConfirm: false }) // 这条用例专门验证「候选 → 用户确认」

  const summary = tickMemoryAutoOrganize({ db, runner, bus, providerFor: () => READY_PROVIDER, displayNameFor: () => '测试助手' })
  assert.equal(summary.checked, 1)
  assert.equal(summary.dispatched.length, 1, '25 条新消息 ≥ 20，应触发')
  assert.equal(summary.dispatched[0].reason, 'messages')

  const runId = summary.dispatched[0].runId
  assert.equal(getAgentRun(db, runId).status, 'running')
  assert.ok(await waitFor(() => getAgentRun(db, runId).status === 'succeeded'), '整理运行应完成')

  const provider = SQLiteMemoryProvider(db)
  const candidates = provider.list({ person: PERSON, lifecycle: 'candidate' })
  assert.equal(candidates.length, 1, '只写候选，不直接生效')
  assert.equal(candidates[0].createdBy, 'model')
  assert.equal(candidates[0].title, '喜欢桂花茶')
  assert.equal(provider.list({ person: PERSON, lifecycle: 'active' }).length, 0)
  const prompt = requests[0].messages.find(message => message.role === 'user')?.content || ''
  assert.match(prompt, /新增对话/, '提示词带上新材料')
  assert.match(prompt, /第 25 条/, '最新的对话也在提示词里')
  assert.match(prompt, /最多调用 memory_add 5 次/, '限制单次提议数量')

  // 水位线前移：同一批对话不会再整理一次。
  assert.ok(readAutoConfig(db, PERSON).lastRunAt, '派发后 last_run_at 已写入')
  const again = tickMemoryAutoOrganize({ db, runner, bus, providerFor: () => READY_PROVIDER })
  assert.equal(again.dispatched.length, 0)
  assert.equal(again.skipped[0].reason, 'no_new_messages')

  // 用户确认 —— 候选才变成可注入的正式记忆。
  const active = provider.transition(candidates[0].id, 'active')
  assert.equal(active.lifecycle, 'active')
  const hits = provider.search({ person: PERSON, query: '桂花茶' })
  assert.equal(hits.length, 1, '确认后可被检索')
})

// ============================================================================
// 7) 该跳过的情况：无模型 / 关闭 / 正在整理 / 策略不允许
// ============================================================================
test('7 没有配置模型时不整理，也不前移水位线', () => {
  const db = makeDb()
  seedState(db, { [PERSON]: [conversation('conv-1', recentMessages(25))] })
  const runner = new AgentRunner(makeCtx(db))
  const summary = tickMemoryAutoOrganize({ db, runner, providerFor: () => ({ endpoint: '', apiKey: '', model: '' }) })
  assert.equal(summary.dispatched.length, 0)
  assert.equal(summary.skipped[0].reason, 'no_provider')
  assert.equal(readAutoConfig(db, PERSON).lastRunAt, null, '没整理就不算整理过')
})

test('8 开关关闭 / 正在运行 / memory_add 被禁止时跳过', () => {
  const db = makeDb()
  seedState(db, { [PERSON]: [conversation('conv-1', recentMessages(25))] })
  const runner = new AgentRunner(makeCtx(db))

  saveAutoConfig(db, PERSON, { enabled: false })
  let summary = tickMemoryAutoOrganize({ db, runner, providerFor: () => READY_PROVIDER })
  assert.equal(summary.skipped.find(s => s.person === PERSON).reason, 'disabled')

  saveAutoConfig(db, PERSON, { enabled: true })
  createAgentRun(db, { assistantId: PERSON, source: 'memory', prompt: '上一次整理还在跑' })
  summary = tickMemoryAutoOrganize({ db, runner, providerFor: () => READY_PROVIDER })
  assert.equal(summary.skipped.find(s => s.person === PERSON).reason, 'running')

  db.prepare("UPDATE agent_runs SET status='succeeded' WHERE assistant_id=? AND source='memory' AND status='running'").run(PERSON)
  setPolicy(db, PERSON, 'memory_add', 'deny')
  summary = tickMemoryAutoOrganize({ db, runner, providerFor: () => READY_PROVIDER })
  assert.equal(summary.skipped.find(s => s.person === PERSON).reason, 'policy_denied')
})

// ============================================================================
// 9) 手动整理：忽略阈值，但没有新材料时如实拒绝
// ============================================================================
test('9 手动整理忽略阈值；没有新材料时如实拒绝', () => {
  const db = makeDb()
  const runner = new AgentRunner(makeCtx(db))
  const bus = new AgentEventBus()

  // 没有任何会话：手动也不能凭空整理出东西。
  seedState(db, { [PERSON]: [] })
  const empty = triggerAutoOrganize({ db, runner, bus, person: PERSON, provider: READY_PROVIDER, force: true })
  assert.equal(empty.ok, false)
  assert.equal(empty.reason, 'no_new_messages')

  // 2 条远低于默认阈值：自动不会触发，手动 force 可以。
  seedState(db, { [PERSON]: [conversation('conv-1', recentMessages(2))] })
  const auto = triggerAutoOrganize({ db, runner, bus, person: PERSON, provider: READY_PROVIDER })
  assert.equal(auto.reason, 'below_threshold')

  installModel([textReply('无')])
  const forced = triggerAutoOrganize({ db, runner, bus, person: PERSON, provider: READY_PROVIDER, force: true })
  assert.equal(forced.ok, true)
  assert.equal(forced.reason, 'manual')
  assert.equal(forced.totalMessages, 2)
})

// ============================================================================
// 10) 面板状态：攒了多少、还差什么
// ============================================================================
test('10 状态接口给出待整理数量、触发原因与最近一次运行', async () => {
  const db = makeDb()
  seedState(db, { [PERSON]: [conversation('conv-1', recentMessages(5))] })
  const status = autoConfigStatus(db, PERSON)
  assert.equal(status.enabled, true)
  assert.equal(status.pendingMessages, 5)
  assert.ok(status.pendingChars > 0)
  assert.equal(status.triggerReason, 'below_threshold')
  assert.equal(status.runningRunId, null)
  assert.equal(status.lastRun, null)
  assert.equal(status.daysSinceLast, 0, '最近一小时的消息，天数接近 0')
})


// ============================================================================
// 11) 自动生效：只转正这一轮 run 产出的候选，聊天里同时提议的不受影响
// ============================================================================
test('11 自动生效只作用于本轮整理，聊天候选仍需确认', async () => {
  const db = makeDb()
  seedState(db, { [PERSON]: [conversation('conv-1', recentMessages(25))] })
  const provider = SQLiteMemoryProvider(db)
  // 模拟聊天里模型同时提议的一条记忆（没有 sourceRunId）
  const chatProposal = provider.propose({ person: PERSON, title: '聊天里的提议', content: '聊天中模型自己提到的一条候选', createdBy: 'model' }).record
  assert.equal(chatProposal.lifecycle, 'candidate')

  installModel([
    toolReply('memory_add', {
      title: '自动整理的一条', content: '自动整理运行中提出的记忆',
      keywords: '自动,整理', category: '偏好习惯', scope: 'private',
    }),
    textReply('整理完成'),
  ])
  const runner = new AgentRunner(makeCtx(db))
  saveAutoConfig(db, PERSON, { autoConfirm: true })
  const summary = tickMemoryAutoOrganize({ db, runner, providerFor: () => READY_PROVIDER })
  const runId = summary.dispatched[0].runId
  assert.ok(await waitFor(() => getAgentRun(db, runId).status === 'succeeded'))

  const auto = provider.list({ person: PERSON, lifecycle: 'active' }).filter(record => record.sourceRunId === runId)
  assert.equal(auto.length, 1, '本轮整理出的记忆直接生效')
  assert.equal(auto[0].title, '自动整理的一条')
  assert.equal(provider.get(chatProposal.id).lifecycle, 'candidate', '聊天里的候选不被误转正')
  assert.equal(provider.search({ person: PERSON, query: '自动整理' }).length, 1, '自动生效后立即可检索')
})

// ============================================================================
// 12) 用户规则进提示词
// ============================================================================
test('12 整理规则原样进入提示词', () => {
  const material = { messages: [{ conversationId: 'c', title: 't', role: 'user', content: '你好', at: '' }], totalMessages: 1, totalChars: 2, oldestMs: 0 }
  const prompt = buildAutoOrganizePrompt('测试助手', material, '只记约定和偏好，不记寒暄')
  assert.match(prompt, /只记约定和偏好，不记寒暄/)
  assert.match(prompt, /用户写的整理规则/)
})
