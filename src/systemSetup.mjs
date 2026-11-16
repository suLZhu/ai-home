// 首次进入 / 每次启动时的系统权限引导：只列出「会让到点提醒失效」的项。
// 纯函数，便于单测；真正的跳转仍由原生白名单动作完成。
const CRITICAL = [
  { id: 'notifications', label: '通知权限', need: '没有通知，到点也不会有任何提醒' },
  { id: 'exactAlarm', label: '精确定时', need: '没有精确闹钟，提醒可能晚几分钟' },
  { id: 'fullScreen', label: '全屏提醒', need: '锁屏只会弹普通横幅，不会全屏弹出' },
  { id: 'battery', label: '电池优化', need: '被系统限制后台时，闹钟可能延迟' },
]

/**
 * caps 来自 normalizeCapabilities()；返回还缺的项（按上面的优先级）。
 * 没有原生桥 / 全部正常 → 空数组，引导层不显示。
 */
export function missingSetupRows(caps) {
  if (!caps || !caps.available || !Array.isArray(caps.rows)) return []
  const byId = Object.fromEntries(caps.rows.map(row => [row.id, row]))
  return CRITICAL
    .filter(item => byId[item.id] && byId[item.id].ok !== true)
    .map(item => ({
      id: item.id,
      label: item.label,
      hint: byId[item.id].hint || item.need,
      status: byId[item.id].status,
      action: byId[item.id].action,
      sdk: caps.sdk,
    }))
}
