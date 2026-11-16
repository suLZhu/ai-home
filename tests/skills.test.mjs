import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSkills, parseSkillMarkdown, enabledSkillsBlock } from '../src/skills.mjs'

test('SKILL.md：解析 frontmatter 名称与描述', () => {
  const p = parseSkillMarkdown('---\nname: 旅行整理\ndescription: 把行程整理成清单\n---\n第一步：收集截图\n第二步：按天分组')
  assert.equal(p.name, '旅行整理')
  assert.equal(p.description, '把行程整理成清单')
  assert.match(p.instructions, /第一步/)
})

test('SKILL.md：没有 frontmatter 时正文即工作流', () => {
  const p = parseSkillMarkdown('直接写步骤\n- 一\n- 二')
  assert.equal(p.name, '')
  assert.equal(p.instructions, '直接写步骤\n- 一\n- 二')
})

test('技能归一化：缺名称或正文的条目被丢弃', () => {
  const list = normalizeSkills([{ name: '', instructions: 'x' }, { name: 'A', instructions: 'do' }, null])
  assert.equal(list.length, 1)
  assert.equal(list[0].name, 'A')
})

test('只注入已启用技能，并在超预算时截断', () => {
  assert.equal(enabledSkillsBlock([{ name: 'A', instructions: 'x', enabled: false }]), '')
  const block = enabledSkillsBlock([{ name: 'A', instructions: 'do A', enabled: true }, { name: 'B', instructions: 'do B', enabled: true }])
  assert.match(block, /已启用技能/)
  assert.match(block, /### A/)
  assert.match(block, /do B/)
  const truncated = enabledSkillsBlock([{ name: 'A', instructions: 'x'.repeat(200), enabled: true }], 60)
  assert.match(truncated, /已省略/)
})
