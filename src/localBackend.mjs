// 本地模式后端垫片（LocalBackend）：未配置服务器地址时，浏览器/WebView 内
// 直接应答全部 /api/* 请求，让 App 开箱即用——不依赖任何云端或本机后端进程。
//
// 分层原则（与 src/server.mjs 保持同一套响应形状，前端零感知）：
//   - 状态快照 /api/state        → localStorage（与云端 PUT/GET 同构）
//   - 会话 /api/session /login   → 恒为已登录（本地模式没有密码门）
//   - 聊天 /api/chat             → 直连用户填写的 OpenAI 兼容接口（CORS 已实测放行），
//                                  时间上下文沿用共享纯函数 injectTimeContext
//   - 模型列表 /api/models       → 直连上游 /models
//   - 记忆检索 /api/memory/search → 本机会话关键词检索（镜像服务端 FTS 语义）
//   - 附件 /api/attachments      → IndexedDB 存字节 + objectURL 注册表（<img> 直接可用）
//   - 记账/日记/工具日志/收件箱/记忆治理/MCP 配置 → localStorage CRUD
//   - 服务端专属能力（MCP 执行、定时任务、后台 Agent、自主唤醒）→ 明确的降级错误，
//     绝不伪装成功；提示用户配置云服务器后使用。
//
// 纯 ESM、无框架依赖；apiBase.mjs 在 local 模式下把 apiFetch 路由到这里。
import { injectTimeContext } from './timeContext.mjs'
import { readKeyCandidates, isRetryableKeyStatus } from './vendors.mjs'

// ── localStorage 存储层 ─────────────────────────────────────────────────────
const K = {
  state: 'ai-home.local.state',
  stateUpdatedAt: 'ai-home.local.stateUpdatedAt',
  keys: 'ai-home.local.keys',
  ledger: 'ai-home.local.ledger',
  diary: 'ai-home.local.diary',
  toolLogs: 'ai-home.local.toolLogs',
  memoryRecords: 'ai-home.local.memoryRecords',
  mcp: 'ai-home.local.mcp',
  inbox: 'ai-home.local.inbox',
  proactive: 'ai-home.local.proactive',
  policies: 'ai-home.local.policies',
}

// 快照体积上限（localStorage 总配额约 5 MB，给其他键留余量）。
const MAX_STATE_CHARS = 4_500_000
const MAX_TOOL_LOGS = 500

function store() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null }
}

function readJSON(key, fallback) {
  const s = store()
  if (!s) return fallback
  try {
    const raw = s.getItem(key)
    return raw == null ? fallback : JSON.parse(raw)
  } catch { return fallback }
}

function writeJSON(key, value) {
  const s = store()
  if (!s) throw new Error('本地存储不可用（隐私模式？）')
  s.setItem(key, JSON.stringify(value))
}

// ── Response 构造 ───────────────────────────────────────────────────────────
function json(status, body, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(headers || {}) },
  })
}

async function readBody(init) {
  const raw = init && init.body
  if (raw == null) return {}
  if (typeof raw === 'string') return JSON.parse(raw || '{}')
  if (typeof ArrayBuffer !== 'undefined' && raw instanceof ArrayBuffer) return JSON.parse(new TextDecoder().decode(raw) || '{}')
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(raw)) return JSON.parse(new TextDecoder().decode(raw) || '{}')
  return JSON.parse(String(raw) || '{}')
}

const uuid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10))
const nowISO = () => new Date().toISOString()

// ── 附件：IndexedDB 字节 + objectURL 注册表 ─────────────────────────────────
const ATT_DB = 'ai-home-local-attachments'
const ATT_STORE = 'attachments'
let attDbPromise = null
// id → blob: URL。启动时由 warmupLocalAttachments() 预热，新上传即时注册。
const attUrls = new Map()

function openAttDb() {
  if (!attDbPromise) {
    attDbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB 不可用')); return }
      const req = indexedDB.open(ATT_DB, 1)
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(ATT_STORE)) req.result.createObjectStore(ATT_STORE) }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error || new Error('附件库打开失败'))
    })
    // 失败后允许下次重试（不缓存 rejected promise）。
    attDbPromise.catch(() => { attDbPromise = null })
  }
  return attDbPromise
}

function attTx(mode, run) {
  return openAttDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(ATT_STORE, mode)
    const req = run(tx.objectStore(ATT_STORE))
    let result
    if (req) { req.onsuccess = () => { result = req.result } ; req.onerror = () => reject(req.error) }
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('附件事务中止'))
  }))
}

function b64ToBytes(b64) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToB64(bytes) {
  let bin = ''
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  for (let i = 0; i < view.length; i++) bin += String.fromCharCode(view[i])
  return btoa(bin)
}

function makeAttUrl(rec) {
  try {
    const blob = new Blob([b64ToBytes(rec.data)], { type: rec.mime || 'application/octet-stream' })
    return URL.createObjectURL(blob)
  } catch { return '' }
}

