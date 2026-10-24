import { createServer } from 'node:http'
import { randomBytes, createHash, timingSafeEqual, createCipheriv, createDecipheriv, randomUUID, scryptSync } from 'node:crypto'
import { isIP } from 'node:net'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { initMemoryIndex, rebuildMemoryIndex, searchMemoryIndex } from './memoryIndex.mjs'
import { initInbox, addInboxMessage, listInbox, markInboxRead } from './inbox.mjs'
import { initToolLogs, createToolLog, finishToolLog, listToolLogs } from './toolLog.mjs'
import { initProactive, settings as proactiveSettings, events as proactiveEvents, configure as configureProactive, wake as wakeProactive, dismiss as dismissProactive } from './proactive.mjs'
import { migrateDatabase, migrateSnapshot, isValidAssistantId } from './server/identity.mjs'
import { initAgentRuns, createAgentRun, getAgentRun, listAgentRuns } from './server/agent/AgentRunStore.mjs'
import { AgentEventBus } from './server/agent/AgentEventBus.mjs'
import { AgentRunner } from './server/agent/AgentRunner.mjs'
import { initToolPolicies, setPolicy, listPolicies } from './server/agent/ToolPolicy.mjs'
import { decideApproval, isPending } from './server/agent/ApprovalGate.mjs'
import { createTaskScheduler } from './server/agent/TaskScheduler.mjs'
import { initProactiveHeat, tickHeat, coolHeat, readHeat, dispatchProactiveRun } from './server/agent/ProactiveHeat.mjs'

