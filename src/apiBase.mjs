// 统一 API Base URL 机制（Android APP 化）。
// 原则：
// - Web 端默认 ''（同源相对路径），行为与历史版本完全一致；
// - Android WebView 加载的是包内本地资源（https://localhost），相对路径打不到业务服务器，
//   必须补一个 base；优先级：运行时覆盖（本机开发者填的） > 构建时 VITE_API_BASE_URL > ''；
// - 只做「地址前缀」拼接，绝不改变任何 /api/* 的路径、参数与业务语义。

export const API_BASE_STORAGE_KEY = 'ai-home.apiBaseOverride'

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
export function assetUrl(preview, base) {
  const p = String(preview == null ? '' : preview)
  if (!p.startsWith('/api/')) return p
  return apiUrl(p, base)
}

// 模块级当前 base（App 启动时 setApiBase 一次；开发者设置页修改后再 set 一次）。
let currentBase = ''
export function setApiBase(base) { currentBase = normalizeApiBase(base) }
export function getApiBase() { return currentBase }

// 统一 fetch 包装：默认 credentials:'include'（跨源时 Cookie 必须显式 include；
// 同源请求下 'include' 与 'same-origin' 行为一致，故统一设置不改变既有语义）。
// init 透传，绝不改写 body/method/headers —— 请求业务语义零变化。
export async function apiFetch(path, init, fetchImpl) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null)
  if (!doFetch) throw new Error('fetch 不可用')
  const opts = Object.assign({}, init || {})
  if (opts.credentials === undefined) opts.credentials = 'include'
  return doFetch(apiUrl(path, currentBase), opts)
}
