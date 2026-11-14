// 薄雾 Mist 第一版：设计变量、Typography、字体缩放与 UI 收尾的结构性回归测试。
// 不替代 390×844 视觉探针，但能防止「又把字号散落回页面 / 又全局禁止字体缩放」这类回退。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
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
  assert.match(theme.TYPOGRAPHY_TOKENS['--type-body-line'], /^1\.5$/, '行高用无单位倍数，跟随字号缩放')
  assert.match(theme.TYPOGRAPHY_TOKENS['--type-title'], /16px/)
  assert.match(theme.TYPOGRAPHY_TOKENS['--type-display'], /21px/)
  assert.match(theme.TYPOGRAPHY_TOKENS['--type-item'], /14\.5px/)
  assert.match(theme.TYPOGRAPHY_TOKENS['--type-button'], /14px/)
  assert.match(theme.TYPOGRAPHY_TOKENS['--type-caption'], /12\.5px/)
  assert.match(theme.TYPOGRAPHY_TOKENS['--type-meta'], /11px/)
  for (const [key, value] of Object.entries(theme.TYPOGRAPHY_TOKENS)) {
    // 行高用无单位倍数，跟随字号（含原生 textZoom）一起走，不写死 px。
    if (key === '--type-body-line') continue
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

test('聊天技术信息折叠、操作栏常驻在气泡下方、输入框单行起步', () => {
  const app = read('src/App.tsx')
  assert.match(app, /<details className="message-tech inline">/)
  // P1-6：默认只显示「Token 644 ›」轻量入口，展开明细由纯函数汇总（无缓存不显示缓存行）。
  assert.match(app, /<summary>\{tokenSummary\.label\}/)
  assert.match(app, /summarizeTokenUsage\(m\.usage\)/)
  assert.match(app, /message-tech-body/)
  assert.match(app, /p\.lastRouteInfo&&<span>\{p\.lastRouteInfo\}<\/span>/, '线路信息保留在详情里')
  // 长按气泡 = 进入多选；操作栏不再靠 actionsOpenId 展开。
  assert.match(app, /longPressRef\.current=window\.setTimeout\(\(\)=>\{enterSelect\(targetId\)\},480\)/)
  assert.doesNotMatch(app, /actionsOpenId/, '不再需要长按展开的操作面板状态')
  assert.doesNotMatch(app, /select-toggle/, '顶栏的 ☑ 多选按钮已移除')
  // 用户消息的修改有两个出口：只保存 / 保存并重发。
  assert.match(app, /保存并重发/)
  assert.match(app, /resendUserMessage\(m\.id,text\)/)
  assert.match(app, /rows=\{1\}/)
  assert.match(app, /composeTextRef/)
  assert.match(app, /import '\.\/mist\.css'/)
  const css = read('src/mist.css')
  assert.match(css, /\.message-stack \.message-actions \{ opacity:1!important;pointer-events:auto!important/)
  // 操作按钮用文字，不再依赖内联 SVG（老 WebView 会把 SVG 画成一条横线）。
  // 操作按钮用位图图标（内联 SVG 在部分 Android WebView 上会被画成一条横线）。
  assert.match(app, /className="message-action-icon" src="\/msg-icons\/copy\.png"/)
  assert.match(app, /className="message-action-icon" src="\/msg-icons\/trash\.png"/)
  assert.doesNotMatch(app, /message-action-label/)
  for (const name of ['copy', 'edit', 'regen', 'trash']) {
    assert.ok(existsSync('public/msg-icons/' + name + '.png'), '缺少图标 public/msg-icons/' + name + '.png')
  }
  // Token 贴在操作图标同一行，折叠时明细不占位
  assert.match(css, /\.message-actions \.message-tech \{ margin:0 0 0 3px;display:inline-flex/)
  assert.match(css, /\.message-tech:not\(\[open\]\)>\.message-tech-body \{ display:none!important; \}/)
  // 头像不受「按钮最小 36px」影响，保持正圆
  assert.match(css, /:not\(\.message-avatar\):not\(\.chat-avatar\)/)
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
  assert.match(main, /scale > 1\.90f/, '极端放大有上限，但不是禁止缩放')
  const manifest = read('android/app/src/main/AndroidManifest.xml')
  assert.match(manifest, /configChanges="[^"]*fontScale/)
  const indexCss = read('src/index.css')
  assert.doesNotMatch(indexCss, /-webkit-text-size-adjust:100%\s*[;}]/, '不应残留禁用字体缩放的声明（注释里提到不算）')
  assert.match(indexCss, /-webkit-text-size-adjust:auto/)
  const mist = read('src/mist.css')
  assert.match(mist, /溢出|overflow-wrap:anywhere/)
  assert.match(mist, /min-height:36px/)
})

test('Mist 顶栏保留 Android 状态栏安全区与可点击热区', () => {
  const mist = read('src/mist.css')
  assert.match(mist, /\.shell \.chat-header \{[^}]*padding-top:max\(8px,calc\(var\(--app-safe-top\) \+ 6px\)\)!important/)
  assert.match(mist, /\.shell \.fullscreen-chat \.chat-header \{[\s\S]*?padding-top:max\(8px,calc\(var\(--app-safe-top\) \+ 6px\)\)!important/)
  assert.match(mist, /\.shell \.chat-header-actions button::after \{[^}]*inset:-5px/)
  const appCss = read('src/App.css')
  assert.match(appCss, /--app-safe-top:max\(env\(safe-area-inset-top/)
})

test('供应商多 Key：新建时可勾选，编辑页仍能增删改备用 Key，且样式类都有定义', () => {
  const app = read('src/App.tsx')
  const css = read('src/App.css')
  // 新建表单：勾选后展开备用 Key 行，提交时并入 vendor.keys。
  assert.match(app, /启用多 Key 模式/)
  assert.match(app, /newMultiKey\?newExtraKeys\.filter\(k=>k\.value\.trim\(\)\)/)
  // 编辑页：原有「多 KEY 模式」管理区保留，能改备注、改角色、删除既有 Key。
  assert.match(app, /多 KEY 模式/)
  assert.match(app, /addBackupKey/)
  assert.match(app, /aria-label="删除这把 Key"/)
  // 新加的样式类必须真的落在 App.css，避免只有 markup 没有样式。
  for (const cls of ['vendor-multi-toggle', 'vendor-new-keys', 'vendor-new-key', 'vendor-add-key']) {
    assert.match(css, new RegExp('\\.' + cls + '(?=[\\s,{.:\\[]|$)'), '缺少样式 .' + cls)
  }
})

test('供应商详情 / 新增供应商都是独立页面，不再在列表下面展开配置面板', () => {
  const app = read('src/App.tsx')
  const css = read('src/App.css')
  // 点列表里的供应商 → 切到 vendor:<id> 页面；点「自定义」→ vendor:add 页面。
  assert.match(app, /onSection\('vendor:'\+id\)/)
  assert.match(app, /openVendorPage\(v\.id\)/)
  assert.match(app, /onSection\('vendor:add'\)/)
  assert.match(app, /section==='vendor:add'/)
  assert.match(app, /section\.startsWith\('vendor:'\)&&!showNew/)
  // 页面容器与返回按钮存在，列表只在 isList 时渲染。
  assert.match(app, /const isList=!showNew&&!active/)
  assert.match(app, /className="vendor-page"/)
  assert.match(app, /← 供应商/)
  assert.doesNotMatch(app, /editing===v\.id/, '列表点开不应再靠内联 editing 状态')
  // Android 返回键：供应商二级页先回列表。
  assert.match(app, /section\.startsWith\('vendor:'\)&&section!=='vendor:account'\?'vendor':''/)
  assert.match(css, /\.vendor-page\{display:flex/)
})

test('订阅账号直接作为设置页内容渲染，不再从底部弹半屏面板', () => {
  const sub = read('src/SubscriptionAccounts.tsx')
  const css = read('src/App.css')
  assert.match(sub, /<section id="subscription-accounts" className="account-login-page">/)
  assert.match(sub, /className="account-page-head"/)
  assert.doesNotMatch(sub, /account-login-layer|account-login-sheet/, '不应再有全屏遮罩 + 底部面板')
  assert.match(css, /\.shell #subscription-accounts\.account-login-page\{/)
  assert.doesNotMatch(css, /account-login-layer|account-login-sheet/)
  // 只有三家可登录渠道，不再保留「全部 / ChatGPT / Claude / Grok」分类筛选条。
  assert.doesNotMatch(sub, /account-tabs|account-tab\b/)
  assert.doesNotMatch(css, /account-tabs|account-tab\b/)
  // 订阅页里的历史折叠入口（按助手填旧 API Key / 重复的用量面板）已清理，只留账号登录。
  assert.doesNotMatch(read('src/App.tsx'), /settings-legacy-fold|按助手填默认 API Key/)
  assert.doesNotMatch(css, /settings-legacy-fold/)
})

test('主题美化底部有微信式字体大小拉条，跟随系统字号并可再放大', () => {
  const ts = read('src/ThemeSettings.tsx')
  const app = read('src/App.tsx')
  const main = read('android/app/src/main/java/com/sulzhu/aihome/MainActivity.java')
  assert.match(ts, /className="theme-fontctl"/)
  assert.match(ts, /min="80" max="160"/)
  assert.match(ts, /跟随系统/)
  assert.match(ts, /100% = 系统字号/)
  // 原生：系统字号 × App 倍数；Web：退回 CSS 变量，避免双重缩放。
  assert.match(app, /setAppTextZoom\(themePrefs\.scale\)/)
  assert.match(app, /nativeTextZoomAvailable\(\)\?\{'--font-scale':'1'\}/)
  assert.match(main, /setAppFontFactor/)
  assert.match(main, /scale = scale \* appFontFactor\(\)/)
})
