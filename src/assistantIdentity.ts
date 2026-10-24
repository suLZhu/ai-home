// Version 3 identity migration. Pure functions: never write or delete legacy data here.
export type AssistantRecord = { id: string; name: string; createdAt: string }
export const LEGACY_ASSISTANTS = [
  { id: 'assistant-yanweixi', name: '晏未晞' },
  { id: 'assistant-yanshuo', name: '言朔' },
] as const
// 中文旧名 → 稳定 assistantId。数据归属只认 id；改显示名不动数据。
export const LEGACY_NAME_TO_ID: Record<string, string> = { '晏未晞': 'assistant-yanweixi', '言朔': 'assistant-yanshuo' }
export const ASSISTANT_IDS: string[] = LEGACY_ASSISTANTS.map(a => a.id)
export function toAssistantId(name: string): string { return LEGACY_NAME_TO_ID[name] || name }
// 默认显示名：只影响「从未被用户改过名」的助手展示，不参与 legacyId 迁移映射（映射仍按旧名字）。
export const DEFAULT_DISPLAY_NAMES: Record<string, string> = {
  'assistant-yanweixi': '默认助手',
  'assistant-yanshuo': '默认助手2号',
}
const identityFields = ['messages', 'conversations', 'activeConversationIds', 'memory', 'memoryEntries', 'prompt', 'characters', 'worldbook', 'mcpConnections', 'tasks', 'modelConfig', 'apiKey'] as const
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
  if (!/^assistant-[a-zA-Z0-9-]{4,}$/.test(id)) throw new Error('Invalid assistant ID')
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

// —— localStorage 一次性迁移（幂等）：把以中文人名为键/后缀的本机数据换成 assistantId。
const PERSON_KEYED_STORAGE = ['ai-home.messages', 'ai-home.conversations', 'ai-home.activeConversationIds', 'ai-home.modelConfig', 'ai-home.apiKey', 'ai-home.memory', 'ai-home.memoryEntries', 'ai-home.prompt', 'ai-home.characters', 'ai-home.worldbook', 'ai-home.mcpConnections', 'ai-home.tasks', 'ai-home.personAppearance'] as const
function remapPersonKeys(value: unknown): unknown {
  if (!isObject(value)) return value
  let changed = false
  const out: Record<string, any> = {}
  for (const [key, item] of Object.entries(value)) {
    const id = legacyId(key)
    if (id !== key) changed = true
    out[id] = item
  }
  return changed ? out : value
}
export function migrateLocalStorage(): void {
  if (typeof localStorage === 'undefined') return
  try {
    for (const key of PERSON_KEYED_STORAGE) {
      const raw = localStorage.getItem(key)
      if (raw === null) continue
      const parsed = JSON.parse(raw)
      const next = remapPersonKeys(parsed)
      if (next !== parsed) localStorage.setItem(key, JSON.stringify(next))
    }
    const worldRaw = localStorage.getItem('ai-home.worldEntries')
    if (worldRaw !== null) {
      const parsed = JSON.parse(worldRaw)
      if (Array.isArray(parsed)) {
        const next = parsed.map((entry: unknown) => isObject(entry)
          ? { ...entry, boundCharacters: (Array.isArray(entry.boundCharacters) ? entry.boundCharacters : entry.boundCharacter ? [entry.boundCharacter] : [LEGACY_ASSISTANTS[0].id]).map((x: unknown) => legacyId(String(x))) }
          : entry)
        localStorage.setItem('ai-home.worldEntries', JSON.stringify(next))
      } else if (isObject(parsed)) {
        // 旧版按人物分组的对象格式 → 展平为数组
        const flat: unknown[] = []
        for (const [name, list] of Object.entries(parsed)) if (Array.isArray(list)) for (const entry of list) if (isObject(entry)) flat.push({ ...entry, boundCharacters: [legacyId(name)] })
        localStorage.setItem('ai-home.worldEntries', JSON.stringify(flat))
      }
    }
    // 带人物后缀的键：ai-home.skills.晏未晞 → ai-home.skills.assistant-yanweixi（只复制，不删旧键）
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k) keys.push(k) }
    for (const key of keys) {
      for (const [name, id] of Object.entries(LEGACY_NAME_TO_ID)) {
        if (key.endsWith('.' + name)) {
          const target = key.slice(0, key.length - name.length) + id
          if (localStorage.getItem(target) === null) localStorage.setItem(target, localStorage.getItem(key) || '')
        }
      }
    }
  } catch { /* 迁移失败不阻塞应用启动；未迁移的键下次启动重试 */ }
}
