import { readZip, bytesToDataUrl } from './zip.mjs'
// 美化包（Theme Pack）格式 v1。
// 一个包就是一份 JSON：名字、色调 tokens、聊天气泡、背景、可选图标。
// 用户在 设置 → 外观与聊天 → 主题 → 美化包 里导入 .json 即可切换。
//
// 示例：
// {
//   "format": "qijian-theme-pack",
//   "version": 1,
//   "name": "海盐",
//   "author": "you",
//   "tokens": { "accent": "#5b8fb9", "surface": "#f4f8fb", "field": "#fffdf9",
//               "ink": "#33414d", "line": "#dbe6ee", "accentSoft": "#e3f0f8" },
//   "background": { "image": "https://…/bg.jpg", "opacity": 0.9 },
//   "bubble": { "style": "soft", "radius": 16 },
//   "icons": { "world": "📚", "chat": "💬", "mcp": "🔌", "skill": "🗂", "memory": "🧠", "settings": "⚙" }
// }

export const PACK_FORMAT = 'qijian-theme-pack'
export const PACK_VERSION = 1
export const PACKS_KEY = 'ai-home.themePacks'
export const ACTIVE_PACK_KEY = 'ai-home.themePackActive'

export const PACK_TOKEN_KEYS = ['accent', 'accentSoft', 'surface', 'field', 'ink', 'muted', 'line', 'danger', 'ok']
export const PACK_ICON_KEYS = ['world', 'chat', 'mcp', 'skill', 'memory', 'settings', 'assistant', 'models', 'appearance', 'workspace', 'system']
export const PACK_BUBBLE_STYLES = ['soft', 'outlined', 'bare', 'letter', 'frame', 'glass', 'comic', 'note']

const isColor = (v) => typeof v === 'string' && /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|var\()/i.test(v.trim())

export function normalizeThemePack(input) {
  if (!input || typeof input !== 'object') throw new Error('美化包必须是 JSON 对象。')
  if (input.format && input.format !== PACK_FORMAT) throw new Error('不是栖间美化包（format 不匹配）。')
  const name = String(input.name || '').trim()
  if (!name) throw new Error('美化包缺少名字（name）。')
  const tokens = {}
  for (const key of PACK_TOKEN_KEYS) {
    const value = input.tokens?.[key]
    if (value == null) continue
    if (!isColor(value)) throw new Error(`颜色 ${key} 格式不对：${value}`)
    tokens[key] = String(value).trim()
  }
  if (!Object.keys(tokens).length) throw new Error('美化包至少要有一个颜色 token。')
  const bubble = input.bubble && typeof input.bubble === 'object' ? {
    style: PACK_BUBBLE_STYLES.includes(input.bubble.style) ? input.bubble.style : undefined,
    radius: Number.isFinite(Number(input.bubble.radius)) ? Math.min(28, Math.max(4, Number(input.bubble.radius))) : undefined,
    me: isColor(input.bubble.me) ? String(input.bubble.me).trim() : undefined,
    ai: isColor(input.bubble.ai) ? String(input.bubble.ai).trim() : undefined,
  } : undefined
  const background = input.background && typeof input.background === 'object' ? {
    image: typeof input.background.image === 'string' && /^(https?:|data:image\/)/.test(input.background.image) ? input.background.image : undefined,
    color: isColor(input.background.color) ? String(input.background.color).trim() : undefined,
    opacity: Number.isFinite(Number(input.background.opacity)) ? Math.min(1, Math.max(0.1, Number(input.background.opacity))) : undefined,
  } : undefined
  const font = input.font && typeof input.font === 'object' ? {
    family: typeof input.font.family === 'string' ? input.font.family.trim().slice(0, 60) : undefined,
    src: typeof input.font.src === 'string' && /^data:font\//.test(input.font.src) && input.font.src.length < 2_000_000 ? input.font.src : undefined,
  } : undefined
  const icons = {}
  if (input.icons && typeof input.icons === 'object') {
    for (const [key, value] of Object.entries(input.icons)) {
      if (typeof value === 'string' && value.trim() && PACK_ICON_KEYS.includes(String(key))) icons[String(key)] = value.trim().slice(0, 4)
    }
  }
  return {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    id: String(input.id || 'pack-' + hash(name + JSON.stringify(tokens))),
    name,
    author: String(input.author || '').slice(0, 40),
    description: String(input.description || '').slice(0, 120),
    tokens, bubble, background,
    font: font && (font.family || font.src) ? font : undefined,
    icons: Object.keys(icons).length ? icons : undefined,
  }
}

function hash(text) {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  return Math.abs(h).toString(36)
}

export function parseThemePack(text) {
  let data
  try { data = JSON.parse(String(text || '')) } catch { throw new Error('不是合法的 JSON 文件。') }
  return normalizeThemePack(data)
}

export function loadThemePacks(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(PACKS_KEY)
    const list = raw ? JSON.parse(raw) : []
    if (!Array.isArray(list)) return []
    return list.map((p) => { try { return normalizeThemePack(p) } catch { return null } }).filter(Boolean)
  } catch { return [] }
}

