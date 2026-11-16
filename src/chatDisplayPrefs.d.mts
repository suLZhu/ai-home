export type ChatDisplayPrefs = {
  assistantAvatar: boolean
  userAvatar: boolean
  assistantName: boolean
  userName: boolean
  time: boolean
  timePos: 'above' | 'below'
  token: boolean
}

export const CHAT_DISPLAY_KEY: string
export const CHAT_DISPLAY_EVENT: string
export const DEFAULT_CHAT_DISPLAY: ChatDisplayPrefs
export function normalizeChatDisplay(raw: unknown): ChatDisplayPrefs
export function loadChatDisplay(): ChatDisplayPrefs
export function saveChatDisplay(next: Partial<ChatDisplayPrefs>): ChatDisplayPrefs
export function formatMessageTime(msg: { at?: string; usage?: { at?: string } }): string
