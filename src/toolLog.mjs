// Tool call execution log. Only real tool executions are recorded by the frontend
// at the actual call site; model-generated text never becomes a log row here.
// Everything stored goes through server-side redaction first — the server never
// trusts whatever the browser sends.
//
// Unified state machine (see also src/toolCalls.ts on the frontend):
//   queued -> awaiting_confirmation -> running -> succeeded | failed | cancelled | timed_out
// Terminal states never change again; repeated finish calls are idempotent no-ops.
// Rows are bound to runId/conversationId/messageId so the chat UI can restore
// call cards after a refresh, and eventId deduplicates retried client posts.
import { randomUUID } from 'node:crypto'

const PEOPLE = ['assistant-yanweixi', 'assistant-yanshuo']
// New assistants (created client-side) pass the same stable-id format check.
const isPerson = (value) => PEOPLE.includes(value) || /^assistant-[a-zA-Z0-9-]{4,}$/.test(String(value || ''))
const SOURCES = ['mcp', 'worldbook', 'ledger', 'workflow']
export const TOOL_CALL_STATUSES = ['queued', 'awaiting_confirmation', 'running', 'succeeded', 'failed', 'cancelled', 'timed_out']
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'timed_out'])
// Pre-migration row values still present in old databases.
const LEGACY_STATUS = { success: 'succeeded', error: 'failed' }
const ALLOWED_TRANSITIONS = {
  queued: ['awaiting_confirmation', 'running', 'cancelled', 'timed_out', 'failed'],
  awaiting_confirmation: ['running', 'cancelled', 'timed_out', 'failed'],
  running: ['succeeded', 'failed', 'cancelled', 'timed_out'],
}
const REDACTED = '***已脱敏***'
const MAX_ARGUMENTS = 8000
const MAX_RESULT = 4000
const MAX_ERROR = 800
const STALE_RUNNING_MS = 10 * 60 * 1000

// Key names that must never keep their value in a log row.
const SENSITIVE_KEY = /(?:api[-_]?key|access[-_]?token|refresh[-_]?token|token|secret|password|passwd|authorization|auth|cookie|credential|session|private[-_]?key|bearer)/i
// Value shapes that look like credentials even inside innocent-looking strings.
const SENSITIVE_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{10,}/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
]

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 })
}

function redactString(text) {
  let out = String(text)
  for (const pattern of SENSITIVE_VALUE_PATTERNS) out = out.replace(pattern, REDACTED)
  return out
}

export function redactValue(value, depth = 0) {
  if (depth > 8) return '[层级过深已省略]'
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    const out = redactString(value)
    return out.length > MAX_RESULT ? out.slice(0, MAX_RESULT) + '…[已截断]' : out
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.slice(0, 100).map(item => redactValue(item, depth + 1))
  if (typeof value === 'object') {
    const out = {}
    for (const [key, item] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactValue(item, depth + 1)
    }
    return out
  }
  return String(value)
}

function summarize(value, limit) {
  const text = typeof value === 'string' ? redactString(value) : JSON.stringify(redactValue(value) ?? null)
  return text.length > limit ? text.slice(0, limit) + '…[已截断]' : text
}

function safeParse(text) {
  const raw = String(text || '')
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try { return JSON.parse(raw) } catch { /* keep plain text as-is */ }
  }
  return raw
}

function normalizeStatus(value) {
  const raw = String(value || '')
  return LEGACY_STATUS[raw] || raw
}

function cleanId(value) {
  const raw = String(value || '').trim()
  return raw && raw.length <= 120 ? raw : null
}

function mapRow(r) {
  return {
    id: r.id,
    person: r.person,
    source: r.source,
    toolName: r.tool_name,
    serverName: r.server_name || '',
    arguments: safeParse(r.arguments),
    resultSummary: safeParse(r.result_summary),
    status: r.status,
    errorMessage: r.error_message,
    errorCode: r.error_code,
    durationMs: r.duration_ms,
    runId: r.run_id,
    conversationId: r.conversation_id,
    messageId: r.message_id,
    eventId: r.event_id,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  }
}

// Running/queued rows from a closed page can never finish; mark them timed_out
// so the chat cards and dashboard never show a permanently "executing" call.
function expireStaleRuns(db) {
  const now = new Date().toISOString()
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS).toISOString()
  db.prepare("UPDATE tool_call_logs SET status='timed_out',error_message=?,error_code='STALE',finished_at=?,updated_at=? WHERE status IN ('queued','awaiting_confirmation','running') AND started_at<?")
    .run('执行记录超时未完成（可能因页面关闭而中断）', now, now, cutoff)
}

