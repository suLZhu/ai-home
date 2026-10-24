// Tool permission policy: per-person, per-tool mode of auto / ask / deny.
// Stage 2 ships the storage and decision path with a safe default (auto for
// everything); the approval queue and the ask-flow are wired in the next
// stage. Decisions are always made server-side — the model never sees or
// sets this table.

const MODES = ['auto', 'ask', 'deny']

export function initToolPolicies(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_policies (
      person TEXT NOT NULL,
      tool TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('auto','ask','deny')),
      updated_at TEXT NOT NULL,
      PRIMARY KEY (person, tool)
    );
  `)
}

export function getPolicy(db, person, tool) {
  const row = db.prepare('SELECT mode FROM tool_policies WHERE person=? AND tool=?').get(String(person), String(tool))
  return MODES.includes(row?.mode) ? row.mode : 'auto'
}

export function setPolicy(db, person, tool, mode) {
  if (!MODES.includes(mode)) throw Object.assign(new Error('权限模式无效'), { status: 400 })
  if (!String(tool).trim()) throw Object.assign(new Error('工具名无效'), { status: 400 })
  const now = new Date().toISOString()
  db.prepare(`INSERT INTO tool_policies (person,tool,mode,updated_at) VALUES (?,?,?,?)
    ON CONFLICT(person,tool) DO UPDATE SET mode=excluded.mode, updated_at=excluded.updated_at`)
    .run(String(person), String(tool), mode, now)
  return { person, tool, mode }
}

export function listPolicies(db, person) {
  return db.prepare('SELECT person, tool, mode, updated_at FROM tool_policies WHERE person=? ORDER BY tool').all(String(person))
    .map(r => ({ person: r.person, tool: r.tool, mode: r.mode, updatedAt: r.updated_at }))
}
