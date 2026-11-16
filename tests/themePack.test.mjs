import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeThemePack, parseThemePack, packCssVars, loadThemePacks, saveThemePacks, upsertThemePack, removeThemePack, getActivePackId, setActivePack } from '../src/themePack.mjs'

function mem() {
  const map = new Map()
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) }
}

const valid = {
  format: 'qijian-theme-pack',
  name: '海盐',
  author: 'tester',
  tokens: { accent: '#5b8fb9', surface: '#f4f8fb', ink: '#33414d' },
  bubble: { style: 'soft', radius: 18 },
  background: { color: '#eaf4fb' },
  icons: { world: '📚' },
}

test('解析合法美化包并生成 id', () => {
  const pack = normalizeThemePack(valid)
  assert.equal(pack.name, '海盐')
  assert.equal(pack.tokens.accent, '#5b8fb9')
  assert.equal(pack.bubble.style, 'soft')
  assert.ok(pack.id.startsWith('pack-'))
})

test('颜色不合法 / 缺名字会报错', () => {
  assert.throws(() => normalizeThemePack({ ...valid, tokens: { accent: 'not-a-color' } }))
  assert.throws(() => normalizeThemePack({ tokens: { accent: '#fff' } }))
})

test('parseThemePack 拒绝坏 JSON 和非栖间包', () => {
  assert.throws(() => parseThemePack('{bad'))
  assert.throws(() => parseThemePack(JSON.stringify({ format: 'other', name: 'x', tokens: { accent: '#fff' } })))
})

test('packCssVars 输出变量（含背景与气泡）', () => {
  const pack = normalizeThemePack({ ...valid, bubble: { style: 'soft', me: '#fff0f0', ai: '#f0fff0' }, background: { color: '#eaf4fb' } })
  const vars = packCssVars(pack)
  assert.equal(vars['--accent'], '#5b8fb9')
  assert.equal(vars['--pack-chat-bg'], '#eaf4fb')
  assert.equal(vars['--bubble-me-bg'], '#fff0f0')
})

test('多包存储可增删、active 记录独立', () => {
  const storage = mem()
  saveThemePacks([], storage)
  upsertThemePack(normalizeThemePack(valid), storage)
  const second = normalizeThemePack({ ...valid, name: '夜色', tokens: { accent: '#333344' } })
  upsertThemePack(second, storage)
  assert.equal(loadThemePacks(storage).length, 2)
  setActivePack(second.id, storage)
  assert.equal(getActivePackId(storage), second.id)
  removeThemePack(second.id, storage)
  assert.equal(loadThemePacks(storage).length, 1)
  assert.equal(getActivePackId(storage), '')
})

test('美化包支持字体与图标，未知项被丢弃', () => {
  const pack = normalizeThemePack({ ...valid, font: { family: 'Georgia', src: 'javascript:alert(1)' }, icons: { chat: '💬', world: '📚', hack: 'X' } })
  assert.equal(pack.font.family, 'Georgia')
  assert.equal(pack.font.src, undefined)
  assert.equal(pack.icons.chat, '💬')
  assert.equal(pack.icons.hack, undefined)
})

test('CSS 变量包含字体族', () => {
  const pack = normalizeThemePack({ ...valid, font: { family: 'Georgia' } })
  assert.equal(packCssVars(pack)['--pack-font-family'], 'Georgia')
})

test('图标支持 data:image，并限制在 400KB 内', () => {
  const png = 'data:image/png;base64,' + 'A'.repeat(40)
  const pack = normalizeThemePack({ ...valid, icons: { chat: png } })
  assert.equal(pack.icons.chat, png)
  const huge = 'data:image/png;base64,' + 'A'.repeat(400001)
  assert.equal(normalizeThemePack({ ...valid, icons: { chat: huge } }).icons, undefined)
})
