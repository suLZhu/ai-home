// Memory governance store (DuduLove-style light lifecycle):
//
//   candidate --confirm--> active --archive--> archived
//       |                     |
//       +----reject-----------+--> rejected (tombstone: the row is kept
//                                forever so the same content can never be
//                                silently re-proposed or re-injected)
//
// Auto-extraction (the model calling the memory_add tool) only ever lands in
// `candidate`; a memory becomes injectable exclusively through a user
// confirmation. Rejection never deletes the row — the tombstone doubles as an
// audit trail and as the duplicate detector for future proposals.
//
// The Recall Ledger (recall_ledger) records which memories were injected into
// which conversation and when. A recall for the same conversation inside the
// short window never returns the same memory twice — no matter how often the
// user keeps talking about the same topic.
//
// Search stays on FTS5 (trigram, same tokenizer as conversation_recall) with
// an instr()-based clause for Chinese substrings; only `active` records are
// indexed, so candidates and tombstones can never leak into a prompt.
import { randomUUID } from 'node:crypto'

export const MEMORY_LIFECYCLES = ['candidate', 'active', 'archived', 'rejected']
export const MEMORY_SCOPES = ['world', 'private', 'ops']
// Short-term re-injection window: a memory recalled for this conversation in
// the last 30 minutes is skipped.
export const RECALL_WINDOW_MS = 30 * 60 * 1000

const ALLOWED_TRANSITIONS = {
  candidate: ['active', 'rejected'],
  active: ['archived', 'rejected'],
  archived: ['active'],
  // Tombstones can be explicitly restored, but never silently.
  rejected: ['active'],
}

