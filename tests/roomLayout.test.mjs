import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_ROOM_LAYOUT, buildRoomItem, loadRoomLayout, normalizeRoomLayout, normalizeRoomStyle, resetRoomLayout, saveRoomLayout } from '../src/roomLayout.mjs'

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

test('自由场景：背景 + 任意图形/文字/动作都保留', () => {
  const free = {
    name: '星空',
    background: { css: 'radial-gradient(circle at 30% 20%,#1b2340,#070a17 70%)' },
    items: [
      { id: 'moon', kind: 'visual', x: 70, y: 8, w: 18, h: 18, style: { borderRadius: '50%', background: '#f7e7b2' }, text: '' },
      { id: 'star', kind: 'hotspot', action: 'chat', x: 20, y: 40, w: 24, h: 12, text: '✦ 聊天', style: { color: '#fff', fontSize: '14px' } },
    ],
  }
  const layout = normalizeRoomLayout(free)
  assert.equal(layout.name, '星空')
  assert.equal(layout.background.css.includes('radial-gradient'), true)
  assert.equal(layout.items.length, 2)
  assert.equal(layout.items[1].action, 'chat')
  assert.equal(layout.items[1].text, '✦ 聊天')
})

test('自由项支持 emoji 与无动作装饰', () => {
  const layout = normalizeRoomLayout({ items: [{ id: 'tree', kind: 'visual', x: 10, y: 60, w: 20, h: 30, emoji: '🌳', style: { fontSize: '48px' } }] })
  assert.equal(layout.items[0].emoji, '🌳')
  assert.equal('action' in layout.items[0], false)
})

test('AI 的 style 数组不会再把房间 React 渲染器崩掉', () => {
  const layout=normalizeRoomLayout({items:[
    {id:'bad-array',kind:'visual',text:'星星',style:['color:red','font-size:24px']},
    {id:'bad-object',kind:'visual',style:{0:'bad',color:'white',background:{nested:true},width:50}},
    {id:'bad-string',kind:'visual',style:'color:red;position:absolute'},
  ]})
  assert.equal(layout.items.length,3)
  assert.equal(layout.items[0].style,undefined)
  assert.deepEqual(layout.items[1].style,{color:'white',width:50})
  assert.equal(layout.items[2].style,undefined)
})
test('旧版已保存的坏 style 在读取时自动安全归一化，保留场景和内容', () => {
  const storage=mem()
  storage.setItem('ai-home.roomLayout.assistant-001',JSON.stringify({
    name:'言朔改的房间',items:[{id:'lamp',kind:'visual',text:'💡',style:['red','blue']},{id:'tree',kind:'visual',emoji:'🌳',style:{left:'20%',fontSize:28}}],
  }))
  const recovered=loadRoomLayout('assistant-001',storage)
  assert.equal(recovered.name,'言朔改的房间')
  assert.equal(recovered.items.length,2)
  assert.equal(recovered.items[0].style,undefined)
  assert.deepEqual(recovered.items[1].style,{left:'20%',fontSize:28})
})
test('style 不是对象或含数字键时不得进入 DOM', () => {
  assert.equal(normalizeRoomStyle(null),undefined)
  assert.equal(normalizeRoomStyle([1,2]),undefined)
  assert.deepEqual(normalizeRoomStyle({'0':'invalid','1':'invalid',background:'linear-gradient(red, blue)'}),{background:'linear-gradient(red, blue)'})
})
