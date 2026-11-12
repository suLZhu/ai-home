import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { pushBackHandler } from './backStack.mjs'
import type { ModelProfile, PersonBinding } from './resourceBindings.mjs'
import type { Vendor } from './vendors.mjs'
import { buildModelCatalog, filterCatalog, profileIdForCatalogEntry } from './unifiedModels.mjs'
import { routesForModel, type ModelRoute } from './modelRoutes.mjs'
import {
  addRoute, updateRoute, removeRoute, primaryRoute, setFixedRoute,
  selectLogicalModel, fixedRouteId, type RouteState,
} from './routeState.mjs'
import { ModelRoutesPanel } from './ModelRoutesPanel'

// 统一模型面板：订阅账号模型和 API 模型在这里是同一份目录、同一个选择入口，
// 来源只是行上一枚小标；同一个逻辑模型挂 A/B/C 三条线路也只显示一行。
// 视觉沿用「选择模型 / 账号登录」半屏面板，全部页面内自定义控件，无原生 select。
export type ModelSheetKey = { id: string; vendorName?: string; label?: string; role?: string }

type Props = {
  profiles: ModelProfile[]
  activeId: string
  vendorKeys: ModelSheetKey[]
  binding: PersonBinding
  onPatchBinding: (b: PersonBinding) => void
  onPick: (id: string) => void
  onClose: () => void
  onOpenConfig: () => void
  subscriptionVendorIds?: string[]
  vendors: Vendor[]
  routeState: RouteState
  setRouteState: Dispatch<SetStateAction<RouteState>>
  lastRouteInfo: string
  person: string
}

const FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'subscription', label: '订阅' },
  { id: 'api', label: 'API' },
  { id: 'multi', label: '多线路' },
]

function readFavorites(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem('ai-home.favoriteModels') || '[]')
    return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : []
  } catch { return [] }
}

function vendorInitial(name: string) {
  const s = (name || '').trim()
  if (/gpt|openai|chatgpt/i.test(s)) return 'G'
  if (/claude|anthropic/i.test(s)) return 'C'
  if (/grok|xai|x\.ai/i.test(s)) return 'X'
  if (/gemini|google/i.test(s)) return 'G'
  if (/deepseek/i.test(s)) return 'D'
  return s ? s.slice(0, 1).toUpperCase() : 'AI'
}

