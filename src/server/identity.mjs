// Assistant identity: stable assistantId owns every row and every snapshot key.
// Display names (displayName) never participate in ownership — renaming an
// assistant must never move chats, memories or MCP bindings.
//
// Migration contract: EVERY function here is idempotent. Running the whole
// module twice against the same database must not copy, duplicate or lose data.

export const LEGACY_NAME_TO_ID = { '晏未晞': 'assistant-yanweixi', '言朔': 'assistant-yanshuo' }
export const DEFAULT_ASSISTANT_IDS = Object.values(LEGACY_NAME_TO_ID)

// Identity boundary: ids are minted by addAssistant()/the migration above.
// Format check keeps random payloads out without hard-coding the roster, so a
// newly created assistant is valid the moment it exists in the snapshot.
export function isValidAssistantId(value) {
  return typeof value === 'string' && /^assistant-[a-zA-Z0-9-]{4,}$/.test(value) && value.length <= 64
}

// Legacy Chinese display names still appear in old rows/snapshots; map them once.
export function toAssistantId(value) {
  return LEGACY_NAME_TO_ID[value] || value
}

function tableSql(db, name) {
  return db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name)?.sql || ''
}

// Tables whose person column still carries CHECK(person IN ('晏未晞','言朔')).
// SQLite cannot drop a CHECK in place, so rebuild the table with identical
// columns minus the constraint, copying rows (and remapping person) in one go.
const REBUILD_DDL = {
  mcp_connections: `CREATE TABLE mcp_connections (
    id TEXT PRIMARY KEY, person TEXT NOT NULL,
    name TEXT NOT NULL, url TEXT NOT NULL, transport TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1, token_enc TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  api_keys: `CREATE TABLE api_keys (
    person TEXT PRIMARY KEY, key_enc TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  scheduled_tasks: `CREATE TABLE scheduled_tasks (
    id TEXT PRIMARY KEY, person TEXT NOT NULL,
    title TEXT NOT NULL, prompt TEXT NOT NULL, run_at TEXT NOT NULL,
    recurrence TEXT NOT NULL DEFAULT 'once' CHECK(recurrence IN ('once','daily','weekly')),
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','ready','completed','paused')),
    last_run_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT 'user', temporary INTEGER NOT NULL DEFAULT 0,
    conversation_id TEXT
  )`,
}

function rebuildTableWithoutPersonCheck(db, table) {
  const sql = tableSql(db, table)
  if (!sql || !/CHECK\s*\(\s*person\s+IN/i.test(sql)) return false
  const ddl = REBUILD_DDL[table]
  if (!ddl) return false
  const temp = table + '__idmig'
  const cols = db.prepare('PRAGMA table_info(' + table + ')').all().map(row => row.name)
  const others = cols.filter(name => name !== 'person')
  // 行级映射：CASE 把旧中文名换成 id，其余行原样保留——一次 INSERT 完成，不丢不重。
  const cases = Object.entries(LEGACY_NAME_TO_ID).map(([name, id]) => `WHEN '${name}' THEN '${id}'`).join(' ')
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec('DROP TABLE IF EXISTS ' + temp)
    db.exec(ddl.replace(new RegExp('CREATE TABLE ' + table + '\\b'), 'CREATE TABLE ' + temp))
    db.prepare(`INSERT INTO ${temp} (person,${others.join(',')}) SELECT CASE person ${cases} ELSE person END,${others.join(',')} FROM ${table}`).run()
    db.exec('DROP TABLE ' + table)
    db.exec(`ALTER TABLE ${temp} RENAME TO ${table}`)
    if (table === 'scheduled_tasks') db.exec('CREATE INDEX IF NOT EXISTS scheduled_tasks_due_idx ON scheduled_tasks(status, run_at)')
    db.exec('COMMIT')
    return true
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* transaction already closed */ }
    throw error
  }
}

