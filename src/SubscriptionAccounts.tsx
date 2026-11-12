import { useState, type Dispatch, type SetStateAction } from 'react'
import { channelById, SUBSCRIPTION_CHANNELS, blankSubscription, type SubscriptionAccount } from './subscriptionChannels.mjs'
import { syncVendorProfiles, type Vendor, type VendorModel } from './vendors.mjs'
import type { ModelProfile } from './resourceBindings.mjs'
import { makePkce, buildLoginConfig } from './subscriptionOAuth.mjs'
import { startOAuthLogin } from './nativeOAuth.mjs'
import { apiFetch } from './apiBase.mjs'
import {
  mergeAvailableModels, normalizeModelIds, buildSubscriptionModels,
  pickedModelIds, type ModelState,
} from './subscriptionModels.mjs'

// 账号登录：只做「点一下 → App 内官方授权页 → 自动拿回令牌 → 自动带上模型」。
// 面板里没有任何网址 / 回调地址 / 令牌 / 账号密码输入框，也不需要复制粘贴。
// Android 侧由 MainActivity 的可控 WebView 拦截 localhost:1455 这类回调并原地换令牌。
// 登录后优先用令牌拉该账号真实模型列表；官方订阅端点不提供 /models 时列出可增删的
// 常用模型，勾进池子后聊天窗口的模型面板就能像填 API 一样选到它们。
type Props = {
  vendors: Vendor[]
  setVendors: Dispatch<SetStateAction<Vendor[]>>
  setModelProfiles: Dispatch<SetStateAction<ModelProfile[]>>
  subscriptions: SubscriptionAccount[]
  setSubscriptions: Dispatch<SetStateAction<SubscriptionAccount[]>>
  onClose?: () => void
}

const TABS = [
  { id: 'all', label: '全部' },
  { id: 'gpt', label: 'ChatGPT' },
  { id: 'claude', label: 'Claude' },
  { id: 'grok', label: 'Grok' },
]

const ROWS = [
  { id: 'gpt', name: 'ChatGPT', sub: 'GPT / Codex 订阅', mark: '◎' },
  { id: 'claude', name: 'Claude', sub: 'Pro / Max 订阅', mark: '✳' },
  { id: 'grok', name: 'Grok', sub: 'X / xAI 订阅', mark: '◉' },
]

// 放到模块级，避免组件渲染作用域里出现不纯的时间调用。
const nowStamp = () => new Date().toISOString()

// 官方订阅端点多数不是 OpenAI 兼容 /models；给 3 秒超时，失败就静默回退到候选清单。
async function fetchRemoteModels(endpoint: string, token: string): Promise<string[]> {
  if (!endpoint || !token) return []
  const work = (async () => {
    const r = await apiFetch('/api/models', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint, apiKey: token }),
    })
    const d = await r.json().catch(() => ({}))
    return r.ok ? normalizeModelIds(d?.models) : []
  })()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<string[]>(res => { timer = setTimeout(() => res([]), 3000) })
  try { return await Promise.race([work, timeout]) } catch { return [] }
  finally { if (timer) clearTimeout(timer) }
}

