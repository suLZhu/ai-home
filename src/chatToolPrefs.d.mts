export type ChatToolPrefs={time:boolean;weather:boolean;tools:boolean;city:string}
export const CHAT_TOOL_PREFS_KEY:string
export const DEFAULT_CHAT_TOOL_PREFS:Readonly<ChatToolPrefs>
export function normalizeChatToolPrefs(raw:unknown):ChatToolPrefs
export function normalizeAssistantChatToolPrefs(raw:unknown, ids:readonly string[]):Record<string,ChatToolPrefs>
