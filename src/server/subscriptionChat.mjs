// 订阅账号聊天协议适配：ChatGPT(Codex Responses) / Claude(Messages) / Grok(xAI Responses)。
// 前端仍按 OpenAI Chat Completions 发请求，这里做「请求转换 + 流式事件转回 Chat Completions」。
// 只处理文本与客户端工具调用；图片/思考回传暂不展开，失败会原样报错，不伪造成功。

const CLAUDE_BETAS = [
  'claude-code-20250219', 'oauth-2025-04-20', 'interleaved-thinking-2025-05-14',
  'redact-thinking-2026-02-12', 'context-management-2025-06-27',
  'prompt-caching-scope-2026-01-05', 'mid-conversation-system-2026-04-07',
  'advanced-tool-use-2025-11-20', 'effort-2025-11-24', 'extended-cache-ttl-2025-04-11',
].join(',')

export const SUBSCRIPTION_PROTOCOLS = ['codex', 'anthropic', 'grok']

export function isSubscriptionProtocol(value) {
  return SUBSCRIPTION_PROTOCOLS.includes(String(value || ''))
}

function textOf(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map(part => {
      if (typeof part === 'string') return part
      if (part && (part.type === 'text' || part.type === 'input_text')) return String(part.text || '')
      return ''
    }).join('')
  }
  return content == null ? '' : String(content)
}

function safeArgs(value) {
  if (typeof value === 'string') return value || '{}'
  try { return JSON.stringify(value || {}) } catch { return '{}' }
}

function convertTools(tools) {
  const list = Array.isArray(tools) ? tools : []
  return list.map(tool => {
    const fn = tool?.function || tool || {}
    const name = String(fn.name || '').trim()
    if (!name) return null
    return {
      name,
      description: String(fn.description || ''),
      parameters: fn.parameters && typeof fn.parameters === 'object' ? fn.parameters : { type: 'object', properties: {} },
    }
  }).filter(Boolean)
}

function convertToolChoice(choice, protocol) {
  if (!choice || choice === 'auto') return protocol === 'anthropic' ? { type: 'auto' } : 'auto'
  if (choice === 'required' || choice === 'any') return protocol === 'anthropic' ? { type: 'any' } : 'required'
  if (choice === 'none') return protocol === 'anthropic' ? { type: 'none' } : 'none'
  const name = choice?.function?.name || choice?.name
  if (name) return protocol === 'anthropic' ? { type: 'tool', name } : { type: 'function', name }
  return protocol === 'anthropic' ? { type: 'auto' } : 'auto'
}

/** Chat Completions messages → Anthropic Messages 请求体。 */
export function toAnthropicRequest(body = {}) {
  const messages = Array.isArray(body.messages) ? body.messages : []
  const out = []
  const systems = []
  const push = (role, content) => {
    const last = out[out.length - 1]
    if (last && last.role === role) {
      const prev = Array.isArray(last.content) ? last.content : [{ type: 'text', text: String(last.content || '') }]
      const next = Array.isArray(content) ? content : [{ type: 'text', text: String(content || '') }]
      last.content = [...prev, ...next]
    } else {
      out.push({ role, content })
    }
  }
  for (const message of messages) {
    const role = String(message?.role || '')
    if (role === 'system' || role === 'developer') { systems.push(textOf(message.content)); continue }
    if (role === 'tool') {
      push('user', [{ type: 'tool_result', tool_use_id: String(message.tool_call_id || ''), content: textOf(message.content) }])
      continue
    }
    if (role === 'assistant') {
      const content = []
      const text = textOf(message.content)
      if (text) content.push({ type: 'text', text })
      for (const call of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
        content.push({
          type: 'tool_use',
          id: String(call.id || ''),
          name: String(call.function?.name || ''),
          input: (() => { try { return JSON.parse(safeArgs(call.function?.arguments)) } catch { return {} } })(),
        })
      }
      push('assistant', content.length ? content : '')
      continue
    }
    push('user', textOf(message.content))
  }
  const request = {
    model: String(body.model || ''),
    max_tokens: Math.max(1, Number(body.max_tokens || body.max_completion_tokens) || 8192),
    messages: out,
    stream: true,
  }
  if (systems.length) {
    const dynamicIndex = systems.findIndex(text => String(text || '').startsWith('【当前时间上下文】'))
    const cacheIndex = dynamicIndex > 0 ? dynamicIndex - 1 : (dynamicIndex < 0 ? systems.length - 1 : -1)
    request.system = systems.map((text, index) => ({
      type: 'text',
      text,
      ...(index === cacheIndex ? { cache_control: { type: 'ephemeral' } } : {}),
    }))
  }
  const tools = convertTools(body.tools)
  if (tools.length) {
    request.tools = tools.map(tool => ({ name: tool.name, description: tool.description, input_schema: tool.parameters }))
    request.tool_choice = convertToolChoice(body.tool_choice, 'anthropic')
  }
  if (Number.isFinite(Number(body.temperature))) request.temperature = Number(body.temperature)
  if (Number.isFinite(Number(body.top_p))) request.top_p = Number(body.top_p)
  return request
}

