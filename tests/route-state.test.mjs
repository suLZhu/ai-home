import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeRouteState, activeLogicalId, fixedRouteId, selectLogicalModel,
  setFixedRoute, addRoute, updateRoute, removeRoute, primaryRoute, exportRouteState,
} from '../src/routeState.mjs'

const empty = () => normalizeRouteState(null)

test('线路状态：兼容空数据与只有线路数组的旧结构', () => {
  assert.deepEqual(empty(), { routes: [], active: {}, fixed: {} })
  const legacy = normalizeRouteState([{ id: 'r1', logicalId: 'gpt-4o', baseUrl: 'https://a.example.com/v1' }])
  assert.equal(legacy.routes.length, 1)
  assert.equal(legacy.routes[0].logicalId, 'gpt-4o')
  assert.deepEqual(legacy.active, {})
})

test('选中逻辑模型：换模型会解除旧的手动固定', () => {
  let s = setFixedRoute(selectLogicalModel(empty(), 'ming', 'gemini-2.5-pro'), 'ming', 'r1')
  assert.equal(activeLogicalId(s, 'ming'), 'gemini-2.5-pro')
  assert.equal(fixedRouteId(s, 'ming'), 'r1')
  s = selectLogicalModel(s, 'ming', 'gpt-4o')
  assert.equal(activeLogicalId(s, 'ming'), 'gpt-4o')
  assert.equal(fixedRouteId(s, 'ming'), '', '固定不能串到另一个模型上')
  assert.equal(activeLogicalId(s, 'other', 'fallback-model'), 'fallback-model')
})

test('线路增删：第一条自动设为主线路，删主线路后自动补位', () => {
  let s = addRoute(empty(), 'gemini-2.5-pro', { label: '线路 A', baseUrl: 'https://a.example.com/v1' }, 'r1')
  s = addRoute(s, 'gemini-2.5-pro', { label: '线路 B', baseUrl: 'https://b.example.com/v1' }, 'r2')
  assert.equal(s.routes.length, 2)
  assert.equal(s.routes[0].primary, true)
  assert.equal(s.routes[1].primary, false)
  assert.equal(s.routes[0].label, '线路 A')
  s = primaryRoute(s, 'gemini-2.5-pro', 'r2')
  assert.equal(s.routes.find(r => r.id === 'r1').primary, false)
  assert.equal(s.routes.find(r => r.id === 'r2').primary, true)
  s = removeRoute(s, 'r2')
  assert.equal(s.routes.length, 1)
  assert.equal(s.routes[0].primary, true, '删掉主线路后下一条自动补位')
})

test('线路编辑：停用 / 改地址 / 改实际 model id 都走归一化', () => {
  let s = addRoute(empty(), 'gemini-2.5-pro', { label: 'A', baseUrl: 'https://a.example.com/v1' }, 'r1')
  s = updateRoute(s, 'r1', { enabled: false, baseUrl: 'https://new.example.com/v1', model: 'gemini-new' })
  const r = s.routes[0]
  assert.equal(r.enabled, false)
  assert.equal(r.baseUrl, 'https://new.example.com/v1')
  assert.equal(r.model, 'gemini-new')
  assert.equal(r.logicalId, 'gemini-2.5-pro', '编辑不会改掉所属逻辑模型')
})

test('安全：导出 / 诊断用的线路状态不含内联 API Key', () => {
  let s = addRoute(empty(), 'gpt-4o', { label: 'A', baseUrl: 'https://a.example.com/v1', apiKey: 'sk-secret', keyId: 'key-1' }, 'r1')
  const out = exportRouteState(s)
  assert.equal(out.routes[0].apiKey, undefined)
  assert.equal(out.routes[0].keyId, 'key-1')
  assert.equal(s.routes[0].apiKey, 'sk-secret', '原状态不被就地修改')
})
