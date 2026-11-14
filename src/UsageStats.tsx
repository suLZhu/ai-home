import { useMemo, useState } from 'react'

// AI 用量统计：按助手横向切换，展示最近模型、价格配置（按量 / 按次）与估算花费。
// 价格只存本机，不进云端快照。
const PRICING_KEY = 'ai-home.usagePricing'

type Pricing = { mode: 'perToken' | 'perCall'; price: string }
type UsageMsg = { role?: string; usage?: { promptTokens?: number; completionTokens?: number } }

function loadPricing(): Record<string, Pricing> {
  try {
    const raw = localStorage.getItem(PRICING_KEY)
    const v = raw ? JSON.parse(raw) : {}
    return v && typeof v === 'object' ? v : {}
  } catch { return {} }
}

function savePricing(all: Record<string, Pricing>) {
  try { localStorage.setItem(PRICING_KEY, JSON.stringify(all)) } catch { /* 隐私模式 */ }
}

function tokensOf(msgs: UsageMsg[]) {
  let calls = 0, tokens = 0
  for (const m of msgs) {
    if (m.role !== 'assistant' || !m.usage) continue
    calls++
    tokens += (m.usage.promptTokens || 0) + (m.usage.completionTokens || 0)
  }
  return { calls, tokens }
}

function costOf(calls: number, tokens: number, p: Pricing) {
  const price = Number(p.price)
  if (!Number.isFinite(price) || price <= 0) return 0
  return p.mode === 'perCall' ? calls * price : (tokens / 1000) * price
}

export function UsageStats({ people, conversations, models, displayName }: {
  people: string[]
  conversations: Record<string, Array<{ messages?: UsageMsg[] }>>
  models: Record<string, string>
  displayName: (p: string) => string
}) {
  const [pricing, setPricing] = useState<Record<string, Pricing>>(() => loadPricing())
  const [active, setActive] = useState(people[0] || '')

  const stats = useMemo(() => {
    const map: Record<string, { calls: number; tokens: number }> = {}
    for (const p of people) {
      const msgs = (conversations[p] || []).flatMap((c) => c.messages || [])
      map[p] = tokensOf(msgs)
    }
    return map
  }, [people, conversations])

  const total = people.reduce((sum, p) => {
    const s = stats[p] || { calls: 0, tokens: 0 }
    return sum + costOf(s.calls, s.tokens, pricing[p] || { mode: 'perToken', price: '' })
  }, 0)

  const current = pricing[active] || { mode: 'perToken', price: '' }
  const cur = stats[active] || { calls: 0, tokens: 0 }
  const patch = (p: Partial<Pricing>) => {
    const next = { ...pricing, [active]: { ...current, ...p } }
    setPricing(next)
    savePricing(next)
  }

  return <div className="usage-stats">
    <div className="usage-summary">
      <div><small>合计花费（估算）</small><b>≈ ¥{total.toFixed(2)}</b></div>
      <div><small>调用次数</small><b>{people.reduce((n, p) => n + (stats[p]?.calls || 0), 0)}</b></div>
      <div><small>Token 总量</small><b>{people.reduce((n, p) => n + (stats[p]?.tokens || 0), 0).toLocaleString()}</b></div>
    </div>

    <div className="usage-people" role="tablist" aria-label="选择助手">
      {people.map((p) => <button type="button" role="tab" key={p} aria-selected={p === active} className={'usage-person' + (p === active ? ' active' : '')} onClick={() => setActive(p)}>{displayName(p)}</button>)}
    </div>

    <div className="usage-detail">
      <div className="usage-model"><small>最近使用的模型</small><b>{models[active] || '（未设置）'}</b></div>
      <div className="usage-numbers">
        <div><small>调用</small><b>{cur.calls} 次</b></div>
        <div><small>Token</small><b>{cur.tokens.toLocaleString()}</b></div>
        <div><small>估算花费</small><b>≈ ¥{costOf(cur.calls, cur.tokens, current).toFixed(2)}</b></div>
      </div>
      <div className="usage-pricing">
        <label>计费方式
          <select value={current.mode} onChange={(e) => patch({ mode: e.target.value as Pricing['mode'] })}>
            <option value="perToken">按量（元 / 千 Token）</option>
            <option value="perCall">按次（元 / 次）</option>
          </select>
        </label>
        <label>单价
          <input type="number" min="0" step="0.0001" value={current.price} placeholder={current.mode === 'perToken' ? '例如 0.008' : '例如 0.02'} onChange={(e) => patch({ price: e.target.value })}/>
        </label>
      </div>
      <p className="muted">价格只存本机；换助手后各自保留。按量按「元 / 千 Token」计，按次按每次调用计。</p>
    </div>
  </div>
}
