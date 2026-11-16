// Capgo Live Update 封装：让 web 层（HTML/JS/CSS）可以后台更新、免安装。
// 直接使用 Capacitor 注册好的全局插件对象，避免动态 import 在打包后的兼容问题。
//
// 清单字段（latest.json 可同时带 APK 与 web 包）：
// { "versionCode":40, "versionName":"4.0", "apkUrl":"…",
//   "webVersion":"4.1.0", "webUrl":"https://…/dist.zip", "webChecksum":"sha256…" }

function api() {
  const cap = typeof window !== 'undefined' ? window.Capacitor : null
  return (cap && cap.Plugins && cap.Plugins.CapacitorUpdater) || null
}

export function liveUpdateSupported() {
  return !!api()
}

/** App 启动后必须调用，告诉插件“这个包能正常跑”，否则 30 秒后会被回滚。 */
export async function notifyAppReady() {
  const up = api()
  if (!up) return null
  for (let i = 0; i < 12; i++) {
    try {
      return await up.notifyAppReady()
    } catch (e) {
      if (i === 11) console.warn('[liveUpdate] notifyAppReady failed', e)
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  return null
}

export async function currentBundle() {
  const up = api()
  if (!up) return null
  try { return await up.current() } catch { return null }
}

/** 下载并切换到新的 web 包；成功后 App 会自动重载。 */
export async function applyWebUpdate(url, version, checksum) {
  const up = api()
  if (!up) throw new Error('Live Update 插件不可用（仅 Android App 内生效）')
  const options = { url, version }
  if (checksum) options.checksum = checksum
  const bundle = await up.download(options)
  await up.set({ id: bundle.id })
  return bundle
}

/** 回到 App 自带的内置包（调试/回滚用）。 */
export async function resetToBuiltin() {
  const up = api()
  if (up) await up.reset()
}

/** 比较版本号（4.1 / 4.1.2 / 4.2.0）；a 比 b 新返回正数。 */
export function compareVersions(a, b) {
  const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d
  }
  return 0
}
