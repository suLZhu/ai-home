export type NotificationPayload = {
  key: string
  kind: string
  channelId: string
  channelName: string
  title: string
  body: string
  summary: string
  at: number
  assistantId: string
  conversationId: string
  runId: string
  messageId: string
  avatar: string
}

export type NotifyDecision = { notify: boolean; reason: string }

export declare const SYSTEM_CHANNEL_ID: string
export declare const SYSTEM_CHANNEL_NAME: string
export declare const NOTIFIED_STORAGE_KEY: string
export declare function assistantChannelId(person: string): string
export declare function channelIdFor(kind: string, person: string): string
export declare function channelNameFor(kind: string, person: string, label: string): string
export declare function channelPlan(people: string[], labelOf?: (id: string) => string, avatarOf?: (id: string) => string): Array<{ id: string; name: string; channelId: string; channelName: string; avatar: string }>
export declare function notificationKey(input: Record<string, unknown>): string
export declare function notificationPayload(input: Record<string, unknown>): NotificationPayload
export declare function loadNotified(storage: Storage, now?: number): Set<string>
export declare function pruneNotified(store: Set<string> | string[]): string[]
export declare function markNotified(storage: Storage, key: string, now?: number): boolean
export declare function decideNotification(input: {
  payload?: NotificationPayload | null
  activePerson?: string
  activeConversationId?: string
  page?: string
  chatOpen?: boolean
  visible?: boolean
  notified?: Set<string> | string[]
  nativeDelivered?: string[]
}): NotifyDecision
export declare function shouldNotify(input: {
  payload?: NotificationPayload | null
  activePerson?: string
  activeConversationId?: string
  page?: string
  chatOpen?: boolean
  visible?: boolean
  notified?: Set<string> | string[]
}): NotifyDecision
export declare function routeFromNotificationOpen(payload: unknown, validPeople: string[]): { person: string; conversationId: string } | null
