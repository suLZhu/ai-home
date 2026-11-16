// 订阅号登录：账号 + 密码 → 站点返回的访问令牌 → 写进供应商 Key 链路。
// 之后的 /models、/chat 都带这把令牌，直接消耗订阅账号自己的额度。
// 纯逻辑 + 注入 fetch：云端 server.mjs、本地降级 localBackend.mjs 共用，也便于单测。
// 边界：只对接「提供账号密码登录接口的订阅号 / 中转站」；ChatGPT Plus / Claude Pro
// 之类网页会员没有公开的账号密码换令牌接口，这类请继续用「令牌」方式。
export const DEFAULT_LOGIN_PATH = '/api/user/login'
export const DEFAULT_TOKEN_PATH = '/api/token'

const str = (v) => String(v ?? '').trim()

// OpenAI 兼容地址（…/v1）→ 站点根（登录 /api/user/login 一般在根上，不在 /v1 下面）。
export function subscriptionSiteRoot(endpoint) {
  let base = str(endpoint).replace(/\/+$/, '')
  const suffixes = [
    /\/compatible-mode\/v\d+(?:[.-]\w+)?$/i,
    /\/api\/paas\/v\d+$/i,
    /\/api\/v\d+$/i,
    /\/v\d+[\w.-]*\/openai$/i,
    /\/v\d+[\w.-]*$/i,
  ]
  for (const re of suffixes) {
    if (re.test(base)) { base = base.replace(re, ''); break }
  }
  return base.replace(/\/+$/, '')
}

function join(root, path) {
  const r = str(root).replace(/\/+$/, '')
  if (!r) return ''
  const p = str(path)
  if (/^https?:\/\//i.test(p)) return p
  const suffix = p ? '/' + p.replace(/^\/+/, '').replace(/\/+$/, '') : ''
  return r + suffix
}

export function subscriptionLoginUrl(endpoint, loginPath = '') {
  return join(subscriptionSiteRoot(endpoint), str(loginPath) || DEFAULT_LOGIN_PATH)
}

export function subscriptionTokenUrl(endpoint, tokenPath = '') {
  return join(subscriptionSiteRoot(endpoint), str(tokenPath) || DEFAULT_TOKEN_PATH)
}

const TOKEN_KEYS = new Set([
  'token', 'accesstoken', 'access_token', 'jwt', 'apikey', 'api_key',
  'api_token', 'apitoken', 'key', 'sk', 'session_token', 'sessiontoken',
  'authorization', 'x_token', 'x_api_key', 'x_new_api_token', 'new_api_token',
])
const IGNORE_KEYS = new Set(['message', 'msg', 'error', 'errors', 'detail', 'description', 'hint'])
const normKey = (k) => String(k).toLowerCase().replace(/-/g, '_')
const cleanToken = (v) => {
  const s = str(v).replace(/^Bearer\s+/i, '')
  if (s.length < 8 || s.length > 4096) return ''
  if (!/^[A-Za-z0-9._+~=-]+$/.test(s)) return ''
  return s
}

function headerValue(headers, name) {
  if (!headers) return ''
  try {
    if (typeof headers.get === 'function') return str(headers.get(name))
    if (typeof headers === 'object') {
      const hit = Object.entries(headers).find(([k]) => k.toLowerCase() === name.toLowerCase())
      return str(hit ? hit[1] : '')
    }
  } catch { /* 忽略取头失败 */ }
  return ''
}

function headerToken(headers) {
  for (const h of ['authorization', 'x-token', 'x-api-key', 'x-new-api-token', 'x-session-token']) {
    const raw = headerValue(headers, h).replace(/^Bearer\s+/i, '')
    const hit = cleanToken(raw)
    if (hit) return hit
  }
  return ''
}

// 从登录响应里找令牌，兼容 one-api / new-api / 常见中转站的各种返回形状。
// 不在无关字段的字符串里瞎猜：只有 token 类字段名命中，或 data 明确是令牌形态才取。
export function extractAccessToken(payload, headers) {
  const h = headerToken(headers)
  if (h) return { token: h, source: 'header' }
  const seen = new Set()
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 6 || seen.has(node)) return ''
    seen.add(node)
    if (Array.isArray(node)) {
      for (const item of node) { const r = walk(item, depth + 1); if (r) return r }
      return ''
    }
    const entries = Object.entries(node)
    // 优先标准令牌字段：{data:{token:'…'}}、{access_token:'…'}、{data:'sk-…'} 都能命中。
    for (const [k, v] of entries) {
      const key = normKey(k)
      if (!TOKEN_KEYS.has(key)) continue
      if (typeof v === 'string') { const t = cleanToken(v); if (t) return t }
      const r = walk(v, depth + 1)
      if (r) return r
    }
    for (const [k, v] of entries) {
      const key = normKey(k)
      if (key === 'data' && typeof v === 'string') { const t = cleanToken(v); if (t && (t.startsWith('sk-') || t.length >= 24)) return t }
      if (IGNORE_KEYS.has(key)) continue
      const r = walk(v, depth + 1)
      if (r) return r
    }
    return ''
  }
  const token = walk(payload, 0)
  return token ? { token, source: 'body' } : null
}

