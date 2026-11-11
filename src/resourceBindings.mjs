// 资源库绑定层：设置区管「有哪些」，聊天窗口管「哪个助手用哪个」。
// 纯函数、无 React / DOM 依赖，便于 node --test 直接覆盖。
// 兼容原则：旧快照没有 modelProfiles / bindings 时，行为与改造前完全一致。

export function emptyBinding() {
  return { modelProfileId: '', mcpIds: null, keyId: '' }
}

// 「设置页勾选池」：只有被勾进池里的世界书 / MCP 条目才会在聊天窗口的图标面板出现。
// null = 尚未配置过（老数据），此时默认全部可见；数组 = 显式清单，空数组 = 一项都不放出来。
export function normalizePool(raw) {
  const o = raw && typeof raw === 'object' ? raw : {}
  return {
    worldIds: Array.isArray(o.worldIds) ? o.worldIds.filter((x) => typeof x === 'string') : null,
    mcpIds: Array.isArray(o.mcpIds) ? o.mcpIds.filter((x) => typeof x === 'string') : null,
  }
}

export function isInPool(pool, kind, id, allIds = []) {
  const list = pool && pool[kind]
  if (Array.isArray(list)) return list.includes(id)
  return (Array.isArray(allIds) ? allIds : []).includes(id)
}

// 第一次点勾选时，把「当前全部条目」固化成显式清单，再增删，避免 null 语义下取消一项就只剩一项。
export function togglePool(pool, kind, id, checked, allIds = []) {
  const base = normalizePool(pool)
  const current = Array.isArray(base[kind])
    ? base[kind].slice()
    : (Array.isArray(allIds) ? allIds : []).filter((x) => typeof x === 'string')
  const next = checked ? (current.includes(id) ? current : [...current, id]) : current.filter((x) => x !== id)
  return { ...base, [kind]: next }
}

// 编号 001 / 002 / 003……：设置页与聊天面板共用，用户说的「001 的世界书」就是它。
export function poolLabel(index) {
  return String(index + 1).padStart(3, '0')
}

export function normalizeProfiles(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((p) => p && typeof p === 'object' && typeof p.id === 'string' && p.id)
    .map((p) => ({
      id: p.id,
      name: String(p.name || '').trim() || '未命名模型',
      endpoint: String(p.endpoint || '').trim(),
      model: String(p.model || '').trim(),
      // 供应商中心勾选出来的模型带分组名，聊天窗口按名称分类显示；旧数据缺字段时为空串。
      vendor: String(p.vendor ?? ''),
      vendorId: String(p.vendorId ?? ''),
      inputPrice: String(p.inputPrice ?? ''),
      outputPrice: String(p.outputPrice ?? ''),
      cachedInputPrice: String(p.cachedInputPrice ?? ''),
      usdToCny: String(p.usdToCny ?? '7.2'),
    }))
}

export function normalizeBindings(raw, people) {
  const out = {}
  for (const id of Array.isArray(people) ? people : []) {
    const v = raw && typeof raw === 'object' ? raw[id] : null
    out[id] = {
      modelProfileId: v && typeof v.modelProfileId === 'string' ? v.modelProfileId : '',
      // null = 未设置（老数据，全部启用）；数组 = 显式选择，空数组表示全部停用。
      mcpIds: v && Array.isArray(v.mcpIds) ? v.mcpIds.filter((x) => typeof x === 'string') : null,
      // 多 KEY：助手选用供应商里的哪一把 Key；空串 = 回退旧的「每助手一份」Key。
      keyId: v && typeof v.keyId === 'string' ? v.keyId : '',
    }
  }
  return out
}

// 聊天请求用哪套模型：优先助手绑定的全局预设；未绑定或预设已删除则回退旧的 modelConfig[person]。
export function resolveModelConfig(profileId, profiles, fallback) {
  const found = normalizeProfiles(profiles).find((p) => p.id === profileId)
  if (!found) return fallback
  return {
    endpoint: found.endpoint,
    model: found.model,
    vendor: found.vendor,
    vendorId: found.vendorId,
    inputPrice: found.inputPrice,
    outputPrice: found.outputPrice,
    cachedInputPrice: found.cachedInputPrice,
    usdToCny: found.usdToCny,
  }
}

// MCP 保持服务端按 person 的隔离边界；这里只在客户端再按绑定做一层启用过滤。
export function resolveMcpConnections(connections, binding) {
  const list = (Array.isArray(connections) ? connections : []).filter((c) => c && c.enabled)
  const ids = binding && Array.isArray(binding.mcpIds) ? binding.mcpIds : null
  if (ids === null) return list
  const set = new Set(ids)
  return list.filter((c) => set.has(c.id))
}

// 世界书的绑定真源仍是 worldEntries[].boundCharacters（原本就是全局池 + 每条目绑定）。
export function isWorldEntryBound(entry, person) {
  return !!(entry && Array.isArray(entry.boundCharacters) && entry.boundCharacters.includes(person))
}

export function toggleWorldEntryBinding(entries, person, entryId, checked) {
  return (Array.isArray(entries) ? entries : []).map((e) => {
    if (e.id !== entryId) return e
    const bound = Array.isArray(e.boundCharacters) ? e.boundCharacters : []
    return {
      ...e,
      boundCharacters: checked
        ? [...bound.filter((x) => x !== person), person]
        : bound.filter((x) => x !== person),
    }
  })
}

// allIds 用于「从未设置过绑定」的首次勾选：此时 null 代表全部启用，
// 取消其中一项必须先固化成完整 id 列表，否则会误变成只启用一项。
export function toggleMcpId(binding, connectionId, checked, allIds = []) {
  const base = binding || emptyBinding()
  const current = Array.isArray(base.mcpIds)
    ? base.mcpIds
    : (Array.isArray(allIds) ? allIds.slice() : [])
  const next = checked
    ? (current.includes(connectionId) ? current.slice() : [...current, connectionId])
    : current.filter((x) => x !== connectionId)
  return { ...base, mcpIds: next }
}
