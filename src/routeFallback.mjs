// 线路级自动 fallback 的判定与记录。纯函数，前端 / server / localBackend 三处共用，
// 避免三份重试规则各写一遍最后越跑越偏。
//
// 分级很清楚：
//   - 线路层：网络错误 / 超时 / 408 / 429 / 500 / 502 / 503 / 504 → 换下一条线路。
//   - 鉴权与配置错误（401/403/400/404/422 等）→ 不换线路。同一线路内换 Key 由
//     vendors.mjs 的 isRetryableKeyStatus 负责（有 6 把上限），两层都不会无限重试。
//   - 流式响应一旦开始向聊天窗口写出正文，任何失败都不换线路，避免重复生成消息。
//   - 用户主动取消（AbortSignal.aborted）永远不重试。

export const MAX_ROUTE_ATTEMPTS = 3

// 只列「换一条线路确实可能好」的 5xx，501/505/507 这类协议 / 服务器能力问题不换。
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])
const AUTH_OR_CONFIG_STATUS = new Set([400, 401, 402, 403, 404, 405, 409, 410, 413, 422])

const asStatus = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

export function isRetryableRouteStatus(status) {
  return RETRYABLE_STATUS.has(asStatus(status))
}

export function isAuthOrConfigStatus(status) {
  const n = asStatus(status)
  return AUTH_OR_CONFIG_STATUS.has(n) || (n >= 400 && n < 500)
}

// 网络 / 超时类错误可重试；主动 abort 不算故障，不能重发。
export function isRetryableRouteError(error, aborted = false) {
  if (aborted) return false
  if (!error) return false
  const name = String(error.name || '')
  if (name === 'AbortError' || name === 'TimeoutError') return true
  const msg = String(error.message || '')
  if (/timeout|timed?\s*out|ECONN|ENOTFOUND|EAI_AGAIN|network|fetch failed|socket hang up/i.test(msg)) return true
  const code = String((error.cause && error.cause.code) || error.code || '')
  return /ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EPIPE|UND_ERR/i.test(code)
}

// 把一次失败归一成可读原因 + 是否值得换线路。
export function classifyRouteFailure({ status = 0, error = null, aborted = false, responseText = '' } = {}) {
  const code = asStatus(status)
  const tail = String(responseText || '').trim().slice(0, 160)
  if (aborted) return { kind: 'aborted', retryable: false, reason: '请求已被取消' }
  if (error) {
    const retryable = isRetryableRouteError(error, aborted)
    const detail = String((error.cause && error.cause.code) || error.message || '网络异常')
    return { kind: 'network', retryable, reason: `网络/超时：${detail}` }
  }
  if (code) {
    if (isRetryableRouteStatus(code)) return { kind: 'upstream', retryable: true, reason: `上游 HTTP ${code}${tail ? ' · ' + tail : ''}` }
    if (isAuthOrConfigStatus(code)) return { kind: 'auth-or-config', retryable: false, reason: `鉴权或配置错误 HTTP ${code}${tail ? ' · ' + tail : ''}` }
    return { kind: 'upstream', retryable: false, reason: `上游 HTTP ${code}${tail ? ' · ' + tail : ''}` }
  }
  return { kind: 'unknown', retryable: false, reason: '未知错误' }
}

export function shouldFallbackRoute({
  status = 0, error = null, aborted = false, responseText = '',
  streamStarted = false, attempt = 1, maxAttempts = MAX_ROUTE_ATTEMPTS, remainingRoutes = 1,
} = {}) {
  // 一旦流式正文已经写出，换线路会重新生成一遍，聊天里就会出现重复消息。
  if (streamStarted) return false
  if (aborted) return false
  const limit = Math.max(1, Math.min(10, Math.floor(Number(maxAttempts) || MAX_ROUTE_ATTEMPTS)))
  if (Number(attempt) >= limit) return false
  if (Number(remainingRoutes) <= 0) return false
  return classifyRouteFailure({ status, error, aborted, responseText }).retryable
}

export function createRouteReport(logicalId = '') {
  return { logicalId: String(logicalId || ''), attempts: [], usedRouteId: '', usedRouteLabel: '', failureReason: '', startedAt: '' }
}

export function recordRouteAttempt(report, { routeId = '', label = '', status = 0, error = null, aborted = false, responseText = '', ok = false } = {}) {
  const r = report && typeof report === 'object' ? report : createRouteReport()
  const failure = classifyRouteFailure({ status, error, aborted, responseText })
  const attempts = Array.isArray(r.attempts) ? r.attempts.slice() : []
  attempts.push({
    routeId: String(routeId || ''),
    label: String(label || ''),
    status: asStatus(status),
    ok: !!ok,
    kind: ok ? 'ok' : failure.kind,
    retryable: ok ? false : failure.retryable,
    reason: ok ? '成功' : failure.reason,
  })
  return { ...r, attempts }
}

export function finishRouteReport(report, { usedRouteId = '', usedRouteLabel = '', failureReason = '' } = {}) {
  const r = report && typeof report === 'object' ? report : createRouteReport()
  return {
    ...r,
    usedRouteId: String(usedRouteId || r.usedRouteId || ''),
    usedRouteLabel: String(usedRouteLabel || r.usedRouteLabel || ''),
    failureReason: String(failureReason || r.failureReason || ''),
  }
}

// 给聊天错误提示 / 诊断日志用：「线路 A：上游 HTTP 429 → 线路 B：成功」。
export function summarizeRouteReport(report) {
  const attempts = Array.isArray(report?.attempts) ? report.attempts : []
  if (!attempts.length) return ''
  const parts = attempts.map((a) => `${a.label || a.routeId || '线路'}：${a.ok ? '成功' : a.reason}`)
  const used = String(report?.usedRouteId || '')
  return parts.join(' → ') + (used ? `（实际使用 ${report.usedRouteLabel || used}）` : '')
}
