// 消息呈现层的纯函数：Token 汇总 / 工具调用卡分组 / 思考过程翻译判定与请求构造。
// 对应 P1-4（工具折叠卡）、P1-5（reasoning 折叠+翻译）、P1-6（Token 简化）。
// 无 React、无网络、无存储、无 DOM，全部可直接单测；UI 只负责把结果渲染出来。

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** 耗时格式化：毫秒级显示 ms，秒级保留 1 位小数。 */
export function formatDuration(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1000) return Math.round(n) + ' ms'
  return (n / 1000).toFixed(1) + 's'
}

/**
 * Token 汇总（P1-6）：默认只给一个总数入口，展开才看明细。
 * 缓存为 0 / 未报告时**不产生**「缓存」行（用户明确要求不要显示「缓存 0」）。
 * 脏数据（字符串、NaN、负数、undefined）一律按 0 处理，绝不把 NaN 渲染到界面。
 */
export function summarizeTokenUsage(usage) {
  const u = usage && typeof usage === 'object' ? usage : {}
  const prompt = num(u.promptTokens)
  const completion = num(u.completionTokens)
  const cached = Math.min(prompt, Math.max(num(u.cachedTokens), num(u.cacheReadTokens)))
  const speed = num(u.tokensPerSecond)
  const elapsed = num(u.elapsedMs)
  const rows = [
    { label: '输入', value: prompt },
    { label: '输出', value: completion },
  ]
  if (cached > 0) rows.push({ label: '缓存', value: cached })
  if (speed > 0) rows.push({ label: '速度', value: speed + ' tok/s' })
  if (elapsed > 0) rows.push({ label: '耗时', value: formatDuration(elapsed) })
  return {
    total: prompt + completion,
    label: 'Token ' + (prompt + completion),
    rows,
    hasCache: cached > 0,
  }
}

const STATUS_LABEL = {
  queued: '排队中', awaiting_confirmation: '等待确认', running: '执行中',
  succeeded: '已完成', failed: '失败', cancelled: '已取消', timed_out: '已超时',
}
const RESULT_KEYS = ['title', 'name', 'message', 'text', 'content', 'summary', 'result']

function clip(s, max = 48) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max) + '…' : t
}

/** 一级卡片的「业务化结果」：优先取结果里的可读字段，退化为状态短语。 */
export function summarizeToolResult(resultSummary, status, errorMessage) {
  if (status === 'queued' || status === 'awaiting_confirmation' || status === 'running') return '执行中'
  if (status === 'failed' || status === 'timed_out' || status === 'cancelled') {
    return errorMessage ? clip(errorMessage) : (STATUS_LABEL[status] || '未完成')
  }
  if (resultSummary && typeof resultSummary === 'object' && !Array.isArray(resultSummary)) {
    for (const k of RESULT_KEYS) {
      const v = resultSummary[k]
      if (typeof v === 'string' && v.trim()) return clip(v)
    }
    // 只有结构化字段（如 {id, ok:true}）时不把整个 JSON 摊在一级卡片上。
    return '执行成功'
  }
  if (typeof resultSummary === 'string' && resultSummary.trim()) return clip(resultSummary)
  return '执行成功'
}

/**
 * 工具调用卡分组（P1-4）：把一条消息下的原始事件聚合成「一个折叠卡 + 若干一级条目」。
 * 技术细节（tool name / arguments / latency / raw result）保留在 detail，只给二级「详情」用。
 * 没有调用时 items 为空，UI 直接不渲染。
 */
export function groupToolCalls(calls) {
  const list = Array.isArray(calls) ? calls.filter(c => c && typeof c === 'object') : []
  const items = list.map(c => {
    const status = typeof c.status === 'string' ? c.status : 'running'
    return {
      key: String(c.key || c.eventId || c.id || Math.random()),
      label: String(c.displayName || c.toolName || '工具'),
      outcome: summarizeToolResult(c.resultSummary, status, c.errorMessage),
      status,
      statusLabel: STATUS_LABEL[status] || status,
      durationMs: Number.isFinite(Number(c.durationMs)) ? Number(c.durationMs) : undefined,
      detail: {
        toolName: c.toolName || '',
        arguments: c.arguments ?? null,
        resultSummary: c.resultSummary ?? null,
        errorMessage: c.errorMessage || '',
        errorCode: c.errorCode || '',
        serverName: c.serverName || '',
        startedAt: c.startedAt || '',
        finishedAt: c.finishedAt || '',
        durationMs: Number.isFinite(Number(c.durationMs)) ? Number(c.durationMs) : undefined,
      },
    }
  })
  const succeeded = items.filter(x => x.status === 'succeeded').length
  const failed = items.filter(x => ['failed', 'timed_out', 'cancelled'].includes(x.status)).length
  const active = items.filter(x => ['queued', 'awaiting_confirmation', 'running'].includes(x.status)).length
  let icon = '✓'
  let label = '✓ 已完成 ' + succeeded + ' 个工具'
  if (active > 0) { icon = '⋯'; label = '⋯ 正在执行 ' + active + ' 个工具' }
  else if (failed > 0) { icon = '⚠'; label = '⚠ ' + items.length + ' 个工具 · ' + failed + ' 失败' }
  return { total: items.length, succeeded, failed, active, icon, label, items }
}

/**
 * 判断 reasoning 是否「非中文」（P1-5）。
 * 只用来决定是否**显示**翻译按钮，绝不自动发起请求。
 * 中文字符占比低于 20% 且含拉丁字母 → 视为需要翻译；纯中文/空文本 → false。
 */
export function needsChineseTranslation(text) {
  const s = typeof text === 'string' ? text : ''
  if (!s.trim()) return false
  const cjk = (s.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
  const latin = (s.match(/[A-Za-z]/g) || []).length
  if (!latin) return false
  return cjk / (cjk + latin) < 0.2
}

/** 构造翻译请求 messages（P1-5）：只输出译文，不改原文、不写会话历史。 */
export function buildTranslationMessages(text) {
  return [
    {
      role: 'system',
      content: '你是翻译助手。把用户给出的「模型思考过程」完整翻译成简体中文。只输出译文，不要解释、不要总结、不要添加任何前缀或标记；保留原文段落与换行。',
    },
    { role: 'user', content: String(text ?? '') },
  ]
}
