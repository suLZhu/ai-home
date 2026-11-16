import test from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { friendlyHttpError, routeInfoFromError, upstreamHint } from '../src/chatHttpError.mjs'

test('404 JSON 不把原始报文糊到界面', () => {
  const raw = JSON.stringify({ error: { code: 'model_not_found', message: "The model 'gpt-5-display-name' does not exist", type: 'invalid_request_error' } })
  const msg = friendlyHttpError(404, raw)
  assert.match(msg, /404/)
  assert.doesNotMatch(msg, /invalid_request_error|"error"|\{|\}/)
  assert.match(msg, /does not exist/)
})

test('畸形 JSON / HTML 错误页只给友好兜底', () => {
  assert.equal(upstreamHint('{"error": {"message": "oops"'), '')
  assert.doesNotMatch(friendlyHttpError(502, '<html><body>502 Bad Gateway</body></html>'), /<html>/)
  assert.equal(upstreamHint(''), '')
})

test('常见状态码给出可操作提示', () => {
  assert.match(friendlyHttpError(401, ''), /API Key/)
  assert.match(friendlyHttpError(403, ''), /API Key|订阅/)
  assert.match(friendlyHttpError(429, ''), /频繁|稍后|线路/)
  assert.match(friendlyHttpError(500, ''), /暂时不可用/)
  assert.match(friendlyHttpError(400, ''), /模型 ID/)
  assert.match(friendlyHttpError(504, ''), /超时/)
})

test('上游提示长度受限，线路信息也不含原始 JSON', () => {
  const raw = JSON.stringify({ error: { message: 'x'.repeat(500) } })
  assert.ok(friendlyHttpError(404, raw).length < 200)
  assert.doesNotMatch(routeInfoFromError(404, raw), /"error"/)
  assert.match(routeInfoFromError(404, raw), /^HTTP 404/)
})

test('纯文本错误会保留成一条短提示', () => {
  assert.match(friendlyHttpError(404, 'Not Found'), /Not Found/)
})

test('App.tsx 不再把上游原始报文拼进聊天错误', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(app, /接口返回 HTTP '\+response\.status/)
  assert.match(app, /friendlyHttpError\(response\.status,detail\)/)
  assert.match(app, /console\.warn\('\[chat\] upstream HTTP error'/)
})
