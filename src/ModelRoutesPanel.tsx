import { useState } from 'react'
import { SoftSelect, type SoftOption } from './SoftSelect'
import type { ModelRoute } from './modelRoutes.mjs'
import type { Vendor } from './vendors.mjs'

// 模型面板里的线路编辑区：和「选择模型 / 账号登录」同一套半屏视觉，
// 不新造弹窗。用户在这里看线路、设主线路、手动固定、启用/停用、增删线路。
type Props = {
  logicalId: string
  defaultModel: string
  routes: ModelRoute[]
  vendors: Vendor[]
  fixedRouteId: string
  onAdd: (patch: Partial<ModelRoute>) => void
  onUpdate: (routeId: string, patch: Partial<ModelRoute>) => void
  onRemove: (routeId: string) => void
  onPrimary: (routeId: string) => void
  onFixed: (routeId: string) => void
}

const str = (v: string) => v.trim()

export function ModelRoutesPanel({ logicalId, defaultModel, routes, vendors, fixedRouteId, onAdd, onUpdate, onRemove, onPrimary, onFixed }: Props) {
  const [label, setLabel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState(defaultModel)
  const [keyChoice, setKeyChoice] = useState('__inline__')
  const [inlineKey, setInlineKey] = useState('')
  const [error, setError] = useState('')

  const keyOptions: SoftOption[] = [
    { value: '__inline__', label: '手动填写 API Key' },
    ...(Array.isArray(vendors) ? vendors : []).flatMap(v => (Array.isArray(v.keys) ? v.keys : [])
      .filter(k => k && k.id)
      .map(k => ({ value: k.id, label: (v.name || v.id) + ' · ' + (k.label || 'Key') }))),
  ]

  const submit = () => {
    const url = str(baseUrl)
    const key = keyChoice === '__inline__' ? str(inlineKey) : ''
    if (!url) { setError('请填写线路的 Base URL'); return }
    if (!/^https?:\/\//i.test(url)) { setError('Base URL 需以 http:// 或 https:// 开头'); return }
    if (!key && keyChoice === '__inline__') { setError('请填写 API Key，或改用「引用现有 Key」'); return }
    onAdd({
      label: str(label) || '线路 ' + (routes.length + 1),
      baseUrl: url.replace(/\/+$/, ''),
      model: str(model) || defaultModel || logicalId,
      keyId: keyChoice === '__inline__' ? '' : keyChoice,
      apiKey: key,
      vendorId: keyChoice === '__inline__' ? '' : ((Array.isArray(vendors) ? vendors : []).find(v => (v.keys || []).some(k => k.id === keyChoice))?.id || ''),
      enabled: true,
    })
    setLabel(''); setBaseUrl(''); setInlineKey(''); setError('')
  }

  return <div className="route-panel" id="model-routes-panel" data-logical-id={logicalId}>
    <div className="route-panel-head">
      <b>线路 · {logicalId}</b>
      <small>主线路优先，网络 / 限流故障自动切下一条</small>
    </div>
    <div className="route-list">
      {routes.length === 0 && <p className="route-empty">还没有线路。下面添加一条，或用现有模型预设直接聊天。</p>}
      {routes.map(r => <div className={'route-item' + (r.primary ? ' primary' : '') + (r.enabled ? '' : ' off')} key={r.id} data-route-id={r.id}>
        <div className="route-item-top">
          <span className="route-dot" aria-hidden="true" />
          <b>{r.label}</b>
          {r.primary && <em>主线路</em>}
          {fixedRouteId === r.id && <em className="fixed">已固定</em>}
          {!r.enabled && <em className="muted">已停用</em>}
        </div>
        <small>{r.baseUrl || r.chatUrl || '未填地址'} · {r.model}</small>
        <div className="route-actions">
          <button type="button" onClick={() => onPrimary(r.id)}>设主</button>
          <button type="button" className={fixedRouteId === r.id ? 'active' : ''} onClick={() => onFixed(fixedRouteId === r.id ? '' : r.id)}>
            {fixedRouteId === r.id ? '取消固定' : '固定'}
          </button>
          <button type="button" onClick={() => onUpdate(r.id, { enabled: !r.enabled })}>{r.enabled ? '停用' : '启用'}</button>
          <button type="button" className="route-remove" onClick={() => onRemove(r.id)}>删除</button>
        </div>
      </div>)}
    </div>
    <div className="route-add">
      <b>添加线路</b>
      <div className="route-add-grid">
        <input aria-label="线路名称" value={label} onChange={e => setLabel(e.target.value)} placeholder="线路名称，如 线路 A"/>
        <input aria-label="线路 Base URL" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="Base URL，如 https://api.x.com/v1"/>
        <input aria-label="实际模型 ID" value={model} onChange={e => setModel(e.target.value)} placeholder="实际模型 ID"/>
        <SoftSelect value={keyChoice} options={keyOptions} onChange={setKeyChoice} ariaLabel="选择 API Key 来源"/>
        {keyChoice === '__inline__' && <input aria-label="线路 API Key" type="password" value={inlineKey} onChange={e => setInlineKey(e.target.value)} placeholder="API Key（仅存本机）"/>}
      </div>
      <div className="route-add-foot">
        <small>API Key 只保存在这台设备，不进云端快照、不写入仓库。</small>
        <button type="button" className="route-add-btn" onClick={submit}>＋ 添加线路</button>
      </div>
      {error && <p className="route-error">{error}</p>}
    </div>
  </div>
}
