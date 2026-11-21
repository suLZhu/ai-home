// Hard context budgets shared by chat assembly.
// These are character budgets, not token estimates: the goal is to prevent
// unbounded prompt growth before provider-specific tokenization happens.

export function clipContextText(value, maxChars = 4000) {
  const text = String(value ?? '').trim()
  const limit = Math.max(64, Number(maxChars) || 4000)
  if (text.length <= limit) return text
  return text.slice(0, Math.max(0, limit - 18)).trimEnd() + '\n…（内容已按上下文预算截断）'
}

function compactProperty(value) {
  const x = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const out = {}
  if (typeof x.type === 'string') out.type = x.type
  if (typeof x.description === 'string' && x.description.trim()) out.description = clipContextText(x.description, 180)
  if (Array.isArray(x.enum)) out.enum = x.enum.slice(0, 24).map(v => typeof v === 'string' ? v.slice(0, 120) : v)
  if (x.items && typeof x.items === 'object') {
    out.items = typeof x.items.type === 'string' ? { type: x.items.type } : {}
  }
  return out
}

export function compactToolSchema(schema, maxChars = 6000) {
  const src = schema && typeof schema === 'object' && !Array.isArray(schema)
    ? schema
    : { type: 'object', properties: {}, additionalProperties: true }
  try {
    if (JSON.stringify(src).length <= maxChars) return src
  } catch { /* fall through */ }

  const properties = {}
  for (const [name, value] of Object.entries(src.properties && typeof src.properties === 'object' ? src.properties : {}).slice(0, 40)) {
    properties[String(name).slice(0, 80)] = compactProperty(value)
  }
  const out = {
    type: 'object',
    properties,
    additionalProperties: src.additionalProperties !== false,
  }
  if (Array.isArray(src.required)) out.required = src.required.map(String).filter(name => Object.prototype.hasOwnProperty.call(properties, name)).slice(0, 40)
  try {
    if (JSON.stringify(out).length <= maxChars) return out
  } catch { /* fall through */ }
  return { type: 'object', properties: {}, additionalProperties: true }
}

export function takeWithinBudget(items, maxChars = 8000, perItemChars = 2000) {
  const out = []
  let used = 0
  for (const item of Array.isArray(items) ? items : []) {
    const text = clipContextText(item, perItemChars)
    if (!text) continue
    if (used + text.length > maxChars) break
    out.push(text)
    used += text.length
  }
  return out
}
