// 聊天展示偏好：勾选哪些内容出现在对话气泡周围（头像 / 名称 / 时间 / Token）。
// 只存本机，不进云端快照；保存后广播事件，聊天窗口即时生效。
export const CHAT_DISPLAY_KEY = 'ai-home.chatDisplay'
export const CHAT_DISPLAY_EVENT = 'aihome:chatdisplay'

export const DEFAULT_CHAT_DISPLAY = {
  assistantAvatar: true,
  userAvatar: true,
  assistantName: false,
  userName: false,
  time: false,
  timePos: 'above',
  token: true,
}

export function normalizeChatDisplay(raw) {
  const d = { ...DEFAULT_CHAT_DISPLAY }
  if (!raw || typeof raw !== 'object') return d
  for (const k of ['assistantAvatar', 'userAvatar', 'assistantName', 'userName', 'time', 'token']) {
    if (typeof raw[k] === 'boolean') d[k] = raw[k]
  }
  if (raw.timePos === 'above' || raw.timePos === 'below') d.timePos = raw.timePos
  return d
}

export function loadChatDisplay() {
  try {
    const raw = globalThis.localStorage?.getItem(CHAT_DISPLAY_KEY)
    return normalizeChatDisplay(raw ? JSON.parse(raw) : null)
  } catch {
    return { ...DEFAULT_CHAT_DISPLAY }
  }
}

export function saveChatDisplay(next) {
  const value = normalizeChatDisplay(next)
  try { globalThis.localStorage?.setItem(CHAT_DISPLAY_KEY, JSON.stringify(value)) } catch { /* 隐私模式 */ }
  try { globalThis.dispatchEvent?.(new CustomEvent(CHAT_DISPLAY_EVENT, { detail: value })) } catch { /* 非浏览器环境 */ }
  return value
}

// 消息时间：优先用消息自带的 at，其次用 assistant usage.at；格式化成本地 HH:MM。
export function formatMessageTime(msg) {
  const iso = (msg && (msg.at || (msg.usage && msg.usage.at))) || ''
  if (!iso) return ''
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return ''
  const p2 = (n) => String(n).padStart(2, '0')
  return String(t.getFullYear()).slice(-2) + '/' + p2(t.getMonth() + 1) + '/' + p2(t.getDate()) + ' ' + p2(t.getHours()) + ':' + p2(t.getMinutes())
}
