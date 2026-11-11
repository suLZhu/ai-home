// 用户设置：每位助手单独记住「怎么称呼用户 / 用户是谁 / 有什么偏好」。
// 纯函数、无 React 依赖；聊天时由 buildUserContext 拼进首条 system 提示，真正影响助手说话。
export const USER_SETTINGS_KEY = 'ai-home.userSettings'

export const BLANK_USER_SETTINGS = {
  callName: '', userName: '', identity: '', relationship: '', preferences: '', notes: '',
}

const str = (v) => String(v ?? '').trim()
const cut = (v, n) => { const s = str(v); return s.length > n ? s.slice(0, n) : s }

export function blankUserSettings() {
  return { ...BLANK_USER_SETTINGS }
}

// 归一化：非法的 / 旧版缺字段的数据一律补齐，按助手 id 过滤，字段限长防止把提示词撑爆。
export function normalizeUserSettings(raw, people) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const ids = Array.isArray(people) ? people : []
  return Object.fromEntries(ids.map(id => {
    const x = src[id] && typeof src[id] === 'object' && !Array.isArray(src[id]) ? src[id] : {}
    return [id, {
      callName: cut(x.callName, 40),
      userName: cut(x.userName, 40),
      identity: cut(x.identity, 120),
      relationship: cut(x.relationship, 120),
      preferences: cut(x.preferences, 600),
      notes: cut(x.notes, 600),
    }]
  }))
}

// 生成注入聊天的用户设定块；一个字段都没填时返回空串（不污染 system 提示）。
export function buildUserContext(settings, extras = {}) {
  const s = settings && typeof settings === 'object' ? settings : {}
  const call = str(s.callName)
  const name = str(s.userName)
  const identity = str(s.identity)
  const relationship = str(s.relationship)
  const preferences = str(s.preferences)
  const notes = str(s.notes)
  const roomName = str(extras.roomName)
  const lines = []
  if (call) lines.push('请始终称呼用户为「' + call + '」，不要混用其他称呼。')
  if (name) lines.push('用户的名字是「' + name + '」。')
  else if (roomName && roomName !== '用户') lines.push('用户在应用里给自己起的名字是「' + roomName + '」。')
  if (identity) lines.push('用户的身份 / 职业：' + identity + '。')
  if (relationship) lines.push('你与用户的关系：' + relationship + '。')
  if (preferences) lines.push('用户的偏好与忌讳：' + preferences + '。')
  if (notes) lines.push('其他需要记住的用户设定：' + notes + '。')
  if (!lines.length) return ''
  return '【用户设定（请始终遵守）】\n' + lines.join('\n')
}
