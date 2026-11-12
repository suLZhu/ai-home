// 订阅账号登录后「可以选择模型」的数据层。
//
// 设计边界（很重要）：
// 1) 登录成功优先用 /api/models 拉该账号真实可用的模型；拉不到（官方订阅端点不是
//    OpenAI 兼容 /models）才退回「常用模型候选」，并且明确告诉用户这是可增删的候选，
//    不是凭空写死的默认模型。
// 2) 候选清单只是给用户点选用，用户可以取消、可以自己加模型 ID；真正进聊天模型池的
//    只有勾选过的模型（syncVendorProfiles 只收 selected:true）。
// 3) 注入的模型带 source:'subscription'，退出登录时只清这部分，用户手动加的模型保留。
// 4) 纯函数、无 React / DOM 依赖，node --test 可直接覆盖。

const str = (v) => String(v ?? '').trim()

// 各家订阅常见的模型 ID。用户可在「选择模型」里增删，这里不自动当成事实。
export const SUBSCRIPTION_MODEL_CANDIDATES = {
  gpt: ['gpt-5', 'gpt-5-mini', 'gpt-5-codex', 'gpt-4.1', 'gpt-4o', 'o3', 'o4-mini'],
  claude: ['claude-sonnet-4-6', 'claude-opus-4-1', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
  grok: ['grok-4', 'grok-4-fast', 'grok-code-fast-1', 'grok-3'],
}

export function subscriptionModelCandidates(channelId = '') {
  return (SUBSCRIPTION_MODEL_CANDIDATES[str(channelId)] || []).slice()
}

const hasControlChar = (s) => {
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) < 32) return true
  return false
}

// 模型 ID 清洗：去空、去重、去掉超长/带控制字符的脏数据，最多 200 个。
export function normalizeModelIds(values, limit = 200) {
  const raw = Array.isArray(values) ? values : (typeof values === 'string' ? values.split(/[\n,，\s]+/) : [])
  const out = []
  const seen = new Set()
  for (const v of raw) {
    if (typeof v !== 'string') continue
    const id = str(v).slice(0, 120)
    if (!id || hasControlChar(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= limit) break
  }
  return out
}

// 真实拉到的模型优先排在前面，候选补齐在后面。
export function mergeAvailableModels(fetched = [], channelId = '') {
  return normalizeModelIds([...normalizeModelIds(fetched), ...subscriptionModelCandidates(channelId)], 200)
}

// 生成供应商的 models 清单。
// picked === null/undefined 表示「用户还没选过」→ 默认全选（登录后模型面板立刻有得选）；
// picked 是数组时严格按勾选决定，空数组 = 一个都不放进模型池。
export function buildSubscriptionModels(existing, available, picked) {
  const ids = normalizeModelIds(available)
  const manual = (Array.isArray(existing) ? existing : [])
    .filter((m) => m && typeof m.id === 'string' && m.id && m.source !== 'subscription')
    .map((m) => ({ id: m.id, name: str(m.name) || m.id, selected: !!m.selected, source: '' }))

  const chosen = picked === null || picked === undefined
    ? ids.slice()
    : normalizeModelIds(picked)
  const injected = ids.map((id) => ({
    id,
    name: id,
    selected: chosen.includes(id),
    source: 'subscription',
  }))
  return [...injected, ...manual]
}

// 把模型清单写回某个供应商，并打上订阅标记（模型面板据此显示「订阅」）。
export function applySubscriptionModels(vendors, vendorId, models) {
  const id = str(vendorId)
  const list = Array.isArray(vendors) ? vendors : []
  return list.map((v) => v && v.id === id
    ? { ...v, subscription: true, models: Array.isArray(models) ? models : [] }
    : v)
}

// 退出登录：只清订阅注入的模型，用户自己加的模型与其它供应商原样保留。
export function clearSubscriptionModels(vendors, vendorId) {
  const id = str(vendorId)
  return (Array.isArray(vendors) ? vendors : []).map((v) => v && v.id === id
    ? { ...v, models: (Array.isArray(v.models) ? v.models : []).filter((m) => m?.source !== 'subscription') }
    : v)
}

// 统计某供应商当前已勾选进模型池的模型数。
export function pickedModelIds(vendor) {
  return (Array.isArray(vendor?.models) ? vendor.models : [])
    .filter((m) => m && m.selected)
    .map((m) => str(m.id))
    .filter(Boolean)
}