/** Chat Completions messages → OpenAI/xAI Responses 请求体。 */
export function toResponsesRequest(body = {}) {
  const messages = Array.isArray(body.messages) ? body.messages : []
  const instructions = []
  const input = []
  for (const message of messages) {
    const role = String(message?.role || '')
    if (role === 'system' || role === 'developer') { instructions.push(textOf(message.content)); continue }
    if (role === 'tool') {
      input.push({ type: 'function_call_output', call_id: String(message.tool_call_id || ''), output: textOf(message.content) })
      continue
    }
    if (role === 'assistant') {
      const text = textOf(message.content)
      if (text) input.push({ role: 'assistant', content: [{ type: 'output_text', text }] })
      for (const call of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
        input.push({
          type: 'function_call',
          call_id: String(call.id || ''),
          name: String(call.function?.name || ''),
          arguments: safeArgs(call.function?.arguments),
        })
      }
      continue
    }
    input.push({ role: 'user', content: [{ type: 'input_text', text: textOf(message.content) }] })
  }
  const request = {
    model: String(body.model || ''),
    input,
    stream: true,
    store: false,
  }
  if (instructions.length) request.instructions = instructions.join('\n\n')
  const tools = convertTools(body.tools)
  if (tools.length) {
    request.tools = tools.map(tool => ({ type: 'function', name: tool.name, description: tool.description, parameters: tool.parameters }))
    request.tool_choice = convertToolChoice(body.tool_choice, 'responses')
  }
  return request
}

function sse(payload) {
  return 'data: ' + JSON.stringify(payload) + '\n\n'
}

/** 把一个上游 SSE 字节流拆成 {event,data}；兼容只有 data: 的实现。 */
export async function* sseEvents(stream) {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of stream) {
    buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
    let index
    while ((index = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)
      let event = ''
      const dataLines = []
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }
      const data = dataLines.join('\n')
      if (data) yield { event, data }
    }
  }
  const tail = buffer.trim()
  if (tail.startsWith('data:')) yield { event: '', data: tail.slice(5).trim() }
}

function toolCallChunk(tool, index) {
  return {
    index,
    id: tool.id || 'call_' + Math.random().toString(36).slice(2, 10),
    type: 'function',
    function: { name: tool.name || '', arguments: tool.args || '{}' },
  }
}

