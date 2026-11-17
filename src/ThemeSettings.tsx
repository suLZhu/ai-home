import { useEffect, useRef, useState } from 'react'
import { DEFAULT_THEME, type ThemePrefs } from './theme'
import { getActivePackId, loadThemePacks, packFromZip, parseThemePack, removeThemePack, setActivePack, upsertThemePack, applyPackVars, type ThemePack } from './themePack.mjs'
import './ThemeSettings.css'
import { BUILTIN_THEME_PACKS } from './builtinThemePacks.mjs'
import { IconTrash } from './icons'

// 主题系统：像手机主题一样统一整 App 的背景、surface、控件、按钮、线性图标语义色、字体与聊天气泡。
// 功能图标的形状固定为同一套线性 SVG，主题只负责颜色与状态，不再替换成 emoji。
export function ThemeSettings({ value, onChange }: { value: ThemePrefs; onChange: (v: ThemePrefs) => void }) {
  const [packs, setPacks] = useState<ThemePack[]>(() => [...BUILTIN_THEME_PACKS, ...loadThemePacks().filter(p => !BUILTIN_THEME_PACKS.some(b => b.id === p.id))])
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
    setActivePack(pack ? pack.id : '')
    window.dispatchEvent(new Event('aihome:theme-pack'))
    setActiveId(pack ? pack.id : '')
    if (pack?.bubble?.style) update({ bubble: pack.bubble.style as ThemePrefs['bubble'] })
    setNotice(pack ? `已应用「${pack.name}」` : '已恢复默认外观')
    window.setTimeout(() => setNotice(''), 1800)
  }

  const importPack = async (file: File | undefined) => {
    if (!file) return
    setError('')
    try {
      const pack = /\.zip$/i.test(file.name) ? await packFromZip(await file.arrayBuffer()) : parseThemePack(await file.text())
      const next = upsertThemePack(pack)
      setPacks([...BUILTIN_THEME_PACKS, ...next.filter(p => !BUILTIN_THEME_PACKS.some(b => b.id === p.id))])
      applyPack(pack)
      setNotice(`已导入并应用「${pack.name}」`)
    } catch (e: any) {
      setError(e?.message || '导入失败，请检查 JSON。')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removePack = (id: string) => {
    if (BUILTIN_THEME_PACKS.some(p => p.id === id)) return
    const next = removeThemePack(id)
    setPacks([...BUILTIN_THEME_PACKS, ...next.filter(p => !BUILTIN_THEME_PACKS.some(b => b.id === p.id))])
    if (activeId === id) applyPack(null)
  }

  return <section className="theme-settings" aria-label="全局外观设置">
    <div className="theme-tab-panel">
      <label>界面字体
        <select aria-label="界面字体" value={value.font || 'serif'} onChange={e => update({ font: e.target.value as ThemePrefs['font'] })}>
          <option value="serif">书页宋体</option>
          <option value="sans">简洁无衬线</option>
        </select>
      </label>
      <label className="theme-radius-setting">
        <span className="theme-control-title">全局圆角 <strong>{value.radius}px</strong></span>
        <small className="theme-control-hint">调整主要控件的圆角：按钮、输入框、下拉框、聊天气泡和输入栏。头像与分隔线不受影响。</small>
        <div className="theme-radius-preview" aria-label="圆角效果预览">
          <button type="button" className="theme-radius-preview-button" style={{ borderRadius: value.radius + 'px' }} tabIndex={-1}>按钮</button>
          <span className="theme-radius-preview-field" style={{ borderRadius: value.radius + 'px' }}>输入框</span>
          <span className="theme-radius-preview-bubble" style={{ borderRadius: (value.radius + 4) + 'px' }}>消息气泡</span>
        </div>
        <input type="range" min="4" max="24" step="2" value={value.radius} aria-label="全局圆角" onChange={e => update({ radius: Number(e.target.value) })}/>
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
          {!BUILTIN_THEME_PACKS.some(p => p.id === pack.id) && <button type="button" className="theme-pack-del" aria-label={'删除 ' + pack.name} onClick={() => removePack(pack.id)}><IconTrash size={14}/></button>}
        </div>)}
      </div>}
      <div className="theme-pack-actions">
        <button type="button" className="theme-pack-import" onClick={() => fileRef.current?.click()}>导入 .json / .zip 美化包</button>
        {activeId && <button type="button" className="theme-pack-reset" onClick={() => applyPack(null)}>取消美化包</button>}
        <input ref={fileRef} type="file" accept=".json,.zip,application/json,application/zip" hidden onChange={e => void importPack(e.target.files?.[0])}/>
      </div>
      {error && <p className="theme-pack-error">{error}</p>}
      {notice && <p className="theme-pack-notice">{notice}</p>}
      <p className="muted theme-pack-hint">格式见「设置 → 系统与权限 → 说明」；一个包可含全局 tokens、整 App background、bubble 与 font。系统功能图标使用统一的本地图片资源，当前极简白底模式下不随主题变色。</p>
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