// 启动预热：把 IDB 里的附件字节全部换成本会话有效的 objectURL，
// 这样消息里的 /api/attachments/<id> 引用在首帧渲染即可显示。
export async function warmupLocalAttachments() {
  try {
    const all = await attTx('readonly', store_ => store_.getAll())
    for (const rec of Array.isArray(all) ? all : []) {
      if (rec && rec.id && !attUrls.has(rec.id)) {
        const url = makeAttUrl(rec)
        if (url) attUrls.set(rec.id, url)
      }
    }
  } catch { /* 无 IDB / 数据损坏：图片按既有逻辑显示失效占位 */ }
}

// assetUrl() 在本地模式下用它把稳定引用换成 blob: URL；未命中原样返回。
export function localAttachmentUrl(preview) {
  const m = /^\/api\/attachments\/([^/?#]+)$/.exec(String(preview == null ? '' : preview))
  if (!m) return preview
  return attUrls.get(decodeURIComponent(m[1])) || preview
}

// ── 日记加密（WebCrypto AES-256-GCM + PBKDF2）──────────────────────────────
async function deriveAesKey(secret, salt) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle
  if (!subtle) throw new Error('当前环境不支持加密存储（需要 https 或 localhost）')
  const base = await subtle.importKey('raw', new TextEncoder().encode(String(secret)), 'PBKDF2', false, ['deriveKey'])
  return subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

async function encryptText(secret, text) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveAesKey(secret, salt)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text))
  return { salt: bytesToB64(salt), iv: bytesToB64(iv), body: bytesToB64(new Uint8Array(ct)) }
}

async function decryptText(secret, rec) {
  const key = await deriveAesKey(secret, b64ToBytes(rec.salt))
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(rec.iv) }, key, b64ToBytes(rec.body))
  return new TextDecoder().decode(pt)
}

// ── 本地记忆检索（镜像 server 端 searchMemoryIndex 的分词与打分语义）──────
const LEGACY_CONV_KEY = 'ai-home.conversations'

function loadConversationsForSearch() {
  // 优先读 App 每次变更都镜像的本机键（最新），再回退本地快照。
  try {
    const legacy = JSON.parse((store() && store().getItem(LEGACY_CONV_KEY)) || 'null')
    if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) return legacy
  } catch { /* 损坏则回退快照 */ }
  const snapshot = readJSON(K.state, null)
  return (snapshot && typeof snapshot.conversations === 'object' && snapshot.conversations) || {}
}

function toAssistantId(key) {
  return ({ '晏未晞': 'assistant-yanweixi', '言朔': 'assistant-yanshuo' }[key]) || key
}

