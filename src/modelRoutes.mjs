// 统一模型线路层：同一个「逻辑模型」可以挂多条 API Provider / 线路。
//
// 设计边界（很重要，别踩）：
// 1) 叠加层，不是替换层。现有 modelProfiles / vendors.keys / subscriptions 全部原样工作；
//    只有当用户给某个逻辑模型显式配置了线路，请求链路才切到线路模式。
// 2) 统一模型描述在这里只负责「模型和线路的映射」，UI 侧的目录见 unifiedModels.mjs，
//    重试判定见 routeFallback.mjs，三者都是纯函数，可直接 node --test。
// 3) 安全：线路里的 API Key 只存本机 localStorage，不进云端快照、不进 Git。
//    优先用 keyId 引用 vendors.keys（现成的安全方案），内联 apiKey 仅作兼容。
// 4) 本阶段只留计费 / 延迟 / 活动价 / 优先级 / 启用状态的字段，不做自动成本算法。

const str = (v) => String(v ?? '').trim()
const num = (v, fallback = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}
const bool = (v, fallback = true) => typeof v === 'boolean' ? v : fallback

export const ROUTES_STORAGE_KEY = 'ai-home.modelRoutes'
export const MAX_ROUTE_ATTEMPTS = 3
export const MAX_ROUTES_PER_MODEL = 8

const hasControlChar = (s) => {
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) < 32) return true
  return false
}
const clean = (v, limit = 200) => {
  const s = str(v).slice(0, limit)
  return hasControlChar(s) ? '' : s
}

// 逻辑模型 id：'google/gemini-2.5-pro' 与 'Gemini-2.5-Pro' 归为同一个模型，
// 但 'gpt-4o' 与 'gpt-4o-mini' 绝不合并。用于把三家线路收成一条模型行。
export function logicalModelId(value) {
  const s = clean(value, 160)
  if (!s) return ''
  return s.split('/').pop().trim().toLowerCase().replace(/\s+/g, '')
}

export function blankPricing() {
  return {
    inputPerM: 0,           // 按 token 计费：每百万 input token 单价
    outputPerM: 0,          // 每百万 output token 单价
    cachedInputPerM: 0,     // 每百万 cache 命中 input token 单价
    perRequest: 0,          // 固定每请求价格
    currency: 'CNY',
    rechargeDiscount: 1,    // 充值折扣：0.85 表示充值 100 实付 85
    promoPrice: 0,          // 临时活动价（0 = 未设置）
    promoExpiresAt: '',     // 活动价过期时间 ISO 字符串
  }
}

export function blankStats() {
  return {
    avgLatencyMs: 0, lastLatencyMs: 0,
    successCount: 0, failureCount: 0,
    lastUsedAt: '', lastError: '',
  }
}

// 新增线路的默认模板。id 由调用方生成（浏览器 crypto.randomUUID / node 测试可传入）。
export function blankRoute(logicalId, patch = {}, id = '') {
  return normalizeRoute({
    id: id || 'route-' + Math.random().toString(36).slice(2, 10),
    logicalId, label: '新线路', source: 'api',
    baseUrl: '', apiPath: '', chatUrl: '', model: str(logicalId),
    enabled: true, primary: false, priority: 0,
    createdAt: '', ...patch,
  })
}

export function normalizeRoute(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = clean(raw.id, 80)
  const logicalId = logicalModelId(raw.logicalId || raw.model)
  if (!id || !logicalId) return null
  const p = raw.pricing && typeof raw.pricing === 'object' ? raw.pricing : {}
  const s = raw.stats && typeof raw.stats === 'object' ? raw.stats : {}
  return {
    id,
    logicalId,
    label: clean(raw.label, 60) || '线路',
    source: raw.source === 'subscription' ? 'subscription' : 'api',
    vendorId: clean(raw.vendorId, 80),
    keyId: clean(raw.keyId, 80),
    apiKey: clean(raw.apiKey, 4096),
    baseUrl: clean(raw.baseUrl, 500),
    apiPath: clean(raw.apiPath, 200),
    chatUrl: clean(raw.chatUrl, 500),
    model: clean(raw.model, 160) || logicalId,
    enabled: bool(raw.enabled, true),
    primary: !!raw.primary,
    priority: Math.max(-1000, Math.min(1000, num(raw.priority, 0))),
    createdAt: clean(raw.createdAt, 40),
    pricing: {
      inputPerM: Math.max(0, num(p.inputPerM)),
      outputPerM: Math.max(0, num(p.outputPerM)),
      cachedInputPerM: Math.max(0, num(p.cachedInputPerM)),
      perRequest: Math.max(0, num(p.perRequest)),
      currency: clean(p.currency, 8) || 'CNY',
      rechargeDiscount: Math.max(0, Math.min(1, num(p.rechargeDiscount, 1))),
      promoPrice: Math.max(0, num(p.promoPrice)),
      promoExpiresAt: clean(p.promoExpiresAt, 40),
    },
    stats: {
      avgLatencyMs: Math.max(0, num(s.avgLatencyMs)),
      lastLatencyMs: Math.max(0, num(s.lastLatencyMs)),
      successCount: Math.max(0, Math.floor(num(s.successCount))),
      failureCount: Math.max(0, Math.floor(num(s.failureCount))),
      lastUsedAt: clean(s.lastUsedAt, 40),
      lastError: clean(s.lastError, 300),
    },
  }
}

