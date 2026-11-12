// 薄雾 Mist 第一版：设计变量、Typography、字体缩放与 UI 收尾的结构性回归测试。
// 不替代 390×844 视觉探针，但能防止「又把字号散落回页面 / 又全局禁止字体缩放」这类回退。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const themeTs = read('src/theme.ts')
const js = ts.transpileModule(themeTs, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const theme = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))

const REQUIRED_TOKENS = [
  '--page-bg', '--surface', '--surface-elevated', '--primary', '--primary-soft',
  '--text-primary', '--text-secondary', '--divider', '--border-subtle', '--danger',
  '--bubble-assistant', '--bubble-user',
  '--radius-sm', '--radius-md', '--radius-lg', '--shadow-sm', '--shadow-md',
  '--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6',
  '--type-display', '--type-title', '--type-body', '--type-body-line',
  '--type-item', '--type-button', '--type-caption', '--type-meta',
]

test('Typography tokens 按 Android sp 视觉比例分档，且随 App 字体设置缩放', () => {
  assert.match(theme.TYPOGRAPHY_TOKENS['--type-body'], /16px/)
  assert.match(theme.TYPOGRAPHY_TOKENS['--type-body-line'], /24px/)
  assert.match(theme.TYPOGRAPHY_TOKENS['--type-title'], /16px/)
  assert.match(theme.TYPOGRAPHY_TOKENS['--type-display'], /21px/)
  assert.match(theme.TYPOGRAPHY_TOKENS['--type-item'], /14\.5px/)
  assert.match(theme.TYPOGRAPHY_TOKENS['--type-button'], /14px/)
  assert.match(theme.TYPOGRAPHY_TOKENS['--type-caption'], /12\.5px/)
  assert.match(theme.TYPOGRAPHY_TOKENS['--type-meta'], /11px/)
  for (const [key, value] of Object.entries(theme.TYPOGRAPHY_TOKENS)) {
    assert.match(value, /var\(--font-scale,1\)/, key + ' 必须跟随字体缩放')
  }
})

test('默认 Mist 与其余主题都提供完整语义变量（未来换主题只替换 tokens）', () => {
  const mist = theme.themeStyle(theme.DEFAULT_THEME)
  for (const key of REQUIRED_TOKENS) assert.equal(typeof mist[key], 'string', '缺少 ' + key)
  assert.equal(mist['--ink'], '#302c37')
  assert.notEqual(mist['--ink'].toLowerCase(), '#000000', '文字不用纯黑')
  assert.equal(mist['--primary'], '#8a79aa')
  assert.equal(mist['--page-bg'], '#f3f0f4')
  for (const t of theme.THEMES) {
    const s = theme.themeStyle({ ...theme.DEFAULT_THEME, theme: t.id })
    for (const key of REQUIRED_TOKENS) assert.equal(typeof s[key], 'string', t.id + ' 缺少 ' + key)
  }
})

test('App 内字体大小写进 --font-scale，形状/间距 tokens 与颜色解耦', () => {
  const big = theme.themeStyle({ ...theme.DEFAULT_THEME, scale: 125 })
  assert.equal(big['--font-scale'], '1.25')
  assert.equal(big['--radius'], '16px')
  assert.equal(theme.SHAPE_TOKENS['--radius-lg'], '20px')
  assert.equal(theme.SHAPE_TOKENS['--radius-sheet'], '24px')
  assert.match(theme.SHAPE_TOKENS['--shadow-sm'], /rgba/)
  assert.equal(theme.themeStyle({ ...theme.DEFAULT_THEME, font: 'sans' })['--font-family'],
    'system-ui,"Noto Sans SC",sans-serif')
})

test('聊天技术信息默认折叠、操作栏默认隐藏、输入框单行起步', () => {
  const app = read('src/App.tsx')
  assert.match(app, /<details className="message-tech">/)
  assert.match(app, /<summary>\{m\.usage\.elapsedMs/)
  assert.match(app, /message-tech-body/)
  assert.match(app, /p\.lastRouteInfo&&<span>\{p\.lastRouteInfo\}<\/span>/, '线路信息保留在详情里')
  assert.match(app, /actionsOpenId===m\.id\?' actions-open'/, '长按展开操作栏')
  assert.match(app, /rows=\{1\}/)
  assert.match(app, /composeTextRef/)
  assert.match(app, /import '\.\/mist\.css'/)
  const css = read('src/mist.css')
  assert.match(css, /\.message-stack \.message-actions \{ opacity:0;pointer-events:none/)
  assert.match(css, /font-size:var\(--type-body\)!important/)
  assert.match(css, /max-width:min\(80vw,320px\)!important/, '气泡上限按视口 80% 计，桌面再夹到 320px')
})

test('默认不再套像素黑白硬边皮肤，Mist 是开箱基础主题', () => {
  const beautify = read('src/beautify.ts')
  assert.match(beautify, /DEFAULT_BEAUTIFY_PACK = 'plain'/)
  assert.match(beautify, /id: 'pixel'/, '像素风仍保留可手动开启')
  const mist = read('src/mist.css')
  assert.match(mist, /\.shell \.fullscreen-chat \.compose-box \.send-button/, '发送按钮规则需压过旧的 4 类选择器')
})

test('聊天顶栏头像 + 助手名靠左上，不再三等分居中', () => {
  const css = read('src/mist.css')
  assert.match(css, /\.shell \.fullscreen-chat \.chat-header \{[\s\S]*?display:flex;align-items:center;justify-content:space-between/)
  assert.match(css, /\.shell \.fullscreen-chat \.chat-header-spacer \{ display:none; \}/)
  assert.match(css, /\.shell \.fullscreen-chat \.chat-header-title \{[\s\S]*?justify-content:flex-start/)
  assert.match(css, /\.shell \.fullscreen-chat \.chat-header-title>b \{ flex:0 1 auto;text-align:left; \}/)
  assert.match(css, /\.shell \.fullscreen-chat \.chat-header-actions \{ flex:0 0 auto/)
  assert.match(css, /\.shell \.fullscreen-chat \.chat-header-subline \{ text-align:left!important; \}/)
})

test('Android 不再全局禁止系统字体缩放，改为 WebView textZoom 承载', () => {
  const main = read('android/app/src/main/java/com/sulzhu/aihome/MainActivity.java')
  assert.doesNotMatch(main, /config\.fontScale\s*=\s*1\.0f/, '不应再把 fontScale 固定为 1')
  assert.doesNotMatch(main, /public Resources getResources\(\)/, '不应再覆盖 Activity Resources')
  assert.match(main, /setTextZoom\(zoom\)/)
  assert.match(main, /onConfigurationChanged\(Configuration/)
  assert.match(main, /scale > 1\.30f/, '极端放大有上限，但不是禁止缩放')
  const manifest = read('android/app/src/main/AndroidManifest.xml')
  assert.match(manifest, /configChanges="[^"]*fontScale/)
  const indexCss = read('src/index.css')
  assert.doesNotMatch(indexCss, /-webkit-text-size-adjust:100%\s*[;}]/, '不应残留禁用字体缩放的声明（注释里提到不算）')
  assert.match(indexCss, /-webkit-text-size-adjust:auto/)
  const mist = read('src/mist.css')
  assert.match(mist, /溢出|overflow-wrap:anywhere/)
  assert.match(mist, /min-height:36px/)
})
