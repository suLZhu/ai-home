// 记忆自动整理：让助手「自己记住」的那一半闭环。
//
// 每 5 分钟一次 tick，对每个助手只问一个问题：距上次整理之后，新对话是不是
// 已经攒够了？规则是三个用户可调阈值（轮数 / 字数 / 天数）取「或」——任一满
// 足就整理。触发后交给共享的 AgentRunner，让助手自己的模型把新材料提炼成
// `memory_add` 候选条目。
//
// 分工是刻意的：**是否运行**由确定性规则决定（模型不参与），**记什么**才交给
// 模型。抽出来的内容一律落在 candidate（createdBy='model'），用户在记忆面板
// 确认后才变成 active，绝不会被直接注入提示词。
//
// 水位线（last_run_at）在派发那一刻就前移：哪怕运行崩溃或很慢，同一批对话也
// 不会被重复整理；内容级去重（MemoryStore.propose）是第二道保险。
import { createAgentRun } from './AgentRunStore.mjs'
import { getPolicy } from './ToolPolicy.mjs'
import { SQLiteMemoryProvider } from './MemoryStore.mjs'
import { isValidAssistantId, toAssistantId } from '../identity.mjs'

const DAY_MS = 24 * 60 * 60 * 1000

// 阈值范围与 GET/PUT 的校验保持同一份定义，避免面板和调度器各说各话。
export const AUTO_LIMITS = {
  minMessages: [2, 500],
  minChars: [200, 200000],
  minDays: [1, 365],
}
// autoConfirm：整理完直接把这一轮产出的候选转正（用户要求「不用自己逐条确认」）。
// rules：用户写的整理规则，原样附在提示词里，用来约束「记什么 / 不记什么」。
export const AUTO_DEFAULTS = { enabled: true, minMessages: 20, minChars: 4000, minDays: 3, autoConfirm: true, rules: '' }
export const AUTO_RULES_MAX = 500

// 单次整理最多提议几条。候选区是给用户看的，一次倒 20 条只会让人不想看。
export const AUTO_MAX_PROPOSALS = 5
const MATERIAL_MAX_MESSAGES = 80
const MATERIAL_MAX_PER_CONVERSATION = 40
const MATERIAL_MAX_CHARS = 8000
const MATERIAL_MAX_CONVERSATIONS = 200
const PROMPT_MESSAGE_CHARS = 600

