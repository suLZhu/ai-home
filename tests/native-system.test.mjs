import test from 'node:test'
import assert from 'node:assert/strict'
import {
  systemBridgeAvailable, readSystemCapabilities, openSystemSetting,
  showSystemNotification, syncSystemChannels, syncSystemAlarms,
  consumePendingOpen, readNativeDelivered, registerSystemHandlers,
} from '../src/nativeSystem.mjs'

function mockBridge(over = {}) {
  const calls = []
  const bridge = {
    status: () => JSON.stringify({ sdk: 34, notifications: true }),
    open: (json) => { calls.push(['open', JSON.parse(json)]) },
    notify: (json) => { calls.push(['notify', JSON.parse(json)]); return true },
    syncChannels: (json) => { calls.push(['syncChannels', JSON.parse(json)]) },
    syncAlarms: (json) => { calls.push(['syncAlarms', JSON.parse(json)]); return JSON.stringify({ registered: 2, exact: true, degraded: false }) },
    pendingOpen: () => JSON.stringify({ assistantId: 'assistant-yanweixi', conversationId: 'conv-1' }),
    deliveredKeys: () => JSON.stringify(['task:local-t1-100']),
    ...over,
  }
  globalThis.AiHomeSystem = bridge
  return { bridge, calls }
}

function clearBridge() {
  delete globalThis.AiHomeSystem
}

test('桌面 / 浏览器没有原生桥：全部静默降级，绝不伪造状态或通知', () => {
  clearBridge()
  assert.equal(systemBridgeAvailable(), false)
  assert.equal(readSystemCapabilities(), null)
  assert.equal(openSystemSetting('notifications', false, 34), false)
  assert.equal(showSystemNotification({ key: 'a' }), false)
  assert.equal(syncSystemChannels([{ id: 'x' }]), false)
  assert.equal(syncSystemAlarms([]), null)
  assert.equal(consumePendingOpen(), null)
  assert.deepEqual(readNativeDelivered(), [])
})

test('状态读取兼容 JSON 字符串与对象，坏数据返回 null', () => {
  const { bridge } = mockBridge()
  assert.equal(systemBridgeAvailable(), true)
  assert.deepEqual(readSystemCapabilities(), { sdk: 34, notifications: true })
  bridge.status = () => ({ sdk: 33 })
  assert.deepEqual(readSystemCapabilities(), { sdk: 33 })
  bridge.status = () => '{bad'
  assert.equal(readSystemCapabilities(), null)
  clearBridge()
})

test('点击状态行：只把白名单 action 交给原生层', () => {
  const { calls } = mockBridge()
  assert.equal(openSystemSetting('notifications', false, 34), true)
  assert.equal(openSystemSetting('notifications', false, 32), true)
  assert.equal(openSystemSetting('lockScreen', true, 34), true)
  assert.equal(openSystemSetting('background', false, 34), true)
  assert.equal(openSystemSetting('battery', false, 34), true)
  assert.equal(openSystemSetting('battery', true, 34), true)
  assert.equal(openSystemSetting('overlay', false, 34), true, '悬浮窗权限检测 / 跳转')
  assert.equal(openSystemSetting('exactAlarm', false, 34), true)
  assert.equal(openSystemSetting('bootRestore', false, 34), true)
  assert.deepEqual(calls.map(([, p]) => p.action), [
    'notification_permission', 'app_notification_settings', 'app_notification_settings',
    'app_details', 'battery_optimization_request', 'battery_optimization_settings',
    'overlay_permission', 'exact_alarm_permission', 'autostart_settings',
  ])
  assert.equal(calls[0][1].key, 'notifications')
  assert.equal(calls[0][1].ok, false)
  clearBridge()
})

test('发通知：只在原生层返回 true 时算成功，异常不冒泡', () => {
  const { bridge, calls } = mockBridge()
  assert.equal(showSystemNotification(null), false)
  assert.equal(showSystemNotification({ title: 'x' }), false, '缺稳定 ID 不发')
  const payload = { key: 'task:local-t1-100', title: '晏未晞', body: '记得去洗衣服哦……', assistantId: 'assistant-yanweixi', conversationId: 'conv-1' }
  assert.equal(showSystemNotification(payload), true)
  assert.deepEqual(calls[0][1], payload)
  bridge.notify = () => false
  assert.equal(showSystemNotification(payload), false, '未授权 / 已投递时不算成功')
  bridge.notify = () => { throw new Error('bridge dead') }
  assert.equal(showSystemNotification(payload), false)
  clearBridge()
})

