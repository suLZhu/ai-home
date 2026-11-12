// 主动消息 / 定时任务的通知决策层（纯函数）。
// 关键约束：只有「消息确实写进聊天」之后才允许调用；同一 runId / inbox id 只通知一次；
// 用户正在该助手的对应会话里时不弹系统通知；渠道按 assistantId 动态生成，不写死两位助手。

export const SYSTEM_CHANNEL_ID = 'aihome.system'
export const SYSTEM_CHANNEL_NAME = '定时任务 / 系统消息'
export const NOTIFIED_STORAGE_KEY = 'ai-home.notified.v1'
export const NOTIFIED_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const MAX_NOTIFIED = 400
export const SUMMARY_LIMIT = 110
export const BODY_LIMIT = 3600
export const AVATAR_LIMIT = 200000

const TASK_KINDS = new Set(['task', 'task_result', 'task_notice', 'test', 'system'])

export function safeChannelPart(value) {
  const s = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return s.slice(0, 48) || 'unknown'
}

export function assistantChannelId(person) {
  const p = String(person ?? '').trim()
  return p ? 'aihome.msg.' + safeChannelPart(p) : ''
}

export function channelIdFor(kind, person) {
  if (TASK_KINDS.has(String(kind ?? ''))) return SYSTEM_CHANNEL_ID
  return assistantChannelId(person) || SYSTEM_CHANNEL_ID
}

export function channelNameFor(kind, person, label) {
  if (channelIdFor(kind, person) === SYSTEM_CHANNEL_ID) return SYSTEM_CHANNEL_NAME
  const name = String(label ?? '').trim() || '助手'
  return name.slice(0, 40) + '消息'
}

/** 原生通知渠道清单：系统渠道 + 当前所有助手（新增助手自动多一条，无需改原生代码）。 */
export function channelPlan(people, labelOf = () => '', avatarOf = () => '') {
  const list = [{
    id: 'system', name: SYSTEM_CHANNEL_NAME, channelId: SYSTEM_CHANNEL_ID,
    channelName: SYSTEM_CHANNEL_NAME, avatar: '',
  }]
  const seen = new Set([SYSTEM_CHANNEL_ID])
  for (const person of Array.isArray(people) ? people : []) {
    const id = String(person ?? '').trim()
    if (!id) continue
    const channelId = assistantChannelId(id)
    if (seen.has(channelId)) continue
    seen.add(channelId)
    const name = String(labelOf(id) || '').trim() || id
    list.push({
      id, name, channelId, channelName: name.slice(0, 40) + '消息',
      avatar: String(avatarOf(id) || '').slice(0, AVATAR_LIMIT),
    })
  }
  return list
}

export function summarize(text, limit = SUMMARY_LIMIT) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim()
  return s.length > limit ? s.slice(0, limit) + '…' : s
}

function hashKey(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(36)
}

/**
 * 稳定 ID：本地任务与原生闹钟共用 task:<runId>；云端任务结果共用 task:<runId>；
 * 收件箱主动消息用 inbox:<message.id>。同一条内容在重启 / 恢复前台 / 重复轮询里恒定。
 */
export function notificationKey(input = {}) {
  const runId = String(input.runId ?? '').trim()
  if (runId) return 'task:' + runId.slice(0, 160)
  const messageId = String(input.messageId ?? '').trim()
  if (messageId) return 'inbox:' + messageId.slice(0, 160)
  const fallback = [input.person, input.text, input.at].map((x) => String(x ?? '')).join('|')
  return 'msg:' + hashKey(fallback)
}

export function notificationPayload(input = {}) {
  const kind = String(input.kind || 'message')
  const person = String(input.person || '').trim()
  const body = String(input.text ?? '').trim().slice(0, BODY_LIMIT)
  const label = String(input.label || '').trim()
  const channelId = channelIdFor(kind, person)
  const avatar = String(input.avatar || '')
  const key = notificationKey(input)
  return {
    key,
    kind,
    channelId,
    channelName: channelId === SYSTEM_CHANNEL_ID ? SYSTEM_CHANNEL_NAME : channelNameFor(kind, person, label),
    title: (channelId === SYSTEM_CHANNEL_ID
      ? (label ? label + ' · 定时任务' : '定时任务')
      : (label || '助手')).slice(0, 60),
    body,
    summary: summarize(body),
    at: Number.isFinite(Number(input.at)) ? Number(input.at) : Date.now(),
    assistantId: person,
    conversationId: String(input.conversationId || '').trim().slice(0, 120),
    runId: String(input.runId || '').trim().slice(0, 160),
    messageId: String(input.messageId || '').trim().slice(0, 160),
    avatar: avatar.startsWith('data:image/') && avatar.length <= AVATAR_LIMIT ? avatar : '',
  }
}