function setCookieOf(res) {
  try {
    const headers = res && res.headers
    if (!headers) return ''
    if (typeof headers.getSetCookie === 'function') {
      const list = headers.getSetCookie()
      if (Array.isArray(list) && list.length) return list.map(x => String(x).split(';')[0]).join('; ')
    }
    const raw = typeof headers.get === 'function' ? headers.get('set-cookie') : ''
    if (!raw) return ''
    return String(raw).split(/,(?=\s*[^;,=]+=)/).map(x => x.split(';')[0].trim()).join('; ')
  } catch { return '' }
}

async function readJson(res) {
  try { return JSON.parse(await res.text()) } catch { return {} }
}

function timeoutSignal(ms) {
  try { return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined } catch { return undefined }
}

// 登录并换取访问令牌。返回 { token, source, loginUrl, username }。
// fetchImpl 可注入（服务端 / 本地降级 / 单测 mock 三种环境共用同一套逻辑）。
export async function performSubscriptionLogin(options = {}) {
  const {
    endpoint, loginPath = '', tokenPath = '', username, password,
    fetchImpl, timeoutMs = 15000,
  } = options
  const site = subscriptionSiteRoot(endpoint)
  if (!/^https?:\/\//i.test(site)) throw new Error('订阅地址需以 http:// 或 https:// 开头')
  if (!str(username) || !str(password)) throw new Error('请填写订阅账号和密码')
  const doFetch = fetchImpl || globalThis.fetch
  if (typeof doFetch !== 'function') throw new Error('当前环境不支持网络请求')
  const loginUrl = subscriptionLoginUrl(endpoint, loginPath)
  const signal = timeoutSignal(timeoutMs)
  const res = await doFetch(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ username: str(username), password: str(password) }),
    redirect: 'error',
    ...(signal ? { signal } : {}),
  })
  const data = await readJson(res)
  if (!res.ok || data?.success === false || (data?.error && typeof data.error === 'string')) {
    const msg = [data?.message, data?.msg, typeof data?.error === 'string' ? data.error : '', res.ok ? '' : 'HTTP ' + res.status].filter(Boolean).join(' · ')
    throw new Error(msg || '登录失败，请检查账号密码与登录接口路径')
  }
  let found = extractAccessToken(data, res.headers)
  // new-api / one-api：登录接口只发会话 Cookie，系统令牌要再取一次 /api/token。
  if (!found) {
    const cookie = setCookieOf(res)
    if (cookie) {
      const tokenUrl = subscriptionTokenUrl(endpoint, tokenPath)
      const tokenRes = await doFetch(tokenUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json', 'Cookie': cookie },
        redirect: 'error',
        ...(signal ? { signal } : {}),
      })
      const tokenData = await readJson(tokenRes)
      const hit = extractAccessToken(tokenData, tokenRes.headers)
      if (hit) found = { token: hit.token, source: 'token-api' }
    }
  }
  if (!found) throw new Error('登录成功，但这个订阅号没返回访问令牌。可在「高级」里改登录接口路径，或切换「令牌」方式填平台给的 Key。')
  return { token: found.token, source: found.source, loginUrl, username: str(username) }
}
