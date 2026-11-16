import { useEffect, useMemo, useState } from 'react'
import { pushBackHandler } from './backStack.mjs'
import { SoftSelect } from './SoftSelect'
import {
  MODEL_TYPES, INPUT_MODALITIES, OUTPUT_MODALITIES, MODEL_ABILITIES,
  REASONING_DIALECTS, PRICING_CURRENCIES,
  normalizeModelSpec, type ModelSpec, type ResolvedModelSpec,
} from './modelSpecs.mjs'
import './ModelSpecSheet.css'

// 单个模型的规格编辑：能力 / 模态 / 上下文 / 价格 / 推理，照 Kelivo 的字段分组，
// 但改成一张可滚动的卡片页，手机上比三段 tab 少点两下。
type Props = {
  vendorName: string
  modelId: string
  spec: ResolvedModelSpec
  onSave: (spec: ModelSpec) => void
  onReset: () => void
  onClose: () => void
}

function toggle<T extends string>(list: T[], id: T): T[] {
  return list.includes(id) ? list.filter(x => x !== id) : [...list, id]
}

export function ModelSpecSheet({ vendorName, modelId, spec, onSave, onReset, onClose }: Props) {
  const [draft, setDraft] = useState<ModelSpec>(() => normalizeModelSpec(spec))
  useEffect(() => pushBackHandler(() => { onClose(); return true }), [onClose])

  const patch = (next: Partial<ModelSpec>) => setDraft(old => ({ ...old, ...next }))
  const patchPricing = (next: Partial<ModelSpec['pricing']>) => setDraft(old => ({ ...old, pricing: { ...old.pricing, ...next } }))
  const patchReasoning = (next: Partial<ModelSpec['reasoning']>) => setDraft(old => ({ ...old, reasoning: { ...old.reasoning, ...next } }))

  const source = spec.customized ? '已自定义' : '按模型名推断'
  const preview = useMemo(() => {
    const bits = []
    if (draft.contextWindow) bits.push(Math.round(draft.contextWindow / 1000) + 'K 上下文')
    if (draft.abilities.includes('reasoning')) bits.push('推理')
    if (draft.abilities.includes('tool')) bits.push('工具')
    if (draft.input.includes('image')) bits.push('视觉')
    return bits.join(' · ') || '未设置能力'
  }, [draft])

  return <div className="modelspec-backdrop" onClick={onClose}>
    <section className="modelspec-sheet" role="dialog" aria-modal="true" aria-label="模型规格" onClick={e => e.stopPropagation()}>
      <span className="modelspec-grip" aria-hidden="true"/>
      <header className="modelspec-head">
        <button type="button" aria-label="关闭模型规格" onClick={onClose}>×</button>
        <b>模型规格</b>
        <small>{source}</small>
      </header>
      <div className="modelspec-body">
        <p className="modelspec-model"><b>{modelId}</b><small>{vendorName} · {preview}</small></p>

        <section className="modelspec-card">
          <h4>基本信息</h4>
          <label className="modelspec-field">显示名称
            <input value={draft.displayName} placeholder={modelId} onChange={e => patch({ displayName: e.target.value })}/>
            <small>只影响界面显示，请求仍用下面的模型 ID。</small>
          </label>
          <label className="modelspec-field">上游模型 ID
            <input value={draft.apiModelId} placeholder={modelId} autoCapitalize="off" spellCheck={false} onChange={e => patch({ apiModelId: e.target.value })}/>
            <small>留空表示直接用「{modelId}」。</small>
          </label>
          <div className="modelspec-field">类型
            <div className="modelspec-seg" role="group" aria-label="模型类型">
              {MODEL_TYPES.map(t => <button type="button" key={t.id} className={draft.type === t.id ? 'active' : ''} onClick={() => patch({ type: t.id })}>{t.label}</button>)}
            </div>
          </div>
        </section>

        <section className="modelspec-card">
          <h4>能力</h4>
          <div className="modelspec-field">输入模态
            <div className="modelspec-chips">
              {INPUT_MODALITIES.map(m => <button type="button" key={m.id} className={draft.input.includes(m.id) ? 'on' : ''} onClick={() => patch({ input: toggle(draft.input, m.id) })}>{m.label}</button>)}
            </div>
          </div>
          <div className="modelspec-field">输出模态
            <div className="modelspec-chips">
              {OUTPUT_MODALITIES.map(m => <button type="button" key={m.id} className={draft.output.includes(m.id) ? 'on' : ''} onClick={() => patch({ output: toggle(draft.output, m.id) })}>{m.label}</button>)}
            </div>
          </div>
          <div className="modelspec-field">支持的能力
            <div className="modelspec-chips">
              {MODEL_ABILITIES.map(a => <button type="button" key={a.id} className={draft.abilities.includes(a.id) ? 'on' : ''} onClick={() => patch({ abilities: toggle(draft.abilities, a.id) })}>{a.label}</button>)}
            </div>
          </div>
        </section>

        <section className="modelspec-card">
          <h4>限制</h4>
          <div className="modelspec-grid">
            <label className="modelspec-field">上下文窗口
              <input type="number" min="0" step="1000" inputMode="numeric" value={draft.contextWindow || ''} placeholder="128000" onChange={e => patch({ contextWindow: Number(e.target.value) || 0 })}/>
            </label>
            <label className="modelspec-field">最大输出
              <input type="number" min="0" step="1000" inputMode="numeric" value={draft.maxOutput || ''} placeholder="8192" onChange={e => patch({ maxOutput: Number(e.target.value) || 0 })}/>
            </label>
          </div>
        </section>

        <section className="modelspec-card">
          <h4>价格 <small>每百万 tokens，只用于估算</small></h4>
          <div className="modelspec-grid">
            <label className="modelspec-field">输入
              <input type="number" min="0" step="any" inputMode="decimal" value={draft.pricing.input || ''} placeholder="0" onChange={e => patchPricing({ input: Number(e.target.value) || 0 })}/>
            </label>
            <label className="modelspec-field">输出
              <input type="number" min="0" step="any" inputMode="decimal" value={draft.pricing.output || ''} placeholder="0" onChange={e => patchPricing({ output: Number(e.target.value) || 0 })}/>
            </label>
            <label className="modelspec-field">缓存读
              <input type="number" min="0" step="any" inputMode="decimal" value={draft.pricing.cacheRead || ''} placeholder="0" onChange={e => patchPricing({ cacheRead: Number(e.target.value) || 0 })}/>
            </label>
            <label className="modelspec-field">缓存写
              <input type="number" min="0" step="any" inputMode="decimal" value={draft.pricing.cacheWrite || ''} placeholder="0" onChange={e => patchPricing({ cacheWrite: Number(e.target.value) || 0 })}/>
            </label>
          </div>
          <div className="modelspec-field">币种
            <div className="modelspec-seg">
              {PRICING_CURRENCIES.map(c => <button type="button" key={c.id} className={draft.pricing.currency === c.id ? 'active' : ''} onClick={() => patchPricing({ currency: c.id })}>{c.id === 'USD' ? '美元' : '人民币'}</button>)}
            </div>
          </div>
        </section>

        <section className="modelspec-card">
          <h4>推理</h4>
          <label className="modelspec-field">方言
            <SoftSelect ariaLabel="推理方言" value={draft.reasoning.dialect} options={REASONING_DIALECTS.map(d => ({ value: d.id, label: d.label }))} onChange={v => patchReasoning({ dialect: v })}/>
            <small>不同服务商的「思考」参数不一样，选错会返回 400。</small>
          </label>
          <label className="modelspec-field modelspec-switch">允许关闭思考
            <input type="checkbox" checked={draft.reasoning.canDisable} onChange={e => patchReasoning({ canDisable: e.target.checked })}/>
          </label>
        </section>
      </div>
      <footer className="modelspec-foot">
        <button type="button" className="modelspec-reset" onClick={onReset}>恢复推断</button>
        <button type="button" className="modelspec-save" onClick={() => onSave(normalizeModelSpec(draft))}>保存</button>
      </footer>
    </section>
  </div>
}
