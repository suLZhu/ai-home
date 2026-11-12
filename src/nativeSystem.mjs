// Android 原生系统能力桥的 JS 侧通道（与 AiHomeOAuth 同一套 WebView JS 接口）。
// 桌面浏览器没有原生层：所有调用都安静返回 false / null，绝不伪造权限状态或通知。
// 390×844 探针可以注入同名 mock 桥来验证完整链路。

import { systemSettingTarget } from './systemCapabilities.mjs'

const BRIDGE = 'AiHomeSystem'
const CALLBACKS = {
  open: '__aihomeNotificationOpen',
  task: '__aihomeTaskFire',
  status: '__aihomeSystemStatusChanged',
}

function bridge() {
  try {
    const b = globalThis[BRIDGE]
    return b && typeof b.status === 'function' ? b : null
  } catch { return null }
}

export function systemBridgeAvailable() { return !!bridge() }

function parse(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try { return JSON.parse(String(raw)) } catch { return null }
}

export function readSystemCapabilities() { return parse(bridge()?.status?.()) }

/** 只把「要跳哪个系统页」告诉原生层；目标 token 在 Java 侧有白名单，不接受任意 Intent。 */
export function openSystemSetting(id, ok = false, sdk = 0) {
  const b = bridge()
  if (!b || typeof b.open !== 'function') return false
  const action = systemSettingTarget(id, ok, sdk)
  try { b.open(JSON.stringify({ key: String(id), action, ok: !!ok })); return true } catch { return false }
}

export function showSystemNotification(payload) {
  const b = bridge()
  if (!b || typeof b.notify !== 'function' || !payload || !payload.key) return false
  try { return b.notify(JSON.stringify(payload)) === true } catch { return false }
}

export function syncSystemChannels(channels) {
  const b = bridge()
  if (!b || typeof b.syncChannels !== 'function') return false
  try { b.syncChannels(JSON.stringify({ channels: Array.isArray(channels) ? channels : [] })); return true } catch { return false }
}

export function syncSystemAlarms(plan) {
  const b = bridge()
  if (!b || typeof b.syncAlarms !== 'function') return null
  try { return parse(b.syncAlarms(JSON.stringify({ tasks: Array.isArray(plan) ? plan : [] }))) } catch { return null }
}

/** 冷启动：通知点击时 WebView 还没起来，原生层把 payload 存住，等页面来取。 */
export function consumePendingOpen() {
  if (unhandledOpen) {
    const payload = unhandledOpen
    unhandledOpen = null
    return payload
  }
  const b = bridge()
  if (!b || typeof b.pendingOpen !== 'function') return null
  try { return parse(b.pendingOpen()) } catch { return null }
}

export function readNativeDelivered() {
  const b = bridge()
  if (!b || typeof b.deliveredKeys !== 'function') return []
  try {
    const value = parse(b.deliveredKeys())
    return Array.isArray(value) ? value.map(String) : []
  } catch { return [] }
}

// ── 原生 → JS 的三个回调：允许多个订阅者（App 与设置页各注册一份） ───────────
const handlers = new Set()
let installed = false
// 原生 onResume 可能早于 React 挂载：没人接住的通知点击先存在这里，
// App 挂载时 consumePendingOpen() 会优先取走，绝不丢一次点击。
let unhandledOpen = null

function emit(type, payload) {
  let handled = false
  for (const h of [...handlers]) {
    try {
      if (type === 'open') { if (h.onOpen) { h.onOpen(payload); handled = true } }
      else if (type === 'task') h.onTaskFire?.(payload)
      else h.onStatusChanged?.()
    } catch { /* 单个订阅者出错不影响其它 */ }
  }
  if (type === 'open' && !handled && payload) unhandledOpen = payload
}

function install() {
  if (installed) return
  installed = true
  try {
    globalThis[CALLBACKS.open] = (payload) => emit('open', parse(payload) || payload)
    globalThis[CALLBACKS.task] = (runId) => emit('task', String(runId ?? ''))
    globalThis[CALLBACKS.status] = () => emit('status')
    // 部分 ROM 从通知回前台不派发 visibilitychange：onResume 由原生补调一次，
    // 这里主动取走冷启动 / 热启动期间攒下的通知点击，只路由一次。
    globalThis.__aihomeSystemResume = () => {
      const pending = consumePendingOpen()
      if (pending) emit('open', pending)
    }
  } catch { /* 桌面无 window 时忽略 */ }
}

export function registerSystemHandlers(handler) {
  install()
  handlers.add(handler)
  return () => handlers.delete(handler)
}
