import test from 'node:test'
import assert from 'node:assert/strict'

import {
  inferModelSpec, resolveModelSpec, withModelSpec, clearModelSpec,
  specBadges, specSummary, normalizeModelSpec, formatTokens,
} from '../src/modelSpecs.mjs'
import { groupModels, normalizeVendors, syncVendorProfiles, allVendorKeys } from '../src/vendors.mjs'

test('按名称推断：GPT 系列能看图、能调工具、会推理', () => {
  const spec = inferModelSpec('gpt-5.6')
  assert.equal(spec.type, 'chat')
  assert.ok(spec.input.includes('image'))
  assert.ok(spec.abilities.includes('tool'))
  assert.ok(spec.abilities.includes('reasoning'))
  assert.equal(spec.contextWindow, 400000)
})

test('按名称推断：gpt-6 / gpt-4o 都归 GPT 大类', () => {
  const groups = groupModels(['gpt-5.6', 'gpt-6', 'gpt-4o', 'claude-4.5-sonnet', 'gemini-3-pro'])
  const gpt = groups.find(g => g.id === 'gpt')
  assert.ok(gpt, '应该有一个 GPT 分组')
  assert.deepEqual(gpt.models, ['gpt-5.6', 'gpt-6', 'gpt-4o'])
  assert.ok(groups.some(g => g.id === 'claude'))
  assert.ok(groups.some(g => g.id === 'gemini'))
})

test('按名称推断：嵌入模型与绘图模型不会被当成聊天模型', () => {
  assert.equal(inferModelSpec('text-embedding-3-large').type, 'embedding')
  assert.deepEqual(inferModelSpec('text-embedding-3-large').output, [])
  assert.equal(inferModelSpec('gpt-image-1').type, 'image')
  assert.deepEqual(inferModelSpec('gpt-image-1').output, ['image'])
})

test('按名称推断：DeepSeek R1 标推理， Claude 200K', () => {
  const r1 = inferModelSpec('deepseek-r1')
  assert.ok(r1.abilities.includes('reasoning'))
  assert.equal(r1.reasoning.dialect, 'deepseek')
  const claude = inferModelSpec('claude-4.5-sonnet')
  assert.equal(claude.contextWindow, 200000)
  assert.ok(claude.input.includes('image'))
  assert.equal(claude.reasoning.dialect, 'claude')
})

test('用户自定义字段覆盖推断，未填字段仍用推断', () => {
  const spec = resolveModelSpec('gpt-5.6', { displayName: '主力模型', contextWindow: 200000, abilities: ['tool'] })
  assert.equal(spec.customized, true)
  assert.equal(spec.displayName, '主力模型')
  assert.equal(spec.contextWindow, 200000)
  assert.deepEqual(spec.abilities, ['tool'])
  assert.ok(spec.input.includes('image'), '没改的输入模态继续用推断')
})

test('与推断一致的自定义不会留下垃圾覆盖', () => {
  const inferred = inferModelSpec('gpt-5.6')
  const vendor = { id: 'v1', modelOverrides: {} }
  const next = withModelSpec(vendor, 'gpt-5.6', inferred)
  assert.equal(Object.keys(next.modelOverrides).length, 0)
  const custom = withModelSpec(vendor, 'gpt-5.6', { ...inferred, displayName: '别名' })
  assert.equal(custom.modelOverrides['gpt-5.6'].displayName, '别名')
  const cleared = clearModelSpec(custom, 'gpt-5.6')
  assert.deepEqual(cleared.modelOverrides, {})
})

test('徽标顺序：视觉 → 工具 → 推理，最多 4 个', () => {
  const badges = specBadges(inferModelSpec('gpt-5.6'))
  const labels = badges.map(b => b.label)
  assert.deepEqual(labels.slice(0, 3), ['视觉', '工具', '推理'])
  assert.ok(badges.length <= 4)
})

test('摘要行带上下文与价格', () => {
  const spec = normalizeModelSpec({ contextWindow: 128000, pricing: { input: 2, output: 8, currency: 'USD' } })
  assert.equal(specSummary(spec), '128K 上下文 · 输入 $2 / 输出 $8 每百万')
  assert.equal(formatTokens(1000000), '1M')
})

test('normalizeModelSpec 丢掉非法值', () => {
  const spec = normalizeModelSpec({ type: 'weird', input: ['text', 'hologram'], abilities: ['tool', 'nope'], contextWindow: -5, pricing: { input: 'abc' } })
  assert.equal(spec.type, 'chat')
  assert.deepEqual(spec.input, ['text'])
  assert.deepEqual(spec.abilities, ['tool'])
  assert.equal(spec.contextWindow, 0)
  assert.equal(spec.pricing.input, 0)
})

test('旧供应商数据没有 enabled / modelOverrides 时补默认值', () => {
  const [vendor] = normalizeVendors([{ id: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1', keys: [], models: [{ id: 'deepseek-chat', selected: true }] }])
  assert.equal(vendor.enabled, true)
  assert.deepEqual(vendor.modelOverrides, {})
})

test('停用的供应商不进入模型池', () => {
  const vendors = normalizeVendors([
    { id: 'a', name: 'A', endpoint: 'https://a.example/v1', enabled: false, keys: [{ id: 'k1', value: 'sk-1', role: 'primary' }], models: [{ id: 'm1', selected: true }] },
    { id: 'b', name: 'B', endpoint: 'https://b.example/v1', enabled: true, keys: [{ id: 'k2', value: 'sk-2', role: 'primary' }], models: [{ id: 'm2', selected: true }] },
  ])
  assert.equal(vendors.find(v => v.id === 'a').enabled, false)
  assert.equal(vendors.find(v => v.id === 'b').enabled, true)
  assert.equal(syncVendorProfiles(vendors, []).length, 1)
  assert.equal(allVendorKeys(vendors).length, 1)
})

test('供应商分组：自定义分组保留，内置默认未分组', () => {
  const vendors = normalizeVendors([{ id: 'x', name: 'X', endpoint: 'https://x.example/v1', group: '中转站', keys: [], models: [] }])
  assert.equal(vendors.find(v => v.id === 'x').group, '中转站')
  assert.equal(vendors.find(v => v.id === 'openai').group, '')
})
