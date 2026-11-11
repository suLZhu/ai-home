// 订阅账号渠道目录：只保留用户点名的 GPT / Claude / Grok 三家。
// 网页登录用官方 OAuth / 设备码流程（见 subscriptionOAuth.mjs）；凭据只落本机
// localStorage（'ai-home.subscriptions' 与 vendors.keys），不进云端快照。

const str = (v) => String(v ?? '').trim()

export const SUBSCRIPTION_STORAGE_KEY = 'ai-home.subscriptions'

// vendorId：复用已有内置供应商的 id，避免同一个渠道在「供应商」和「订阅账号」里
// 变成两套重复配置；内置表里没有的渠道用 'sub-' 前缀新建一条自定义供应商。
export const SUBSCRIPTION_CHANNELS = [
  {
    id: 'gpt', name: 'GPT / OpenAI', short: 'GPT', category: '订阅账号',
    aliases: ['gpt', 'openai', 'chatgpt', 'codex', 'o1', 'o3', 'gpt4o', 'gpt-4o', 'sora'],
    endpoint: 'https://api.openai.com/v1', vendorId: 'openai',
    hint: 'ChatGPT / Codex 订阅：用官方账号网页授权，订阅地址填兼容网关。', needsCompatibleUrl: false,
  },
  {
    id: 'claude', name: 'Claude / Anthropic', short: 'CL', category: '订阅账号',
    aliases: ['claude', 'anthropic', 'opus', 'sonnet', 'haiku', 'claude-code', '克劳德'],
    endpoint: '', vendorId: 'sub-anthropic',
    hint: 'Claude Pro / Max：走 Claude Code OAuth；官方是 /v1/messages，需填兼容网关地址。',
    needsCompatibleUrl: true,
  },
  {
    id: 'grok', name: 'Grok / xAI', short: 'GR', category: '订阅账号',
    aliases: ['grok', 'xai', 'x.ai', 'grok-3', 'grok3', '马斯克'],
    endpoint: 'https://api.x.ai/v1', vendorId: 'sub-xai',
    hint: 'Grok / X 订阅：官方 CLI 用设备码登录；也可直接填 xAI 控制台的 Key。', needsCompatibleUrl: false,
  },
]

export const SUBSCRIPTION_QUICK_TERMS = ['GPT', 'Claude', 'Grok']

export function channelById(id) {
  return SUBSCRIPTION_CHANNELS.find((c) => c.id === str(id))
}

// 支持空格分词的 AND 匹配；命中 id / 别名给高分，命中说明文字给低分。
export function searchSubscriptionChannels(query = '', limit = 3) {
  const q = str(query).toLowerCase()
  if (!q) return SUBSCRIPTION_CHANNELS.slice(0, limit)
  const terms = q.split(/\s+/).filter(Boolean)
  const scored = []
  for (const ch of SUBSCRIPTION_CHANNELS) {
    const exact = [ch.id, ...(ch.aliases || [])].map((x) => x.toLowerCase())
    const hay = [ch.id, ch.name, ch.category, ch.hint, ...(ch.aliases || [])].join(' ').toLowerCase()
    let score = 0
    let hit = true
    for (const t of terms) {
      if (exact.includes(t)) score += 10
      else if (exact.some((a) => a.startsWith(t))) score += 6
      else if (hay.includes(t)) score += 2
      else { hit = false; break }
    }
    if (hit) scored.push({ ch, score })
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.ch)
}

// 本机存储归一化：非法条目丢弃、字段补默认值、id 去重、模型清单限长。
// 已经从目录里删掉的渠道（Gemini / DeepSeek 等）在这里一并清掉。
export function normalizeSubscriptions(raw) {
  const list = Array.isArray(raw) ? raw : []
  const seen = new Set()
  const out = []
  for (const x of list) {
    if (!x || typeof x !== 'object' || typeof x.channelId !== 'string' || !x.channelId) continue
    const ch = channelById(x.channelId)
    if (!ch) continue
    let id = str(x.id) || 'sub-' + x.channelId
    if (seen.has(id)) id = id + '-' + out.length
    seen.add(id)
    const models = (v) => (Array.isArray(v) ? v : [])
      .filter((m) => typeof m === 'string' && m.trim())
      .map((m) => str(m)).slice(0, 200)
    const mode = x.loginMode === 'password' || x.loginMode === 'token' || x.loginMode === 'web'
      ? x.loginMode
      : (str(x.apiKey) ? 'token' : 'web')
    out.push({
      id,
      channelId: x.channelId,
      label: str(x.label) || ch.name,
      endpoint: str(x.endpoint) || ch.endpoint,
      apiPath: str(x.apiPath),
      modelsPath: str(x.modelsPath),
      apiKey: str(x.apiKey),
      // 默认「网页登录」；旧数据里只有 Key 的条目自动切到令牌方式。
      loginMode: mode,
      username: str(x.username),
      password: str(x.password),
      loginPath: str(x.loginPath),
      tokenPath: str(x.tokenPath),
      tokenSource: str(x.tokenSource),
      vendorId: str(x.vendorId) || ch.vendorId || ('sub-' + x.channelId),
      vendorKeyId: str(x.vendorKeyId),
      loggedIn: !!x.loggedIn,
      modelCount: Number.isFinite(Number(x.modelCount)) ? Math.max(0, Number(x.modelCount)) : 0,
      lastVerified: str(x.lastVerified),
      availableModels: models(x.availableModels),
      pickedModels: models(x.pickedModels),
    })
  }
  return out
}

export function blankSubscription(channel) {
  const ch = channelById(channel?.id) || channelById('gpt')
  return {
    id: 'account-' + Math.random().toString(36).slice(2, 10),
    channelId: ch.id,
    label: ch.name,
    endpoint: ch.endpoint,
    apiPath: '',
    modelsPath: '',
    apiKey: '',
    loginMode: 'web',
    username: '',
    password: '',
    loginPath: '',
    tokenPath: '',
    tokenSource: '',
    vendorId: ch.vendorId || ('sub-' + ch.id),
    vendorKeyId: '',
    loggedIn: false,
    modelCount: 0,
    lastVerified: '',
    availableModels: [],
    pickedModels: [],
  }
}
