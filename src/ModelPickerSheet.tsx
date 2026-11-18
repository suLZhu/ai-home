import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { pushBackHandler } from './backStack.mjs'
import type { ModelProfile, PersonBinding } from './resourceBindings.mjs'
import type { Vendor } from './vendors.mjs'
import { buildModelCatalog, filterCatalog, profileIdForCatalogEntry } from './unifiedModels.mjs'
import { routesForModel } from './modelRoutes.mjs'
import {
  addRoute, updateRoute, removeRoute, primaryRoute, setFixedRoute,
  selectLogicalModel, fixedRouteId, type RouteState,
} from './routeState.mjs'
import { ModelRoutesPanel } from './ModelRoutesPanel'
import { IconCheck, IconChevronDown, IconChevronUp, IconClose, IconSearch, IconSettings, IconStar } from './icons'

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


export function ModelPickerSheet({
  profiles, activeId, vendorKeys, binding, onPatchBinding, onPick, onClose,
  subscriptionVendorIds, vendors, routeState, setRouteState, lastRouteInfo, person,
}: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [keyOpen, setKeyOpen] = useState(false)
  const [routesOpen, setRoutesOpen] = useState('')
  const [collapsedVendors, setCollapsedVendors] = useState<string[]>([])
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

  const currentKey = vendorKeys.find(k => k.id === (binding.keyId || ''))
  const keyLabel = currentKey ? `${currentKey.vendorName || ''} · ${currentKey.label || ''}` : '自动 · 先备用再主号'
  const fixed = fixedRouteId(routeState, person)
  const update = (fn: (s: RouteState) => RouteState) => setRouteState(fn)

  return <div className="model-sheet-backdrop" onClick={onClose}>
    <section className="model-sheet" role="dialog" aria-label="选择模型" onClick={e => e.stopPropagation()}>
      <span className="model-sheet-handle" aria-hidden="true"/>
      <div className="model-sheet-head">
        <button type="button" className="model-sheet-close" aria-label="关闭模型面板" onClick={onClose}><IconClose size={16}/></button>
        <b>选择模型</b>
        <span aria-hidden="true"/>
      </div>
      {lastRouteInfo && <p className="model-sheet-routeinfo" data-route-info>{lastRouteInfo}</p>}
      <div className="model-sheet-search">
        <IconSearch size={16}/>
        <input id="model-sheet-search-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索模型或服务商" aria-label="搜索模型或服务商"/>
        {query && <button type="button" className="model-sheet-clear" aria-label="清除搜索" onClick={() => setQuery('')}><IconClose size={14}/></button>}
      </div>
      {vendorKeys.length > 0 && <div className="model-sheet-keyrow">
        <span className="model-sheet-keylabel">密钥</span>
        <div className="model-sheet-keyselect" ref={keyRef}>
          <button type="button" className="model-sheet-keytrigger" aria-expanded={keyOpen} aria-label="选择 API Key" onClick={() => setKeyOpen(v => !v)}>
            <span>{keyLabel}</span><i aria-hidden="true"><IconChevronDown size={13}/></i>
          </button>
          {keyOpen && <div className="model-sheet-keymenu" role="listbox" aria-label="选择 API Key">
            <button type="button" role="option" aria-selected={!binding.keyId} className={'model-sheet-keyoption' + (!binding.keyId ? ' active' : '')}
              onClick={() => { onPatchBinding({ ...binding, keyId: '' }); setKeyOpen(false) }}><span>自动 · 先备用再主号</span>{!binding.keyId && <b aria-hidden="true"><IconCheck size={13}/></b>}</button>
            {vendorKeys.map(k => <button type="button" role="option" aria-selected={binding.keyId === k.id} key={k.id}
              className={'model-sheet-keyoption' + (binding.keyId === k.id ? ' active' : '')}
              onClick={() => { onPatchBinding({ ...binding, keyId: k.id }); setKeyOpen(false) }}>
              <span>{k.vendorName} · {k.label}</span>{binding.keyId === k.id && <b aria-hidden="true"><IconCheck size={13}/></b>}
            </button>)}
          </div>}
        </div>
      </div>}
      <div className="model-sheet-list">
        {list.length === 0 && <p className="model-sheet-empty">{catalog.length ? '没有匹配的模型，换个关键词或换个筛选。' : '还没有可用模型。到「设置 → 供应商」添加模型后再回来选择。'}</p>}
        {(() => {
          const vendorMap = new Map(vendors.map(v => [v.id, v.name || v.id]))
          type Choice = { id: string; logicalId: string; name: string; model: string; vendorId: string; vendorName: string; profileId: string; routeId: string; subscription: boolean }
          const choices: Choice[] = []
          const seen = new Set<string>()
          for (const m of list) {
            const explicit = routesForModel(routeState.routes, m.id)
            if (explicit.length) {
              for (const route of explicit) {
                if (!route.enabled) continue
                const vendorId = route.vendorId || 'route:' + route.id
                const vendorName = vendorMap.get(route.vendorId) || route.label || '独立线路'
                const id = 'route:' + route.id
                if (seen.has(id)) continue
                seen.add(id)
                choices.push({id,logicalId:m.id,name:route.model || m.name,model:route.model || m.model,vendorId,vendorName,profileId:m.profileIds.find((id:string)=>profiles.some(p=>p.id===id&&p.vendorId===route.vendorId)) || profileIdForCatalogEntry(m),routeId:route.id,subscription:route.source==='subscription'})
              }
            } else {
              for (const profileId of m.profileIds) {
                const profile = profiles.find(p=>p.id===profileId)
                if (!profile) continue
                const vendorId = profile.vendorId || 'profile:' + profile.id
                const vendorName = vendorMap.get(profile.vendorId || '') || profile.vendor || '未命名来源'
                const id = 'profile:' + profile.id
                if (seen.has(id)) continue
                seen.add(id)
                choices.push({id,logicalId:m.id,name:profile.name || profile.model,model:profile.model,vendorId,vendorName,profileId:profile.id,routeId:'',subscription:(subscriptionVendorIds||[]).includes(profile.vendorId || '')})
              }
            }
          }
          const renderRow=(choice:Choice)=>{
            const selected=choice.routeId?fixed===choice.routeId:activeId===choice.profileId&&!fixed
            return <div className={'model-sheet-row'+(selected?' selected':'')} key={choice.id}>
              <button type="button" className="model-sheet-pick" aria-pressed={selected} onClick={()=>{
                onPatchBinding({...binding,modelProfileId:choice.profileId})
                onPick(choice.profileId)
                setRouteState(s=>{
                  const next=selectLogicalModel(s,person,choice.logicalId)
                  return setFixedRoute(next,person,choice.routeId)
                })
              }}>
                <span className="model-sheet-main"><b>{choice.name}</b></span>
                {choice.subscription&&<span className="model-sheet-badge">订阅</span>}
                {selected&&<span className="model-sheet-check"><IconCheck size={13}/></span>}
              </button>
              {choice.routeId&&<button type="button" className="model-sheet-route-toggle" aria-label={'编辑线路 · '+choice.vendorName} onClick={()=>setRoutesOpen(routesOpen===choice.routeId?'':choice.routeId)}><IconSettings size={15}/></button>}
              <button type="button" className={'model-sheet-fav'+(favorites.includes(choice.logicalId)?' on':'')} onClick={()=>toggleFav(choice.logicalId)} aria-label="收藏模型"><IconStar size={15}/></button>
              {choice.routeId&&routesOpen===choice.routeId&&<ModelRoutesPanel logicalId={choice.logicalId} defaultModel={choice.model} routes={routesForModel(routeState.routes,choice.logicalId)} vendors={vendors} fixedRouteId={fixed} onAdd={patch=>update(s=>addRoute(s,choice.logicalId,patch,crypto.randomUUID()))} onUpdate={(id,patch)=>update(s=>updateRoute(s,id,patch))} onRemove={id=>update(s=>removeRoute(s,id))} onPrimary={id=>update(s=>primaryRoute(s,choice.logicalId,id))} onFixed={id=>update(s=>setFixedRoute(s,person,id))}/>}
            </div>
          }
          const favItems=choices.filter(c=>favorites.includes(c.logicalId))
          const groups=new Map<string,{name:string;items:Choice[]}>()
          for(const choice of choices){
            if(favorites.includes(choice.logicalId)) continue
            const group=groups.get(choice.vendorId)||{name:choice.vendorName,items:[]}
            group.items.push(choice);groups.set(choice.vendorId,group)
          }
          return <>
            {favItems.length>0&&<section className="model-sheet-group model-sheet-favgroup">
              <div className="model-vendor-heading static"><b>收藏</b><small>{favItems.length} 个模型</small><span aria-hidden="true"><IconStar size={14}/></span></div>
              {favItems.map(renderRow)}
            </section>}
            {[...groups.entries()].map(([vendorId,group])=><section className="model-sheet-group" key={vendorId}>
              <button type="button" className="model-vendor-heading" aria-expanded={!collapsedVendors.includes(vendorId)} onClick={()=>setCollapsedVendors(old=>old.includes(vendorId)?old.filter(id=>id!==vendorId):[...old,vendorId])}>
                <b>{group.name}</b><small>{group.items.length} 个模型</small><span>{collapsedVendors.includes(vendorId)?<IconChevronDown size={13}/>:<IconChevronUp size={13}/>}</span>
              </button>
              {!collapsedVendors.includes(vendorId)&&group.items.map(renderRow)}
            </section>)}
          </>
        })()}
      </div>
      <div className="model-sheet-filter" aria-label="按来源筛选">
        {FILTERS.map(f => <button type="button" key={f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>{f.label}</button>)}
      </div>
    </section>
  </div>
}
