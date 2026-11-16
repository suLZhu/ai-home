// 软键盘高度判定（computeKeyboardState）纯逻辑单测。
// 覆盖两条检测路径：visualViewport 重叠（Android <11 ADJUST_RESIZE）与原生 ime 兜底
// （Android 11+ edge-to-edge 窗口不随 IME 缩小）。这条逻辑直接决定顶栏是否被顶进状态栏、
// 输入区是否贴键盘上沿，必须可单测、不能靠真机偶发复现。
import test from 'node:test'
import assert from 'node:assert/strict'
import { computeKeyboardState } from '../src/keyboardViewport.mjs'

test('无键盘：visualViewport 无重叠且无原生 ime，判定关闭', () => {
  const st = computeKeyboardState({ innerHeight: 800, vvHeight: 800, vvOffsetTop: 0, innerWidth: 390, nativeIme: 0 })
  assert.equal(st.open, false)
  assert.equal(st.source, 'none')
  assert.equal(st.height, 0)
})

test('visualViewport 检测到键盘重叠：用 vv.height 封顶可视高度', () => {
  // 窗口随键盘缩小：innerHeight 800，vv.height 600，重叠 200。
  const st = computeKeyboardState({ innerHeight: 800, vvHeight: 600, vvOffsetTop: 0, innerWidth: 390, nativeIme: 0 })
  assert.equal(st.open, true)
  assert.equal(st.source, 'visualViewport')
  assert.equal(st.height, 200)
  assert.equal(st.visualHeight, 600)
})

test('visualViewport 带 offsetTop：重叠要扣除 offsetTop', () => {
  const st = computeKeyboardState({ innerHeight: 800, vvHeight: 650, vvOffsetTop: 20, innerWidth: 390, nativeIme: 0 })
  assert.equal(st.height, 130)
})

test('桌面宽屏不误判为键盘（innerWidth>700 时 visualViewport 不触发）', () => {
  const st = computeKeyboardState({ innerHeight: 1000, vvHeight: 700, vvOffsetTop: 0, innerWidth: 1280, nativeIme: 0 })
  assert.equal(st.open, false)
})

test('原生 ime 兜底：visualViewport 未缩小但 --native-ime-bottom>90 时启用', () => {
  // Android 11+：窗口不缩小（vvHeight==innerHeight），但原生回传 ime=300。
  const st = computeKeyboardState({ innerHeight: 800, vvHeight: 800, vvOffsetTop: 0, innerWidth: 390, nativeIme: 300 })
  assert.equal(st.open, true)
  assert.equal(st.source, 'native')
  assert.equal(st.height, 300)
  // 窗口未缩小，可视高度需自己减掉键盘，把输入区顶到键盘上沿。
  assert.equal(st.visualHeight, 500)
})

test('原生 ime 小于阈值（<=90）不触发，避免手势条等误判', () => {
  const st = computeKeyboardState({ innerHeight: 800, vvHeight: 800, vvOffsetTop: 0, innerWidth: 390, nativeIme: 60 })
  assert.equal(st.open, false)
})

test('原生 ime 优先于已失效的 visualViewport 重叠：两者都给时也走原生路径', () => {
  const st = computeKeyboardState({ innerHeight: 800, vvHeight: 800, vvOffsetTop: 0, innerWidth: 390, nativeIme: 320 })
  assert.equal(st.source, 'native')
  assert.equal(st.height, 320)
})
