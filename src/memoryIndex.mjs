// Original conversation recall index. It stores text only, never attachment bytes or keys.
// Each assistant has a strict person partition. Indexed rows mirror /api/state snapshots.
export function initMemoryIndex(db) {
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS conversation_recall USING fts5(
    person UNINDEXED, conversation_id UNINDEXED, title UNINDEXED,
    message_index UNINDEXED, role UNINDEXED, content,
    tokenize='trigram'
  )`)
  const count = db.prepare('SELECT count(*) AS n FROM conversation_recall').get().n
  if (!count) {
    const saved = db.prepare('SELECT payload FROM app_state WHERE id=1').get()
    if (saved) {
      try { rebuildMemoryIndex(db, JSON.parse(saved.payload)) }
      catch (error) { console.warn('[recall] initial indexing skipped:', error.message) }
    }
  }
}

export function rebuildMemoryIndex(db, state) {
  const insert = db.prepare('INSERT INTO conversation_recall (person,conversation_id,title,message_index,role,content) VALUES (?,?,?,?,?,?)')
  db.prepare('DELETE FROM conversation_recall').run()
  for (const person of ['晏未晞', '言朔']) {
    const conversations = Array.isArray(state?.conversations?.[person]) ? state.conversations[person] : []
    for (const conversation of conversations.slice(0, 300)) {
      if (typeof conversation?.id !== 'string' || !Array.isArray(conversation.messages)) continue
      const title = String(conversation.title || '未命名会话').slice(0, 120)
      for (const [index, message] of conversation.messages.slice(0, 1200).entries()) {
        if (!['user','assistant'].includes(message?.role)) continue
        const content = typeof message.content === 'string' ? message.content.trim().slice(0, 5000) : ''
        if (content.length < 2) continue
        insert.run(person, conversation.id.slice(0, 120), title, index, message.role, content)
      }
    }
  }
}

export function searchMemoryIndex(db, { person, query, exclude = '', limit = 5 }) {
  if (!['晏未晞','言朔'].includes(person)) throw new Error('invalid person')
  const words = String(query).trim().slice(0, 160).split(/[\s，。！？、,.!?；;：:（）()]+/).filter(x => x.length >= 2).slice(0, 8)
  if (!words.length) return []
  // trigram FTS5 accelerates substring matching of 3+ chars, including Chinese.
  // Two-character queries use a bounded LIKE scan. Parameters prevent query injection.
  const terms = [...new Set(words.flatMap(w => {
    if (!/[\u3400-\u9fff]/u.test(w) || w.length <= 4) return [w.slice(0,50)]
    const segments = []
    for (let i = 0; i + 3 <= w.length && segments.length < 12; i += 2) segments.push(w.slice(i,i+3))
    return segments
  }))].slice(0, 20)
  const clauses = terms.map(() => 'instr(content, ?) > 0').join(' OR ')
  const rows = db.prepare(`SELECT conversation_id AS conversationId,title,message_index AS messageIndex,role,substr(content,1,700) AS content FROM conversation_recall WHERE person=? AND conversation_id != ? AND (${clauses}) ORDER BY rowid DESC LIMIT ?`).all(person, exclude, ...terms, Math.min(30, Math.max(1,limit*6)))
  return rows.map(r => ({...r, score: terms.reduce((n,t)=>n+(r.content.includes(t)?1:0),0)})).sort((a,b)=>b.score-a.score).slice(0,limit)
}
