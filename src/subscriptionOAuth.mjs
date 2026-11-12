// 订阅账号「网页登录」：GitHub 上 Kelivo / Codex CLI / Claude Code CLI 的公开做法。
// 只放官方公开的 OAuth 端点与开源实现里公开的参数，不硬编码任何来路不明的中转站。
//
// v10：回调不再交给系统浏览器加载。Android 侧用可控 WebView 打开授权页，
// 一旦跳到 callbackPrefixes 里的地址就拦截并原地换令牌（见 MainActivity.java），
// 所以不会出现 localhost:1455 连接被拒绝，也不需要用户复制地址或填任何网址。
//
// 边界（如实说明）：ChatGPT Plus / Claude Pro / Grok 这类「网页订阅」不是 API Key，
// 授权后拿到的是 OAuth 令牌，对应后端协议不是标准 /v1/chat/completions；
// 纯前端要把订阅额度稳定用于聊天仍需一层协议适配 / 兼容网关。

const str = (v) => String(v ?? '')

export const GATEWAY_REFERENCES = [
  { name: 'Kelivo（Flutter 客户端，Accounts 页登录 ChatGPT / Grok / Kimi Code 账号）', url: 'https://github.com/ShuYI-RE/Kelivo' },
  { name: 'CLIProxyAPI（把 Codex / Claude Code / Grok CLI 的 OAuth 登录转成兼容端点）', url: 'https://github.com/router-for-me/CLIProxyAPI' },
]

export const OAUTH_PROFILES = {
  gpt: {
    channelId: 'gpt',
    label: 'ChatGPT / Codex 订阅',
    flow: 'pkce',
    authorizeUrl: 'https://auth.openai.com/oauth/authorize',
    tokenUrl: 'https://auth.openai.com/oauth/token',
    clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
    redirectUri: 'http://localhost:1455/auth/callback',
    scope: 'openid profile email offline_access',
    // 拦截规则（不是请求地址）：官方 CLI 注册的回调，App 内 WebView 在这里接住授权码。
    callbackPrefixes: ['http://localhost:1455/auth/callback'],
    callbackHint: '授权后自动回到 App，不用复制地址。',
    note: '取自开源 Codex OAuth 实现；client_id / 回调地址可能随官方 CLI 变更。',
  },
  claude: {
    channelId: 'claude',
    label: 'Claude Pro / Max 订阅',
    flow: 'pkce',
    authorizeUrl: 'https://claude.ai/oauth/authorize',
    tokenUrl: 'https://console.anthropic.com/v1/oauth/token',
    clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
    redirectUri: 'https://console.anthropic.com/oauth/code/callback',
    scope: 'org:create_api_key user:profile user:inference',
    callbackPrefixes: ['https://console.anthropic.com/oauth/code/callback'],
    callbackHint: '授权后自动回到 App，不用复制地址。',
    note: 'Claude Code 的 OAuth 流程；官方对第三方客户端使用订阅额度有限制，随时可能失效。',
  },
  grok: {
    channelId: 'grok',
    label: 'Grok / X 订阅',
    flow: 'web',
    loginUrl: 'https://accounts.x.ai/',
    // 仅作为「如果官方跳回来就接住」的匹配规则，不发起任何请求、不编造授权端点。
    callbackPrefixes: ['https://accounts.x.ai/oauth/callback', 'https://auth.x.ai/oauth2/callback'],
    callbackHint: '打开 xAI 官方账户页登录；若官方没有回传授权码会明确提示，不会假装登录成功。',
    note: 'xAI 未公开第三方网页授权端点，这里不编造地址；官方 CLI 走设备码或浏览器 OAuth。',
  },
}

export function oauthProfile(channelId) {
  return OAUTH_PROFILES[str(channelId)] || null
}

export function oauthLoginUrl(channelId) {
  const p = oauthProfile(channelId)
  return p ? (p.authorizeUrl || p.loginUrl || '') : ''
}

function base64url(bytes) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// PKCE：浏览器 Web Crypto 生成 verifier / challenge / state。
export async function makePkce() {
  const random = (n) => crypto.getRandomValues(new Uint8Array(n))
  const verifier = base64url(random(32))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return {
    verifier,
    challenge: base64url(new Uint8Array(digest)),
    state: base64url(random(16)),
  }
}

export function buildAuthorizeUrl(channelId, opts = {}) {
  const p = oauthProfile(channelId)
  if (!p || p.flow !== 'pkce') return ''
  const u = new URL(p.authorizeUrl)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', str(opts.clientId) || p.clientId)
  u.searchParams.set('redirect_uri', p.redirectUri)
  u.searchParams.set('scope', p.scope)
  u.searchParams.set('code_challenge', str(opts.codeChallenge))
  u.searchParams.set('code_challenge_method', 'S256')
  u.searchParams.set('state', str(opts.state))
  if (channelId === 'claude') u.searchParams.set('code', 'true')
  return u.toString()
}

