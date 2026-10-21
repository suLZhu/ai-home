// Tool call execution log. Only real tool executions are recorded by the frontend
// at the actual call site; model-generated text never becomes a log row here.
// Everything stored goes through server-side redaction first — the server never
// trusts whatever the browser sends.
import { randomUUID } from 'node:crypto'

const PEOPLE = ['晏未晞', '言朔']
const SOURCES = ['mcp', 'worldbook', 'ledger']
const STATUSES = ['running', 'success', 'error']
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

function expireStaleRuns(db) {
  const now = new Date().toISOString()
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS).toISOString()
  db.prepare("UPDATE tool_call_logs SET status='error',error_message=?,finished_at=? WHERE status='running' AND started_at<?")
    .run('执行记录超时未完成（可能因页面关闭而中断）', now, cutoff)
}

export function initToolLogs(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_call_logs (
      id TEXT PRIMARY KEY, person TEXT NOT NULL, source TEXT NOT NULL,
      tool_name TEXT NOT NULL, arguments TEXT NOT NULL, result_summary TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL, error_message TEXT, duration_ms INTEGER,
      started_at TEXT NOT NULL, finished_at TEXT
    );
    CREATE INDEX IF NOT EXISTS tool_call_logs_recent_idx ON tool_call_logs(person, started_at);
    CREATE INDEX IF NOT EXISTS tool_call_logs_status_idx ON tool_call_logs(status, started_at);
  `)
  expireStaleRuns(db)
}

export function createToolLog(db, input) {
  if (!PEOPLE.includes(input.person)) throw badRequest('人物身份无效')
  if (!SOURCES.includes(input.source)) throw badRequest('工具类型无效')
  const toolName = redactString(String(input.toolName || '').trim()).slice(0, 200)
  if (!toolName) throw badRequest('工具名称无效')
  const id = randomUUID()
  const startedAt = new Date().toISOString()
  const args = summarize(input.arguments ?? {}, MAX_ARGUMENTS)
  db.prepare("INSERT INTO tool_call_logs(id,person,source,tool_name,arguments,result_summary,status,started_at) VALUES(?,?,?,?,?,'','running',?)")
    .run(id, input.person, input.source, toolName, args, startedAt)
  return { id, status: 'running', startedAt }
}

export function finishToolLog(db, id, input) {
  const row = db.prepare('SELECT * FROM tool_call_logs WHERE id=?').get(String(id || ''))
  if (!row) throw Object.assign(new Error('调用记录不存在'), { status: 404 })
  const status = STATUSES.includes(input.status) ? input.status : row.status
  if (status === 'running') throw badRequest('完成记录的状态只能是 success 或 error')
  const finishedAt = new Date().toISOString()
  const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(row.started_at))
  const resultSummary = summarize(input.resultSummary ?? '', MAX_RESULT)
  const errorMessage = input.errorMessage ? summarize(String(input.errorMessage), MAX_ERROR) : null
  db.prepare('UPDATE tool_call_logs SET status=?,result_summary=?,error_message=?,duration_ms=?,finished_at=? WHERE id=?')
    .run(status, resultSummary, errorMessage, durationMs, finishedAt, row.id)
  return { id: row.id, status, durationMs, finishedAt }
}

export function listToolLogs(db, query = {}) {
  expireStaleRuns(db)
  const where = []
  const params = []
  if (query.person) {
    if (!PEOPLE.includes(query.person)) throw badRequest('人物身份无效')
    where.push('person=?'); params.push(query.person)
  }
  if (query.source) {
    if (!SOURCES.includes(query.source)) throw badRequest('工具类型无效')
    where.push('source=?'); params.push(query.source)
  }
  if (query.status) {
    if (!STATUSES.includes(query.status)) throw badRequest('状态无效')
    where.push('status=?'); params.push(query.status)
  }
  const limit = Math.min(500, Math.max(1, Number(query.limit) || 100))
  const sql = 'SELECT * FROM tool_call_logs' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY started_at DESC LIMIT ?'
  const rows = db.prepare(sql).all(...params, limit)
  return rows.map(r => ({
    id: r.id,
    person: r.person,
    source: r.source,
    toolName: r.tool_name,
    arguments: safeParse(r.arguments),
    resultSummary: safeParse(r.result_summary),
    status: r.status,
    errorMessage: r.error_message,
    durationMs: r.duration_ms,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  }))
}
