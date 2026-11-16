// 房间小组件：创建 / 追加 / 更新 / 删除与配置清洗。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { initWidgets, createWidget, listWidgets, updateWidget, deleteWidget, normalizeConfig } from '../src/server/widgets.mjs'

const PERSON = 'assistant-yanweixi'
const OTHER = 'assistant-yanshuo'

test('创建记账本并追加一笔，配置写入数据库', () => {
  const db = new DatabaseSync(':memory:')
  initWidgets(db)
  const widget = createWidget(db, PERSON, { type: 'ledger', title: '这个月的账' })
  assert.equal(widget.type, 'ledger')
  assert.deepEqual(widget.config.entries, [])
  assert.equal(widget.title, '这个月的账')
  const updated = updateWidget(db, widget.id, PERSON, {
    config: { ...widget.config, entries: [{ amount: 12.5, note: '桂花茶', kind: 'expense' }] },
  })
  assert.equal(updated.config.entries.length, 1)
  assert.equal(updated.config.entries[0].amount, 12.5)
  assert.equal(listWidgets(db, PERSON).length, 1)
  assert.equal(listWidgets(db, OTHER).length, 0, '不会出现在别人房间')
})

test('非法数量/空标题会被清洗，只有本人能改和删', () => {
  const db = new DatabaseSync(':memory:')
  initWidgets(db)
  const widget = createWidget(db, PERSON, { type: 'checklist' })
  assert.equal(widget.title, '清单')
  const updated = updateWidget(db, widget.id, PERSON, {
    config: { items: [{ text: '买菜' }, { text: '' }, { text: '取快递', done: true }] },
  })
  assert.deepEqual(updated.config.items.map(i => i.text), ['买菜', '取快递'])
  assert.throws(() => updateWidget(db, widget.id, OTHER, { title: '偷改' }), /不属于当前助手/)
  assert.equal(deleteWidget(db, widget.id, OTHER), false)
  assert.equal(deleteWidget(db, widget.id, PERSON), true)
  assert.equal(listWidgets(db, PERSON).length, 0)
})

test('计数器与便签的配置边界', () => {
  assert.equal(normalizeConfig('counter', { count: '12', step: 0 }).count, 12)
  assert.equal(normalizeConfig('counter', { count: '12', step: 0 }).step, 1)
  assert.equal(normalizeConfig('note', { text: 'a'.repeat(9000) }).text.length, 8000)
  assert.deepEqual(normalizeConfig('ledger', { entries: [{ amount: 0 }, { amount: -3, kind: 'income' }] }).entries.map(e => e.amount), [3])
})
