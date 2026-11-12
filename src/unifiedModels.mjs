// 统一模型目录：订阅账号模型和 OpenAI-compatible API 模型在这里是同一种描述，
// 模型面板只有一个入口、一份选中逻辑；来源只是行上的一枚小标，不再是两套页面。
//
// 合并规则：以 logicalModelId() 归一后的实际 model id 为主键。
// 同一个 Gemini 在三家供应商 / 三条线路里出现，目录里仍然只有一行，
// 下面挂 routes / profileIds 供展开查看，不会在模型列表里冒出三条重复项。
//
// 兼容：没有任何显式线路时，每个 modelProfile 自动成为一条「隐含线路」，
// 老配置（订阅登录 → 勾选 → 模型面板选择 → 发送）行为完全不变。

import { logicalModelId, routesForModel } from './modelRoutes.mjs'

const str = (v) => String(v ?? '').trim()

export const CATALOG_FILTERS = ['all', 'subscription', 'api', 'multi']

function sourceOfProfile(p, subscriptionVendorIds) {
  const vid = str(p?.vendorId)
  return vid && subscriptionVendorIds.has(vid) ? 'subscription' : 'api'
}

// profiles: ModelProfile[]；vendors: Vendor[]；routes: ModelRoute[]（可选）
export function buildModelCatalog({ profiles = [], vendors = [], routes = [], subscriptionVendorIds = [] } = {}) {
  const subIds = new Set(Array.isArray(subscriptionVendorIds) ? subscriptionVendorIds : [])
  const vendorName = new Map((Array.isArray(vendors) ? vendors : []).map((v) => [str(v?.id), str(v?.name) || str(v?.id)]))
  const explicitRoutes = Array.isArray(routes) ? routes : []
  const map = new Map()

  for (const p of Array.isArray(profiles) ? profiles : []) {
    if (!p || typeof p !== 'object') continue
    const id = logicalModelId(p.model || p.name)
    if (!id) continue
    const source = sourceOfProfile(p, subIds)
    const entry = map.get(id) || {
      id,
      name: str(p.name) || str(p.model) || id,
      model: str(p.model) || id,
      profileIds: [],
      primaryProfileId: str(p.id),
      vendorIds: [],
      vendorNames: [],
      sources: [],
      endpoint: str(p.endpoint),
      routeCount: 0,
      hasExplicitRoutes: false,
    }
    if (!entry.profileIds.includes(str(p.id))) entry.profileIds.push(str(p.id))
    const vid = str(p.vendorId)
    if (vid && !entry.vendorIds.includes(vid)) {
      entry.vendorIds.push(vid)
      entry.vendorNames.push(vendorName.get(vid) || str(p.vendor) || vid)
    }
    if (!entry.sources.includes(source)) entry.sources.push(source)
    // 订阅来源优先当主显示来源；主 profile 也优先取订阅那一套，保证老链路可用。
    if (source === 'subscription' && entry.sources[0] !== 'subscription') {
      entry.sources = ['subscription', ...entry.sources.filter((s) => s !== 'subscription')]
      entry.primaryProfileId = str(p.id)
      entry.endpoint = str(p.endpoint) || entry.endpoint
    }
    map.set(id, entry)
  }

  // 显式线路：即使该模型没有任何 profile（比如用户直接给逻辑模型配了线路），也要出现在目录里。
  for (const r of explicitRoutes) {
    if (!r || !r.id) continue
    const id = logicalModelId(r.logicalId || r.model)
    if (!id) continue
    const entry = map.get(id) || {
      id, name: str(r.model) || id, model: str(r.model) || id,
      profileIds: [], primaryProfileId: '', vendorIds: [], vendorNames: [], sources: [],
      endpoint: str(r.baseUrl), routeCount: 0, hasExplicitRoutes: false,
    }
    if (!entry.sources.includes(r.source)) entry.sources.push(r.source)
    if (!entry.endpoint) entry.endpoint = str(r.baseUrl) || str(r.chatUrl)
    if (r.vendorId && !entry.vendorIds.includes(r.vendorId)) {
      entry.vendorIds.push(r.vendorId)
      entry.vendorNames.push(vendorName.get(r.vendorId) || r.vendorId)
    }
    entry.hasExplicitRoutes = true
    map.set(id, entry)
  }

  return [...map.values()].map((entry) => {
    const bound = routesForModel(explicitRoutes, entry.id)
    const implicit = entry.profileIds.length
    return {
      ...entry,
      isSubscription: entry.sources.includes('subscription'),
      isApi: entry.sources.includes('api'),
      isMultiSource: entry.sources.length > 1 || entry.profileIds.length > 1,
      routeCount: bound.length || implicit,
      routes: bound,
      implicitRouteCount: implicit,
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

export function filterCatalog(catalog, { filter = 'all', query = '', favorites = [] } = {}) {
  const q = str(query).toLowerCase()
  const favs = Array.isArray(favorites) ? favorites : []
  const list = (Array.isArray(catalog) ? catalog : []).filter((m) => {
    if (!m) return false
    if (filter === 'subscription' && !m.isSubscription) return false
    if (filter === 'api' && !m.isApi) return false
    if (filter === 'multi' && m.routeCount < 2) return false
    if (!q) return true
    return [m.name, m.model, ...(m.vendorNames || [])].some((x) => str(x).toLowerCase().includes(q))
  })
  return list.sort((a, b) => Number(favs.includes(b.id)) - Number(favs.includes(a.id)) || a.name.localeCompare(b.name))
}

// 面板里选中一个统一模型后，写回旧的 binding.modelProfileId（保持 send() 兼容）。
export function profileIdForCatalogEntry(entry) {
  return str(entry?.primaryProfileId) || (Array.isArray(entry?.profileIds) ? str(entry.profileIds[0]) : '')
}

export function catalogEntryById(catalog, id) {
  return (Array.isArray(catalog) ? catalog : []).find((m) => m && m.id === id) || null
}
