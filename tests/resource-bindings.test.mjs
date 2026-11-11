import test from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyBinding, normalizeProfiles, normalizeBindings, resolveModelConfig,
  resolveMcpConnections, isWorldEntryBound, toggleWorldEntryBinding, toggleMcpId,
  normalizePool, isInPool, togglePool, poolLabel,
} from '../src/resourceBindings.mjs'
import {
  BUILTIN_VENDORS, normalizeVendors, vendorModelProfileId, syncVendorProfiles,
  allVendorKeys, resolveVendorKey,
} from '../src/vendors.mjs'

const A = 'assistant-yanweixi'
const B = 'assistant-yanshuo'
const PEOPLE = [A, B]

test('normalizeProfiles 过滤坏数据并保留供应商分组字段', () => {
  const out = normalizeProfiles([
    { id: 'p1', name: '  便宜档  ', endpoint: ' https://x/v1 ', model: ' m1 ', usdToCny: '7.1', vendor: '硅基流动', vendorId: 'siliconflow' },
    { id: '', name: '缺 id', endpoint: 'x', model: 'y' },
    null,
    'bad',
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].name, '便宜档')
  assert.equal(out[0].endpoint, 'https://x/v1')
  assert.equal(out[0].model, 'm1')
  assert.equal(out[0].usdToCny, '7.1')
  assert.equal(out[0].inputPrice, '')
  assert.equal(out[0].vendor, '硅基流动')
  assert.equal(out[0].vendorId, 'siliconflow')
  assert.deepEqual(normalizeProfiles(null), [])
  assert.equal(normalizeProfiles([{ id: 'old', name: '旧预设' }])[0].vendor, '')
})

test('normalizeBindings 对旧快照（完全缺省）生成兼容绑定', () => {
  const out = normalizeBindings(null, PEOPLE)
  assert.deepEqual(out[A], { modelProfileId: '', mcpIds: null, keyId: '' })
  assert.deepEqual(out[B], emptyBinding())
  const partial = normalizeBindings({ [A]: { modelProfileId: 'p1', mcpIds: ['x', 3, 'y'], keyId: 'k2' } }, PEOPLE)
  assert.equal(partial[A].modelProfileId, 'p1')
  assert.deepEqual(partial[A].mcpIds, ['x', 'y'])
  assert.equal(partial[A].keyId, 'k2')
  assert.deepEqual(partial[B], emptyBinding())
})

test('resolveModelConfig 优先预设，未绑定或预设缺失时回退旧配置', () => {
  const profiles = normalizeProfiles([{ id: 'p1', name: '新模型', endpoint: 'https://new/v1', model: 'new-m' }])
  const fallback = { endpoint: 'https://old/v1', model: 'old-m' }
  assert.deepEqual(resolveModelConfig('p1', profiles, fallback), {
    endpoint: 'https://new/v1', model: 'new-m', vendor: '', vendorId: '',
    inputPrice: '', outputPrice: '', cachedInputPrice: '', usdToCny: '7.2',
  })
  assert.equal(resolveModelConfig('', profiles, fallback), fallback)
  assert.equal(resolveModelConfig('deleted', profiles, fallback), fallback)
})

test('resolveMcpConnections：null = 全部启用（老数据），空数组 = 全部停用', () => {
  const list = [
    { id: 'a', name: 'A', enabled: true },
    { id: 'b', name: 'B', enabled: false },
    { id: 'c', name: 'C', enabled: true },
  ]
  assert.deepEqual(resolveMcpConnections(list, null).map(c => c.id), ['a', 'c'])
  assert.deepEqual(resolveMcpConnections(list, { ...emptyBinding() }).map(c => c.id), ['a', 'c'])
  assert.deepEqual(resolveMcpConnections(list, { ...emptyBinding(), mcpIds: [] }), [])
  assert.deepEqual(resolveMcpConnections(list, { ...emptyBinding(), mcpIds: ['c', 'ghost'] }).map(c => c.id), ['c'])
  assert.deepEqual(resolveMcpConnections(null, null), [])
})

test('世界书绑定只影响当前助手，不影响同条目的其他绑定', () => {
  const entries = [
    { id: 'w1', title: '设定一', enabled: true, boundCharacters: [A, B] },
    { id: 'w2', title: '设定二', enabled: true, boundCharacters: [B] },
  ]
  assert.equal(isWorldEntryBound(entries[0], A), true)
  assert.equal(isWorldEntryBound(entries[1], A), false)
  const unbound = toggleWorldEntryBinding(entries, A, 'w1', false)
  assert.deepEqual(unbound[0].boundCharacters, [B])
  assert.equal(entries[0].boundCharacters.includes(A), true, '原数组不可被就地修改')
  const rebound = toggleWorldEntryBinding(unbound, A, 'w1', true)
  assert.deepEqual(rebound[0].boundCharacters, [B, A])
  assert.deepEqual(rebound[1].boundCharacters, [B])
  assert.deepEqual(toggleWorldEntryBinding(rebound, A, 'w1', true)[0].boundCharacters, [B, A], '重复勾选不产生重复项')
})