const password = process.env.AI_HOME_PASSWORD
if (!password || password.length < 16) {
  console.error('AI_HOME_PASSWORD must be set to a password of at least 16 characters.')
  process.exit(1)
}
const dbPath = resolve(process.env.AI_HOME_DB || './data/ai-home.sqlite')
mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 })
const db = new DatabaseSync(dbPath)
db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA synchronous=FULL;
  CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS mcp_connections (
    id TEXT PRIMARY KEY, person TEXT NOT NULL,
    name TEXT NOT NULL, url TEXT NOT NULL, transport TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
    token_enc TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id TEXT PRIMARY KEY, person TEXT NOT NULL,
    title TEXT NOT NULL, prompt TEXT NOT NULL, run_at TEXT NOT NULL,
    recurrence TEXT NOT NULL DEFAULT 'once' CHECK(recurrence IN ('once','daily','weekly')),
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','ready','completed','paused')),
    last_run_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS scheduled_tasks_due_idx ON scheduled_tasks(status, run_at);
  CREATE TABLE IF NOT EXISTS ledger_entries (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('income','expense')),
    amount_cents INTEGER NOT NULL CHECK(amount_cents>0), currency TEXT NOT NULL,
    category TEXT NOT NULL, note TEXT NOT NULL, entry_date TEXT NOT NULL,
    created_by TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ledger_operations (
    request_id TEXT PRIMARY KEY, entry_id TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ledger_entries_date_idx ON ledger_entries(entry_date);
  CREATE TABLE IF NOT EXISTS diary_entries (
    id TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL,
    visibility TEXT NOT NULL CHECK(visibility IN ('public','locked')),
    body TEXT NOT NULL, salt TEXT, iv TEXT, tag TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS api_keys (
    person TEXT PRIMARY KEY,
    key_enc TEXT NOT NULL, updated_at TEXT NOT NULL
  );


`)
// Backwards-compatible workflow ownership metadata. Existing user-created tasks stay protected.
const workflowColumns = db.prepare('PRAGMA table_info(scheduled_tasks)').all().map(row => row.name)
if (!workflowColumns.includes('created_by')) db.exec("ALTER TABLE scheduled_tasks ADD COLUMN created_by TEXT NOT NULL DEFAULT 'user'")
if (!workflowColumns.includes('temporary')) db.exec('ALTER TABLE scheduled_tasks ADD COLUMN temporary INTEGER NOT NULL DEFAULT 0')
migrateDatabase(db)
initMemoryIndex(db)
initProactive(db)
initProactiveHeat(db) // needs proactive_events to exist first (adds run_id column on old DBs)
initInbox(db)
initToolLogs(db)
initAgentRuns(db)
initToolPolicies(db)
const sessions = new Map()
const failures = new Map()
const COOKIE = 'ai_home_session'
const ALLOWED_ORIGIN = process.env.AI_HOME_ALLOWED_ORIGIN || ''
const MAX_BODY = 2 * 1024 * 1024
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000
const passwordHash = createHash('sha256').update(password).digest()
const secretKey = Buffer.from(process.env.AI_HOME_SECRET_KEY || '', 'hex')
if (secretKey.length !== 32) { console.error('AI_HOME_SECRET_KEY must be a 32-byte hex key.'); process.exit(1) }

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers })
  res.end(JSON.stringify(body))
}
function readBody(req, max = MAX_BODY) {
  return new Promise((resolveBody, reject) => {
    let data = ''
    req.on('data', chunk => {
      data += chunk
      if (Buffer.byteLength(data) > max) {
        reject(Object.assign(new Error('请求内容过大，单次最多 ' + Math.round(max / 1024 / 1024) + ' MB'), { status: 413 }))
        req.destroy()
      }
    })
    req.on('end', () => {
      try { resolveBody(JSON.parse(data || '{}')) }
      catch { reject(Object.assign(new Error('JSON 格式无效'), { status: 400 })) }
    })
    req.on('error', reject)
  })
}
function cookieValue(req) {
  const header = req.headers.cookie || ''
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === COOKIE) return value.join('=')
  }
  return ''
}
function getSession(req) {
  const token = cookieValue(req)
  const session = sessions.get(token)
  if (!session) return null
  if (session.expires < Date.now()) { sessions.delete(token); return null }
  session.expires = Date.now() + SESSION_TTL
  return token
}
function sameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true
  if (ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN) return true
  try {
    const host = req.headers['x-forwarded-host'] || req.headers['x-original-host'] || req.headers.host
    return new URL(origin).host === host
  } catch { return false }
}
function encryptSecret(value) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', secretKey, iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), ciphertext.toString('hex')].join(':')
}
function decryptSecret(value) {
  const [iv, tag, ciphertext] = value.split(':')
  const decipher = createDecipheriv('aes-256-gcm', secretKey, Buffer.from(iv, 'hex'))
  decipher.setAuthTag(Buffer.from(tag, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'hex')), decipher.final()]).toString('utf8')
}
function publicMcp(row) { let hasToken = false; try { const saved = JSON.parse(decryptSecret(row.token_enc)); hasToken = typeof saved.token === 'string' && saved.token.length > 0 } catch { hasToken = decryptSecret(row.token_enc).length > 0 }; return { id: row.id, person: row.person, name: row.name, url: row.url, transport: row.transport, enabled: !!row.enabled, updatedAt: row.updated_at, hasToken } }
function validateRemoteUrl(raw) {
  let u
  try { u = new URL(raw) } catch { throw Object.assign(new Error('MCP 地址格式无效'), { status: 400 }) }
  if (u.protocol !== 'https:') throw Object.assign(new Error('远程 MCP 必须使用 HTTPS'), { status: 400 })
  if (u.username || u.password || !u.hostname || u.hostname === 'localhost' || u.hostname.endsWith('.localhost') || u.hostname.endsWith('.local')) throw Object.assign(new Error('MCP 地址不允许包含凭证或指向本地网络'), { status: 400 })
  if (isIP(u.hostname)) {
    const ip = u.hostname.replace(/^\[|\]$/g, '')
    if (ip === '::1' || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('127.') || ip.startsWith('169.254.') || ip.startsWith('172.')) throw Object.assign(new Error('MCP 地址不能指向本地或私有 IP'), { status: 400 })
  }
  return u
}
async function withMcpClient(row, operation) {
  if (!row || !row.enabled) throw Object.assign(new Error('找不到已启用且绑定当前人物的 MCP 服务'), { status: 404 })
  validateRemoteUrl(row.url)
  let saved
  try { saved = JSON.parse(decryptSecret(row.token_enc)) } catch { saved = { token: decryptSecret(row.token_enc), headers: {} } }
  const token = typeof saved.token === 'string' ? saved.token : ''
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(saved.headers && typeof saved.headers === 'object' ? saved.headers : {}) }
  const transport = new StreamableHTTPClientTransport(new URL(row.url), { requestInit: { headers, redirect: 'error' } })
  const client = new Client({ name: 'ai-home', version: '0.1.0' }, { capabilities: {} })
  try { await client.connect(transport); return await operation(client) }
  finally { await client.close().catch(() => {}) }
}
function getClientKey(req) {
  return String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim()
}

// Agent run context. Provider credentials are resolved server-side from the
// saved snapshot (endpoint/model) and api_keys (encrypted key) — the request
// body only names *who* is running, never *how* to authenticate.
const agentEvents = new AgentEventBus()
function providerFor(person) {
  const row = db.prepare('SELECT payload FROM app_state WHERE id=1').get()
  let endpoint = '', model = ''
  try {
    const state = migrateSnapshot(JSON.parse(row?.payload || 'null')) || JSON.parse(row?.payload || 'null')
    const cfg = state?.modelConfig?.[person]
    endpoint = String(cfg?.endpoint || '').trim()
    model = String(cfg?.model || '').trim()
  } catch { /* no snapshot yet */ }
  let apiKey = ''
  const keyRow = db.prepare('SELECT key_enc FROM api_keys WHERE person=?').get(person)
  if (keyRow) { try { apiKey = decryptSecret(keyRow.key_enc) } catch { /* undecryptable */ } }
  return { endpoint, apiKey, model }
}
function displayNameFor(person) {
  try {
    const row = db.prepare('SELECT payload FROM app_state WHERE id=1').get()
    const state = JSON.parse(row?.payload || 'null')
    const found = Array.isArray(state?.assistants) ? state.assistants.find(a => a?.id === person) : null
    if (found?.name) return String(found.name)
  } catch { /* fall through */ }
  return person
}
const agentRunner = new AgentRunner({
  db,
  bus: agentEvents,
  providerFor,
  displayNameFor,
  mcpList: row => withMcpClient(row, async client => {
    const result = await client.listTools()
    return result.tools.map(t => ({ name: t.name, description: t.description || '', inputSchema: t.inputSchema }))
  }),
  mcpCall: (row, name, args) => withMcpClient(row, client => client.callTool({ name, arguments: args })),
})
// Proactive answers land in the same inbox the UI already polls.
function deliverProactive(person, content) {
  return addInboxMessage(db, { person, content, kind: 'proactive' })
}

createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')
  if (!url.pathname.startsWith('/api/')) return send(res, 404, { error: 'not found' })
  if (req.method === 'OPTIONS') return send(res, 204, {})
  if (['POST', 'PUT', 'DELETE'].includes(req.method) && !sameOrigin(req)) return send(res, 403, { error: '跨站请求已拒绝' })

  if (url.pathname === '/api/session' && req.method === 'GET') {
    const token = getSession(req)
    return send(res, 200, { authenticated: !!token })
  }

  if (url.pathname === '/api/login' && req.method === 'POST') {
    const key = getClientKey(req)
    const entry = failures.get(key)
    if (entry && entry.until > Date.now() && entry.count >= 10) return send(res, 429, { error: '尝试次数过多，请 15 分钟后再试。' })
    try {
      const body = await readBody(req)
      const candidate = createHash('sha256').update(String(body.password || '')).digest()
      if (!timingSafeEqual(candidate, passwordHash)) {
        const next = entry && entry.until > Date.now() ? entry : { count: 0, until: Date.now() + 15 * 60 * 1000 }
        next.count++
        failures.set(key, next)
        return send(res, 401, { error: '密码不正确。' })
      }
      failures.delete(key)
      const token = randomBytes(32).toString('hex')
      sessions.set(token, { expires: Date.now() + SESSION_TTL })
      return send(res, 200, { authenticated: true }, { 'Set-Cookie': `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=${SESSION_TTL / 1000}` })
    } catch (error) { return send(res, error.status || 400, { error: error.message || '请求无效' }) }
  }

  if (url.pathname === '/api/logout' && req.method === 'POST') {
    const token = cookieValue(req)
    sessions.delete(token)
    return send(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=0` })
  }

  if (!getSession(req)) return send(res, 401, { error: '请先登录' })

  // API Key 加密存储：跨设备同步，登录后带回。
  if (url.pathname === '/api/keys' && req.method === 'GET') {
    const rows = db.prepare('SELECT person, key_enc FROM api_keys').all()
    const keys = {}
    for (const row of rows) { try { keys[row.person] = decryptSecret(row.key_enc) } catch { /* skip undecryptable */ } }
    return send(res, 200, { keys })
  }
  if (url.pathname === '/api/keys' && req.method === 'PUT') {
    try {
      const b = await readBody(req)
      const person = String(b.person || '')
      if (!isValidAssistantId(person)) return send(res, 400, { error: '人物身份无效' })
      const apiKey = String(b.apiKey || '').trim()
      const now = new Date().toISOString()
      if (!apiKey) { db.prepare('DELETE FROM api_keys WHERE person=?').run(person); return send(res, 200, { ok: true, saved: false }) }
      if (apiKey.length > 8192) return send(res, 400, { error: 'API Key 长度超出限制' })
      db.prepare('INSERT INTO api_keys (person,key_enc,updated_at) VALUES (?,?,?) ON CONFLICT(person) DO UPDATE SET key_enc=excluded.key_enc, updated_at=excluded.updated_at').run(person, encryptSecret(apiKey), now)
      return send(res, 200, { ok: true, saved: true })
    } catch (error) { return send(res, error.status || 400, { error: error.message || '保存 API Key 失败' }) }
  }

  // Shared ledger for both assistants. All routes require the existing authenticated session.
  // 代理请求 OpenAI 兼容接口的 /models 列表，绕过浏览器 CORS 限制。
  if (url.pathname === '/api/models' && req.method === 'POST') {
    try {
      const b = await readBody(req)
      const raw = String(b.endpoint || '').trim().replace(/\/+$/, '')
      if (!raw) return send(res, 400, { error: '请先填写 API 地址' })
      const apiKey = String(b.apiKey || '').trim()
      if (!apiKey) return send(res, 400, { error: '请先填写 API Key' })
      if (!/^https?:\/\//i.test(raw)) return send(res, 400, { error: 'API 地址需以 http:// 或 https:// 开头' })
      const target = /\/v1$/.test(raw) ? raw + '/models' : raw + '/v1/models'
      const upstream = await fetch(target, { headers: { Authorization: `Bearer ${apiKey}` }, redirect: 'error', signal: AbortSignal.timeout(15000) })
      const text = await upstream.text()
      if (!upstream.ok) return send(res, 502, { error: `上游返回 HTTP ${upstream.status}${text ? ' · ' + text.slice(0, 180) : ''}` })
      let data; try { data = JSON.parse(text) } catch { return send(res, 502, { error: '上游返回的不是合法 JSON' }) }
      const ids = (Array.isArray(data?.data) ? data.data : []).map(m => m?.id).filter(x => typeof x === 'string' && x)
      if (!ids.length) return send(res, 502, { error: '接口响应正常，但未返回可用模型列表' })
      return send(res, 200, { models: ids })
    } catch (error) {
      const msg = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? '请求上游超时' : (error?.cause?.code || error?.message || '请求失败')
      return send(res, 502, { error: '无法连接该接口：' + msg })
    }
  }

  // 代理转发 OpenAI 兼容 chat/completions（含 SSE 流式透传），绕过浏览器 CORS 限制。
  if (url.pathname === '/api/chat' && req.method === 'POST') {
    const controller = new AbortController()
    let finished = false
    res.on('close', () => { if (!finished) controller.abort() })
    try {
      // 聊天请求可携带图片 base64，上限放宽到 32 MB。
      const b = await readBody(req, 32 * 1024 * 1024)
      const raw = String(b.endpoint || '').trim().replace(/\/+$/, '')
      if (!raw) return send(res, 400, { error: '请先填写 API 地址' })
      if (!/^https?:\/\//i.test(raw)) return send(res, 400, { error: 'API 地址需以 http:// 或 https:// 开头' })
      const apiKey = String(b.apiKey || '').trim()
      if (!apiKey) return send(res, 400, { error: '请先填写 API Key' })
      const chatBody = b.body
      if (!chatBody || typeof chatBody !== 'object' || Array.isArray(chatBody)) return send(res, 400, { error: '缺少请求体' })
      const target = /\/chat\/completions$/.test(raw) ? raw : raw.endsWith('/v1') ? raw + '/chat/completions' : raw + '/v1/chat/completions'
      const upstream = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(chatBody),
        redirect: 'error',
        signal: controller.signal,
      })
      if (!upstream.ok) {
        finished = true
        const text = await upstream.text().catch(() => '')
        return send(res, upstream.status, { error: `上游返回 HTTP ${upstream.status}${text ? ' · ' + text.slice(0, 400) : ''}` })
      }
      // SSE / 流式响应原样透传给前端，不缓冲。
      res.writeHead(upstream.status, {
        'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, no-store',
        'X-Accel-Buffering': 'no',
      })
      if (upstream.body) {
        for await (const chunk of upstream.body) { if (!res.write(chunk)) await new Promise(r => res.once('drain', r)) }
      }
      finished = true
      res.end()
      return
    } catch (error) {
      finished = true
      if (res.headersSent) { try { res.end() } catch { /* 连接已断开 */ } return }
      const msg = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? '请求被中断或超时' : (error?.cause?.code || error?.message || '请求失败')
      return send(res, 502, { error: '无法连接该接口：' + msg })
    }
  }

  if (url.pathname === '/api/diary' && req.method === 'GET') {
    const rows=db.prepare('SELECT id,owner,title,visibility,body,created_at FROM diary_entries ORDER BY created_at DESC LIMIT 500').all()
    return send(res,200,{entries:rows.map(r=>({id:r.id,owner:r.owner,title:r.title,visibility:r.visibility,date:r.created_at.slice(0,10),...(r.visibility==='public'?{content:r.body}:{})}))})
  }
  if (url.pathname === '/api/diary' && req.method === 'POST') {
    try {
      const b=await readBody(req)
      if(!(b.owner==='阿懒'||isValidAssistantId(b.owner)))return send(res,400,{error:'作者无效'})
      if(!['public','locked'].includes(b.visibility))return send(res,400,{error:'公开状态无效'})
      const title=String(b.title||'').trim(),content=String(b.content||'')
      if(!title||title.length>100||!content.trim()||content.length>20000)return send(res,400,{error:'标题或正文无效'})
      let body=content,salt=null,iv=null,tag=null
      if(b.visibility==='locked'){
        const secret=String(b.secret||'')
        if(secret.length<6||secret.length>100)return send(res,400,{error:'暗号需为6至100位'})
        salt=randomBytes(16).toString('hex');iv=randomBytes(12).toString('hex')
        const key=scryptSync(secret,Buffer.from(salt,'hex'),32)
        const cipher=createCipheriv('aes-256-gcm',key,Buffer.from(iv,'hex'))
        body=Buffer.concat([cipher.update(content,'utf8'),cipher.final()]).toString('base64')
        tag=cipher.getAuthTag().toString('hex')
      }
      const id=randomUUID()
      db.prepare('INSERT INTO diary_entries(id,owner,title,visibility,body,salt,iv,tag,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,b.owner,title,b.visibility,body,salt,iv,tag,new Date().toISOString())
      return send(res,201,{ok:true,id})
    }catch(e){return send(res,400,{error:e.message||'保存失败'})}
  }
  const diaryRead=url.pathname.match(/^\/api\/diary\/([0-9a-f-]{36})\/read$/)
  if(diaryRead&&req.method==='POST'){
    try{
      const b=await readBody(req)
      const row=db.prepare('SELECT * FROM diary_entries WHERE id=?').get(diaryRead[1])
      if(!row)return send(res,404,{error:'日记不存在'})
      if(row.visibility==='public')return send(res,200,{content:row.body})
      const secret=String(b.secret||'')
      if(!secret||secret.length>100)return send(res,400,{error:'请提供暗号'})
      const key=scryptSync(secret,Buffer.from(row.salt,'hex'),32)
      const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(row.iv,'hex'))
      decipher.setAuthTag(Buffer.from(row.tag,'hex'))
      const content=Buffer.concat([decipher.update(Buffer.from(row.body,'base64')),decipher.final()]).toString('utf8')
      return send(res,200,{content})
    }catch{return send(res,403,{error:'暗号错误或日记无法解锁'})}
  }
  const diaryDelete=url.pathname.match(/^\/api\/diary\/([0-9a-f-]{36})$/)
  if(diaryDelete&&req.method==='DELETE'){
    const result=db.prepare('DELETE FROM diary_entries WHERE id=?').run(diaryDelete[1])
    return send(res,result.changes?200:404,result.changes?{ok:true}:{error:'日记不存在'})
  }

  // Tool call execution log. Rows are written by the frontend only at real tool
  // call sites; the server re-redacts every stored argument and result anyway.
  if (url.pathname === '/api/tool-logs' && req.method === 'GET') {
    try {
      return send(res, 200, { logs: listToolLogs(db, Object.fromEntries(url.searchParams)) })
    } catch (error) { return send(res, error.status || 400, { error: error.message || '读取工具调用记录失败' }) }
  }
  if (url.pathname === '/api/tool-logs' && req.method === 'POST') {
    try {
      const body = await readBody(req)
      return send(res, 201, createToolLog(db, body))
    } catch (error) { return send(res, error.status || 400, { error: error.message || '记录工具调用失败' }) }
  }
  const toolLogMatch = url.pathname.match(/^\/api\/tool-logs\/([0-9a-f-]{36})$/)
  if (toolLogMatch && req.method === 'PUT') {
    try {
      const body = await readBody(req)
      return send(res, 200, finishToolLog(db, toolLogMatch[1], body))
    } catch (error) { return send(res, error.status || 400, { error: error.message || '更新工具调用记录失败' }) }
  }

  if (url.pathname === '/api/ledger' && req.method === 'GET') {
    const rows = db.prepare('SELECT id,kind,amount_cents,currency,category,note,entry_date,created_by,created_at FROM ledger_entries ORDER BY entry_date DESC,created_at DESC LIMIT 2000').all()
    return send(res, 200, { entries: rows.map(r=>({ id:r.id,kind:r.kind,amount:r.amount_cents/100,currency:r.currency,category:r.category,note:r.note,date:r.entry_date,createdBy:r.created_by,createdAt:r.created_at })) })
  }
  if (url.pathname === '/api/ledger' && req.method === 'POST') {
    try {
      const b = await readBody(req)
      if (!['income','expense'].includes(b.kind)) return send(res,400,{error:'收支类型无效'})
      const cents = Math.round(Number(b.amount)*100)
      if (!Number.isSafeInteger(cents)||cents<=0||cents>1e12) return send(res,400,{error:'金额无效'})
      const currency=String(b.currency||'CNY').toUpperCase()
      if (!['CNY','JPY','USD','EUR','HKD'].includes(currency)) return send(res,400,{error:'暂不支持此币种'})
      const date=String(b.date||'')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date) return send(res,400,{error:'日期无效'})
      const category=String(b.category||'其他').trim().slice(0,40)
      const note=String(b.note||'').trim().slice(0,300)
      const actor=String(b.actor||'user')
      if (!(actor==='user'||isValidAssistantId(actor))) return send(res,400,{error:'操作者无效'})
      const requestId=String(b.requestId||'')
      if (!/^[a-zA-Z0-9-]{12,100}$/.test(requestId)) return send(res,400,{error:'请求编号无效'})
      const prior=db.prepare('SELECT entry_id FROM ledger_operations WHERE request_id=?').get(requestId)
      if(prior)return send(res,200,{ok:true,id:prior.entry_id,duplicate:true})
      const id=randomUUID(),now=new Date().toISOString()
      db.exec('BEGIN IMMEDIATE')
      try{
        db.prepare('INSERT INTO ledger_entries (id,kind,amount_cents,currency,category,note,entry_date,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id,b.kind,cents,currency,category,note,date,actor,now)
        db.prepare('INSERT INTO ledger_operations (request_id,entry_id,actor,created_at) VALUES (?,?,?,?)').run(requestId,id,actor,now)
        db.exec('COMMIT')
      }catch(e){db.exec('ROLLBACK');throw e}
      return send(res,201,{ok:true,id})
    } catch(e){return send(res,e.status||400,{error:e.message||'记账失败'})}
  }
  const ledgerDelete=url.pathname.match(/^\/api\/ledger\/([0-9a-f-]{36})$/)
  if (ledgerDelete && req.method === 'DELETE') {
    const result=db.prepare('DELETE FROM ledger_entries WHERE id=?').run(ledgerDelete[1])
    return send(res,result.changes?200:404,result.changes?{ok:true}:{error:'账目不存在'})
  }

  if (url.pathname === '/api/mcp' && req.method === 'GET') {
    const person = url.searchParams.get('person')
    if (!isValidAssistantId(person)) return send(res, 400, { error: '人物身份无效' })
    const rows = db.prepare('SELECT * FROM mcp_connections WHERE person=? ORDER BY updated_at DESC').all(person)
    return send(res, 200, { connections: rows.map(publicMcp) })
  }
  if (url.pathname === '/api/mcp' && req.method === 'POST') {
    try {
      const body = await readBody(req)
      const person = body.person
      if (!isValidAssistantId(person)) return send(res, 400, { error: '必须指定有效的人物绑定' })
      const name = String(body.name || '').trim().slice(0, 120)
      const remote = validateRemoteUrl(String(body.url || '').trim())
      const transportType = body.transport || 'httpStream'
      if (transportType !== 'httpStream') return send(res, 400, { error: '当前版本仅支持 Streamable HTTP 连接' })
      const token = String(body.token || '').trim()
      if (token.length > 8192) return send(res, 400, { error: 'Token 长度超出限制' })
      const customHeaders = body.headers && typeof body.headers === 'object' && !Array.isArray(body.headers) ? body.headers : {}
      if (Object.keys(customHeaders).length > 30) return send(res, 400, { error: '自定义请求头最多 30 项' })
      for (const [key, value] of Object.entries(customHeaders)) { if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) || typeof value !== 'string' || value.length > 2048 || /[\r\n]/.test(value)) return send(res, 400, { error: '自定义请求头格式无效' }) }
      if (!name) return send(res, 400, { error: '请填写服务名称' })
      const id = randomUUID(), updatedAt = new Date().toISOString()
      db.prepare('INSERT INTO mcp_connections (id,person,name,url,transport,enabled,token_enc,updated_at) VALUES (?,?,?,?,?,1,?,?)').run(id, person, name, remote.toString(), transportType, encryptSecret(JSON.stringify({ token, headers: customHeaders })), updatedAt)
      const row = db.prepare('SELECT * FROM mcp_connections WHERE id=?').get(id)
      return send(res, 201, { connection: publicMcp(row) })
    } catch (error) { return send(res, error.status || 400, { error: error.message || '保存 MCP 配置失败' }) }
  }
  const mcpMatch = url.pathname.match(/^\/api\/mcp\/([a-f0-9-]+)(?:\/(tools|call))?$/)
  if (mcpMatch && req.method === 'DELETE' && !mcpMatch[2]) {
    const body = await readBody(req).catch(() => ({}))
    if (!isValidAssistantId(body.person)) return send(res, 400, { error: '必须指定人物身份' })
    const result = db.prepare('DELETE FROM mcp_connections WHERE id=? AND person=?').run(mcpMatch[1], body.person)
    return result.changes ? send(res, 200, { ok: true }) : send(res, 404, { error: '未找到该人物绑定的 MCP 服务' })
  }
  if (mcpMatch && req.method === 'POST' && ['tools','call'].includes(mcpMatch[2])) {
    try {
      const body = await readBody(req)
      const person = body.person
      if (!isValidAssistantId(person)) return send(res, 400, { error: '必须指定人物身份' })
      const row = db.prepare('SELECT * FROM mcp_connections WHERE id=? AND person=?').get(mcpMatch[1], person)
      if (!row) return send(res, 404, { error: '此 MCP 没有绑定到当前人物' })
      if (mcpMatch[2] === 'tools') {
        const result = await withMcpClient(row, client => client.listTools())
        return send(res, 200, { tools: result.tools.map(t => ({ name: t.name, description: t.description || '', inputSchema: t.inputSchema })) })
      }
      const toolName = String(body.name || '')
      if (!toolName || toolName.length > 200) return send(res, 400, { error: '工具名称无效' })
      const args = body.arguments && typeof body.arguments === 'object' && !Array.isArray(body.arguments) ? body.arguments : {}
      const result = await withMcpClient(row, async client => {
        const available = await client.listTools()
        if (!available.tools.some(t => t.name === toolName)) throw Object.assign(new Error('该工具不属于当前人物绑定的 MCP 服务'), { status: 403 })
        return await client.callTool({ name: toolName, arguments: args })
      })
      return send(res, 200, { result })
    } catch (error) { return send(res, error.status || 502, { error: error.message || 'MCP 调用失败' }) }
  }

  // Assistant workflow adapter entrypoint. The future model tool caller must pass its
  // server-verified identity here; a person in the payload alone is NOT authentication.
  // Until model identity verification exists, this endpoint is explicitly a logged-in
  // user-controlled test harness, not an autonomous agent permission boundary.
  if (url.pathname === '/api/workflows/manage' && req.method === 'POST') {
    try {
      const body = await readBody(req)
      const person = body.person
      if (!isValidAssistantId(person)) return send(res, 400, { error: '人物身份无效' })
      const action = body.action
      const now = new Date().toISOString()
      if (action === 'create') {
        const title = String(body.title || '').trim().slice(0, 160)
        const prompt = String(body.prompt || '').trim().slice(0, 12000)
        const runAt = String(body.runAt || '')
        const recurrence = ['once','daily','weekly'].includes(body.recurrence) ? body.recurrence : 'once'
        if (!title || !prompt || !Number.isFinite(Date.parse(runAt))) return send(res, 400, { error: '工作流内容或时间无效' })
        const id = randomUUID()
        db.prepare("INSERT INTO scheduled_tasks (id,person,title,prompt,run_at,recurrence,status,created_at,updated_at,created_by,temporary) VALUES (?,?,?,?,?,?,'scheduled',?,?,?,?)").run(id,person,title,prompt,new Date(runAt).toISOString(),recurrence,now,now,person,body.temporary === true ? 1 : 0)
        return send(res, 201, { task: db.prepare('SELECT * FROM scheduled_tasks WHERE id=?').get(id) })
      }
      if (!['pause','resume','delete'].includes(action)) return send(res, 400, { error: '不支持的操作' })
      const row = db.prepare('SELECT * FROM scheduled_tasks WHERE id=? AND person=?').get(String(body.id || ''),person)
      if (!row) return send(res, 404, { error: '工作流不存在或不属于当前助手' })
      if (row.created_by !== person) return send(res, 403, { error: '不能自动管理用户创建的工作流' })
      if (action === 'delete') {
        if (!row.temporary) return send(res, 403, { error: '长期工作流禁止自动永久删除，请手动处理' })
        db.prepare('DELETE FROM scheduled_tasks WHERE id=? AND person=?').run(row.id,person)
        return send(res, 200, { ok: true })
      }
      const status = action === 'pause' ? 'paused' : 'scheduled'
      db.prepare('UPDATE scheduled_tasks SET status=?,updated_at=? WHERE id=? AND person=?').run(status,now,row.id,person)
      return send(res, 200, { task: db.prepare('SELECT * FROM scheduled_tasks WHERE id=?').get(row.id) })
    } catch (error) { return send(res, error.status || 400, { error: error.message || '工作流管理失败' }) }
  }

  if (url.pathname === '/api/tasks' && req.method === 'GET') {
    const person = url.searchParams.get('person')
    if (!isValidAssistantId(person)) return send(res, 400, { error: '人物身份无效' })
    const rows = db.prepare('SELECT * FROM scheduled_tasks WHERE person=? ORDER BY run_at ASC').all(person)
    return send(res, 200, { tasks: rows })
  }
  if (url.pathname === '/api/tasks' && req.method === 'POST') {
    try {
      const body = await readBody(req)
      const person = body.person
      if (!isValidAssistantId(person)) return send(res, 400, { error: '必须指定有效的人物身份' })
      const title = String(body.title || '').trim().slice(0, 160)
      const prompt = String(body.prompt || '').trim().slice(0, 12000)
      const runAt = String(body.runAt || '')
      const recurrence = ['once','daily','weekly'].includes(body.recurrence) ? body.recurrence : 'once'
      if (!title || !prompt || !runAt || !Number.isFinite(Date.parse(runAt))) return send(res, 400, { error: '请填写任务名称、执行内容和有效执行时间' })
      const now = new Date().toISOString(), id = randomUUID()
      db.prepare("INSERT INTO scheduled_tasks (id,person,title,prompt,run_at,recurrence,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'scheduled',?,?)").run(id,person,title,prompt,new Date(runAt).toISOString(),recurrence,now,now)
      return send(res, 201, { task: db.prepare('SELECT * FROM scheduled_tasks WHERE id=?').get(id) })
    } catch (error) { return send(res, error.status || 400, { error: error.message || '创建任务失败' }) }
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/([a-f0-9-]+)$/)
  if (taskMatch && req.method === 'PUT') {
    try {
      const body = await readBody(req), person = body.person
      if (!isValidAssistantId(person)) return send(res, 400, { error: '必须指定有效的人物身份' })
      const row = db.prepare('SELECT * FROM scheduled_tasks WHERE id=? AND person=?').get(taskMatch[1],person)
      if (!row) return send(res, 404, { error: '找不到该人物的任务' })
      const status = ['scheduled','paused','completed'].includes(body.status) ? body.status : row.status
      let runAt = row.run_at
      if (body.runAt !== undefined) { if (!Number.isFinite(Date.parse(String(body.runAt)))) return send(res, 400, { error: '执行时间无效' }); runAt = new Date(body.runAt).toISOString() }
      const now = new Date().toISOString()
      db.prepare('UPDATE scheduled_tasks SET status=?,run_at=?,updated_at=? WHERE id=? AND person=?').run(status,runAt,now,taskMatch[1],person)
      return send(res, 200, { task: db.prepare('SELECT * FROM scheduled_tasks WHERE id=?').get(taskMatch[1]) })
    } catch (error) { return send(res, error.status || 400, { error: error.message || '更新任务失败' }) }
  }
  if (taskMatch && req.method === 'DELETE') {
    const body = await readBody(req).catch(() => ({}))
    if (!isValidAssistantId(body.person)) return send(res, 400, { error: '必须指定有效的人物身份' })
    const result = db.prepare('DELETE FROM scheduled_tasks WHERE id=? AND person=?').run(taskMatch[1],body.person)
    return result.changes ? send(res, 200, { ok: true }) : send(res, 404, { error: '找不到该人物的任务' })
  }

  if (url.pathname === '/api/inbox' && req.method === 'GET') {
    const since=url.searchParams.get('since')||''
    if(since.length>50)return send(res,400,{error:'参数无效'})
    return send(res,200,{messages:listInbox(db,since)})
  }
  if (url.pathname === '/api/inbox/test' && req.method === 'POST') {
    try {
      const body=await readBody(req)
      if(!isValidAssistantId(body.person))return send(res,400,{error:'无效人物'})
      // Explicitly labelled diagnostic content, never impersonate a model.
      return send(res,200,{message:addInboxMessage(db,{person:body.person,content:'【通知测试】这是一条系统测试消息，不是 AI 自主生成的内容。',kind:'test'})})
    } catch(error){return send(res,400,{error:error.message})}
  }
  if (url.pathname === '/api/inbox/read' && req.method === 'POST') {
    try {
      const body=await readBody(req)
      if(typeof body.id!=='string'||body.id.length>100)return send(res,400,{error:'参数无效'})
      return send(res,200,{ok:markInboxRead(db,body.id)})
    } catch(error){return send(res,400,{error:error.message})}
  }

  if (url.pathname === '/api/proactive' && req.method === 'GET') {
    const person=url.searchParams.get('person')
    if(!isValidAssistantId(person))return send(res,400,{error:'无效人物'})
    return send(res,200,{settings:proactiveSettings(db,person),events:proactiveEvents(db,person),heat:readHeat(db,person)})
  }
  if (url.pathname === '/api/proactive' && req.method === 'POST') {
    try {
      const body=await readBody(req)
      if(!isValidAssistantId(body.person))return send(res,400,{error:'无效人物'})
      if(body.action==='configure')return send(res,200,{settings:configureProactive(db,body.person,body)})
      if(body.action==='wake'){
        const woken=wakeProactive(db,body.person,{manual:true})
        // Manual wake also runs for real through the shared Runner, so the
        // dashboard's "test wake" exercises the same path as heat-triggered wakes.
        if(woken.queued)dispatchProactiveRun({db,runner:agentRunner,bus:agentEvents,deliver:deliverProactive,person:body.person,eventId:woken.id,reason:woken.reason})
        return send(res,200,woken)
      }
      if(body.action==='cool')return send(res,200,{heat:coolHeat(db,body.person)})
      if(body.action==='dismiss')return send(res,200,{ok:dismissProactive(db,body.person,String(body.id||''))})
      return send(res,400,{error:'未知操作'})
    } catch(error){return send(res,400,{error:error.message||'操作失败'})}
  }

  if (url.pathname === '/api/memory/search' && req.method === 'GET') {
    const person = url.searchParams.get('person')
    const query = (url.searchParams.get('q') || '').trim()
    const exclude = url.searchParams.get('exclude') || ''
    if (!isValidAssistantId(person)) return send(res, 400, { error: '无效人物' })
    if (query.length < 2 || query.length > 160) return send(res, 400, { error: '搜索内容长度应为 2 至 160 字' })
    return send(res, 200, { results: searchMemoryIndex(db, { person, query, exclude, limit: 5 }) })
  }

  if (url.pathname === '/api/state' && req.method === 'GET') {
    const row = db.prepare('SELECT payload, updated_at FROM app_state WHERE id=1').get()
    if (!row) return send(res, 200, { state: null, updatedAt: null })
    let state
    try { state = JSON.parse(row.payload) } catch { return send(res, 200, { state: null, updatedAt: row.updated_at }) }
    // v2 -> v3 (assistantId keys) is persisted once; repeat GETs are no-ops.
    const migrated = migrateSnapshot(state)
    if (migrated) {
      const updatedAt = new Date().toISOString()
      db.prepare('UPDATE app_state SET payload=?, updated_at=? WHERE id=1').run(JSON.stringify(migrated), updatedAt)
      return send(res, 200, { state: migrated, updatedAt })
    }
    return send(res, 200, { state, updatedAt: row.updated_at })
  }
  if (url.pathname === '/api/state' && req.method === 'PUT') {
    try {
      const body = await readBody(req)
      if (!body.state || typeof body.state !== 'object' || Array.isArray(body.state)) return send(res, 400, { error: 'state 格式无效' })
      const payload = JSON.stringify(migrateSnapshot(body.state) || body.state)
      if (Buffer.byteLength(payload) > MAX_BODY) return send(res, 413, { error: '云端数据超过 2 MB 限制' })
      const updatedAt = new Date().toISOString()
      db.exec('BEGIN IMMEDIATE')
      try {
        db.prepare('INSERT INTO app_state (id,payload,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at').run(payload, updatedAt)
        rebuildMemoryIndex(db, body.state)
        db.exec('COMMIT')
      } catch (error) { db.exec('ROLLBACK'); throw error }
      return send(res, 200, { ok: true, updatedAt })
    } catch (error) { return send(res, error.status || 400, { error: error.message || '保存失败' }) }
  }
  // ---- Agent Runner: start / query / cancel runs, live SSE, tool policy ----
  if (url.pathname === '/api/agent/runs' && req.method === 'POST') {
    try {
      const body = await readBody(req)
      const person = body.person
      if (!isValidAssistantId(person)) return send(res, 400, { error: '人物身份无效' })
      const prompt = String(body.prompt || '').trim()
      if (!prompt || prompt.length > 20000) return send(res, 400, { error: '任务内容需为 1 至 20000 字' })
      const source = ['manual', 'scheduled', 'proactive', 'chat'].includes(body.source) ? body.source : 'manual'
      const conversationId = typeof body.conversationId === 'string' && body.conversationId.length <= 120 ? body.conversationId : null
      const run = createAgentRun(db, { assistantId: person, source, conversationId, prompt })
      agentEvents.publish({ type: 'run_created', runId: run.id, assistantId: person, source })
      const handle = agentRunner.start(run)
      handle.promise.catch(() => { /* terminal state already persisted */ })
      return send(res, 201, { run })
    } catch (error) { return send(res, error.status || 400, { error: error.message || '创建运行失败' }) }
  }
  if (url.pathname === '/api/agent/runs' && req.method === 'GET') {
    try {
      const query = Object.fromEntries(url.searchParams)
      if (query.person && !isValidAssistantId(query.person)) return send(res, 400, { error: '人物身份无效' })
      return send(res, 200, { runs: listAgentRuns(db, query) })
    } catch (error) { return send(res, error.status || 400, { error: error.message || '读取运行记录失败' }) }
  }
  const agentRunMatch = url.pathname.match(/^\/api\/agent\/runs\/([0-9a-f-]{36})$/)
  if (agentRunMatch && req.method === 'GET') {
    const run = getAgentRun(db, agentRunMatch[1])
    if (!run) return send(res, 404, { error: '运行记录不存在' })
    const logs = listToolLogs(db, { runId: run.id, limit: 100 })
    return send(res, 200, { run, logs })
  }
  const agentCancelMatch = url.pathname.match(/^\/api\/agent\/runs\/([0-9a-f-]{36})\/cancel$/)
  if (agentCancelMatch && req.method === 'POST') {
    const cancelled = agentRunner.cancel(agentCancelMatch[1])
    const run = getAgentRun(db, agentCancelMatch[1])
    if (!run) return send(res, 404, { error: '运行记录不存在' })
    return send(res, 200, { ok: true, accepted: cancelled || run.status !== 'running', status: run.status })
  }

  // Live run events for the dashboard. Reconnect-safe: clients recover state
  // from /api/agent/runs after a gap, this stream only carries the deltas.
  if (url.pathname === '/api/agent/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    const write = (event) => { try { res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`) } catch { /* client gone */ } }
    for (const event of agentEvents.recent()) write(event)
    const unsubscribe = agentEvents.subscribe(write)
    const heartbeat = setInterval(() => { try { res.write(': ping\n\n') } catch { /* client gone */ } }, 25000)
    req.on('close', () => { clearInterval(heartbeat); unsubscribe() })
    return
  }

  // Tool permission policy (auto / ask / deny), evaluated server-side only.
  if (url.pathname === '/api/agent/policies' && req.method === 'GET') {
    const person = url.searchParams.get('person')
    if (!isValidAssistantId(person)) return send(res, 400, { error: '人物身份无效' })
    return send(res, 200, { policies: listPolicies(db, person) })
  }
  if (url.pathname === '/api/agent/policies' && req.method === 'PUT') {
    try {
      const body = await readBody(req)
      if (!isValidAssistantId(body.person)) return send(res, 400, { error: '人物身份无效' })
      const tool = String(body.tool || '').trim()
      if (!tool || tool.length > 200) return send(res, 400, { error: '工具名无效' })
      const saved = setPolicy(db, body.person, tool, body.mode)
      return send(res, 200, { policy: saved })
    } catch (error) { return send(res, error.status || 400, { error: error.message || '保存策略失败' }) }
  }

  // Approval queue for policy=ask tool calls. The run stays `running` while
  // parked; approving resumes it, rejecting feeds a refusal back to the model.
  if (url.pathname === '/api/agent/approvals' && req.method === 'GET') {
    const person = url.searchParams.get('person')
    if (!isValidAssistantId(person)) return send(res, 400, { error: '人物身份无效' })
    const rows = listToolLogs(db, { person, status: 'awaiting_confirmation', limit: 50 })
    return send(res, 200, {
      approvals: rows.map(row => ({
        logId: row.id, runId: row.runId, tool: row.toolName, serverName: row.serverName,
        arguments: row.arguments, startedAt: row.startedAt, conversationId: row.conversationId,
        pending: isPending(row.id),
      })),
    })
  }
  const approvalMatch = url.pathname.match(/^\/api\/agent\/approvals\/([0-9a-f-]{36})$/)
  if (approvalMatch && req.method === 'POST') {
    try {
      const body = await readBody(req)
      const decision = body.decision === 'approve' ? 'approve' : body.decision === 'reject' ? 'reject' : null
      if (!decision) return send(res, 400, { error: 'decision 需为 approve 或 reject' })
      const outcome = decideApproval(approvalMatch[1], decision)
      if (outcome !== 'stale') {
        agentEvents.publish({ type: 'approval_decided', logId: approvalMatch[1], decision: outcome })
        return send(res, 200, { ok: true, decision: outcome })
      }
      // No live waiter (server restarted or timeout already fired): the parked
      // row can only be cleaned up, never executed — approvals don't replay.
      const row = db.prepare('SELECT id, status FROM tool_call_logs WHERE id=?').get(approvalMatch[1])
      if (!row) return send(res, 404, { error: '审批记录不存在' })
      if (row.status !== 'awaiting_confirmation') return send(res, 200, { ok: true, decision: row.status, already: true })
      finishToolLog(db, row.id, {
        status: 'cancelled', errorCode: 'APPROVAL_STALE',
        errorMessage: decision === 'approve' ? '审批已失效（服务重启后不允许补执行）' : '审批已失效，已按拒绝处理',
      })
      agentEvents.publish({ type: 'approval_decided', logId: row.id, decision: 'stale' })
      return send(res, 200, { ok: true, decision: 'stale' })
    } catch (error) { return send(res, error.status || 400, { error: error.message || '审批操作失败' }) }
  }

  return send(res, 404, { error: 'not found' })
}).listen(4180, '127.0.0.1', () => console.log('AI Home private data API listening on 127.0.0.1:4180'))

// Durable scheduler: due tasks are claimed atomically and executed through the
// shared AgentRunner (bounded loop, tool logging, SSE) instead of the old
// "mark ready and wait for someone to notice" scaffold.
const taskScheduler = createTaskScheduler({ db, runner: agentRunner, bus: agentEvents })
setInterval(() => {
  try {
    const dispatched = taskScheduler.tick()
    if (dispatched) console.log(`[scheduler] dispatched ${dispatched} task run(s)`)
  } catch (error) { console.error('[scheduler]', error.message) }
}, 15000).unref()

// Jiwen (积温): warmth accrues per minute (faster in lively mode, slower in
// quiet), vents on real conversation, and at 100 attempts a wake — which still
// respects quiet hours / pending / cooldown — then runs the assistant through
// the shared AgentRunner. Silence is recorded as silence, not a fake message.
setInterval(() => {
  try {
    const result = tickHeat({ db, runner: agentRunner, bus: agentEvents, deliver: deliverProactive })
    if (result.fired) console.log(`[proactive] heat fired for ${result.person} (${result.eventId})`)
  } catch (error) { console.error('[proactive]', error.message) }
}, 60_000).unref()
