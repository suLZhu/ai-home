// 订阅聊天适配：请求转换 + 两种 SSE（Anthropic / Responses）→ Chat Completions。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  toAnthropicRequest, toResponsesRequest, convertAnthropicStream, convertResponsesStream,
  isSubscriptionProtocol, handleSubscriptionChat,
} from '../src/server/subscriptionChat.mjs'

function streamOf(text) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })
}

function sink() {
  const out = { text: '', tools: [], finish: 'stop', usage: null }
  return {
    text(delta) { out.text += delta },
    setTools(tools, finish) { out.tools = tools; out.finish = finish },
    setUsage(usage) { out.usage = usage },
    finish() {},
    result: () => out,
  }
}

const chatBody = {
  model: 'test-model',
  messages: [
    { role: 'system', content: '你是未晞' },
    { role: 'user', content: '今天天气' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'weather', arguments: '{"city":"上海"}' } }] },
    { role: 'tool', tool_call_id: 'call_1', content: '晴' },
  ],
  tools: [{ type: 'function', function: { name: 'weather', description: '天气', parameters: { type: 'object', properties: { city: { type: 'string' } } } } }],
  tool_choice: 'auto',
}

test('协议白名单', () => {
  assert.equal(isSubscriptionProtocol('codex'), true)
  assert.equal(isSubscriptionProtocol('anthropic'), true)
  assert.equal(isSubscriptionProtocol('grok'), true)
  assert.equal(isSubscriptionProtocol('openai'), false)
})

test('Anthropic 请求：system 独立、工具转 input_schema、工具结果转 tool_result', () => {
  const req = toAnthropicRequest(chatBody)
  assert.equal(req.system, '你是未晞')
  assert.equal(req.max_tokens, 8192)
  assert.equal(req.stream, true)
  assert.equal(req.messages.length, 3)
  assert.deepEqual(req.messages[0], { role: 'user', content: '今天天气' })
  assert.equal(req.messages[1].role, 'assistant')
  assert.equal(req.messages[1].content[0].type, 'tool_use')
  assert.equal(req.messages[1].content[0].name, 'weather')
  assert.deepEqual(req.messages[1].content[0].input, { city: '上海' })
  assert.equal(req.messages[2].content[0].type, 'tool_result')
  assert.equal(req.messages[2].content[0].tool_use_id, 'call_1')
  assert.equal(req.tools[0].name, 'weather')
  assert.deepEqual(req.tools[0].input_schema.properties.city, { type: 'string' })
})

test('Responses 请求：instructions / function_call / function_call_output', () => {
  const req = toResponsesRequest(chatBody)
  assert.equal(req.instructions, '你是未晞')
  assert.equal(req.stream, true)
  assert.equal(req.store, false)
  assert.equal(req.input[0].role, 'user')
  assert.equal(req.input[0].content[0].text, '今天天气')
  assert.equal(req.input[1].type, 'function_call')
  assert.equal(req.input[1].name, 'weather')
  assert.equal(req.input[2].type, 'function_call_output')
  assert.equal(req.input[2].call_id, 'call_1')
  assert.equal(req.tools[0].type, 'function')
})

test('Anthropic SSE：文本 + tool_use + usage 转成统一结果', async () => {
  const s = sink()
  const sse = [
    'event: message_start\ndata: {"type":"message_start"}\n\n',
    'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好"}}\n\n',
    'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
    'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tool_1","name":"weather","input":{}}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"city\\":\\"上海\\"}"}}\n\n',
    'event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n',
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"input_tokens":10,"output_tokens":5}}\n\n',
    'event: message_stop\ndata: {"type":"message_stop"}\n\n',
  ].join('')
  await convertAnthropicStream(streamOf(sse), s)
  const out = s.result()
  assert.equal(out.text, '你好')
  assert.equal(out.tools.length, 1)
  assert.equal(out.tools[0].id, 'tool_1')
  assert.equal(out.tools[0].name, 'weather')
  assert.deepEqual(JSON.parse(out.tools[0].args), { city: '上海' })
  assert.equal(out.usage.prompt_tokens, 10)
  assert.equal(out.usage.completion_tokens, 5)
})

test('Responses SSE：文本 + function_call 参数 + usage', async () => {
  const s = sink()
  const sse = [
    'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Hi"}\n\n',
    'event: response.output_item.added\ndata: {"type":"response.output_item.added","item":{"id":"item_1","type":"function_call","call_id":"call_1","name":"weather","arguments":""}}\n\n',
    'event: response.function_call_arguments.delta\ndata: {"type":"response.function_call_arguments.delta","item_id":"item_1","delta":"{\\"city\\":\\"上海\\"}"}\n\n',
    'event: response.completed\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":8,"output_tokens":4,"total_tokens":12}}}\n\n',
  ].join('')
  await convertResponsesStream(streamOf(sse), s)
  const out = s.result()
  assert.equal(out.text, 'Hi')
  assert.equal(out.tools.length, 1)
  assert.equal(out.tools[0].id, 'call_1')
  assert.equal(out.tools[0].name, 'weather')
  assert.deepEqual(JSON.parse(out.tools[0].args), { city: '上海' })
  assert.equal(out.usage.prompt_tokens, 8)
  assert.equal(out.usage.completion_tokens, 4)
})

test('非流式 handler：上游 SSE 聚合成 Chat Completions', async () => {
  const fakeFetch = async (url, init) => {
    assert.match(String(url), /anthropic\.com\/v1\/messages/)
    assert.match(String(init.headers.Authorization), /Bearer t/)
    return new Response(streamOf('event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"好"}}\n\n'), { status: 200 })
  }
  const result = await handleSubscriptionChat({
    protocol: 'anthropic', token: 't', body: { ...chatBody, stream: false }, res: {}, fetchImpl: fakeFetch,
  })
  assert.equal(result.status, 200)
  assert.equal(result.json.choices[0].message.content, '好')
})
