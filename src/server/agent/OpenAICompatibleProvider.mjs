// Non-streaming OpenAI-compatible chat adapter used by the agent runner.
// The interactive chat path in server.mjs still streams raw SSE through; this
// adapter exists because a tool loop needs the whole assistant turn (including
// every tool_call) before it can execute anything.
//
// All upstream failures are wrapped as HTTP 502 with the original upstream
// status kept in `upstreamStatus`, so the caller can tell "the provider said
// no" apart from "our own request was invalid".

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 })
}

export function normalizeChatUrl(raw) {
  const trimmed = String(raw || '').trim().replace(/\/+$/, '')
  if (!trimmed) throw badRequest('请先填写 API 地址')
  if (!/^https?:\/\//i.test(trimmed)) throw badRequest('API 地址需以 http:// 或 https:// 开头')
  if (/\/chat\/completions$/.test(trimmed)) return trimmed
  if (/\/v1$/.test(trimmed)) return trimmed + '/chat/completions'
  return trimmed + '/v1/chat/completions'
}

// Providers disagree on usage field names; normalize the ones we chart later.
export function readUsage(chunk) {
  const u = chunk && typeof chunk === 'object' ? chunk.usage : null
  if (!u || typeof u !== 'object') return null
  const pick = (...names) => {
    for (const name of names) { if (Number.isFinite(u[name])) return u[name] }
    return 0
  }
  return {
    promptTokens: pick('prompt_tokens', 'input_tokens'),
    completionTokens: pick('completion_tokens', 'output_tokens'),
    cachedTokens: pick('prompt_tokens_cached', 'cache_read_input_tokens'),
    cacheReadTokens: pick('cache_creation_input_tokens'),
  }
}

export async function chat({ endpoint, apiKey, model, messages, tools, signal, fetchImpl }) {
  const doFetch = fetchImpl || fetch
  if (!String(apiKey || '').trim()) throw badRequest('缺少 API Key')
  if (!String(model || '').trim()) throw badRequest('缺少模型名称')
  const target = normalizeChatUrl(endpoint)
  const body = { model: String(model), messages, stream: false }
  if (Array.isArray(tools) && tools.length) { body.tools = tools; body.tool_choice = 'auto' }
  let upstream
  try {
    upstream = await doFetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      redirect: 'error',
      signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw Object.assign(new Error('无法连接该接口：' + (error?.cause?.code || error?.message || '请求失败')), { status: 502 })
  }
  const text = await upstream.text().catch(() => '')
  if (!upstream.ok) {
    throw Object.assign(
      new Error(`上游返回 HTTP ${upstream.status}${text ? ' · ' + text.slice(0, 300) : ''}`),
      { status: 502, upstreamStatus: upstream.status },
    )
  }
  let data
  try { data = JSON.parse(text) } catch { throw Object.assign(new Error('上游返回的不是合法 JSON'), { status: 502 }) }
  const choice = Array.isArray(data?.choices) ? data.choices[0] : null
  if (!choice) throw Object.assign(new Error('上游响应中没有 choices'), { status: 502 })
  const message = choice.message || {}
  const rawCalls = Array.isArray(message.tool_calls) ? message.tool_calls : []
  const toolCalls = []
  for (const call of rawCalls) {
    const fn = call && call.function
    if (!fn || !fn.name) continue
    toolCalls.push({ id: String(call.id || `call_${toolCalls.length}`), name: String(fn.name), arguments: String(fn.arguments || '{}') })
  }
  return {
    content: typeof message.content === 'string' ? message.content : '',
    toolCalls,
    finishReason: String(choice.finish_reason || ''),
    model: typeof data.model === 'string' ? data.model : String(model),
    usage: readUsage(data),
  }
}
