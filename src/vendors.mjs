// 供应商中心：设置页一次配好「有哪些服务商 / 哪些模型 / 哪些 Key」，
// 聊天窗口只负责按名称分组勾选当前助手用哪个。纯函数、无 React 依赖，可直接单测。
// 安全边界：vendors 里的 API Key 只存本机，不写进云端快照；勾选出来的模型清单
// 会同步进 modelProfiles（随快照同步），因为它不含凭证。

// 常见 OpenAI 兼容服务商。只预置「名称 + 接口地址」，模型一律由用户按自己填的
// 网址实时拉取或手动添加，不再塞任何写死的默认模型（用户明确要求别出现别的默认模型）。
export const BUILTIN_VENDORS = [
  { id: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1', models: [] },
  { id: 'siliconflow', name: '硅基流动', endpoint: 'https://api.siliconflow.cn/v1', models: [] },
  { id: 'zhipu', name: '智谱 GLM', endpoint: 'https://open.bigmodel.cn/api/paas/v4', models: [] },
  { id: 'moonshot', name: '月之暗面', endpoint: 'https://api.moonshot.cn/v1', models: [] },
  { id: 'dashscope', name: '通义千问', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: [] },
  { id: 'openai', name: 'OpenAI', endpoint: 'https://api.openai.com/v1', models: [] },
  { id: 'ollama', name: 'Ollama 本地', endpoint: 'http://127.0.0.1:11434/v1', models: [] },
]

// 旧版本写死在供应商里的模型名。升级时清掉「未勾选」的预置项，
// 用户勾过或自己添加的模型原样保留，避免一升级就丢聊天可选模型。
const LEGACY_PRESET_MODELS = new Set([
  'deepseek-chat', 'deepseek-reasoner',
  'deepseek-ai/DeepSeek-V3', 'Qwen/Qwen3-8B', 'Qwen/Qwen2.5-7B-Instruct',
  'glm-4-flash', 'glm-4-plus', 'glm-4-air',
  'moonshot-v1-8k', 'moonshot-v1-32k',
  'qwen-plus', 'qwen-turbo', 'qwen-max',
  'gpt-4o-mini', 'gpt-4o', 'qwen2.5', 'llama3.1',
])

const str = (v) => String(v ?? '').trim()

export const DEFAULT_API_PATH = '/chat/completions'

// 只收相对 Base URL 的路径：'/chat/completions'、'v1/models' 都规范化成开头带 / 的形式。
export function normalizeApiPath(raw = '') {
  const s = str(raw) || DEFAULT_API_PATH
  return '/' + s.replace(/^\/+/, '').replace(/\/+$/, '')
}

function joinEndpoint(base, path) {
  const b = str(base).replace(/\/+$/, '')
  if (!b) return ''
  const p = path.startsWith('/') ? path : '/' + path
  return b.toLowerCase().endsWith(p.toLowerCase()) ? b : b + p
}

// 聊天请求真实发出去的地址（UI 里的「请求地址」预览、modelProfiles.endpoint 都用它）。
export function chatRequestUrl(vendor) {
  return joinEndpoint(vendor?.endpoint, normalizeApiPath(vendor?.apiPath))
}

// 模型列表地址：Base URL 以 /vN 结尾时补 /models，否则补 /v1/models；
// 用户可在「模型列表路径」里自定义相对路径覆盖自动推导。
export function modelListUrl(vendor) {
  // 容错：有人把完整 chat 地址粘进 Base URL 时，先剥掉末尾的 chat 路径再推导。
  const base = str(vendor?.endpoint).replace(/\/+$/, '').replace(/\/chat\/completions$/i, '')
  if (!base) return ''
  const custom = str(vendor?.modelsPath)
  const suffix = custom
    ? '/' + custom.replace(/^\/+/, '').replace(/\/+$/, '')
    : /\/v\d+(?:[.-]\w+)?$/i.test(base) ? '/models' : '/v1/models'
  return joinEndpoint(base, suffix)
}

// 把 /models 返回的模型 ID 按系列折叠分组，参考设置页「Claude Haiku / Claude Opus」那种分组。
// 纯函数，便于单测；组内保持上游返回顺序，组按名称稳定排序。
export function groupModels(ids) {
  const groups = new Map()
  for (const raw of Array.isArray(ids) ? ids : []) {
    const id = str(raw)
    if (!id) continue
    const key = modelGroupKey(id)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(id)
  }
  return [...groups].map(([key, models]) => ({ id: key, label: modelGroupLabel(key), models }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

function modelGroupKey(id) {
  const parts = id.split('/')
  if (parts.length > 1) return parts[0]
  return id.split(/[-_]/).filter(Boolean).slice(0, 2).join('-') || id
}

const GROUP_WORDS = { gpt: 'GPT', glm: 'GLM', qwen: 'Qwen', deepseek: 'DeepSeek', claude: 'Claude', ollama: 'Ollama', gemini: 'Gemini', moonshot: 'Moonshot', llama: 'Llama', mistral: 'Mistral' }
function modelGroupLabel(key) {
  return key.split(/[-_]/).filter(Boolean)
    .map(w => GROUP_WORDS[w.toLowerCase()] || (/^v?\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
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
    return { id: name, name: str(s?.name) || name, selected: !!(s && s.selected), source: str(s?.source) }
  })
  // 用户自己追加 / 已勾选的模型要保留；旧版本写死、且从未勾选过的预置模型不再出现。
  for (const [id, m] of saved) {
    if (list.some((x) => x.id === id)) continue
    if (!m.selected && LEGACY_PRESET_MODELS.has(id)) continue
    list.push({ id, name: str(m.name) || id, selected: !!m.selected, source: str(m.source) })
  }
  return list
}

// 兼容原则：旧版本没有 vendors 数据时，只给出预置「服务商 + 接口地址」，模型清单为空。
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
      apiPath: s ? str(s.apiPath) : '',
      modelsPath: s ? str(s.modelsPath) : '',
      builtin: true,
      subscription: s ? !!s.subscription : false,
      keys: s ? normalizeKeys(s.keys) : [],
      models: s ? normalizeModels(s.models, v.models) : [],
    }
  })
  const custom = (Array.isArray(raw) ? raw : [])
    .filter((v) => v && typeof v.id === 'string' && v.id && !BUILTIN_VENDORS.some((b) => b.id === v.id))
    .map((v) => ({
      id: v.id,
      name: str(v.name) || '自定义供应商',
      endpoint: str(v.endpoint),
      apiPath: str(v.apiPath),
      modelsPath: str(v.modelsPath),
      builtin: false,
      subscription: !!v.subscription,
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
  return { id: 'custom-' + Math.random().toString(36).slice(2, 10), name, endpoint, apiPath: '', modelsPath: '', builtin: false, keys: [], models: [] }
}
