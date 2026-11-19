import test from 'node:test'
import assert from 'node:assert/strict'
import { createToolExecutionBudget } from '../src/toolExecutionBudget.mjs'

test('轮数使用用户设置的 5、10、15、20，不再固定第 5 轮停止', () => {
  for (const limit of [5, 10, 15, 20]) {
    const budget = createToolExecutionBudget({roundLimit:limit})
    assert.equal(budget.isLastRound(limit-2), false)
    assert.equal(budget.isLastRound(limit-1), true)
  }
})

test('一次模型响应包含多项工具调用也逐项扣减，耗尽后拒绝执行', () => {
  const budget=createToolExecutionBudget({roundLimit:20,maxCalls:8})
  for (let i=0;i<8;i++) assert.equal(budget.tryStartTool(),true)
  assert.equal(budget.executedCalls,8)
  assert.equal(budget.tryStartTool(),false)
  assert.equal(budget.executedCalls,8)
})

test('不同用户消息的工具预算相互隔离', () => {
  const first=createToolExecutionBudget({maxCalls:1})
  const second=createToolExecutionBudget({maxCalls:1})
  assert.equal(first.tryStartTool(),true)
  assert.equal(first.tryStartTool(),false)
  assert.equal(second.tryStartTool(),true)
})
