import { useEffect, useState, type ReactNode } from 'react'
import { pushBackHandler } from './backStack.mjs'
import { SoftSelect } from './SoftSelect'
import {
  MODEL_TYPES, INPUT_MODALITIES, OUTPUT_MODALITIES, MODEL_ABILITIES,
  REASONING_DIALECTS, REASONING_LEVELS, REPLAY_MODES, PRICING_CURRENCIES,
  normalizeModelSpec, type ModelSpec, type ResolvedModelSpec,
} from './modelSpecs.mjs'
import { ModelChips } from './ModelChips'
import './ModelSpecPage.css'

// 「编辑模型」整页：基本设置 / 推理 / 高级设置三段，布局照 Kelivo 的 ModelSpecEditPage。
// 顶上返回、中间 tab、右上 ✓ 保存；没改过的字段标「推断」，改过的标「自定义」。
type Tab = 'basic' | 'reasoning' | 'advanced'

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
  { id: 'reasoning', label: '推理' },
  { id: 'advanced', label: '高级设置' },
]

function toggle<T extends string>(list: T[], id: T): T[] {
  return list.includes(id) ? list.filter(x => x !== id) : [...list, id]
}

function Row({ label, tag, children, hint }: { label: string; tag?: string; children: ReactNode; hint?: string }) {
  return <div className="mep-row">
    <div className="mep-row-head"><span>{label}</span>{tag && <em className="mep-tag">{tag}</em>}</div>
    {children}
    {hint && <small className="mep-hint">{hint}</small>}
  </div>
}

