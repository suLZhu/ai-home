// Android 原生网页授权弹层的 JS 侧通道。
// MainActivity.java 用 App 内可控 WebView 打开官方授权页，拦截 localhost:1455 等回调，
// 原生代发 code→token，再通过全局 __aihomeOAuthResult 把令牌交回来。
// 电脑浏览器没有原生桥时退化为 window.open + 同一个回调（探针可注入模拟）。
const CALLBACK = '__aihomeOAuthResult'
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000

export function nativeOAuthAvailable() {
  try { return typeof globalThis.AiHomeOAuth?.login === 'function' } catch { return false }
}

export function startOAuthLogin(config) {
  return new Promise((resolve, reject) => {
    if (!config || !config.url) { reject(new Error('登录地址为空，请重新点一次')); return }
    let done = false
    let timer = null
    const finish = (err, value) => {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      try { delete globalThis[CALLBACK] } catch { globalThis[CALLBACK] = undefined }
      if (err) reject(err)
      else resolve(value)
    }
    globalThis[CALLBACK] = (payload) => {
      let data = payload
      if (typeof payload === 'string') {
        try { data = JSON.parse(payload) } catch { data = { ok: false, error: '登录结果无法解析' } }
      }
      if (data && data.ok && data.token) {
        finish(null, {
          token: String(data.token),
          refreshToken: String(data.refreshToken || ''),
          expiresIn: Number(data.expiresIn || 0),
        })
      } else {
        finish(new Error((data && data.error) || '登录未完成，请再试一次'))
      }
    }
    timer = setTimeout(() => finish(new Error('登录超时，请重新点一次登录')), LOGIN_TIMEOUT_MS)
    try {
      if (nativeOAuthAvailable()) {
        globalThis.AiHomeOAuth.login(JSON.stringify(config))
      } else {
        const win = typeof globalThis.open === 'function'
          ? globalThis.open(config.url, '_blank', 'noopener,noreferrer')
          : null
        if (!win) finish(new Error('登录页被拦截了，请在 App 内打开'))
      }
    } catch (e) {
      finish(e instanceof Error ? e : new Error('无法打开登录页'))
    }
  })
}
