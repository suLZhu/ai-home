// Optional per-assistant chat capabilities. No location permission or inferred location.
export const CHAT_TOOL_PREFS_KEY = 'ai-home.chatToolPrefs'
export const DEFAULT_CHAT_TOOL_PREFS = Object.freeze({ time: true, weather: false, tools: true, city: '' })
export function normalizeChatToolPrefs(raw) {
  const value = raw && typeof raw === 'object' ? raw : {}
  return {
    time: typeof value.time === 'boolean' ? value.time : true,
    weather: value.weather === true,
    tools: typeof value.tools === 'boolean' ? value.tools : true,
    city: typeof value.city === 'string' ? value.city.slice(0, 80) : '',
  }
}
export function normalizeAssistantChatToolPrefs(raw, ids) {
  const source = raw && typeof raw === 'object' ? raw : {}
  return Object.fromEntries(ids.map(id => [id, normalizeChatToolPrefs(source[id])]))
}
