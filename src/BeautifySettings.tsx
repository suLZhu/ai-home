import { BEAUTIFY_PACKS } from './beautify'
import './BeautifySettings.css'

// 美化设置：每个美化包一行「名称 + 开关」，互斥切换。
// 关掉当前包会自动落到另一个包上（保证始终有一套皮肤在用）。
// 新增美化包只需在 beautify.ts 注册，这里自动多一行。
export function BeautifySettings({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const toggle = (id: string) => {
    if (value === id) {
      // 关掉当前包 → 切到另一个
      const fallback = BEAUTIFY_PACKS.find(p => p.id !== id)
      if (fallback) onChange(fallback.id)
    } else {
      onChange(id)
    }
  }
  return <section className="beautify-settings">
    <h3>全局主题</h3>
    <div className="beautify-list">
      {BEAUTIFY_PACKS.map(pack => {
        const active = value === pack.id
        return <label key={pack.id} className={'beautify-row' + (active ? ' active' : '')}>
          <span className="beautify-row-name">{pack.name}</span>
          <input
            type="checkbox"
            className="beautify-switch"
            checked={active}
            onChange={() => toggle(pack.id)}
            aria-label={pack.name}
          />
        </label>
      })}
    </div>
  </section>
}
