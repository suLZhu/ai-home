// 模型请求诊断（黑匣子）纯函数层。
// 原则：只旁路观察，绝不修改真实请求、绝不阻断聊天、绝不记录凭证。
// 快照来自「最终交给 fetch 的 requestBody」，不是 UI 设置值。

export const DIAG_STORAGE_KEY = 'ai-home.requestDiag.v1'
export const MAX_DIAG_LOGS = 20

// 敏感字段名（大小写不敏感，含 api_key/authorization/cookie/token/secret/password）。
const SENSITIVE_KEY_RE = /api[-_]?key|authorization|cookie|access[-_]?token|refresh[-_]?token|bearer|secret|password|credential/i

// endpoint 隐藏 query 与末段可能的 token：只留 origin + path 前缀。
export function redactEndpoint(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  try {
    const u = new URL(s)
    return u.origin + u.pathname.replace(/\/+$/, '')
  } catch {
    return s.split('?')[0]
  }
}

// 估算并格式化被省略内容的大小（bytes→KB/MB）。
export function omittedSize(len) {
  const n = Number(len) || 0
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB'
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB'
  return n + ' B'
}

// data: URL（图片/文件 base64）替换为占位，避免诊断页被大块二进制撑爆。
export function redactDataUrl(url) {
  const s = String(url || '')
  if (!s.startsWith('data:')) return s
  const comma = s.indexOf(',')
  const meta = s.slice(5, comma > 0 ? comma : undefined)
  const payload = comma > 0 ? s.slice(comma + 1) : ''
  // base64 长度≈字节数的 4/3；非 base64（URI-encoded）按字符数计。
  const isBase64 = /;base64/i.test(meta)
  const bytes = isBase64 ? Math.floor(payload.length * 3 / 4) : payload.length
  return '[image data omitted: ' + omittedSize(bytes) + (meta ? '; ' + meta.split(';')[0] : '') + ']'
}

// 文本截断（诊断展示用，不影响真实请求）。
export function clipText(text, max = 2000) {
  const s = typeof text === 'string' ? text : text == null ? '' : JSON.stringify(text)
  return s.length > max ? s.slice(0, max) + '…[已截断，共 ' + s.length + ' 字符]' : s
}

// 单条消息脱敏：保留 role 顺序与结构；字符串 content 截断；
// 数组 content（多模态）逐项处理，图片 data URL 换占位；tool_calls 保留名称与截断参数。
export function sanitizeMessage(m) {
  if (!m || typeof m !== 'object') return { role: 'unknown', content: clipText(m) }
  const out = { role: String(m.role || 'unknown') }
  if (typeof m.content === 'string') out.content = clipText(m.content)
  else if (Array.isArray(m.content)) {
    out.content = m.content.map(part => {
      if (!part || typeof part !== 'object') return clipText(part)
      if (part.type === 'image_url') {
        const url = part.image_url && typeof part.image_url === 'object' ? part.image_url.url : part.image_url
        return { type: 'image_url', image_url: { url: redactDataUrl(url) } }
      }
      if (part.type === 'text') return { type: 'text', text: clipText(part.text) }
      return { type: String(part.type || 'part'), note: '[未识别的内容类型，已省略]' }
    })
  } else if (m.content != null) out.content = clipText(m.content)
  else out.content = ''
  if (Array.isArray(m.tool_calls)) {
    out.tool_calls = m.tool_calls.map(c => ({
      id: c && c.id,
      type: c && c.type,
      function: { name: c && c.function && c.function.name, arguments: clipText(c && c.function && c.function.arguments, 800) },
    }))
  }
  if (m.tool_call_id) out.tool_call_id = String(m.tool_call_id)
  return out
}

export function sanitizeMessages(messages) {
  return Array.isArray(messages) ? messages.map(sanitizeMessage) : []
}

// 各 role 计数 + 总数（基于真实顺序）。
export function summarizeMessages(messages) {
  const list = Array.isArray(messages) ? messages : []
  const roles = {}
  for (const m of list) {
    const r = m && m.role ? String(m.role) : 'unknown'
    roles[r] = (roles[r] || 0) + 1
  }
  return { total: list.length, roles }
}

// 最终实际发送的参数：只记录 requestBody 里真实存在的键，不存在即未设置（绝不伪造默认值）。
const PARAM_KEYS = ['model', 'stream', 'temperature', 'top_p', 'max_tokens', 'max_completion_tokens', 'frequency_penalty', 'presence_penalty', 'n', 'seed', 'stop', 'reasoning_effort', 'thinking', 'response_format', 'tool_choice']
export function extractParameters(requestBody) {
  const body = requestBody && typeof requestBody === 'object' ? requestBody : {}
  const params = {}
  for (const key of PARAM_KEYS) {
    if (body[key] !== undefined) params[key] = body[key]
  }
  return params
}

// tools 提取（名称列表 + 数量）；只取 function.name。
export function extractTools(requestBody) {
  const body = requestBody && typeof requestBody === 'object' ? requestBody : {}
  const tools = Array.isArray(body.tools) ? body.tools : []
  const names = []
  for (const t of tools) {
    const name = t && t.type === 'function' && t.function && t.function.name ? String(t.function.name) : t && t.name ? String(t.name) : ''
    if (name) names.push(name)
  }
  return { count: tools.length, names, toolChoice: body.tool_choice !== undefined ? body.tool_choice : undefined }
}

