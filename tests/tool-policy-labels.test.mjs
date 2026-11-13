import test from 'node:test'
import assert from 'node:assert/strict'
import { POLICY_MODES, POLICY_LABELS, policyLabel, POLICY_HELP, toolPurpose } from '../src/toolPolicyLabels.mjs'

test('权限值仍是内部 auto/ask/deny，只有显示改成中文', () => {
  assert.deepEqual(POLICY_MODES, ['auto', 'ask', 'deny'])
  assert.equal(POLICY_LABELS.auto, '自动执行')
  assert.equal(POLICY_LABELS.ask, '执行前询问')
  assert.equal(POLICY_LABELS.deny, '禁止执行')
  assert.equal(policyLabel('auto'), '自动执行')
  assert.equal(policyLabel('ask'), '执行前询问')
  assert.equal(policyLabel('deny'), '禁止执行')
})

test('未知 mode 不编造中文，原样回显', () => {
  assert.equal(policyLabel('custom'), 'custom')
  assert.equal(policyLabel(''), '')
})

test('顶部说明全中文，不再出现开发者术语', () => {
  assert.match(POLICY_HELP, /自动执行/)
  assert.match(POLICY_HELP, /执行前询问/)
  assert.match(POLICY_HELP, /禁止执行/)
  assert.ok(!/\bauto\b|\bask\b|\bdeny\b/.test(POLICY_HELP))
})

test('工具 ID 保留，中文用途只作辅助；未登记工具不编造', () => {
  assert.equal(toolPurpose('memory_search'), '搜索长期记忆')
  assert.equal(toolPurpose('memory_add'), '新增长期记忆')
  assert.equal(toolPurpose('worldbook_search'), '搜索世界书')
  assert.equal(toolPurpose('ledger_add'), '共享记账 · 记一笔')
  assert.equal(toolPurpose('scheduled_task_create'), '创建定时任务')
  assert.equal(toolPurpose('mcp_x_unknown'), '')
  assert.equal(toolPurpose(''), '')
  assert.equal(toolPurpose(null), '')
})
