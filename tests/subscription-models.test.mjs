import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SUBSCRIPTION_MODEL_CANDIDATES, subscriptionModelCandidates, normalizeModelIds,
  mergeAvailableModels, buildSubscriptionModels, applySubscriptionModels,
  clearSubscriptionModels, pickedModelIds,
} from '../src/subscriptionModels.mjs'
import { syncVendorProfiles, normalizeVendors } from '../src/vendors.mjs'

test('只有 GPT / Claude / Grok 三家订阅有候选模型，且都是可增删的清单', () => {
  assert.deepEqual(Object.keys(SUBSCRIPTION_MODEL_CANDIDATES).sort(), ['claude', 'gpt', 'grok'])
  for (const id of ['gpt', 'claude', 'grok']) {
    const list = subscriptionModelCandidates(id)
    assert.ok(list.length >= 3, id + ' 应有多个候选')
    assert.equal(new Set(list).size, list.length, id + ' 候选不应重复')
  }
  assert.deepEqual(subscriptionModelCandidates('gemini'), [])
  assert.deepEqual(subscriptionModelCandidates(''), [])
  // 返回副本，调用方改动不污染目录
  const copy = subscriptionModelCandidates('gpt'); copy.push('x')
  assert.ok(!subscriptionModelCandidates('gpt').includes('x'))
})

test('normalizeModelIds：去空去重、接受字符串、丢掉控制字符与超长项', () => {
  assert.deepEqual(normalizeModelIds([' gpt-5 ', '', 'gpt-5', 'o3']), ['gpt-5', 'o3'])
  assert.deepEqual(normalizeModelIds('gpt-5, o3\ngpt-5'), ['gpt-5', 'o3'])
  assert.deepEqual(normalizeModelIds(['bad\nid', null, 42, 'ok']), ['ok'])
  assert.deepEqual(normalizeModelIds(['a', 'b', 'c'], 2), ['a', 'b'])
})

test('mergeAvailableModels：真实拉取优先，候选补齐且不重复', () => {
  const merged = mergeAvailableModels(['gpt-5', 'my-custom-model'], 'gpt')
  assert.equal(merged[0], 'gpt-5')
  assert.equal(merged[1], 'my-custom-model')
  assert.ok(merged.includes('o3'))
  assert.equal(new Set(merged).size, merged.length)
  assert.deepEqual(mergeAvailableModels([], 'gemini'), [])
})

test('buildSubscriptionModels：没选过时默认全选，按勾选后严格按清单', () => {
  const all = buildSubscriptionModels([], ['gpt-5', 'o3'], null)
  assert.deepEqual(all.map(m => m.id), ['gpt-5', 'o3'])
  assert.ok(all.every(m => m.selected && m.source === 'subscription'))

  const some = buildSubscriptionModels([], ['gpt-5', 'o3'], ['o3'])
  assert.deepEqual(some.map(m => [m.id, m.selected]), [['gpt-5', false], ['o3', true]])

  const none = buildSubscriptionModels([], ['gpt-5'], [])
  assert.ok(none.every(m => !m.selected))
})

test('buildSubscriptionModels 保留用户手动加的模型，退出只清订阅注入的', () => {
  const existing = [
    { id: 'gpt-5', name: 'gpt-5', selected: true, source: 'subscription' },
    { id: 'my-own', name: '我的模型', selected: true },
  ]
  const built = buildSubscriptionModels(existing, ['gpt-5', 'o3'], ['gpt-5'])
  assert.deepEqual(built.map(m => m.id), ['gpt-5', 'o3', 'my-own'])
  assert.equal(built.find(m => m.id === 'my-own').selected, true)

  const vendor = { id: 'openai', models: built }
  const cleared = clearSubscriptionModels([vendor], 'openai')[0]
  assert.deepEqual(cleared.models.map(m => m.id), ['my-own'])
  assert.deepEqual(clearSubscriptionModels([{ id: 'deepseek', models: built }], 'openai')[0].models, built)
})

test('applySubscriptionModels + syncVendorProfiles：勾选的模型进聊天模型池并带供应商分组', () => {
  const vendors = [{ id: 'openai', name: 'GPT / OpenAI', endpoint: 'https://api.openai.com/v1', builtin: true, keys: [], models: [] }]
  const models = buildSubscriptionModels([], ['gpt-5', 'o3'], ['gpt-5'])
  const next = applySubscriptionModels(vendors, 'openai', models)
  assert.equal(next[0].subscription, true)
  const profiles = syncVendorProfiles(next, [])
  assert.equal(profiles.length, 1)
  assert.equal(profiles[0].model, 'gpt-5')
  assert.equal(profiles[0].vendor, 'GPT / OpenAI')
  assert.equal(profiles[0].vendorId, 'openai')
  assert.deepEqual(pickedModelIds(next[0]), ['gpt-5'])
})

test('normalizeVendors 刷新后仍保留订阅标记与模型 source', () => {
  const raw = [{
    id: 'sub-anthropic', name: 'Claude / Anthropic', endpoint: '', builtin: false,
    subscription: true, keys: [],
    models: [{ id: 'claude-sonnet-4-6', name: 'claude-sonnet-4-6', selected: true, source: 'subscription' }],
  }]
  const out = normalizeVendors(raw)
  const v = out.find(x => x.id === 'sub-anthropic')
  assert.ok(v)
  assert.equal(v.subscription, true)
  assert.equal(v.models[0].source, 'subscription')
  assert.equal(v.models[0].selected, true)
  assert.equal(syncVendorProfiles(out, []).length, 1)
})
