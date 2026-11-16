// 房间小组件：助手可以创建长期存在的记账本 / 清单 / 便签 / 计数器。
// 与服务端/本地模式共用同一套归一化逻辑；配置是 JSON，写库前先清洗。
export const WIDGET_TYPES = ['custom', 'ledger', 'checklist', 'note', 'counter']
export const WIDGET_TITLES = { custom: '小组件', ledger: '记账本', checklist: '清单', note: '便签', counter: '计数器' }

function text(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max)
}

function uid() {
  try {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID()
  } catch { /* 回退 */ }
  return 'w-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function defaultConfig(type) {
  if (type === 'custom') return { html: '', data: {}, summary: '' }
  if (type === 'ledger') return { currency: 'CNY', entries: [] }
  if (type === 'checklist') return { items: [] }
  if (type === 'note') return { text: '' }
  return { count: 0, step: 1 }
}

export function normalizeConfig(type, raw) {
  const config = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  if (type === 'custom') {
    const html = String(config.html == null ? '' : config.html).slice(0, 60000)
    let data = config.data && typeof config.data === 'object' && !Array.isArray(config.data) ? config.data : {}
    try {
      const encoded = JSON.stringify(data)
      if (encoded.length > 60000) data = {}
    } catch { data = {} }
    return { html, data, summary: String(config.summary == null ? '' : config.summary).slice(0, 80) }
  }
  if (type === 'ledger') {
    const entries = (Array.isArray(config.entries) ? config.entries : []).slice(-200).map(entry => ({
      id: text(entry?.id, 80) || uid(),
      amount: Math.round(Math.abs(Number(entry?.amount) || 0) * 100) / 100,
      note: text(entry?.note, 120),
      kind: entry?.kind === 'income' ? 'income' : 'expense',
      at: text(entry?.at, 40) || new Date().toISOString(),
    })).filter(entry => entry.amount !== 0)
    return { currency: text(config.currency, 8) || 'CNY', entries }
  }
  if (type === 'checklist') {
    const items = (Array.isArray(config.items) ? config.items : []).slice(0, 200).map(item => ({
      id: text(item?.id, 80) || uid(),
      text: text(item?.text, 200),
      done: !!item?.done,
    })).filter(item => item.text)
    return { items }
  }
  if (type === 'note') return { text: String(config.text == null ? '' : config.text).slice(0, 8000) }
  const count = Number(config.count)
  const step = Number(config.step)
  return { count: Number.isFinite(count) ? Math.max(-999999, Math.min(999999, Math.round(count))) : 0, step: Number.isFinite(step) && step !== 0 ? step : 1 }
}

export function initWidgets(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS room_widgets (
      id TEXT PRIMARY KEY,
      person TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS room_widgets_person_idx ON room_widgets(person, created_at);
  `)
}

export function mapWidget(row) {
  if (!row) return null
  let config = {}
  try { config = JSON.parse(row.config || '{}') } catch { config = {} }
  return {
    id: row.id, person: row.person, type: row.type, title: row.title,
    config, createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

export function listWidgets(db, person) {
  return db.prepare('SELECT * FROM room_widgets WHERE person=? ORDER BY created_at ASC').all(String(person || '')).map(mapWidget)
}

export function createWidget(db, person, input = {}) {
  const type = WIDGET_TYPES.includes(input.type) ? input.type : 'note'
  const title = text(input.title, 60) || WIDGET_TITLES[type]
  const config = normalizeConfig(type, input.config)
  const id = uid()
  const now = new Date().toISOString()
  db.prepare('INSERT INTO room_widgets (id,person,type,title,config,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, String(person), type, title, JSON.stringify(config), now, now)
  return mapWidget(db.prepare('SELECT * FROM room_widgets WHERE id=?').get(id))
}

export function updateWidget(db, id, person, patch = {}) {
  const row = db.prepare('SELECT * FROM room_widgets WHERE id=? AND person=?').get(String(id || ''), String(person || ''))
  if (!row) throw Object.assign(new Error('小组件不存在或不属于当前助手'), { status: 404 })
  const current = mapWidget(row)
  const title = patch.title != null ? (text(patch.title, 60) || current.title) : current.title
  const config = patch.config != null ? normalizeConfig(current.type, patch.config) : current.config
  const now = new Date().toISOString()
  db.prepare('UPDATE room_widgets SET title=?, config=?, updated_at=? WHERE id=?').run(title, JSON.stringify(config), now, row.id)
  return mapWidget(db.prepare('SELECT * FROM room_widgets WHERE id=?').get(row.id))
}

export function deleteWidget(db, id, person) {
  const result = db.prepare('DELETE FROM room_widgets WHERE id=? AND person=?').run(String(id || ''), String(person || ''))
  return result.changes > 0
}
