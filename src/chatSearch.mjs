// 当前会话消息搜索（微信式）：纯函数、无 storage/网络依赖，便于单测。
//
// 范围：只搜传入的当前会话消息列表（用户消息与 AI 回复都搜），
// 不跨会话、不跨助手、不调用模型、不改写任何消息内容。
// 匹配：大小写不敏感的子串匹配，中文/英文/数字关键词天然支持；
// 刻意不用正则——避免特殊字符转义问题与灾难性回溯，长聊天下也稳定。

// 关键词规范化：去首尾空白 + 转小写（英文忽略大小写）。
export function normalizeQuery(query) {
  return String(query == null ? '' : query).trim().toLowerCase()
}

// 统计关键词在一段文本中出现的次数（大小写不敏感）。
export function countOccurrences(text, lowerQuery) {
  if (!lowerQuery) return 0
  const lower = String(text == null ? '' : text).toLowerCase()
  let count = 0
  let pos = 0
  while ((pos = lower.indexOf(lowerQuery, pos)) !== -1) {
    count++
    pos += lowerQuery.length
  }
  return count
}

// 生成关键词上下文预览：以首个匹配为中心截取，超长两端加省略号。
export function snippetAround(text, query, radius = 30, maxLen = 120) {
  const raw = String(text == null ? '' : text).replace(/\s+/g, ' ').trim()
  const lowerQuery = normalizeQuery(query)
  if (!lowerQuery) return raw.slice(0, maxLen)
  const at = raw.toLowerCase().indexOf(lowerQuery)
  if (at < 0) return raw.slice(0, maxLen)
  const start = Math.max(0, at - radius)
  const end = Math.min(raw.length, at + lowerQuery.length + radius * 2)
  return (start > 0 ? '…' : '') + raw.slice(start, end) + (end < raw.length ? '…' : '')
}

// 在当前会话消息列表中搜索关键词。
// 返回 { total, items }：total 为命中消息总数（可能大于 items.length，受 limit 截断），
// items 为 [{ index, messageId, role, snippet, count }]，按消息时间顺序。
// index 是该消息在传入列表中的位置——仅供展示「第 N 条」，
// 定位一律用 messageId 找真实 DOM 节点，不依赖数组位置。
export function searchMessages(messages, query, limit = 200) {
  const lowerQuery = normalizeQuery(query)
  const list = Array.isArray(messages) ? messages : []
  if (!lowerQuery) return { total: 0, items: [] }
  const items = []
  let total = 0
  for (let i = 0; i < list.length; i++) {
    const m = list[i]
    const content = m && typeof m.content === 'string' ? m.content : ''
    if (!content) continue
    const count = countOccurrences(content, lowerQuery)
    if (!count) continue
    total++
    if (items.length >= limit) continue
    items.push({
      index: i,
      messageId: m.id ? String(m.id) : '',
      role: m.role === 'user' ? 'user' : 'assistant',
      snippet: snippetAround(content, lowerQuery),
      count,
    })
  }
  return { total, items }
}

// 上一条 / 下一条匹配的循环切换。current 为 -1 表示尚未选中任何匹配。
// direction：1 = 下一条，-1 = 上一条；total 为 0 时返回 -1。
export function stepMatchIndex(current, total, direction) {
  if (!total || total < 1) return -1
  const cur = Number.isFinite(current) ? Math.trunc(current) : -1
  if (cur < 0) return direction > 0 ? 0 : total - 1
  return (((cur + direction) % total) + total) % total
}
