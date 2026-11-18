import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { channelById, SUBSCRIPTION_CHANNELS, blankSubscription, type SubscriptionAccount } from './subscriptionChannels.mjs'
import { syncVendorProfiles, type Vendor, type VendorModel } from './vendors.mjs'
import type { ModelProfile } from './resourceBindings.mjs'
import { makePkce, buildLoginConfig, chatGptAccountIdFromToken } from './subscriptionOAuth.mjs'
import { startOAuthLogin } from './nativeOAuth.mjs'
import { nativeHttpGet, nativeHttpPost, nativeHttpGetAsync, openExternalUrl } from './nativeSystem.mjs'
import { fetchSubscriptionUsage, type SubscriptionUsageWindow } from './subscriptionUsage.mjs'
// P1-9：上游原始 JSON / 错误码统一转成中文短句，原文只在「查看详情」里展开。
import { formatLoginError, type LoginErrorInfo } from './loginError.mjs'
import { apiFetch } from './apiBase.mjs'
import { IconChat, IconCheck, IconChevronRight, IconGrid, IconMore, IconSparkles, IconStar, type IconComponent } from './icons'
import {
  mergeAvailableModels, normalizeModelIds, buildSubscriptionModels,
  pickedModelIds, type ModelState,
} from './subscriptionModels.mjs'

const GROK_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828'
const GROK_SCOPE = 'openid profile email offline_access grok-cli:access api:access'
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// 账号登录：只做「点一下 → App 内官方授权页 → 自动拿回令牌 → 自动带上模型」。
// 面板里没有任何网址 / 回调地址 / 令牌 / 账号密码输入框，也不需要复制粘贴。
// Android 侧由 MainActivity 的可控 WebView 拦截 localhost:1455 这类回调并原地换令牌。
// 登录后优先用令牌拉该账号真实模型列表；官方订阅端点不提供 /models 时列出可增删的
// 常用模型，勾进池子后聊天窗口的模型面板就能像填 API 一样选到它们。
//
// P1-9 功能调查（与「显示问题」分开，不能靠错误文案修复）：
// 1) unsupported_country_region_territory 来自 OpenAI 官方授权页 auth.openai.com
//    按「发起请求的出口 IP / 地区」拒绝，与账号密码、redirect_uri、endpoint 配置无关：
//    callbackPrefixes 只是 App 内 WebView 的拦截规则，不会真的去请求 localhost。
// 2) GPT 渠道 endpoint 是 https://api.openai.com/v1（subscriptionChannels.mjs），
//    但 ChatGPT/Codex 订阅 OAuth 拿到的是会话令牌，对应 chatgpt.com/backend-api 协议，
//    并非 /v1/chat/completions 的 API Key。即使登录成功，本实现目前也不能稳定把
//    subscription 额度用于聊天，仍需一层协议适配 / 兼容网关（见 subscriptionOAuth.mjs 头部）。
// 本文件只完成显示层中文化；上述功能限制需在报告中如实说明。
type Props = {
  vendors: Vendor[]
  setVendors: Dispatch<SetStateAction<Vendor[]>>
  setModelProfiles: Dispatch<SetStateAction<ModelProfile[]>>
  subscriptions: SubscriptionAccount[]
  setSubscriptions: Dispatch<SetStateAction<SubscriptionAccount[]>>
}

const ROWS: Array<{ id: string; name: string; sub: string; mark: IconComponent }> = [
  { id: 'gpt', name: 'ChatGPT', sub: 'GPT / Codex 订阅', mark: IconChat },
  { id: 'claude', name: 'Claude', sub: 'Pro / Max 订阅', mark: IconSparkles },
  { id: 'grok', name: 'Grok', sub: 'X / xAI 订阅', mark: IconStar },
]

// 放到模块级，避免组件渲染作用域里出现不纯的时间调用。
const nowStamp = () => new Date().toISOString()