function createSink(res, streaming, model) {
  let text = ''
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, prompt_tokens_details: { cached_tokens: 0 }, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
  let finish = 'stop'
  let tools = []
  return {
    text(delta) {
      const chunk = String(delta || '')
      if (!chunk) return
      text += chunk
      if (streaming) res.write(sse({ choices: [{ index: 0, delta: { content: chunk } }] }))
    },
    setTools(list, finishReason) {
      tools = Array.isArray(list) ? list.filter(tool => tool && tool.name) : []
      if (finishReason) finish = finishReason
      if (!streaming || !tools.length) return
      res.write(sse({ choices: [{ index: 0, delta: { tool_calls: tools.map((tool, i) => toolCallChunk(tool, i)) } }] }))
    },
    setUsage(value) {
      if (!value) return
      if (value.prompt_tokens != null) usage.prompt_tokens = Number(value.prompt_tokens) || 0
      if (value.completion_tokens != null) usage.completion_tokens = Number(value.completion_tokens) || 0
      if (value.cached_tokens != null) usage.prompt_tokens_details.cached_tokens = Number(value.cached_tokens) || 0
      if (value.cache_creation_input_tokens != null) usage.cache_creation_input_tokens = Number(value.cache_creation_input_tokens) || 0
      if (value.cache_read_input_tokens != null) {
        usage.cache_read_input_tokens = Number(value.cache_read_input_tokens) || 0
        usage.prompt_tokens_details.cached_tokens = usage.cache_read_input_tokens
      }
      usage.total_tokens = value.total_tokens != null ? (Number(value.total_tokens) || 0) : usage.prompt_tokens + usage.completion_tokens
    },
    finish() {
      if (!streaming) return
      const reason = tools.length ? 'tool_calls' : finish
      res.write(sse({ choices: [{ index: 0, delta: {}, finish_reason: reason }] }))
      res.write(sse({ choices: [], usage }))
      res.write('data: [DONE]\n\n')
    },
    result() {
      const message = { role: 'assistant', content: tools.length ? null : text }
      if (tools.length) message.tool_calls = tools.map((tool, i) => ({ index: i, id: tool.id || 'call_' + i, type: 'function', function: { name: tool.name, arguments: tool.args || '{}' } }))
      return {
        id: 'chatcmpl-sub', object: 'chat.completion', created: Math.floor(Date.now() / 1000), model,
        choices: [{ index: 0, message, finish_reason: tools.length ? 'tool_calls' : finish }],
        usage,
      }
    },
  }
}

/** Anthropic Messages SSE → Chat Completions。 */
export async function convertAnthropicStream(stream, sink) {
  const tools = new Map()
  let finish = 'stop'
  for await (const { event, data } of sseEvents(stream)) {
    if (data === '[DONE]') break
    let payload
    try { payload = JSON.parse(data) } catch { continue }
    const type = payload.type || event
    if (type === 'message_start' && payload.message?.usage) {
      sink.setUsage({
        prompt_tokens: payload.message.usage.input_tokens,
        completion_tokens: payload.message.usage.output_tokens,
        cache_creation_input_tokens: payload.message.usage.cache_creation_input_tokens,
        cache_read_input_tokens: payload.message.usage.cache_read_input_tokens,
      })
    } else if (type === 'content_block_start' && payload.content_block?.type === 'tool_use') {
      tools.set(payload.index, { id: payload.content_block.id, name: payload.content_block.name, args: '' })
    } else if (type === 'content_block_delta') {
      const delta = payload.delta || {}
      if (delta.type === 'text_delta' && delta.text) sink.text(delta.text)
      else if (delta.type === 'input_json_delta' && delta.partial_json) {
        const tool = tools.get(payload.index)
        if (tool) tool.args += delta.partial_json
      }
    } else if (type === 'message_delta') {
      if (payload.delta?.stop_reason === 'tool_use') finish = 'tool_calls'
      if (payload.usage) sink.setUsage({
        prompt_tokens: payload.usage.input_tokens,
        completion_tokens: payload.usage.output_tokens,
        cache_creation_input_tokens: payload.usage.cache_creation_input_tokens,
        cache_read_input_tokens: payload.usage.cache_read_input_tokens,
      })
    } else if (type === 'message_stop') {
      break
    } else if (type === 'error') {
      throw new Error(payload.error?.message || 'Claude 返回错误')
    }
  }
  sink.setTools([...tools.values()].map(tool => ({ ...tool, args: tool.args || '{}' })), finish)
}

/** OpenAI/xAI Responses SSE → Chat Completions。 */
export async function convertResponsesStream(stream, sink) {
  const calls = new Map()
  let finish = 'stop'
  for await (const { data } of sseEvents(stream)) {
    if (data === '[DONE]') break
    let payload
    try { payload = JSON.parse(data) } catch { continue }
    const type = payload.type
    if (type === 'response.output_text.delta' && payload.delta) {
      sink.text(payload.delta)
    } else if (type === 'response.output_item.added' && payload.item?.type === 'function_call') {
      const key = payload.item.id || payload.item.call_id
      calls.set(key, { id: payload.item.call_id || payload.item.id, name: payload.item.name, args: payload.item.arguments || '' })
    } else if (type === 'response.function_call_arguments.delta' && payload.delta) {
      const call = calls.get(payload.item_id)
      if (call) call.args += payload.delta
    } else if (type === 'response.output_item.done' && payload.item?.type === 'function_call') {
      const key = payload.item.id || payload.item.call_id
      const existing = calls.get(key) || {}
      calls.set(key, {
        id: payload.item.call_id || payload.item.id || existing.id,
        name: payload.item.name || existing.name,
        args: payload.item.arguments != null ? payload.item.arguments : (existing.args || ''),
      })
    } else if (type === 'response.completed' && payload.response?.usage) {
      sink.setUsage({
        prompt_tokens: payload.response.usage.input_tokens,
        completion_tokens: payload.response.usage.output_tokens,
        total_tokens: payload.response.usage.total_tokens,
        cached_tokens: payload.response.usage.input_tokens_details?.cached_tokens,
      })
    } else if (type === 'response.failed' || type === 'error') {
      throw new Error(payload.response?.error?.message || payload.error?.message || payload.message || '订阅接口返回错误')
    }
  }
  const tools = [...calls.values()].filter(call => call.name)
  if (tools.length) finish = 'tool_calls'
  sink.setTools(tools.map(tool => ({ ...tool, args: tool.args || '{}' })), finish)
}

