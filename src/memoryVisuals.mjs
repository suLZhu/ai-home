// 记忆的几种可视化布局：星空 / 花园 / 日记。纯函数，方便单测；
// 位置由 id 的稳定哈希决定，刷新不会让星星和花乱跳。

export const MEMORY_VIEW_KEY = 'ai-home.memoryView'
export const MEMORY_VIEWS = ['stars', 'garden', 'diary', 'list']

export function normalizeMemoryView(value) {
  return MEMORY_VIEWS.includes(value) ? value : 'stars'
}

const CATEGORY_COLORS = {
  '人物关系': '#d98aa6',
  '经历事件': '#8fa7d9',
  '偏好习惯': '#9fc9a5',
  '项目进度': '#e0b36a',
  '其他': '#b3a8c9',
}

export function categoryColor(category) {
  return CATEGORY_COLORS[String(category || '')] || CATEGORY_COLORS['其他']
}

function hash(text) {
  let h = 2166136261
  const s = String(text || '')
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/** 星空：按松散网格排布 + 稳定抖动，避免所有星星挤在一起。 */
export function starLayout(records, { max = 40 } = {}) {
  const list = Array.isArray(records) ? records.slice(0, Math.max(1, max)) : []
  if (!list.length) return []
  if (list.length === 1) {
    const h = hash(list[0].id || list[0].title)
    return [{ record: list[0], left: 50, top: 46, size: 26, delay: (h % 20) / 10, color: categoryColor(list[0].category) }]
  }
  const cols = Math.max(3, Math.ceil(Math.sqrt(list.length * 1.5)))
  const rows = Math.ceil(list.length / cols)
  return list.map((record, index) => {
    const h = hash(record.id || record.title || String(index))
    const col = index % cols
    const row = Math.floor(index / cols)
    const jitterX = (((h % 100) / 100) - 0.5) * (60 / cols)
    const jitterY = ((((h >>> 8) % 100) / 100) - 0.5) * (45 / rows)
    const left = Math.min(94, Math.max(6, ((col + 0.5) / cols) * 100 + jitterX))
    const top = Math.min(90, Math.max(8, ((row + 0.5) / rows) * 100 + jitterY))
    return {
      record,
      left: Math.round(left * 10) / 10,
      top: Math.round(top * 10) / 10,
      size: 16 + (h % 15),
      delay: Math.round(((h >>> 4) % 30)) / 10,
      color: categoryColor(record.category),
    }
  })
}

/** 花园：3 列花圃，每朵花的颜色/花瓣数/倾斜由 id 决定。 */
export function gardenLayout(records, { max = 24 } = {}) {
  const list = Array.isArray(records) ? records.slice(0, Math.max(1, max)) : []
  return list.map((record, index) => {
    const h = hash(record.id || record.title || String(index))
    return {
      record,
      color: categoryColor(record.category),
      petals: 5 + (h % 2),
      rotate: ((h >>> 3) % 24) - 12,
      size: 34 + (h % 14),
      delay: Math.round(((h >>> 7) % 20)) / 10,
    }
  })
}

/** 日记本：按发生日期分组，新的在前；同一天内按更新时间倒序。 */
export function groupMemoriesByDay(records) {
  const groups = new Map()
  for (const record of Array.isArray(records) ? records : []) {
    const raw = String(record?.occurredAt || record?.createdAt || record?.updatedAt || '')
    const day = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '未记日期'
    if (!groups.has(day)) groups.set(day, [])
    groups.get(day).push(record)
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] === '未记日期' ? 1 : b[0] === '未记日期' ? -1 : b[0].localeCompare(a[0])))
    .map(([day, list]) => ({
      day,
      records: list.slice().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))),
    }))
}
