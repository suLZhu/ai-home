// 本地模式下的「记忆自动整理」：没有服务器调度器，就在这台设备上用当前模型跑。
//
// 规则和服务端保持同一套语义：轮数 / 字数 / 天数任一满足就整理；整理结果只进
// 候选区（除非用户打开「整理后自动生效」）；同样的内容不会重复写入。
import { apiFetch } from './apiBase.mjs'

export const LOCAL_AUTO_KEY = 'ai-home.memoryAuto'

export const DEFAULT_LOCAL_AUTO = {
  enabled: true,
  minMessages: 12,
  minChars: 1200,
  minDays: 3,
  autoConfirm: true,
  rules: '',
  lastRunAt: null,
}

export function normalizeLocalAuto(raw) {
  const v = raw && typeof raw === 'object' ? raw : {}
  const num = (x, min, max, fallback) => {
    const n = Math.round(Number(x))
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback
  }
  return {
    enabled: v.enabled !== false,
    minMessages: num(v.minMessages, 2, 500, DEFAULT_LOCAL_AUTO.minMessages),
    minChars: num(v.minChars, 100, 200000, DEFAULT_LOCAL_AUTO.minChars),
    minDays: num(v.minDays, 1, 365, DEFAULT_LOCAL_AUTO.minDays),
    autoConfirm: v.autoConfirm !== false,
    rules: typeof v.rules === 'string' ? v.rules.slice(0, 500) : '',
    lastRunAt: typeof v.lastRunAt === 'string' && v.lastRunAt ? v.lastRunAt : null,
    lastRun: v.lastRun && typeof v.lastRun === 'object' ? v.lastRun : null,
  }
}

export function readLocalAuto() {
  try {
    return normalizeLocalAuto(JSON.parse(localStorage.getItem(LOCAL_AUTO_KEY) || 'null'))
  } catch { return normalizeLocalAuto(null) }
}

export function writeLocalAuto(patch) {
  const next = normalizeLocalAuto({ ...readLocalAuto(), ...patch })
  try { localStorage.setItem(LOCAL_AUTO_KEY, JSON.stringify(next)) } catch { /* 私密模式忽略 */ }
  return next
}

function messageText(m) {
  const parts = []
  if (typeof m?.content === 'string') parts.push(m.content)
  if (Array.isArray(m?.content)) for (const part of m.content) if (typeof part?.text === 'string') parts.push(part.text)
  return parts.join('').trim()
}

// 只统计「上次整理之后」的新对话：没有 lastRunAt 时从最近 60 条算起。
export function pendingStats(messages, lastRunAt) {
  const list = Array.isArray(messages) ? messages : []
  const since = lastRunAt ? new Date(lastRunAt).getTime() : 0
  let pendingMessages = 0
  let pendingChars = 0
  for (const m of list) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue
    const at = m.createdAt ? new Date(m.createdAt).getTime() : 0
    if (since && at && at <= since) continue
    const text = messageText(m)
    if (!text) continue
    pendingMessages += 1
    pendingChars += text.length
  }
  const daysSinceLast = lastRunAt ? (Date.now() - new Date(lastRunAt).getTime()) / 86400000 : 999
  return { pendingMessages, pendingChars, daysSinceLast }
}

export function localTrigger(cfg, stats) {
  if (!cfg.enabled) return 'disabled'
  if (!stats.pendingMessages) return 'no_new_messages'
  if (stats.pendingMessages >= cfg.minMessages) return 'messages'
  if (stats.pendingChars >= cfg.minChars) return 'chars'
  if (stats.daysSinceLast >= cfg.minDays) return 'days'
  return 'below_threshold'
}

const SYSTEM_PROMPT = '你负责把对话整理成长期记忆条目。只输出 JSON 数组，不要任何解释、不要代码块围栏。'

