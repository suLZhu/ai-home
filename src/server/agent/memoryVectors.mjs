// 记忆向量：独立的纯逻辑模块，便于单测，避免把路由与实现混在同一个请求处理器里。
export function embeddingsUrl(endpoint) {
  const base = String(endpoint || '').trim().replace(/\/+$/, '')
  if (/\/embeddings$/.test(base)) return base
  return base.endsWith('/v1') ? base + '/embeddings' : base + '/v1/embeddings'
}

export async function embedTexts(config, texts) {
  if (!config?.endpoint || !config?.model) throw new Error('向量模型未配置')
  const response = await fetch(embeddingsUrl(config.endpoint), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: 'Bearer ' + config.apiKey } : {}) },
    body: JSON.stringify({ model: config.model, input: texts }),
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw new Error('向量接口返回 HTTP ' + response.status)
  const data = await response.json()
  const vectors = (data.data || []).map(item => item.embedding)
  if (vectors.length !== texts.length) throw new Error('向量接口返回数量不符')
  return vectors
}

export function encodeVector(vector) { return Buffer.from(Float32Array.from(vector).buffer) }
export function decodeVector(buffer) {
  return buffer ? Array.from(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)) : null
}

export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

export function rankByVector(rows, queryVector, { limit = 5, floor = 0.3 } = {}) {
  return rows
    .map(row => ({ row, similarity: cosine(queryVector, row.embedding) }))
    .filter(item => item.similarity >= floor)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, Math.max(1, limit))
    .map(item => ({ ...item.row, similarity: Math.round(item.similarity * 100) / 100 }))
}