test('toggleMcpId 首次取消时固化完整列表，避免误变成只启用一项', () => {
  const allIds = ['a', 'b', 'c']
  const unset = emptyBinding()
  const afterUncheck = toggleMcpId(unset, 'b', false, allIds)
  assert.deepEqual(afterUncheck.mcpIds, ['a', 'c'])
  assert.deepEqual(toggleMcpId(afterUncheck, 'b', true, allIds).mcpIds, ['a', 'c', 'b'])
  assert.deepEqual(toggleMcpId(unset, 'b', true, allIds).mcpIds, ['a', 'b', 'c'], '已启用项重复勾选不改变顺序也不重复')
  assert.equal(toggleMcpId(unset, 'x', true, []).mcpIds.length, 1)
})

// ── 设置页勾选池：只有勾进池里的 001 / 002 条目才出现在聊天窗口 ──
test('勾选池：未配置时全部可见，第一次勾选会固化完整清单', () => {
  const all = ['w1', 'w2', 'w3']
  const pool = normalizePool(null)
  assert.deepEqual(pool, { worldIds: null, mcpIds: null })
  assert.equal(isInPool(pool, 'worldIds', 'w2', all), true)
  const after = togglePool(pool, 'worldIds', 'w2', false, all)
  assert.deepEqual(after, { worldIds: ['w1', 'w3'], mcpIds: null })
  assert.equal(isInPool(after, 'worldIds', 'w2', all), false)
  assert.equal(isInPool(after, 'worldIds', 'w1', all), true)
  assert.deepEqual(togglePool(after, 'worldIds', 'w2', true, all).worldIds, ['w1', 'w3', 'w2'])
  assert.equal(poolLabel(0), '001')
  assert.equal(poolLabel(12), '013')
})

test('勾选池：显式清单为空就是一项都不放出来，坏数据会被过滤', () => {
  const empty = normalizePool({ worldIds: [], mcpIds: ['m1', 7] })
  assert.deepEqual(empty, { worldIds: [], mcpIds: ['m1'] })
  assert.equal(isInPool(empty, 'worldIds', 'w1', ['w1']), false)
  assert.deepEqual(togglePool(empty, 'mcpIds', 'm1', false, ['m1']).mcpIds, [])
})

// ── 供应商中心：预置、多选模型、多 KEY ──
test('normalizeVendors 首次进入就带 DeepSeek / 硅基流动等预置，且不勾选任何模型', () => {
  const list = normalizeVendors(null)
  assert.ok(list.some(v => v.name === 'DeepSeek'))
  assert.ok(list.some(v => v.name === '硅基流动'))
  assert.ok(list.every(v => v.models.every(m => !m.selected)))
  assert.ok(list.every(v => v.keys.length === 0))
  assert.equal(list[0].endpoint, BUILTIN_VENDORS[0].endpoint)
})

test('供应商勾选状态、多 KEY、自定义模型与自定义供应商都能往返', () => {
  const saved = [{
    id: 'deepseek', name: 'DeepSeek', endpoint: 'https://custom/v1', builtin: true,
    keys: [{ id: 'k1', label: '主号', value: 'sk-a' }, { id: 'k2', label: '备用', value: 'sk-b' }],
    models: [{ id: 'deepseek-chat', selected: true }, { id: 'my-model', name: '自建模型', selected: true }],
  }, { id: 'custom-1', name: '我的中转', endpoint: 'https://mine/v1', builtin: false, keys: [], models: [{ id: 'foo', selected: true }] }]
  const list = normalizeVendors(saved)
  assert.equal(list[0].endpoint, 'https://custom/v1')
  assert.equal(list[0].keys.length, 2)
  assert.equal(list[0].models.find(m => m.id === 'deepseek-chat').selected, true)
  assert.equal(list[0].models.find(m => m.id === 'deepseek-reasoner').selected, false)
  assert.equal(list[0].models.find(m => m.id === 'my-model').name, '自建模型')
  assert.equal(list.find(v => v.id === 'custom-1').name, '我的中转')
})

test('syncVendorProfiles 把勾选模型变成带分组名的预设，并保留手动预设', () => {
  const vendors = normalizeVendors([{
    id: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1', builtin: true,
    keys: [], models: [{ id: 'deepseek-chat', selected: true }, { id: 'deepseek-reasoner', selected: false }],
  }])
  const manual = { id: 'p1', name: '手动预设', endpoint: 'x', model: 'y' }
  const out = syncVendorProfiles(vendors, [manual])
  assert.equal(out.length, 2)
  assert.equal(out[0].id, vendorModelProfileId('deepseek', 'deepseek-chat'))
  assert.equal(out[0].vendor, 'DeepSeek')
  assert.equal(out[0].endpoint, 'https://api.deepseek.com/v1')
  assert.equal(out[1].id, 'p1')
  const again = syncVendorProfiles(normalizeVendors(null), out)
  assert.equal(again.length, 1, '取消全部勾选后 vendor 预设被清掉，手动预设仍在')
  assert.equal(again[0].id, 'p1')
})

test('多 KEY：按 id 取到对应 Key，未选或失效时回退空串', () => {
  const vendors = normalizeVendors([{
    id: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1', builtin: true,
    keys: [{ id: 'k1', label: '主号', value: 'sk-a' }, { id: 'k2', label: '备用', value: 'sk-b' }], models: [],
  }])
  assert.equal(allVendorKeys(vendors).length, 2)
  assert.equal(allVendorKeys(vendors)[0].vendorName, 'DeepSeek')
  assert.equal(resolveVendorKey(vendors, 'k2'), 'sk-b')
  assert.equal(resolveVendorKey(vendors, ''), '')
  assert.equal(resolveVendorKey(vendors, 'ghost'), '')
})
