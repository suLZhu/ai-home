// 线路模式下的真实请求执行器。server.mjs（Node http）与 localBackend.mjs（浏览器降级）
// 各自只负责把上游 Response 转成本方响应，选路 / 换 Key / fallback 全部共用这里。
//
// 顺序：主线路 → 备用线路；每条线路内部先按现有多 KEY 顺序换 Key。
// 线路层 429/5xx/网络错误可换线，401/403/400 不换线；总尝试次数有硬上限。
// 一旦某个上游返回 ok，立即把 Response 交回调用方并停止尝试——调用方随即开始流式透传，
// 正文已经写出后不会再回头换线路，避免聊天窗口出现两遍答案。

import { chatRequestUrl, isRetryableKeyStatus } from './vendors.mjs'
import { injectTimeContext } from './timeContext.mjs'
import {
  shouldFallbackRoute, classifyRouteFailure, isRetryableRouteError,
  createRouteReport, recordRouteAttempt, finishRouteReport, summarizeRouteReport,
} from './routeFallback.mjs'
import { MAX_ROUTE_ATTEMPTS } from './modelRoutes.mjs'

const str = (v) => String(v ?? '').trim()

export function normalizeChatRoutes(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({
      routeId: str(r.routeId) || 'route',
      label: str(r.label) || str(r.routeId) || '线路',
      endpoint: str(r.endpoint),
      chatUrl: str(r.chatUrl),
      apiPath: str(r.apiPath),
      model: str(r.model),
      apiKeys: (Array.isArray(r.apiKeys) ? r.apiKeys : []).map(str).filter(Boolean).slice(0, 6),
    }))
    .filter((r) => (r.endpoint || r.chatUrl) && r.apiKeys.length)
    .slice(0, MAX_ROUTE_ATTEMPTS)
}

// 与旧 /api/chat 完全相同的地址推导；线路额外允许 apiPath / 完整 chatUrl 覆盖。
export function routeChatTarget(r) {
  const raw = str(r.endpoint).replace(/\/+$/, '')
  if (/^https?:\/\//i.test(str(r.chatUrl))) return str(r.chatUrl)
  if (str(r.apiPath)) return chatRequestUrl({ endpoint: raw, apiPath: str(r.apiPath) })
  if (!raw) return ''
  return /\/chat\/completions$/.test(raw) ? raw : raw.endsWith('/v1') ? raw + '/chat/completions' : raw + '/v1/chat/completions'
}

// 返回值：{ ok, upstream, routeId, routeLabel, report, error, status }
export async function runRouteChat({
  routes = [], body = {}, timeZone = '', signal = null,
  fetchImpl = fetch, maxAttempts = MAX_ROUTE_ATTEMPTS, now = new Date(),
} = {}) {
  const list = normalizeChatRoutes(routes)
  if (!list.length) return { ok: false, error: '没有可用线路：请检查线路地址与 API Key', report: createRouteReport(), status: 400 }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: '缺少请求体', report: createRouteReport(), status: 400 }

  const chatBody = { ...body, messages: injectTimeContext(body.messages, now, timeZone) }
  let report = createRouteReport(str(body.model))
  const limit = Math.max(1, Math.min(MAX_ROUTE_ATTEMPTS, Math.floor(Number(maxAttempts) || MAX_ROUTE_ATTEMPTS)))

  for (let ri = 0; ri < list.length && ri < limit; ri++) {
    const r = list[ri]
    const target = routeChatTarget(r)
    if (!target || !/^https?:\/\//i.test(target)) {
      report = recordRouteAttempt(report, { routeId: r.routeId, label: r.label, status: 0, responseText: '线路地址无效' })
      continue
    }
    const payload = { ...chatBody, ...(r.model ? { model: r.model } : {}) }
    const keys = r.apiKeys
    let networkFailure = null

    for (let ki = 0; ki < keys.length; ki++) {
      let upstream
      try {
        upstream = await fetchImpl(target, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + keys[ki] },
          body: JSON.stringify(payload),
          redirect: 'error',
          ...(signal ? { signal } : {}),
        })
      } catch (error) {
        const aborted = !!(signal && signal.aborted) || (error && (error.name === 'AbortError'))
        if (aborted) {
          report = finishRouteReport(report, { failureReason: '请求已被取消' })
          return { ok: false, error: '请求已被取消', report, routeId: r.routeId, routeLabel: r.label, status: 499 }
        }
        networkFailure = error
        report = recordRouteAttempt(report, { routeId: r.routeId, label: r.label, error, aborted: false })
        // 同一条线路还有别的 Key：先换 Key，不急着换线路。
        if (ki + 1 < keys.length) continue
        break
      }

      if (upstream.ok) {
        report = recordRouteAttempt(report, { routeId: r.routeId, label: r.label, status: upstream.status, ok: true })
        report = finishRouteReport(report, { usedRouteId: r.routeId, usedRouteLabel: r.label })
        // 成功即锁定线路：调用方接下来会流式透传，此后不再尝试任何线路。
        return { ok: true, upstream, routeId: r.routeId, routeLabel: r.label, report }
      }

      const text = await upstream.text().catch(() => '')
      const aborted = !!(signal && signal.aborted)
      report = recordRouteAttempt(report, {
        routeId: r.routeId, label: r.label, status: upstream.status,
        aborted, responseText: text,
      })
      if (ki + 1 < keys.length && isRetryableKeyStatus(upstream.status)) continue
      // 配置/鉴权错误直接结束，不对整条线路再换线重试。
      if (!shouldFallbackRoute({
        status: upstream.status, aborted, responseText: text,
        attempt: ri + 1, maxAttempts: limit, remainingRoutes: list.length - ri - 1,
      })) {
        // 可重试的故障只是「没有下一条线路 / 次数用尽」→ 交给最后的汇总，
        // 带上全部线路的失败原因；鉴权或配置错误则立即按上游状态返回，不做无谓尝试。
        if (classifyRouteFailure({ status: upstream.status, aborted, responseText: text }).retryable) break
        const reason = `上游返回 HTTP ${upstream.status}${text ? ' · ' + text.slice(0, 300) : ''}`
        report = finishRouteReport(report, { failureReason: reason })
        return { ok: false, error: reason, report, routeId: r.routeId, routeLabel: r.label, status: upstream.status, responseText: text }
      }
      break
    }

    if (networkFailure) {
      const aborted = !!(signal && signal.aborted)
      if (!shouldFallbackRoute({
        error: networkFailure, aborted,
        attempt: ri + 1, maxAttempts: limit, remainingRoutes: list.length - ri - 1,
      })) {
        if (isRetryableRouteError(networkFailure, aborted)) break
        const detail = String((networkFailure.cause && networkFailure.cause.code) || networkFailure.message || '请求失败')
        const reason = '无法连接该接口：' + detail
        report = finishRouteReport(report, { failureReason: reason })
        return { ok: false, error: reason, report, routeId: r.routeId, routeLabel: r.label, status: 502 }
      }
    }
  }

  const reason = '所有线路均未能完成请求 · ' + summarizeRouteReport(report)
  report = finishRouteReport(report, { failureReason: reason })
  return { ok: false, error: reason, report, status: 502 }
}
