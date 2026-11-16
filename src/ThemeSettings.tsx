import { useEffect, useRef, useState } from 'react'
import { DEFAULT_THEME, type ThemePrefs } from './theme'
import { getActivePackId, loadThemePacks, parseThemePack, removeThemePack, setActivePack, upsertThemePack, applyPackVars, type ThemePack } from './themePack.mjs'
import './ThemeSettings.css'

// 主题系统：一套默认外观 + 字体/圆角/字号 + 可导入的「美化包」。
// 美化包一次性替换色调、聊天背景、气泡颜色；之后会扩展图标。
export function ThemeSettings({ value, onChange }: { value: ThemePrefs; onChange: (v: ThemePrefs) => void }) {
  const [packs, setPacks] = useState<ThemePack[]>(() => loadThemePacks())
  const [activeId, setActiveId] = useState<string>(() => getActivePackId())
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (value.theme !== DEFAULT_THEME.theme) onChange({ ...value, theme: DEFAULT_THEME.theme })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const update = (patch: Partial<ThemePrefs>) => onChange({ ...value, ...patch })

  const applyPack = (pack: ThemePack | null) => {
    applyPackVars(pack)
    window.dispatchEvent(new Event('aihome:theme-pack'))
    setActivePack(pack ? pack.id : '')
    setActiveId(pack ? pack.id : '')
    if (pack?.bubble?.style) update({ bubble: pack.bubble.style as ThemePrefs['bubble'] })
    setNotice(pack ? `已应用「${pack.name}」` : '已恢复默认外观')
    window.setTimeout(() => setNotice(''), 1800)
  }

  const importPack = async (file: File | undefined) => {
    if (!file) return
    setError('')
    try {
      const text = await file.text()
      const pack = parseThemePack(text)
      const next = upsertThemePack(pack)
      setPacks(next)
      applyPack(pack)
      setNotice(`已导入并应用「${pack.name}」`)
    } catch (e: any) {
      setError(e?.message || '导入失败，请检查 JSON。')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removePack = (id: string) => {
    const next = removeThemePack(id)
    setPacks(next)
    if (activeId === id) applyPack(null)
  }

  return <section className="theme-settings">
    <h3>主题</h3>
    <p className="muted">默认一套外观；字体、圆角和字号可调。下面可以导入美化包，一次性换掉色调、聊天背景和气泡。</p>

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

    <div className="theme-pack-block">
      <div className="theme-pack-head"><b>美化包</b><small>{packs.length ? `${packs.length} 个已安装` : '还没有安装'}</small></div>
      {packs.length > 0 && <div className="theme-pack-list">
        {packs.map(pack => <div className={'theme-pack-row' + (pack.id === activeId ? ' active' : '')} key={pack.id}>
          <button type="button" className="theme-pack-main" onClick={() => applyPack(pack)} title="应用这个美化包">
            <span className="theme-pack-swatches">{Object.values(pack.tokens).slice(0, 4).map((c, i) => <i key={i} style={{ background: c }}/>)}</span>
            <span className="theme-pack-text"><b>{pack.name}</b><small>{pack.author || '未署名'}{pack.description ? ' · ' + pack.description : ''}</small></span>
            <span className="theme-pack-state">{pack.id === activeId ? '使用中' : '应用'}</span>
          </button>
          <button type="button" className="theme-pack-del" aria-label={'删除 ' + pack.name} onClick={() => removePack(pack.id)}>×</button>
        </div>)}
      </div>}
      <div className="theme-pack-actions">
        <button type="button" className="theme-pack-import" onClick={() => fileRef.current?.click()}>导入 .json 美化包</button>
        {activeId && <button type="button" className="theme-pack-reset" onClick={() => applyPack(null)}>取消美化包</button>}
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => void importPack(e.target.files?.[0])}/>
      </div>
      {error && <p className="theme-pack-error">{error}</p>}
      {notice && <p className="theme-pack-notice">{notice}</p>}
      <p className="muted theme-pack-hint">格式见「设置 → 系统与权限 → 说明」；一个包可含 tokens、background、bubble、font（系统字体或内嵌字体）和 icons（emoji）。</p>
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