export function ModelPickerSheet({
  profiles, activeId, vendorKeys, binding, onPatchBinding, onPick, onClose, onOpenConfig,
  subscriptionVendorIds, vendors, routeState, setRouteState, lastRouteInfo, person,
}: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [keyOpen, setKeyOpen] = useState(false)
  const [routesOpen, setRoutesOpen] = useState('')
  const [favorites, setFavorites] = useState<string[]>(readFavorites)
  const keyRef = useRef<HTMLDivElement>(null)

  useEffect(() => { try { localStorage.setItem('ai-home.favoriteModels', JSON.stringify(favorites)) } catch { /* 私密模式 */ } }, [favorites])
  useEffect(() => pushBackHandler(() => { onClose(); return true }), [onClose])
  useEffect(() => {
    if (!keyOpen) return
    const close = (e: PointerEvent) => { if (!keyRef.current?.contains(e.target as Node)) setKeyOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [keyOpen])
  // 展开线路区时把它滚到可见范围，别让底部「添加线路」被筛选栏压住。
  useEffect(() => {
    if (!routesOpen) return
    const panel = document.querySelector('.model-sheet-row .route-panel')
    panel?.scrollIntoView({ block: 'nearest' })
  }, [routesOpen])

  const catalog = useMemo(() => buildModelCatalog({
    profiles, vendors, routes: routeState.routes,
    subscriptionVendorIds: subscriptionVendorIds || [],
  }), [profiles, vendors, routeState.routes, subscriptionVendorIds])
  const list = useMemo(() => filterCatalog(catalog, { filter, query, favorites }), [catalog, filter, query, favorites])
  const toggleFav = (id: string) => setFavorites(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id])

  const pick = (entryId: string) => {
    const entry = catalog.find(m => m.id === entryId)
    if (!entry) return
    onPatchBinding({ ...binding, modelProfileId: profileIdForCatalogEntry(entry) })
    onPick(profileIdForCatalogEntry(entry))
    setRouteState(s => selectLogicalModel(s, person, entry.id))
    setRoutesOpen('')
  }

  const currentKey = vendorKeys.find(k => k.id === (binding.keyId || ''))
  const keyLabel = currentKey ? `${currentKey.vendorName || ''} · ${currentKey.label || ''}` : '自动 · 先备用再主号'
  const fixed = fixedRouteId(routeState, person)
  const update = (fn: (s: RouteState) => RouteState) => setRouteState(fn)

  return <div className="model-sheet-backdrop" onClick={onClose}>
    <section className="model-sheet" role="dialog" aria-label="选择模型" onClick={e => e.stopPropagation()}>
      <span className="model-sheet-handle" aria-hidden="true"/>
      <div className="model-sheet-head">
        <button type="button" className="model-sheet-close" aria-label="关闭模型面板" onClick={onClose}>×</button>
        <b>选择模型</b>
        <button type="button" className="model-sheet-setup" aria-label="完整绑定设置" title="完整绑定设置" onClick={onOpenConfig}>⚙</button>
      </div>
      {lastRouteInfo && <p className="model-sheet-routeinfo" data-route-info>{lastRouteInfo}</p>}
      <div className="model-sheet-search">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.5 15.5 4.3 4.3"/></g></svg>
        <input id="model-sheet-search-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索模型或服务商" aria-label="搜索模型或服务商"/>
        {query && <button type="button" className="model-sheet-clear" aria-label="清除搜索" onClick={() => setQuery('')}>×</button>}
      </div>
      {vendorKeys.length > 0 && <div className="model-sheet-keyrow">
        <span className="model-sheet-keylabel">密钥</span>
        <div className="model-sheet-keyselect" ref={keyRef}>
          <button type="button" className="model-sheet-keytrigger" aria-expanded={keyOpen} aria-label="选择 API Key" onClick={() => setKeyOpen(v => !v)}>
            <span>{keyLabel}</span><i aria-hidden="true">⌄</i>
          </button>
          {keyOpen && <div className="model-sheet-keymenu" role="listbox" aria-label="选择 API Key">
            <button type="button" role="option" aria-selected={!binding.keyId} className={'model-sheet-keyoption' + (!binding.keyId ? ' active' : '')}
              onClick={() => { onPatchBinding({ ...binding, keyId: '' }); setKeyOpen(false) }}><span>自动 · 先备用再主号</span>{!binding.keyId && <b aria-hidden="true">✓</b>}</button>
            {vendorKeys.map(k => <button type="button" role="option" aria-selected={binding.keyId === k.id} key={k.id}
              className={'model-sheet-keyoption' + (binding.keyId === k.id ? ' active' : '')}
              onClick={() => { onPatchBinding({ ...binding, keyId: k.id }); setKeyOpen(false) }}>
              <span>{k.vendorName} · {k.label}</span>{binding.keyId === k.id && <b aria-hidden="true">✓</b>}
            </button>)}
          </div>}
        </div>
      </div>}
      <div className="model-sheet-list">
        {list.length === 0 && <p className="model-sheet-empty">{catalog.length ? '没有匹配的模型，换个关键词或换个筛选。' : '还没有可用模型。到「设置 → 供应商」填 Key 或登录订阅账号，再回来这里选。'}</p>}
        <section className="model-sheet-group">
          <h4>可用模型 · {list.length}</h4>
          {list.map(m => {
            const selected = m.profileIds.includes(activeId) || (!m.profileIds.length && activeId === '' && routesForModel(routeState.routes, m.id).length > 0)
            const expanded = routesOpen === m.id
            const boundRoutes: ModelRoute[] = routesForModel(routeState.routes, m.id)
            return <div className={'model-sheet-row' + (selected ? ' selected' : '')} key={m.id} data-logical-id={m.id}>
              <button type="button" className="model-sheet-pick" aria-pressed={selected} onClick={() => pick(m.id)}>
                <span className={'model-sheet-avatar' + (m.isSubscription ? ' from-sub' : '')}>{vendorInitial(m.model || m.name)}</span>
                <span className="model-sheet-main"><b>{m.name}</b>{m.name !== m.model && <small>{m.model}</small>}</span>
                {m.isSubscription && <span className="model-sheet-badge">订阅</span>}
                {m.routeCount > 1 && <span className="model-sheet-badge routes">{m.routeCount} 条线路</span>}
                {selected && <span className="model-sheet-check" aria-hidden="true">✓</span>}
              </button>
              <button type="button" className={'model-sheet-route-toggle' + (expanded ? ' active' : '')}
                aria-label={'查看线路 · ' + m.name} title="查看 / 编辑线路" aria-expanded={expanded}
                onClick={() => setRoutesOpen(expanded ? '' : m.id)}>{expanded ? '⌃' : '⌄'}</button>
              <button type="button" className={'model-sheet-fav' + (favorites.includes(m.id) ? ' on' : '')}
                aria-label={favorites.includes(m.id) ? '取消收藏' : '收藏这个模型'} title="收藏后置顶" onClick={() => toggleFav(m.id)}>
                {favorites.includes(m.id) ? '♥' : '♡'}
              </button>
              {expanded && <ModelRoutesPanel
                logicalId={m.id}
                defaultModel={m.model}
                routes={boundRoutes}
                vendors={vendors}
                fixedRouteId={fixed}
                onAdd={(patch) => update(s => addRoute(s, m.id, patch, crypto.randomUUID()))}
                onUpdate={(id, patch) => update(s => updateRoute(s, id, patch))}
                onRemove={(id) => update(s => removeRoute(s, id))}
                onPrimary={(id) => update(s => primaryRoute(s, m.id, id))}
                onFixed={(id) => update(s => setFixedRoute(s, person, id))}
              />}
            </div>
          })}
        </section>
      </div>
      <div className="model-sheet-filter" aria-label="按来源筛选">
        {FILTERS.map(f => <button type="button" key={f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>{f.label}</button>)}
      </div>
    </section>
  </div>
}