// 交给 Android 原生登录弹层的一份完整配置：打开哪个页面、拦截哪些回调、
// 拿到 code 后往哪里换令牌。前端不再出现任何 URL / 回调 / 令牌输入框。
export function buildLoginConfig(channelId, pkce = {}) {
  const p = oauthProfile(channelId)
  if (!p) return null
  const isPkce = p.flow === 'pkce'
  // makePkce() 给的字段叫 challenge，而 buildAuthorizeUrl 收的是 codeChallenge；
  // 这里显式对齐，免得授权页把 code_challenge 发成空值。
  const cfg = {
    channelId,
    url: isPkce ? buildAuthorizeUrl(channelId, {
      codeChallenge: str(pkce.challenge),
      state: str(pkce.state),
    }) : (p.loginUrl || ''),
    callbackPrefixes: (p.callbackPrefixes || (p.redirectUri ? [p.redirectUri] : [])).slice(),
    state: isPkce ? str(pkce.state) : '',
    tokenUrl: isPkce ? (p.tokenUrl || '') : '',
    tokenBody: isPkce ? {
      grant_type: 'authorization_code',
      client_id: p.clientId || '',
      redirect_uri: p.redirectUri || '',
      code_verifier: str(pkce.verifier),
    } : {},
    tokenHeaders: {},
  }
  return cfg.url ? cfg : null
}

// 授权码 → 令牌。浏览器直连官方 token 接口会被 CORS 拦住；
// Android 走原生 HttpURLConnection（MainActivity），服务端仍保留这个代发函数。
export async function exchangeOAuthCode({ channelId, code, codeVerifier, state, userAgent = '', fetchImpl = fetch }) {
  const p = oauthProfile(channelId)
  if (!p || p.flow !== 'pkce') throw new Error('这个渠道没有公开的 OAuth 令牌接口，请改用设备码或直接粘贴令牌。')
  const c = str(code), v = str(codeVerifier)
  if (!c || !v) throw new Error('缺少授权码或 PKCE verifier，请重新点「打开登录页」。')
  const body = {
    grant_type: 'authorization_code', code: c, code_verifier: v,
    client_id: p.clientId, redirect_uri: p.redirectUri,
  }
  if (str(state)) body.state = str(state)
  const headers = { 'Content-Type': 'application/json' }
  if (userAgent) headers['User-Agent'] = userAgent
  const r = await fetchImpl(p.tokenUrl, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await r.text()
  let data = {}
  try { data = JSON.parse(text) } catch { throw new Error('令牌接口返回的不是 JSON') }
  if (!r.ok) throw new Error('令牌接口返回 HTTP ' + r.status + (data?.error ? ' · ' + String(data.error).slice(0, 120) : ''))
  const token = str(data?.access_token || data?.token)
  if (!token) throw new Error('令牌接口没有返回 access_token')
  return { token, refreshToken: str(data?.refresh_token), expiresIn: Number(data?.expires_in || 0) }
}

export function looksLikeToken(v) {
  const s = str(v)
  return /^(sk-|xai-|eyJ[A-Za-z0-9_-]{6,})/.test(s) && !/\s/.test(s) && s.length >= 16
}

// 解析用户粘回来的「完整回调地址 / 裸授权码 / 现成令牌」。
export function parseOAuthCallback(raw, expectedState = '') {
  const text = str(raw).trim()
  if (!text) return { ok: false, error: '请先粘贴登录后的回调地址或令牌' }
  if (looksLikeToken(text)) return { ok: true, token: text }
  let params
  try {
    const u = new URL(text)
    params = new URLSearchParams(u.search.replace(/^#/, '') || (u.hash.includes('=') ? u.hash.slice(1) : ''))
  } catch {
    params = null
  }
  if (!params) {
    if (/^[A-Za-z0-9._~-]{16,}$/.test(text) && !/\s/.test(text)) return { ok: true, code: text, state: '' }
    return { ok: false, error: '这不像回调地址或令牌，请把浏览器地址栏整条链接复制过来' }
  }
  const err = params.get('error') || ''
  if (err) return { ok: false, error: '授权未完成：' + err }
  const token = params.get('access_token') || params.get('token') || ''
  if (token) return { ok: true, token }
  const code = params.get('code') || ''
  const state = params.get('state') || ''
  if (!code) return { ok: false, error: '这个地址里没有授权码（code），请确认已登录并点过授权' }
  if (expectedState && state && state !== expectedState) return { ok: false, error: 'state 校验失败，请重新点一次「打开登录页」' }
  return { ok: true, code, state }
}