export function SubscriptionAccounts({ vendors, setVendors, setModelProfiles, subscriptions, setSubscriptions, onClose }: Props) {
  const [tab, setTab] = useState('all')
  const [busy, setBusy] = useState('')
  const [menu, setMenu] = useState('')
  const [error, setError] = useState('')
  const [modelOpen, setModelOpen] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [modelNote, setModelNote] = useState('')
  const rows = tab === 'all' ? ROWS : ROWS.filter(r => r.id === tab)
  const accountOf = (id: string) => subscriptions.find(s => s.channelId === id)

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
    }
    const emptyShell = keyValue === '' && !current?.builtin && keys.length === 0 && models.length === 0
    const next = emptyShell
      ? vendors.filter(v => v.id !== vid)
      : current ? vendors.map(v => v.id === vid ? vendor : v) : [...vendors, vendor]
    setVendors(next)
    setModelProfiles(old => syncVendorProfiles(next, old))
    return { keyId, vendor }
  }

  const login = async (id: string) => {
    setBusy(id); setError(''); setMenu(''); setModelNote('')
    try {
      const pkce = await makePkce()
      const config = buildLoginConfig(id, pkce)
      if (!config) throw new Error('这个渠道暂时不支持网页登录')
      const result = await startOAuthLogin(config)
      const found = subscriptions.find(s => s.channelId === id)
      const a = found || blankSubscription(channelById(id) || SUBSCRIPTION_CHANNELS[0])
      const ch = channelById(id)
      const endpoint = a.endpoint || ch?.endpoint || ''
      const fetched = await fetchRemoteModels(endpoint, result.token)
      // 重新登录时保留用户以前增删 / 勾选过的模型，不让它一登录就丢。
      const available = mergeAvailableModels([...fetched, ...(a.availableModels || [])], id)
      const state: ModelState = { available, picked: a.pickedModels?.length ? a.pickedModels : null }
      const { keyId, vendor } = commit(a, result.token, state)
      const picked = pickedModelIds(vendor)
      const verifiedAt = nowStamp()
      const patched: SubscriptionAccount = {
        ...a,
        loginMode: 'web', vendorKeyId: keyId, apiKey: '',
        tokenSource: '网页授权登录', loggedIn: true,
        modelCount: picked.length, availableModels: available, pickedModels: picked,
        lastVerified: verifiedAt,
      }
      setSubscriptions(found ? subscriptions.map(s => s.id === a.id ? patched : s) : [...subscriptions, patched])
      setModelNote(fetched.length
        ? '已从账号拉取 ' + fetched.length + ' 个模型，可在「选择模型」里调整。'
        : '官方订阅接口不返回模型列表，已列出常用模型；可在「选择模型」里增删。')
      setModelOpen(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败，请再试一次')
    } finally {
      setBusy('')
    }
  }

  // 勾选 / 取消 / 手动添加 / 重新拉取，全部走同一条写入路径。
  const updateModels = (a: SubscriptionAccount, available: string[], picked: string[], note = '') => {
    const nextAvailable = normalizeModelIds(available)
    const state: ModelState = { available: nextAvailable, picked }
    const { vendor } = commit(a, null, state)
    const chosen = pickedModelIds(vendor)
    const patched: SubscriptionAccount = {
      ...a, modelCount: chosen.length, availableModels: nextAvailable, pickedModels: chosen,
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
      const fetched = await fetchRemoteModels(endpoint, currentKey)
      if (!fetched.length) { setModelNote('这个订阅没有返回在线模型列表，可以继续用下面的常用模型。'); return }
      const merged = mergeAvailableModels(fetched, a.channelId)
      updateModels(a, merged, merged, '已拉取 ' + fetched.length + ' 个模型。')
    } finally { setBusy('') }
  }

  const logout = (id: string) => {
    const a = accountOf(id)
    if (!a) return
    commit(a, '', null)
    setSubscriptions(subscriptions.map(s => s.id === a.id ? {
      ...s, vendorKeyId: '', apiKey: '', tokenSource: '', loggedIn: false,
      modelCount: 0, lastVerified: '',
    } : s))
    setMenu(''); setModelOpen(''); setModelNote('')
  }

  return <div className="account-login-layer" onClick={() => onClose?.()}>
    <div id="subscription-accounts" className="account-login-sheet" onClick={e => e.stopPropagation()}>
      <span className="account-sheet-handle" aria-hidden="true" />
      <div className="account-sheet-head">
        <button type="button" className="account-sheet-close" aria-label="关闭账号登录" onClick={() => onClose?.()}>×</button>
        <b>账号登录</b>
        <span aria-hidden="true" />
      </div>
      <p className="account-sheet-lead">登录订阅账号后，模型会自动出现在聊天的模型面板里，和填 API 一样直接选。</p>
      <div className="account-tabs" role="tablist" aria-label="账号登录渠道">
        {TABS.map(t => <button type="button" role="tab" aria-selected={tab === t.id} key={t.id}
          className={'account-tab' + (tab === t.id ? ' active' : '')}
          onClick={() => { setTab(t.id); setError(''); setMenu(''); setModelOpen('') }}>{t.label}</button>)}
      </div>
      <div className="account-rows">
        {rows.map(r => {
          const a = accountOf(r.id)
          const on = !!a?.loggedIn
          const available = a?.availableModels?.length ? a.availableModels : mergeAvailableModels([], r.id)
          const picked = a?.pickedModels || []
          const expanded = modelOpen === r.id && on
          return <div className="account-row-wrap" key={r.id}>
            <div className="account-row" data-channel-id={r.id}>
              <span className={'account-mark mark-' + r.id} aria-hidden="true">{r.mark}</span>
              <span className="account-row-text">
                <b>{r.name}</b>
                <small>{on ? '已登录 · ' + (picked.length || 0) + ' 个模型可用' : r.sub}</small>
              </span>
              <button type="button" disabled={busy === r.id}
                className={'account-login-btn' + (on ? ' done' : '')}
                aria-label={(on ? '已登录 ' : '登录 ') + r.name}
                onClick={() => { if (on) setMenu(menu === r.id ? '' : r.id); else void login(r.id) }}>
                {busy === r.id ? '登录中…' : on ? '✓ 已登录' : '→ 登录'}
              </button>
            </div>
            {on && <div className="account-row-links">
              <button type="button" className={expanded ? 'active' : ''}
                onClick={() => setModelOpen(expanded ? '' : r.id)}>◈ 选择模型 · {picked.length || 0}</button>
              <button type="button" onClick={() => setMenu(menu === r.id ? '' : r.id)}>⋯</button>
            </div>}
            {expanded && <div className="account-models" data-models-for={r.id}>
              <p className="account-models-lead">勾选的模型会进入聊天模型面板；可自己增删，官方接口没返回时用的是常用模型候选。</p>
              <div className="account-model-chips">
                {available.map(id => <button type="button" key={id}
                  className={'account-model-chip' + (picked.includes(id) ? ' on' : '')}
                  aria-pressed={picked.includes(id)} data-model-id={id}
                  onClick={() => updateModels(a!, available,
                    picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id])}>
                  {picked.includes(id) ? '✓ ' : ''}{id}
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
                  {busy === r.id ? '拉取中…' : '重新拉取'}
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
      {error && <p className="account-error">{error}</p>}
    </div>
  </div>
}
