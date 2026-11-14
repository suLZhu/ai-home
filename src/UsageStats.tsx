import { useMemo, useState } from 'react'

// AI 用量统计：按助手切换；同一助手用过多个模型时，每个模型可单独设置
// 「按量（元/千 Token）」或「按次（元/次）」价格。价格只存本机。
const PRICING_KEY = 'ai-home.usagePricing'

type Mode = 'perToken' | 'perCall'
type Price = { mode: Mode; price: string }
type Usage = { at?: string; model?: string; promptTokens?: number; completionTokens?: number }
type Msg = { role?: string; usage?: Usage }
type Conv = { messages?: Msg[] }

function loadPricing(): Record<string, Record<string, Price>> {
  try {
    const raw = localStorage.getItem(PRICING_KEY)
    const v = raw ? JSON.parse(raw) : {}
    if (!v || typeof v !== 'object') return {}
    // 兼容旧结构：{ assistant: { mode, price } } → { assistant: { '*': { mode, price } } }
    const out: Record<string, Record<string, Price>> = {}
    for (const [person, value] of Object.entries<any>(v)) {
      if (value && typeof value === 'object' && typeof value.price === 'string' && typeof value.mode === 'string') {
        out[person] = { '*': { mode: value.mode, price: value.price } }
      } else if (value && typeof value === 'object') {
        out[person] = value
      }
    }
    return out
  } catch { return {} }
}

function savePricing(all: Record<string, Record<string, Price>>) {
  try { localStorage.setItem(PRICING_KEY, JSON.stringify(all)) } catch { /* 隐私模式 */ }
}

function costOf(calls: number, tokens: number, p: Price | undefined) {
  const price = Number(p && p.price)
  if (!p || !Number.isFinite(price) || price <= 0) return 0
  return p.mode === 'perCall' ? calls * price : (tokens / 1000) * price
}

export function UsageStats({ people, conversations, models, displayName }: {
  people: string[]
  conversations: Record<string, Conv[]>
  models: Record<string, string>
  displayName: (p: string) => string
}) {
  const [pricing, setPricing] = useState<Record<string, Record<string, Price>>>(() => loadPricing())
  const [active, setActive] = useState(people[0] || '')

  const perPerson = useMemo(() => {
    const out: Record<string, Array<{ model: string; calls: number; tokens: number; lastAt: string }>> = {}
    for (const p of people) {
      const buckets: Record<string, { calls: number; tokens: number; lastAt: string }> = {}
      for (const c of conversations[p] || []) {
        for (const m of c.messages || []) {
          if (m.role !== 'assistant' || !m.usage) continue
          const name = (m.usage.model || '').trim() || '未标记模型'
          const b = buckets[name] || { calls: 0, tokens: 0, lastAt: '' }
          b.calls++
          b.tokens += (m.usage.promptTokens || 0) + (m.usage.completionTokens || 0)
          if (m.usage.at && m.usage.at > b.lastAt) b.lastAt = m.usage.at
          buckets[name] = b
        }
      }
      const list = Object.entries(buckets).map(([model, b]) => ({ model, ...b }))
      list.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
      out[p] = list
    }
    return out
  }, [people, conversations])

  const priceFor = (person: string, model: string): Price => {
    const map = pricing[person] || {}
    return map[model] || map['*'] || { mode: 'perToken', price: '' }
  }
  const patchPrice = (person: string, model: string, next: Partial<Price>) => {
    const map = { ...(pricing[person] || {}) }
    map[model] = { ...priceFor(person, model), ...next }
    const all = { ...pricing, [person]: map }
    setPricing(all)
    savePricing(all)
  }

  const totals = people.reduce((acc, p) => {
    for (const row of perPerson[p] || []) {
      acc.calls += row.calls
      acc.tokens += row.tokens
      acc.cost += costOf(row.calls, row.tokens, priceFor(p, row.model))
    }
    return acc
  }, { calls: 0, tokens: 0, cost: 0 })

  const rows = perPerson[active] || []
  const latest = rows[0] && rows[0].model !== '未标记模型' ? rows[0].model : (models[active] || '')

  return <div className="usage-stats">
    <div className="usage-summary">
      <div><small>合计花费（估算）</small><b>≈ ¥{totals.cost.toFixed(2)}</b></div>
      <div><small>调用次数</small><b>{totals.calls}</b></div>
      <div><small>Token 总量</small><b>{totals.tokens.toLocaleString()}</b></div>
    </div>

    <div className="usage-people" role="tablist" aria-label="选择助手">
      {people.map((p) => <button type="button" role="tab" key={p} aria-selected={p === active} className={'usage-person' + (p === active ? ' active' : '')} onClick={() => setActive(p)}>{displayName(p)}</button>)}
    </div>

    <div className="usage-model-line"><small>最近使用的模型</small><b>{latest || '（未设置）'}</b></div>

    <div className="usage-model-list">
      {rows.length === 0 && <p className="muted">这个助手还没有带用量记录的消息。</p>}
      {rows.map((row) => {
        const p = priceFor(active, row.model)
        return <div className="usage-model-row" key={row.model}>
          <div className="usage-model-name"><b>{row.model}</b><small>{row.calls} 次 · {row.tokens.toLocaleString()} Token · ≈ ¥{costOf(row.calls, row.tokens, p).toFixed(2)}</small></div>
          <div className="usage-model-price">
            <select aria-label={'计费方式 ' + row.model} value={p.mode} onChange={(e) => patchPrice(active, row.model, { mode: e.target.value as Mode })}>
              <option value="perToken">按量</option>
              <option value="perCall">按次</option>
            </select>
            <input aria-label={'单价 ' + row.model} type="number" min="0" step="0.0001" value={p.price} placeholder={p.mode === 'perToken' ? '元/千Token' : '元/次'} onChange={(e) => patchPrice(active, row.model, { price: e.target.value })}/>
          </div>
        </div>
      })}
    </div>
    <p className="muted">每个模型单独计价：按量按「元 / 千 Token」，按次按每次调用；价格只存本机。</p>
  </div>
}
