// Android 原生网页授权弹层的 JS 侧通道。
// MainActivity.java 用 App 内可控 WebView 打开官方授权页，拦截 localhost:1455 等回调，
// 原生代发 code→token，再通过全局 __aihomeOAuthResult 把令牌交回来。
// 电脑浏览器没有原生桥时不会打开任何外部页面，避免出现 localhost 报错页
// （390×844 探针会注入 mock 桥来验证完整登录链路）。
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
        // 电脑浏览器没有原生层，绝不再把官方授权页丢给外部浏览器——
        // 那样只会又跳到 localhost:1455 并报连接被拒绝。
        finish(new Error('网页授权登录需要在 App 内完成，请安装最新版 APK'))
      }
    } catch (e) {
      finish(e instanceof Error ? e : new Error('无法打开登录页'))
    }
  })
}