// Remap legacy Chinese person/owner/actor values that lived in tables without
// a CHECK constraint. Each UPDATE matches only legacy rows, so re-running is a
// no-op once values are ids.
function migratePersonValues(db) {
  const personTables = ['mcp_connections', 'scheduled_tasks', 'api_keys', 'tool_call_logs', 'proactive_settings', 'proactive_events', 'assistant_inbox']
  for (const table of personTables) {
    if (!tableSql(db, table)) continue
    for (const [name, id] of Object.entries(LEGACY_NAME_TO_ID)) {
      db.prepare(`UPDATE ${table} SET person=? WHERE person=?`).run(id, name)
    }
  }
  if (tableSql(db, 'ledger_entries')) {
    for (const [name, id] of Object.entries(LEGACY_NAME_TO_ID)) {
      db.prepare('UPDATE ledger_entries SET created_by=? WHERE created_by=?').run(id, name)
    }
  }
  if (tableSql(db, 'diary_entries')) {
    for (const [name, id] of Object.entries(LEGACY_NAME_TO_ID)) {
      db.prepare('UPDATE diary_entries SET owner=? WHERE owner=?').run(id, name)
    }
  }
  // FTS recall index: person is an UNINDEXED column, plain UPDATE works.
  if (tableSql(db, 'conversation_recall')) {
    for (const [name, id] of Object.entries(LEGACY_NAME_TO_ID)) {
      db.prepare('UPDATE conversation_recall SET person=? WHERE person=?').run(id, name)
    }
  }
}

// Full database migration: strip legacy CHECK constraints, remap every value.
// Safe to call on every boot.
export function migrateDatabase(db) {
  for (const table of Object.keys(REBUILD_DDL)) rebuildTableWithoutPersonCheck(db, table)
  migratePersonValues(db)
}

const SNAPSHOT_KEYED_FIELDS = [
  'conversations', 'activeConversationIds', 'modelConfig', 'apiKey',
  'memory', 'memoryEntries', 'prompt', 'characters', 'worldbook',
  'mcpConnections', 'tasks',
]

function mapObjectKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  let changed = false
  const out = {}
  for (const [key, item] of Object.entries(value)) {
    const next = toAssistantId(key)
    if (next !== key) changed = true
    out[next] = item
  }
  return changed ? out : value
}

// v2 snapshot (Chinese keys) -> v3 (assistantId keys). Returns the migrated
// state, or null when the snapshot is already v3 / not an object — callers
// treat null as "nothing to persist".
export function migrateSnapshot(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null
  if (Number(state.version) >= 3 && Array.isArray(state.assistants)) return null
  const next = { ...state, version: 3 }
  if (!Array.isArray(next.assistants) || !next.assistants.length) {
    next.assistants = Object.entries(LEGACY_NAME_TO_ID).map(([name, id]) => ({ id, name, createdAt: '1970-01-01T00:00:00.000Z' }))
  } else {
    next.assistants = next.assistants.map(a => ({ ...a, name: String(a.name || LEGACY_NAME_TO_ID[a.id] || a.id), id: toAssistantId(a.id) }))
  }
  for (const field of SNAPSHOT_KEYED_FIELDS) next[field] = mapObjectKeys(next[field])
  if (Array.isArray(next.worldEntries)) {
    next.worldEntries = next.worldEntries.map(entry => {
      if (!entry || typeof entry !== 'object') return entry
      const bound = Array.isArray(entry.boundCharacters) ? entry.boundCharacters
        : entry.boundCharacter ? [entry.boundCharacter]
          : [DEFAULT_ASSISTANT_IDS[0]]
      return { ...entry, boundCharacters: bound.map(toAssistantId) }
    })
  }
  if (next.conversations && typeof next.conversations === 'object') {
    for (const [id, list] of Object.entries(next.conversations)) {
      if (Array.isArray(list)) for (const conversation of list) if (conversation && typeof conversation === 'object' && !conversation.assistantId) conversation.assistantId = id
    }
  }
  if (next.mcpConnections && typeof next.mcpConnections === 'object') {
    for (const [id, list] of Object.entries(next.mcpConnections)) {
      if (Array.isArray(list)) for (const connection of list) if (connection && typeof connection === 'object') connection.person = id
    }
  }
  return next
}

// Assistant roster from the persisted snapshot (fallback: the two defaults).
export function knownAssistantIds(db) {
  try {
    const row = db.prepare('SELECT payload FROM app_state WHERE id=1').get()
    if (row) {
      const state = JSON.parse(row.payload)
      if (Array.isArray(state?.assistants)) {
        const ids = state.assistants.map(a => toAssistantId(a?.id)).filter(isValidAssistantId)
        if (ids.length) return ids
      }
    }
  } catch { /* fall through to defaults */ }
  return [...DEFAULT_ASSISTANT_IDS]
}
