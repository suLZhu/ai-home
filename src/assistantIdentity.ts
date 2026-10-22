// Version 3 identity migration. Pure functions: never write or delete legacy data here.
export type AssistantRecord = { id: string; name: string; createdAt: string }
export const LEGACY_ASSISTANTS = [
  { id: 'assistant-yanweixi', name: '晏未晞' },
  { id: 'assistant-yanshuo', name: '言朔' },
] as const
// 默认显示名：只影响「从未被用户改过名」的助手展示，不参与 legacyId 迁移映射（映射仍按旧名字）。
export const DEFAULT_DISPLAY_NAMES: Record<string, string> = {
  'assistant-yanweixi': '默认助手',
  'assistant-yanshuo': '默认助手2号',
}
const identityFields = ['messages', 'conversations', 'activeConversationIds', 'memory', 'memoryEntries', 'prompt', 'characters', 'worldbook', 'mcpConnections', 'tasks'] as const
type Snapshot = Record<string, any>
const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const legacyId = (name: string) => LEGACY_ASSISTANTS.find(a => a.name === name)?.id ?? name
export function migrateAssistantSnapshot(input: Snapshot): Snapshot {
  // Idempotent: a migrated snapshot must not lose later edits or new assistants.
  if (input.version >= 3 && Array.isArray(input.assistants)) return input
  const createdAt = new Date(0).toISOString()
  const output: Snapshot = { ...input, version: 3, assistants: LEGACY_ASSISTANTS.map(a => ({ ...a, createdAt })) }
  for (const field of identityFields) {
    const value = input[field]
    if (!isObject(value)) continue
    const mapped: Record<string, any> = {}
    for (const [name, data] of Object.entries(value)) {
      const id = legacyId(name)
      mapped[id] = field === 'conversations' && Array.isArray(data)
        ? data.map(c => ({ ...c, assistantId: id, conversationId: c.conversationId || c.id }))
        : field === 'mcpConnections' && Array.isArray(data)
          ? data.map(c => ({ ...c, assistantId: id }))
          : data
    }
    output[field] = mapped
  }
  if (Array.isArray(input.worldEntries)) {
    output.worldEntries = input.worldEntries.map((entry: any) => ({
      ...entry,
      boundAssistantIds: (Array.isArray(entry.boundCharacters) ? entry.boundCharacters : entry.boundCharacter ? [entry.boundCharacter] : ['晏未晞']).map(legacyId),
    }))
  }
  return output
}
export function addAssistant(snapshot: Snapshot, id: string, name: string): Snapshot {
  if (!/^assistant-[a-zA-Z0-9-]{8,}$/.test(id)) throw new Error('Invalid assistant ID')
  if (!name.trim()) throw new Error('Assistant name is required')
  if (snapshot.assistants?.some((a: AssistantRecord) => a.id === id)) throw new Error('Duplicate assistant ID')
  const result: Snapshot = { ...snapshot, assistants: [...(snapshot.assistants || []), { id, name: name.trim(), createdAt: new Date().toISOString() }] }
  for (const field of identityFields) {
    if (!isObject(result[field])) continue
    const defaults: Record<string, any> = { messages: [], conversations: [], activeConversationIds: '', memory: '', memoryEntries: [], prompt: '', characters: null, worldbook: '', mcpConnections: [], tasks: [] }
    result[field] = { ...result[field], [id]: defaults[field] }
  }
  return result
}
