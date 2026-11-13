// 「发送 → 切后台 / 锁屏 → 回复继续生成 → 写回原会话」链路的状态兜底。
// WebView 进程若被系统回收后重启，快照里会残留一条 content 为空的助手占位气泡，
// 且 React 的 sending 状态已丢失。用一条持久化标记在启动时 / 回前台时把它标成明确状态。
export const ACTIVE_GENERATION_KEY = 'ai-home.generation.active.v1'
export const INTERRUPTED_NOTE = '（上一条回复未完成：App 曾在生成期间切到后台或被关闭。可点「重新生成」再试。）'

function safeParse(raw) {
  try {
    const v = JSON.parse(String(raw || ''))
    return v && typeof v === 'object' ? v : null
  } catch { return null }
}

export function readActiveGeneration(storage) {
  if (!storage) return null
  try {
    const v = safeParse(storage.getItem(ACTIVE_GENERATION_KEY))
    if (!v || !String(v.messageId || '')) return null
    return {
      person: String(v.person || ''),
      conversationId: String(v.conversationId || ''),
      messageId: String(v.messageId || ''),
      at: Number(v.at) || 0,
    }
  } catch { return null }
}

export function startGeneration(storage, info = {}, now = Date.now()) {
  if (!storage || !String(info.messageId || '')) return false
  try {
    storage.setItem(ACTIVE_GENERATION_KEY, JSON.stringify({
      person: String(info.person || ''),
      conversationId: String(info.conversationId || ''),
      messageId: String(info.messageId),
      at: Number(now) || Date.now(),
    }))
    return true
  } catch { return false }
}

export function finishGeneration(storage, messageId) {
  if (!storage) return false
  const active = readActiveGeneration(storage)
  // 只有本次请求自己才能清标记，避免旧请求覆盖新请求。
  if (active && String(messageId || '') && active.messageId !== String(messageId)) return false
  try { storage.removeItem(ACTIVE_GENERATION_KEY); return true } catch { return false }
}

export function needsGenerationRecovery(active, sending) {
  return Boolean(active && active.messageId) && !sending
}

export function recoverInterruptedMessages(messages, messageId, note = INTERRUPTED_NOTE) {
  const list = Array.isArray(messages) ? messages : []
  const id = String(messageId || '')
  let changed = false
  const next = list.map((m) => {
    if (!m || m.role !== 'assistant') return m
    if (id && m.id !== id) return m
    const content = typeof m.content === 'string' ? m.content : ''
    // 已经流式写入过内容：视为「已完成 / 部分完成」，原样保留，不覆盖用户可见的回复。
    if (content.trim()) return m
    changed = true
    return { ...m, content: note }
  })
  return { messages: changed ? next : list, changed }
}