test('渠道与闹钟同步：按助手清单动态创建渠道，缺精确权限时返回降级标记', () => {
  const { bridge, calls } = mockBridge()
  const channels = [
    { id: 'system', channelId: 'aihome.system', channelName: '定时任务 / 系统消息' },
    { id: 'assistant-yanweixi', channelId: 'aihome.msg.assistant-yanweixi', channelName: '晏未晞消息' },
    { id: 'assistant-yanshuo', channelId: 'aihome.msg.assistant-yanshuo', channelName: '言朔消息' },
  ]
  assert.equal(syncSystemChannels(channels), true)
  assert.deepEqual(calls.find(c => c[0] === 'syncChannels')[1].channels, channels)
  assert.equal(syncSystemChannels(null), true)
  assert.deepEqual(calls.filter(c => c[0] === 'syncChannels')[1][1].channels, [])

  const plan = [{ runId: 'local-t1-100', at: Date.now() + 60000, key: 'task:local-t1-100' }]
  assert.deepEqual(syncSystemAlarms(plan), { registered: 2, exact: true, degraded: false })
  assert.deepEqual(calls.find(c => c[0] === 'syncAlarms')[1].tasks, plan)
  bridge.syncAlarms = () => JSON.stringify({ registered: 2, exact: false, degraded: true })
  assert.equal(syncSystemAlarms(plan).degraded, true, '精确定时权限缺失走降级路径')
  bridge.syncAlarms = () => null
  assert.equal(syncSystemAlarms(plan), null)
  clearBridge()
})

test('冷启动 / 热启动通知点击：取出即清空，且携带正确会话参数', () => {
  let pending = JSON.stringify({ assistantId: 'assistant-yanweixi', conversationId: 'conv-9' })
  mockBridge({ pendingOpen: () => { const p = pending; pending = ''; return p } })
  assert.deepEqual(consumePendingOpen(), { assistantId: 'assistant-yanweixi', conversationId: 'conv-9' })
  assert.equal(consumePendingOpen(), null, '一次点击只路由一次')
  clearBridge()
})

test('原生已投递键：用于 App 恢复前台时压住重复通知', () => {
  const { bridge } = mockBridge()
  assert.deepEqual(readNativeDelivered(), ['task:local-t1-100'])
  bridge.deliveredKeys = () => '{"not":"array"}'
  assert.deepEqual(readNativeDelivered(), [])
  bridge.deliveredKeys = () => { throw new Error('dead') }
  assert.deepEqual(readNativeDelivered(), [])
  clearBridge()
})

test('原生回调：多个订阅者、通知点击 / 任务触发 / 状态变更，注销后不再收到', () => {
  clearBridge()
  const a = { open: [], task: [], status: 0 }
  const b = { open: [], status: 0 }
  const un1 = registerSystemHandlers({
    onOpen: (p) => a.open.push(p), onTaskFire: (id) => a.task.push(id), onStatusChanged: () => { a.status++ },
  })
  const un2 = registerSystemHandlers({ onOpen: (p) => b.open.push(p), onStatusChanged: () => { b.status++ } })
  assert.equal(typeof globalThis.__aihomeNotificationOpen, 'function')
  assert.equal(typeof globalThis.__aihomeTaskFire, 'function')
  assert.equal(typeof globalThis.__aihomeSystemStatusChanged, 'function')
  assert.equal(typeof globalThis.__aihomeSystemResume, 'function')

  globalThis.__aihomeNotificationOpen(JSON.stringify({ assistantId: 'assistant-yanweixi', conversationId: 'conv-1' }))
  globalThis.__aihomeTaskFire('local-t1-100')
  globalThis.__aihomeSystemStatusChanged()
  assert.deepEqual(a.open, [{ assistantId: 'assistant-yanweixi', conversationId: 'conv-1' }])
  assert.deepEqual(b.open, [{ assistantId: 'assistant-yanweixi', conversationId: 'conv-1' }])
  assert.deepEqual(a.task, ['local-t1-100'])
  assert.equal(a.status, 1)
  assert.equal(b.status, 1)
  un1()
  un2()
  globalThis.__aihomeSystemStatusChanged()
  assert.equal(a.status, 1)
  assert.equal(b.status, 1)
})

test('原生 onResume 早于 React 挂载时，通知点击不会丢失', () => {
  clearBridge()
  // 没有订阅者：onResume 取走 pending 后先暂存，App 挂载时再取一次即可路由。
  mockBridge({ pendingOpen: () => JSON.stringify({ assistantId: 'assistant-yanshuo', conversationId: 'conv-2' }) })
  globalThis.__aihomeSystemResume()
  assert.deepEqual(consumePendingOpen(), { assistantId: 'assistant-yanshuo', conversationId: 'conv-2' })
  clearBridge()
})