export function saveThemePacks(list, storage = globalThis.localStorage) {
  const clean = (Array.isArray(list) ? list : []).map((p) => normalizeThemePack(p)).slice(0, 24)
  try { storage?.setItem(PACKS_KEY, JSON.stringify(clean)) } catch { /* 存不下就不持久化 */ }
  return clean
}

export function upsertThemePack(pack, storage = globalThis.localStorage) {
  const list = loadThemePacks(storage).filter((p) => p.id !== pack.id)
  return saveThemePacks([pack, ...list], storage)
}

export function removeThemePack(id, storage = globalThis.localStorage) {
  const list = loadThemePacks(storage).filter((p) => p.id !== id)
  if (getActivePackId(storage) === id) setActivePack('', storage)
  return saveThemePacks(list, storage)
}

export function getActivePackId(storage = globalThis.localStorage) {
  try { return storage?.getItem(ACTIVE_PACK_KEY) || '' } catch { return '' }
}

export function setActivePack(id, storage = globalThis.localStorage) {
  try { if (id) storage?.setItem(ACTIVE_PACK_KEY, id); else storage?.removeItem(ACTIVE_PACK_KEY) } catch { /* ignore */ }
}

export function packCssVars(pack) {
  if (!pack) return {}
  const vars = {}
  const map = { accent: '--accent', accentSoft: '--accent-soft', surface: '--surface', field: '--field', ink: '--ink', muted: '--muted', line: '--line', danger: '--danger', ok: '--ok' }
  for (const [key, cssVar] of Object.entries(map)) if (pack.tokens[key]) vars[cssVar] = pack.tokens[key]
  if (pack.tokens.accent) vars['--accent-ink'] = pack.tokens.accent
  if (pack.background?.image) vars['--pack-chat-bg'] = `url(${pack.background.image})`
  else if (pack.background?.color) vars['--pack-chat-bg'] = pack.background.color
  if (pack.background?.opacity) vars['--pack-bg-opacity'] = String(pack.background.opacity)
  if (pack.font?.family || pack.font?.src) vars['--pack-font-family'] = pack.font.src ? 'pack-' + pack.id : pack.font.family
  if (pack.bubble?.me) vars['--bubble-me-bg'] = pack.bubble.me
  if (pack.bubble?.ai) vars['--bubble-ai-bg'] = pack.bubble.ai
  return vars
}

const PACK_VAR_NAMES=['--accent','--accent-soft','--surface','--field','--ink','--muted','--line','--danger','--ok','--accent-ink','--pack-chat-bg','--pack-bg-opacity','--bubble-me-bg','--bubble-ai-bg']
export function applyPackVars(pack){
  const root=globalThis.document?.documentElement
  if(!root)return
  for(const n of PACK_VAR_NAMES)root.style.removeProperty(n)
  applyPackFont(pack)
  const vars=packCssVars(pack)
  for(const [k,v] of Object.entries(vars))root.style.setProperty(k,v)
  globalThis.document.body?.classList.toggle('has-pack',!!pack)
}

const FONT_STYLE_ID='qijian-pack-font'
function applyPackFont(pack){
  const doc=globalThis.document
  if(!doc)return
  let el=doc.getElementById(FONT_STYLE_ID)
  if(pack?.font?.src){
    if(!el){el=doc.createElement('style');el.id=FONT_STYLE_ID;doc.head.appendChild(el)}
    el.textContent='@font-face{font-family:pack-'+pack.id+';src:url('+pack.font.src+');font-display:swap}'
  }else if(el){el.remove()}
}

// ── ZIP 美化包：pack.json + 同目录资源（图片 / 字体）──
const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf' }
function mimeOf(name) { const ext = String(name).split('.').pop()?.toLowerCase() || ''; return MIME_BY_EXT[ext] || 'application/octet-stream' }

export async function packFromZip(buffer) {
  const files = await readZip(buffer)
  const names = [...files.keys()]
  const jsonName = names.find((n) => /(^|\/)pack\.json$/i.test(n)) || names.find((n) => /\.json$/i.test(n))
  if (!jsonName) throw new Error('ZIP 里缺少 pack.json。')
  const base = jsonName.includes('/') ? jsonName.slice(0, jsonName.lastIndexOf('/') + 1) : ''
  let raw
  try { raw = JSON.parse(new TextDecoder().decode(files.get(jsonName))) } catch { throw new Error('pack.json 不是合法 JSON。') }
  const resolve = (ref) => {
    if (typeof ref !== 'string' || !ref || /^(data:|https?:)/i.test(ref)) return ref
    const bytes = files.get(base + ref) || files.get(ref)
    return bytes ? bytesToDataUrl(bytes, mimeOf(ref)) : ref
  }
  if (raw.background && typeof raw.background === 'object') raw.background.image = resolve(raw.background.image)
  if (raw.font && typeof raw.font === 'object') raw.font.src = resolve(raw.font.src)
  return normalizeThemePack(raw)
}
