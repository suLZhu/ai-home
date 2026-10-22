import type { CustomAssets, PersonAppearancePref } from './theme'
import './PersonAppearance.css'

// 角色外观：每位助手独立的聊天背景与聊天气泡（与全局外观分开）。
// 两项都选「跟随全局」时清除该助手的覆盖（onChange(null)）。
// 自定义图片在 设置 → 外观与美化 → 界面 里上传，这里只是按助手挑选。
export function PersonAppearance({ value, assets, onChange }: {
  value: PersonAppearancePref | null
  assets: CustomAssets
  onChange: (v: PersonAppearancePref | null) => void
}) {
  const v = value || { chatBackground: 'follow', bubble: 'follow' }
  const set = (patch: Partial<PersonAppearancePref>) => {
    const next = { ...v, ...patch }
    if (next.chatBackground === 'follow' && next.bubble === 'follow') return onChange(null)
    onChange(next)
  }
  return <section className="person-appearance">
    <h3>角色外观</h3>
    <p className="muted">这位助手聊天页的背景与气泡，和全局外观分开设置。选「跟随全局」就用 设置 → 外观与美化 里的样式；自定义图片也在那边的「界面」页上传。</p>
    <label>聊天背景
      <select value={v.chatBackground} onChange={e => set({ chatBackground: e.target.value })}>
        <option value="follow">跟随全局</option>
        <option value="theme">主题背景</option>
        <option value="plain">纯色简洁</option>
        <option value="custom1" disabled={!assets.bg1}>自定义背景{assets.bg1 ? ' ✓' : '（未上传）'}</option>
      </select>
    </label>
    <label>聊天气泡
      <select value={v.bubble} onChange={e => set({ bubble: e.target.value })}>
        <option value="follow">跟随全局</option>
        <option value="soft">柔和填充</option>
        <option value="outlined">线框气泡</option>
        <option value="image" disabled={!assets.bubble}>自定义气泡图{assets.bubble ? ' ✓' : '（未上传）'}</option>
      </select>
    </label>
  </section>
}
