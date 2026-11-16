import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_ROOM_LAYOUT, buildRoomItem, loadRoomLayout, normalizeRoomLayout, resetRoomLayout, saveRoomLayout } from '../src/roomLayout.mjs'

function mem() {
  const map = new Map()
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) }
}

test('默认模板包含装饰与六个热点', () => {
  assert.ok(DEFAULT_ROOM_LAYOUT.items.length >= 18)
  const hotspots = DEFAULT_ROOM_LAYOUT.items.filter((i) => i.kind === 'hotspot')
  assert.deepEqual(hotspots.map((h) => h.action), ['world', 'chat', 'mcp', 'skill', 'memory', 'settings'])
})

test('没有存档时返回模板副本', () => {
  const layout = loadRoomLayout('assistant-001', mem())
  assert.equal(layout.name, DEFAULT_ROOM_LAYOUT.name)
  layout.items.pop()
  assert.equal(DEFAULT_ROOM_LAYOUT.items.length >= 18, true)
})

test('保存后可按助手隔离读取', () => {
  const storage = mem()
  const custom = { name: 'AI 改的房间', items: [{ id: 'a', kind: 'hotspot', label: '测试', action: 'chat' }] }
  saveRoomLayout('assistant-001', custom, storage)
  assert.equal(loadRoomLayout('assistant-001', storage).items[0].label, '测试')
  assert.equal(loadRoomLayout('assistant-002', storage).name, DEFAULT_ROOM_LAYOUT.name)
})

test('非法存档回退模板，reset 清空', () => {
  const storage = mem()
  storage.setItem('ai-home.roomLayout.assistant-001', '{bad json')
  assert.equal(loadRoomLayout('assistant-001', storage).items.length, DEFAULT_ROOM_LAYOUT.items.length)
  saveRoomLayout('assistant-001', { items: [] }, storage)
  resetRoomLayout('assistant-001', storage)
  assert.equal(loadRoomLayout('assistant-001', storage).items[0].id, DEFAULT_ROOM_LAYOUT.items[0].id)
})

test('buildRoomItem 生成百分比位置', () => {
  const item = buildRoomItem({ id: 'x', label: '书架', action: 'world', x: 5, y: 10, w: 20, h: 30 })
  assert.deepEqual(item.style, { left: '5%', top: '10%', width: '20%', height: '30%' })
  assert.equal(normalizeRoomLayout({ items: [item] }).items.length, 1)
})
