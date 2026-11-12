import { useState, type Dispatch, type SetStateAction } from 'react'
import { channelById, SUBSCRIPTION_CHANNELS, blankSubscription, type SubscriptionAccount } from './subscriptionChannels.mjs'
import { syncVendorProfiles, type Vendor } from './vendors.mjs'
import type { ModelProfile } from './resourceBindings.mjs'
import { makePkce, buildLoginConfig } from './subscriptionOAuth.mjs'
import { startOAuthLogin } from './nativeOAuth.mjs'

// 账号登录：只做「点一下 → App 内官方授权页 → 自动拿回令牌」。
// 面板里没有任何网址 / 回调地址 / 令牌 / 账号密码输入框，也不需要复制粘贴。
// Android 侧由 MainActivity 的可控 WebView 拦截 localhost:1455 这类回调并原地换令牌，
// 所以不会出现「localhost 拒绝了连接」；拿到的令牌只写进 vendors.keys，不进云端快照。
type Props = {
  vendors: Vendor[]
  setVendors: Dispatch<SetStateAction<Vendor[]>>
  setModelProfiles: Dispatch<SetStateAction<ModelProfile[]>>
  subscriptions: SubscriptionAccount[]
  setSubscriptions: Dispatch<SetStateAction<SubscriptionAccount[]>>
  onClose?: () => void
}

const TABS = [
  { id: 'gpt', label: 'ChatGPT' },
  { id: 'claude', label: 'Claude' },
  { id: 'grok', label: 'Grok' },
  { id: 'all', label: '账号登录' },
]

const ROWS = [
  { id: 'gpt', name: 'ChatGPT', sub: 'Codex', mark: '◎' },
  { id: 'grok', name: 'Grok', sub: 'xAI', mark: '◉' },
  { id: 'claude', name: 'Claude', sub: 'Pro / Max', mark: '✳' },
]

export function SubscriptionAccounts({ vendors, setVendors, setModelProfiles, subscriptions, setSubscriptions, onClose }: Props) {
  const [tab, setTab] = useState('all')
  const [busy, setBusy] = useState('')
  const [menu, setMenu] = useState('')
  const [error, setError] = useState('')
  const rows = tab === 'all' ? ROWS : ROWS.filter(r => r.id === tab)
  const accountOf = (id: string) => subscriptions.find(s => s.channelId === id)

  // 凭据只有一份：订阅登录拿到的令牌直接进供应商的多 KEY 队列。
  const writeKey = (a: SubscriptionAccount, keyValue: string) => {
    const ch = channelById(a.channelId)
    const vid = a.vendorId || ch?.vendorId || ('sub-' + a.channelId)
    const current = vendors.find(v => v.id === vid)
    const base = current || ({
      id: vid, name: ch?.name || a.label,
      endpoint: a.endpoint || ch?.endpoint || '',
      apiPath: '', modelsPath: '', builtin: false, keys: [], models: [],
    } as Vendor)
    const keys = base.keys.filter(k => k.id !== a.vendorKeyId)
    let keyId = ''
    if (keyValue) {
      keyId = a.vendorKeyId || crypto.randomUUID()
      keys.push({ id: keyId, label: '订阅号 · ' + (a.label || '我的账号'), value: keyValue, role: 'primary' as const })
    }
    const next = { ...base, endpoint: a.endpoint || base.endpoint, keys, models: base.models } as Vendor
    const emptyShell = !keyValue && !current?.builtin && keys.length === 0 && base.models.length === 0
    const finalVendors = emptyShell
      ? vendors.filter(v => v.id !== vid)
      : current ? vendors.map(v => v.id === vid ? next : v) : [...vendors, next]
    setVendors(finalVendors)
    setModelProfiles(old => syncVendorProfiles(finalVendors, old))
    return keyId
  }

  const login = async (id: string) => {
    setBusy(id); setError(''); setMenu('')
    try {
      const pkce = await makePkce()
      const config = buildLoginConfig(id, pkce)
      if (!config) throw new Error('这个渠道暂时不支持网页登录')
      const result = await startOAuthLogin(config)
      const found = subscriptions.find(s => s.channelId === id)
      const a = found || blankSubscription(channelById(id) || SUBSCRIPTION_CHANNELS[0])
      const keyId = writeKey(a, result.token)
      const patched: SubscriptionAccount = {
        ...a,
        loginMode: 'web', vendorKeyId: keyId, apiKey: '',
        tokenSource: '网页授权登录', loggedIn: true,
        modelCount: 0, availableModels: [], lastVerified: new Date().toISOString(),
      }
      setSubscriptions(found ? subscriptions.map(s => s.id === a.id ? patched : s) : [...subscriptions, patched])
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败，请再试一次')
    } finally {
      setBusy('')
    }
  }

  const logout = (id: string) => {
    const a = accountOf(id)
    if (!a) return
    writeKey(a, '')
    setSubscriptions(subscriptions.map(s => s.id === a.id ? {
      ...s, vendorKeyId: '', apiKey: '', tokenSource: '', loggedIn: false,
      modelCount: 0, availableModels: [], pickedModels: [], lastVerified: '',
    } : s))
    setMenu('')
  }

  return <div className="account-login-layer" onClick={() => onClose?.()}>
    <div id="subscription-accounts" className="account-login-sheet" onClick={e => e.stopPropagation()}>
      <span className="account-sheet-handle" aria-hidden="true" />
      <div className="account-sheet-head">
        <button type="button" className="account-sheet-close" aria-label="关闭账号登录" onClick={() => onClose?.()}>×</button>
        <b>账号登录</b>
        <span aria-hidden="true" />
      </div>
      <div className="account-tabs" role="tablist" aria-label="账号登录渠道">
        {TABS.map(t => <button type="button" role="tab" aria-selected={tab === t.id} key={t.id}
          className={'account-tab' + (tab === t.id ? ' active' : '')}
          onClick={() => { setTab(t.id); setError(''); setMenu('') }}>{t.label}</button>)}
      </div>
      <div className="account-rows">
        {rows.map(r => {
          const on = !!accountOf(r.id)?.loggedIn
          return <div className="account-row-wrap" key={r.id}>
            <div className="account-row" data-channel-id={r.id}>
              <span className={'account-mark mark-' + r.id} aria-hidden="true">{r.mark}</span>
              <span className="account-row-text"><b>{r.name}</b><small>{r.sub}</small></span>
              <button type="button" disabled={busy === r.id}
                className={'account-login-btn' + (on ? ' done' : '')}
                aria-label={(on ? '已登录 ' : '登录 ') + r.name}
                onClick={() => { if (on) setMenu(menu === r.id ? '' : r.id); else void login(r.id) }}>
                {busy === r.id ? '登录中…' : on ? '✓ 已登录' : '→ 登录'}
              </button>
            </div>
            {menu === r.id && on && <div className="account-row-menu">
              <button type="button" onClick={() => void login(r.id)}>重新登录</button>
              <button type="button" onClick={() => logout(r.id)}>退出登录</button>
            </div>}
          </div>
        })}
      </div>
      {error && <p className="account-error">{error}</p>}
    </div>
  </div>
}
