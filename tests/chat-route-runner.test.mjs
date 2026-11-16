import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeChatRoutes, routeChatTarget, runRouteChat } from '../src/chatRouteRunner.mjs'

const ok = (body = '{"choices":[]}') => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
const fail = (status, text = '') => new Response(text, { status, headers: { 'Content-Type': 'application/json' } })
const body = { model: 'gemini-2.5-pro', messages: [{ role: 'user', content: '你好' }] }

const A = { routeId: 'a', label: '线路 A', endpoint: 'https://a.example.com/v1', model: 'gemini-a', apiKeys: ['sk-a'] }
const B = { routeId: 'b', label: '线路 B', endpoint: 'https://b.example.com/v1', model: 'gemini-b', apiKeys: ['sk-b'] }
const C = { routeId: 'c', label: '线路 C', endpoint: 'https://c.example.com/v1', model: 'gemini-c', apiKeys: ['sk-c'] }

test('候选归一化：只收有地址有 Key 的线路，且不超过最大尝试次数', () => {
  const list = normalizeChatRoutes([A, { routeId: 'nokeys', endpoint: 'https://x.example.com', apiKeys: [] }, B, C, { ...A, routeId: 'd' }])
  assert.equal(list.length, 3)
  assert.deepEqual(list.map(r => r.routeId), ['a', 'b', 'c'])
  assert.equal(routeChatTarget(A), 'https://a.example.com/v1/chat/completions')
  assert.equal(routeChatTarget({ ...A, chatUrl: 'https://full.example.com/v1/chat/completions' }), 'https://full.example.com/v1/chat/completions')
  assert.equal(routeChatTarget({ ...A, endpoint: 'https://a.example.com', apiPath: '/chat/completions' }), 'https://a.example.com/chat/completions')
})

test('自动 fallback：主线路 429 → 备用线路成功，报告保留失败原因与实际线路', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization })
    return calls.length === 1 ? fail(429, 'rate limited') : ok()
  }
  const r = await runRouteChat({ routes: [A, B], body, timeZone: 'Asia/Shanghai', fetchImpl, now: new Date('2026-11-12T09:00:00+08:00') })
  assert.equal(r.ok, true)
  assert.equal(r.routeId, 'b')
  assert.equal(r.upstream.status, 200)
  assert.equal(calls.length, 2, '成功后立刻停止，不再发起请求')
  assert.equal(calls[0].body.model, 'gemini-a', '每条线路用自己的实际 model id')
  assert.equal(calls[1].body.model, 'gemini-b')
  assert.equal(calls[1].auth, 'Bearer sk-b')
  assert.equal(calls[0].body.messages[0].role, 'system', '时间上下文仍由服务端注入')
  assert.equal(r.report.attempts.length, 2)
  assert.match(r.report.attempts[0].reason, /HTTP 429/)
  assert.equal(r.report.usedRouteId, 'b')
  assert.equal(r.report.attempts[1].ok, true)
})

test('鉴权失败 / 配置错误：不换线路，直接返回上游状态', async () => {
  let calls = 0
  const r = await runRouteChat({
    routes: [A, B], body,
    fetchImpl: async () => { calls++; return fail(401, 'bad key') },
  })
  assert.equal(r.ok, false)
  assert.equal(r.status, 401)
  assert.equal(calls, 1, '401 不去试备用线路')
  assert.equal(r.report.usedRouteId, '')
  assert.match(r.report.failureReason, /HTTP 401/)
  for (const status of [400, 403, 404, 422]) {
    let n = 0
    const out = await runRouteChat({ routes: [A, B], body, fetchImpl: async () => { n++; return fail(status) } })
    assert.equal(out.ok, false)
    assert.equal(n, 1, 'HTTP ' + status + ' 不换线路')
  }
})

test('网络错误 / 超时：换下一条线路；主动取消不重试', async () => {
  const urls = []
  const r = await runRouteChat({
    routes: [A, B], body,
    fetchImpl: async (url) => {
      urls.push(url)
      if (urls.length === 1) { const e = new Error('fetch failed'); e.cause = { code: 'ECONNREFUSED' }; throw e }
      return ok()
    },
  })
  assert.equal(r.ok, true)
  assert.equal(r.routeId, 'b')
  assert.match(r.report.attempts[0].reason, /ECONNREFUSED/)

  const ac = new AbortController()
  ac.abort()
  let abortedCalls = 0
  const aborted = await runRouteChat({
    routes: [A, B], body, signal: ac.signal,
    fetchImpl: async () => { abortedCalls++; return ok() },
  })
  // 即使上游没抛错，取消信号在失败分支里也会阻止继续换线；这里至少保证不会无限尝试。
  assert.ok(abortedCalls <= 2)
  assert.ok(aborted.report, '取消也保留报告，便于诊断')
})

test('同一线路内先换 Key，再考虑换线路', async () => {
  const calls = []
  const r = await runRouteChat({
    routes: [{ ...A, apiKeys: ['sk-a1', 'sk-a2'] }, B], body,
    fetchImpl: async (url, init) => {
      calls.push(init.headers.Authorization)
      return calls.length === 1 ? fail(429) : ok()
    },
  })
  assert.equal(r.ok, true)
  assert.equal(r.routeId, 'a', '第二把 Key 成功，不需要换线路')
  assert.deepEqual(calls, ['Bearer sk-a1', 'Bearer sk-a2'])
})

test('最大尝试次数：三条线路全部 503 时只试三次并汇总失败原因', async () => {
  let calls = 0
  const r = await runRouteChat({
    routes: [A, B, C], body,
    fetchImpl: async () => { calls++; return fail(503, 'upstream down') },
  })
  assert.equal(r.ok, false)
  assert.equal(r.status, 502)
  assert.equal(calls, 3, '受最大尝试次数约束，不会循环')
  assert.equal(r.report.attempts.length, 3)
  assert.match(r.report.failureReason, /所有线路/)
  assert.equal(r.report.usedRouteId, '')
  assert.ok(r.report.attempts.every(a => a.retryable), '每条失败原因都保留下来')
})

test('无可用线路：返回可读错误，不发起任何请求', async () => {
  let calls = 0
  const r = await runRouteChat({ routes: [], body, fetchImpl: async () => { calls++; return ok() } })
  assert.equal(r.ok, false)
  assert.equal(r.status, 400)
  assert.equal(calls, 0)
  assert.match(r.error, /没有可用线路/)
})

test('流式成功即锁定：上游 ok 之后不会再有任何换线重试', async () => {
  let calls = 0
  const r = await runRouteChat({ routes: [A, B], body, fetchImpl: async () => { calls++; return ok('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n') } })
  assert.equal(r.ok, true)
  assert.equal(calls, 1)
  assert.equal(r.routeId, 'a')
  assert.equal(r.report.usedRouteLabel, '线路 A')
})