export function initMemoryAutoOrganize(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_auto_config (
      person TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1,
      min_messages INTEGER NOT NULL DEFAULT 20, min_chars INTEGER NOT NULL DEFAULT 4000,
      min_days INTEGER NOT NULL DEFAULT 3, auto_confirm INTEGER NOT NULL DEFAULT 1,
      rules TEXT NOT NULL DEFAULT '', last_run_at TEXT, updated_at TEXT NOT NULL
    );
  `)
  // 旧库补列（幂等）：自动生效开关 + 用户整理规则。
  const columns = db.prepare('PRAGMA table_info(memory_auto_config)').all().map(row => row.name)
  if (!columns.includes('auto_confirm')) db.exec('ALTER TABLE memory_auto_config ADD COLUMN auto_confirm INTEGER NOT NULL DEFAULT 1')
  if (!columns.includes('rules')) db.exec("ALTER TABLE memory_auto_config ADD COLUMN rules TEXT NOT NULL DEFAULT ''")
}

function clampInt(value, [min, max], fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

// 每人一条配置；没有行时返回默认值（开关默认开），不写库。
export function readAutoConfig(db, person) {
  const row = db.prepare('SELECT * FROM memory_auto_config WHERE person=?').get(String(person || ''))
  return {
    person: String(person || ''),
    enabled: row ? row.enabled !== 0 : AUTO_DEFAULTS.enabled,
    minMessages: clampInt(row?.min_messages, AUTO_LIMITS.minMessages, AUTO_DEFAULTS.minMessages),
    minChars: clampInt(row?.min_chars, AUTO_LIMITS.minChars, AUTO_DEFAULTS.minChars),
    minDays: clampInt(row?.min_days, AUTO_LIMITS.minDays, AUTO_DEFAULTS.minDays),
    autoConfirm: row ? row.auto_confirm !== 0 : AUTO_DEFAULTS.autoConfirm,
    rules: String(row?.rules || '').trim().slice(0, AUTO_RULES_MAX),
    lastRunAt: row?.last_run_at || null,
    updatedAt: row?.updated_at || null,
  }
}

// 保存时只覆盖显式给出的字段：面板只改开关时，三个阈值保持原样。
export function saveAutoConfig(db, person, patch = {}) {
  const current = readAutoConfig(db, person)
  const enabled = patch.enabled === undefined ? current.enabled : patch.enabled !== false
  const minMessages = patch.minMessages === undefined ? current.minMessages
    : clampInt(patch.minMessages, AUTO_LIMITS.minMessages, current.minMessages)
  const minChars = patch.minChars === undefined ? current.minChars
    : clampInt(patch.minChars, AUTO_LIMITS.minChars, current.minChars)
  const minDays = patch.minDays === undefined ? current.minDays
    : clampInt(patch.minDays, AUTO_LIMITS.minDays, current.minDays)
  const autoConfirm = patch.autoConfirm === undefined ? current.autoConfirm : patch.autoConfirm !== false
  const rules = patch.rules === undefined ? current.rules : String(patch.rules || '').trim().slice(0, AUTO_RULES_MAX)
  const now = new Date().toISOString()
  db.prepare(`INSERT INTO memory_auto_config (person,enabled,min_messages,min_chars,min_days,auto_confirm,rules,updated_at)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(person) DO UPDATE SET enabled=excluded.enabled, min_messages=excluded.min_messages,
      min_chars=excluded.min_chars, min_days=excluded.min_days, auto_confirm=excluded.auto_confirm,
      rules=excluded.rules, updated_at=excluded.updated_at`)
    .run(current.person, enabled ? 1 : 0, minMessages, minChars, minDays, autoConfirm ? 1 : 0, rules, now)
  return readAutoConfig(db, person)
}

// 水位线单独写入：整理完成与否都不影响「这批已经处理过」的事实。
function markAutoRun(db, person, atIso) {
  db.prepare(`INSERT INTO memory_auto_config (person,enabled,min_messages,min_chars,min_days,last_run_at,updated_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(person) DO UPDATE SET last_run_at=excluded.last_run_at, updated_at=excluded.updated_at`)
    .run(String(person), AUTO_DEFAULTS.enabled ? 1 : 0, AUTO_DEFAULTS.minMessages, AUTO_DEFAULTS.minChars,
      AUTO_DEFAULTS.minDays, atIso, atIso)
}

function readSnapshot(db) {
  const row = db.prepare('SELECT payload FROM app_state WHERE id=1').get()
  if (!row?.payload) return null
  try { return JSON.parse(row.payload) } catch { return null }
}

function conversationsFor(state, person) {
  const all = state?.conversations
  if (!all || typeof all !== 'object') return []
  // v3 快照按 assistantId 存；旧中文键读的时候映射一次，不写回。
  const key = Array.isArray(all[person]) ? person : Object.keys(all).find(k => toAssistantId(k) === person)
  const list = key ? all[key] : null
  return Array.isArray(list) ? list : []
}

// 需要检查的助手：快照里有会话的人 + 已经存过配置的人。
export function listAutoPeople(db, state = readSnapshot(db)) {
  const ids = new Set()
  for (const key of Object.keys(state?.conversations || {})) {
    const id = toAssistantId(key)
    if (isValidAssistantId(id)) ids.add(id)
  }
  for (const row of db.prepare('SELECT person FROM memory_auto_config').all()) {
    if (isValidAssistantId(row.person)) ids.add(row.person)
  }
  return [...ids]
}

// 从一份快照里取某人自 since 之后的新消息。
// 只取每段会话最近 40 条、全局最近 80 条做材料，但 totalMessages/totalChars
// 统计的是全部新消息——阈值判断不该被材料上限影响。
export function collectNewMaterialFromState(state, person, { since = '' } = {}) {
  const sinceMs = since ? Date.parse(since) || 0 : 0
  let totalMessages = 0
  let totalChars = 0
  let oldestMs = 0
  const picked = []
  for (const conversation of conversationsFor(state, person).slice(0, MATERIAL_MAX_CONVERSATIONS)) {
    if (!conversation || typeof conversation.id !== 'string' || !Array.isArray(conversation.messages)) continue
    const convMs = Date.parse(conversation.updatedAt || '') || 0
    const title = String(conversation.title || '未命名会话').slice(0, 60)
    const recent = [] // 每段会话只保留最新 N 条，避免长会话把内存撑爆
    for (const message of conversation.messages) {
      if (!message || !['user', 'assistant'].includes(message.role)) continue
      const content = typeof message.content === 'string' ? message.content.trim() : ''
      if (!content) continue
      const at = Date.parse(message.at || '') || convMs
      // 没有时间戳的旧消息借用会话更新时间；会话本身也没更新过则只能算作历史。
      if (sinceMs && at <= sinceMs) continue
      totalMessages += 1
      totalChars += content.length
      if (at && (!oldestMs || at < oldestMs)) oldestMs = at
      recent.push({
        conversationId: conversation.id.slice(0, 120),
        title,
        role: message.role,
        content: content.slice(0, 4000),
        at: at ? new Date(at).toISOString() : '',
      })
      if (recent.length > MATERIAL_MAX_PER_CONVERSATION) recent.shift()
    }
    picked.push(...recent)
  }
  picked.sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0))
  const messages = picked.slice(-MATERIAL_MAX_MESSAGES)
  // 再从最旧的一条开始丢，直到进入字数预算（保底留一条）。
  let chars = messages.reduce((sum, message) => sum + message.content.length, 0)
  while (messages.length > 1 && chars > MATERIAL_MAX_CHARS) chars -= messages.shift().content.length
  return { messages, totalMessages, totalChars, oldestMs }
}

export function collectNewMaterial(db, person, { since = '' } = {}) {
  return collectNewMaterialFromState(readSnapshot(db), person, { since })
}

// 纯规则判断：三个阈值取「或」。days 的含义是「距上次整理（没有上次就按
// 最早一条新消息算）过了多少天」，这样新会话不会在上线当天就被整理。
export function decideAutoOrganize({ config, material, now = new Date() }) {
  const nowMs = now.getTime()
  const lastMs = config.lastRunAt ? Date.parse(config.lastRunAt) || 0 : 0
  const days = lastMs
    ? Math.max(0, (nowMs - lastMs) / DAY_MS)
    : (material.oldestMs ? Math.max(0, (nowMs - material.oldestMs) / DAY_MS) : 0)
  if (!config.enabled) return { trigger: false, reason: 'disabled', days }
  if (!material.totalMessages) return { trigger: false, reason: 'no_new_messages', days }
  if (material.totalMessages >= config.minMessages) return { trigger: true, reason: 'messages', days }
  if (material.totalChars >= config.minChars) return { trigger: true, reason: 'chars', days }
  if (days >= config.minDays) return { trigger: true, reason: 'days', days }
  return { trigger: false, reason: 'below_threshold', days }
}

export function buildAutoOrganizePrompt(displayName, material, rules = '') {
  const lines = []
  let budget = MATERIAL_MAX_CHARS
  let lastConversation = ''
  for (const message of material.messages) {
    const text = message.content.length > PROMPT_MESSAGE_CHARS
      ? message.content.slice(0, PROMPT_MESSAGE_CHARS) + '…'
      : message.content
    if (budget - text.length < 0) break
    budget -= text.length
    if (message.conversationId !== lastConversation) {
      lines.push(`\n【会话：${message.title}】`)
      lastConversation = message.conversationId
    }
    lines.push(`${message.role === 'user' ? '用户' : '助手'}：${text}`)
  }
  return [
    `【系统 · 记忆自动整理 · ${displayName}】`,
    '下面是你和用户最近的对话片段（按时间先后）。请从中提炼值得长期记住的内容，用 memory_add 工具写成记忆。',
    '',
    '提炼规则：',
    '1. 只记稳定的事实、约定、偏好、重要经历和项目进度；寒暄、一次性情绪、重复内容、已经记过的内容都不要。',
    '2. 一条记忆只写一个事实：标题 2 至 12 字，content 写清事实本身（人名、时间、数字要准确），keywords 用逗号分隔，category 从 人物关系/经历事件/偏好习惯/项目进度/其他 里选。',
    `3. 最多调用 memory_add ${AUTO_MAX_PROPOSALS} 次。没有值得记的内容时不要调用任何工具，只回复「无」。`,
    '4. 不要编造对话里没出现的信息；不要调用 memory_add 以外的工具。',
    rules ? '5. 用户写的整理规则（优先遵守）：' + rules : '',
    '',
    '【新增对话】',
    lines.join('\n') || '（无）',
  ].join('\n')
}

function runningAutoRun(db, person) {
  return db.prepare("SELECT id FROM agent_runs WHERE assistant_id=? AND source='memory' AND status='running' ORDER BY created_at DESC LIMIT 1")
    .get(String(person || '')) || null
}

function providerReady(provider) {
  return !!provider && !!provider.endpoint && !!provider.apiKey && !!provider.model
}

// 派发一次整理。返回 { ok, reason, runId?, ... }，调用方据此决定日志与提示。
export function triggerAutoOrganize({ db, runner, bus, person, provider, displayName = '', material = null, state = null, now = new Date(), force = false }) {
  if (!isValidAssistantId(person)) return { ok: false, reason: 'invalid_person' }
  const running = runningAutoRun(db, person)
  if (running) return { ok: false, reason: 'running', runId: running.id }
  // memory_add 需要自动执行：deny 时整理没有意义；ask 会让后台运行卡在审批上
  // 直到超时，所以两者都在派发前拦下，让用户先去改策略。
  const policy = getPolicy(db, person, 'memory_add')
  if (policy === 'deny') return { ok: false, reason: 'policy_denied' }
  if (policy === 'ask') return { ok: false, reason: 'policy_ask' }
  if (!providerReady(provider)) return { ok: false, reason: 'no_provider' }

  const config = readAutoConfig(db, person)
  const source = material || collectNewMaterialFromState(state || readSnapshot(db), person, { since: config.lastRunAt || '' })
  if (!source.totalMessages) return { ok: false, reason: 'no_new_messages' }
  const decision = decideAutoOrganize({ config, material: source, now })
  if (!force && !decision.trigger) {
    return { ok: false, reason: decision.reason, days: decision.days, totalMessages: source.totalMessages, totalChars: source.totalChars }
  }

  const prompt = buildAutoOrganizePrompt(displayName || person, source, config.rules)
  const run = createAgentRun(db, { assistantId: person, source: 'memory', prompt, conversationId: null })
  // 先移水位线再启动：即使这次运行失败，同一批对话也不会被反复重提。
  markAutoRun(db, person, now.toISOString())
  bus?.publish({ type: 'run_created', runId: run.id, assistantId: person, source: 'memory', reason: force ? 'manual' : decision.reason })
  try {
    const handle = runner.start(run)
    handle.promise.then(finished => {
      // 自动生效：只转正这一轮 run 产出的候选；聊天里同时提议的记忆不受影响。
      if (!config.autoConfirm || !finished || finished.status !== 'succeeded') return
      try {
        const count = SQLiteMemoryProvider(db).confirmRun(run.id)
        if (count) bus?.publish({ type: 'memory_auto_confirmed', person, runId: run.id, count })
      } catch (error) { console.error('[memory-auto] auto-confirm failed', error.message) }
    }).catch(error => console.error('[memory-auto] run failed', run.id, error?.message || error))
  } catch (error) {
    console.error('[memory-auto] start failed', run.id, error?.message || error)
    return { ok: false, reason: 'dispatch_failed', runId: run.id }
  }
  return {
    ok: true,
    runId: run.id,
    reason: force ? 'manual' : decision.reason,
    totalMessages: source.totalMessages,
    totalChars: source.totalChars,
    days: decision.days,
  }
}

// 一次 tick：读一次快照，逐个助手判断（快照只解析一遍）。
export function tickMemoryAutoOrganize({ db, runner, bus, providerFor, displayNameFor, now = new Date() }) {
  const state = readSnapshot(db)
  const people = listAutoPeople(db, state)
  const summary = { checked: people.length, dispatched: [], skipped: [] }
  for (const person of people) {
    const result = triggerAutoOrganize({
      db, runner, bus, person,
      provider: typeof providerFor === 'function' ? providerFor(person) : null,
      displayName: typeof displayNameFor === 'function' ? displayNameFor(person) : '',
      state, now,
    })
    if (result.ok) summary.dispatched.push({ person, runId: result.runId, reason: result.reason, messages: result.totalMessages })
    else summary.skipped.push({ person, reason: result.reason, days: result.days })
  }
  return summary
}

// 面板要的「现在是什么状态」：配置 + 攒了多少 + 距离下次触发还差什么。
export function autoConfigStatus(db, person, { now = new Date() } = {}) {
  const config = readAutoConfig(db, person)
  const material = collectNewMaterial(db, person, { since: config.lastRunAt || '' })
  const decision = decideAutoOrganize({ config, material, now })
  const running = runningAutoRun(db, person)
  const lastRun = db.prepare("SELECT id,status,finished_at,error_message FROM agent_runs WHERE assistant_id=? AND source='memory' ORDER BY created_at DESC LIMIT 1").get(String(person || ''))
  return {
    ...config,
    pendingMessages: material.totalMessages,
    pendingChars: material.totalChars,
    daysSinceLast: Math.round(decision.days * 10) / 10,
    triggerReason: decision.reason,
    runningRunId: running ? running.id : null,
    lastRun: lastRun ? { id: lastRun.id, status: lastRun.status, finishedAt: lastRun.finished_at || null, error: lastRun.error_message || '' } : null,
  }
}