export function subscriptionProtocolConfig(protocol, token, accountId) {
  if (protocol === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        Authorization: 'Bearer ' + token,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': CLAUDE_BETAS,
        'anthropic-dangerous-direct-browser-access': 'true',
        'User-Agent': 'claude-cli/2.1.280 (external, cli)',
        'x-app': 'cli',
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      build: toAnthropicRequest,
      convert: convertAnthropicStream,
    }
  }
  if (protocol === 'grok') {
    return {
      url: 'https://api.x.ai/v1/responses',
      headers: {
        Authorization: 'Bearer ' + token,
        'X-XAI-Token-Auth': 'xai-grok-cli',
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'User-Agent': 'qijian/2.3',
      },
      build: toResponsesRequest,
      convert: convertResponsesStream,
    }
  }
  const headers = {
    Authorization: 'Bearer ' + token,
    // Align ChatGPT-plan traffic with the current first-party Codex client identity.
    // The backend has tightened validation over time; stale qijian/0.159 metadata can
    // authenticate and list models yet still fail on /codex/responses.
    originator: 'codex_cli_rs',
    'User-Agent': 'codex_cli_rs/0.167.1 (Qijian Android)',
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }
  if (accountId) headers['chatgpt-account-id'] = accountId
  return {
    url: 'https://chatgpt.com/backend-api/codex/responses',
    headers,
    build: toResponsesRequest,
    convert: convertResponsesStream,
  }
}

/**
 * 执行一次订阅聊天。streaming 时直接写 res 的 SSE；非流式返回 json。
 * 返回 { status, streamed, json?, error? }。
 */
export async function handleSubscriptionChat({ protocol, token, accountId = '', body, res, signal, fetchImpl = fetch }) {
  if (!isSubscriptionProtocol(protocol)) return { status: 400, error: '未知的订阅聊天协议' }
  if (!token) return { status: 400, error: '订阅令牌为空，请重新登录' }
  const config = subscriptionProtocolConfig(protocol, token, accountId)
  const request = config.build(body || {})
  const streaming = body?.stream !== false
  let upstream
  try {
    upstream = await fetchImpl(config.url, {
      method: 'POST', headers: config.headers, body: JSON.stringify(request),
      redirect: 'error', signal,
    })
  } catch (error) {
    const msg = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? '请求被中断或超时' : (error?.cause?.code || error?.message || '请求失败')
    return { status: 502, error: '无法连接订阅接口：' + msg }
  }
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '')
    return { status: upstream.status, error: '订阅接口返回 HTTP ' + upstream.status + (text ? ' · ' + text.slice(0, 400) : '') }
  }
  if (!upstream.body) return { status: 502, error: '订阅接口没有返回内容' }
  const sink = createSink(res, streaming, String(body?.model || ''))
  if (streaming) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
      'X-Accel-Buffering': 'no',
    })
  }
  try {
    await config.convert(upstream.body, sink)
    sink.finish()
  } catch (error) {
    if (streaming) {
      try { res.write(sse({ error: error instanceof Error ? error.message : '订阅接口返回错误' })); res.write('data: [DONE]\n\n') } catch { /* 连接已断开 */ }
      return { status: 200, streamed: true }
    }
    return { status: 502, error: error instanceof Error ? error.message : '订阅接口返回错误' }
  }
  return streaming ? { status: 200, streamed: true } : { status: 200, json: sink.result() }
}
