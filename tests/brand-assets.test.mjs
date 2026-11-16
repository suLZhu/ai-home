// 栖间品牌更名 / Logo 资源 / Android 图标与启动页的结构性回归测试。
// 不替代真机视觉验收；只防止「旧品牌名回来」「母版被覆盖」「图标被粗暴复制」这类回退。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, statSync } from 'node:fs'

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const bin = p => readFileSync(new URL('../' + p, import.meta.url))
const has = p => existsSync(new URL('../' + p, import.meta.url))
const pngSize = p => {
  const b = bin(p)
  assert.equal(b.subarray(1, 4).toString(), 'PNG', p + ' 不是 PNG')
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

const DENSITIES = {
  mdpi: [48, 108], hdpi: [72, 162], xhdpi: [96, 216],
  xxhdpi: [144, 324], xxxhdpi: [192, 432],
}

test('两张原图母版保留高分辨率、互不覆盖', () => {
  for (const p of ['brand/masters/qijian-logo-primary.jpg', 'brand/masters/qijian-logo-ornamental.jpg']) {
    assert.ok(has(p), '缺少母版 ' + p)
    assert.ok(statSync(new URL('../' + p, import.meta.url)).size > 50000, p + ' 分辨率/体积异常')
  }
  assert.notEqual(
    bin('brand/masters/qijian-logo-primary.jpg').toString('base64'),
    bin('brand/masters/qijian-logo-ornamental.jpg').toString('base64'),
    '两张母版必须是不同原图')
  assert.ok(has('brand/qijian-icon-source.png'), '缺少简化裁切版母版')
  assert.ok(has('brand/qijian-icon-foreground.png'), '缺少 adaptive foreground 母版')
})

test('light 四件套齐全；dark 只预留结构并明确回退，不臆造深色 Logo', () => {
  for (const f of ['qijian-logo-primary-light.png', 'qijian-logo-ornamental-light.png',
    'qijian-icon-light.png', 'qijian-icon-foreground-light.png']) {
    assert.ok(has('public/brand/light/' + f), '缺少 ' + f)
  }
  const fallback = JSON.parse(read('public/brand/dark/fallback.json'))
  assert.equal(fallback.status, 'reserved')
  assert.equal(fallback.fallbackTo, 'light')
  const brand = read('src/brandAssets.ts')
  assert.match(brand, /export const BRAND_NAME = '栖间'/)
  assert.match(brand, /brandAsset\(key: BrandAssetKey, dark = false\)/)
  assert.match(brand, /return BRAND_ASSETS\[key\]/, 'dark 未出品前直接回退 light')
})

test('五档密度图标尺寸正确，且 foreground 不是同一张 PNG 粗暴复制', () => {
  const foregroundBytes = []
  for (const [dpi, [legacy, fg]] of Object.entries(DENSITIES)) {
    const base = 'android/app/src/main/res/mipmap-' + dpi + '/'
    assert.deepEqual(pngSize(base + 'ic_launcher.png'), [legacy, legacy])
    assert.deepEqual(pngSize(base + 'ic_launcher_round.png'), [legacy, legacy])
    assert.deepEqual(pngSize(base + 'ic_launcher_foreground.png'), [fg, fg])
    foregroundBytes.push(bin(base + 'ic_launcher_foreground.png').toString('base64'))
  }
  assert.equal(new Set(foregroundBytes).size, 5, '各密度必须分别重采样，不能复制同一文件')
})

test('adaptive icon 用米白纯色背景 + safe zone foreground，无默认机器人矢量', () => {
  for (const f of ['mipmap-anydpi-v26/ic_launcher.xml', 'mipmap-anydpi-v26/ic_launcher_round.xml']) {
    const x = read('android/app/src/main/res/' + f)
    assert.match(x, /<background android:drawable="@color\/ic_launcher_background"\/>/)
    assert.match(x, /<foreground android:drawable="@mipmap\/ic_launcher_foreground"\/>/)
  }
  assert.match(read('android/app/src/main/res/values/ic_launcher_background.xml'), /#FDF8F2/)
  assert.match(read('android/app/src/main/res/drawable/ic_launcher_background.xml'), /<shape /)
  assert.ok(!has('android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml'), 'Capacitor 默认机器人矢量残留')
})

test('启动页：米白 + 完整主 Logo 固定 260dp，不拉伸、无 spinner / 文案 / 版本号', () => {
  const splash = read('android/app/src/main/res/drawable/splash_brand.xml')
  assert.match(splash, /<layer-list /)
  assert.match(splash, /android:width="260dp" android:height="260dp"/)
  assert.match(splash, /@drawable\/qijian_logo_primary/)
  // 只检查真正的 XML 元素：注释里的「无 spinner」说明与 <?xml version> 声明不算 UI 文案。
  const elements = splash.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?xml[^>]*\?>/g, '')
  assert.doesNotMatch(elements, /loading|spinner|正在加载|Powered|version|textView|ProgressBar/i)
  assert.ok(has('android/app/src/main/res/drawable/qijian_logo_primary.png'))
  for (const style of ['values/styles.xml', 'values-v31/styles.xml']) {
    assert.match(read('android/app/src/main/res/' + style), /@drawable\/splash_brand/)
  }
  assert.match(read('android/app/src/main/res/values-v31/styles.xml'), /windowSplashScreenAnimatedIcon/)
  const port = { mdpi: [320, 480], hdpi: [480, 720], xhdpi: [640, 960], xxhdpi: [960, 1440], xxxhdpi: [1280, 1920] }
  for (const [dpi, size] of Object.entries(port)) {
    assert.deepEqual(pngSize('android/app/src/main/res/drawable-port-' + dpi + '/splash.png'), size)
  }
})

test('所有用户可见品牌名为「栖间」，无旧称残留', () => {
  const visible = [
    'android/app/src/main/res/values/strings.xml',
    'capacitor.config.ts', 'index.html', 'src/requestDiag.mjs',
    'android/app/src/main/java/com/sulzhu/aihome/SystemNotifier.java', 'src/App.tsx',
  ]
  for (const p of visible) {
    const s = read(p)
    assert.match(s, /栖间/, p + ' 缺少新品牌名')
    assert.doesNotMatch(s, /AI 小家|AI小家/, p + ' 仍有旧品牌名')
  }
  const strings = read('android/app/src/main/res/values/strings.xml')
  assert.match(strings, /<string name="app_name">栖间<\/string>/, '桌面 / 安装器名称')
  assert.match(strings, /<string name="title_activity_main">栖间<\/string>/, '最近任务标题')
  assert.match(read('index.html'), /<title>栖间<\/title>/, 'Web title')
  assert.match(read('index.html'), /href="\/favicon\.png"/)
  assert.match(read('src/App.tsx'), /<b>关于 栖间<\/b>/)
  assert.match(read('src/App.tsx'), /BRAND_NAME/)
})

test('内部 applicationId / package 保持不变，历史存储 key 未做无意义重构', () => {
  assert.match(read('android/app/build.gradle'), /applicationId "com\.sulzhu\.aihome"/)
  assert.match(read('android/app/build.gradle'), /namespace = "com\.sulzhu\.aihome"/)
  assert.match(read('capacitor.config.ts'), /appId: 'com\.sulzhu\.aihome'/)
  assert.match(read('src/App.tsx'), /'ai-home\.messages'/, '本机数据键保持不变')
})

test('品牌资源生成脚本幂等、只从母版裁切与等比缩放', () => {
  const s = read('scripts/build_brand_assets.py')
  assert.match(s, /assert primary\.size == ornamental\.size == \(1254, 1254\)/)
  assert.match(s, /Image\.LANCZOS/)
  assert.doesNotMatch(s, /ImageDraw|ImageFilter|GaussianBlur/, '不得重绘 / 生成新造型')
  assert.match(s, /ICON_CROP = \(370, 195, 965, 1010\)/)
})
