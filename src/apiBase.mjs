// 统一 API Base URL 机制（Android APP 化）。
// 原则：
// - Web 端默认 ''（同源相对路径），行为与历史版本完全一致；
// - Android WebView 加载的是包内本地资源（https://localhost），相对路径打不到业务服务器，
//   必须补一个 base；优先级：运行时覆盖（本机开发者填的） > 构建时 VITE_API_BASE_URL > ''；
// - 只做「地址前缀」拼接，绝不改变任何 /api/* 的路径、参数与业务语义。

export const API_BASE_STORAGE_KEY = 'ai-home.apiBaseOverride'
// 登录凭证（服务端 /api/login 返回的 token）。Web 同源主要靠 Cookie，
// Android 跨源（局域网 http 地址）收不到 Secure Cookie，改由本 token 承载会话：
// JSON 请求走 Authorization 头，图片/SSE 走 ?token= 查询参数（无法自定义请求头的通道）。
export const SESSION_TOKEN_STORAGE_KEY = 'ai-home.sessionToken'

export function getSessionToken() {
  try {
    return (typeof localStorage !== 'undefined' ? localStorage.getItem(SESSION_TOKEN_STORAGE_KEY) : '') || ''
  } catch { return '' }
}
export function setSessionToken(token) {
  try {
    if (token && typeof localStorage !== 'undefined') localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, String(token))
  } catch { /* 存储不可用则退回仅 Cookie 模式 */ }
}
export function clearSessionToken() {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY) } catch { /* 忽略 */ }
}

// 规范化：去空白、去尾部斜杠；必须 http(s):// 开头，否则视为未配置（回退同源）。
export function normalizeApiBase(raw) {
  const s = String(raw == null ? '' : raw).trim()
  if (!s) return ''
  if (!/^https?:\/\//i.test(s)) return ''
  return s.replace(/\/+$/, '')
}

// 解析最终生效的 base：运行时覆盖优先，其次构建时注入，最后同源。
export function resolveApiBase(input) {
  const override = normalizeApiBase(input && input.override)
  if (override) return override
  return normalizeApiBase(input && input.buildBase)
}

// URL 拼接：base 为空时原样返回 path（同源相对路径，保持旧行为）。
export function apiUrl(path, base) {
  const p = String(path == null ? '' : path)
  if (!base) return p
  return base + (p.startsWith('/') ? p : '/' + p)
}

// 附件/图片地址：只重写我们自己的相对 /api/ 路径；
// data:/blob:/http(s):// 绝对地址原样返回（不碰 base64 与外部 URL）。
// 跨源（有 base）时附带 ?token=：浏览器 <img> 不会自动带 Authorization 头，
// 也没有跨源 Cookie（SameSite），只能走查询参数；同源仍走 Cookie，不改历史行为。
export function assetUrl(preview, base) {
  const p = String(preview == null ? '' : preview)
  if (!p.startsWith('/api/')) return p
  const resolved = apiUrl(p, base)
  if (!base) return resolved
  const token = getSessionToken()
  if (!token) return resolved
  return resolved + (resolved.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token)
}

// 模块级当前 base（App 启动时 setApiBase 一次；开发者设置页修改后再 set 一次）。
let currentBase = ''
export function setApiBase(base) { currentBase = normalizeApiBase(base) }
export function getApiBase() { return currentBase }

// 统一 fetch 包装：默认 credentials:'include'（跨源时 Cookie 必须显式 include；
// 同源请求下 'include' 与 'same-origin' 行为一致，故统一设置不改变既有语义）。
// init 透传，绝不改写 body/method —— 请求业务语义零变化。
// 本机存有登录 token 时附加 Authorization: Bearer（服务端三通道之一：Cookie/Bearer/查询参数），
// 覆盖 Android 跨源收不到 Cookie 的场景；无 token 时请求与历史版本逐字节一致。
export async function apiFetch(path, init, fetchImpl) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null)
  if (!doFetch) throw new Error('fetch 不可用')
  const opts = Object.assign({}, init || {})
  if (opts.credentials === undefined) opts.credentials = 'include'
  const token = getSessionToken()
  if (token && !hasAuthorization(opts.headers)) {
    const headers = new Headers(opts.headers || undefined)
    headers.set('Authorization', 'Bearer ' + token)
    opts.headers = headers
  }
  return doFetch(apiUrl(path, currentBase), opts)
}

function hasAuthorization(headers) {
  if (!headers) return false
  if (typeof Headers !== 'undefined' && headers instanceof Headers) return headers.has('Authorization')
  if (Array.isArray(headers)) return headers.some(([k]) => String(k).toLowerCase() === 'authorization')
  return Object.keys(headers).some(k => k.toLowerCase() === 'authorization')
}