export function initToolLogs(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_call_logs (
      id TEXT PRIMARY KEY, person TEXT NOT NULL, source TEXT NOT NULL,
      tool_name TEXT NOT NULL, arguments TEXT NOT NULL, result_summary TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL, error_message TEXT, duration_ms INTEGER,
      started_at TEXT NOT NULL, finished_at TEXT,
      server_name TEXT NOT NULL DEFAULT '',
      run_id TEXT, conversation_id TEXT, message_id TEXT,
      error_code TEXT, event_id TEXT, updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS tool_call_logs_recent_idx ON tool_call_logs(person, started_at);
    CREATE INDEX IF NOT EXISTS tool_call_logs_status_idx ON tool_call_logs(status, started_at);
  `)
  // Backfill columns for databases created before the state machine upgrade.
  const cols = db.prepare('PRAGMA table_info(tool_call_logs)').all().map(row => row.name)
  const addColumn = (name, ddl) => { if (!cols.includes(name)) db.exec('ALTER TABLE tool_call_logs ADD COLUMN ' + name + ' ' + ddl) }
  addColumn('server_name', "TEXT NOT NULL DEFAULT ''")
  addColumn('run_id', 'TEXT')
  addColumn('conversation_id', 'TEXT')
  addColumn('message_id', 'TEXT')
  addColumn('error_code', 'TEXT')
  addColumn('event_id', 'TEXT')
  addColumn('updated_at', 'TEXT')
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS tool_call_logs_event_idx ON tool_call_logs(event_id) WHERE event_id IS NOT NULL")
  db.exec('CREATE INDEX IF NOT EXISTS tool_call_logs_conversation_idx ON tool_call_logs(conversation_id, started_at)')
  // Old three-state rows (success/error) move onto the new state machine.
  db.exec("UPDATE tool_call_logs SET status='succeeded' WHERE status='success'")
  db.exec("UPDATE tool_call_logs SET status='failed' WHERE status='error'")
  expireStaleRuns(db)
}

// Create a new call row. Status starts at queued/running/awaiting_confirmation.
// When the client supplies eventId, retries return the already-created row.
export function createToolLog(db, input) {
  if (!isPerson(input.person)) throw badRequest('人物身份无效')
  if (!SOURCES.includes(input.source)) throw badRequest('工具类型无效')
  const toolName = redactString(String(input.toolName || '').trim()).slice(0, 200)
  if (!toolName) throw badRequest('工具名称无效')
  const status = normalizeStatus(input.status) || 'running'
  if (!TOOL_CALL_STATUSES.includes(status) || TERMINAL_STATUSES.has(status)) {
    throw badRequest('新建调用记录只能从 queued / awaiting_confirmation / running 开始')
  }
  const eventId = cleanId(input.eventId)
  if (eventId) {
    const existing = db.prepare('SELECT * FROM tool_call_logs WHERE event_id=?').get(eventId)
    if (existing) return mapRow(existing)
  }
  const id = randomUUID()
  const now = new Date().toISOString()
  const args = summarize(input.arguments ?? {}, MAX_ARGUMENTS)
  const serverName = redactString(String(input.serverName || '').trim()).slice(0, 200)
  db.prepare(`INSERT INTO tool_call_logs
      (id,person,source,tool_name,arguments,result_summary,status,started_at,
       server_name,run_id,conversation_id,message_id,event_id,updated_at)
     VALUES(?,?,?,?,?,'',?,?,?,?,?,?,?,?)`)
    .run(id, input.person, input.source, toolName, args, status, now,
      serverName, cleanId(input.runId), cleanId(input.conversationId), cleanId(input.messageId), eventId, now)
  return mapRow(db.prepare('SELECT * FROM tool_call_logs WHERE id=?').get(id))
}

// Transition an existing row. Accepts intermediate states (e.g. running) and
// terminal states. Repeating the same transition is an idempotent no-op; rows
// already terminal never change again.
export function finishToolLog(db, id, input) {
  const row = db.prepare('SELECT * FROM tool_call_logs WHERE id=?').get(String(id || ''))
  if (!row) throw Object.assign(new Error('调用记录不存在'), { status: 404 })
  const current = normalizeStatus(row.status)
  if (TERMINAL_STATUSES.has(current)) return mapRow(row)
  const status = normalizeStatus(input.status)
  if (!TOOL_CALL_STATUSES.includes(status)) throw badRequest('状态无效')
  if (status === current) return mapRow(row)
  if (!(ALLOWED_TRANSITIONS[current] || []).includes(status)) {
    throw Object.assign(new Error('状态无法从 ' + current + ' 变为 ' + status), { status: 409 })
  }
  const now = new Date().toISOString()
  if (!TERMINAL_STATUSES.has(status)) {
    db.prepare('UPDATE tool_call_logs SET status=?,updated_at=? WHERE id=?').run(status, now, row.id)
    return mapRow(db.prepare('SELECT * FROM tool_call_logs WHERE id=?').get(row.id))
  }
  const durationMs = Math.max(0, Date.parse(now) - Date.parse(row.started_at))
  const resultSummary = summarize(input.resultSummary ?? '', MAX_RESULT)
  const errorMessage = input.errorMessage ? summarize(String(input.errorMessage), MAX_ERROR) : null
  const errorCode = input.errorCode ? redactString(String(input.errorCode)).slice(0, 64) : null
  db.prepare('UPDATE tool_call_logs SET status=?,result_summary=?,error_message=?,error_code=?,duration_ms=?,finished_at=?,updated_at=? WHERE id=?')
    .run(status, resultSummary, errorMessage, errorCode, durationMs, now, now, row.id)
  return mapRow(db.prepare('SELECT * FROM tool_call_logs WHERE id=?').get(row.id))
}

export function listToolLogs(db, query = {}) {
  expireStaleRuns(db)
  const where = []
  const params = []
  if (query.person) {
    if (!isPerson(query.person)) throw badRequest('人物身份无效')
    where.push('person=?'); params.push(query.person)
  }
  if (query.source) {
    if (!SOURCES.includes(query.source)) throw badRequest('工具类型无效')
    where.push('source=?'); params.push(query.source)
  }
  if (query.status) {
    const status = normalizeStatus(query.status)
    if (!TOOL_CALL_STATUSES.includes(status)) throw badRequest('状态无效')
    where.push('status=?'); params.push(status)
  }
  if (query.conversationId) {
    where.push('conversation_id=?'); params.push(String(query.conversationId).slice(0, 120))
  }
  if (query.runId) {
    where.push('run_id=?'); params.push(String(query.runId).slice(0, 120))
  }
  const limit = Math.min(500, Math.max(1, Number(query.limit) || 100))
  const sql = 'SELECT * FROM tool_call_logs' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY started_at DESC LIMIT ?'
  const rows = db.prepare(sql).all(...params, limit)
  return rows.map(mapRow)
}
