// SKILL：按助手保存技能说明，启用后拼进 system 提示。
// 纯函数、可单测；存储键与旧版一致（ai-home.skills.<person>），向后兼容。
export const SKILLS_KEY_PREFIX = 'ai-home.skills.'
export const SKILL_BUDGET_CHARS = 6000

export function normalizeSkill(raw) {
  const x = raw && typeof raw === 'object' ? raw : {}
  return {
    id: String(x.id || ''),
    name: String(x.name || '').trim().slice(0, 100),
    description: String(x.description || '').trim().slice(0, 300),
    instructions: String(x.instructions || '').trim().slice(0, 20000),
    enabled: x.enabled !== false,
    updatedAt: String(x.updatedAt || ''),
  }
}

export function normalizeSkills(list) {
  return (Array.isArray(list) ? list : []).map(normalizeSkill).filter((s) => s.name && s.instructions)
}

export function loadSkills(person, storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return []
  try {
    return normalizeSkills(JSON.parse(store.getItem(SKILLS_KEY_PREFIX + person) || '[]'))
  } catch {
    return []
  }
}

export function saveSkills(person, list, storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  const normalized = normalizeSkills(list)
  try { store?.setItem(SKILLS_KEY_PREFIX + person, JSON.stringify(normalized)) } catch { /* 隐私模式 */ }
  return normalized
}

// 解析 SKILL.md：支持 YAML frontmatter（name/description），其余作为工作流正文。
export function parseSkillMarkdown(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n')
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  let name = ''
  let description = ''
  let body = raw
  if (m) {
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^(\w+):\s*(.*)$/)
      if (!kv) continue
      const key = kv[1].toLowerCase()
      const value = kv[2].replace(/^['"]|['"]$/g, '').trim()
      if (key === 'name') name = value
      if (key === 'description') description = value
    }
    body = m[2]
  }
  return { name, description, instructions: body.trim() }
}

// 启用技能拼成 system 片段；超出预算时截断并注明，避免把提示词撑爆。
export function enabledSkillsBlock(list, budget = SKILL_BUDGET_CHARS) {
  const enabled = normalizeSkills(list).filter((s) => s.enabled)
  if (!enabled.length) return ''
  const head = '【已启用技能】用户启用了以下技能。遇到匹配的场景时按技能里的步骤执行；不匹配就不要硬套。'
  const parts = enabled.map((s) => {
    const intro = s.description ? '简介：' + s.description + '\n' : ''
    return '### ' + s.name + '\n' + intro + s.instructions
  })
  let body = ''
  for (const part of parts) {
    if (body.length + part.length + 2 > budget) {
      body += '\n\n（技能内容超出长度上限，后面的技能已省略）'
      break
    }
    body += (body ? '\n\n' : '') + part
  }
  return head + '\n\n' + body
}
