// 上下文压缩：聊天窗口变长时，把「较早的对话」压成一份前情提要，而不是直接丢掉。
//
// 设计目标（避免「压缩后失忆」）：
//   1. 原文永不删除：只把早段总结进 conversation.summary，messages 仍完整保留；
//   2. 摘要之后的消息全部原样带上：summary 覆盖到某个消息 id，之后的消息继续逐条发送，
//      所以任何一条消息要么在摘要里、要么在原文里，绝不会凭空消失；
//   3. AI 可以回顾：摘要会作为 system 消息注入，同时提供 conversation_search 工具，
//      需要核对原话时按关键词检索当前助手的所有会话。
//
// 纯函数放这里，React/网络/存储都不依赖，可直接单测。

export const CONTEXT_LIMITS = {
  maxMessages: 24,   // 超过这个条数就考虑压缩
  keepMessages: 14,  // 压缩后至少保留的最近消息数
  maxChars: 16000,   // 最近消息的字数预算；超了就从最旧的开始多压几条
}

function textLen(message) {
  return String(message?.content || '').length
}

function totalChars(list) {
  return list.reduce((sum, message) => sum + textLen(message), 0)
}

/**
 * 需要压掉最旧的多少条？
 * 返回 { needed, cut }：cut=0 表示这一段不需要压缩。
 */
export function planCompaction(history, limits = {}) {
  const list = Array.isArray(history) ? history.filter(item => item && typeof item === 'object') : []
  const maxMessages = Math.max(4, Number(limits.maxMessages) || CONTEXT_LIMITS.maxMessages)
  const keepMessages = Math.min(maxMessages, Math.max(1, Number(limits.keepMessages) || CONTEXT_LIMITS.keepMessages))
  const maxChars = Math.max(1000, Number(limits.maxChars) || CONTEXT_LIMITS.maxChars)
  if (!list.length) return { needed: false, cut: 0 }
  if (list.length <= maxMessages && totalChars(list) <= maxChars) return { needed: false, cut: 0 }
  let cut = Math.max(0, list.length - keepMessages)
  let suffixChars = totalChars(list.slice(cut))
  // 字数也超预算：从最旧的开始多压几条，但始终至少留一条。
  while (cut < list.length - 1 && suffixChars > maxChars) {
    suffixChars -= textLen(list[cut])
    cut += 1
  }
  return cut > 0 ? { needed: true, cut } : { needed: false, cut: 0 }
}

const SUMMARY_SYSTEM = [
  '你是对话压缩器。把「已有摘要」和「新增旧对话」合并成一份前情提要，供后续继续聊天时参考。',
  '要求：',
  '1. 保留人物、关系、约定、时间、数字、地点、未完成的事、重要偏好与情绪；',
  '2. 不要编造，不要评价，不要写「用户说/助手说」的流水账；',
  '3. 用紧凑的条目或短段落，控制在 400–800 字；',
  '4. 只输出摘要正文，不要解释，不要加「摘要：」前缀。',
].join('\n')

/**
 * 构造压缩请求的 messages。已有摘要会和新增旧对话一起给模型合并。
 * 从最新往回取，保证最近的细节优先进入预算。
 */
export function buildSummaryPrompt(previousSummary, messages, { maxChars = 12000 } = {}) {
  const list = Array.isArray(messages) ? messages : []
  const lines = []
  let budget = maxChars
  for (let index = list.length - 1; index >= 0 && budget > 0; index--) {
    const message = list[index]
    const text = String(message?.content || '').trim()
    if (!text) continue
    const clipped = text.length > 1200 ? text.slice(0, 1200) + '…' : text
    const role = message.role === 'user' ? '用户' : message.role === 'assistant' ? '助手' : '系统'
    const line = role + '：' + clipped
    if (line.length > budget) break
    lines.unshift(line)
    budget -= line.length
  }
  return [
    { role: 'system', content: SUMMARY_SYSTEM },
    {
      role: 'user',
      content: (previousSummary ? '【已有摘要】\n' + previousSummary + '\n\n' : '')
        + '【新增旧对话】\n' + (lines.join('\n') || '（无）'),
    },
  ]
}

/** 注入请求的「前情提要」system 消息：告诉模型摘要覆盖了多少条，以及如何回顾原文。 */
export function buildSummarySystemMessage(summary, coveredMessages) {
  const count = Math.max(0, Number(coveredMessages) || 0)
  return [
    '【前情提要（更早的 ' + count + ' 条对话已压缩）】',
    String(summary || '').trim(),
    '',
    '需要核对原话或细节时，可以用 conversation_search 工具按关键词检索更早的对话。',
  ].join('\n')
}

/**
 * conversation_search 工具的实现：检索当前助手所有会话的原始消息（包括已被压缩的）。
 * 按关键词命中数排序，同分时较新的在前。
 */
export function searchHistory(conversations, person, query, limit = 6) {
  const text = String(query || '').trim()
  if (!text) return []
  const terms = [...new Set(text.split(/[\s，。！？、,.!?；;：:（）()]+/).map(term => term.trim()).filter(Boolean))].slice(0, 8)
  if (!terms.length) return []
  const list = Array.isArray(conversations?.[person]) ? conversations[person] : []
  const hits = []
  for (const conversation of list.slice(0, 300)) {
    const title = String(conversation?.title || '未命名会话')
    for (const message of conversation?.messages || []) {
      const content = String(message?.content || '')
      if (!content) continue
      const score = terms.reduce((count, term) => count + (content.includes(term) ? 1 : 0), 0)
      if (!score) continue
      hits.push({
        conversationId: conversation.id,
        title,
        role: message.role,
        at: message.at || conversation.updatedAt || '',
        content: content.slice(0, 700),
        score,
      })
    }
  }
  hits.sort((a, b) => b.score - a.score || String(b.at).localeCompare(String(a.at)))
  return hits.slice(0, Math.min(12, Math.max(1, Number(limit) || 6)))
}