function buildPrompt(messages, rules) {
  const lines = []
  for (const m of messages) {
    const text = messageText(m)
    if (!text) continue
    lines.push((m.role === 'user' ? '用户：' : '助手：') + text.slice(0, 800))
  }
  const transcript = lines.join('\n').slice(-12000)
  return [
    '下面是你和用户最近的对话片段（按时间先后）。请从中提炼值得长期记住的内容。',
    '',
    transcript,
    '',
    '要求：',
    '1. 只提炼事实、约定、偏好、人物关系、项目进度，不要日常寒暄。',
    '2. 每条给出 title（不超过 24 字）、content（一到两句，具体可复查）、keywords（逗号分隔的召回关键词）、category（人物关系 / 经历事件 / 偏好习惯 / 项目进度 / 其他 之一）。',
    '3. 最多 5 条；没有值得记的内容就输出 []。',
    '4. 不要编造对话里没出现的信息。',
    rules ? '5. 用户指定的整理规则：' + rules : '',
    '',
    '只输出 JSON 数组，例如 [{"title":"…","content":"…","keywords":"…","category":"偏好习惯"}]',
  ].filter(Boolean).join('\n')
}

const CATEGORIES = ['人物关系', '经历事件', '偏好习惯', '项目进度', '其他']

function stripFence(text) {
  const t = String(text || '').trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return fence ? fence[1].trim() : t
}

export function parseProposals(text) {
  const raw = stripFence(text)
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  let list
  try { list = JSON.parse(raw.slice(start, end + 1)) } catch { return [] }
  if (!Array.isArray(list)) return []
  const out = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const title = String(item.title || item.标题 || '').trim().slice(0, 120)
    const content = String(item.content || item.内容 || '').trim().slice(0, 4000)
    if (!title || !content) continue
    const category = CATEGORIES.includes(item.category) ? item.category : '其他'
    out.push({ title, content, keywords: String(item.keywords || '').trim().slice(0, 500), category })
  }
  return out.slice(0, 5)
}

function extractContent(text) {
  try {
    const data = JSON.parse(text)
    const content = data?.choices?.[0]?.message?.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) return content.map(p => p?.text || '').join('')
  } catch { /* 上游可能直接返回纯文本 */ }
  return String(text || '')
}

// 跑一次整理：调当前模型 → 解析 JSON → 逐条写入本地记忆记录。
export async function runLocalOrganize({ person, messages, endpoint, apiKey, chatUrl, model, cfg }) {
  if (!endpoint || !apiKey || !model) throw new Error('先在「供应商」里配好并选中一个可用模型，再整理。')
  const list = (Array.isArray(messages) ? messages : []).filter(m => m && (m.role === 'user' || m.role === 'assistant') && messageText(m))
  const since = cfg.lastRunAt ? new Date(cfg.lastRunAt).getTime() : 0
  const recent = list.filter(m => !since || !m.createdAt || new Date(m.createdAt).getTime() > since).slice(-60)
  if (!recent.length) return { created: 0, scanned: 0, duplicate: 0 }

  const body = {
    model,
    stream: false,
    temperature: 0.2,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildPrompt(recent, cfg.rules) },
    ],
  }
  const response = await apiFetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, apiKey, chatUrl, body }),
  })
  const text = await response.text()
  if (!response.ok) {
    let message = text
    try { message = JSON.parse(text)?.error || text } catch { /* 原样展示 */ }
    throw new Error(String(message).replace(/^上游返回\s*/, '').slice(0, 120))
  }
  const proposals = parseProposals(extractContent(text))
  let created = 0
  let duplicate = 0
  for (const proposal of proposals) {
    const saved = await apiFetch('/api/memory/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        person,
        ...proposal,
        lifecycle: cfg.autoConfirm ? 'active' : 'candidate',
        createdBy: 'model',
      }),
    })
    if (!saved.ok) continue
    const data = await saved.json().catch(() => ({}))
    if (data?.duplicate) duplicate += 1
    else created += 1
  }
  const lastRunAt = new Date().toISOString()
  writeLocalAuto({ lastRunAt, lastRun: { status: 'succeeded', finishedAt: lastRunAt, error: '', scanned: recent.length, created, proposals: proposals.length } })
  return { created, scanned: recent.length, duplicate }
}
