// 记忆可视化布局：稳定、有界、可切换。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MEMORY_VIEWS, normalizeMemoryView, categoryColor, starLayout, gardenLayout, groupMemoriesByDay,
} from '../src/memoryVisuals.mjs'

const records = Array.from({ length: 30 }, (_, i) => ({
  id: 'r' + i, title: '记忆 ' + i, category: i % 2 ? '经历事件' : '人物关系',
  occurredAt: '2026-11-' + String(10 + (i % 5)).padStart(2, '0'),
  createdAt: '2026-11-' + String(10 + (i % 5)).padStart(2, '0') + 'T10:00:00.000Z',
  updatedAt: '2026-11-14T10:00:00.000Z',
}))

test('视图值归一化：未知值回退星空，四个模式都在', () => {
  assert.deepEqual(MEMORY_VIEWS, ['stars', 'garden', 'diary', 'list'])
  assert.equal(normalizeMemoryView('garden'), 'garden')
  assert.equal(normalizeMemoryView('bad'), 'stars')
  assert.equal(normalizeMemoryView(''), 'stars')
})

test('分类颜色稳定，未知分类回退', () => {
  assert.equal(categoryColor('人物关系'), '#d98aa6')
  assert.equal(categoryColor('经历事件'), '#8fa7d9')
  assert.equal(categoryColor('不存在的分类'), categoryColor('其他'))
})

test('星空：位置有界、稳定、可限量', () => {
  const a = starLayout(records)
  const b = starLayout(records)
  assert.equal(a.length, 30)
  assert.deepEqual(a.map(x => [x.left, x.top, x.size]), b.map(x => [x.left, x.top, x.size]))
  for (const star of a) {
    assert.ok(star.left >= 6 && star.left <= 94, 'left 在画面内')
    assert.ok(star.top >= 8 && star.top <= 90, 'top 在画面内')
    assert.ok(star.size >= 16 && star.size <= 31)
    assert.equal(star.color, categoryColor(star.record.category))
  }
  assert.equal(starLayout(records, { max: 12 }).length, 12)
  assert.deepEqual(starLayout([]), [])
})

test('单条记忆居中，不会偏在角落', () => {
  const [star] = starLayout([records[0]])
  assert.equal(star.left, 50)
  assert.equal(star.top, 46)
})

test('花园：限量、颜色/花瓣/倾斜都在合理范围', () => {
  const flowers = gardenLayout(records)
  assert.equal(flowers.length, 24)
  for (const flower of flowers) {
    assert.ok(flower.petals === 5 || flower.petals === 6)
    assert.ok(flower.rotate >= -12 && flower.rotate <= 11)
    assert.ok(flower.size >= 34 && flower.size <= 47)
    assert.equal(flower.color, categoryColor(flower.record.category))
  }
})

test('日记本：按日期倒序分组，未记日期放最后，组内按更新时间倒序', () => {
  const groups = groupMemoriesByDay([
    { id: 'a', occurredAt: '2026-11-10', updatedAt: '2026-11-10T10:00:00.000Z' },
    { id: 'b', occurredAt: '2026-11-12', updatedAt: '2026-11-12T10:00:00.000Z' },
    { id: 'c', occurredAt: '', createdAt: '', updatedAt: '' },
    { id: 'd', occurredAt: '2026-11-12', updatedAt: '2026-11-13T10:00:00.000Z' },
  ])
  assert.deepEqual(groups.map(g => g.day), ['2026-11-12', '2026-11-10', '未记日期'])
  assert.deepEqual(groups[0].records.map(r => r.id), ['d', 'b'])
  assert.deepEqual(groups[2].records.map(r => r.id), ['c'])
})
