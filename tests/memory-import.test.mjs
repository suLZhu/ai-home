// 记忆备份恢复：保留生命周期/时间戳，同 id 覆盖不重复，FTS 只索引 active。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { initMemoryStore, importMemoryRecords, SQLiteMemoryProvider } from '../src/server/agent/MemoryStore.mjs'

const PERSON = 'assistant-yanweixi'
const OTHER = 'assistant-yanshuo'

test('导入记忆：保留状态、时间与人物，同 id 覆盖，FTS 跟随', () => {
  const db = new DatabaseSync(':memory:')
  initMemoryStore(db)
  const result = importMemoryRecords(db, PERSON, [
    { id: '11111111-1111-4111-8111-111111111111', title: '喜欢桂花茶', content: '用户喜欢桂花茶', category: '偏好习惯', lifecycle: 'active', createdBy: 'model', recallCount: 3, createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-02T10:00:00.000Z' },
    { id: '22222222-2222-4222-8222-222222222222', title: '候选记忆', content: '还没确认', lifecycle: 'candidate', createdAt: '2026-11-03T10:00:00.000Z' },
    { id: 'bad', title: '', content: '缺标题' },
  ])
  assert.equal(result.imported, 2)
  const provider = SQLiteMemoryProvider(db)
  const list = provider.list({ person: PERSON, limit: 1000 })
  assert.equal(list.length, 2)
  assert.equal(list.find(r => r.title === '喜欢桂花茶').lifecycle, 'active')
  assert.equal(list.find(r => r.title === '候选记忆').lifecycle, 'candidate')
  assert.equal(provider.list({ person: OTHER, limit: 1000 }).length, 0, '不会写到别的人物')
  const fts = db.prepare('SELECT COUNT(*) AS n FROM memory_records_fts WHERE person=?').get(PERSON)
  assert.equal(Number(fts.n), 1, '只有 active 进 FTS')

  // 同 id 再次导入 = 覆盖，不产生重复行
  importMemoryRecords(db, PERSON, [
    { id: '11111111-1111-4111-8111-111111111111', title: '喜欢桂花茶（改）', content: '更新后的内容', lifecycle: 'archived', createdAt: '2026-11-01T10:00:00.000Z' },
  ])
  const after = provider.list({ person: PERSON, limit: 1000 })
  assert.equal(after.length, 2)
  assert.equal(after.find(r => r.id.startsWith('1111')).title, '喜欢桂花茶（改）')
  assert.equal(after.find(r => r.id.startsWith('1111')).lifecycle, 'archived')
  const ftsAfter = db.prepare('SELECT COUNT(*) AS n FROM memory_records_fts WHERE person=?').get(PERSON)
  assert.equal(Number(ftsAfter.n), 0, '归档后移出 FTS')
})
