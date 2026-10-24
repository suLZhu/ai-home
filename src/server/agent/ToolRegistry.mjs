// Tool registry: built-in tools (memory / worldbook / ledger) plus every
// enabled MCP connection bound to the calling assistant.
//
// Two safety rules live here:
//  1. Tools that act "as the assistant" get their identity injected server-side;
//     whatever the model put in `person` is overwritten before execution.
//  2. MCP tool names are namespaced per connection so two servers exposing the
//     same tool name can never shadow each other.
import { randomUUID } from 'node:crypto'
import { searchMemoryIndex } from '../../memoryIndex.mjs'
import { SQLiteMemoryProvider } from './MemoryStore.mjs'

const sanitize = (text, max = 40) => String(text || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, max)

function def(name, description, properties, required) {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required: required || [] } } }
}

// Built-in tool table. `run` receives (db, person, args) — person is always
// the server-verified assistant id, never a model-supplied value.
const BUILTINS = [
  {
    name: 'memory_search',
    source: 'worldbook',
    readOnly: true,
    definition: def('memory_search', '搜索当前助手的长期记忆库（已确认生效的记忆条目）与历史会话原文。', {
      query: { type: 'string', description: '搜索关键词，2 至 160 字' },
    }, ['query']),
    run(db, person, args, context) {
      const query = String(args.query || '').trim()
      if (query.length < 2 || query.length > 160) throw Object.assign(new Error('搜索内容长度应为 2 至 160 字'), { status: 400 })
      // Governed memories first (only lifecycle=active; the Recall Ledger
      // suppresses anything injected into this conversation recently), then
      // original conversation excerpts as fallback context.
      const records = SQLiteMemoryProvider(db).search({
        person, query, limit: 5,
        conversationId: context?.conversationId || '',
        runId: context?.runId || null,
      })
      const excerpts = searchMemoryIndex(db, { person, query, limit: 5 })
      return { records, excerpts }
    },
  },
  {
    name: 'memory_add',
    source: 'worldbook',
    readOnly: false,
    definition: def('memory_add', '提议一条新的长期记忆（写操作）。仅当对话中出现了值得长期记住的新事实、约定或偏好时调用；提议会进入候选区，用户确认后才生效。', {
      title: { type: 'string', description: '记忆标题，2 至 120 字' },
      content: { type: 'string', description: '记忆内容，1 至 4000 字；写清事实本身，不要写你的感想' },
      keywords: { type: 'string', description: '召回关键词，逗号分隔，可选' },
      category: { type: 'string', description: '分类：人物关系/经历事件/偏好习惯/项目进度/其他' },
      scope: { type: 'string', enum: ['world', 'private', 'ops'], description: 'world=世界观事实 private=与用户的私密记忆 ops=运行与协作事务' },
    }, ['title', 'content']),
    run(db, person, args, context) {
      const { record, duplicate } = SQLiteMemoryProvider(db).propose({
        person,
        title: String(args.title || ''),
        content: String(args.content || ''),
        keywords: String(args.keywords || ''),
        category: String(args.category || '其他'),
        scope: String(args.scope || 'private'),
        // Provenance comes from the server-side run, never from the model.
        sourceConversationId: context?.conversationId || '',
        createdBy: 'model',
      })
      return { ok: true, id: record.id, lifecycle: record.lifecycle, duplicate,
        message: duplicate ? '相同内容的记忆已存在，未重复创建。' : '已加入候选记忆，等待用户确认后生效。' }
    },
  },
  {
    name: 'worldbook_search',
    source: 'worldbook',
    readOnly: true,
    definition: def('worldbook_search', '搜索当前助手已启用且绑定到自己的世界书条目。', {
      query: { type: 'string', description: '关键词，匹配标题或正文' },
    }, ['query']),
    run(db, person, args) {
      const query = String(args.query || '').trim().toLowerCase()
      if (!query) throw Object.assign(new Error('缺少关键词'), { status: 400 })
      const row = db.prepare('SELECT payload FROM app_state WHERE id=1').get()
      let entries = []
      try { entries = JSON.parse(row?.payload || '{}').worldEntries || [] } catch { entries = [] }
      const hits = entries
        .filter(e => e && e.enabled !== false && Array.isArray(e.boundCharacters) && e.boundCharacters.includes(person))
        .filter(e => [e.title, e.content, e.keywords].some(v => String(v || '').toLowerCase().includes(query)))
        .slice(0, 5)
        .map(e => ({ id: e.id, title: e.title, content: String(e.content || '').slice(0, 800) }))
      return { results: hits }
    },
  },
  {
    name: 'ledger_list',
    source: 'ledger',
    readOnly: true,
    definition: def('ledger_list', '读取共享账本最近的收支记录。', {
      limit: { type: 'integer', description: '返回条数，默认 20，最多 100' },
    }, []),
    run(db, _person, args) {
      const limit = Math.min(100, Math.max(1, Number(args.limit) || 20))
      const rows = db.prepare('SELECT id,kind,amount_cents,currency,category,note,entry_date,created_by,created_at FROM ledger_entries ORDER BY entry_date DESC,created_at DESC LIMIT ?').all(limit)
      return { entries: rows.map(r => ({ id: r.id, kind: r.kind, amount: r.amount_cents / 100, currency: r.currency, category: r.category, note: r.note, date: r.entry_date, createdBy: r.created_by })) }
    },
  },
  {
    name: 'ledger_add',
    source: 'ledger',
    readOnly: false,
    definition: def('ledger_add', '记一笔账（写操作）。只有用户明确要求记账时才可调用；调用成功才算已记账。', {
      kind: { type: 'string', enum: ['income', 'expense'], description: 'income 收入 / expense 支出' },
      amount: { type: 'number', description: '金额（元），必须大于 0' },
      currency: { type: 'string', enum: ['CNY', 'JPY', 'USD', 'EUR', 'HKD'], description: '币种，默认 CNY' },
      category: { type: 'string', description: '分类，默认 其他' },
      note: { type: 'string', description: '备注' },
      date: { type: 'string', description: '日期 YYYY-MM-DD' },
    }, ['kind', 'amount', 'date']),
    run(db, person, args) {
      if (!['income', 'expense'].includes(args.kind)) throw Object.assign(new Error('收支类型无效'), { status: 400 })
      const cents = Math.round(Number(args.amount) * 100)
      if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 1e12) throw Object.assign(new Error('金额无效'), { status: 400 })
      const currency = String(args.currency || 'CNY').toUpperCase()
      if (!['CNY', 'JPY', 'USD', 'EUR', 'HKD'].includes(currency)) throw Object.assign(new Error('暂不支持此币种'), { status: 400 })
      const date = String(args.date || '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) throw Object.assign(new Error('日期无效'), { status: 400 })
      const category = String(args.category || '其他').trim().slice(0, 40)
      const note = String(args.note || '').trim().slice(0, 300)
      const requestId = randomUUID()
      const id = randomUUID(), now = new Date().toISOString()
      db.exec('BEGIN IMMEDIATE')
      try {
        db.prepare('INSERT INTO ledger_entries (id,kind,amount_cents,currency,category,note,entry_date,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id, args.kind, cents, currency, category, note, date, person, now)
        db.prepare('INSERT INTO ledger_operations (request_id,entry_id,actor,created_at) VALUES (?,?,?,?)').run(requestId, id, person, now)
        db.exec('COMMIT')
      } catch (e) { db.exec('ROLLBACK'); throw e }
      return { ok: true, id }
    },
  },
]

// Registry for one run. `mcpList(row)` and `mcpCall(row, tool, args)` are
// injected by server.mjs so the MCP transport stays in one place.
export async function createToolRegistry({ db, person, mcpList, mcpCall }) {
  const definitions = BUILTINS.map(b => b.definition)
  const mcpMap = new Map()
  const connections = db.prepare('SELECT * FROM mcp_connections WHERE person=? AND enabled=1').all(person)

  for (const row of connections) {
    let listed
    try { listed = await mcpList(row) } catch { continue } // one dead server never blocks a run
    for (const tool of listed || []) {
      if (!tool || !tool.name) continue
      const name = sanitize(`mcp_${String(row.id).slice(0, 8)}_${tool.name}`, 64)
      if (mcpMap.has(name) || BUILTINS.some(b => b.name === name)) continue
      mcpMap.set(name, { row, originalName: String(tool.name), serverName: row.name })
      definitions.push({
        type: 'function',
        function: {
          name,
          description: `[MCP:${row.name}] ${String(tool.description || '')}`.slice(0, 500),
          parameters: tool.inputSchema && typeof tool.inputSchema === 'object' ? tool.inputSchema : { type: 'object', properties: {} },
        },
      })
    }
  }

  const describe = (name) => {
    const builtin = BUILTINS.find(b => b.name === name)
    if (builtin) return { source: builtin.source, serverName: '', readOnly: builtin.readOnly }
    const mapped = mcpMap.get(name)
    if (!mapped) return null
    return { source: 'mcp', serverName: mapped.serverName, readOnly: false }
  }

  return {
    person,
    definitions,
    mcpTools: [...mcpMap.keys()],
    // Metadata without executing; null means unknown tool.
    describe,
    // Returns { source, serverName, readOnly, data }; throws on failure.
    // `context` (runId / conversationId) lets read tools feed the Recall
    // Ledger without trusting any model-supplied identity.
    async invoke(name, args, context) {
      const meta = describe(name)
      if (!meta) throw Object.assign(new Error('未知工具：' + name), { status: 400 })
      const builtin = BUILTINS.find(b => b.name === name)
      if (builtin) return { ...meta, data: builtin.run(db, person, args, context) }
      const mapped = mcpMap.get(name)
      const data = await mcpCall(mapped.row, mapped.originalName, args)
      return { ...meta, data }
    },
  }
}
