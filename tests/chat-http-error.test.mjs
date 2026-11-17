import test from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { friendlyHttpError, routeInfoFromError, upstreamHint, diagnoseChatHttpError, diagnoseChatTransportError, diagnoseGptSubscriptionError } from '../src/chatHttpError.mjs'

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
  assert.match(app, /diagnoseChatHttpError\(response\.status,detail/)
  assert.match(app, /console\.warn\('\[chat\] upstream HTTP error'/)
})

test('Gemini 工具 schema 400 显示工具兼容性，而不是代理问题', () => {
  const detail=JSON.stringify({error:{message:'Invalid JSON payload received. Unknown name "dependentRequired" at tools[0].function.parameters'}})
  const msg=diagnoseChatHttpError(400,detail,{toolsEnabled:true,elapsedMs:27000})
  assert.match(msg,/工具参数兼容性/)
  assert.match(msg,/27 秒/)
  assert.doesNotMatch(msg,/代理|API Key/)
})
test('普通 400 不确定归因，带工具时提示对比测试', () => {
  const msg=diagnoseChatHttpError(400,'Bad Request',{toolsEnabled:true})
  assert.match(msg,/可能|无法仅凭/)
})
test('网络失败不会断言一定是梯子问题', () => {
  const msg=diagnoseChatTransportError(new TypeError('Failed to fetch'),{stage:'request',elapsedMs:42000,localMode:true})
  assert.match(msg,/42 秒/)
  assert.match(msg,/代理|Clash/)
  assert.match(msg,/不能直接判定/)
})
test('流式传输超时能区别连接之前和之后', () => {
  const msg=diagnoseChatTransportError(new Error('Timed out'),{stage:'stream',elapsedMs:69000})
  assert.match(msg,/流式/)
  assert.match(msg,/69 秒/)
})

test('上游 429 账户未激活应提示账单，而非限流', () => {
  const nested = JSON.stringify({error:{message:'Upstream returned HTTP 429 · {\\"error\\":{\\"message\\":\\"Your account is not active, please check your billing details\\",\\"type\\":\\"invalid_request_error\\"}}'}})
  const msg=diagnoseChatHttpError(429,nested,{elapsedMs:3500})
  assert.match(msg,/账户未激活|被停用/)
  assert.match(msg,/账单/)
  assert.doesNotMatch(msg,/稍后再试|请求过于频繁/)
  assert.doesNotMatch(msg,/\\\\"error/)
})
test('上游 429 余额不足应区别于限流', () => {
  const msg=diagnoseChatHttpError(429,JSON.stringify({error:{message:'insufficient balance'}}))
  assert.match(msg,/余额或计费/)
})
test('真正的 429 限流仍被正确识别', () => {
  const msg=diagnoseChatHttpError(429,JSON.stringify({error:{message:'rate limit exceeded'}}))
  assert.match(msg,/限流/)
})

test('GPT Codex 429 never falsely concludes ChatGPT subscription is unpaid',()=>{
  const detail=JSON.stringify({error:{message:'Your account is not active, please check your billing details.'}})
  const result=diagnoseGptSubscriptionError(429,detail,{hasAccountId:true,elapsedMs:6000})
  assert.match(result,/Codex 订阅接口/)
  assert.match(result,/不能据此判断 ChatGPT Plus 欠费/)
  assert.doesNotMatch(result,/中转账户未激活|请充值/)
})
test('missing Codex account ID suggests checking OAuth account binding',()=>{
  const result=diagnoseGptSubscriptionError(429,'Too Many Requests',{hasAccountId:false})
  assert.match(result,/账号标识/)
})