export function normalizeRoutes(raw) {
  const out = []
  const seen = new Set()
  for (const r of Array.isArray(raw) ? raw : []) {
    const route = normalizeRoute(r)
    if (!route || seen.has(route.id)) continue
    seen.add(route.id)
    out.push(route)
  }
  // 每个逻辑模型最多 MAX_ROUTES_PER_MODEL 条，避免脏数据把 UI 撑爆。
  const counts = new Map()
  return out.filter((r) => {
    const n = counts.get(r.logicalId) || 0
    if (n >= MAX_ROUTES_PER_MODEL) return false
    counts.set(r.logicalId, n + 1)
    return true
  })
}

// 云端快照 / 日志里绝不能带 Key。routes 整体不进快照，这个函数给导出与诊断兜底。
export function sanitizeRoutes(routes) {
  return (Array.isArray(routes) ? routes : []).map((r) => {
    const copy = { ...r }
    delete copy.apiKey
    return copy
  })
}

export function routesForModel(routes, logicalId) {
  const key = logicalModelId(logicalId)
  if (!key) return []
  return (Array.isArray(routes) ? routes : []).filter((r) => r && r.logicalId === key)
}

// 主线路：同一逻辑模型下最多一条 primary。设置后其余自动取消。
export function setPrimaryRoute(routes, logicalId, routeId) {
  const key = logicalModelId(logicalId)
  return (Array.isArray(routes) ? routes : []).map((r) => r && r.logicalId === key
    ? { ...r, primary: r.id === routeId }
    : r)
}

// 路由选择：手动固定只走那一条（固定就是固定，不偷偷 fallback）；
// 自动模式 = 主线路优先 → priority 升序 → 添加顺序；停用的线路永远不进队列。
// 返回顺序就是实际尝试顺序，调用方按 maxAttempts 截断，避免循环。
export function planRouteOrder(routes, logicalId, options = {}) {
  const { fixedRouteId = '', maxAttempts = MAX_ROUTE_ATTEMPTS } = options
  const limit = Math.max(1, Math.min(MAX_ROUTE_ATTEMPTS + 2, Math.floor(num(maxAttempts, MAX_ROUTE_ATTEMPTS))))
  const candidates = routesForModel(routes, logicalId).filter((r) => r.enabled)
  if (fixedRouteId) {
    const fixed = candidates.find((r) => r.id === fixedRouteId)
    return fixed ? [fixed] : []
  }
  return candidates
    .map((r, i) => ({ r, i }))
    .sort((a, b) => Number(b.r.primary) - Number(a.r.primary) || a.r.priority - b.r.priority || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.r)
}

// 线路 → 一次 /api/chat 请求需要的参数。
// Key 解析顺序：keyId 引用的 vendors.keys → 线路内联 Key → 该 vendor 的候选 Key → 旧助手 Key。
// 返回值里只有「值」，线路对象本身不出本机，方便服务端直接按数组换 Key。
export function routeRequestParams(route, vendors = [], fallbackKeys = []) {
  if (!route) return null
  const keys = []
  const push = (v) => { const s = str(v); if (s && !keys.includes(s)) keys.push(s) }
  if (route.keyId) {
    for (const v of Array.isArray(vendors) ? vendors : []) {
      const found = (Array.isArray(v.keys) ? v.keys : []).find((k) => k && k.id === route.keyId)
      if (found) push(found.value)
    }
  }
  push(route.apiKey)
  if (route.vendorId && !route.keyId && !route.apiKey) {
    const v = (Array.isArray(vendors) ? vendors : []).find((x) => x && x.id === route.vendorId)
    for (const k of Array.isArray(v?.keys) ? v.keys : []) push(k?.value)
  }
  for (const k of Array.isArray(fallbackKeys) ? fallbackKeys : []) push(k)
  return {
    routeId: route.id,
    label: route.label,
    source: route.source,
    endpoint: route.baseUrl,
    chatUrl: route.chatUrl,
    apiPath: route.apiPath,
    apiKeys: keys.slice(0, 6),
    model: route.model,
  }
}

// 前端一次性生成有序候选（自动已有最大尝试次数），服务端按同一顺序执行。
export function buildRoutePlan({ routes = [], logicalId = '', vendors = [], fallbackKeys = [], binding = {}, maxAttempts = MAX_ROUTE_ATTEMPTS } = {}) {
  const fixedRouteId = str(binding?.fixedRouteId)
  const ordered = planRouteOrder(routes, logicalId, { fixedRouteId, maxAttempts })
  return ordered
    .map((r) => routeRequestParams(r, vendors, fallbackKeys))
    .filter((r) => r && r.apiKeys.length > 0 && (r.endpoint || r.chatUrl))
}
