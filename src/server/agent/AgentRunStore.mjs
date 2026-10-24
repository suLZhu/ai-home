// Persistent record of every agent run (one user prompt -> one bounded loop).
// A run row survives restarts, so "the assistant did something in the background"
// is auditable instead of living only in a page's memory.
import { randomUUID } from 'node:crypto'

export const RUN_STATUSES = ['running', 'succeeded', 'failed', 'cancelled', 'timed_out']
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled', 'timed_out'])

export function initAgentRuns(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      assistant_id TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      conversation_id TEXT,
      prompt TEXT NOT NULL,
      answer TEXT NOT NULL DEFAULT '',
      rounds INTEGER NOT NULL DEFAULT 0,
      tool_calls INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      error_code TEXT,
      error_message TEXT,
      usage TEXT NOT NULL DEFAULT '{}',
      model TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      finished_at TEXT
    );
    CREATE INDEX IF NOT EXISTS agent_runs_assistant_idx ON agent_runs(assistant_id, created_at);
    CREATE INDEX IF NOT EXISTS agent_runs_status_idx ON agent_runs(status);
  `)
  // Backfill for databases created before scheduled-task linkage.
  const cols = db.prepare('PRAGMA table_info(agent_runs)').all().map(row => row.name)
  if (!cols.includes('task_id')) db.exec('ALTER TABLE agent_runs ADD COLUMN task_id TEXT')
  // Idempotency key: a retried POST with the same key must never start a
  // second write-executing loop (spec: 同一 idempotencyKey 不重复执行写操作).
  if (!cols.includes('idempotency_key')) db.exec('ALTER TABLE agent_runs ADD COLUMN idempotency_key TEXT')
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS agent_runs_idem_idx ON agent_runs(assistant_id, idempotency_key) WHERE idempotency_key IS NOT NULL')
  // A restart kills every in-flight loop; orphaned `running` rows would stay
  // "executing" forever. Fail them once at boot — at-least-once task pickup
  // will re-run anything that was due (see TaskScheduler).
  db.prepare(`UPDATE agent_runs SET status='failed', error_code='SERVER_RESTART',
    error_message='服务重启，运行中断', updated_at=?, finished_at=? WHERE status='running'`)
    .run(new Date().toISOString(), new Date().toISOString())
}

function mapRun(row) {
  if (!row) return null
  let usage = {}
  try { usage = JSON.parse(row.usage || '{}') } catch { usage = {} }
  return {
    id: row.id,
    assistantId: row.assistant_id,
    source: row.source,
    taskId: row.task_id || null,
    idempotencyKey: row.idempotency_key || null,
    conversationId: row.conversation_id || '',
    prompt: row.prompt,
    answer: row.answer,
    rounds: row.rounds,
    toolCalls: row.tool_calls,
    status: row.status,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    usage,
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
  }
}

export function createAgentRun(db, input) {
  const idempotencyKey = typeof input.idempotencyKey === 'string' && input.idempotencyKey.trim()
    ? input.idempotencyKey.trim().slice(0, 120) : null
  // Replay protection: the same key returns the ORIGINAL run instead of
  // starting a second loop — a retried POST can never double-execute writes.
  if (idempotencyKey) {
    const existing = db.prepare('SELECT * FROM agent_runs WHERE assistant_id=? AND idempotency_key=?')
      .get(String(input.assistantId), idempotencyKey)
    if (existing) return { ...mapRun(existing), reused: true }
  }
  const id = randomUUID()
  const now = new Date().toISOString()
  db.prepare(`INSERT INTO agent_runs (id,assistant_id,source,conversation_id,task_id,idempotency_key,prompt,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'running',?,?)`)
    .run(id, input.assistantId, input.source || 'manual', input.conversationId || null, input.taskId || null, idempotencyKey, String(input.prompt || ''), now, now)
  return { ...mapRun(db.prepare('SELECT * FROM agent_runs WHERE id=?').get(id)), reused: false }
}

// Terminal transitions are one-way; a repeated finish is an idempotent no-op.
export function finishAgentRun(db, id, patch) {
  const row = db.prepare('SELECT * FROM agent_runs WHERE id=?').get(String(id || ''))
  if (!row) throw Object.assign(new Error('运行记录不存在'), { status: 404 })
  if (TERMINAL.has(row.status)) return mapRun(row)
  const status = RUN_STATUSES.includes(patch.status) ? patch.status : 'failed'
  const now = new Date().toISOString()
  db.prepare(`UPDATE agent_runs SET status=?,answer=?,rounds=?,tool_calls=?,error_code=?,error_message=?,usage=?,model=?,updated_at=?,finished_at=? WHERE id=?`)
    .run(status, String(patch.answer || ''), Math.max(0, Number(patch.rounds) || 0), Math.max(0, Number(patch.toolCalls) || 0),
      patch.errorCode ? String(patch.errorCode).slice(0, 64) : null,
      patch.errorMessage ? String(patch.errorMessage).slice(0, 800) : null,
      JSON.stringify(patch.usage || {}), String(patch.model || ''), now, now, row.id)
  return mapRun(db.prepare('SELECT * FROM agent_runs WHERE id=?').get(row.id))
}

export function getAgentRun(db, id) {
  return mapRun(db.prepare('SELECT * FROM agent_runs WHERE id=?').get(String(id || '')))
}

export function listAgentRuns(db, query = {}) {
  const where = []
  const params = []
  if (query.assistantId) { where.push('assistant_id=?'); params.push(String(query.assistantId)) }
  if (query.status) {
    if (!RUN_STATUSES.includes(query.status)) throw Object.assign(new Error('状态无效'), { status: 400 })
    where.push('status=?'); params.push(query.status)
  }
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 50))
  const sql = 'SELECT * FROM agent_runs' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY created_at DESC LIMIT ?'
  return db.prepare(sql).all(...params, limit).map(mapRun)
}
