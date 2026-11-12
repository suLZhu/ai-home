// 线路模式在真实后端入口（localBackend 的 /api/chat）上的集成验证：
// 纯执行器测的是决策，这里测的是「决策 → 响应头 → 错误体」整条链路，
// 同时确认不带 routes 的老链路依然原样透传上游 Response。
import test from 'node:test'
import assert from 'node:assert/strict'
import { localHandle } from '../src/localBackend.mjs'

const ok = (text = 'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n') =>
  new Response(text, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
const fail = (status, text = '') => new Response(text, { status, headers: { 'Content-Type': 'application/json' } })

const chatBody = {
  routes: [
    { routeId: 'a', label: '线路 A', endpoint: 'https://a.example.com/v1', model: 'gemini-a', apiKeys: ['sk-a'] },
    { routeId: 'b', label: '线路 B', endpoint: 'https://b.example.com/v1', model: 'gemini-b', apiKeys: ['sk-b'] },
  ],
  body: { model: 'gemini-2.5-pro', messages: [{ role: 'user', content: '你好' }] },
  timeZone: 'Asia/Shanghai',
}

const post = (payload) => localHandle('/api/chat', { method: 'POST', body: JSON.stringify(payload) })

test('本地后端：主线路 429 自动切备用，响应头带回实际使用线路', async (t) => {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(url)
    return calls.length === 1 ? fail(429, 'rate limited') : ok()
  }
  t.after(() => { globalThis.fetch = original })
  const res = await post(chatBody)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('X-Route-Used'), 'b')
  assert.equal(decodeURIComponent(res.headers.get('X-Route-Label') || ''), '线路 B')
  assert.match(await res.text(), /hi/)
  assert.equal(calls.length, 2)
  assert.equal(calls[1], 'https://b.example.com/v1/chat/completions')
})

test('本地后端：全部线路失败时返回 502 与逐条失败原因', async (t) => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; return fail(503, 'down') }
  t.after(() => { globalThis.fetch = original })
  const res = await post(chatBody)
  assert.equal(res.status, 502)
  const data = await res.json()
  assert.match(data.error, /所有线路/)
  assert.equal(data.routeReport.attempts.length, 2)
  assert.equal(calls, 2, '最大尝试次数生效')
  assert.equal(data.routeReport.usedRouteId, '')
})

test('本地后端：鉴权失败不换线路，直接回上游 401', async (t) => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; return fail(401, 'bad key') }
  t.after(() => { globalThis.fetch = original })
  const res = await post(chatBody)
  assert.equal(res.status, 401)
  assert.equal(calls, 1)
  const data = await res.json()
  assert.match(data.error, /HTTP 401/)
})

test('本地后端：不带 routes 的老链路仍原样透传，多 KEY 行为不回归', async (t) => {
  const original = globalThis.fetch
  const upstream = ok()
  globalThis.fetch = async () => upstream
  t.after(() => { globalThis.fetch = original })
  const res = await localHandle('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ endpoint: 'https://api.example.com/v1', apiKey: 'k', body: { model: 'm', messages: [] } }),
  })
  assert.equal(res, upstream, '老链路仍返回上游 Response 本体（不被包装）')
  assert.equal(res.headers.get('X-Route-Used'), null)
})
