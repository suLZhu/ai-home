export type NotificationPrefs = {
  enabled: boolean
  sound: boolean
  vibration: boolean
  proactive: boolean
  autoClear: boolean
}
export const NOTIFICATION_PREFS_KEY: string
export const DEFAULT_NOTIFICATION_PREFS: Readonly<NotificationPrefs>
export function readNotificationPrefs(storage?: Storage): NotificationPrefs
export function saveNotificationPrefs(next: Partial<NotificationPrefs>, storage?: Storage): NotificationPrefs
