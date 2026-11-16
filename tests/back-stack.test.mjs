// Android 返回键处理栈验收：临时层先关、栈顶优先、注销安全、栈空才放行退出。
import test from 'node:test'
import assert from 'node:assert/strict'
import { pushBackHandler, handleBack, backStackDepth, clearBackHandlers } from '../src/backStack.mjs'

test('栈空时 handleBack 返回 false（允许退出到根）', () => {
  clearBackHandlers()
  assert.equal(handleBack(), false)
  assert.equal(backStackDepth(), 0)
})

test('单个 handler 消费返回：返回 true', () => {
  clearBackHandlers()
  let closed = false
  const un = pushBackHandler(() => { closed = true; return true })
  assert.equal(handleBack(), true)
  assert.equal(closed, true)
  un()
})

test('栈顶优先：后注册的先被问', () => {
  clearBackHandlers()
  const order = []
  pushBackHandler(() => { order.push('bottom'); return true })
  pushBackHandler(() => { order.push('top'); return true })
  handleBack()
  assert.deepEqual(order, ['top'])
  clearBackHandlers()
})

test('栈顶返回 false 时继续问下一层', () => {
  clearBackHandlers()
  const order = []
  pushBackHandler(() => { order.push('bottom'); return true })
  pushBackHandler(() => { order.push('top'); return false })
  assert.equal(handleBack(), true)      // 最终被 bottom 消费
  assert.deepEqual(order, ['top', 'bottom'])
  clearBackHandlers()
})

test('handler 返回 undefined 视为已消费（安全优先，不误退）', () => {
  clearBackHandlers()
  pushBackHandler(() => { /* 关闭某层但不显式 return */ })
  assert.equal(handleBack(), true)
  clearBackHandlers()
})

test('注销函数只移除自己，不误删其他 handler', () => {
  clearBackHandlers()
  const calls = []
  const un1 = pushBackHandler(() => { calls.push(1); return true })
  pushBackHandler(() => { calls.push(2); return true })
  un1() // 注销第一个
  handleBack()
  assert.deepEqual(calls, [2]) // 只剩第二个被调用
  clearBackHandlers()
})

test('重复注销同一函数是安全的（幂等）', () => {
  clearBackHandlers()
  const un = pushBackHandler(() => true)
  un(); un(); un()
  assert.equal(backStackDepth(), 0)
  assert.equal(handleBack(), false)
})

test('push 非函数返回空注销函数且不入栈', () => {
  clearBackHandlers()
  const un = pushBackHandler('not-a-function')
  assert.equal(typeof un, 'function')
  assert.equal(backStackDepth(), 0)
  un() // 不报错
})

test('聊天页临时层关闭顺序：灯泡图 → 搜索 → 多选（模拟栈行为）', () => {
  clearBackHandlers()
  // 模拟 App.tsx 里按层级注册：每个组件挂载时注册自己，栈顶即最上层。
  const state = { lightbox: true, searchOpen: true, selectMode: true }
  const closeAll = () => {
    if (state.lightbox) { state.lightbox = false; return true }
    if (state.searchOpen) { state.searchOpen = false; return true }
    if (state.selectMode) { state.selectMode = false; return true }
    return false
  }
  pushBackHandler(closeAll)
  assert.equal(handleBack(), true); assert.equal(state.lightbox, false)
  assert.equal(handleBack(), true); assert.equal(state.searchOpen, false)
  assert.equal(handleBack(), true); assert.equal(state.selectMode, false)
  assert.equal(handleBack(), false) // 全关完 → 放行退出
  clearBackHandlers()
})
