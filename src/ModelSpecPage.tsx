import { useEffect, useState, type ReactNode } from 'react'
import { pushBackHandler } from './backStack.mjs'
import { IconCheck, IconClose, IconPlus, IconTrash } from './icons'
import {
  MODEL_TYPES, INPUT_MODALITIES, OUTPUT_MODALITIES, MODEL_ABILITIES,
  normalizeModelSpec, type ModelSpec, type ResolvedModelSpec,
} from './modelSpecs.mjs'
import { ModelChips } from './ModelChips'
import './ModelSpecPage.css'

type Tab = 'basic' | 'advanced' | 'tools'

type Props = {
  vendorName: string
  modelId: string
  spec: ResolvedModelSpec
  onSave: (spec: ModelSpec) => void
  onReset: () => void
  onClose: () => void
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'basic', label: '基本设置' },
  { id: 'advanced', label: '高级设置' },
  { id: 'tools', label: '内置工具' },
]

const CONTEXT_OPTIONS = [
  { label: '128K', value: 128000 },
  { label: '200K', value: 200000 },
  { label: '1M', value: 1000000 },
]

function toggle<T extends string>(list: T[], id: T): T[] {
  return list.includes(id) ? list.filter(x => x !== id) : [...list, id]
}

function Card({ label, tag, children, hint }: { label?: string; tag?: string; children: ReactNode; hint?: string }) {
  return <section className="mep-card">
    {label && <div className="mep-card-head"><b>{label}</b>{tag && <em>{tag}</em>}</div>}
    {children}
    {hint && <small className="mep-hint">{hint}</small>}
  </section>
}

