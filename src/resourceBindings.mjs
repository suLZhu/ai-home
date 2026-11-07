// 资源库绑定层：设置区管「有哪些」，聊天窗口管「哪个助手用哪个」。
// 纯函数、无 React / DOM 依赖，便于 node --test 直接覆盖。
// 兼容原则：旧快照没有 modelProfiles / bindings 时，行为与改造前完全一致。

export function emptyBinding() {
  return { modelProfileId: '', mcpIds: null }
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
