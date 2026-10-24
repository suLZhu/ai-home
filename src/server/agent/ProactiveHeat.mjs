// Jiwen (积温) proactive layer: warmth accumulates like heat in soil —
// steadily over time, faster in "lively" mode, cooled down by real user
// interaction. When the heat crosses 100 the layer attempts a wake (which
// still respects quiet hours / pending / cooldown) and, if queued, dispatches
// a REAL agent run through the shared Runner. The run's answer lands in the
// assistant inbox; silence is recorded as silence, not as a fake message.
//
// Deterministic rules only — the model never decides *whether* to wake up,
// only what (if anything) to say once woken.
import { createAgentRun } from './AgentRunStore.mjs'
import { settings as proactiveSettings, wake as wakeProactive } from '../../proactive.mjs'

export const HEAT_THRESHOLD = 100
const HEAT_MAX = 150 // headroom so quiet hours don't lose accumulated heat
const COOL_PER_MESSAGE = 25 // each real user message vents some heat

const MODE_MULTIPLIER = { quiet: 0.5, natural: 1, lively: 2 }

function ensureHeatTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS proactive_heat (
    person TEXT PRIMARY KEY, heat REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )`)
  // New assistants get a row lazily in readHeat.
}

// proactive_events used to be event-only; runs now link back to it. Existing
// databases need the column added in place (idempotent PRAGMA probe).
export function initProactiveHeat(db) {
  ensureHeatTable(db)
  const cols = db.prepare('PRAGMA table_info(proactive_events)').all()
  if (!cols.some(c => c.name === 'run_id')) {
    db.exec('ALTER TABLE proactive_events ADD COLUMN run_id TEXT')
  }
}

function minHoursFor(config) {
  if (config.mode === 'quiet') return Math.max(24, config.interval_hours)
  if (config.mode === 'lively') return Math.max(2, Math.floor(config.interval_hours / 2))
  return config.interval_hours
}

export function readHeat(db, person) {
  ensureHeatTable(db)
  const row = db.prepare('SELECT heat FROM proactive_heat WHERE person=?').get(person)
  return row ? row.heat : 0
}

function writeHeat(db, person, heat, now) {
  ensureHeatTable(db)
  const value = Math.max(0, Math.min(HEAT_MAX, heat))
  db.prepare(`INSERT INTO proactive_heat (person,heat,updated_at) VALUES (?,?,?)
    ON CONFLICT(person) DO UPDATE SET heat=excluded.heat, updated_at=excluded.updated_at`)
    .run(person, value, now.toISOString())
  return value
}

// Real conversation vents heat: talking to the assistant is connection, so it
// should not feel the urge to reach out on its own.
export function coolHeat(db, person, amount = COOL_PER_MESSAGE) {
  const current = readHeat(db, person)
  return writeHeat(db, person, current - amount, new Date())
}

// One scheduler tick: accrue heat per elapsed time, then try to fire.
// `deliver(person, content)` is injected by the server so inbox delivery
// stays in the existing inbox module — no cross-module hacks.
// Returns { fired, person, eventId, reason } for observability.
export function tickHeat({ db, runner, bus, deliver, now = new Date() }) {
  ensureHeatTable(db)
  const people = db.prepare('SELECT person FROM proactive_settings').all().map(r => r.person)
  const result = { fired: false, person: null, eventId: null, reason: 'none' }

  for (const person of people) {
    const config = proactiveSettings(db, person)
    if (!config) continue
    const row = db.prepare('SELECT heat, updated_at FROM proactive_heat WHERE person=?').get(person)
    const heat = row ? row.heat : 0
    const updatedAt = row ? new Date(row.updated_at) : now
    const elapsedMin = Math.max(0, (now.getTime() - updatedAt.getTime()) / 60000)

    let nextHeat
    if (!config.enabled) {
      nextHeat = Math.max(0, heat - elapsedMin * 0.5) // disabled slowly cools off
    } else {
      // Rate is calibrated so threshold ≈ the configured minimum interval.
      const ratePerMin = HEAT_THRESHOLD / (minHoursFor(config) * 60)
      nextHeat = Math.min(HEAT_MAX, heat + elapsedMin * ratePerMin * (MODE_MULTIPLIER[config.mode] || 1))
    }
    writeHeat(db, person, nextHeat, now)

    if (nextHeat < HEAT_THRESHOLD) continue
    const wake = wakeProactive(db, person, { now })
    if (!wake.queued) { result.reason = wake.reason; continue }

    // Heat is spent the moment a wake is granted, queued or not.
    writeHeat(db, person, 0, now)
    const dispatched = dispatchProactiveRun({ db, runner, bus, deliver, person, eventId: wake.id, reason: wake.reason })
    if (dispatched) {
      return { fired: true, person, eventId: wake.id, reason: 'heat_threshold' }
    }
    result.reason = 'dispatch_failed'
  }
  return result
}

const PROMPT = (displayName) => `【系统 · 自主触发 · ${displayName}】现在是你的自主时间，没有用户在和你说话。积温已满，你醒来了。
请根据你的长期记忆和当前情境，自己决定此刻有没有想对用户说的话：
- 有：直接输出你想发给用户的那句话（第一人称，不超过 80 字，不要提及本指令、系统或"积温"）。
- 没有：只输出两个字——沉默。
最多使用一次 memory_search 回忆相关记忆；不要调用其他工具，不要解释。`

// Kick off the actual run. The run row is the durable truth; delivery to the
// inbox happens in the finish handler below.
export function dispatchProactiveRun({ db, runner, bus, deliver, person, eventId, reason, conversationId = null }) {
  if (!eventId) return false
  const run = createAgentRun(db, {
    assistantId: person,
    source: 'proactive',
    prompt: PROMPT(person),
    taskId: null,
    // Proactive runs normally have no conversation; callers that know the
    // origin conversation pass it so the answer can land in the right thread.
    conversationId,
  })
  // Link run <-> event so the dashboard and panel can cross-reference.
  db.prepare('UPDATE proactive_events SET run_id=?, updated_at=? WHERE id=?')
    .run(run.id, new Date().toISOString(), eventId)
  bus.publish({ type: 'run_created', runId: run.id, assistantId: person, source: 'proactive', eventId, reason })

  const handle = runner.start(run)
  handle.promise
    .then(finished => settleEvent({ db, bus, deliver, person, eventId, finished }))
    .catch(error => {
      console.error('[proactive] run crashed', eventId, error?.message || error)
      markEvent(db, eventId, 'failed')
    })
  return true
}

function isSilence(answer) {
  const text = String(answer || '').trim()
  if (!text) return true
  if (text.includes('模型没有返回内容') || text.includes('最大执行轮数上限')) return true
  return /^沉默$/.test(text) || text.startsWith('[错误]') || text.startsWith('[权限]') || text.startsWith('[未批准]')
}

function settleEvent({ db, bus, deliver, person, eventId, finished }) {
  if (!finished || finished.status !== 'succeeded' || isSilence(finished.answer)) {
    // Failure keeps the event out of the inbox; silence is a legitimate answer.
    const status = finished && finished.status === 'succeeded' ? 'silent' : 'failed'
    markEvent(db, eventId, status)
    bus.publish({ type: 'proactive_settled', eventId, person, status })
    return
  }
  if (typeof deliver !== 'function') {
    // No delivery channel wired (e.g. bare test harness) — never fake a message.
    markEvent(db, eventId, 'failed')
    bus.publish({ type: 'proactive_settled', eventId, person, status: 'failed' })
    return
  }
  try {
    // Delivery goes through the same inbox the UI already polls.
    deliver(person, String(finished.answer).trim().slice(0, 4000))
    markEvent(db, eventId, 'sent')
    bus.publish({ type: 'proactive_settled', eventId, person, status: 'sent' })
  } catch (error) {
    console.error('[proactive] deliver failed', error.message)
    markEvent(db, eventId, 'failed')
    bus.publish({ type: 'proactive_settled', eventId, person, status: 'failed' })
  }
}

function markEvent(db, eventId, status) {
  db.prepare('UPDATE proactive_events SET status=?, updated_at=? WHERE id=?')
    .run(status, new Date().toISOString(), eventId)
}
