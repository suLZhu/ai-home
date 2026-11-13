import test from 'node:test'
import assert from 'node:assert/strict'
import { PRIMARY_TOOLS, MORE_TOOLS, LEGACY_TOOL_IDS, composeToolGroups } from '../src/composeTools.mjs'

test('输入栏常驻只保留真正高频的表情 / 模型', () => {
  assert.deepEqual(PRIMARY_TOOLS.map(t => t.id), ['emoji', 'model'])
  assert.ok(PRIMARY_TOOLS.every(t => t.label && typeof t.label === 'string'))
})

test('低频工具全部收进「+」，且每个都有中文说明与落地方式', () => {
  const ids = MORE_TOOLS.map(t => t.id)
  for (const id of ['world', 'mcp', 'tools', 'search', 'image', 'file']) assert.ok(ids.includes(id), id)
  assert.ok(MORE_TOOLS.every(t => t.label && t.desc && ['file', 'tray', 'search'].includes(t.action)))
})

test('分组互斥、无重复，且原六个工具入口一个都没丢', () => {
  const g = composeToolGroups()
  assert.deepEqual(g.duplicates, [])
  assert.deepEqual(g.missing, [])
  for (const id of LEGACY_TOOL_IDS) assert.ok(g.allIds.includes(id), id)
  assert.equal(new Set(g.allIds).size, g.allIds.length, '不得出现重复 id')
})

test('图片 / 文件走 file action，世界书 / MCP / 工具走 tray，搜索走 search', () => {
  const byId = Object.fromEntries(MORE_TOOLS.map(t => [t.id, t.action]))
  assert.equal(byId.image, 'file')
  assert.equal(byId.file, 'file')
  assert.equal(byId.world, 'tray')
  assert.equal(byId.mcp, 'tray')
  assert.equal(byId.tools, 'tray')
  assert.equal(byId.search, 'search')
})
