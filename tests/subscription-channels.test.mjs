import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SUBSCRIPTION_CHANNELS, SUBSCRIPTION_QUICK_TERMS, SUBSCRIPTION_STORAGE_KEY,
  channelById, searchSubscriptionChannels, normalizeSubscriptions, blankSubscription,
} from '../src/subscriptionChannels.mjs'

test('渠道目录：用户点名的 GPT / Claude / Grok 都能搜到', () => {
  for (const [q, id] of [['gpt', 'gpt'], ['GPT', 'gpt'], ['claude', 'claude'], ['Claude', 'claude'], ['grok', 'grok'], ['GROK', 'grok']]) {
    const found = searchSubscriptionChannels(q)
    assert.equal(found[0]?.id, id, `搜索 ${q} 应优先命中 ${id}`)
  }
  assert.ok(SUBSCRIPTION_QUICK_TERMS.includes('GPT'))
  assert.ok(SUBSCRIPTION_QUICK_TERMS.includes('Claude'))
  assert.ok(SUBSCRIPTION_QUICK_TERMS.includes('Grok'))
})

test('渠道目录：中文名 / 拼音 / 别名 / 空关键词 / 无结果', () => {
  assert.equal(searchSubscriptionChannels('硅基流动')[0]?.id, 'siliconflow')
  assert.equal(searchSubscriptionChannels('guijiliudong')[0]?.id, 'siliconflow')
  assert.equal(searchSubscriptionChannels('Kimi')[0]?.id, 'moonshot')
  assert.equal(searchSubscriptionChannels('openai')[0]?.id, 'gpt')
  assert.equal(searchSubscriptionChannels('中转站')[0]?.id, 'custom')
  assert.equal(searchSubscriptionChannels('').length, SUBSCRIPTION_CHANNELS.length)
  assert.deepEqual(searchSubscriptionChannels('不存在的渠道xyz'), [])
  // 多词 AND：只命中同时包含两个词的渠道
  assert.ok(searchSubscriptionChannels('gpt openai').some((c) => c.id === 'gpt'))
  assert.deepEqual(searchSubscriptionChannels('gpt 智谱'), [])
})

test('渠道目录：只使用官方公开地址，Claude 与自定义不预填来路不明的网址', () => {
  const allowedHosts = new Set([
    'api.openai.com', 'api.x.ai', 'generativelanguage.googleapis.com',
    'api.deepseek.com', 'api.siliconflow.cn', 'openrouter.ai',
    'api.moonshot.cn', 'open.bigmodel.cn', 'dashscope.aliyuncs.com', '127.0.0.1',
  ])
  for (const ch of SUBSCRIPTION_CHANNELS) {
    assert.ok(ch.id && ch.name && ch.hint, '每个渠道都要有 id / 名称 / 说明')
    if (!ch.endpoint) {
      assert.equal(ch.needsCompatibleUrl, true, `${ch.id} 没预填地址时必须标注需要兼容地址`)
      continue
    }
    const u = new URL(ch.endpoint)
    assert.ok(allowedHosts.has(u.hostname), `${ch.id} 的地址 ${u.hostname} 不在官方白名单里`)
  }
  assert.equal(channelById('claude').endpoint, '')
  assert.equal(channelById('custom').endpoint, '')
  assert.equal(channelById('不存在'), undefined)
  assert.equal(SUBSCRIPTION_STORAGE_KEY, 'ai-home.subscriptions')
})

test('订阅账号归一化：丢弃非法数据并补默认值', () => {
  const raw = [
    null, 42, { channelId: '' }, { channelId: 'nope' },
    { channelId: 'gpt', apiKey: 'sk-abc', label: '  我的号  ', loggedIn: true },
    { channelId: 'grok', endpoint: 'https://my.example/v1', availableModels: ['grok-3', '', 7], pickedModels: ['grok-3'] },
  ]
  const out = normalizeSubscriptions(raw)
  assert.equal(out.length, 2)
  assert.equal(out[0].label, '我的号')
  assert.equal(out[0].endpoint, 'https://api.openai.com/v1')
  assert.equal(out[0].vendorId, 'openai')
  assert.equal(out[0].apiKey, 'sk-abc')
  assert.equal(out[0].loggedIn, true)
  assert.deepEqual(out[1].availableModels, ['grok-3'])
  assert.deepEqual(out[1].pickedModels, ['grok-3'])
  assert.equal(out[1].endpoint, 'https://my.example/v1')
  assert.equal(out[1].modelCount, 0)
  assert.equal(out[1].loggedIn, false)
})

test('订阅账号归一化：重复 id 自动去重', () => {
  const out = normalizeSubscriptions([
    { id: 'same', channelId: 'gpt' },
    { id: 'same', channelId: 'claude' },
    { id: 'same', channelId: 'grok' },
  ])
  assert.equal(out.length, 3)
  assert.equal(new Set(out.map((x) => x.id)).size, 3)
})

test('新建订阅账号：带渠道默认地址、未登录、空凭据', () => {
  const a = blankSubscription(channelById('grok'))
  assert.equal(a.channelId, 'grok')
  assert.equal(a.endpoint, 'https://api.x.ai/v1')
  assert.equal(a.vendorId, 'sub-xai')
  assert.equal(a.apiKey, '')
  assert.equal(a.loggedIn, false)
  assert.deepEqual(a.availableModels, [])
  const b = blankSubscription(channelById('claude'))
  assert.equal(b.endpoint, '')
  assert.equal(b.vendorId, 'sub-anthropic')
})
