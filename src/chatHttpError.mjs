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

/**
 * Classify errors without pretending to identify a VPN/proxy from a browser fetch failure.
 * Do not show URLs, API keys, raw request bodies or server JSON in the UI.
 */
export function diagnoseChatHttpError(status, detail, { toolsEnabled = false, elapsedMs = 0 } = {}) {
  const raw = String(detail ?? '')
  const hint = upstreamHint(raw).toLowerCase()
  const text = (raw.slice(0, 3500) + ' ' + hint).toLowerCase()
  const time = Number.isFinite(Number(elapsedMs)) && Number(elapsedMs) >= 1000
    ? ' · 已等待 ' + Math.round(Number(elapsedMs) / 1000) + ' 秒' : ''
  const http = Number(status)
  // Many upstream proxies overload HTTP 429 for billing, account suspension or
  // insufficient credit. Give their explicit account error priority over rate limiting.
  // Examine the bounded text only for classification; never print raw JSON or secrets.
  if ((http === 429 || http === 402 || http === 403) && /your account is not active|account (?:is )?(?:inactive|disabled|suspended|not active)|账户(?:未激活|已停用|被冻结)|账号(?:未激活|已停用|被冻结)/i.test(text)) {
    return '中转账户未激活或被停用（HTTP ' + http + time + '）：上游要求检查账户或账单状态。请到供应商后台核实账号状态、订阅与结算信息；这不是普通的请求频率限制。'
  }
  if ((http === 429 || http === 402 || http === 403) && /insufficient (?:balance|credit|quota)|(?:out of|no) (?:credit|balance)|billing (?:issue|details|problem)|payment required|账户余额不足|余额不足|欠费|额度不足|余额已用尽/i.test(text)) {
    return '中转账户余额或计费异常（HTTP ' + http + time + '）：上游提示可能需要充值、检查余额或账单。不是单纯的请求过快。'
  }
  if (http === 429 && /rate.?limit|too many requests|requests? per (?:minute|second)|频率限制|请求过于频繁|限流/i.test(text)) {
    return '请求触发上游限流（HTTP 429' + time + '）：可以稍后重试或切换线路。'
  }
  if ((http === 400 || http === 422) && /unknown name|invalid json payload|dependentrequired|dependentschemas|additionalproperties|function.?declaration|tool.?schema|invalid.*(tool|function|parameter)|unsupported.*(tool|function)/i.test(text)) {
    return '工具参数兼容性错误（HTTP ' + http + time + '）：模型接口不接受部分工具定义字段。'
      + (toolsEnabled ? '建议临时关闭此模型的工具后重试；其他模型的 MCP 配置不需要改。' : '请检查中转接口要求的请求格式。')
  }
  if ((http === 400 || http === 422) && toolsEnabled)
    return '请求参数被拒绝（HTTP ' + http + time + '）：可能是模型 ID、工具定义或流式请求参数不兼容。可先关闭当前模型的工具进行对比；无法仅凭状态码确定是工具故障。'
  if (http === 502 && /failed to fetch|networkerror|network request failed|load failed|无法连接该接口/i.test(text)) {
    return '网络请求未成功连接上游（HTTP 502' + time + '）：无法确认是代理导致。请检查中转地址、Clash 分流、DNS、证书或 WebView 跨域限制（CORS）；可对比关闭代理后的情况。'
  }
  return friendlyHttpError(http, detail) + time
}

export function diagnoseChatTransportError(error, { stage = 'request', elapsedMs = 0, toolsEnabled = false, localMode = true } = {}) {
  const text = String(error?.message ?? error ?? '')
  const duration = Number.isFinite(Number(elapsedMs)) && Number(elapsedMs) >= 1000
    ? '（已等待 ' + Math.round(Number(elapsedMs) / 1000) + ' 秒）' : ''
  if (/abort|cancel/i.test(text)) return '请求被取消' + duration
  if (/timeout|timed out|deadline/i.test(text))
    return '请求等待超时' + duration + '。'
      + (stage === 'stream' ? '已进入流式接收阶段，可能是中转服务停止传输。' : '尚未确认模型是否接收到请求，请检查中转服务或网络线路。')
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(text))
    return (stage === 'stream' ? '流式连接中断' : '无法连接模型接口') + duration + '：'
      + (localMode ? '浏览器网络层没有提供具体原因，可能是代理分流、DNS、证书、CORS 或中转服务器问题；不能直接判定为梯子故障。' : '尚未得到明确的上游响应，请检查后端连接与网络。')
  return '模型请求失败' + duration + '（阶段：' + (stage === 'stream' ? '流式接收' : stage === 'tool' ? '工具调用' : '请求准备或连接') + '）：'
    + (toolsEnabled && /schema|tool|function|parameter/i.test(text) ? '疑似工具兼容问题，请尝试关闭当前模型工具。' : '请查看请求记录或联系中转服务核查。')
}

/** Codex subscription uses OAuth and ChatGPT account identity; never call it an API
 * balance problem solely because an upstream 429 uses billing-related wording. */
export function diagnoseGptSubscriptionError(status,detail,{elapsedMs=0,hasAccountId=false}={}) {
  const code=Number(status)
  const hint=upstreamHint(detail)
  const searchable=(String(detail||'').slice(0,2500)+' '+hint).toLowerCase()
  const waited=Number(elapsedMs)>1000?' · 已等待 '+Math.round(Number(elapsedMs)/1000)+' 秒':''
  const accountAdvice=hasAccountId?'请检查该订阅账号的 Codex 使用权限和模型是否受支持。':'请求中缺少可确认的 ChatGPT 账号标识；请在栖间订阅页核对登录账号。'
  if ((code===429||code===402||code===403) && /account is not active|account.*inactive|check your billing details|billing details/.test(searchable))
    return 'GPT 订阅接口返回账户状态异常（HTTP '+code+waited+'）：这是 Codex 订阅接口的上游响应，不能据此判断 ChatGPT Plus 欠费。'+accountAdvice
  if(code===429)
    return 'GPT 订阅接口返回 HTTP 429'+waited+'：可能是 Codex 配额、账号状态或服务限流，不等同于 API 中转余额不足。'+accountAdvice
  if(code===401||code===403)
    return 'GPT 订阅授权被拒绝（HTTP '+code+waited+'）：请核对 OAuth 登录是否过期，以及当前账号有无 Codex 接口权限。'
  return 'GPT 订阅接口：'+friendlyHttpError(code,detail)+waited
}
