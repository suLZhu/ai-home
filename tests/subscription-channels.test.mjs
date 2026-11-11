import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SUBSCRIPTION_CHANNELS, SUBSCRIPTION_QUICK_TERMS, SUBSCRIPTION_STORAGE_KEY,
  channelById, searchSubscriptionChannels, normalizeSubscriptions, blankSubscription,
} from '../src/subscriptionChannels.mjs'

test('渠道目录：只保留 GPT / Claude / Grok，其余全部删掉', () => {
  assert.deepEqual(SUBSCRIPTION_CHANNELS.map(c => c.id), ['gpt', 'claude', 'grok'])
  assert.deepEqual(SUBSCRIPTION_QUICK_TERMS, ['GPT', 'Claude', 'Grok'])
  for (const [q, id] of [['gpt', 'gpt'], ['GPT', 'gpt'], ['claude', 'claude'], ['Claude', 'claude'], ['grok', 'grok'], ['GROK', 'grok'], ['openai', 'gpt'], ['codex', 'gpt']]) {
    assert.equal(searchSubscriptionChannels(q)[0]?.id, id, `搜索 ${q} 应优先命中 ${id}`)
  }
  assert.equal(searchSubscriptionChannels('').length, 3)
  assert.deepEqual(searchSubscriptionChannels('Gemini'), [])
  assert.deepEqual(searchSubscriptionChannels('硅基流动'), [])
  assert.deepEqual(searchSubscriptionChannels('自定义'), [])
  assert.deepEqual(searchSubscriptionChannels('不存在的渠道xyz'), [])
  assert.ok(searchSubscriptionChannels('gpt openai').some(c => c.id === 'gpt'))
  assert.deepEqual(searchSubscriptionChannels('gpt 智谱'), [])
})

test('渠道目录：只用官方公开地址，Claude 不预填来路不明的网址', () => {
  const allowedHosts = new Set(['api.openai.com', 'api.x.ai'])
  for (const ch of SUBSCRIPTION_CHANNELS) {
    assert.ok(ch.id && ch.name && ch.hint)
    if (!ch.endpoint) { assert.equal(ch.needsCompatibleUrl, true); continue }
    assert.ok(allowedHosts.has(new URL(ch.endpoint).hostname))
  }
  assert.equal(channelById('claude').endpoint, '')
  assert.equal(channelById('custom'), undefined)
  assert.equal(channelById('不存在'), undefined)
  assert.equal(SUBSCRIPTION_STORAGE_KEY, 'ai-home.subscriptions')
})

test('归一化：丢弃非法数据、清掉已删除渠道、默认网页登录', () => {
  const raw = [
    null, 42, { channelId: '' }, { channelId: 'nope' },
    { channelId: 'gemini' }, { channelId: 'deepseek' },
    { channelId: 'gpt', apiKey: 'sk-abc', label: '  我的号  ', loggedIn: true },
    { channelId: 'grok', endpoint: 'https://my.example/v1', availableModels: ['grok-3', '', 7], pickedModels: ['grok-3'] },
  ]
  const out = normalizeSubscriptions(raw)
  assert.equal(out.length, 2)
  assert.equal(out[0].label, '我的号')
  assert.equal(out[0].endpoint, 'https://api.openai.com/v1')
  assert.equal(out[0].vendorId, 'openai')
  assert.equal(out[0].apiKey, 'sk-abc')
  assert.equal(out[0].loginMode, 'token', '旧数据只有 Key 时自动切到令牌方式')
  assert.equal(out[1].loginMode, 'web', '新数据默认网页登录')
  assert.equal(out[1].endpoint, 'https://my.example/v1')
  assert.deepEqual(out[1].availableModels, ['grok-3'])
  assert.deepEqual(out[1].pickedModels, ['grok-3'])
})

test('归一化：重复 id 去重、网页登录方式可持久化', () => {
  const out = normalizeSubscriptions([
    { id: 'same', channelId: 'gpt' },
    { id: 'same', channelId: 'claude' },
    { id: 'same', channelId: 'grok', loginMode: 'web' },
  ])
  assert.equal(out.length, 3)
  assert.equal(new Set(out.map(x => x.id)).size, 3)
  assert.equal(out[2].loginMode, 'web')
})

test('新建订阅账号：默认网页登录、带渠道默认地址、空凭据', () => {
  const a = blankSubscription(channelById('grok'))
  assert.equal(a.loginMode, 'web')
  assert.equal(a.channelId, 'grok')
  assert.equal(a.endpoint, 'https://api.x.ai/v1')
  assert.equal(a.vendorId, 'sub-xai')
  assert.equal(a.apiKey, '')
  assert.equal(a.loggedIn, false)
  assert.deepEqual(a.availableModels, [])
  const b = blankSubscription(channelById('claude'))
  assert.equal(b.endpoint, '')
  assert.equal(b.vendorId, 'sub-anthropic')
  assert.equal(blankSubscription(null).channelId, 'gpt')
})
