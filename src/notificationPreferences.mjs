export const NOTIFICATION_PREFS_KEY = 'qijian.notification.preferences.v1'
export const DEFAULT_NOTIFICATION_PREFS = Object.freeze({
  enabled: true, sound: true, vibration: true, proactive: true, autoClear: true,
})
export function readNotificationPrefs(storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage?.getItem(NOTIFICATION_PREFS_KEY) || '{}')
    return { ...DEFAULT_NOTIFICATION_PREFS, ...Object.fromEntries(
      Object.keys(DEFAULT_NOTIFICATION_PREFS).map(key => [key, typeof raw?.[key] === 'boolean' ? raw[key] : DEFAULT_NOTIFICATION_PREFS[key]])
    ) }
  } catch { return { ...DEFAULT_NOTIFICATION_PREFS } }
}
export function saveNotificationPrefs(next, storage = globalThis.localStorage) {
  const prefs = { ...readNotificationPrefs(storage), ...next }
  try { storage?.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs)) } catch { /* private mode */ }
  return prefs
}