export function ModelSpecPage({ vendorName, modelId, spec, onSave, onReset, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('basic')
  const [draft, setDraft] = useState<ModelSpec>(() => normalizeModelSpec(spec))
  useEffect(() => pushBackHandler(() => { onClose(); return true }), [onClose])

  const patch = (next: Partial<ModelSpec>) => setDraft(old => ({ ...old, ...next }))
  const patchPricing = (next: Partial<ModelSpec['pricing']>) => setDraft(old => ({ ...old, pricing: { ...old.pricing, ...next } }))
  const patchReasoning = (next: Partial<ModelSpec['reasoning']>) => setDraft(old => ({ ...old, reasoning: { ...old.reasoning, ...next } }))
  const patchTools = (next: Partial<ModelSpec['builtinTools']>) => setDraft(old => ({ ...old, builtinTools: { ...old.builtinTools, ...next } }))

  const tag = (field: 'displayName' | 'contextWindow' | 'pricing') => {
    if (!spec.customized) return '推断'
    if (field === 'displayName') return draft.displayName ? '自定义' : '默认'
    return '自定义'
  }

  const pairs = (key: 'headers' | 'body') => draft[key].map((pair, index) => (
    <div className="mep-kv" key={key + index}>
      <input aria-label={key === 'headers' ? 'Header 名称' : 'Body 字段'} value={pair.key} placeholder={key === 'headers' ? 'Header 名称' : '字段名'}
        onChange={e => patch({ [key]: draft[key].map((x, i) => i === index ? { ...x, key: e.target.value } : x) } as Partial<ModelSpec>)}/>
      <input aria-label={key === 'headers' ? 'Header 值' : '字段值'} value={pair.value} placeholder="值"
        onChange={e => patch({ [key]: draft[key].map((x, i) => i === index ? { ...x, value: e.target.value } : x) } as Partial<ModelSpec>)}/>
      <button type="button" aria-label="删除这一行" onClick={() => patch({ [key]: draft[key].filter((_, i) => i !== index) } as Partial<ModelSpec>)}>×</button>
    </div>
  ))

  return <div className="model-edit-page">
    <header className="mep-head">
      <button type="button" className="mep-back" aria-label="返回模型列表" onClick={onClose}>←</button>
      <b>编辑模型</b>
      <button type="button" className="mep-save" aria-label="保存模型设置" onClick={() => onSave(normalizeModelSpec(draft))}>✓</button>
    </header>
    <div className="mep-tabs" role="tablist" aria-label="模型设置分组">
      {TABS.map(t => <button type="button" key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
    </div>
    <div className="mep-body">
      <p className="mep-model"><b>{draft.displayName || modelId}</b><small>{vendorName} · {modelId}</small><ModelChips spec={draft}/></p>

      {tab === 'basic' && <>
        <h3 className="mep-section">基本设置</h3>
        <Row label="模型 ID" tag="默认">
          <input value={modelId} readOnly aria-label="模型 ID"/>
          <small className="mep-hint">请求真正发出去的模型名；要改去「模型」列表重新添加。</small>
        </Row>
        <Row label="模型名称" tag={tag('displayName')}>
          <input value={draft.displayName} placeholder={modelId} onChange={e => patch({ displayName: e.target.value })} aria-label="模型名称"/>
        </Row>
        <Row label="模型类型" tag={spec.customized ? '自定义' : '推断'}>
          <div className="mep-seg">
            {MODEL_TYPES.map(t => <button type="button" key={t.id} className={draft.type === t.id ? 'active' : ''} onClick={() => patch({ type: t.id })}>{t.label}</button>)}
          </div>
        </Row>
        <Row label="输入模态" tag="推断">
          <div className="mep-checks">
            {INPUT_MODALITIES.map(m => <label key={m.id} className="mep-check"><input type="checkbox" checked={draft.input.includes(m.id)} onChange={() => patch({ input: toggle(draft.input, m.id) })}/><span>{m.label}</span></label>)}
          </div>
        </Row>
        <Row label="输出模态" tag="推断">
          <div className="mep-checks">
            {OUTPUT_MODALITIES.map(m => <label key={m.id} className="mep-check"><input type="checkbox" checked={draft.output.includes(m.id)} onChange={() => patch({ output: toggle(draft.output, m.id) })}/><span>{m.label}</span></label>)}
          </div>
        </Row>
        <Row label="能力" tag="推断">
          <div className="mep-checks">
            {MODEL_ABILITIES.map(a => <label key={a.id} className="mep-check"><input type="checkbox" checked={draft.abilities.includes(a.id)} onChange={() => patch({ abilities: toggle(draft.abilities, a.id) })}/><span>{a.label}</span></label>)}
          </div>
        </Row>
        <h3 className="mep-section">限额</h3>
        <Row label="上下文窗口" tag={tag('contextWindow')}>
          <input className="mep-num" type="number" min="0" step="1000" inputMode="numeric" value={draft.contextWindow || ''} placeholder="例如 128000" onChange={e => patch({ contextWindow: Number(e.target.value) || 0 })} aria-label="上下文窗口"/>
        </Row>
        <Row label="最大输出">
          <input className="mep-num" type="number" min="0" step="1000" inputMode="numeric" value={draft.maxOutput || ''} placeholder="例如 8192" onChange={e => patch({ maxOutput: Number(e.target.value) || 0 })} aria-label="最大输出"/>
        </Row>
        <h3 className="mep-section">定价 / 1M</h3>
        <Row label="输入" tag={tag('pricing')}>
          <input className="mep-num" type="number" min="0" step="any" inputMode="decimal" value={draft.pricing.input || ''} placeholder="0" onChange={e => patchPricing({ input: Number(e.target.value) || 0 })} aria-label="输入价格"/>
        </Row>
        <Row label="输出">
          <input className="mep-num" type="number" min="0" step="any" inputMode="decimal" value={draft.pricing.output || ''} placeholder="0" onChange={e => patchPricing({ output: Number(e.target.value) || 0 })} aria-label="输出价格"/>
        </Row>
        <Row label="缓存读取">
          <input className="mep-num" type="number" min="0" step="any" inputMode="decimal" value={draft.pricing.cacheRead || ''} placeholder="0" onChange={e => patchPricing({ cacheRead: Number(e.target.value) || 0 })} aria-label="缓存读取价格"/>
        </Row>
        <Row label="缓存写入">
          <input className="mep-num" type="number" min="0" step="any" inputMode="decimal" value={draft.pricing.cacheWrite || ''} placeholder="0" onChange={e => patchPricing({ cacheWrite: Number(e.target.value) || 0 })} aria-label="缓存写入价格"/>
        </Row>
        <Row label="货币">
          <SoftSelect ariaLabel="定价货币" value={draft.pricing.currency} options={PRICING_CURRENCIES.map(c => ({ value: c.id, label: c.id === 'USD' ? 'USD' : 'CNY' }))} onChange={v => patchPricing({ currency: v as 'USD' | 'CNY' })}/>
        </Row>
      </>}

      {tab === 'reasoning' && <>
        <h3 className="mep-section">推理</h3>
        <Row label="推理方言" tag="推断" hint="不同服务商的思考参数名不一样，选错会返回 400。">
          <SoftSelect ariaLabel="推理方言" value={draft.reasoning.dialect} options={REASONING_DIALECTS.map(d => ({ value: d.id, label: d.label }))} onChange={v => patchReasoning({ dialect: v })}/>
        </Row>
        <Row label="支持的级别" tag="推断">
          <div className="mep-checks">
            {REASONING_LEVELS.map(l => <label key={l.id} className="mep-check"><input type="checkbox" checked={draft.reasoning.levels.includes(l.id)} onChange={() => patchReasoning({ levels: toggle(draft.reasoning.levels, l.id) })}/><span>{l.label}</span></label>)}
          </div>
        </Row>
        <Row label="允许关闭">
          <label className="mep-switch"><input type="checkbox" checked={draft.reasoning.canDisable} onChange={e => patchReasoning({ canDisable: e.target.checked })}/><span>{draft.reasoning.canDisable ? '允许' : '不允许'}</span></label>
        </Row>
        <Row label="默认级别" tag="推断">
          <SoftSelect ariaLabel="默认推理级别" value={draft.reasoning.defaultLevel} options={[{ value: 'auto', label: '自动' }, ...REASONING_LEVELS.map(l => ({ value: l.id, label: l.label }))]} onChange={v => patchReasoning({ defaultLevel: v })}/>
        </Row>
        <h3 className="mep-section">策略</h3>
        <Row label="采样" hint="保留 temperature 等采样字段；关掉则只发推理参数。">
          <label className="mep-switch"><input type="checkbox" checked={draft.reasoning.sampling} onChange={e => patchReasoning({ sampling: e.target.checked })}/><span>{draft.reasoning.sampling ? '始终保留' : '不发送'}</span></label>
        </Row>
        <Row label="推理回放">
          <SoftSelect ariaLabel="推理回放" value={draft.reasoning.replay} options={REPLAY_MODES.map(m => ({ value: m.id, label: m.label }))} onChange={v => patchReasoning({ replay: v as 'all' | 'off' })}/>
        </Row>
        <Row label="回放字段">
          <input value={draft.reasoning.replayField} placeholder="reasoning_content" onChange={e => patchReasoning({ replayField: e.target.value })} aria-label="回放字段"/>
        </Row>
      </>}

      {tab === 'advanced' && <>
        <h3 className="mep-section">请求</h3>
        <Row label="自定义 Headers" tag="默认">
          <div className="mep-kv-list">{pairs('headers')}</div>
          <button type="button" className="mep-add" onClick={() => patch({ headers: [...draft.headers, { key: '', value: '' }] })}>＋ 添加 Header</button>
        </Row>
        <Row label="自定义 Body" tag="默认">
          <div className="mep-kv-list">{pairs('body')}</div>
          <button type="button" className="mep-add" onClick={() => patch({ body: [...draft.body, { key: '', value: '' }] })}>＋ 添加 Body</button>
        </Row>
        <h3 className="mep-section">内置工具</h3>
        <p className="mep-hint">内置工具取决于供应商和 API 模式，需要启用 OpenAI Responses API。</p>
        <Row label="代码解释器">
          <label className="mep-switch"><input type="checkbox" checked={draft.builtinTools.codeInterpreter} onChange={e => patchTools({ codeInterpreter: e.target.checked })}/><span>{draft.builtinTools.codeInterpreter ? '开' : '关'}</span></label>
        </Row>
        <Row label="图像生成">
          <label className="mep-switch"><input type="checkbox" checked={draft.builtinTools.imageGeneration} onChange={e => patchTools({ imageGeneration: e.target.checked })}/><span>{draft.builtinTools.imageGeneration ? '开' : '关'}</span></label>
        </Row>
      </>}
    </div>
    <footer className="mep-foot">
      <button type="button" className="mep-reset" onClick={onReset}>恢复推断</button>
      <button type="button" className="mep-confirm" onClick={() => onSave(normalizeModelSpec(draft))}>保存</button>
    </footer>
  </div>
}