export function initMemoryStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_records (
      id TEXT PRIMARY KEY,
      person TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'private',
      lifecycle TEXT NOT NULL DEFAULT 'candidate',
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      keywords TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '其他',
      source_conversation_id TEXT,
      source_message_ids TEXT NOT NULL DEFAULT '[]',
      created_by TEXT NOT NULL DEFAULT 'model',
      recall_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS memory_records_person_idx ON memory_records(person, lifecycle, updated_at);
    CREATE TABLE IF NOT EXISTS recall_ledger (
      id TEXT PRIMARY KEY,
      person TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      memory_id TEXT NOT NULL,
      run_id TEXT,
      injected_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS recall_ledger_conv_idx ON recall_ledger(conversation_id, memory_id, injected_at);
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_records_fts USING fts5(
      memory_id UNINDEXED, person UNINDEXED, title, content, keywords,
      tokenize='trigram'
    );
  `)
}

export function mapRecord(row) {
  if (!row) return null
  let sourceMessageIds = []
  try { sourceMessageIds = JSON.parse(row.source_message_ids || '[]') } catch { sourceMessageIds = [] }
  return {
    id: row.id,
    person: row.person,
    scope: row.scope,
    lifecycle: row.lifecycle,
    title: row.title,
    content: row.content,
    keywords: row.keywords,
    category: row.category,
    sourceConversationId: row.source_conversation_id || '',
    sourceMessageIds: Array.isArray(sourceMessageIds) ? sourceMessageIds : [],
    createdBy: row.created_by,
    recallCount: row.recall_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// Keep the FTS mirror in sync: only `active` records are searchable. Every
// lifecycle flip goes through this helper so the index can never drift.
function reindex(db, record) {
  db.prepare('DELETE FROM memory_records_fts WHERE memory_id=?').run(record.id)
  if (record.lifecycle === 'active') {
    db.prepare('INSERT INTO memory_records_fts (memory_id,person,title,content,keywords) VALUES (?,?,?,?,?)')
      .run(record.id, record.person, record.title, record.content, record.keywords)
  }
}

// MemoryProvider contract (what any backend must implement):
//   propose(input)                        -> { record, duplicate } — lands as candidate
//   transition(id, lifecycle)             -> record               — validated state machine
//   confirm(id) / reject(id) / archive(id)-> record               — sugar over transition
//   get(id) / list({person, lifecycle, limit}) -> record | record[]
//   search({person, query, limit, conversationId, runId}) -> record[]
//                                            — active only, ledger-aware, records injections
//   recordRecall({person, conversationId, memoryId, runId}) -> void
// SQLiteMemoryProvider is the reference implementation; a future remote or
// vector backend only needs to satisfy the same surface.
export function SQLiteMemoryProvider(db) {
  function get(id) {
    return mapRecord(db.prepare('SELECT * FROM memory_records WHERE id=?').get(String(id || '')))
  }

  function list({ person, lifecycle = '', limit = 50 } = {}) {
    const capped = Math.min(200, Math.max(1, Number(limit) || 50))
    if (lifecycle) {
      if (!MEMORY_LIFECYCLES.includes(lifecycle)) throw Object.assign(new Error('记忆状态无效'), { status: 400 })
      return db.prepare('SELECT * FROM memory_records WHERE person=? AND lifecycle=? ORDER BY updated_at DESC LIMIT ?')
        .all(person, lifecycle, capped).map(mapRecord)
    }
    return db.prepare('SELECT * FROM memory_records WHERE person=? ORDER BY updated_at DESC LIMIT ?')
      .all(person, capped).map(mapRecord)
  }

  function transition(id, next) {
    if (!MEMORY_LIFECYCLES.includes(next)) throw Object.assign(new Error('记忆状态无效'), { status: 400 })
    const row = db.prepare('SELECT * FROM memory_records WHERE id=?').get(String(id || ''))
    if (!row) throw Object.assign(new Error('记忆不存在'), { status: 404 })
    if (row.lifecycle === next) return mapRecord(row)
    if (!ALLOWED_TRANSITIONS[row.lifecycle].includes(next)) {
      throw Object.assign(new Error(`记忆不能从 ${row.lifecycle} 变为 ${next}`), { status: 409 })
    }
    const now = new Date().toISOString()
    db.prepare('UPDATE memory_records SET lifecycle=?, updated_at=? WHERE id=?').run(next, now, row.id)
    const updated = mapRecord(db.prepare('SELECT * FROM memory_records WHERE id=?').get(row.id))
    reindex(db, updated)
    return updated
  }

  function propose(input) {
    const person = String(input.person || '')
    const title = String(input.title || '').trim().slice(0, 120)
    const content = String(input.content || '').trim().slice(0, 4000)
    if (!title || !content) throw Object.assign(new Error('记忆标题与内容都不能为空'), { status: 400 })
    const scope = MEMORY_SCOPES.includes(input.scope) ? input.scope : 'private'
    const keywords = String(input.keywords || '').trim().slice(0, 500)
    const category = String(input.category || '其他').trim().slice(0, 40)
    const sourceConversationId = typeof input.sourceConversationId === 'string' ? input.sourceConversationId.slice(0, 120) : ''
    const sourceMessageIds = (Array.isArray(input.sourceMessageIds) ? input.sourceMessageIds : [])
      .filter(x => typeof x === 'string').slice(0, 20).map(x => x.slice(0, 120))
    const createdBy = ['model', 'user', 'system'].includes(input.createdBy) ? input.createdBy : 'model'

    // Tombstone-aware dedupe: identical content for the same person is never
    // stored twice — a rejected proposal stays rejected, an active one stays.
    const existing = db.prepare('SELECT * FROM memory_records WHERE person=? AND content=? LIMIT 1').get(person, content)
    if (existing) return { record: mapRecord(existing), duplicate: true }

    // A user-created record skips the queue: the user *is* the confirmation.
    const lifecycle = createdBy === 'user' ? 'active' : 'candidate'
    const id = randomUUID()
    const now = new Date().toISOString()
    db.prepare(`INSERT INTO memory_records (id,person,scope,lifecycle,title,content,keywords,category,
      source_conversation_id,source_message_ids,created_by,recall_count,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?,?)`)
      .run(id, person, scope, lifecycle, title, content, keywords, category,
        sourceConversationId || null, JSON.stringify(sourceMessageIds), createdBy, now, now)
    const record = get(id)
    reindex(db, record)
    return { record, duplicate: false }
  }

  function recordRecall({ person, conversationId, memoryId, runId }) {
    if (!conversationId) return
    db.prepare('INSERT INTO recall_ledger (id,person,conversation_id,memory_id,run_id,injected_at) VALUES (?,?,?,?,?,?)')
      .run(randomUUID(), person, String(conversationId).slice(0, 120), memoryId, runId || null, new Date().toISOString())
    db.prepare('UPDATE memory_records SET recall_count=recall_count+1 WHERE id=?').run(memoryId)
  }

  function search({ person, query, limit = 5, conversationId = '', runId = null }) {
    const words = String(query || '').trim().slice(0, 160).split(/[\s，。！？、,.!?；;：:（）()]+/).filter(x => x.length >= 2).slice(0, 8)
    if (!words.length) return []
    // Same substring strategy as conversation_recall: trigram segments for long
    // Chinese words, raw terms otherwise; parameters prevent query injection.
    const terms = [...new Set(words.flatMap(w => {
      if (!/[㐀-鿿]/u.test(w) || w.length <= 4) return [w.slice(0, 50)]
      const segments = []
      for (let i = 0; i + 3 <= w.length && segments.length < 12; i += 2) segments.push(w.slice(i, i + 3))
      return segments
    }))].slice(0, 20)
    const clauses = terms.map(() => 'instr(t.title || char(10) || t.content || char(10) || t.keywords, ?) > 0').join(' OR ')
    const rows = db.prepare(`SELECT t.memory_id, substr(r.title,1,120) AS title, substr(r.content,1,700) AS content,
        r.category, r.source_conversation_id AS sourceConversationId, r.recall_count AS recallCount
      FROM memory_records_fts t JOIN memory_records r ON r.id = t.memory_id
      WHERE t.person=? AND r.lifecycle='active' AND (${clauses})
      ORDER BY r.updated_at DESC LIMIT ?`).all(person, ...terms, Math.min(30, Math.max(1, limit * 6)))

    let hits = rows.map(r => ({
      id: r.memory_id, title: r.title, content: r.content, category: r.category,
      sourceConversationId: r.sourceConversationId || '', recallCount: r.recallCount,
      score: terms.reduce((n, t) => n + ((r.title + r.content).includes(t) ? 1 : 0), 0),
    })).sort((a, b) => b.score - a.score).slice(0, limit)

    // Recall Ledger: inside one conversation, a memory injected within the
    // short window is not offered again.
    if (conversationId) {
      const cutoff = new Date(Date.now() - RECALL_WINDOW_MS).toISOString()
      const seen = new Set(db.prepare('SELECT memory_id FROM recall_ledger WHERE conversation_id=? AND injected_at>?')
        .all(String(conversationId).slice(0, 120), cutoff).map(r => r.memory_id))
      hits = hits.filter(h => !seen.has(h.id))
    }
    for (const hit of hits) recordRecall({ person, conversationId, memoryId: hit.id, runId })
    return hits
  }

  return { get, list, transition, confirm: id => transition(id, 'active'), reject: id => transition(id, 'rejected'), archive: id => transition(id, 'archived'), propose, search, recordRecall }
}
