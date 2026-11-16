// 应用锁桥：只在 Android 原生壳里可用；浏览器/桌面返回 unavailable。
const BRIDGE = 'AiHomeSystem'

function sys() {
  if (typeof window === 'undefined') return null
  const b = window[BRIDGE]
  return b && typeof b.appLockStatus === 'function' ? b : null
}

export function appLockAvailable() {
  return !!sys()
}

export function appLockStatus() {
  const b = sys()
  if (!b) return null
  try { return JSON.parse(b.appLockStatus()) } catch { return null }
}

export function appLockApps() {
  const b = sys()
  if (!b) return []
  try {
    const list = JSON.parse(b.appLockApps())
    return Array.isArray(list) ? list : []
  } catch { return [] }
}

export function appLockSetLocked(pkg, locked) {
  const b = sys()
  if (!b) return false
  try { return !!JSON.parse(b.appLockSetLocked(pkg, !!locked)).ok } catch { return false }
}

export function appLockSetPin(pin) {
  const b = sys()
  if (!b) return { ok: false, error: '当前环境不支持' }
  try { return JSON.parse(b.appLockSetPin(String(pin || ''))) } catch { return { ok: false, error: '保存失败' } }
}

export function appLockOpenSettings() {
  const b = sys()
  try { b?.appLockOpenSettings?.() } catch { /* 忽略 */ }
}
