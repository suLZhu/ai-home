import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CAPABILITY_ROWS, normalizeCapabilities, capabilitySummary, systemSettingTarget, normalizeAlarm,
} from '../src/systemCapabilities.mjs'

const ALL_OK = {
  sdk: 34, notifications: true, lockScreen: true, background: true,
  battery: true, overlay: true, exactAlarm: true, bootRestore: true,
  alarm: { registered: 3, exact: true, degraded: false, lastRestoreAt: '2026-11-12T01:00:00.000Z', deliveredCount: 2 },
}

test('没有原生桥时绝不伪造系统状态：7 行全部显示「不可用」', () => {
  const caps = normalizeCapabilities(null)
  assert.equal(caps.available, false)
  assert.equal(caps.sdk, 0)
  assert.equal(caps.rows.length, 7)
  assert.deepEqual(caps.rows.map(r => r.id), CAPABILITY_ROWS.map(r => r.id))
  for (const row of caps.rows) {
    assert.equal(row.status, '不可用')
    assert.equal(row.ok, false)
    assert.equal(row.hint, '', '桌面不显示假的权限说明')
  }
  assert.equal(caps.alarm.registered, 0)
  assert.equal(caps.alarm.degraded, false)
  assert.deepEqual(capabilitySummary(caps), { ok: 0, total: 7 })
})

test('全部正常时只显示状态，不写教学文案', () => {
  const caps = normalizeCapabilities(ALL_OK)
  assert.equal(caps.available, true)
  assert.equal(caps.sdk, 34)
  assert.equal(caps.rows.length, 7)
  assert.deepEqual(caps.rows.map(r => r.status), CAPABILITY_ROWS.map(r => r.okLabel))
  assert.ok(caps.rows.every(r => r.ok && r.hint === ''))
  assert.deepEqual(capabilitySummary(caps), { ok: 7, total: 7 })
  assert.equal(caps.alarm.registered, 3)
  assert.equal(caps.alarm.exact, true)
  assert.equal(caps.alarm.lastRestoreAt, '2026-11-12T01:00:00.000Z')
})

test('异常项显示对应状态与一行短句，正常项保持干净', () => {
  const caps = normalizeCapabilities({ ...ALL_OK, notifications: false, battery: false, overlay: false, exactAlarm: false })
  const byId = Object.fromEntries(caps.rows.map(r => [r.id, r]))
  assert.equal(byId.notifications.status, '未授权')
  assert.match(byId.notifications.hint, /点此开启/)
  assert.equal(byId.battery.status, '未豁免')
  assert.equal(byId.overlay.status, '未授权')
  assert.equal(byId.exactAlarm.status, '受限制')
  assert.equal(byId.background.status, '正常')
  assert.equal(byId.background.hint, '')
  assert.equal(byId.lockScreen.status, '可用')
  assert.equal(byId.bootRestore.status, '正常')
  assert.deepEqual(capabilitySummary(caps), { ok: 3, total: 7 })
})

test('状态值兼容布尔 / 数字 / 字符串，坏数据不会变成「已开启」', () => {
  const caps = normalizeCapabilities({ sdk: '35', notifications: 1, battery: 'true', overlay: 'false', background: 'yes' })
  const byId = Object.fromEntries(caps.rows.map(r => [r.id, r]))
  assert.equal(caps.sdk, 35)
  assert.equal(byId.notifications.ok, true)
  assert.equal(byId.battery.ok, true)
  assert.equal(byId.overlay.ok, false)
  assert.equal(byId.background.ok, false)
})

test('每项都映射到正确的系统设置 / 权限申请目标', () => {
  assert.equal(systemSettingTarget('notifications', false, 34), 'notification_permission')
  assert.equal(systemSettingTarget('notifications', false, 32), 'app_notification_settings')
  assert.equal(systemSettingTarget('notifications', true, 34), 'app_notification_settings')
  assert.equal(systemSettingTarget('lockScreen', true, 34), 'app_notification_settings')
  assert.equal(systemSettingTarget('background', false, 34), 'app_details')
  assert.equal(systemSettingTarget('battery', false, 34), 'battery_optimization_request')
  assert.equal(systemSettingTarget('battery', true, 34), 'battery_optimization_settings')
  assert.equal(systemSettingTarget('overlay', false, 34), 'overlay_permission')
  assert.equal(systemSettingTarget('exactAlarm', false, 34), 'exact_alarm_permission')
  assert.equal(systemSettingTarget('exactAlarm', true, 34), 'app_details')
  assert.equal(systemSettingTarget('bootRestore', false, 34), 'autostart_settings')
  assert.equal(systemSettingTarget('unknown'), 'app_details')
})

test('归一化后的行自带目标 action，页面不需要再判断系统版本', () => {
  const caps = normalizeCapabilities({ ...ALL_OK, sdk: 33, notifications: false, exactAlarm: false })
  const byId = Object.fromEntries(caps.rows.map(r => [r.id, r]))
  assert.equal(byId.notifications.action, 'notification_permission')
  assert.equal(byId.exactAlarm.action, 'exact_alarm_permission')
  assert.equal(byId.overlay.action, 'overlay_permission')
})

test('闹钟状态归一化：非法值不放大、不伪造', () => {
  assert.deepEqual(normalizeAlarm(null), { registered: 0, exact: false, degraded: false, lastRestoreAt: '', deliveredCount: 0 })
  assert.deepEqual(normalizeAlarm({ registered: '7', exact: 1, degraded: 'true', deliveredCount: '2.5' }), {
    registered: 7, exact: true, degraded: true, lastRestoreAt: '', deliveredCount: 2.5,
  })
  assert.equal(normalizeAlarm({ registered: -9, deliveredCount: -1 }).registered, 0)
  assert.equal(normalizeAlarm({ registered: Infinity }).registered, 0)
})
