// 订阅账号渠道目录：只提供「有哪些渠道可接」以及搜索 / 归一化，不含任何 React 依赖。
// 重要边界：
// 1) 这里只放官方公开 API 地址或留空，绝不硬编码来路不明的第三方中转站网址。
// 2) 默认登录方式是「订阅号账号 + 密码」：向用户自己填的订阅接口换访问令牌，
//    之后聊天直接消耗该订阅账号的额度；令牌方式仅作为兼容保留。
//    官方 GPT / Claude 网页会员没有公开的账号密码换令牌接口，这类仍用令牌方式。
// 3) 账号、密码、令牌只写本机 localStorage（'ai-home.subscriptions' 与 vendors.keys），
//    不进云端快照。

const str = (v) => String(v ?? '').trim()

export const SUBSCRIPTION_STORAGE_KEY = 'ai-home.subscriptions'

// vendorId：复用已有内置供应商的 id，避免同一个渠道在「供应商」和「订阅账号」里
// 变成两套重复配置；内置表里没有的渠道用 'sub-' 前缀新建一条自定义供应商。
export const SUBSCRIPTION_CHANNELS = [
  {
    id: 'gpt', name: 'GPT / OpenAI', short: 'GPT', category: '国外官方',
    aliases: ['gpt', 'openai', 'chatgpt', 'o1', 'o3', 'o4', 'gpt4o', 'gpt-4o', 'sora'],
    endpoint: 'https://api.openai.com/v1', vendorId: 'openai',
    hint: 'OpenAI 官方直连；官方只发令牌，登录方式选「令牌」。', needsCompatibleUrl: false,
  },
  {
    id: 'claude', name: 'Claude / Anthropic', short: 'CL', category: '国外官方',
    aliases: ['claude', 'anthropic', 'opus', 'sonnet', 'haiku', 'claude-code', '克劳德'],
    endpoint: '', vendorId: 'sub-anthropic',
    hint: 'Anthropic 官方是 /v1/messages 格式，本应用用 OpenAI 兼容协议；请填你的订阅号或聚合平台提供的兼容地址。',
    needsCompatibleUrl: true,
  },
  {
    id: 'grok', name: 'Grok / xAI', short: 'GR', category: '国外官方',
    aliases: ['grok', 'xai', 'x.ai', 'grok-3', 'grok3', '马斯克'],
    endpoint: 'https://api.x.ai/v1', vendorId: 'sub-xai',
    hint: 'xAI 官方 OpenAI 兼容接口。', needsCompatibleUrl: false,
  },
  {
    id: 'gemini', name: 'Gemini / Google', short: 'GE', category: '国外官方',
    aliases: ['gemini', 'google', 'googleai', 'bard', 'gemini-2', '谷歌'],
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai', vendorId: 'sub-gemini',
    hint: 'Google 的 OpenAI 兼容端点。', needsCompatibleUrl: false,
  },
  {
    id: 'deepseek', name: 'DeepSeek 深度求索', short: 'DS', category: '国内官方',
    aliases: ['deepseek', '深度求索', 'ds', 'shenduqiusuo'],
    endpoint: 'https://api.deepseek.com/v1', vendorId: 'deepseek',
    hint: 'DeepSeek 官方直连。', needsCompatibleUrl: false,
  },
  {
    id: 'siliconflow', name: '硅基流动', short: '硅', category: '国内官方',
    aliases: ['siliconflow', '硅基流动', 'guijiliudong', 'sf'],
    endpoint: 'https://api.siliconflow.cn/v1', vendorId: 'siliconflow',
    hint: '一家接口里可同时用多家开源模型。', needsCompatibleUrl: false,
  },
  {
    id: 'openrouter', name: 'OpenRouter 聚合', short: 'OR', category: '聚合平台',
    aliases: ['openrouter', 'or', '聚合', 'juhe', 'router'],
    endpoint: 'https://openrouter.ai/api/v1', vendorId: 'sub-openrouter',
    hint: '聚合平台，一把令牌可用多家模型。', needsCompatibleUrl: false,
  },
  {
    id: 'moonshot', name: '月之暗面 Kimi', short: 'KI', category: '国内官方',
    aliases: ['moonshot', 'kimi', '月之暗面', 'yuezhi', 'yuezhianmian'],
    endpoint: 'https://api.moonshot.cn/v1', vendorId: 'moonshot',
    hint: 'Kimi 官方直连。', needsCompatibleUrl: false,
  },
  {
    id: 'zhipu', name: '智谱 GLM', short: 'GL', category: '国内官方',
    aliases: ['zhipu', 'glm', '智谱', 'zhipu glm', 'bigmodel', 'chipu'],
    endpoint: 'https://open.bigmodel.cn/api/paas/v4', vendorId: 'zhipu',
    hint: '智谱开放平台。', needsCompatibleUrl: false,
  },
  {
    id: 'qwen', name: '通义千问 Qwen', short: 'QW', category: '国内官方',
    aliases: ['qwen', 'dashscope', '通义千问', 'tongyiqianwen', 'tongyi', '阿里'],
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', vendorId: 'dashscope',
    hint: '阿里云百炼的 OpenAI 兼容模式。', needsCompatibleUrl: false,
  },
  {
    id: 'ollama', name: 'Ollama 本地', short: 'OL', category: '本地',
    aliases: ['ollama', '本地', 'local', 'bendi', 'llama'],
    endpoint: 'http://127.0.0.1:11434/v1', vendorId: 'ollama',
    hint: '本机模型，通常不需要令牌；随便填一个占位值即可验证。', needsCompatibleUrl: false,
  },
  {
    id: 'custom', name: '自定义订阅号', short: '＋', category: '自定义',
    aliases: ['custom', '自定义', 'zidingyi', '中转', '中转站', '订阅号', '其他', 'other', 'third-party'],
    endpoint: '', vendorId: '',
    hint: '填订阅号 / 中转站给你的兼容地址，再用账号密码登录，直接花这个账号的额度。', needsCompatibleUrl: true,
  },
]

// 搜索框下面的快捷芯片。点一下等于输入对应关键词。
export const SUBSCRIPTION_QUICK_TERMS = ['GPT', 'Claude', 'Grok', 'Gemini', 'DeepSeek', '自定义']

export function channelById(id) {
  return SUBSCRIPTION_CHANNELS.find((c) => c.id === str(id))
}

// 支持空格分词的 AND 匹配；命中 id / 别名给高分，命中说明文字给低分。
// 空关键词返回全部，方便用户不搜索时直接浏览渠道目录。
export function searchSubscriptionChannels(query = '', limit = 12) {
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
    out.push({
      id,
      channelId: x.channelId,
      label: str(x.label) || ch.name,
      endpoint: str(x.endpoint) || ch.endpoint,
      apiPath: str(x.apiPath),
      modelsPath: str(x.modelsPath),
      apiKey: str(x.apiKey),
      // 默认账号密码登录；旧数据里只有 Key 的条目自动切到令牌方式，避免一升级就要求重填。
      loginMode: x.loginMode === 'token' || (!x.loginMode && str(x.apiKey)) ? 'token' : 'password',
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
  const ch = channelById(channel?.id) || channelById('custom')
  return {
    id: 'account-' + Math.random().toString(36).slice(2, 10),
    channelId: ch.id,
    label: ch.name,
    endpoint: ch.endpoint,
    apiPath: '',
    modelsPath: '',
    apiKey: '',
    loginMode: 'password',
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
