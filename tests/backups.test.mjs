// 分类备份：文件名、分类键过滤、整体备份恢复子类、格式校验。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BACKUP_KINDS, collectBackupLocal, localKeysForRestore, backupFileName, kindFromFileName,
  parseBackup, makeBackupEnvelope, summarizeBackup,
} from '../src/backups.mjs'

function fakeStorage(entries) {
  const map = new Map(Object.entries(entries))
  return {
    get length() { return map.size },
    key(i) { return [...map.keys()][i] ?? null },
    getItem(k) { return map.has(k) ? map.get(k) : null },
    setItem(k, v) { map.set(k, String(v)) },
  }
}

const storage = fakeStorage({
  'ai-home.vendors': '[{"id":"v1"}]',
  'ai-home.modelProfiles': '[]',
  'ai-home.bindings': '{}',
  'ai-home.modelConfig': '{}',
  'ai-home.subscriptions': '[]',
  'ai-home.apiKey': '{"a":"sk"}',
  'ai-home.conversations': '{}',
  'ai-home.messages': '{}',
  'ai-home.activeConversationIds': '{}',
  'ai-home.local.memoryRecords': '[]',
  'ai-home.worldEntries': '[]',
  'ai-home.sessionToken': 'secret',
  'other.key': 'x',
})

test('四种备份类型齐全', () => {
  assert.deepEqual(BACKUP_KINDS.map(k => k.id), ['models', 'memory', 'chat', 'full'])
})

test('分类收集只拿自己的键，整体收集拿全部 ai-home.* 但排除会话令牌', () => {
  assert.deepEqual(Object.keys(collectBackupLocal(storage, 'models')).sort(), [
    'ai-home.apiKey', 'ai-home.bindings', 'ai-home.modelConfig', 'ai-home.modelProfiles', 'ai-home.subscriptions', 'ai-home.vendors',
  ])
  assert.deepEqual(Object.keys(collectBackupLocal(storage, 'chat')).sort(), [
    'ai-home.activeConversationIds', 'ai-home.conversations', 'ai-home.messages',
  ])
  const full = collectBackupLocal(storage, 'full')
  assert.ok(full['ai-home.worldEntries'])
  assert.equal(full['ai-home.sessionToken'], undefined, '不把登录令牌写进备份')
  assert.equal(full['other.key'], undefined)
})

test('文件名带类型和秒级时间戳，能从文件名反推类型', () => {
  const date = new Date(2026, 10, 15, 17, 0, 12)
  assert.equal(backupFileName('models', date), '栖间-模型-2026-11-15-170012.json')
  assert.equal(kindFromFileName('栖间-聊天-2026-11-15-170012.json'), 'chat')
  assert.equal(kindFromFileName('栖间-整体-2026-11-15-170012.json'), 'full')
  assert.equal(kindFromFileName('随便.json'), '')
})

test('整体备份可以恢复子类，子类备份不能跨类型恢复', () => {
  const full = makeBackupEnvelope('full', { 'ai-home.vendors': '[]', 'ai-home.messages': '{}', 'ai-home.worldEntries': '[]' })
  assert.deepEqual(Object.keys(localKeysForRestore(full, 'models')), ['ai-home.vendors'])
  assert.deepEqual(Object.keys(localKeysForRestore(full, 'chat')), ['ai-home.messages'])
  const chat = makeBackupEnvelope('chat', { 'ai-home.messages': '{}' })
  assert.throws(() => localKeysForRestore(chat, 'models'), /类型不匹配/)
})

test('格式校验：非 JSON / 非栖间 / 未知类型都拒绝', () => {
  assert.throws(() => parseBackup('not json'), /JSON/)
  assert.throws(() => parseBackup(JSON.stringify({ app: 'other', kind: 'chat', data: {} })), /不是栖间/)
  assert.throws(() => parseBackup(JSON.stringify({ app: 'qijian', kind: 'unknown', data: {} })), /类型/)
})

test('摘要统计本地键、记忆条数、API Key 数量', () => {
  const payload = makeBackupEnvelope('full', { 'ai-home.vendors': '[]', 'ai-home.messages': '{}' }, {
    keys: { a: 'sk', b: 'sk2' },
    memory: { a: [{ id: 1 }, { id: 2 }], b: [{ id: 3 }] },
  })
  assert.deepEqual(summarizeBackup(payload), { localKeys: 2, memoryPeople: 2, memoryCount: 3, apiKeys: 2 })
  assert.deepEqual(summarizeBackup({ data: {} }), { localKeys: 0, memoryPeople: 0, memoryCount: 0, apiKeys: 0 })
})