// 官方订阅端点多数不是 OpenAI 兼容 /models；给 3 秒超时，失败就静默回退到候选清单。
async function fetchStandardModels(endpoint: string, token: string): Promise<{ models: string[]; error: string }> {
  const raw = String(endpoint || '').trim().replace(/\/+$/, '')
  const directModelsUrl = /\/models(?:\?.*)?$/i.test(raw) ? raw : ''
  const baseEndpoint = directModelsUrl
    ? raw.replace(/\/models(?:\?.*)?$/i, '').replace(/\/+$/, '')
    : raw
  const work = (async () => {
    const r = await apiFetch('/api/models', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: baseEndpoint, apiKey: token, modelsUrl: directModelsUrl }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return { models: [], error: String(d?.error || ('HTTP ' + r.status)).slice(0, 240) }
    const models = normalizeModelIds(d?.models)
    return { models, error: models.length ? '' : '接口没有返回模型列表' }
  })()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<{ models: string[]; error: string }>(res => { timer = setTimeout(() => res({ models: [], error: '拉取超时' }), 4000) })
  try { return await Promise.race([work, timeout]) } catch (e) { return { models: [], error: e instanceof Error ? e.message : '拉取失败' } }
  finally { if (timer) clearTimeout(timer) }
}

// ChatGPT 订阅的模型目录在 Codex 后端，不在 /v1/models。
// Kelivo 等客户端就是用 access token + chatgpt-account-id 调这个接口拿到真实列表的。
async function fetchCodexModels(token: string, accountId: string): Promise<{ models: string[]; error: string }> {
  const url = 'https://chatgpt.com/backend-api/codex/models?client_version=0.159.0'
  const headers: Record<string, string> = {
    Authorization: 'Bearer ' + token,
    originator: 'qijian',
    version: '0.159.0',
    Accept: 'application/json',
  }
  if (accountId) headers['chatgpt-account-id'] = accountId
  try {
    const native = nativeHttpGet(url, headers)
    if (native && !native.error) {
      const status = Number(native.status || 0)
      if (status >= 400) return { models: [], error: 'Codex 模型目录 HTTP ' + status + ' · ' + String(native.body || '').slice(0, 180) }
      let payload: any
      try { payload = JSON.parse(String(native.body || '')) } catch { return { models: [], error: 'Codex 模型目录返回的不是 JSON' } }
      return normalizeCodexModels(payload)
    }
    const r = await apiFetch('/api/codex/models', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, accountId }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return { models: [], error: String(d?.error || ('HTTP ' + r.status)).slice(0, 240) }
    return normalizeCodexModels(d)
  } catch (e) {
    return { models: [], error: e instanceof Error ? e.message : '拉取失败' }
  }
}

const CLAUDE_BETAS = [
  'claude-code-20250219', 'oauth-2025-04-20', 'interleaved-thinking-2025-05-14',
  'redact-thinking-2026-02-12', 'context-management-2025-06-27',
  'prompt-caching-scope-2026-01-05', 'mid-conversation-system-2026-04-07',
  'advanced-tool-use-2025-11-20', 'effort-2025-11-24', 'extended-cache-ttl-2025-04-11',
].join(',')

