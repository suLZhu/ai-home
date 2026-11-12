// Android 系统能力：把原生层返回的「真实状态」收敛成设置页的行模型。
// 纯函数，不碰 DOM / 存储 / 系统 API；桌面没有原生桥时绝不伪造状态。
// 原生层只做：检测 → 简短说明 → 申请权限或跳转系统设置，绝不假装能改系统策略。

export const CAPABILITY_ROWS = [
  { id: 'notifications', label: '通知权限', okLabel: '已开启', badLabel: '未授权' },
  { id: 'lockScreen', label: '锁屏通知', okLabel: '可用', badLabel: '需系统设置' },
  { id: 'background', label: '后台运行', okLabel: '正常', badLabel: '受限制' },
  { id: 'battery', label: '电池优化', okLabel: '已豁免', badLabel: '未豁免' },
  { id: 'overlay', label: '悬浮窗', okLabel: '已授权', badLabel: '未授权' },
  { id: 'exactAlarm', label: '精确定时', okLabel: '可用', badLabel: '受限制' },
  { id: 'bootRestore', label: '开机恢复', okLabel: '正常', badLabel: '异常' },
]

// 只在异常时显示的短句；不写教学文案。
const HINTS = {
  notifications: '未授权通知，点此开启',
  lockScreen: '系统或通知渠道隐藏了锁屏内容',
  background: '系统限制了后台活动，点此查看',
  battery: '受电池优化限制，点此申请豁免',
  overlay: '未授权悬浮窗，点此开启',
  exactAlarm: '未获精确闹钟权限，任务可能延迟',
  bootRestore: '检查系统自启动与开机广播',
}

// 每个能力对应的 Android 目标动作（token 白名单在原生层落地）。
// 有权限时点进去仍可进对应设置页查看/撤销；没权限时先申请或直达正确页面。
export function systemSettingTarget(id, ok = false, sdk = 0) {
  switch (id) {
    case 'notifications':
      return !ok && sdk >= 33 ? 'notification_permission' : 'app_notification_settings'
    case 'lockScreen': return 'app_notification_settings'
    case 'background': return 'app_details'
    case 'battery': return ok ? 'battery_optimization_settings' : 'battery_optimization_request'
    case 'overlay': return 'overlay_permission'
    case 'exactAlarm': return ok ? 'app_details' : 'exact_alarm_permission'
    case 'bootRestore': return 'autostart_settings'
    default: return 'app_details'
  }
}

function truthy(v) { return v === true || v === 1 || v === 'true' || v === '1' }

export function normalizeAlarm(raw) {
  const a = raw && typeof raw === 'object' ? raw : {}
  return {
    registered: Number.isFinite(Number(a.registered)) ? Math.max(0, Number(a.registered)) : 0,
    exact: truthy(a.exact),
    degraded: truthy(a.degraded),
    lastRestoreAt: String(a.lastRestoreAt || ''),
    deliveredCount: Number.isFinite(Number(a.deliveredCount)) ? Math.max(0, Number(a.deliveredCount)) : 0,
  }
}

/**
 * raw 来自 AiHomeSystem.status() 的解析结果；null / 非对象 = 没有原生层。
 * 返回的 rows 始终有 7 行，但 desktop 只显示「不可用」，不显示假的开关状态。
 */
export function normalizeCapabilities(raw) {
  const source = raw && typeof raw === 'object' ? raw : null
  const sdk = Number.isFinite(Number(source?.sdk)) ? Number(source.sdk) : 0
  const rows = CAPABILITY_ROWS.map((r) => {
    const ok = source ? truthy(source[r.id]) : false
    return {
      ...r,
      ok,
      status: source ? (ok ? r.okLabel : r.badLabel) : '不可用',
      hint: source && !ok ? HINTS[r.id] : '',
      action: systemSettingTarget(r.id, ok, sdk),
    }
  })
  return { available: !!source, sdk, rows, alarm: normalizeAlarm(source?.alarm) }
}

export function capabilitySummary(caps) {
  const rows = caps?.rows || []
  return { ok: rows.filter((r) => r.ok).length, total: rows.length }
}
