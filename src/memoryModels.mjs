// 记忆专用模型：整理模型与向量（embedding）模型各占一个槽位，和聊天模型解耦。
// 留空 = 跟随聊天模型 / 不做向量检索，保证老数据零影响。
export const MEMORY_MODELS_KEY = 'ai-home.memoryModels'

export const EMPTY_MEMORY_MODELS = { organize: { vendorId: '', model: '' }, embed: { vendorId: '', model: '' } }

function slot(raw) {
  const v = raw && typeof raw === 'object' ? raw : {}
  return { vendorId: typeof v.vendorId === 'string' ? v.vendorId : '', model: typeof v.model === 'string' ? v.model : '' }
}

export function normalizeMemoryModels(raw) {
  const v = raw && typeof raw === 'object' ? raw : {}
  return { organize: slot(v.organize), embed: slot(v.embed) }
}

export function readMemoryModels() {
  try { return normalizeMemoryModels(JSON.parse(localStorage.getItem(MEMORY_MODELS_KEY) || 'null')) } catch { return normalizeMemoryModels(null) }
}

export function writeMemoryModels(next) {
  const normalized = normalizeMemoryModels(next)
  try { localStorage.setItem(MEMORY_MODELS_KEY, JSON.stringify(normalized)) } catch { /* 私密模式忽略 */ }
  return normalized
}

function pickKey(vendor) {
  return (vendor && Array.isArray(vendor.keys) ? vendor.keys.find(k => k && k.value)?.value : '') || ''
}

function embeddingsUrl(endpoint) {
  const base = String(endpoint || '').trim().replace(/\/+$/, '')
  if (!base) return ''
  if (/\/embeddings$/.test(base)) return base
  return base.endsWith('/v1') ? base + '/embeddings' : base + '/v1/embeddings'
}

export function embeddingTarget(vendors, slotValue) {
  const vendor = (vendors || []).find(v => v && v.id === slotValue?.vendorId)
  if (!vendor || !slotValue?.model) return null
  return { endpoint: embeddingsUrl(vendor.endpoint), apiKey: pickKey(vendor), model: slotValue.model }
}

// 一次 embedding 请求：拿不到就抛错，由调用方退回关键词匹配。
export async function embedText(target, input, fetchImpl) {
  if (!target || !target.endpoint || !target.model) return null
  const doFetch = fetchImpl || fetch
  const response = await doFetch(target.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(target.apiKey ? { Authorization: 'Bearer ' + target.apiKey } : {}) },
    body: JSON.stringify({ model: target.model, input: String(input || '').slice(0, 4000) }),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error('向量模型不可用（HTTP ' + response.status + '）' + (text ? '：' + text.slice(0, 80) : ''))
  }
  const data = await response.json().catch(() => null)
  const vector = data?.data?.[0]?.embedding
  return Array.isArray(vector) && vector.length ? vector : null
}

export function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    const x = Number(a[i]) || 0, y = Number(b[i]) || 0
    dot += x * y; na += x * x; nb += y * y
  }
  if (!na || !nb) return 0
  return dot / Math.sqrt(na * nb)
}
