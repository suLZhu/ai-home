import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isRetryableRouteStatus, isAuthOrConfigStatus, isRetryableRouteError,
  classifyRouteFailure, shouldFallbackRoute, createRouteReport,
  recordRouteAttempt, finishRouteReport, summarizeRouteReport,
} from '../src/routeFallback.mjs'

test('可重试的线路故障：网络/超时/408/429/部分 5xx', () => {
  for (const s of [408, 425, 429, 500, 502, 503, 504]) assert.equal(isRetryableRouteStatus(s), true, String(s))
  assert.equal(isRetryableRouteStatus(501), false, '协议不支持，换线路也没用')
  assert.equal(isRetryableRouteStatus(505), false)
  assert.equal(isRetryableRouteStatus(507), false)
})

test('鉴权失败与配置错误：不换线路，避免无限重试', () => {
  for (const s of [400, 401, 402, 403, 404, 405, 409, 413, 422]) {
    assert.equal(isAuthOrConfigStatus(s), true, String(s))
    assert.equal(isRetryableRouteStatus(s), false, String(s))
    assert.equal(classifyRouteFailure({ status: s }).retryable, false, String(s))
  }
  assert.equal(shouldFallbackRoute({ status: 401, attempt: 1, remainingRoutes: 2 }), false)
  assert.equal(shouldFallbackRoute({ status: 403, attempt: 1, remainingRoutes: 2 }), false)
  assert.equal(shouldFallbackRoute({ status: 400, attempt: 1, remainingRoutes: 2 }), false)
})

test('网络错误判重试；主动取消不算故障', () => {
  const timeout = Object.assign(new Error('fetch timeout'), { name: 'TimeoutError' })
  const offline = Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
  assert.equal(isRetryableRouteError(timeout), true)
  assert.equal(isRetryableRouteError(offline), true)
  assert.equal(isRetryableRouteError(offline, true), false)
  assert.equal(shouldFallbackRoute({ error: offline, attempt: 1, remainingRoutes: 1 }), true)
  const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' })
  assert.equal(shouldFallbackRoute({ error: aborted, aborted: true, attempt: 1, remainingRoutes: 1 }), false)
})

test('fallback 决策：可重试状态才换，且受最大尝试次数与剩余线路约束', () => {
  assert.equal(shouldFallbackRoute({ status: 429, attempt: 1, maxAttempts: 3, remainingRoutes: 2 }), true)
  assert.equal(shouldFallbackRoute({ status: 503, attempt: 2, maxAttempts: 3, remainingRoutes: 1 }), true)
  assert.equal(shouldFallbackRoute({ status: 429, attempt: 3, maxAttempts: 3, remainingRoutes: 2 }), false, '达到最大尝试次数')
  assert.equal(shouldFallbackRoute({ status: 429, attempt: 1, maxAttempts: 3, remainingRoutes: 0 }), false, '没有下一条线路')
  assert.equal(shouldFallbackRoute({ status: 0, attempt: 1, remainingRoutes: 2 }), false, '未知错误不乱重试')
})

test('流式已输出有效正文：任何故障都不换线路，避免重复生成消息', () => {
  assert.equal(shouldFallbackRoute({ status: 429, streamStarted: true, attempt: 1, remainingRoutes: 3 }), false)
  assert.equal(shouldFallbackRoute({ error: new Error('socket hang up'), streamStarted: true, attempt: 1, remainingRoutes: 3 }), false)
  assert.equal(shouldFallbackRoute({ status: 503, streamStarted: false, attempt: 1, remainingRoutes: 3 }), true)
})

test('线路报告：逐条记录失败原因、实际使用线路，并给出可读摘要', () => {
  let report = createRouteReport('gemini-2.5-pro')
  report = recordRouteAttempt(report, { routeId: 'a', label: '线路 A', status: 429, responseText: 'rate limit' })
  report = recordRouteAttempt(report, { routeId: 'b', label: '线路 B', status: 401 })
  report = recordRouteAttempt(report, { routeId: 'c', label: '线路 C', ok: true })
  report = finishRouteReport(report, { usedRouteId: 'c', usedRouteLabel: '线路 C' })
  assert.equal(report.attempts.length, 3)
  assert.equal(report.attempts[0].retryable, true)
  assert.match(report.attempts[0].reason, /HTTP 429/)
  assert.equal(report.attempts[1].retryable, false)
  assert.equal(report.attempts[2].ok, true)
  assert.equal(report.usedRouteId, 'c')
  const text = summarizeRouteReport(report)
  assert.match(text, /线路 A：上游 HTTP 429/)
  assert.match(text, /线路 C：成功/)
  assert.match(text, /实际使用 线路 C/)
})

test('失败报告：保留最后一次失败原因，供线路状态/统计后续使用', () => {
  let report = createRouteReport('gpt-4o')
  report = recordRouteAttempt(report, { routeId: 'a', label: '线路 A', status: 503 })
  report = recordRouteAttempt(report, { routeId: 'b', label: '线路 B', error: Object.assign(new Error('timeout'), { name: 'TimeoutError' }) })
  report = finishRouteReport(report, { failureReason: '所有线路均失败' })
  assert.equal(report.usedRouteId, '')
  assert.match(report.failureReason, /所有线路/)
  assert.match(report.attempts[1].reason, /timeout/)
})
