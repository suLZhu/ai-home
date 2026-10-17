import { createServer } from 'node:http'
import { randomBytes, createHash, timingSafeEqual, createCipheriv, createDecipheriv, randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

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
    id TEXT PRIMARY KEY, person TEXT NOT NULL CHECK(person IN ('晏未晞','言朔')),
    name TEXT NOT NULL, url TEXT NOT NULL, transport TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
    token_enc TEXT NOT NULL, updated_at TEXT NOT NULL
  );
`)
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
function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let data = ''
    req.on('data', chunk => {
      data += chunk
      if (Buffer.byteLength(data) > MAX_BODY) {
        reject(Object.assign(new Error('请求内容过大，单次最多 2 MB'), { status: 413 }))
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
function publicMcp(row) { return { id: row.id, person: row.person, name: row.name, url: row.url, transport: row.transport, enabled: !!row.enabled, updatedAt: row.updated_at, hasToken: !!row.token_enc } }
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
  const token = decryptSecret(row.token_enc)
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const transport = new StreamableHTTPClientTransport(new URL(row.url), { requestInit: { headers, redirect: 'error' } })
  const client = new Client({ name: 'ai-home', version: '0.1.0' }, { capabilities: {} })
  try { await client.connect(transport); return await operation(client) }
  finally { await client.close().catch(() => {}) }
}
function getClientKey(req) {
  return String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim()
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

  if (url.pathname === '/api/mcp' && req.method === 'GET') {
    const person = url.searchParams.get('person')
    if (!['晏未晞','言朔'].includes(person)) return send(res, 400, { error: '人物身份无效' })
    const rows = db.prepare('SELECT * FROM mcp_connections WHERE person=? ORDER BY updated_at DESC').all(person)
    return send(res, 200, { connections: rows.map(publicMcp) })
  }
  if (url.pathname === '/api/mcp' && req.method === 'POST') {
    try {
      const body = await readBody(req)
      const person = body.person
      if (!['晏未晞','言朔'].includes(person)) return send(res, 400, { error: '必须指定有效的人物绑定' })
      const name = String(body.name || '').trim().slice(0, 120)
      const remote = validateRemoteUrl(String(body.url || '').trim())
      const transportType = body.transport || 'httpStream'
      if (transportType !== 'httpStream') return send(res, 400, { error: '当前版本仅支持 Streamable HTTP 连接' })
      const token = String(body.token || '').trim()
      if (token.length > 8192) return send(res, 400, { error: 'Token 长度超出限制' })
      if (!name) return send(res, 400, { error: '请填写服务名称' })
      const id = randomUUID(), updatedAt = new Date().toISOString()
      db.prepare('INSERT INTO mcp_connections (id,person,name,url,transport,enabled,token_enc,updated_at) VALUES (?,?,?,?,?,1,?,?)').run(id, person, name, remote.toString(), transportType, encryptSecret(token), updatedAt)
      const row = db.prepare('SELECT * FROM mcp_connections WHERE id=?').get(id)
      return send(res, 201, { connection: publicMcp(row) })
    } catch (error) { return send(res, error.status || 400, { error: error.message || '保存 MCP 配置失败' }) }
  }
  const mcpMatch = url.pathname.match(/^\/api\/mcp\/([a-f0-9-]+)(?:\/(tools|call))?$/)
  if (mcpMatch && req.method === 'DELETE' && !mcpMatch[2]) {
    const body = await readBody(req).catch(() => ({}))
    if (!['晏未晞','言朔'].includes(body.person)) return send(res, 400, { error: '必须指定人物身份' })
    const result = db.prepare('DELETE FROM mcp_connections WHERE id=? AND person=?').run(mcpMatch[1], body.person)
    return result.changes ? send(res, 200, { ok: true }) : send(res, 404, { error: '未找到该人物绑定的 MCP 服务' })
  }
  if (mcpMatch && req.method === 'POST' && ['tools','call'].includes(mcpMatch[2])) {
    try {
      const body = await readBody(req)
      const person = body.person
      if (!['晏未晞','言朔'].includes(person)) return send(res, 400, { error: '必须指定人物身份' })
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

  if (url.pathname === '/api/state' && req.method === 'GET') {
    const row = db.prepare('SELECT payload, updated_at FROM app_state WHERE id=1').get()
    return send(res, 200, { state: row ? JSON.parse(row.payload) : null, updatedAt: row?.updated_at || null })
  }
  if (url.pathname === '/api/state' && req.method === 'PUT') {
    try {
      const body = await readBody(req)
      if (!body.state || typeof body.state !== 'object' || Array.isArray(body.state)) return send(res, 400, { error: 'state 格式无效' })
      const payload = JSON.stringify(body.state)
      if (Buffer.byteLength(payload) > MAX_BODY) return send(res, 413, { error: '云端数据超过 2 MB 限制' })
      const updatedAt = new Date().toISOString()
      db.prepare('INSERT INTO app_state (id,payload,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at').run(payload, updatedAt)
      return send(res, 200, { ok: true, updatedAt })
    } catch (error) { return send(res, error.status || 400, { error: error.message || '保存失败' }) }
  }
  return send(res, 404, { error: 'not found' })
}).listen(4180, '127.0.0.1', () => console.log('AI Home private data API listening on 127.0.0.1:4180'))
