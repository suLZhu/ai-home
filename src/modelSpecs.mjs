// 单个模型的「规格」：把 Kelivo 的 ModelSpec 搬过来并精简成栖间用得上的字段。
// 一个模型能不能看图、会不会调工具、上下文多长、跑一次多少钱，都存在这里；
// 用户没填的部分按模型名推断，推断结果只作默认值，改过就以用户填的为准。
// 纯函数、无 React / 无存储依赖，方便单测。

const str = (v) => String(v ?? '').trim()
const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export const MODEL_TYPES = [
  { id: 'chat', label: '对话' },
  { id: 'embedding', label: '嵌入' },
  { id: 'image', label: '绘图' },
]

export const INPUT_MODALITIES = [
  { id: 'text', label: '文字' },
  { id: 'image', label: '图片' },
  { id: 'audio', label: '音频' },
  { id: 'video', label: '视频' },
  { id: 'pdf', label: 'PDF' },
]

export const OUTPUT_MODALITIES = [
  { id: 'text', label: '文字' },
  { id: 'image', label: '图片' },
]

export const MODEL_ABILITIES = [
  { id: 'tool', label: '工具调用' },
  { id: 'reasoning', label: '推理' },
  { id: 'structured', label: '结构化输出' },
]

// 推理方言：不同家的「思考」参数名字不一样，选错会 400，所以给用户显式可选项。
export const REASONING_DIALECTS = [
  { id: '', label: '不指定' },
  { id: 'openai', label: 'OpenAI（reasoning_effort）' },
  { id: 'deepseek', label: 'DeepSeek（thinking）' },
  { id: 'claude', label: 'Claude（thinking budget）' },
  { id: 'gemini', label: 'Gemini（thinkingConfig）' },
  { id: 'qwen', label: 'Qwen（enable_thinking）' },
  { id: 'glm', label: 'GLM（thinking）' },
  { id: 'generic', label: '通用 thinking 开关' },
]

// 思考档位：Kelivo 的「支持的级别 / 默认级别」用的就是这套。
export const REASONING_LEVELS = [
  { id: 'minimal', label: '最低' },
  { id: 'low', label: '低' },
  { id: 'medium', label: '中' },
  { id: 'high', label: '高' },
  { id: 'xhigh', label: '极高' },
  { id: 'max', label: '最大' },
]

export const REPLAY_MODES = [
  { id: 'all', label: '全部' },
  { id: 'off', label: '不回放' },
]

export const PRICING_CURRENCIES = [
  { id: 'USD', label: '美元 / 百万 tokens' },
  { id: 'CNY', label: '人民币 / 百万 tokens' },
]

export function emptyModelSpec() {
  return {
    displayName: '',
    apiModelId: '',
    type: 'chat',
    input: ['text'],
    output: ['text'],
    abilities: [],
    contextWindow: 0,
    maxOutput: 0,
    pricing: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, currency: 'USD' },
    reasoning: {
      dialect: '', levels: ['low', 'medium', 'high'], canDisable: true,
      defaultLevel: 'auto', sampling: true, replay: 'all', replayField: 'reasoning_content',
    },
    builtinTools: { codeInterpreter: false, imageGeneration: false, search: false, urlContext: false },
    headers: [],
    body: [],
  }
}

