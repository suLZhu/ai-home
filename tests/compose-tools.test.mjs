import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { COMPOSE_TOOLS, COMPOSE_TOOL_IDS, composeToolGroups } from '../src/composeTools.mjs'

// 微信式输入栏：表情 / 模型 / 世界书+MCP / 图片文件 / 工具 / 查找，全部常驻一排图标。
test('输入栏六个工具常驻，不再有「+」二级面板', () => {
  assert.deepEqual(COMPOSE_TOOL_IDS, ['emoji', 'model', 'bind', 'attach', 'tools', 'search'])
  assert.ok(COMPOSE_TOOLS.every(t => t.label && t.icon))
  assert.equal(new Set(COMPOSE_TOOL_IDS).size, COMPOSE_TOOL_IDS.length, 'id 不得重复')
})

test('世界书与 MCP 合并成一个入口，附件一个入口管图片和文件', () => {
  const byId = Object.fromEntries(COMPOSE_TOOLS.map(t => [t.id, t]))
  assert.equal(byId.bind.label, '世界书 / MCP')
  assert.equal(byId.attach.label, '图片 / 文件')
  assert.ok(!byId.world && !byId.mcp, '不再单独暴露 world / mcp 两个入口')
})

test('图标位图都存在（老 WebView 画不了内联 SVG，只能用位图）', () => {
  for (const t of COMPOSE_TOOLS) {
    assert.ok(existsSync('public/msg-icons/' + t.icon + '.png'), '缺少 public/msg-icons/' + t.icon + '.png')
  }
  for (const name of ['send', 'stop']) {
    assert.ok(existsSync('public/msg-icons/' + name + '.png'), '缺少 public/msg-icons/' + name + '.png')
  }
})

test('分组自检：无重复 id、没有缺图标的条目', () => {
  const g = composeToolGroups()
  assert.deepEqual(g.duplicates, [])
  assert.deepEqual(g.missingIcon, [])
})
