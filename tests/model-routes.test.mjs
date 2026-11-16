import test from 'node:test'
import assert from 'node:assert/strict'
import {
  logicalModelId, blankRoute, normalizeRoute, normalizeRoutes, sanitizeRoutes,
  routesForModel, setPrimaryRoute, planRouteOrder, routeRequestParams, buildRoutePlan,
  blankPricing, blankStats, MAX_ROUTE_ATTEMPTS, MAX_ROUTES_PER_MODEL,
} from '../src/modelRoutes.mjs'

const route = (id, patch = {}) => blankRoute('gemini-2.5-pro', { id, label: id, ...patch })

test('逻辑模型 id：大小写 / 路径前缀归一，但不会把不同模型并到一起', () => {
  assert.equal(logicalModelId('google/Gemini-2.5-Pro'), 'gemini-2.5-pro')
  assert.equal(logicalModelId(' Gemini 2.5 Pro '), 'gemini2.5pro')
  assert.notEqual(logicalModelId('gpt-4o'), logicalModelId('gpt-4o-mini'))
  assert.equal(logicalModelId(''), '')
})

test('线路配置：字段清洗、计费与统计扩展点都有默认值', () => {
  const r = normalizeRoute({
    id: 'r1', logicalId: 'Gemini-2.5-Pro', label: '  线路 A  ',
    baseUrl: 'https://a.example.com/v1', model: 'gemini-2.5-pro',
    apiKey: 'sk-inline', priority: 5,
  })
  assert.equal(r.logicalId, 'gemini-2.5-pro')
  assert.equal(r.label, '线路 A')
  assert.equal(r.source, 'api')
  assert.equal(r.enabled, true)
  assert.equal(r.primary, false)
  assert.deepEqual(r.pricing, blankPricing())
  assert.deepEqual(r.stats, blankStats())
  assert.equal(r.pricing.inputPerM, 0, '按 token 单价字段留好，本阶段不算成本')
  assert.equal(r.pricing.rechargeDiscount, 1)
  assert.equal(r.pricing.promoExpiresAt, '')
  assert.equal(r.stats.avgLatencyMs, 0)
})

test('线路配置：脏数据、重复 id 与单模型上限', () => {
  const list = normalizeRoutes([
    null, {}, { id: 'r1', logicalId: 'gemini-2.5-pro' },
    { id: 'r1', logicalId: 'gemini-2.5-pro' },
    ...Array.from({ length: MAX_ROUTES_PER_MODEL + 4 }, (_, i) => ({ id: 'x' + i, logicalId: 'gemini-2.5-pro' })),
    { id: 'other', logicalId: 'gpt-4o' },
  ])
  assert.equal(list.filter(r => r.id === 'r1').length, 1)
  assert.equal(list.filter(r => r.logicalId === 'gemini-2.5-pro').length, MAX_ROUTES_PER_MODEL)
  assert.equal(list.filter(r => r.id === 'other').length, 1)
  assert.equal(normalizeRoute({ id: 'bad\x01id', logicalId: 'gpt-4o' }), null)
})

test('安全：内联 API Key 只在本机，导出/快照用的线路一律剥掉', () => {
  const list = [route('r1', { apiKey: 'sk-secret' }), route('r2', { keyId: 'key-1' })]
  const safe = sanitizeRoutes(list)
  assert.equal(safe[0].apiKey, undefined)
  assert.equal(safe[1].keyId, 'key-1', 'keyId 只是引用，不含明文')
  assert.equal(list[0].apiKey, 'sk-secret', '原对象不被就地修改')
})

test('主线路：同一逻辑模型下最多一条，且只影响该模型', () => {
  const list = [route('r1', { primary: false }), route('r2', { primary: true }), blankRoute('gpt-4o', { id: 'r3', primary: true })]
  const next = setPrimaryRoute(list, 'gemini-2.5-pro', 'r1')
  assert.equal(next.find(r => r.id === 'r1').primary, true)
  assert.equal(next.find(r => r.id === 'r2').primary, false)
  assert.equal(next.find(r => r.id === 'r3').primary, true)
  assert.equal(routesForModel(next, 'GEMINI-2.5-PRO').length, 2)
})

test('路由选择：主线路优先 → 优先级 → 添加顺序，停用不进队列', () => {
  const list = [
    route('c', { priority: 1 }),
    route('a', { priority: 9, primary: true }),
    route('b', { priority: -1 }),
    route('off', { priority: -99, enabled: false }),
  ]
  assert.deepEqual(planRouteOrder(list, 'gemini-2.5-pro').map(r => r.id), ['a', 'b', 'c'])
  assert.equal(planRouteOrder(list, 'gemini-2.5-pro', { maxAttempts: 2 }).length, 2)
  assert.equal(planRouteOrder(list, 'gemini-2.5-pro', { maxAttempts: MAX_ROUTE_ATTEMPTS }).length, 3)
})

test('手动固定线路：只走指定的那一条，固定了就固定了', () => {
  const list = [route('a', { primary: true }), route('b'), route('c')]
  assert.deepEqual(planRouteOrder(list, 'gemini-2.5-pro', { fixedRouteId: 'c' }).map(r => r.id), ['c'])
  assert.deepEqual(planRouteOrder(list, 'gemini-2.5-pro', { fixedRouteId: 'off' }), [])
  assert.deepEqual(planRouteOrder(list, 'gemini-2.5-pro', { fixedRouteId: 'c', maxAttempts: 3 }).map(r => r.id), ['c'])
})

test('线路请求参数：Key 引用 vendors.keys，去重，旧 Key 兜底', () => {
  const vendors = [{ id: 'v1', name: 'A', keys: [
    { id: 'key-1', label: '主号', value: 'sk-primary', role: 'primary' },
    { id: 'key-2', label: '备用', value: 'sk-backup', role: 'backup' },
  ] }]
  const p = routeRequestParams(route('r1', { keyId: 'key-1', baseUrl: 'https://a.example.com/v1', model: 'gemini-a' }), vendors, ['sk-old', 'sk-primary'])
  assert.deepEqual(p.apiKeys, ['sk-primary', 'sk-old'])
  assert.equal(p.endpoint, 'https://a.example.com/v1')
  assert.equal(p.model, 'gemini-a', '每条线路可以有自己的实际 model id')
  const inline = routeRequestParams(route('r2', { apiKey: 'sk-inline', baseUrl: 'https://b.example.com/v1' }), vendors, [])
  assert.deepEqual(inline.apiKeys, ['sk-inline'])
  const byVendor = routeRequestParams(route('r3', { vendorId: 'v1', baseUrl: 'https://c.example.com/v1' }), vendors, [])
  assert.deepEqual(byVendor.apiKeys, ['sk-primary', 'sk-backup'])
})

test('buildRoutePlan：只把「有地址且有 Key」的线路送进请求链路', () => {
  const routes = [
    route('a', { baseUrl: 'https://a.example.com/v1', apiKey: 'sk-a', primary: true }),
    route('b', { baseUrl: 'https://b.example.com/v1' }),
    route('c', { chatUrl: 'https://c.example.com/v1/chat/completions', apiKey: 'sk-c' }),
  ]
  const plan = buildRoutePlan({ routes, logicalId: 'gemini-2.5-pro', vendors: [] })
  assert.deepEqual(plan.map(r => r.routeId), ['a', 'c'])
  assert.equal(plan[0].label, 'a')
  assert.ok(plan.every(r => r.apiKeys.length > 0))
})