// ── 按模型名推断 ────────────────────────────────────────────────────────────
const EMBEDDING_RE = /(embed|bge[-_]|text-embedding|gte[-_]|e5[-_]|m3e|jina-embed)/i
const IMAGE_RE = /(dall-?e|gpt-image|imagen|flux|stable-diffusion|seedream|midjourney|kolors|sd-?xl|nano-banana)/i
const VISION_RE = new RegExp([
  'gpt-4o', 'gpt-4\\.1', 'gpt-5', 'gpt-4-turbo', 'gpt-4-vision', 'chatgpt-4o',
  '(?:^|[^a-z0-9])o[34](?![0-9])', 'claude', 'gemini', 'gemma-?3',
  'qwen[^,]{0,6}vl', 'qwen2\\.5-vl', 'qwen3-vl', 'qvq', 'glm-4v', 'glm-4\\.5v', 'glm-4\\.6v',
  'grok-(?:2|3|4)', 'llava', 'pixtral', 'internvl', 'minicpm-v', 'step-1v', 'yi-vl',
  'phi-3-vision', 'phi-4-multimodal', 'mistral-small-3', 'doubao[^,]{0,8}(?:vision|vl)',
].join('|'), 'i')
const AUDIO_RE = /(audio|realtime|omni|voice)/i
const TOOL_RE = /(gpt|claude|gemini|deepseek|qwen|glm|kimi|moonshot|grok|mistral|llama|doubao|ernie|hunyuan|command|nova|jamba|(?:^|[^a-z])yi(?:[^a-z]|$)|phi|(?:^|[^a-z0-9])o[1-9](?![0-9])|minimax|step-|spark)/i
const REASONING_RE = /((?:^|[^a-z0-9])o[1-9](?![0-9])|reason|thinking|(?:^|[^a-z])r1(?:[^0-9]|$)|qwq|deepseek-r|glm-?z|glm-?[45]|magistral|gpt-5|claude-(?:4|opus)|gemini-(?:2\.5|3)|qwen3)/i

const CONTEXT_BY_FAMILY = [
  [/gemini/i, 1000000],
  [/gpt-5/i, 400000],
  [/gpt-4\.1/i, 1000000],
  [/gpt-4o|chatgpt-4o|gpt-4-turbo/i, 128000],
  [/claude/i, 200000],
  [/kimi|moonshot/i, 256000],
  [/deepseek/i, 128000],
  [/qwen|qwq/i, 131072],
  [/glm/i, 128000],
  [/grok/i, 131072],
  [/llama|mistral|mixtral/i, 128000],
  [/ernie|hunyuan|doubao|step|yi|spark|minimax/i, 131072],
  [/gemma/i, 131072],
]

function contextDefault(id) {
  const hit = CONTEXT_BY_FAMILY.find(([re]) => re.test(id))
  return hit ? hit[1] : 0
}

// 推断结果只用于「用户还没填」的字段；customized=false 时 UI 会标明「按名称推断」。
export function inferModelSpec(modelId) {
  const id = str(modelId)
  const spec = emptyModelSpec()
  if (!id) return spec
  if (EMBEDDING_RE.test(id)) {
    spec.type = 'embedding'
    spec.abilities = []
    spec.input = ['text']
    spec.output = []
    return spec
  }
  if (IMAGE_RE.test(id)) {
    spec.type = 'image'
    spec.input = ['text']
    spec.output = ['image']
    spec.abilities = []
    return spec
  }
  spec.type = 'chat'
  const input = ['text']
  if (VISION_RE.test(id)) input.push('image')
  if (AUDIO_RE.test(id)) input.push('audio')
  spec.input = input
  spec.output = ['text']
  const abilities = []
  if (TOOL_RE.test(id)) abilities.push('tool')
  if (REASONING_RE.test(id)) abilities.push('reasoning')
  if (abilities.includes('tool') && /gpt|gemini|claude|deepseek|qwen|glm/i.test(id)) abilities.push('structured')
  spec.abilities = abilities
  spec.contextWindow = contextDefault(id)
  spec.reasoning = {
    dialect: abilities.includes('reasoning') ? dialectOf(id) : '',
    levels: abilities.includes('reasoning') ? ['low', 'medium', 'high'] : [],
    canDisable: true,
    defaultLevel: 'auto',
    sampling: true,
    replay: abilities.includes('reasoning') ? 'all' : 'off',
    replayField: 'reasoning_content',
  }
  return spec
}

function dialectOf(id) {
  if (/claude/i.test(id)) return 'claude'
  if (/gemini/i.test(id)) return 'gemini'
  if (/deepseek/i.test(id)) return 'deepseek'
  if (/qwen|qwq/i.test(id)) return 'qwen'
  if (/glm/i.test(id)) return 'glm'
  if (/gpt|(?:^|[^a-z0-9])o[1-9]/i.test(id)) return 'openai'
  return 'generic'
}

