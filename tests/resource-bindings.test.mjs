import test from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyBinding, normalizeProfiles, normalizeBindings, resolveModelConfig,
  resolveMcpConnections, isWorldEntryBound, toggleWorldEntryBinding, toggleMcpId,
} from '../src/resourceBindings.mjs'

const A = 'assistant-yanweixi'
const B = 'assistant-yanshuo'
const PEOPLE = [A, B]

test('normalizeProfiles 过滤坏数据并补齐计价默认值', () => {
  const out = normalizeProfiles([
    { id: 'p1', name: '  便宜档  ', endpoint: ' https://x/v1 ', model: ' m1 ', usdToCny: '7.1' },
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
  assert.deepEqual(normalizeProfiles(null), [])
})

test('normalizeBindings 对旧快照（完全缺省）生成兼容绑定', () => {
  const out = normalizeBindings(null, PEOPLE)
  assert.deepEqual(out[A], { modelProfileId: '', mcpIds: null })
  assert.deepEqual(out[B], { modelProfileId: '', mcpIds: null })
  const partial = normalizeBindings({ [A]: { modelProfileId: 'p1', mcpIds: ['x', 3, 'y'] } }, PEOPLE)
  assert.equal(partial[A].modelProfileId, 'p1')
  assert.deepEqual(partial[A].mcpIds, ['x', 'y'])
  assert.deepEqual(partial[B], emptyBinding())
})

test('resolveModelConfig 优先预设，未绑定或预设缺失时回退旧配置', () => {
  const profiles = normalizeProfiles([{ id: 'p1', name: '新模型', endpoint: 'https://new/v1', model: 'new-m' }])
  const fallback = { endpoint: 'https://old/v1', model: 'old-m' }
  assert.deepEqual(resolveModelConfig('p1', profiles, fallback), {
    endpoint: 'https://new/v1', model: 'new-m',
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
  assert.deepEqual(resolveMcpConnections(list, { modelProfileId: '', mcpIds: null }).map(c => c.id), ['a', 'c'])
  assert.deepEqual(resolveMcpConnections(list, { modelProfileId: '', mcpIds: [] }), [])
  assert.deepEqual(resolveMcpConnections(list, { modelProfileId: '', mcpIds: ['c', 'ghost'] }).map(c => c.id), ['c'])
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
