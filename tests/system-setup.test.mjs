// 启动权限引导：只列会影响到点提醒的项，按优先级，全部就绪时不显示。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCapabilities } from '../src/systemCapabilities.mjs'
import { missingSetupRows } from '../src/systemSetup.mjs'

const base = { sdk: 34, notifications: true, lockScreen: true, background: true, battery: true, overlay: true, exactAlarm: true, fullScreen: true, bootRestore: true }

test('没有原生桥 / 全部就绪 → 不显示引导', () => {
  assert.deepEqual(missingSetupRows(null), [])
  assert.deepEqual(missingSetupRows(normalizeCapabilities(base)), [])
})

test('缺哪些列哪些，按通知 → 精确定时 → 全屏 → 电池排序', () => {
  const caps = normalizeCapabilities({ ...base, notifications: false, exactAlarm: false, fullScreen: false, battery: false })
  assert.deepEqual(missingSetupRows(caps).map(r => r.id), ['notifications', 'exactAlarm', 'fullScreen', 'battery'])
})

test('只缺一项时只列一项，并带原生目标动作', () => {
  const caps = normalizeCapabilities({ ...base, exactAlarm: false })
  const rows = missingSetupRows(caps)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'exactAlarm')
  assert.equal(rows[0].action, 'exact_alarm_permission')
  assert.match(rows[0].hint, /精确闹钟/)
})

test('老系统没有 fullScreen 字段时不误报', () => {
  const caps = normalizeCapabilities({ ...base, sdk: 33, notifications: false })
  const rows = missingSetupRows(caps)
  assert.deepEqual(rows.map(r => r.id), ['notifications'])
})

test('锁屏 / 后台 / 开机恢复不在引导里（由系统页单独展示）', () => {
  const caps = normalizeCapabilities({ ...base, lockScreen: false, background: false, bootRestore: false })
  assert.deepEqual(missingSetupRows(caps), [])
})