// ── 归一化与合并 ────────────────────────────────────────────────────────────
// 自定义 Headers / Body：只留 key 非空的键值对，避免把空行写进请求。
function normalizePairs(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((x) => x && typeof x === 'object' && str(x.key))
    .map((x) => ({ key: str(x.key).slice(0, 80), value: str(x.value).slice(0, 2000) }))
}

function normalizeList(raw, allowed) {
  const set = new Set(allowed)
  const list = (Array.isArray(raw) ? raw : []).map((x) => str(x)).filter((x) => set.has(x))
  return [...new Set(list)]
}

export function normalizeModelSpec(raw) {
  const base = emptyModelSpec()
  if (!raw || typeof raw !== 'object') return base
  const type = str(raw.type)
  base.type = MODEL_TYPES.some((t) => t.id === type) ? type : 'chat'
  base.displayName = str(raw.displayName)
  base.apiModelId = str(raw.apiModelId)
  base.input = normalizeList(raw.input, INPUT_MODALITIES.map((m) => m.id))
  if (!base.input.length && base.type === 'chat') base.input = ['text']
  base.output = normalizeList(raw.output, OUTPUT_MODALITIES.map((m) => m.id))
  if (!base.output.length && base.type === 'chat') base.output = ['text']
  base.abilities = normalizeList(raw.abilities, MODEL_ABILITIES.map((a) => a.id))
  base.contextWindow = num(raw.contextWindow)
  base.maxOutput = num(raw.maxOutput)
  const p = raw.pricing && typeof raw.pricing === 'object' ? raw.pricing : {}
  base.pricing = {
    input: num(p.input),
    output: num(p.output),
    cacheRead: num(p.cacheRead),
    cacheWrite: num(p.cacheWrite),
    currency: p.currency === 'CNY' ? 'CNY' : 'USD',
  }
  const r = raw.reasoning && typeof raw.reasoning === 'object' ? raw.reasoning : {}
  base.reasoning = {
    dialect: REASONING_DIALECTS.some((d) => d.id === str(r.dialect)) ? str(r.dialect) : '',
    levels: normalizeList(r.levels, REASONING_LEVELS.map((l) => l.id)),
    canDisable: r.canDisable !== false,
    defaultLevel: REASONING_LEVELS.some((l) => l.id === str(r.defaultLevel)) ? str(r.defaultLevel) : 'auto',
    sampling: r.sampling !== false,
    replay: r.replay === 'off' ? 'off' : 'all',
    replayField: str(r.replayField) || 'reasoning_content',
  }
  const bt = raw.builtinTools && typeof raw.builtinTools === 'object' ? raw.builtinTools : {}
  base.builtinTools = { codeInterpreter: bt.codeInterpreter === true, imageGeneration: bt.imageGeneration === true, search: bt.search === true, urlContext: bt.urlContext === true }
  base.headers = normalizePairs(raw.headers)
  base.body = normalizePairs(raw.body)
  return base
}

// 用户改过的字段 → 覆盖推断值。反过来：没改过的字段一律用推断，避免旧数据被空值锁死。
export function resolveModelSpec(modelId, overrides) {
  const inferred = inferModelSpec(modelId)
  const saved = overrides && typeof overrides === 'object' ? overrides : null
  const spec = { ...inferred }
  if (!saved) return { ...spec, customized: false }
  const clean = normalizeModelSpec(saved)
  // 只把用户真的写过的字段覆盖进来（空数组/0 可能是「明确清空」，也可能是没写，用 key 判断）。
  for (const key of ['displayName', 'apiModelId']) if (key in saved) spec[key] = clean[key]
  for (const key of ['input', 'output', 'abilities']) if (key in saved) spec[key] = clean[key]
  if ('type' in saved) spec.type = clean.type
  for (const key of ['contextWindow', 'maxOutput']) if (key in saved) spec[key] = clean[key]
  if ('pricing' in saved) spec.pricing = { ...spec.pricing, ...clean.pricing }
  if ('reasoning' in saved) spec.reasoning = { ...spec.reasoning, ...clean.reasoning }
  if ('builtinTools' in saved) spec.builtinTools = { ...spec.builtinTools, ...clean.builtinTools }
  if ('headers' in saved) spec.headers = clean.headers
  if ('body' in saved) spec.body = clean.body
  return { ...spec, customized: true }
}