async function fetchClaudeModels(token: string): Promise<{ models: string[]; error: string }> {
  const url = 'https://api.anthropic.com/v1/models?limit=1000'
  const headers: Record<string, string> = {
    Authorization: 'Bearer ' + token,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': CLAUDE_BETAS,
    'anthropic-dangerous-direct-browser-access': 'true',
    'User-Agent': 'claude-cli/2.1.280 (external, cli)',
    'x-app': 'cli',
    Accept: 'application/json',
  }
  try {
    const native = nativeHttpGet(url, headers)
    if (native && !native.error) {
      const status = Number(native.status || 0)
      if (status >= 400) return { models: [], error: 'Claude 模型目录 HTTP ' + status + ' · ' + String(native.body || '').slice(0, 180) }
      let payload: any
      try { payload = JSON.parse(String(native.body || '')) } catch { return { models: [], error: 'Claude 模型目录返回的不是 JSON' } }
      const ids = (Array.isArray(payload?.data) ? payload.data : []).map((row: any) => String(row?.id || '').trim()).filter(Boolean)
      return { models: normalizeModelIds(ids), error: ids.length ? '' : 'Claude 模型目录没有返回可用模型' }
    }
    const r = await apiFetch('/api/claude/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return { models: [], error: String(d?.error || ('HTTP ' + r.status)).slice(0, 240) }
    return { models: normalizeModelIds(d?.models), error: '' }
  } catch (e) {
    return { models: [], error: e instanceof Error ? e.message : '拉取失败' }
  }
}

async function fetchGrokModels(token: string): Promise<{ models: string[]; error: string }> {
  const headers: Record<string, string> = {
    Authorization: 'Bearer ' + token,
    'X-XAI-Token-Auth': 'xai-grok-cli',
    Accept: 'application/json',
  }
  const urls = ['https://cli-chat-proxy.grok.com/v1/models-v2', 'https://api.x.ai/v1/models']
  try {
    const ids = new Set<string>()
    let lastError = ''
    for (const url of urls) {
      const native = nativeHttpGet(url, headers)
      if (native && !native.error) {
        const status = Number(native.status || 0)
        if (status >= 400) { lastError = 'HTTP ' + status + ' · ' + String(native.body || '').slice(0, 120); continue }
        try {
          const payload = JSON.parse(String(native.body || ''))
          for (const row of Array.isArray(payload?.data) ? payload.data : []) {
            if (!row) continue
            if (typeof row === 'string') { ids.add(row); continue }
            if (row.hidden === true) continue
            const id = String(row.id || row.model || row.modelId || row.slug || '').trim()
            if (id) ids.add(id)
          }
        } catch { lastError = '模型目录返回的不是 JSON' }
      } else {
        // 没有原生桥时走服务端代理（一次拿两边的合并结果）。
        const r = await apiFetch('/api/grok/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
        const d = await r.json().catch(() => ({}))
        if (r.ok) return { models: normalizeModelIds(d?.models), error: '' }
        lastError = String(d?.error || ('HTTP ' + r.status))
        break
      }
    }
    if (!ids.size) return { models: [], error: lastError || 'Grok 模型目录没有返回可用模型' }
    return { models: normalizeModelIds([...ids]), error: '' }
  } catch (e) {
    return { models: [], error: e instanceof Error ? e.message : '拉取失败' }
  }
}

function normalizeCodexModels(payload: any): { models: string[]; error: string } {
  const rows = Array.isArray(payload?.models) ? payload.models : Array.isArray(payload?.data) ? payload.data : []
  const ids = rows.map((row: any) => typeof row === 'string' ? row : String(row?.slug || row?.id || '')).filter(Boolean)
  return { models: normalizeModelIds(ids), error: ids.length ? '' : 'Codex 模型目录没有返回可用模型' }
}

async function fetchRemoteModels(endpoint: string, token: string, channelId = '', accountId = ''): Promise<{ models: string[]; error: string }> {
  if (!token) return { models: [], error: '缺少登录令牌' }
  if (channelId === 'claude') return fetchClaudeModels(token)
  if (channelId === 'grok') return fetchGrokModels(token)
  if (channelId === 'gpt') return fetchCodexModels(token, accountId)
  if (!endpoint) return { models: [], error: '缺少接口地址' }
  return fetchStandardModels(endpoint, token)
}

export function SubscriptionAccounts({ vendors, setVendors, setModelProfiles, subscriptions, setSubscriptions }: Props) {
  const [busy, setBusy] = useState('')
  const [usageBusy,setUsageBusy]=useState('')
  const [usageExpanded,setUsageExpanded]=useState('')
  const [usageByChannel,setUsageByChannel]=useState<Record<string,{windows:SubscriptionUsageWindow[];error:string;checkedAt:string}>>({})
  const [menu, setMenu] = useState('')
  const [errorInfo, setErrorInfo] = useState<LoginErrorInfo | null>(null)
  const [showErrorDetail, setShowErrorDetail] = useState(false)
  const [modelOpen, setModelOpen] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [modelNote, setModelNote] = useState('')
  const [device, setDevice] = useState<{ userCode: string; url: string; status: string } | null>(null)
  const deviceCancelledRef = useRef(false)
  // 可登录的渠道只有这三家，全部直接列出来；不再做无意义的分类筛选条。
  const rows = ROWS
  const accountOf = (id: string) => subscriptions.find(s => s.channelId === id)
  const refreshUsage = async (a:SubscriptionAccount) => {
    const channel=a.channelId
    const vendor=vendors.find(v=>v.id===(a.vendorId||channelById(channel)?.vendorId))
    const token=(vendor?.keys||[]).find(k=>k.id===a.vendorKeyId)?.value||''
    setUsageBusy(channel)
    setUsageExpanded(channel)
    try{
      const updated=await ensureFreshToken(a,token)
      if(updated.error && !updated.token){setUsageByChannel(old=>({...old,[channel]:{windows:[],error:updated.error,checkedAt:new Date().toLocaleTimeString('zh-CN')}}));return}
      const result=await fetchSubscriptionUsage(channel,updated.token,updated.account.accountId||'',nativeHttpGetAsync)
      setUsageByChannel(old=>({...old,[channel]:{...result,checkedAt:new Date().toLocaleTimeString('zh-CN')}}))
    }catch(error){setUsageByChannel(old=>({...old,[channel]:{windows:[],error:error instanceof Error?error.message:'查询失败',checkedAt:new Date().toLocaleTimeString('zh-CN')}}))}
    finally{setUsageBusy('')}
  }

  // 凭据只有一份：订阅登录拿到的令牌直接进供应商的多 KEY 队列；
  // 模型清单同一处写进该供应商，勾选结果立刻同步到聊天模型池。
  // keyValue: 令牌 = 写入 / 空串 = 移除 / null = 保留现有 Key 不动（只改模型）。
  const commit = (a: SubscriptionAccount, keyValue: string | null, state: ModelState | null) => {
    const ch = channelById(a.channelId)
    const vid = a.vendorId || ch?.vendorId || ('sub-' + a.channelId)
    const current = vendors.find(v => v.id === vid)
    const base: Vendor = current || ({
      id: vid, name: ch?.name || a.label,
      endpoint: a.endpoint || ch?.endpoint || '',
      apiPath: '', modelsPath: '', builtin: false, keys: [], models: [],
    } as Vendor)
    const keys = keyValue === null
      ? (base.keys || []).slice()
      : (base.keys || []).filter(k => k.id !== a.vendorKeyId)
    let keyId = keyValue === '' ? '' : (a.vendorKeyId || '')
    if (keyValue) {
      keyId = a.vendorKeyId || crypto.randomUUID()
      keys.push({ id: keyId, label: '订阅号 · ' + (a.label || '我的账号'), value: keyValue, role: 'primary' as const })
    }
    const existing: VendorModel[] = base.models || []
    const models = state
      ? buildSubscriptionModels(existing, state.available, state.picked)
      : existing.filter(m => m?.source !== 'subscription')
    const vendor: Vendor = {
      ...base, endpoint: a.endpoint || base.endpoint, keys, models,
      subscription: !!state,
      // 聊天时据此选择 Codex / Messages / xAI Responses 适配器；退出登录后不再标记。
      subscriptionChannel: state ? a.channelId : (keyValue === '' ? '' : base.subscriptionChannel),
      subscriptionAccountId: state ? (a.accountId || '') : base.subscriptionAccountId,
    }
    const emptyShell = keyValue === '' && !current?.builtin && keys.length === 0 && models.length === 0
    const next = emptyShell
      ? vendors.filter(v => v.id !== vid)
      : current ? vendors.map(v => v.id === vid ? vendor : v) : [...vendors, vendor]
    setVendors(next)
    setModelProfiles(old => syncVendorProfiles(next, old))
    return { keyId, vendor }
  }

  const tokenExpiry = (seconds: number) => seconds > 0 ? new Date(Date.now() + seconds * 1000).toISOString() : ''

  const replaceVendorToken = (a: SubscriptionAccount, token: string) => {
    const ch = channelById(a.channelId)
    const vid = a.vendorId || ch?.vendorId || ('sub-' + a.channelId)
    const nextVendors = vendors.map(v => v.id !== vid ? v : ({
      ...v,
      keys: (v.keys || []).map(k => k.id === a.vendorKeyId ? { ...k, value: token } : k),
    }))
    setVendors(nextVendors)
    setModelProfiles(old => syncVendorProfiles(nextVendors, old))
  }

  const refreshOAuthToken = async (a: SubscriptionAccount, currentToken: string) => {
    const refreshToken = String(a.refreshToken || '')
    if (!refreshToken) return { account: a, token: currentToken, error: '登录凭证来自旧版本，请重新登录一次' }
    let url = ''
    let headers: Record<string,string> = {}
    let body = ''
    if (a.channelId === 'gpt') {
      url = 'https://auth.openai.com/oauth/token'
      headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
      body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
        refresh_token: refreshToken,
      }).toString()
    } else if (a.channelId === 'claude') {
      url = 'https://api.anthropic.com/v1/oauth/token'
      headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'anthropic-sdk-typescript/0.68.0 userOAuthProvider',
      }
      body = JSON.stringify({
        grant_type: 'refresh_token',
        client_id: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
        refresh_token: refreshToken,
      })
    } else if (a.channelId === 'grok') {
      url = 'https://auth.x.ai/oauth2/token'
      headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
      body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: GROK_CLIENT_ID,
        refresh_token: refreshToken,
      }).toString()
    } else {
      return { account: a, token: currentToken, error: '这个账号暂不支持自动续期' }
    }
    try {
      const native = nativeHttpPost(url, headers, body)
      if (!native || native.error) return { account: a, token: currentToken, error: native?.error || '原生网络请求不可用' }
      const status = Number(native.status || 0)
      let data: any = {}
      try { data = JSON.parse(String(native.body || '{}')) } catch { return { account: a, token: currentToken, error: '续期响应不是 JSON' } }
      if (status >= 400 || data.error) return { account: a, token: currentToken, error: String(data.error_description || data.error || ('HTTP ' + status)) }
      const token = String(data.access_token || '')
      if (!token) return { account: a, token: currentToken, error: '续期响应没有 access_token' }
      const patched: SubscriptionAccount = {
        ...a,
        refreshToken: String(data.refresh_token || refreshToken),
        tokenExpiresAt: tokenExpiry(Number(data.expires_in || 0)),
        loggedIn: true,
        lastVerified: nowStamp(),
      }
      replaceVendorToken(patched, token)
      setSubscriptions(subs => subs.map(x => x.id === a.id ? patched : x))
      return { account: patched, token, error: '' }
    } catch (e) {
      return { account: a, token: currentToken, error: e instanceof Error ? e.message : '自动续期失败' }
    }
  }

  const ensureFreshToken = async (a: SubscriptionAccount, currentToken: string, force = false) => {
    const expiresAt = Date.parse(String(a.tokenExpiresAt || ''))
    const shouldRefresh = force || (Number.isFinite(expiresAt) && expiresAt <= Date.now() + 60_000)
    if (!shouldRefresh) return { account: a, token: currentToken, error: '' }
    return refreshOAuthToken(a, currentToken)
  }

  const applyLogin = async (
    id: string,
    auth: { token: string; refreshToken?: string; expiresIn?: number; idToken?: string },
    source = '网页授权登录',
  ) => {
    const found = subscriptions.find(s => s.channelId === id)
    const a = found || blankSubscription(channelById(id) || SUBSCRIPTION_CHANNELS[0])
    const ch = channelById(id)
    const endpoint = a.endpoint || ch?.endpoint || ''
    const token = String(auth.token || '')
    const idToken = String(auth.idToken || '')
    const accountId = chatGptAccountIdFromToken(idToken) || chatGptAccountIdFromToken(token) || a.accountId || ''
    const credentialAccount: SubscriptionAccount = {
      ...a,
      refreshToken: String(auth.refreshToken || ''),
      tokenExpiresAt: tokenExpiry(Number(auth.expiresIn || 0)),
      accountId,
    }
    const fetched = await fetchRemoteModels(endpoint, token, id, accountId)
    // 重新登录时保留用户以前增删 / 勾选过的模型，不让它一登录就丢。
    const available = mergeAvailableModels([...fetched.models, ...(a.availableModels || [])], id)
    const state: ModelState = { available, picked: a.pickedModels?.length ? a.pickedModels : null }
    const { keyId, vendor } = commit(credentialAccount, token, state)
    const picked = pickedModelIds(vendor)
    const patched: SubscriptionAccount = {
      ...credentialAccount,
      loginMode: 'web', vendorKeyId: keyId, apiKey: '',
      tokenSource: source, loggedIn: true, accountId,
      modelSource: fetched.models.length ? 'account' : 'candidate',
      modelCount: picked.length, availableModels: available, pickedModels: picked,
      lastVerified: nowStamp(),
    }
    setSubscriptions(found ? subscriptions.map(s => s.id === a.id ? patched : s) : [...subscriptions, patched])
    setModelNote(fetched.models.length
      ? '已从账号拉取 ' + fetched.models.length + ' 个模型，可在「选择模型」里调整。'
      : '未能自动同步模型' + (fetched.error ? '（' + fetched.error + '）' : '') + '。可以点「重新同步」再试。')
    setModelOpen(id)
  }

  const login = async (id: string) => {
    setBusy(id); setErrorInfo(null); setShowErrorDetail(false); setMenu(''); setModelNote('')
    try {
      const pkce = await makePkce()
      const config = buildLoginConfig(id, pkce)
      if (!config) throw new Error('这个渠道暂时不支持网页登录')
      const result = await startOAuthLogin(config)
      await applyLogin(id, result)
    } catch (e) {
      setErrorInfo(formatLoginError(e))
      setShowErrorDetail(false)
    } finally {
      setBusy('')
    }
  }

  const grokDeviceStart = async () => {
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
    const form = new URLSearchParams({ client_id: GROK_CLIENT_ID, scope: GROK_SCOPE }).toString()
    const native = nativeHttpPost('https://auth.x.ai/oauth2/device/code', headers, form)
    if (native && !native.error) {
      const status = Number(native.status || 0)
      let data: any = {}
      try { data = JSON.parse(String(native.body || '')) } catch { /* 交给下面报错 */ }
      if (status >= 400 || data.error) throw new Error(data.error_description || data.error || ('xAI HTTP ' + status))
      return data
    }
    if (native?.error) throw new Error(native.error)
    const r = await apiFetch('/api/oauth/device/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'grok' }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status))
    return d
  }

  const grokDevicePoll = async (deviceCode: string) => {
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
    const form = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: GROK_CLIENT_ID,
      device_code: deviceCode,
    }).toString()
    const native = nativeHttpPost('https://auth.x.ai/oauth2/token', headers, form)
    if (native && !native.error) {
      try { return JSON.parse(String(native.body || '{}')) } catch { return {} }
    }
    if (native?.error) throw new Error(native.error)
    const r = await apiFetch('/api/oauth/device/poll', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'grok', deviceCode }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok && d.error) return d
    return d
  }

  const startGrokLogin = async () => {
    if (busy) return
    setBusy('grok'); setErrorInfo(null); setShowErrorDetail(false); setMenu(''); setModelNote('')
    deviceCancelledRef.current = false
    try {
      const start = await grokDeviceStart()
      const url = String(start.verification_uri_complete || start.verification_uri || '')
      if (!start.device_code || !start.user_code || !url.startsWith('https://')) throw new Error('xAI 没有返回可用的设备码')
      setDevice({ userCode: String(start.user_code), url, status: '等待你在 xAI 页面完成授权…' })
      if (!openExternalUrl(url)) window.open(url, '_blank')
      const deadline = Date.now() + Math.min(1800, Math.max(60, Number(start.expires_in) || 600)) * 1000
      let interval = Math.min(60, Math.max(2, Number(start.interval) || 5)) * 1000
      while (Date.now() < deadline) {
        await sleep(interval)
        if (deviceCancelledRef.current) { setDevice(null); return }
        const poll = await grokDevicePoll(String(start.device_code))
        if (poll?.access_token) {
          setDevice(null)
          await applyLogin('grok', {
            token: String(poll.access_token),
            refreshToken: String(poll.refresh_token || ''),
            expiresIn: Number(poll.expires_in || 0),
          }, '设备码登录')
          return
        }
        if (poll?.error === 'authorization_pending') continue
        if (poll?.error === 'slow_down') { interval += 5000; continue }
        throw new Error(poll?.error_description || poll?.error || 'Grok 授权失败')
      }
      throw new Error('Grok 授权超时，请重新登录')
    } catch (e) {
      setErrorInfo(formatLoginError(e))
      setShowErrorDetail(false)
      setDevice(null)
    } finally {
      setBusy('')
    }
  }

  // 勾选 / 取消 / 手动添加 / 重新拉取，全部走同一条写入路径。
  const updateModels = (a: SubscriptionAccount, available: string[], picked: string[], note = '', modelSource = a.modelSource) => {
    const nextAvailable = normalizeModelIds(available)
    const state: ModelState = { available: nextAvailable, picked }
    const { vendor } = commit(a, null, state)
    const chosen = pickedModelIds(vendor)
    const patched: SubscriptionAccount = {
      ...a, modelSource, modelCount: chosen.length, availableModels: nextAvailable, pickedModels: chosen,
    }
    setSubscriptions(subscriptions.map(s => s.id === a.id ? patched : s))
    if (note) setModelNote(note)
    return nextAvailable
  }

  const refreshModels = async (a: SubscriptionAccount) => {
    setBusy(a.channelId); setModelNote('')
    try {
      const ch = channelById(a.channelId)
      const endpoint = a.endpoint || ch?.endpoint || ''
      const currentKey = (vendors.find(v => v.id === (a.vendorId || ch?.vendorId))?.keys || [])
        .find(k => k.id === a.vendorKeyId)?.value || ''
      let resolved = await ensureFreshToken(a, currentKey)
      if (resolved.error && !resolved.token) {
        setModelNote(resolved.error)
        return
      }
      let fetched = await fetchRemoteModels(endpoint, resolved.token, a.channelId, resolved.account.accountId || '')
      if (!fetched.models.length && /401|403|bad-credentials|invalid[_ -]?token|unauth/i.test(fetched.error)) {
        resolved = await ensureFreshToken(resolved.account, resolved.token, true)
        if (!resolved.error) {
          fetched = await fetchRemoteModels(endpoint, resolved.token, a.channelId, resolved.account.accountId || '')
        }
      }
      if (!fetched.models.length) {
        if (!resolved.account.refreshToken && /401|403|bad-credentials|invalid[_ -]?token|unauth/i.test(fetched.error)) {
          setModelNote('登录状态已经过期，而且这是旧版保存的账号凭证。请点右侧菜单「重新登录」一次，之后会自动续期和同步模型。')
          return
        }
        setModelNote('自动同步失败' + (fetched.error ? '：' + fetched.error : '') + '。可稍后重试；如果持续失败请重新登录。')
        return
      }
      const merged = mergeAvailableModels(fetched.models, a.channelId)
      updateModels(resolved.account, merged, merged, '已自动同步 ' + fetched.models.length + ' 个模型。', 'account')
    } finally { setBusy('') }
  }

  const openModels = (a: SubscriptionAccount) => {
    setModelOpen(modelOpen === a.channelId ? '' : a.channelId)
  }

  const logout = (id: string) => {
    const a = accountOf(id)
    if (!a) return
    commit(a, '', null)
    setSubscriptions(subscriptions.map(s => s.id === a.id ? {
      ...s, vendorKeyId: '', apiKey: '', tokenSource: '', refreshToken: '', tokenExpiresAt: '',
      loggedIn: false, modelSource: '', modelCount: 0, lastVerified: '',
    } : s))
    setMenu(''); setModelOpen(''); setModelNote('')
  }

  // 和供应商列表一样直接作为设置页内容显示，不再从底部弹出半屏面板。
  return <section id="subscription-accounts" className="account-login-page">
      <header className="account-page-head">
        <b>账号登录</b>
        <p className="account-page-lead">登录成功后会自动同步这个账号可用的模型；令牌过期会自动续期，不需要填写网址或 API Key。</p>
      </header>
      <div className="account-rows">
        {rows.map(r => {
          const a = accountOf(r.id)
          const on = !!a?.loggedIn
          const available = a?.availableModels?.length ? a.availableModels : mergeAvailableModels([], r.id)
          const picked = a?.pickedModels || []
          const expanded = modelOpen === r.id && on
          const MarkIcon = r.mark
          return <div className="account-row-wrap" key={r.id}>
            <div className="account-row" data-channel-id={r.id}>
              <span className={'account-mark mark-' + r.id} aria-hidden="true"><MarkIcon size={17}/></span>
              <span className="account-row-text">
                <b>{r.name}</b>
                <small>{on ? (a!.modelSource === 'candidate' ? '已登录 · 模型未拉取（候选 ' + (picked.length || 0) + ' 个）' : '已登录 · ' + (picked.length || 0) + ' 个模型') : r.sub}</small>
              </span>
              <button type="button" disabled={busy === r.id}
                className={'account-login-btn' + (on ? ' done' : '')}
                aria-label={(on ? '已登录 ' : '登录 ') + r.name}
                onClick={() => { if (on) setMenu(menu === r.id ? '' : r.id); else if (r.id === 'grok') void startGrokLogin(); else void login(r.id) }}>
                {busy === r.id ? '登录中…' : on ? <><IconCheck className="ui-icon-inline" size={13}/> 已登录</> : <><IconChevronRight className="ui-icon-inline" size={13}/> 登录</>}
              </button>
            </div>
            {on && <div className="account-row-links">
              <button type="button" className={expanded ? 'active' : ''}
                onClick={() => openModels(a!)}><IconGrid className="ui-icon-inline" size={13}/> 选择模型 · {picked.length || 0}</button>
              <button type="button" className={usageExpanded===r.id?'active':''} onClick={()=>{if(usageExpanded===r.id)setUsageExpanded('');else if(usageByChannel[r.id])setUsageExpanded(r.id);else void refreshUsage(a!)}} aria-expanded={usageExpanded===r.id}>用量 / 剩余</button>
              <button type="button" onClick={() => setMenu(menu === r.id ? '' : r.id)} aria-label="更多账号操作"><IconMore size={15}/></button>
            </div>}
            {on&&usageExpanded===r.id&&<div className="account-usage-panel" data-usage-for={r.id}>
              <div className="account-usage-head"><b>订阅额度</b><button type="button" disabled={usageBusy===r.id} onClick={()=>void refreshUsage(a!)}>{usageBusy===r.id?'查询中…':'刷新'}</button></div>
              <p className="account-usage-note">显示订阅限额周期的使用比例与剩余比例，不是 API Token 余额。</p>
              {usageBusy===r.id&&!usageByChannel[r.id]&&<p className="muted">正在读取账号用量…</p>}
              {usageByChannel[r.id]?.error&&<p className="account-usage-error">{usageByChannel[r.id].error}</p>}
              {usageByChannel[r.id]?.windows?.map(w=><div className="account-usage-window" key={w.label}>
                <b>{w.label}</b><div><span>已用 {w.used.toFixed(1)}%</span><span>剩余 {w.remaining.toFixed(1)}%</span></div>
                <div className="account-usage-bar" role="meter" aria-label={w.label+'已用比例'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={w.used}><i style={{width:w.used+'%'}}/></div>
                {w.resetAt&&<small>重置时间：{(()=>{const v=w.resetAt;const d=typeof v==='number'?new Date(v*1000):new Date(v);return Number.isNaN(d.getTime())?'未知':d.toLocaleString('zh-CN')})()}</small>}
              </div>)}
              {usageByChannel[r.id]&&<small>最近查询：{usageByChannel[r.id].checkedAt} · 数据来自订阅用量接口</small>}
            </div>}
            {expanded && <div className="account-models" data-models-for={r.id}>
              <p className="account-models-lead">勾选的模型会进入聊天模型面板；可自己增删。</p>
              {a!.modelSource !== 'account' && <p className="account-model-warning">当前还没有同步到账号真实模型。可以点下面的「重新同步」；如果提示登录过期，请重新登录一次。</p>}
              {a!.modelSource === 'account' && <p className="account-endpoint-hint">模型目录已从账号自动同步。</p>}
              <div className="account-model-chips">
                {available.map(id => <button type="button" key={id}
                  className={'account-model-chip' + (picked.includes(id) ? ' on' : '')}
                  aria-pressed={picked.includes(id)} data-model-id={id}
                  onClick={() => updateModels(a!, available,
                    picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id])}>
                  {picked.includes(id) ? <IconCheck className="ui-icon-inline" size={12}/> : null}{id}
                </button>)}
              </div>
              <div className="account-model-actions">
                <input aria-label="添加模型 ID" value={customModel}
                  onChange={e => setCustomModel(e.target.value)}
                  onKeyDown={e => {
                    if (e.key !== 'Enter' || !customModel.trim()) return
                    e.preventDefault()
                    const id = customModel.trim()
                    updateModels(a!, [...available, id], [...picked, id], '已添加模型 ' + id)
                    setCustomModel('')
                  }}
                  placeholder="添加模型 ID，回车确认"/>
                <button type="button" onClick={() => {
                  const id = customModel.trim()
                  if (!id) return
                  updateModels(a!, [...available, id], [...picked, id], '已添加模型 ' + id)
                  setCustomModel('')
                }}>添加</button>
                <button type="button" disabled={busy === r.id} onClick={() => void refreshModels(a!)}>
                  {busy === r.id ? '同步中…' : '重新同步'}
                </button>
              </div>
            </div>}
            {menu === r.id && on && <div className="account-row-menu">
              <button type="button" onClick={() => void login(r.id)}>重新登录</button>
              <button type="button" onClick={() => logout(r.id)}>退出登录</button>
            </div>}
          </div>
        })}
      </div>
      {modelNote && <p className="account-note">{modelNote}</p>}
      {errorInfo && <div className="account-error" role="alert">
        <p>{errorInfo.title}</p>
        {errorInfo.hint && <small>{errorInfo.hint}</small>}
        {errorInfo.detail && <>
          <button type="button" className="account-error-toggle" aria-expanded={showErrorDetail} onClick={() => setShowErrorDetail(v => !v)}>{showErrorDetail ? '收起详情' : '查看详情'}</button>
          {showErrorDetail && <pre className="account-error-detail">{errorInfo.detail}</pre>}
        </>}
      </div>}
      {device && <div className="device-scrim" role="presentation">
        <div className="device-card" role="dialog" aria-modal="true" aria-label="Grok 登录">
          <b>登录 Grok</b>
          <p>在 xAI 授权页输入下面的代码：</p>
          <strong className="device-code">{device.userCode}</strong>
          <p className="device-status">{device.status}</p>
          <div className="device-actions">
            <button type="button" onClick={() => { if (!openExternalUrl(device.url)) window.open(device.url, '_blank') }}>打开授权页</button>
            <button type="button" className="device-cancel" onClick={() => { deviceCancelledRef.current = true; setDevice(null) }}>取消</button>
          </div>
          <small className="device-url">{device.url}</small>
        </div>
      </div>}
  </section>
}