// ── 本机已通知集合：带 TTL 与上限，刷新 / 重启 / 恢复前台后依然去重 ───────────
export function loadNotified(storage, now = Date.now()) {
  try {
    const raw = JSON.parse(String(storage?.getItem(NOTIFIED_STORAGE_KEY) || '{}'))
    const out = new Set()
    for (const [k, t] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
      if (typeof k === 'string' && k && Number.isFinite(Number(t)) && Number(t) > now - NOTIFIED_TTL_MS) out.add(k)
    }
    return out
  } catch { return new Set() }
}

export function pruneNotified(store) {
  return Array.from(store instanceof Set ? store : new Set(store || []))
    .filter((k) => typeof k === 'string' && k)
    .slice(-MAX_NOTIFIED)
}

export function markNotified(storage, key, now = Date.now()) {
  if (!storage || !key) return false
  const store = loadNotified(storage, now)
  if (store.has(key)) return false
  store.add(key)
  const keys = pruneNotified(store)
  const record = {}
  for (const k of keys) record[k] = now
  try { storage.setItem(NOTIFIED_STORAGE_KEY, JSON.stringify(record)); return true } catch { return false }
}

/**
 * 是否需要发系统通知。visible=true 且正停在该助手的对应会话 → 明确不弹；
 * 已经通知过 → 明确不弹。其余（后台 / 锁屏 / 别的会话）都发。
 */
export function shouldNotify({ payload, activePerson = '', activeConversationId = '', page = '', chatOpen = false, visible = true, notified } = {}) {
  if (!payload || !payload.key || !payload.body) return { notify: false, reason: 'invalid' }
  const store = notified instanceof Set ? notified : new Set(notified || [])
  if (store.has(payload.key)) return { notify: false, reason: 'duplicate' }
  const samePerson = !!payload.assistantId && activePerson === payload.assistantId
  const sameConversation = !payload.conversationId || !activeConversationId || payload.conversationId === activeConversationId
  if (visible && page === 'room' && chatOpen && samePerson && sameConversation) {
    return { notify: false, reason: 'current_chat' }
  }
  return { notify: true, reason: 'background_or_other_chat' }
}

/**
 * App 侧「写回聊天之后」的唯一决策入口：把本机已通知集合与原生已投递集合合并，
 * 再交给 shouldNotify。原生闹钟在锁屏期间已弹过的 runId 会被合并进来，
 * App 恢复前台补跑任务结算时因此不会弹第二条。
 */
export function decideNotification({ payload, activePerson = '', activeConversationId = '', page = '', chatOpen = false, visible = true, notified, nativeDelivered = [] } = {}) {
  const base = notified instanceof Set ? notified : new Set(notified || [])
  const store = new Set(base) // 不修改调用方传进来的集合
  for (const key of Array.isArray(nativeDelivered) ? nativeDelivered : []) {
    if (key) store.add(String(key))
  }
  return shouldNotify({ payload, activePerson, activeConversationId, page, chatOpen, visible, notified: store })
}

/** 点击通知后的路由：只认当前仍存在的 assistantId；会话 id 透传，不自动建会话。 */
export function routeFromNotificationOpen(payload, validPeople) {
  const p = payload && typeof payload === 'object' ? payload : null
  if (!p) return null
  const person = String(p.assistantId ?? p.person ?? '').trim()
  const list = Array.isArray(validPeople) && validPeople.length ? validPeople.map(String) : null
  if (!person || person.length > 64 || (list && !list.includes(person))) return null
  return { person, conversationId: String(p.conversationId ?? '').trim().slice(0, 120) }
}