// 供应商里保存的覆盖表 → 某一条模型规格。
export function specForModel(vendor, modelId) {
  const id = str(modelId)
  const overrides = vendor && typeof vendor === 'object' ? vendor.modelOverrides : null
  const raw = overrides && typeof overrides === 'object' ? overrides[id] : null
  return resolveModelSpec(id, raw)
}

export function withModelSpec(vendor, modelId, spec) {
  const id = str(modelId)
  if (!vendor || !id) return vendor
  const overrides = { ...(vendor.modelOverrides && typeof vendor.modelOverrides === 'object' ? vendor.modelOverrides : {}) }
  const clean = normalizeModelSpec(spec)
  // 和推断完全一样时删掉覆盖，保持数据干净、也方便以后改进推断规则。
  const inferred = inferModelSpec(id)
  if (JSON.stringify(clean) === JSON.stringify(inferred)) delete overrides[id]
  else overrides[id] = clean
  return { ...vendor, modelOverrides: overrides }
}

export function clearModelSpec(vendor, modelId) {
  const id = str(modelId)
  const overrides = { ...(vendor?.modelOverrides || {}) }
  delete overrides[id]
  return { ...vendor, modelOverrides: overrides }
}

// ── 展示用 ──────────────────────────────────────────────────────────────────
// 徽标：视觉 / 工具 / 推理 / 结构化 / 嵌入 / 绘图；顺序固定，最多 4 个。
export function specBadges(spec) {
  if (!spec || typeof spec !== 'object') return []
  const out = []
  if (spec.type === 'embedding') out.push({ id: 'embedding', label: '嵌入', tone: 'muted' })
  if (spec.type === 'image') out.push({ id: 'image', label: '绘图', tone: 'muted' })
  if ((spec.input || []).includes('image')) out.push({ id: 'vision', label: '视觉', tone: 'vision' })
  if ((spec.input || []).includes('audio')) out.push({ id: 'audio', label: '音频', tone: 'muted' })
  if ((spec.abilities || []).includes('tool')) out.push({ id: 'tool', label: '工具', tone: 'tool' })
  if ((spec.abilities || []).includes('reasoning')) out.push({ id: 'reasoning', label: '推理', tone: 'reasoning' })
  if ((spec.abilities || []).includes('structured')) out.push({ id: 'structured', label: '结构化', tone: 'muted' })
  return out.slice(0, 4)
}

export function formatTokens(n) {
  const v = num(n)
  if (!v) return ''
  if (v >= 1000000) return (v / 1000000).toFixed(v % 1000000 ? 1 : 0) + 'M'
  if (v >= 1000) return Math.round(v / 1000) + 'K'
  return String(v)
}

// 列表行下面那行灰字：128K 上下文 · 视觉 · 工具
export function specSummary(spec) {
  if (!spec || typeof spec !== 'object') return ''
  const parts = []
  const ctx = formatTokens(spec.contextWindow)
  if (ctx) parts.push(ctx + ' 上下文')
  const price = spec.pricing || {}
  if (num(price.input) || num(price.output)) {
    const unit = price.currency === 'CNY' ? '¥' : '$'
    parts.push('输入 ' + unit + num(price.input) + ' / 输出 ' + unit + num(price.output) + ' 每百万')
  }
  return parts.join(' · ')
}

// 模型面板/规格页共用的「显示名」：用户填了就用用户的，否则用模型 ID 的最后一段。
export function modelDisplayName(modelId, spec) {
  return str(spec?.displayName) || str(modelId)
}
