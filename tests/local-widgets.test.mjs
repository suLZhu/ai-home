// 本地模式小组件：localStorage CRUD，与服务器同一套清洗逻辑。
import { test } from 'node:test'
import assert from 'node:assert/strict'

const memory = new Map()
globalThis.localStorage = {
  getItem: key => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => { memory.set(key, String(value)) },
  removeItem: key => { memory.delete(key) },
  key: index => [...memory.keys()][index] ?? null,
  get length() { return memory.size },
}

const { localHandle } = await import('../src/localBackend.mjs')
const PERSON = 'assistant-yanweixi'

test('本地创建 → 列表 → 追加 → 删除', async () => {
  const created = await localHandle('/api/widgets', { method: 'POST', body: JSON.stringify({ person: PERSON, type: 'ledger', title: '零钱' }) })
  assert.equal(created.status, 201)
  const { widget } = await created.json()
  assert.equal(widget.type, 'ledger')

  const list = await (await localHandle('/api/widgets?person=' + PERSON, { method: 'GET' })).json()
  assert.equal(list.widgets.length, 1)

  const patched = await localHandle('/api/widgets/' + widget.id, {
    method: 'PATCH', body: JSON.stringify({ person: PERSON, config: { ...widget.config, entries: [{ amount: 8, note: '早饭' }] } }),
  })
  const updated = await patched.json()
  assert.equal(updated.widget.config.entries.length, 1)

  const removed = await localHandle('/api/widgets/' + widget.id, { method: 'DELETE', body: JSON.stringify({ person: PERSON }) })
  assert.equal(removed.status, 200)
  const after = await (await localHandle('/api/widgets?person=' + PERSON, { method: 'GET' })).json()
  assert.equal(after.widgets.length, 0)
})
