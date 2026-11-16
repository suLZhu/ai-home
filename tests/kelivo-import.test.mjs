// 兼容导入 Kelivo 模型配置：地址归一化、模型拆分、多 Key、重名。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeEndpoint, splitModelNames, parseKelivoModelConfigs, kelivoConfigsToVendors, kelivoImportSummary } from '../src/kelivoImport.mjs'

test('地址去掉 /chat/completions 与尾斜杠', () => {
  assert.equal(normalizeEndpoint('https://api.deepseek.com/v1/chat/completions'), 'https://api.deepseek.com/v1')
  assert.equal(normalizeEndpoint('https://token.sensenova.cn/v1/'), 'https://token.sensenova.cn/v1')
  assert.equal(normalizeEndpoint('not-a-url'), '')
})

test('模型按中英文逗号/分号拆分并去重', () => {
  assert.deepEqual(splitModelNames('a,b，c; d；a'), ['a', 'b', 'c', 'd'])
  assert.deepEqual(splitModelNames(''), [])
})

test('解析 Kelivo 数组与 configs 包一层', () => {
  const list = [{ name: 'A', apiEndpoint: 'https://a/v1', apiKey: 'k', modelName: 'm' }]
  assert.equal(parseKelivoModelConfigs(JSON.stringify(list))?.length, 1)
  assert.equal(parseKelivoModelConfigs({ configs: list })?.length, 1)
  assert.equal(parseKelivoModelConfigs('{}'), null)
  assert.equal(parseKelivoModelConfigs('not json'), null)
})

test('转成供应商：主 Key + 备用池 + 模型全选 + 重名避让', () => {
  const vendors = kelivoConfigsToVendors([
    { name: '聚梦', apiEndpoint: 'https://api.jumengai.net/v1', apiKey: 'sk-main', useMultipleApiKeys: true, apiKeyPool: [{ key: 'sk-backup' }, { key: 'sk-main' }], modelName: '[K2]claude-opus,gemini-flash' },
    { name: '聚梦', apiEndpoint: 'https://b/v1', apiKey: 'sk-b', modelName: 'm1' },
    { name: '', apiEndpoint: 'https://c/v1', apiKey: 'sk-c', modelName: 'm2' },
    { name: '坏数据', apiEndpoint: '', apiKey: '', modelName: '' },
  ], [{ name: '已有' }])
  assert.equal(vendors.length, 3)
  assert.equal(vendors[0].keys.length, 2)
  assert.equal(vendors[0].keys[0].role, 'primary')
  assert.deepEqual(vendors[0].models.map(m => m.id), ['[K2]claude-opus', 'gemini-flash'])
  assert.equal(vendors[1].name, '聚梦（2）')
  assert.equal(vendors[2].name, '导入的供应商')
  assert.deepEqual(kelivoImportSummary(vendors), { vendors: 3, models: 4, keys: 4 })
})
