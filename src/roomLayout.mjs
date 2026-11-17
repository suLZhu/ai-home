// 房间布局：数据驱动的「开放式房间」。
// 当前这份是模板，AI / 未来的编辑器可以直接改 items（位置、文字、动作），
// 房间按 items 渲染；新增物件只需要往数组里加一项。
//
// 存储：localStorage `ai-home.roomLayout.<person>`，按助手隔离。
// 对外 API（App 运行时会挂在 window.AiHomeRoom）：
//   AiHomeRoom.get()      取当前布局
//   AiHomeRoom.set(layout) 保存并立即重绘
//   AiHomeRoom.reset()    恢复模板
//   AiHomeRoom.template   只读模板副本

export const ROOM_LAYOUT_KEY = (person) => `ai-home.roomLayout.${person}`

export const DEFAULT_ROOM_LAYOUT = {
  version: 1,
  name: '默认房间模板',
  items: [
    { id: 'sun', kind: 'decor', type: 'sun' },
    { id: 'window', kind: 'decor', type: 'window' },
    { id: 'curtain-l', kind: 'decor', type: 'curtain', cls: 'l' },
    { id: 'curtain-r', kind: 'decor', type: 'curtain', cls: 'r' },
    { id: 'shelf-deco', kind: 'decor', type: 'shelf' },
    { id: 'frame-deco', kind: 'decor', type: 'frame' },
    { id: 'desk-deco', kind: 'decor', type: 'desk' },
    { id: 'router-deco', kind: 'decor', type: 'router' },
    { id: 'rug', kind: 'decor', type: 'rug' },
    { id: 'plant', kind: 'decor', type: 'plant', text: '🪴' },
    { id: 'lamp', kind: 'decor', type: 'lamp', text: '💡' },
    { id: 'cat', kind: 'decor', type: 'cat', text: '🐈' },

    { id: 'world', kind: 'hotspot', hit: 'shelf', label: '世界书', countKey: 'world', action: 'world' },
    { id: 'chat', kind: 'hotspot', hit: 'chat', label: '聊天', action: 'chat' },
    { id: 'mcp', kind: 'hotspot', hit: 'mcp', label: 'MCP', countKey: 'mcp', action: 'mcp' },
    { id: 'skill', kind: 'hotspot', hit: 'skill', label: '技能', countKey: 'skill', action: 'skill' },
    { id: 'memory', kind: 'hotspot', hit: 'memory', label: '记忆', countKey: 'memory', action: 'memory' },
    { id: 'settings', kind: 'hotspot', hit: 'settings', label: '设置', action: 'settings' },
  ],
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

// AI-generated room layouts are untrusted data. React's style prop only accepts
// a plain CSSProperties object; arrays expose numeric keys (0, 1, ...) that
// throw "Failed to set an indexed property on CSSStyleDeclaration" in WebView.
export function normalizeRoomStyle(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const clean = Object.create(null)
  for (const [key, entry] of Object.entries(value)) {
    if (!key || /^\\d+$/.test(key) || key === '__proto__' || key === 'constructor' || key === 'prototype') continue
    // Nested objects, arrays and nulls are not valid inline React CSS values.
    if (typeof entry !== 'string' && (typeof entry !== 'number' || !Number.isFinite(entry))) continue
    if (typeof entry === 'string' && entry.length > 1000) continue
    clean[key] = entry
  }
  return Object.keys(clean).length ? { ...clean } : undefined
}

export function normalizeRoomLayout(input) {
  const base = clone(DEFAULT_ROOM_LAYOUT)
  if (!input || typeof input !== 'object' || !Array.isArray(input.items)) return base
  const items = input.items
    .filter((it) => it && typeof it === 'object' && !Array.isArray(it) && typeof it.id === 'string')
    .slice(0, 80)
    .map((it) => {
      const item = { ...it }
      const style = normalizeRoomStyle(item.style)
      if (style) item.style = style
      else delete item.style
      return item
    })
  const background = input.background && typeof input.background === 'object' ? { ...input.background } : undefined
  if (!items.length && !background) return base
  return { version: 2, name: String(input.name || '自定义房间'), items, background }
}

export function loadRoomLayout(person, storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(ROOM_LAYOUT_KEY(person))
    if (!raw) return clone(DEFAULT_ROOM_LAYOUT)
    return normalizeRoomLayout(JSON.parse(raw))
  } catch {
    return clone(DEFAULT_ROOM_LAYOUT)
  }
}

export function saveRoomLayout(person, layout, storage = globalThis.localStorage) {
  const clean = normalizeRoomLayout(layout)
  try { storage?.setItem(ROOM_LAYOUT_KEY(person), JSON.stringify(clean)) } catch { /* 存不下就只影响本机 */ }
  return clean
}

export function resetRoomLayout(person, storage = globalThis.localStorage) {
  try { storage?.removeItem(ROOM_LAYOUT_KEY(person)) } catch { /* ignore */ }
  return clone(DEFAULT_ROOM_LAYOUT)
}

// 供 AI 直接改：把「动作 + 文字 + 位置」写成一句自然语言结构的补丁。
// 位置用百分比（left/top/width/height），符合手机任意尺寸。
export function buildRoomItem({ id, kind = 'hotspot', label, action = 'chat', countKey, hit, type, x, y, w, h, text }) {
  const item = { id: id || `${kind}-${Date.now()}`, kind }
  if (label) item.label = label
  if (action) item.action = action
  if (countKey) item.countKey = countKey
  if (hit) item.hit = hit
  if (type) item.type = type
  if (text) item.text = text
  if ([x, y, w, h].every((v) => typeof v === 'number')) {
    item.style = { left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }
  }
  return item
}

export const ROOM_ACTIONS = {
  chat: '打开聊天',
  world: '世界书',
  mcp: 'MCP',
  skill: '技能库',
  memory: '记忆面板',
  settings: '设置',
}
