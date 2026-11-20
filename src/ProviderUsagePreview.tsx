import { useState } from 'react'
import './ProviderUsagePreview.css'

type Model = { id: string; family: string }
type Provider = { id: string; name: string; url: string; key: string; selected: string[]; available: Model[] }
const sampleModels: Model[] = [
  { id: 'gpt-3.8', family: 'GPT' }, { id: 'gpt-4.1', family: 'GPT' },
  { id: 'claude-sonnet', family: 'Claude' }, { id: 'claude-opus', family: 'Claude' },
  { id: 'grok', family: 'Grok' }, { id: 'gemini-pro', family: 'Gemini' },
]
const initialProviders: Provider[] = [
  { id: 'a', name: '中转站 A', url: 'https://api.example-a.com/v1', key: '', selected: ['gpt-3.8', 'claude-sonnet'], available: sampleModels },
  { id: 'b', name: '中转站 B', url: 'https://api.example-b.com/v1', key: '', selected: ['gpt-3.8'], available: sampleModels },
]
const familyOrder = ['GPT', 'Claude', 'Grok', 'Gemini']
const compact = (n: number) => new Intl.NumberFormat('zh-CN').format(n)

function ModelSelector({ selected, options, onChange, isDemo }: {
  selected: string[]; options: Model[]; onChange: (ids: string[]) => void; isDemo?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [manual, setManual] = useState('')
  const [message, setMessage] = useState('')
  const list = options.filter(x => x.id.toLowerCase().includes(keyword.trim().toLowerCase()))
  const groups = [...new Set([...familyOrder, ...list.map(x => x.family)])].filter(x => list.some(m => m.family === x))
  function add(id: string) {
    const value = id.trim()
    if (!value || selected.includes(value)) return
    onChange([...selected, value]); setManual('')
  }
  return <section className="pup-models">
    <div className="pup-section-label"><b>已选择的模型</b><small>{selected.length} 个</small></div>
    <div className="pup-selected">
      {selected.length ? selected.map(id => <div key={id} className="pup-selected-row"><span className="pup-selected-dot"/> <span>{id}</span><button aria-label={'移除 '+id} title="删除所选模型" onClick={() => onChange(selected.filter(x => x !== id))}>×</button></div>)
        : <p className="pup-empty">还没有选模型，展开下方列表添加。</p>}
    </div>
    <button className="pup-fold-trigger" aria-expanded={open} onClick={() => setOpen(x => !x)}>
      <span>{open ? '▾' : '▸'} {isDemo ? '登录后获取 / 管理模型' : '拉取模型 / 添加更多'}</span><small>{open ? '收起' : '展开'}</small>
    </button>
    {open && <div className="pup-model-panel">
      <div className="pup-actionline">
        <input placeholder="搜索 GPT / Claude / 模型名" value={keyword} onChange={e => setKeyword(e.target.value)}/>
        <button onClick={() => setMessage(isDemo ? '演示模式：正式版登录后从账号读取模型。' : '演示模式：正式版将沿用栖间现有的 /models 拉取功能。')}>↻ 拉取模型</button>
      </div>
      {message && <p className="pup-hint">{message}</p>}
      {groups.map(family => <details key={family} className="pup-family" open={family === 'GPT'}>
        <summary>{family}<small>{list.filter(m => m.family === family).length} 个</small></summary>
        {list.filter(m => m.family === family).map(m => <label className="pup-check-row" key={m.id}>
          <input type="checkbox" checked={selected.includes(m.id)} onChange={e => onChange(e.target.checked ? [...selected, m.id] : selected.filter(x => x !== m.id))}/>
          <span>{m.id}</span>
        </label>)}
      </details>)}
      <div className="pup-actionline"><input placeholder="手动添加模型 ID" value={manual} onChange={e => setManual(e.target.value)}/><button onClick={() => add(manual)}>＋ 添加</button></div>
    </div>}
  </section>
}

export function ProviderPreview() {
  const [providers, setProviders] = useState(initialProviders)
  const [active, setActive] = useState('a')
  const [newOne, setNewOne] = useState(false)
  const [saved, setSaved] = useState(false)
  const current = providers.find(x => x.id === active)
  function patch(patch: Partial<Provider>) {
    setProviders(items => items.map(x => x.id === active ? { ...x, ...patch } : x)); setSaved(false)
  }
  const [confirmDelete, setConfirmDelete] = useState(false)
  function removeCurrent() {
    if (!current) return
    setProviders(items => items.filter(item => item.id !== current.id))
    setActive(providers.find(item => item.id !== current.id)?.id || '')
    setConfirmDelete(false)
    setSaved(false)
  }
  function add() {
    const id = 'new-'+Date.now()
    setProviders(p => [...p, { id, name: '新供应商', url: '', key: '', selected: [], available: sampleModels }])
    setActive(id); setNewOne(false)
  }
  return <div className="pup-wrap">
    <header className="pup-head"><h2>供应商</h2><p>名称、网址、Key、模型。常用配置集中在一页。</p></header>
    <div className="pup-provider-nav">{providers.map(x => <button key={x.id} className={active === x.id ? 'active' : ''} onClick={() => {setActive(x.id);setSaved(false);setConfirmDelete(false)}}>{x.name}</button>)}<button className="pup-add" onClick={() => setNewOne(x => !x)}>＋ 添加</button></div>
    {newOne && <div className="pup-simple-card"><p className="pup-hint">新增一个独立供应商，之后可以填写名称、网址和 Key。</p><button className="pup-main-button" onClick={add}>创建供应商</button></div>}
    {current && <div className="pup-simple-card">
      <label className="pup-field"><span>供应商名称</span><input value={current.name} onChange={e => patch({ name: e.target.value })}/></label>
      <label className="pup-field"><span>接口网址（Base URL）</span><input value={current.url} onChange={e => patch({ url: e.target.value })}/></label>
      <label className="pup-field"><span>API Key</span><input type="password" placeholder="填写后在本机保存" value={current.key} onChange={e => patch({ key: e.target.value })}/></label>
      <ModelSelector key={current.id} selected={current.selected} options={current.available} onChange={selected => patch({ selected })}/>
      <details className="pup-advanced"><summary>高级选项（多 Key / 请求路径 / 接口测试）</summary><p>这部分将复用原版栖间已有功能，先不占用主页面。</p></details>
      <div className="pup-provider-actions"><button className="pup-main-button" onClick={() => setSaved(true)}>{saved ? '✓ 演示配置已保存' : '保存供应商'}</button><button className="pup-delete-button" onClick={() => setConfirmDelete(true)}>删除供应商</button></div>
      {confirmDelete && <div className="qj-dialog-layer" onClick={() => setConfirmDelete(false)}>
        <div className="qj-dialog" role="dialog" aria-modal="true" aria-label="确认删除供应商" onClick={e => e.stopPropagation()}>
          <h3>删除供应商？</h3>
          <p>确定删除「{current.name}」吗？</p>
          <p className="qj-dialog-warning">当前为预览，只会移除页面内的模拟配置，不会修改真实供应商数据。</p>
          <div className="qj-dialog-actions">
            <button className="qj-dialog-cancel" onClick={() => setConfirmDelete(false)}>取消</button>
            <button className="qj-dialog-danger" onClick={removeCurrent}>确认删除</button>
          </div>
        </div>
      </div>}
    </div>}
    <p className="pup-footnote">当前为交互原型，数据只在页面内演示；不向真实接口发送 Key。</p>
  </div>
}

type PreviewChannel = 'gpt' | 'claude' | 'grok'
const subscriptionChannels: Array<{ id: PreviewChannel; name: string; info: string; detail: string; models: Model[] }> = [
  { id: 'gpt', name: 'ChatGPT', info: 'OpenAI · ChatGPT / Codex', detail: '原版已有账号授权入口；实际订阅调用仍需协议适配。', models: [{id:'gpt-4.1',family:'GPT'}] },
  { id: 'claude', name: 'Claude', info: 'Anthropic · Pro / Max', detail: '原版已有 Claude Code 授权流程；可用模型以账号实测为准。', models: [{id:'claude-sonnet',family:'Claude'},{id:'claude-opus',family:'Claude'}] },
  { id: 'grok', name: 'Grok', info: 'xAI · Grok / X', detail: '原版已有设备码登录入口；模型与订阅调用仍待联调。', models: [{id:'grok',family:'Grok'}] },
]

export function SubscriptionPreview() {
  const [selectedChannel, setSelectedChannel] = useState<PreviewChannel>('gpt')
  const [logged, setLogged] = useState<PreviewChannel[]>([])
  const [modelsByChannel, setModelsByChannel] = useState<Record<PreviewChannel,string[]>>({gpt:[],claude:[],grok:[]})
  const [showLogin, setShowLogin] = useState(false)
  const channel = subscriptionChannels.find(x => x.id === selectedChannel)!
  const connected = logged.includes(selectedChannel)
  return <div className="pup-wrap">
    <header className="pup-head"><h2>订阅账号</h2><p>按平台独立管理。登录后再获取模型，不需要填写接口网址。</p></header>
    <div className="pup-channel-list" role="group" aria-label="选择订阅渠道">
      {subscriptionChannels.map(c => <button key={c.id} className={'pup-channel '+(selectedChannel===c.id?'active':'')} onClick={() => { setSelectedChannel(c.id); setShowLogin(false) }} aria-pressed={selectedChannel===c.id}>
        <span><b>{c.name}</b><small>{c.info}</small></span><em>{logged.includes(c.id)?'演示已连接':'未登录'}</em>
      </button>)}
    </div>
    <div className="pup-simple-card">
      <div className="pup-subscription-top"><span className="pup-account-icon">◈</span><div><b>{channel.name} 订阅</b><small>{connected?'模拟账号已连接':'未登录 · 连接后读取可用模型'}</small></div><button className="pup-outline" onClick={() => setShowLogin(x => !x)}>{connected?'管理':'登录'}</button></div>
      {showLogin && <div className="pup-login-info"><b>{channel.name} 登录方式</b><p>{channel.detail} 正式版复用原有授权流程，此处不填写网址和密码。</p><div className="pup-demo-actions"><button className="pup-main-button" onClick={() => {setLogged(old=>old.includes(selectedChannel)?old:[...old,selectedChannel]);setShowLogin(false)}}>模拟连接</button>{connected&&<button className="pup-outline" onClick={() => {setLogged(old=>old.filter(id=>id!==selectedChannel));setShowLogin(false)}}>模拟退出</button>}</div></div>}
      {connected && <ModelSelector selected={modelsByChannel[selectedChannel]} options={channel.models} onChange={models=>setModelsByChannel(old=>({...old,[selectedChannel]:models}))} isDemo/>}
      <div className="pup-sub-usage"><div className="pup-section-label"><b>订阅使用量</b><small>只统计 Token，不计金额</small></div><div className="pup-kpi"><div><span>总 Token</span><b>—</b></div><div><span>已缓存</span><b>—</b></div><div><span>未缓存</span><b>—</b></div></div><p>正式版按实际接口返回统计，不虚构订阅额度和模型。</p></div>
    </div>
    <p className="pup-footnote">目前原版内置的订阅授权渠道为 ChatGPT、Claude、Grok；其他平台如需接入，必须先验证官方授权及聊天协议，不能把 API Key 误当订阅登录。本页均为模拟交互。</p>
  </div>
}

type Charge = { id: string; who: '小晏' | '言朔'; provider: string; model: string; kind: '按次' | '按量' | '订阅'; amount: string; total: number; cached: number }
const initialCharges: Charge[] = [
  {id:'1',who:'小晏',provider:'中转站 A',model:'gpt-3.8',kind:'按次',amount:'0.65',total:24000,cached:14000},
  {id:'2',who:'小晏',provider:'中转站 B',model:'gpt-3.8',kind:'按量',amount:'1.24',total:32000,cached:12000},
  {id:'3',who:'小晏',provider:'订阅通道',model:'claude-sonnet',kind:'订阅',amount:'',total:12000,cached:5000},
  {id:'4',who:'言朔',provider:'中转站 A',model:'grok',kind:'按量',amount:'0.28',total:16000,cached:4000}
]
export function UsageLedgerPreview() {
  const [who, setWho] = useState<'小晏' | '言朔'>('小晏')
  const [charges, setCharges] = useState(initialCharges)
  const rows = charges.filter(x => x.who === who)
  const total = rows.reduce((v,x) => v+x.total,0)
  const cached = rows.reduce((v,x) => v+x.cached,0)
  const cost = rows.filter(x => x.kind !== '订阅').reduce((v,x) => v+(Number(x.amount)||0),0)
  return <div className="pup-wrap">
    <header className="pup-head"><h2>AI 用量账本</h2><p>按助手、供应商和模型分别统计，订阅只算 Token。</p></header>
    <div className="pup-segment">{(['小晏','言朔'] as const).map(p => <button key={p} className={who===p?'active':''} onClick={() => setWho(p)}>{p}</button>)}</div>
    <section className="pup-ledger-summary"><small>{who} · 今日消耗（演示数据）</small><strong>¥ {cost.toFixed(2)}</strong><div className="pup-kpi"><div><span>总 Token</span><b>{compact(total)}</b></div><div><span>已缓存</span><b>{compact(cached)}</b></div><div><span>未缓存</span><b>{compact(total-cached)}</b></div></div></section>
    <div className="pup-section-label"><b>今日使用明细</b><small>相同模型不同网站分开记账</small></div>
    {rows.map(row => <div className="pup-ledger-row" key={row.id}>
      <div className="pup-ledger-title"><div><b>{row.model}</b><small>{row.provider}</small></div><em>{row.kind}</em></div>
      <div className="pup-ledger-metrics"><span>总 {compact(row.total)} · 缓存 {compact(row.cached)}</span>{row.kind==='订阅'?<b>不计费</b>:<label>¥ <input aria-label={row.provider+' '+row.model+' 金额'} type="number" min="0" step="0.01" value={row.amount} onChange={e => setCharges(items => items.map(x => x.id===row.id?{...x,amount:e.target.value}:x))}/></label>}</div>
    </div>)}
    <div className="pup-ledger-info"><b>统计规则</b><p>Token 优先使用模型请求实际返回的数据。中转费用暂由你填写，按次与按量分别记录；订阅不计入费用总额。</p><p>未来接入真实请求时需要记录实际供应商、模型、时间及用量；不凭相同模型名推断来源。</p></div>
    <p className="pup-footnote">所有费用和 Token 均为演示数据，并非真实账号用量。</p>
  </div>
}
