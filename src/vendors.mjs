// 供应商中心：设置页一次配好「有哪些服务商 / 哪些模型 / 哪些 Key」，
// 聊天窗口只负责按名称分组勾选当前助手用哪个。纯函数、无 React 依赖，可直接单测。
// 安全边界：vendors 里的 API Key 只存本机，不写进云端快照；勾选出来的模型清单
// 会同步进 modelProfiles（随快照同步），因为它不含凭证。

// 常见 OpenAI 兼容服务商。模型名按各家常驻型号列一份，用户仍可在卡片里自行追加。
export const BUILTIN_VENDORS = [
  { id: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'] },
  { id: 'siliconflow', name: '硅基流动', endpoint: 'https://api.siliconflow.cn/v1', models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen3-8B', 'Qwen/Qwen2.5-7B-Instruct'] },
  { id: 'zhipu', name: '智谱 GLM', endpoint: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4-flash', 'glm-4-plus', 'glm-4-air'] },
  { id: 'moonshot', name: '月之暗面', endpoint: 'https://api.moonshot.cn/v1', models: ['moonshot-v1-8k', 'moonshot-v1-32k'] },
  { id: 'dashscope', name: '通义千问', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-plus', 'qwen-turbo', 'qwen-max'] },
  { id: 'openai', name: 'OpenAI', endpoint: 'https://api.openai.com/v1', models: ['gpt-4o-mini', 'gpt-4o'] },
  { id: 'ollama', name: 'Ollama 本地', endpoint: 'http://127.0.0.1:11434/v1', models: ['qwen2.5', 'llama3.1'] },
]

const str = (v) => String(v ?? '').trim()

// 「添加模型」下拉目录：按供应商分组、跨组去重，本家那组排到最前。
// 自定义供应商没有预置清单，也能从这份全量目录里点选模型。
export function modelCatalog(vendorId = '') {
  const seen = new Set()
  const groups = []
  for (const v of BUILTIN_VENDORS) {
    const models = []
    for (const name of v.models) {
      if (seen.has(name)) continue
      seen.add(name)
      models.push(name)
    }
    if (models.length) groups.push({ id: v.id, label: v.name, own: v.id === vendorId, models })
  }
  return groups.sort((a, b) => Number(b.own) - Number(a.own))
}

// 多 KEY 的角色：备用优先于主号（用户要「先用备用再用主号」）。
// 旧数据没有 role 时按备注名推断，再按位置兜底：第一把主号、其余备用。
function normalizeRole(raw, label, index) {
  const r = str(raw).toLowerCase()
  if (r === 'primary' || r === 'backup') return r
  const l = str(label).toLowerCase()
  if (/备用|备号|backup|spare|secondary/.test(l)) return 'backup'
  if (/主号|主力|主|primary|main/.test(l)) return 'primary'
  return index === 0 ? 'primary' : 'backup'
}

export function keyRoleLabel(role) {
  return role === 'primary' ? '主号' : '备用'
}

// 稳定排序：备用(0) → 未分类(1) → 主号(2)，同角色保持填写顺序。
export function orderedKeys(keys) {
  const rank = (role) => role === 'backup' ? 0 : role === 'primary' ? 2 : 1
  return (Array.isArray(keys) ? keys : [])
    .map((k, i) => ({ k, i }))
    .sort((a, b) => rank(a.k?.role) - rank(b.k?.role) || a.i - b.i)
    .map((x) => x.k)
}

function normalizeKeys(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((k) => k && typeof k === 'object' && typeof k.id === 'string' && k.id)
    .map((k, index) => ({
      id: k.id,
      label: str(k.label) || 'Key',
      value: str(k.value),
      role: normalizeRole(k.role, k.label, index),
    }))
}

function normalizeModels(raw, fallback) {
  const saved = new Map(
    (Array.isArray(raw) ? raw : [])
      .filter((m) => m && typeof m === 'object' && typeof m.id === 'string' && m.id)
      .map((m) => [m.id, m]),
  )
  const list = (Array.isArray(fallback) ? fallback : []).map((name) => {
    const s = saved.get(name)
    return { id: name, name: str(s?.name) || name, selected: !!(s && s.selected) }
  })
  // 用户自己追加的模型（不在预置清单里）也要保留。
  for (const [id, m] of saved) {
    if (!list.some((x) => x.id === id)) list.push({ id, name: str(m.name) || id, selected: !!m.selected })
  }
  return list
}

// 兼容原则：旧版本没有 vendors 数据时，直接得到完整的预置清单（未勾选、无 Key）。
export function normalizeVendors(raw) {
  const saved = new Map(
    (Array.isArray(raw) ? raw : [])
      .filter((v) => v && typeof v === 'object' && typeof v.id === 'string' && v.id)
      .map((v) => [v.id, v]),
  )
  const builtins = BUILTIN_VENDORS.map((v) => {
    const s = saved.get(v.id)
    return {
      id: v.id,
      name: v.name,
      endpoint: s ? str(s.endpoint) || v.endpoint : v.endpoint,
      builtin: true,
      keys: s ? normalizeKeys(s.keys) : [],
      models: s ? normalizeModels(s.models, v.models) : v.models.map((name) => ({ id: name, name, selected: false })),
    }
  })
  const custom = (Array.isArray(raw) ? raw : [])
    .filter((v) => v && typeof v.id === 'string' && v.id && !BUILTIN_VENDORS.some((b) => b.id === v.id))
    .map((v) => ({
      id: v.id,
      name: str(v.name) || '自定义供应商',
      endpoint: str(v.endpoint),
      builtin: false,
      keys: normalizeKeys(v.keys),
      models: normalizeModels(v.models, []),
    }))
  return [...builtins, ...custom]
}

export function vendorModelProfileId(vendorId, modelId) {
  return 'vendor:' + vendorId + ':' + modelId
}

// 勾选 / 取消勾选模型后，把「可用模型池」同步进 modelProfiles。
// 手动添加的老预设（id 不以 vendor: 开头）原样保留，不会被覆盖。
export function syncVendorProfiles(vendors, profiles) {
  const manual = (Array.isArray(profiles) ? profiles : []).filter((p) => p && typeof p.id === 'string' && !p.id.startsWith('vendor:'))
  const picked = []
  for (const v of Array.isArray(vendors) ? vendors : []) {
    for (const m of Array.isArray(v.models) ? v.models : []) {
      if (!m || !m.selected) continue
      picked.push({
        id: vendorModelProfileId(v.id, m.id),
        name: str(m.name) || m.id,
        endpoint: str(v.endpoint),
        model: str(m.name) || m.id,
        vendor: str(v.name) || v.id,
        vendorId: v.id,
        inputPrice: '', outputPrice: '', cachedInputPrice: '', usdToCny: '7.2',
      })
    }
  }
  return [...picked, ...manual]
}

// 多 KEY：把所有供应商的 Key 展平成「按供应商分组」的可选列表；
// 组内按备用 → 主号排序，聊天窗口下拉看到的顺序就是实际尝试顺序。
export function allVendorKeys(vendors) {
  const out = []
  for (const v of Array.isArray(vendors) ? vendors : []) {
    for (const k of orderedKeys(normalizeKeys(v.keys))) {
      if (!k || !k.value) continue
      out.push({ id: k.id, label: k.label, role: k.role, vendorId: v.id, vendorName: v.name, value: k.value })
    }
  }
  return out
}

// 聊天请求用哪个 Key：助手绑定了某个供应商 Key 就优先用它，否则回退旧的按助手 Key。
export function resolveVendorKey(vendors, keyId) {
  if (!keyId) return ''
  const found = allVendorKeys(vendors).find((k) => k.id === keyId)
  return found ? found.value : ''
}

// 一次请求的 Key 候选队列：默认「备用优先、主号兜底」，服务端按顺序自动换下一把。
// vendorId 限定在模型所属供应商内（不同供应商的 Key 不能混用）；显式选中的 Key 提到最前。
// 旧的「按助手一份」Key 永远排在最后，保证老配置零影响。
export function resolveKeyCandidates(vendors, keyId, fallbackKey = '', vendorId = '') {
  const all = allVendorKeys(vendors)
  const scoped = vendorId ? all.filter((k) => k.vendorId === vendorId) : all.slice()
  if (keyId) {
    const i = scoped.findIndex((k) => k.id === keyId)
    if (i > 0) scoped.unshift(scoped.splice(i, 1)[0])
    else if (i < 0) {
      const found = all.find((k) => k.id === keyId)
      if (found) scoped.unshift(found)
    }
  }
  const out = []
  for (const k of scoped) if (k.value && !out.includes(k.value)) out.push(k.value)
  const fb = str(fallbackKey)
  if (fb && !out.includes(fb)) out.push(fb)
  return out.slice(0, 6)
}

// 可重试的上游状态：这些基本都是额度 / 鉴权 / 限流问题，换一把 Key 有意义。
export function isRetryableKeyStatus(status) {
  return [401, 402, 403, 408, 429, 500, 502, 503, 504].includes(Number(status))
}

// 服务端读候选队列：兼容只带单个 apiKey 的旧客户端。最多 6 把，避免无限重试。
export function readKeyCandidates(body) {
  const list = body && Array.isArray(body.apiKeys)
    ? body.apiKeys.map((k) => str(k)).filter(Boolean).slice(0, 6)
    : []
  if (list.length) return list
  const single = str(body?.apiKey)
  return single ? [single] : []
}

// 自定义供应商 / 自定义模型的空白模板。
export function blankVendor(name = '', endpoint = '') {
  return { id: 'custom-' + Math.random().toString(36).slice(2, 10), name, endpoint, builtin: false, keys: [], models: [] }
}
