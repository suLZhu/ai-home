import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACTIVE_GENERATION_KEY, INTERRUPTED_NOTE, readActiveGeneration, startGeneration,
  finishGeneration, needsGenerationRecovery, recoverInterruptedMessages,
} from '../src/generationRecovery.mjs'
import { buildModelCatalog } from '../src/unifiedModels.mjs'
import { normalizeProfiles, resolveModelConfig } from '../src/resourceBindings.mjs'

function memStorage() {
  const map = new Map()
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
  }
}

test('生成标记只在本次请求结束时清除', () => {
  const s = memStorage()
  assert.equal(readActiveGeneration(s), null)
  assert.equal(startGeneration(s, { person: 'a', conversationId: 'c1', messageId: 'm1' }, 1000), true)
  assert.equal(s.getItem(ACTIVE_GENERATION_KEY) !== null, true)
  assert.equal(readActiveGeneration(s).messageId, 'm1')
  assert.equal(finishGeneration(s, 'other'), false)
  assert.equal(readActiveGeneration(s).messageId, 'm1')
  assert.equal(finishGeneration(s, 'm1'), true)
  assert.equal(readActiveGeneration(s), null)
})

test('sending 时不恢复，状态丢失才恢复', () => {
  const active = { messageId: 'm1' }
  assert.equal(needsGenerationRecovery(active, true), false)
  assert.equal(needsGenerationRecovery(active, false), true)
  assert.equal(needsGenerationRecovery(null, false), false)
})

test('空白助手占位被标成未完成，已有内容原样保留', () => {
  const list = [
    { role: 'user', content: '你好' },
    { role: 'assistant', content: '', id: 'm1' },
  ]
  const r = recoverInterruptedMessages(list, 'm1')
  assert.equal(r.changed, true)
  assert.equal(r.messages[1].content, INTERRUPTED_NOTE)
  assert.equal(r.messages[0].content, '你好')
  const done = [{ role: 'assistant', content: '已经写好的回复', id: 'm1' }]
  assert.equal(recoverInterruptedMessages(done, 'm1').changed, false)
  assert.equal(recoverInterruptedMessages(done, 'm1').messages[0].content, '已经写好的回复')
})

test('显示名不能变成请求 model ID（模型目录）', () => {
  const bad = buildModelCatalog({
    profiles: [{ id: 'p1', name: '我的 GPT 显示名', endpoint: 'https://x/v1', model: '' }],
    vendors: [], routes: [],
  })
  assert.equal(bad.length, 0)
  const ok = buildModelCatalog({
    profiles: [{ id: 'p2', name: '我的 GPT 显示名', endpoint: 'https://x/v1', model: 'gpt-4o' }],
  })
  assert.equal(ok[0].model, 'gpt-4o')
  assert.equal(ok[0].name, '我的 GPT 显示名')
  assert.ok(!ok[0].name.includes('gpt-4o'))
})

test('解析模型配置时缺少 model 回退旧配置，不拿 name 顶替', () => {
  const profiles = [{ id: 'p1', name: '显示名', model: '', endpoint: 'https://bad/v1' }]
  const fallback = { model: 'gpt-4o-mini', endpoint: 'https://old/v1' }
  assert.deepEqual(resolveModelConfig('p1', profiles, fallback), fallback)
  assert.equal(normalizeProfiles(profiles)[0].model, '')
})