function searchLocalMemory({ person, query, exclude, limit = 5 }) {
  const words = String(query || '').trim().slice(0, 160).split(/[\s，。！？、,.!?；;：:（）()]+/).filter(x => x.length >= 2).slice(0, 8)
  if (!words.length) return []
  const terms = [...new Set(words.flatMap(w => {
    if (!/[㐀-鿿]/u.test(w) || w.length <= 4) return [w.slice(0, 50)]
    const segments = []
    for (let i = 0; i + 3 <= w.length && segments.length < 12; i += 2) segments.push(w.slice(i, i + 3))
    return segments
  }))].slice(0, 20)
  if (!terms.length) return []

  const convs = loadConversationsForSearch()
  const rows = []
  for (const rawKey of Object.keys(convs)) {
    if (toAssistantId(rawKey) !== person) continue
    const list = Array.isArray(convs[rawKey]) ? convs[rawKey] : []
    for (const conversation of list.slice(0, 300)) {
      if (!conversation || conversation.id === exclude || !Array.isArray(conversation.messages)) continue
      const title = String(conversation.title || '未命名会话').slice(0, 120)
      conversation.messages.slice(0, 1200).forEach((message, index) => {
        if (!message || (message.role !== 'user' && message.role !== 'assistant')) return
        const content = typeof message.content === 'string' ? message.content.trim().slice(0, 5000) : ''
        if (content.length < 2) return
        rows.push({ conversationId: conversation.id, title, messageIndex: index, role: message.role, content })
      })
    }
  }
  // 后出现的会话/消息（更近）排前面；打分使用稳定排序保持该次序。
  rows.reverse()
  const scored = rows
    .map(r => ({ ...r, score: terms.reduce((n, t) => n + (r.content.includes(t) ? 1 : 0), 0) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(30, Math.max(1, limit * 6)))
  return scored
    .map(r => ({ ...r, content: r.content.slice(0, 700) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

// ── /api/chat：直连 OpenAI 兼容接口（CORS 预检已实测放行）─────────────────
async function handleChat(init) {
  let b
  try { b = await readBody(init) } catch { return json(400, { error: '请求无效' }) }
  const raw = String(b.endpoint || '').trim().replace(/\/+$/, '')
  if (!raw) return json(400, { error: '请先填写 API 地址' })
  if (!/^https?:\/\//i.test(raw)) return json(400, { error: 'API 地址需以 http:// 或 https:// 开头' })
  // 多 KEY：候选队列（备用优先、主号兜底）由前端排好；遇到额度 / 鉴权 / 限流自动换下一把。
  const apiKeys = readKeyCandidates(b)
  if (!apiKeys.length) return json(400, { error: '请先填写 API Key' })
  const chatBody = b.body
  if (!chatBody || typeof chatBody !== 'object' || Array.isArray(chatBody)) return json(400, { error: '缺少请求体' })
  // 动态时间上下文：与服务端 /api/chat 完全同源（共享纯函数），每轮实时生成。
  chatBody.messages = injectTimeContext(chatBody.messages, new Date(), b.timeZone)
  const target = /^https?:\/\//i.test(String(b.chatUrl || ''))
    ? String(b.chatUrl).trim()
    : /\/chat\/completions$/.test(raw) ? raw : raw.endsWith('/v1') ? raw + '/chat/completions' : raw + '/v1/chat/completions'
  for (let i = 0; i < apiKeys.length; i++) {
    let upstream
    try {
      upstream = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKeys[i] },
        body: JSON.stringify(chatBody),
        redirect: 'error',
        signal: init && init.signal,
      })
    } catch (error) {
      if (init && init.signal && init.signal.aborted) throw error
      if (i + 1 < apiKeys.length) continue
      const msg = error && (error.name === 'TimeoutError' || error.name === 'AbortError') ? '请求被中断或超时' : (error && error.cause && error.cause.code) || (error && error.message) || '请求失败'
      return json(502, { error: '无法连接该接口：' + msg })
    }
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '')
      if (isRetryableKeyStatus(upstream.status) && i + 1 < apiKeys.length) continue
      return json(upstream.status, { error: `上游返回 HTTP ${upstream.status}${text ? ' · ' + text.slice(0, 400) : ''}` })
    }
    // SSE / 流式响应原样透传给前端 reader（不缓冲）。
    return upstream
  }
  return json(502, { error: '所有 API Key 均未能完成请求' })
}

// ── /api/models：直连上游模型列表 ──────────────────────────────────────────
async function handleModels(init) {
  let b
  try { b = await readBody(init) } catch { return json(400, { error: '请求无效' }) }
  const raw = String(b.endpoint || '').trim().replace(/\/+$/, '')
  if (!raw) return json(400, { error: '请先填写 API 地址' })
  const apiKey = String(b.apiKey || '').trim()
  if (!apiKey) return json(400, { error: '请先填写 API Key' })
  if (!/^https?:\/\//i.test(raw)) return json(400, { error: 'API 地址需以 http:// 或 https:// 开头' })
  const customModelsUrl = String(b.modelsUrl || '').trim()
  const target = /^https?:\/\//i.test(customModelsUrl)
    ? customModelsUrl
    : /\/v1$/.test(raw) ? raw + '/models' : raw + '/v1/models'
  try {
    const upstream = await fetch(target, { headers: { Authorization: 'Bearer ' + apiKey }, redirect: 'error', signal: AbortSignal.timeout(15000) })
    const text = await upstream.text()
    if (!upstream.ok) return json(502, { error: `上游返回 HTTP ${upstream.status}${text ? ' · ' + text.slice(0, 180) : ''}` })
    let data
    try { data = JSON.parse(text) } catch { return json(502, { error: '上游返回的不是合法 JSON' }) }
    const ids = (Array.isArray(data && data.data) ? data.data : []).map(m => m && m.id).filter(x => typeof x === 'string' && x)
    if (!ids.length) return json(502, { error: '接口响应正常，但未返回可用模型列表' })
    return json(200, { models: ids })
  } catch (error) {
    const msg = error && (error.name === 'TimeoutError' || error.name === 'AbortError') ? '请求上游超时' : (error && error.cause && error.cause.code) || (error && error.message) || '请求失败'
    return json(502, { error: '无法连接该接口：' + msg })
  }
}

// ── 服务端专属能力的统一降级错误 ───────────────────────────────────────────
const DEGRADED = {
  mcp: '本地模式暂不支持连接/执行 MCP 工具（需要后端执行器）。在设置里配置云服务器地址后可用。',
  schedule: '本地模式暂不支持定时任务与工作流（需要后台服务常驻执行）。配置云服务器后可用。',
  agent: '本地模式暂不支持后台 Agent 运行（需要后端执行器）。配置云服务器后可用。',
}

// ── agent 事件流：SSE 心跳保活（本地无事件，仅避免 EventSource 反复重连）──
function sseKeepAlive() {
  let timer = null
  const stream = new ReadableStream({
    start(controller) {
      try { controller.enqueue(new TextEncoder().encode(': ping\n\n')) } catch { /* 已关闭 */ }
      timer = setInterval(() => {
        try { controller.enqueue(new TextEncoder().encode(': ping\n\n')) } catch { /* 已关闭 */ }
      }, 25000)
    },
    cancel() { if (timer) clearInterval(timer) },
  })
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-store', 'X-Accel-Buffering': 'no' },
  })
}

// ── 路由分发 ────────────────────────────────────────────────────────────────
// 入口：apiBase.mjs 在 local 模式把所有 /api/* 请求转发到这里。
// 任何未捕获异常都收敛成 500 JSON，绝不让请求裸奔失败。
export async function localHandle(path, init) {
  const method = String((init && init.method) || 'GET').toUpperCase()
  const url = new URL(String(path), 'http://local.invalid')
  const p = url.pathname
  const q = url.searchParams
  try {
    // ── 会话：本地模式恒为已登录（没有密码门、没有云端凭证） ──
    if (p === '/api/session' && method === 'GET') return json(200, { authenticated: true })
    if (p === '/api/login' && method === 'POST') return json(200, { authenticated: true, token: 'local' })
    if (p === '/api/logout' && method === 'POST') return json(200, { ok: true })

    // ── API Key ──
    if (p === '/api/keys' && method === 'GET') return json(200, { keys: readJSON(K.keys, {}) })
    if (p === '/api/keys' && method === 'PUT') {
      const b = await readBody(init)
      const person = String(b.person || '')
      if (!person) return json(400, { error: '人物身份无效' })
      const apiKey = String(b.apiKey || '').trim()
      const keys = readJSON(K.keys, {})
      if (apiKey.length > 8192) return json(400, { error: 'API Key 长度超出限制' })
      if (!apiKey) { delete keys[person] } else { keys[person] = apiKey }
      try { writeJSON(K.keys, keys) } catch { return json(500, { error: '本地存储写入失败' }) }
      return json(200, { ok: true, saved: !!apiKey })
    }

    // ── 模型列表（直连上游） ──
    if (p === '/api/models' && method === 'POST') return handleModels(init)

    // ── 聊天（直连上游 + 时间注入 + 流式透传） ──
    if (p === '/api/chat' && method === 'POST') return handleChat(init)

    // ── 状态快照 ──
    if (p === '/api/state' && method === 'GET') {
      return json(200, { state: readJSON(K.state, null), updatedAt: (store() && store().getItem(K.stateUpdatedAt)) || null })
    }
    if (p === '/api/state' && method === 'PUT') {
      const b = await readBody(init)
      if (!b.state || typeof b.state !== 'object' || Array.isArray(b.state)) return json(400, { error: 'state 格式无效' })
      let payload
      try { payload = JSON.stringify(b.state) } catch { return json(400, { error: 'state 无法序列化' }) }
      if (payload.length > MAX_STATE_CHARS) return json(413, { error: '本地数据超过 4.5 MB 存储限制' })
      const updatedAt = nowISO()
      try {
        writeJSON(K.state, b.state)
        const s = store()
        if (s) s.setItem(K.stateUpdatedAt, updatedAt)
      } catch (error) {
        const quota = error && (error.name === 'QuotaExceededError' || /quota/i.test(String(error.message || error)))
        return json(quota ? 413 : 500, { error: quota ? '本地存储空间不足，保存失败（4.5 MB 限制）。请清理旧聊天或附件。' : '本地保存失败：' + (error && error.message) })
      }
      return json(200, { ok: true, updatedAt })
    }

    // ── 记忆检索（本机会话关键词检索） ──
    if (p === '/api/memory/search' && method === 'GET') {
      const person = q.get('person') || ''
      const query = (q.get('q') || '').trim()
      const exclude = q.get('exclude') || ''
      if (!/^assistant-[a-zA-Z0-9-]{4,}$/.test(person)) return json(400, { error: '无效人物' })
      if (query.length < 2 || query.length > 160) return json(400, { error: '搜索内容长度应为 2 至 160 字' })
      return json(200, { results: searchLocalMemory({ person, query, exclude, limit: 5 }) })
    }

    // ── 记忆治理（lifecycle 记录） ──
    if (p === '/api/memory/records' && method === 'GET') {
      const person = q.get('person') || ''
      if (!person) return json(400, { error: '无效人物' })
      const lifecycle = q.get('lifecycle') || ''
      const all = readJSON(K.memoryRecords, [])
      const records = all.filter(r => r && r.person === person && (!lifecycle || r.lifecycle === lifecycle)).slice(0, 100)
      return json(200, { records })
    }
    if (p === '/api/memory/records' && method === 'POST') {
      const b = await readBody(init)
      const person = String(b.person || '')
      if (!person) return json(400, { error: '无效人物' })
      const title = String(b.title || '').trim().slice(0, 160)
      const content = String(b.content || '').trim().slice(0, 4000)
      if (!title || !content) return json(400, { error: '标题与内容不能为空' })
      const all = readJSON(K.memoryRecords, [])
      const duplicate = all.find(r => r && r.person === person && r.title === title && r.content === content)
      if (duplicate) return json(200, { record: duplicate, duplicate: true })
      const ts = nowISO()
      const record = {
        id: uuid(), person,
        scope: ['world', 'private', 'ops'].includes(b.scope) ? b.scope : 'private',
        lifecycle: 'active', // 用户亲手创建即生效，跳过候选队列（与服务端一致）
        title, content,
        keywords: String(b.keywords || '').slice(0, 500),
        category: String(b.category || '其他').slice(0, 40),
        sourceConversationId: String(b.sourceConversationId || '').slice(0, 120),
        sourceMessageIds: Array.isArray(b.sourceMessageIds) ? b.sourceMessageIds.slice(0, 50) : [],
        createdBy: 'user', recallCount: 0, createdAt: ts, updatedAt: ts,
      }
      all.unshift(record)
      try { writeJSON(K.memoryRecords, all.slice(0, 2000)) } catch { return json(500, { error: '本地存储写入失败' }) }
      return json(201, { record, duplicate: false })
    }
    const memRec = p.match(/^\/api\/memory\/records\/([0-9a-f-]{36})$/)
    if (memRec && method === 'GET') {
      const record = readJSON(K.memoryRecords, []).find(r => r && r.id === memRec[1])
      return record ? json(200, { record }) : json(404, { error: '记忆不存在' })
    }
    const memTrans = p.match(/^\/api\/memory\/records\/([0-9a-f-]{36})\/transition$/)
    if (memTrans && method === 'POST') {
      const b = await readBody(init)
      const lifecycle = String(b.lifecycle || '')
      if (!['candidate', 'active', 'archived', 'rejected'].includes(lifecycle)) return json(400, { error: '记忆状态无效' })
      const all = readJSON(K.memoryRecords, [])
      const record = all.find(r => r && r.id === memTrans[1])
      if (!record) return json(404, { error: '记忆不存在' })
      record.lifecycle = lifecycle
      record.updatedAt = nowISO()
      try { writeJSON(K.memoryRecords, all) } catch { return json(500, { error: '本地存储写入失败' }) }
      return json(200, { record })
    }

    // ── 记账单 ──
    if (p === '/api/ledger' && method === 'GET') {
      const entries = readJSON(K.ledger, []).map(e => ({
        id: e.id, kind: e.kind, amount: e.amount, currency: e.currency, category: e.category,
        note: e.note, date: e.date, createdBy: e.createdBy, createdAt: e.createdAt,
      }))
      return json(200, { entries })
    }
    if (p === '/api/ledger' && method === 'POST') {
      const b = await readBody(init)
      if (!['income', 'expense'].includes(b.kind)) return json(400, { error: '收支类型无效' })
      const amount = Number(b.amount)
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1e10) return json(400, { error: '金额无效' })
      const currency = String(b.currency || 'CNY').toUpperCase()
      if (!['CNY', 'JPY', 'USD', 'EUR', 'HKD'].includes(currency)) return json(400, { error: '暂不支持此币种' })
      const date = String(b.date || '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) return json(400, { error: '日期无效' })
      const requestId = String(b.requestId || '')
      if (!/^[a-zA-Z0-9_-]{12,100}$/.test(requestId)) return json(400, { error: '请求编号无效' })
      const all = readJSON(K.ledger, [])
      const prior = all.find(e => e && e.requestId === requestId)
      if (prior) return json(200, { ok: true, id: prior.id, duplicate: true })
      const entry = {
        id: uuid(), kind: b.kind, amount, currency,
        category: String(b.category || '其他').trim().slice(0, 40),
        note: String(b.note || '').trim().slice(0, 300),
        date, createdBy: String(b.actor || 'user'), createdAt: nowISO(), requestId,
      }
      all.unshift(entry)
      try { writeJSON(K.ledger, all.slice(0, 5000)) } catch { return json(500, { error: '本地存储写入失败' }) }
      return json(201, { ok: true, id: entry.id })
    }
    const ledgerDel = p.match(/^\/api\/ledger\/([0-9a-f-]{36})$/)
    if (ledgerDel && method === 'DELETE') {
      const all = readJSON(K.ledger, [])
      const next = all.filter(e => !(e && e.id === ledgerDel[1]))
      if (next.length === all.length) return json(404, { error: '账目不存在' })
      try { writeJSON(K.ledger, next) } catch { return json(500, { error: '本地存储写入失败' }) }
      return json(200, { ok: true })
    }

    // ── 日记本（上锁日记 WebCrypto 加密存储） ──
    if (p === '/api/diary' && method === 'GET') {
      const entries = readJSON(K.diary, [])
        .slice()
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, 500)
        .map(r => ({
          id: r.id, owner: r.owner, title: r.title, visibility: r.visibility,
          date: String(r.created_at || '').slice(0, 10),
          ...(r.visibility === 'public' ? { content: r.body } : {}),
        }))
      return json(200, { entries })
    }
    if (p === '/api/diary' && method === 'POST') {
      const b = await readBody(init)
      const owner = String(b.owner || '').trim()
      if (!owner) return json(400, { error: '作者无效' })
      if (!['public', 'locked'].includes(b.visibility)) return json(400, { error: '公开状态无效' })
      const title = String(b.title || '').trim()
      const content = String(b.content || '')
      if (!title || title.length > 100 || !content.trim() || content.length > 20000) return json(400, { error: '标题或正文无效' })
      const record = { id: uuid(), owner, title, visibility: b.visibility, created_at: nowISO() }
      if (b.visibility === 'locked') {
        const secret = String(b.secret || '')
        if (secret.length < 6 || secret.length > 100) return json(400, { error: '暗号需为6至100位' })
        try {
          const enc = await encryptText(secret, content)
          Object.assign(record, { body: enc.body, salt: enc.salt, iv: enc.iv })
        } catch (error) { return json(500, { error: error.message || '加密存储不可用' }) }
      } else {
        record.body = content
      }
      const all = readJSON(K.diary, [])
      all.unshift(record)
      try { writeJSON(K.diary, all.slice(0, 1000)) } catch { return json(500, { error: '本地存储写入失败' }) }
      return json(201, { ok: true, id: record.id })
    }
    const diaryRead = p.match(/^\/api\/diary\/([0-9a-f-]{36})\/read$/)
    if (diaryRead && method === 'POST') {
      const b = await readBody(init)
      const record = readJSON(K.diary, []).find(r => r && r.id === diaryRead[1])
      if (!record) return json(404, { error: '日记不存在' })
      if (record.visibility === 'public') return json(200, { content: record.body })
      const secret = String(b.secret || '')
      if (!secret || secret.length > 100) return json(400, { error: '请提供暗号' })
      try {
        const content = await decryptText(secret, record)
        return json(200, { content })
      } catch { return json(403, { error: '暗号错误或日记无法解锁' }) }
    }
    const diaryDel = p.match(/^\/api\/diary\/([0-9a-f-]{36})$/)
    if (diaryDel && method === 'DELETE') {
      const all = readJSON(K.diary, [])
      const next = all.filter(r => !(r && r.id === diaryDel[1]))
      if (next.length === all.length) return json(404, { error: '日记不存在' })
      try { writeJSON(K.diary, next) } catch { return json(500, { error: '本地存储写入失败' }) }
      return json(200, { ok: true })
    }

    // ── 工具调用日志（聊天卡片 + 看板共用） ──
    if (p === '/api/tool-logs' && method === 'GET') {
      const all = readJSON(K.toolLogs, [])
      const person = q.get('person') || ''
      const source = q.get('source') || ''
      const status = q.get('status') || ''
      const conversationId = q.get('conversationId') || ''
      const limit = Math.min(500, Math.max(1, Number(q.get('limit')) || 200))
      const logs = all
        .filter(r => r && (!person || r.person === person) && (!source || r.source === source) && (!status || r.status === status) && (!conversationId || r.conversationId === conversationId))
        .slice(0, limit)
      return json(200, { logs })
    }
    if (p === '/api/tool-logs' && method === 'POST') {
      const b = await readBody(init)
      const eventId = String(b.eventId || '')
      const all = readJSON(K.toolLogs, [])
      // 幂等：同一 eventId 重复发布返回既有记录（与服务端一致，绝不产生第二行）。
      if (eventId) {
        const existing = all.find(r => r && r.eventId === eventId)
        if (existing) return json(201, { id: existing.id })
      }
      const record = {
        id: uuid(),
        person: String(b.person || ''), source: String(b.source || 'mcp'),
        toolName: String(b.toolName || ''), serverName: String(b.serverName || ''),
        arguments: b.arguments === undefined ? null : b.arguments,
        status: String(b.status || 'queued'),
        eventId, runId: String(b.runId || ''), conversationId: String(b.conversationId || ''),
        messageId: String(b.messageId || ''),
        startedAt: nowISO(),
      }
      all.unshift(record)
      try { writeJSON(K.toolLogs, all.slice(0, MAX_TOOL_LOGS)) } catch { return json(500, { error: '本地存储写入失败' }) }
      return json(201, { id: record.id })
    }
    const toolLogPut = p.match(/^\/api\/tool-logs\/([0-9a-f-]{36})$/)
    if (toolLogPut && method === 'PUT') {
      const b = await readBody(init)
      const all = readJSON(K.toolLogs, [])
      const record = all.find(r => r && r.id === toolLogPut[1])
      if (!record) return json(404, { error: '记录不存在' })
      if (b.status) record.status = String(b.status)
      if (b.resultSummary !== undefined) record.resultSummary = b.resultSummary
      if (b.errorMessage !== undefined) record.errorMessage = b.errorMessage
      if (b.errorCode !== undefined) record.errorCode = b.errorCode
      record.finishedAt = nowISO()
      try { record.durationMs = Math.max(0, Date.parse(record.finishedAt) - Date.parse(record.startedAt || record.finishedAt)) } catch { record.durationMs = 0 }
      try { writeJSON(K.toolLogs, all) } catch { return json(500, { error: '本地存储写入失败' }) }
      return json(200, { ok: true })
    }

    // ── MCP 配置（本地保存配置；连接与执行需要后端执行器 → 明确降级） ──
    if (p === '/api/mcp' && method === 'GET') {
      const person = q.get('person') || ''
      if (!person) return json(400, { error: '人物身份无效' })
      const connections = readJSON(K.mcp, [])
        .filter(c => c && c.person === person)
        .map(c => ({ id: c.id, person: c.person, name: c.name, url: c.url, transport: c.transport, enabled: c.enabled, updated_at: c.updated_at }))
      return json(200, { connections })
    }
    if (p === '/api/mcp' && method === 'POST') {
      const b = await readBody(init)
      const person = String(b.person || '')
      if (!person) return json(400, { error: '必须指定有效的人物绑定' })
      const name = String(b.name || '').trim().slice(0, 120)
      if (!name) return json(400, { error: '请填写服务名称' })
      const remote = String(b.url || '').trim()
      if (!/^https?:\/\//i.test(remote)) return json(400, { error: '主机地址需以 http:// 或 https:// 开头' })
      const transportType = b.transport || 'httpStream'
      if (transportType !== 'httpStream') return json(400, { error: '当前版本仅支持 Streamable HTTP 连接' })
      const token = String(b.token || '').trim()
      if (token.length > 8192) return json(400, { error: 'Token 长度超出限制' })
      const all = readJSON(K.mcp, [])
      const record = { id: uuid(), person, name, url: remote, transport: transportType, enabled: true, token, updated_at: nowISO() }
      all.unshift(record)
      try { writeJSON(K.mcp, all.slice(0, 200)) } catch { return json(500, { error: '本地存储写入失败' }) }
      return json(201, { connection: { id: record.id, person, name, url: remote, transport: transportType, enabled: true, updated_at: record.updated_at } })
    }
    const mcpMatch = p.match(/^\/api\/mcp\/([a-f0-9-]+)(?:\/(tools|call))?$/)
    if (mcpMatch && method === 'DELETE' && !mcpMatch[2]) {
      const b = await readBody(init).catch(() => ({}))
      const person = String(b.person || '')
      if (!person) return json(400, { error: '必须指定人物身份' })
      const all = readJSON(K.mcp, [])
      const next = all.filter(c => !(c && c.id === mcpMatch[1] && c.person === person))
      if (next.length === all.length) return json(404, { error: '未找到该人物绑定的 MCP 服务' })
      try { writeJSON(K.mcp, next) } catch { return json(500, { error: '本地存储写入失败' }) }
      return json(200, { ok: true })
    }
    if (mcpMatch && method === 'POST' && ['tools', 'call'].includes(mcpMatch[2])) {
      return json(502, { error: DEGRADED.mcp })
    }

    // ── 定时任务 / 工作流：本地无常驻调度器 → 明确降级 ──
    if (p === '/api/tasks' && method === 'GET') return json(200, { tasks: [] })
    if (p === '/api/tasks' && method === 'POST') return json(400, { error: DEGRADED.schedule })
    if (p === '/api/workflows/manage' && method === 'POST') return json(400, { error: DEGRADED.schedule })

    // ── 收件箱（本地轮询可用；主动推送来源只有手动测试） ──
    if (p === '/api/inbox' && method === 'GET') {
      const messages = readJSON(K.inbox, []).slice(0, 100)
      return json(200, { messages })
    }
    if (p === '/api/inbox/test' && method === 'POST') {
      const b = await readBody(init)
      const person = String(b.person || '')
      if (!person) return json(400, { error: '无效人物' })
      const message = { id: uuid(), person, content: '【通知测试】这是一条系统测试消息，不是 AI 自主生成的内容。', kind: 'test', created_at: nowISO(), read_at: null }
      const all = readJSON(K.inbox, [])
      all.unshift(message)
      try { writeJSON(K.inbox, all.slice(0, 200)) } catch { return json(500, { error: '本地存储写入失败' }) }
      return json(200, { message })
    }
    if (p === '/api/inbox/read' && method === 'POST') {
      const b = await readBody(init)
      if (typeof b.id !== 'string' || b.id.length > 100) return json(400, { error: '参数无效' })
      const all = readJSON(K.inbox, [])
      const message = all.find(m => m && m.id === b.id)
      if (message) {
        message.read_at = nowISO()
        try { writeJSON(K.inbox, all) } catch { /* 已读标记失败不影响功能 */ }
      }
      return json(200, { ok: true })
    }

    // ── 自主生活（proactive）：配置可本地保存；唤醒需要后台执行器 → 降级 ──
    if (p === '/api/proactive' && method === 'GET') {
      const person = q.get('person') || ''
      if (!person) return json(400, { error: '无效人物' })
      const all = readJSON(K.proactive, {})
      const settings = all[person] || { person, enabled: 0, mode: 'natural', quiet_start: 23, quiet_end: 8, interval_hours: 12, updated_at: nowISO() }
      return json(200, { settings, events: [], heat: null })
    }
    if (p === '/api/proactive' && method === 'POST') {
      const b = await readBody(init)
      const person = String(b.person || '')
      if (!person) return json(400, { error: '无效人物' })
      if (b.action === 'configure') {
        const mode = ['quiet', 'natural', 'lively'].includes(b.mode) ? b.mode : 'natural'
        const start = Number(b.quiet_start), end = Number(b.quiet_end), interval = Number(b.interval_hours)
        if (!Number.isInteger(start) || start < 0 || start > 23 || !Number.isInteger(end) || end < 0 || end > 23 || !Number.isInteger(interval) || interval < 2 || interval > 72) return json(400, { error: '时间设置无效' })
        const settings = { person, enabled: b.enabled === true || b.enabled === 1 ? 1 : 0, mode, quiet_start: start, quiet_end: end, interval_hours: interval, updated_at: nowISO() }
        const all = readJSON(K.proactive, {})
        all[person] = settings
        try { writeJSON(K.proactive, all) } catch { return json(500, { error: '本地存储写入失败' }) }
        return json(200, { settings })
      }
      if (b.action === 'wake') return json(200, { queued: false, reason: '本地模式需要后台执行器，配置云服务器后可用' })
      if (b.action === 'cool') return json(200, { heat: null })
      if (b.action === 'dismiss') return json(200, { ok: true })
      return json(400, { error: '未知操作' })
    }

    // ── Agent 运行：本地无执行器 → 空列表 + 明确降级 ──
    if (p === '/api/agent/runs' && method === 'GET') return json(200, { runs: [] })
    if (p === '/api/agent/runs' && method === 'POST') return json(400, { error: DEGRADED.agent })
    const agentRun = p.match(/^\/api\/agent\/runs\/([0-9a-f-]{36})$/)
    if (agentRun && method === 'GET') return json(404, { error: '运行记录不存在' })
    const agentCancel = p.match(/^\/api\/agent\/runs\/([0-9a-f-]{36})\/cancel$/)
    if (agentCancel && method === 'POST') return json(404, { error: '运行记录不存在' })
    if (p === '/api/agent/events' && method === 'GET') return sseKeepAlive()
    if (p === '/api/agent/policies' && method === 'GET') {
      const person = q.get('person') || ''
      if (!person) return json(400, { error: '人物身份无效' })
      const policies = readJSON(K.policies, []).filter(x => x && x.person === person).map(({ tool, mode }) => ({ tool, mode }))
      return json(200, { policies })
    }
    if (p === '/api/agent/policies' && method === 'PUT') {
      const b = await readBody(init)
      const person = String(b.person || '')
      const tool = String(b.tool || '').trim()
      if (!person) return json(400, { error: '人物身份无效' })
      if (!tool || tool.length > 200) return json(400, { error: '工具名无效' })
      if (!['auto', 'ask', 'deny'].includes(String(b.mode || ''))) return json(400, { error: '策略模式无效' })
      const all = readJSON(K.policies, [])
      const existing = all.find(x => x && x.person === person && x.tool === tool)
      if (existing) existing.mode = String(b.mode)
      else all.push({ person, tool, mode: String(b.mode) })
      try { writeJSON(K.policies, all.slice(0, 500)) } catch { return json(500, { error: '本地存储写入失败' }) }
      return json(200, { policy: { person, tool, mode: String(b.mode) } })
    }
    if (p === '/api/agent/approvals' && method === 'GET') return json(200, { approvals: [] })
    const approval = p.match(/^\/api\/agent\/approvals\/([0-9a-f-]{36})$/)
    if (approval && method === 'POST') return json(200, { ok: true, decision: 'stale', already: true })

    // ── 附件（字节进 IndexedDB；GET 兜底走二进制响应） ──
    if (p === '/api/attachments' && method === 'POST') {
      const b = await readBody(init)
      const name = String(b.name || '未命名').slice(0, 200)
      const mime = String(b.mime || 'application/octet-stream').slice(0, 120)
      const data = String(b.data || '')
      if (!data) return json(400, { error: '缺少附件数据' })
      if (data.length > 32 * 1024 * 1024) return json(413, { error: '附件超过 32 MB 限制' })
      const id = uuid()
      const record = { id, name, mime, data, createdAt: nowISO() }
      try {
        await attTx('readwrite', s => s.put(record))
      } catch (error) { return json(500, { error: '附件保存失败：' + (error && error.message) }) }
      const url = makeAttUrl(record)
      if (url) attUrls.set(id, url)
      return json(201, { id, url: '/api/attachments/' + id })
    }
    const attMatch = p.match(/^\/api\/attachments\/([0-9a-f-]{36})$/)
    if (attMatch && method === 'GET') {
      try {
        const rec = await attTx('readonly', s => s.get(attMatch[1]))
        if (!rec) return json(404, { error: '附件不存在或已被清理' })
        return new Response(b64ToBytes(rec.data), {
          status: 200,
          headers: {
            'Content-Type': rec.mime || 'application/octet-stream',
            'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(rec.name || 'file')}`,
            'Cache-Control': 'no-cache',
          },
        })
      } catch { return json(404, { error: '附件不存在或已被清理' }) }
    }
    if (attMatch && method === 'DELETE') {
      const id = attMatch[1]
      try {
        await attTx('readwrite', s => s.delete(id))
      } catch { /* 删除失败不阻断（下次启动自然不再引用） */ }
      const url = attUrls.get(id)
      if (url) { try { URL.revokeObjectURL(url) } catch { /* 忽略 */ }; attUrls.delete(id) }
      return json(200, { ok: true, deleted: 1 })
    }

    return json(404, { error: 'not found' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const badRequest = error instanceof SyntaxError
    return json(badRequest ? 400 : 500, { error: badRequest ? '请求无效' : '本地处理失败：' + message })
  }
}
