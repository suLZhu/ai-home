import { useEffect } from 'react'
import { DEFAULT_THEME, type ThemePrefs } from './theme'
import './ThemeSettings.css'

// 主题系统暂时收敛成一套最简外观：不再选主题/背景/气泡，只保留字体与字号。
// 之后会重做「全开放主题」，这里先保证全站一致。
export function ThemeSettings({ value, onChange }: { value: ThemePrefs; onChange: (v: ThemePrefs) => void }) {
  useEffect(() => {
    if (value.theme !== DEFAULT_THEME.theme) onChange({ ...value, theme: DEFAULT_THEME.theme })
    // 只在首次挂载时对齐，避免每次改动都触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const update = (patch: Partial<ThemePrefs>) => onChange({ ...value, ...patch })
  return <section className="theme-settings">
    <h3>主题</h3>
    <p className="muted">当前只有一套默认外观；字体、圆角和字号可以调。完整主题系统之后单独做。</p>

    <div className="theme-tab-panel">
      <label>字体
        <select value={value.font || 'serif'} onChange={e => update({ font: e.target.value as ThemePrefs['font'] })}>
          <option value="serif">书页宋体</option>
          <option value="sans">简洁无衬线</option>
        </select>
      </label>
      <label>圆角大小 <strong>{value.radius}px</strong>
        <input type="range" min="4" max="24" step="2" value={value.radius} onChange={e => update({ radius: Number(e.target.value) })}/>
      </label>
    </div>

    <div className="theme-fontctl">
      <div className="theme-fontctl-head"><b>字体大小</b><span>{value.scale}%</span></div>
      <p className="theme-fontctl-hint">默认跟随系统字体和系统字号；觉得字小就把拉条往右拉。</p>
      <div className="theme-fontctl-range">
        <span className="theme-fontctl-a" aria-hidden="true">A</span>
        <input type="range" min="80" max="160" step="5" value={value.scale} aria-label="字体大小" onChange={e => update({ scale: Number(e.target.value) })}/>
        <span className="theme-fontctl-a large" aria-hidden="true">A</span>
      </div>
      <div className="theme-fontctl-foot"><button type="button" onClick={() => update({ scale: 100 })}>跟随系统</button><small>100% = 系统字号</small></div>
    </div>

    <button type="button" className="theme-reset" onClick={() => onChange(DEFAULT_THEME)}>恢复默认外观</button>
  </section>
}
