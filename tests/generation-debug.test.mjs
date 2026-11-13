// generationDebug 纯逻辑单测：环形缓冲裁剪 + entry 构造。
// 这条链路是「真机证据」的基础——若缓冲逻辑出错，后台卡点就无从回查。
import test from 'node:test'
import assert from 'node:assert/strict'
import { appendGenDebugLog, makeGenDebugEntry, GEN_DEBUG_CAP } from '../src/generationDebug.mjs'

test('appendGenDebugLog 不超容量上限，超出从头裁剪', () => {
  let arr = []
  for (let i = 0; i < GEN_DEBUG_CAP + 25; i++) arr = appendGenDebugLog(arr, makeGenDebugEntry('stage' + i, { i }))
  assert.equal(arr.length, GEN_DEBUG_CAP)
  // 最早的 25 条已被裁剪掉
  assert.equal(arr[0].detail.i, 25)
  assert.equal(arr[arr.length - 1].detail.i, GEN_DEBUG_CAP + 24)
})

test('appendGenDebugLog 容纳容量内的数据', () => {
  let arr = []
  for (let i = 0; i < 10; i++) arr = appendGenDebugLog(arr, makeGenDebugEntry('s' + i, null))
  assert.equal(arr.length, 10)
})

test('makeGenDebugEntry 带时间戳与阶段', () => {
  const e = makeGenDebugEntry('stream_receiving', { len: 42 }, 1700000000000)
  assert.equal(e.stage, 'stream_receiving')
  assert.equal(e.detail.len, 42)
  assert.equal(e.t, 1700000000000)
  assert.equal(typeof e.iso, 'string')
})

test('非数组输入被当作空缓冲处理，不抛错', () => {
  const arr = appendGenDebugLog(undefined, makeGenDebugEntry('x', 1))
  assert.equal(arr.length, 1)
})
