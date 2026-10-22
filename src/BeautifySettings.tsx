import { BEAUTIFY_PACKS } from './beautify'
import './BeautifySettings.css'

// 美化包选择页：每张卡片自带一个迷你实况预览（套用该包自己的 CSS 类），
// 点击即全局切换。新增美化包只需在 beautify.ts 注册，这里自动多一张卡。
export function BeautifySettings({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return <section className="beautify-settings">
    <h3>美化</h3>
    <p className="muted">挑一套美化包，整站的选框、图标与控件皮肤立即切换。只改样式，不动聊天、记忆与数据；随时可切回普通简介。</p>
    <div className="beautify-grid">
      {BEAUTIFY_PACKS.map(pack => {
        const active = value === pack.id
        return <div key={pack.id} className={'beautify-card' + (active ? ' active' : '')}>
          <div className={'beautify-mini ' + (pack.cssClass || 'beautify-plain')} aria-hidden="true">
            <span className="beautify-mini-icon">▦</span>
            <label className="beautify-mini-check"><input type="checkbox" defaultChecked readOnly/> 已选项</label>
            <label className="beautify-mini-check"><input type="checkbox" readOnly/> 未选项</label>
            <select defaultValue="a" aria-label="示例下拉" tabIndex={-1}>
              <option value="a">示例下拉</option>
              <option value="b">另一项</option>
            </select>
            <span className="beautify-mini-chip active">筛选示例</span>
            <span className="beautify-mini-chip">普通按钮</span>
          </div>
          <div className="beautify-card-meta">
            <b>{pack.name}</b>
            <small>{pack.description}</small>
          </div>
          <button type="button" className="beautify-use" aria-pressed={active} onClick={() => onChange(pack.id)}>
            {active ? '使用中 ✓' : '使用这个'}
          </button>
        </div>
      })}
    </div>
    <p className="muted beautify-note">美化包保存在本机浏览器；后续新增的美化包会自动出现在这里，点一下即可切换。</p>
  </section>
}
