// 分类备份：模型 / 记忆 / 聊天 / 整体。纯逻辑放这里，文件落盘由原生桥或浏览器下载完成。
export const BACKUP_APP = 'qijian'
export const BACKUP_VERSION = 1
export const BACKUP_DIR_LABEL = '下载/栖间/'
const EXCLUDED_LOCAL_KEYS = new Set(['ai-home.sessionToken'])

export const BACKUP_KINDS = [
  { id: 'models', label: '模型配置', prefix: '模型', desc: '供应商 / 模型 / 绑定 / API Key', keys: ['ai-home.vendors', 'ai-home.modelProfiles', 'ai-home.bindings', 'ai-home.modelConfig', 'ai-home.subscriptions', 'ai-home.apiKey'], serverKeys: true },
  { id: 'memory', label: '记忆', prefix: '记忆', desc: '助手记住的事，含候选/已归档', keys: ['ai-home.local.memoryRecords'], serverMemory: true },
  { id: 'chat', label: '聊天记录', prefix: '聊天', desc: '全部会话与消息', keys: ['ai-home.conversations', 'ai-home.messages', 'ai-home.activeConversationIds'] },
  { id: 'world', label: '世界书', prefix: '世界书', desc: '世界书条目 / 助手世界书内容', keys: ['ai-home.worldEntries', 'ai-home.worldbook'] },
  { id: 'mcp', label: 'MCP', prefix: 'MCP', desc: 'MCP 连接 / 本地服务配置', keys: ['ai-home.mcpConnections', 'ai-home.local.mcp'] },
  { id: 'full', label: '整体数据', prefix: '整体', desc: '以上全部 + 世界书 / 主题 / 偏好', all: true, serverKeys: true, serverMemory: true },
]

export function backupKind(id) {
  return BACKUP_KINDS.find(kind => kind.id === id) || null
}

export function collectBackupLocal(storage, kindId) {
  const kind = backupKind(kindId)
  if (!kind || !storage) throw new Error('未知的备份类型')
  const out = {}
  if (kind.all) {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (!key || !key.startsWith('ai-home.') || EXCLUDED_LOCAL_KEYS.has(key)) continue
      out[key] = storage.getItem(key) || ''
    }
    return out
  }
  for (const key of kind.keys) {
    const value = storage.getItem(key)
    if (typeof value === 'string') out[key] = value
  }
  return out
}

export function localKeysForRestore(payload, kindId) {
  const kind = backupKind(kindId)
  if (!kind) throw new Error('未知的恢复类型')
  if (!payload || payload.app !== BACKUP_APP || !payload.data || typeof payload.data !== 'object') throw new Error('不是栖间的备份文件')
  if (payload.kind === kindId) {
    const source = payload.data.local && typeof payload.data.local === 'object' ? payload.data.local : {}
    // A category restore must never overwrite unrelated settings, even with a malformed file.
    if (kind.all) return Object.fromEntries(Object.entries(source).filter(([key,value]) =>
      key.startsWith('ai-home.') && !EXCLUDED_LOCAL_KEYS.has(key) && typeof value === 'string'))
    return Object.fromEntries((kind.keys || []).filter(key => typeof source[key] === 'string').map(key => [key,source[key]]))
  }
  if (payload.kind === 'full' && kindId !== 'full') {
    const out = {}
    const local = payload.data.local && typeof payload.data.local === 'object' ? payload.data.local : {}
    for (const key of kind.keys || []) if (typeof local[key] === 'string') out[key] = local[key]
    return out
  }
  throw new Error('备份类型不匹配：这是「' + (backupKind(payload.kind)?.label || payload.kind) + '」，不能恢复到「' + kind.label + '」')
}

export function backupFileName(kindId, date = new Date()) {
  const kind = backupKind(kindId)
  if (!kind) throw new Error('未知的备份类型')
  const pad = n => String(n).padStart(2, '0')
  const stamp = date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    + '-' + pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds())
  return '栖间-' + kind.prefix + '-' + stamp + '.json'
}

export function kindFromFileName(name) {
  const text = String(name || '')
  return BACKUP_KINDS.find(kind => text.includes('-' + kind.prefix + '-'))?.id || ''
}

export function parseBackup(text) {
  let payload
  try { payload = JSON.parse(String(text || '')) } catch { throw new Error('备份文件不是有效的 JSON') }
  if (!payload || typeof payload !== 'object' || payload.app !== BACKUP_APP) throw new Error('不是栖间的备份文件')
  if (!backupKind(payload.kind)) throw new Error('备份类型无法识别')
  if (!payload.data || typeof payload.data !== 'object') throw new Error('备份内容为空')
  return payload
}

export function makeBackupEnvelope(kindId, local, server = {}, date = new Date()) {
  return {
    app: BACKUP_APP,
    kind: kindId,
    version: BACKUP_VERSION,
    exportedAt: date.toISOString(),
    data: { local: local || {}, server: server || {} },
  }
}

export function summarizeBackup(payload) {
  const local = payload?.data?.local && typeof payload.data.local === 'object' ? payload.data.local : {}
  const server = payload?.data?.server && typeof payload.data.server === 'object' ? payload.data.server : {}
  const memory = server.memory && typeof server.memory === 'object' ? server.memory : {}
  const memoryCount = Object.values(memory).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0)
  const keys = server.keys && typeof server.keys === 'object' ? server.keys : {}
  return {
    localKeys: Object.keys(local).length,
    memoryPeople: Object.keys(memory).length,
    memoryCount,
    apiKeys: Object.keys(keys).length,
  }
}

/** Parse a chat backup without mutating storage; show the user what will be restored. */
export function summarizeChatBackup(payload) {
  const local = payload?.data?.local || {}
  const tryParse = key => {
    try {
      const raw = local[key]
      return typeof raw === 'string' ? JSON.parse(raw) : null
    } catch { return null }
  }
  const conversations = tryParse('ai-home.conversations')
  const messages = tryParse('ai-home.messages')
  const rows = []
  if (conversations && typeof conversations === 'object') {
    for (const [assistantId, list] of Object.entries(conversations)) {
      if (!Array.isArray(list)) continue
      for (const item of list) {
        if (!item || typeof item !== 'object') continue
        rows.push({
          assistantId,
          title: typeof item.title === 'string' ? item.title : '未命名会话',
          count: Array.isArray(item.messages) ? item.messages.length : 0,
        })
      }
    }
  }
  const messagesCount = rows.reduce((n, x) => n + x.count, 0) ||
    (messages && typeof messages === 'object' ? Object.values(messages).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0) : 0)
  return { conversationCount: rows.length, messagesCount, preview: rows.slice(0, 5) }
}
