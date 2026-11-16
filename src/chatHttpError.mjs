// 模型接口 HTTP 错误展示层。
// 上游返回的原始 JSON / HTML / 堆栈只允许进控制台诊断，绝不直接出现在聊天气泡或错误条里。
const MAX_HINT = 90

function cleanText(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function pickMessage(parsed) {
  if (!parsed || typeof parsed !== 'object') return typeof parsed === 'string' ? cleanText(parsed) : ''
  const e = parsed.error
  let m = ''
  if (typeof e === 'string') m = e
  else if (e && typeof e === 'object') m = cleanText(e.message ?? e.msg ?? e.code ?? '')
  if (!m) {
    const v = parsed.message ?? parsed.msg ?? parsed.detail ?? ''
    m = typeof v === 'string' ? cleanText(v) : ''
  }
  return m
}

export function upstreamHint(detail) {
  const raw = String(detail ?? '')
  if (!raw.trim()) return ''
  let parsed = null
  let isJson = true
  try { parsed = JSON.parse(raw) } catch { isJson = false }
  let msg = isJson ? pickMessage(parsed) : ''
  if (!isJson) {
    const t = cleanText(raw)
    // 疑似 JSON 但解析失败，或 HTML 错误页：不展示报文原文。
    if (/^[{[]/.test(t) || /<[a-z!][^>]*>/i.test(t) || /^<!doctype/i.test(t)) return ''
    msg = t
  }
  msg = cleanText(msg)
  if (!msg) return ''
  return msg.length > MAX_HINT ? msg.slice(0, MAX_HINT) + '…' : msg
}

function baseMessage(status) {
  const n = Number(status)
  if (n === 400) return '请求被模型接口拒绝（HTTP 400）：请检查模型 ID、请求参数与接口格式。'
  if (n === 401 || n === 403) return `模型接口鉴权失败（HTTP ${n}）：请检查 API Key 或订阅登录状态。`
  if (n === 404) return '模型接口返回 404：请检查设置里的 API 地址、路径与模型 ID。'
  if (n === 408 || n === 504) return `模型接口超时（HTTP ${n}），请稍后重试。`
  if (n === 429) return '模型接口请求过于频繁（HTTP 429），请稍后再试或切换线路。'
  if (n >= 500) return `模型服务暂时不可用（HTTP ${n}），请稍后重试。`
  return `模型接口返回 HTTP ${Number.isFinite(n) && n ? n : '未知状态'}。`
}

export function friendlyHttpError(status, detail) {
  const hint = upstreamHint(detail)
  const base = baseMessage(status)
  return hint ? `${base}（上游提示：${hint}）` : base
}

export function routeInfoFromError(status, detail) {
  const hint = upstreamHint(detail)
  return hint ? `HTTP ${status}：${hint}` : `HTTP ${status}`
}
