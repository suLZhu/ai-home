// 线路层的本机状态：线路配置 + 当前选中的逻辑模型 + 按助手手动固定的线路。
// 单独一个 localStorage key，整包都不进云端快照（线路里可能有内联 API Key）。
// 所有变更都是纯函数，App.tsx 只需要持有一个 state 和一次持久化。

import { normalizeRoutes, blankRoute, setPrimaryRoute, ROUTES_STORAGE_KEY, MAX_ROUTES_PER_MODEL } from './modelRoutes.mjs'

const str = (v) => String(v ?? '').trim()
const cleanMap = (raw) => {
  const out = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw)) {
    const key = str(k).slice(0, 40)
    const value = str(v).slice(0, 120)
    if (key && value) out[key] = value
  }
  return out
}

export const ROUTE_STATE_KEY = 'ai-home.routeState'

// 兼容两种旧数据：{routes,active,fixed} 结构，或直接一个线路数组。
export function normalizeRouteState(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    routes: normalizeRoutes(Array.isArray(o.routes) ? o.routes : (Array.isArray(raw) ? raw : [])),
    active: cleanMap(o.active),
    fixed: cleanMap(o.fixed),
  }
}

export function activeLogicalId(state, person, fallbackModelId = '') {
  const s = normalizeRouteState(state)
  return s.active[str(person)] || str(fallbackModelId)
}

export function fixedRouteId(state, person) {
  return normalizeRouteState(state).fixed[str(person)] || ''
}

export function selectLogicalModel(state, person, logicalId) {
  const s = normalizeRouteState(state)
  const key = str(person)
  const id = str(logicalId)
  const active = { ...s.active }
  const fixed = { ...s.fixed }
  if (id) active[key] = id
  else delete active[key]
  // 换模型时解除旧的手动固定，避免固定到别的模型的线路上。
  delete fixed[key]
  return { ...s, active, fixed }
}

export function setFixedRoute(state, person, routeId) {
  const s = normalizeRouteState(state)
  const key = str(person)
  const fixed = { ...s.fixed }
  const id = str(routeId)
  if (id) fixed[key] = id
  else delete fixed[key]
  return { ...s, fixed }
}

export function addRoute(state, logicalId, patch = {}, id = '') {
  const s = normalizeRouteState(state)
  const key = str(logicalId)
  if (!key) return s
  const existing = s.routes.filter((r) => r.logicalId === key)
  if (existing.length >= MAX_ROUTES_PER_MODEL) return s
  const route = blankRoute(key, {
    ...patch,
    // 第一条线路自动成为主线路，用户之后再手动改。
    primary: existing.length === 0,
    createdAt: str(patch.createdAt) || new Date().toISOString(),
  }, id)
  return { ...s, routes: [...s.routes, route] }
}

export function updateRoute(state, routeId, patch) {
  const s = normalizeRouteState(state)
  return { ...s, routes: normalizeRoutes(s.routes.map((r) => r.id === routeId ? { ...r, ...patch } : r)) }
}

export function removeRoute(state, routeId) {
  const s = normalizeRouteState(state)
  const routes = s.routes.filter((r) => r.id !== routeId)
  // 删掉主线路时把同模型的下一条顶上来，避免出现「没有主线路」的悬空状态。
  const removed = s.routes.find((r) => r.id === routeId)
  if (removed?.primary) {
    const next = routes.find((r) => r.logicalId === removed.logicalId)
    if (next) return { ...s, routes: setPrimaryRoute(routes, removed.logicalId, next.id) }
  }
  return { ...s, routes }
}

export function primaryRoute(state, logicalId, routeId) {
  const s = normalizeRouteState(state)
  return { ...s, routes: setPrimaryRoute(s.routes, logicalId, routeId) }
}

// 导出 / 诊断用：绝不带出内联 Key。
export function exportRouteState(state) {
  const s = normalizeRouteState(state)
  return {
    ...s,
    routes: s.routes.map((r) => { const c = { ...r }; delete c.apiKey; return c }),
  }
}

export { ROUTES_STORAGE_KEY }
