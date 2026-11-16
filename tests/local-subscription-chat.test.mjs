// 本地模式订阅聊天：原生流式桥 → 本地后端转换 → 前端拿到的 Chat Completions。
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { localHandle } from '../src/localBackend.mjs'
import { registerSystemHandlers } from '../src/nativeSystem.mjs'

registerSystemHandlers({})
after(() => { delete globalThis.AiHomeSystem })

function fakeBridge(sse) {
  globalThis.AiHomeSystem = {
    status: () => JSON.stringify({ sdk: 34, notifications: true, lockScreen: true, background: true, battery: true, overlay: true, exactAlarm: true, fullScreen: true, bootRestore: true, alarm: {} }),
    httpStream: (id) => {
      setTimeout(() => {
        globalThis.__aihomeHttpStream(id, JSON.stringify({ type: 'start', status: 200 }))
        globalThis.__aihomeHttpStream(id, JSON.stringify({ type: 'chunk', text: sse }))
        globalThis.__aihomeHttpStream(id, JSON.stringify({ type: 'done', status: 200 }))
      }, 0)
    },
  }
}

const sse = 'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"好"}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n'

test('本地模式：原生桥把 Anthropic SSE 转成 Chat Completions（非流式）', async () => {
  fakeBridge(sse)
  const res = await localHandle('/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      subscriptionProtocol: 'anthropic', apiKey: 'token', body: {
        model: 'claude-test', stream: false, messages: [{ role: 'user', content: '你好' }],
      },
    }),
  })
  assert.equal(res.status, 200)
  const data = await res.json()
  assert.equal(data.choices[0].message.content, '好')
})

test('本地模式：流式响应仍然逐段输出并以 [DONE] 结束', async () => {
  fakeBridge(sse)
  const res = await localHandle('/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      subscriptionProtocol: 'anthropic', apiKey: 'token', body: {
        model: 'claude-test', stream: true, messages: [{ role: 'user', content: '你好' }],
      },
    }),
  })
  assert.equal(res.status, 200)
  const text = await res.text()
  assert.match(text, /"content":"好"/)
  assert.match(text, /data: \[DONE\]/)
})

test('本地模式没有原生桥时明确拒绝，而不是假装成功', async () => {
  delete globalThis.AiHomeSystem
  const res = await localHandle('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ subscriptionProtocol: 'claude', apiKey: 'token', body: { model: 'x', messages: [] } }),
  })
  assert.equal(res.status, 400)
  const data = await res.json()
  assert.match(data.error, /原生网络桥/)
})
