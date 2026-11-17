import type { CustomAssets, PersonAppearancePref } from './theme'
import './PersonAppearance.css'
import { SoftSelect } from './SoftSelect'

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
      <SoftSelect ariaLabel="聊天背景" value={v.chatBackground} onChange={value => set({ chatBackground: value })} options={[
        { value: 'follow', label: '跟随全局' },
        { value: 'theme', label: '主题背景' },
        { value: 'plain', label: '纯色简洁' },
        { value: 'custom1', label: '自定义背景' + (assets.bg1 ? '（已上传）' : '（未上传）'), disabled: !assets.bg1 },
      ]}/>
    </label>
    <label>聊天气泡
      <SoftSelect ariaLabel="聊天气泡" value={v.bubble} onChange={value => set({ bubble: value })} options={[
        { value: 'follow', label: '跟随全局' },
        { value: 'soft', label: '柔和填充' },
        { value: 'outlined', label: '线框气泡' },
        { value: 'bare', label: '无边框' },
        { value: 'letter', label: '旧信纸' },
        { value: 'frame', label: '复古花框' },
        { value: 'deco', label: '小装饰' },
        { value: 'cute', label: '可爱' },
        { value: 'pixel', label: '彩色像素' },
        { value: 'vintage', label: '古典花框' },
        { value: 'nouveau', label: '新艺术' },
        { value: 'stamp', label: '邮票' },
        { value: 'glass', label: '玻璃' },
        { value: 'comic', label: '漫画' },
        { value: 'note', label: '便签' },
        { value: 'image', label: '自定义气泡图' + (assets.bubble ? '（已上传）' : '（未上传）'), disabled: !assets.bubble },
      ]}/>
    </label>
  </section>
}