// 递归脱敏任意 payload：删除敏感字段、替换 data URL、截断超长字符串。
export function redactPayload(value, depth = 0) {
  if (depth > 8) return '[depth limit]'
  if (typeof value === 'string') return value.startsWith('data:') ? redactDataUrl(value) : clipText(value, 4000)
  if (Array.isArray(value)) return value.map(v => redactPayload(v, depth + 1))
  if (value && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value)) {
      if (SENSITIVE_KEY_RE.test(key)) { out[key] = '[REDACTED]'; continue }
      out[key] = redactPayload(value[key], depth + 1)
    }
    return out
  }
  return value
}

// 构建一份诊断快照。payload 只读，绝不修改。
export function buildDiagSnapshot(input) {
  const body = input && input.requestBody && typeof input.requestBody === 'object' ? input.requestBody : {}
  const messages = Array.isArray(body.messages) ? body.messages : []
  const summary = summarizeMessages(messages)
  const params = extractParameters(body)
  const tools = extractTools(body)
  return {
    id: 'diag-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
    at: new Date().toISOString(),
    assistantId: String(input.assistantId || ''),
    conversationId: String(input.conversationId || ''),
    trigger: String(input.trigger || 'normal'),
    round: Number.isFinite(input.round) ? Number(input.round) : 1,
    provider: String(input.provider || 'openai-compatible'),
    model: body.model !== undefined ? String(body.model) : '',
    endpoint: redactEndpoint(input.endpoint),
    stream: body.stream !== undefined ? body.stream : undefined,
    messagesTotal: summary.total,
    roles: summary.roles,
    // 保留真实顺序的消息（已脱敏）。
    messages: sanitizeMessages(messages),
    // 服务端在转发前还会把时间上下文作为独立 system 消息插到最前（injectTimeContext）。
    serverInjects: [{ role: 'system', note: '时间上下文（服务端实时生成，位于 messages 最前）' }],
    tools,
    params,
    requestChars: Number.isFinite(input.requestChars) ? Number(input.requestChars) : 0,
    memoryNote: input.memoryNote ? String(input.memoryNote) : '',
    historyTrimmed: Boolean(input.historyTrimmed),
    historyBefore: Number.isFinite(input.historyBefore) ? Number(input.historyBefore) : undefined,
    historyAfter: Number.isFinite(input.historyAfter) ? Number(input.historyAfter) : undefined,
    // 原始 payload 的脱敏副本（供 Raw JSON 折叠区）。
    raw: redactPayload({ model: body.model, messages: body.messages, stream: body.stream, stream_options: body.stream_options, tools: body.tools, tool_choice: body.tool_choice }),
  }
}

// 环形保留最近 MAX_DIAG_LOGS 条。
export function appendDiagLog(list, snapshot) {
  const next = Array.isArray(list) ? list.slice() : []
  next.unshift(snapshot)
  return next.slice(0, MAX_DIAG_LOGS)
}

export function loadDiagLogs(storage) {
  try {
    const raw = JSON.parse(storage.getItem(DIAG_STORAGE_KEY) || '[]')
    return Array.isArray(raw) ? raw.slice(0, MAX_DIAG_LOGS) : []
  } catch { return [] }
}

export function saveDiagLogs(storage, logs) {
  try { storage.setItem(DIAG_STORAGE_KEY, JSON.stringify(Array.isArray(logs) ? logs.slice(0, MAX_DIAG_LOGS) : [])) } catch { /* 存储满时诊断静默降级 */ }
}

// 复制诊断摘要（纯文本，默认不含完整私人聊天正文）。
export function formatDiagSummary(s) {
  if (!s || typeof s !== 'object') return ''
  const roles = s.roles && typeof s.roles === 'object' ? Object.entries(s.roles).map(([k, v]) => k + '×' + v).join(' ') : ''
  const paramText = s.params && typeof s.params === 'object'
    ? Object.entries(s.params).map(([k, v]) => k + '=' + (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ')
    : '（未设置任何采样/补全参数）'
  const lines = [
    '【AI 小家 · 模型请求诊断摘要】',
    '时间：' + (s.at || ''),
    '助手：' + (s.assistantId || '') + '  会话：' + (s.conversationId || ''),
    '触发：' + (s.trigger || '') + (s.round > 1 ? '（第 ' + s.round + ' 轮工具续轮）' : ''),
    'Provider：' + (s.provider || '') + '  模型：' + (s.model || '（未设置）'),
    'Endpoint：' + (s.endpoint || ''),
    'Stream：' + (s.stream === undefined ? '未设置' : String(s.stream)),
    '消息总数：' + (s.messagesTotal != null ? s.messagesTotal : '') + '  Role 结构：' + (roles || '无'),
    'System/Developer 长度：' + (s.messages || []).filter(m => m && (m.role === 'system' || m.role === 'developer')).reduce((n, m) => n + (m.content ? String(m.content).length : 0), 0) + ' 字符',
    '历史数量：' + (s.roles && (s.roles.user || 0)) + ' user / ' + (s.roles && (s.roles.assistant || 0)) + ' assistant（不含本轮输入）',
    '记忆/上下文：' + (s.memoryNote || '与 system prompt 合并注入，无法区分独立 memory 块'),
    '服务端注入：时间上下文 system 消息（位于最前）',
    'Tools：' + (s.tools && s.tools.count ? s.tools.count + ' 个（' + (s.tools.names || []).join(', ') + '）tool_choice=' + String(s.tools.toolChoice !== undefined ? s.tools.toolChoice : '未设置') : '无'),
    '参数：' + paramText,
    '历史裁剪：' + (s.historyTrimmed ? '是（裁剪前 ' + s.historyBefore + ' → 裁剪后 ' + s.historyAfter + '）' : '否/未知'),
    '请求体大小：约 ' + omittedSize(s.requestChars || 0),
  ]
  return lines.join('\n')
}