export function ModelSpecPage({ vendorName, modelId, spec, onSave, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('basic')
  const [draft, setDraft] = useState<ModelSpec>(() => normalizeModelSpec(spec))
  const [customContext, setCustomContext] = useState(false)
  useEffect(() => pushBackHandler(() => { onClose(); return true }), [onClose])

  const patch = (next: Partial<ModelSpec>) => setDraft(old => ({ ...old, ...next }))
  const patchTools = (next: Partial<ModelSpec['builtinTools']>) => setDraft(old => ({ ...old, builtinTools: { ...old.builtinTools, ...next } }))
  const pairs = (key: 'headers' | 'body') => draft[key].map((pair, index) => (
    <div className="mep-kv" key={key + index}>
      <input aria-label={key === 'headers' ? 'Header 名称' : 'Body 字段'} value={pair.key} placeholder={key === 'headers' ? 'Header 名称' : '字段名'}
        onChange={e => patch({ [key]: draft[key].map((x, i) => i === index ? { ...x, key: e.target.value } : x) } as Partial<ModelSpec>)}/>
      <input aria-label={key === 'headers' ? 'Header 值' : '字段值'} value={pair.value} placeholder="值"
        onChange={e => patch({ [key]: draft[key].map((x, i) => i === index ? { ...x, value: e.target.value } : x) } as Partial<ModelSpec>)}/>
      <button type="button" aria-label="删除这一行" onClick={() => patch({ [key]: draft[key].filter((_, i) => i !== index) } as Partial<ModelSpec>)}><IconTrash size={14}/></button>
    </div>
  ))

  return <div className="model-edit-page">
    <header className="mep-head">
      <button type="button" className="mep-close" aria-label="关闭" onClick={onClose}><IconClose size={15}/></button>
      <b>编辑模型</b>
      <button type="button" className="mep-save" aria-label="保存" onClick={() => onSave(normalizeModelSpec(draft))}><IconCheck size={15}/></button>
    </header>

    <div className="mep-tabs" role="tablist" aria-label="模型设置分组">
      {TABS.map(t => <button type="button" key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
    </div>

    <div className="mep-body">
      {tab === 'basic' && <>
        <div className="mep-summary"><b>{draft.displayName || modelId}</b><small>{vendorName} · {modelId}</small><ModelChips spec={draft}/></div>
        <h3 className="mep-section">基本设置</h3>

        <Card label="模型 ID" tag="默认">
          <input value={modelId} readOnly aria-label="模型 ID"/>
          <small className="mep-hint">请求真正发出去的模型名；要改去「模型」列表重新添加。</small>
        </Card>

        <Card label="模型名称" tag="推断">
          <input value={draft.displayName} placeholder={modelId} onChange={e => patch({ displayName: e.target.value })} aria-label="模型名称"/>
        </Card>

        <Card label="模型类型" tag="推断">
          <div className="mep-seg">
            {MODEL_TYPES.map(t => <button type="button" key={t.id} className={draft.type === t.id ? 'active' : ''} onClick={() => patch({ type: t.id })}>{t.label}</button>)}
          </div>
        </Card>

        <Card label="输入模态" tag="推断">
          <div className="mep-seg wrap">
            {INPUT_MODALITIES.map(m => <button type="button" key={m.id} className={draft.input.includes(m.id) ? 'active' : ''} onClick={() => patch({ input: toggle(draft.input, m.id) })}>{draft.input.includes(m.id) ? <IconCheck className="ui-icon-inline" size={12}/> : null}{m.label}</button>)}
          </div>
        </Card>

        <Card label="输出模态" tag="推断">
          <div className="mep-seg wrap">
            {OUTPUT_MODALITIES.map(m => <button type="button" key={m.id} className={draft.output.includes(m.id) ? 'active' : ''} onClick={() => patch({ output: toggle(draft.output, m.id) })}>{draft.output.includes(m.id) ? <IconCheck className="ui-icon-inline" size={12}/> : null}{m.label}</button>)}
          </div>
        </Card>

        <Card label="能力" tag="推断">
          <div className="mep-seg wrap">
            {MODEL_ABILITIES.map(a => <button type="button" key={a.id} className={draft.abilities.includes(a.id) ? 'active' : ''} onClick={() => patch({ abilities: toggle(draft.abilities, a.id) })}>{draft.abilities.includes(a.id) ? <IconCheck className="ui-icon-inline" size={12}/> : null}{a.label}</button>)}
          </div>
        </Card>

        <Card label="上下文长度" tag="推断">
          <div className="mep-seg wrap">
            {CONTEXT_OPTIONS.map(o => <button type="button" key={o.value} className={!customContext && draft.contextWindow === o.value ? 'active' : ''} onClick={() => { setCustomContext(false); patch({ contextWindow: o.value }) }}>{o.label}</button>)}
            <button type="button" className={customContext ? 'active' : ''} onClick={() => setCustomContext(true)}>自定义</button>
          </div>
          {customContext && <input className="mep-num" type="number" min="0" step="1000" inputMode="numeric" value={draft.contextWindow || ''} placeholder="例如 128000" onChange={e => patch({ contextWindow: Number(e.target.value) || 0 })} aria-label="自定义上下文"/>}
        </Card>
      </>}

      {tab === 'advanced' && <>
        <h3 className="mep-section">提供商量写</h3>
        <p className="mep-desc">为此特定模型配置自定义提供商设置。将从父提供商继承通用属性。</p>
        <button type="button" className="mep-wide" onClick={() => patch({ headers: [...draft.headers, { key: 'x-provider-rewrite', value: '' }] })}><IconPlus className="ui-icon-inline" size={14}/> 添加提供商量写</button>

        <div className="mep-plain-row"><span>自定义 Headers</span><button type="button" className="mep-round" aria-label="添加 Header" onClick={() => patch({ headers: [...draft.headers, { key: '', value: '' }] })}><IconPlus size={14}/></button></div>
        <div className="mep-kv-list">{pairs('headers')}</div>

        <div className="mep-plain-row"><span>自定义 Body</span><button type="button" className="mep-round" aria-label="添加 Body" onClick={() => patch({ body: [...draft.body, { key: '', value: '' }] })}><IconPlus size={14}/></button></div>
        <div className="mep-kv-list">{pairs('body')}</div>
      </>}

      {tab === 'tools' && <>
        <h3 className="mep-section">内置工具</h3>
        <p className="mep-desc">选择模型支持的内置工具，这些工具直接由 API 内置，无需 App 提供。</p>
        <div className="mep-tools-list">
          <label className="mep-tool-row"><span><b>搜索</b><small>启用联网搜索集成</small></span><input type="checkbox" checked={!!draft.builtinTools.search} onChange={e => patchTools({ search: e.target.checked })}/></label>
          <label className="mep-tool-row"><span><b>URL 上下文</b><small>启用 URL 内容处理</small></span><input type="checkbox" checked={!!draft.builtinTools.urlContext} onChange={e => patchTools({ urlContext: e.target.checked })}/></label>
          <label className="mep-tool-row"><span><b>图像生成</b><small>启用图像生成功能</small></span><input type="checkbox" checked={!!draft.builtinTools.imageGeneration} onChange={e => patchTools({ imageGeneration: e.target.checked })}/></label>
        </div>
      </>}
    </div>

    <footer className="mep-foot">
      <button type="button" className="mep-cancel" onClick={onClose}>取消</button>
      <button type="button" className="mep-confirm" onClick={() => onSave(normalizeModelSpec(draft))}>确认</button>
    </footer>
  </div>
}
