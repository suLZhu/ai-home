import test from 'node:test'
import assert from 'node:assert/strict'
import { buildModelCatalog, filterCatalog, profileIdForCatalogEntry, catalogEntryById } from '../src/unifiedModels.mjs'
import { blankRoute } from '../src/modelRoutes.mjs'

const profile = (id, model, vendor, vendorId, extra = {}) => ({
  id, name: model, model, endpoint: 'https://' + vendorId + '.example.com/v1',
  vendor, vendorId, inputPrice: '', outputPrice: '', cachedInputPrice: '', usdToCny: '7.2', ...extra,
})

test('统一模型入口：订阅账号模型和 API 模型是同一种描述，来源只是标记', () => {
  const catalog = buildModelCatalog({
    profiles: [
      profile('p-sub', 'gpt-5', 'OpenAI', 'openai'),
      profile('p-api', 'gpt-4o', 'DeepSeek', 'deepseek'),
    ],
    vendors: [{ id: 'openai', name: 'OpenAI' }, { id: 'deepseek', name: 'DeepSeek' }],
    subscriptionVendorIds: ['openai'],
  })
  assert.equal(catalog.length, 2)
  const sub = catalog.find(m => m.id === 'gpt-5')
  assert.equal(sub.isSubscription, true)
  assert.equal(sub.isApi, false)
  assert.deepEqual(sub.sources, ['subscription'])
  const api = catalog.find(m => m.id === 'gpt-4o')
  assert.equal(api.isApi, true)
  assert.equal(api.isSubscription, false)
  assert.equal(profileIdForCatalogEntry(api), 'p-api', '选中后仍写回旧的 binding.modelProfileId，老发送链路兼容')
})

test('同一个 Gemini 模型配 A/B/C 三条线路，目录里只出现一行', () => {
  const catalog = buildModelCatalog({
    profiles: [
      profile('p-a', 'gemini-2.5-pro', '线路 A', 'vendor-a'),
      profile('p-b', 'Gemini-2.5-Pro', '线路 B', 'vendor-b'),
      profile('p-c', 'google/gemini-2.5-pro', '线路 C', 'vendor-c'),
    ],
    vendors: [{ id: 'vendor-a', name: '线路 A' }, { id: 'vendor-b', name: '线路 B' }, { id: 'vendor-c', name: '线路 C' }],
    routes: [
      blankRoute('gemini-2.5-pro', { id: 'r-a', label: '线路 A', baseUrl: 'https://a.example.com/v1', apiKey: 'sk-a', primary: true }),
      blankRoute('gemini-2.5-pro', { id: 'r-b', label: '线路 B', baseUrl: 'https://b.example.com/v1', apiKey: 'sk-b' }),
      blankRoute('gemini-2.5-pro', { id: 'r-c', label: '线路 C', baseUrl: 'https://c.example.com/v1', apiKey: 'sk-c' }),
    ],
  })
  assert.equal(catalog.length, 1, '三条线路合并成一个逻辑模型，列表里不出现三个重复模型')
  const m = catalog[0]
  assert.equal(m.id, 'gemini-2.5-pro')
  assert.equal(m.routeCount, 3)
  assert.equal(m.isMultiSource, true)
  assert.equal(m.routes.length, 3)
  assert.equal(m.vendorIds.length, 3, '每条线路的来源保留')
})

test('只配了线路、没有模型预设，也照样能在统一目录里被选中', () => {
  const catalog = buildModelCatalog({
    profiles: [],
    vendors: [],
    routes: [blankRoute('claude-sonnet-4-6', { id: 'r1', source: 'subscription', baseUrl: 'https://x.example.com/v1', apiKey: 'sk-x' })],
  })
  assert.equal(catalog.length, 1)
  assert.equal(catalog[0].isSubscription, true)
  assert.equal(catalog[0].hasExplicitRoutes, true)
  assert.equal(profileIdForCatalogEntry(catalog[0]), '', '没有旧 profile 时发送链路走线路模式')
})

test('统一筛选：全部 / 订阅 / API / 多线路，收藏置顶，搜索按模型与服务商', () => {
  const catalog = buildModelCatalog({
    profiles: [
      profile('p1', 'gpt-5', 'OpenAI', 'openai'),
      profile('p2', 'gemini-2.5-pro', 'Google', 'google'),
      profile('p3', 'gemini-2.5-pro', '线路 B', 'vendor-b'),
    ],
    subscriptionVendorIds: ['openai'],
  })
  assert.equal(filterCatalog(catalog).length, 2, 'gemini 两条 profile 合并成一行')
  assert.deepEqual(filterCatalog(catalog, { filter: 'subscription' }).map(m => m.id), ['gpt-5'])
  assert.deepEqual(filterCatalog(catalog, { filter: 'api' }).map(m => m.id), ['gemini-2.5-pro'])
  assert.deepEqual(filterCatalog(catalog, { filter: 'multi' }).map(m => m.id), ['gemini-2.5-pro'])
  assert.deepEqual(filterCatalog(catalog, { query: 'GOOGLE' }).map(m => m.id), ['gemini-2.5-pro'])
  assert.deepEqual(filterCatalog(catalog, { favorites: ['gpt-5'] }).map(m => m.id), ['gpt-5', 'gemini-2.5-pro'])
  assert.equal(catalogEntryById(catalog, 'no-such'), null)
})

test('订阅模型原有流程：没有显式线路时每个预设仍是隐含线路，行为不变', () => {
  const catalog = buildModelCatalog({
    profiles: [profile('p-sub', 'gpt-5', 'OpenAI', 'openai')],
    subscriptionVendorIds: ['openai'],
    routes: [],
  })
  assert.equal(catalog[0].routeCount, 1)
  assert.equal(catalog[0].implicitRouteCount, 1)
  assert.equal(catalog[0].hasExplicitRoutes, false)
  assert.equal(profileIdForCatalogEntry(catalog[0]), 'p-sub')
})
