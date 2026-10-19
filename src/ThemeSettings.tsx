import { DEFAULT_THEME, THEMES, type ThemePrefs } from './theme'
import './ThemeSettings.css'
export function ThemeSettings({value,onChange}:{value:ThemePrefs;onChange:(v:ThemePrefs)=>void}){
 const update=(patch:Partial<ThemePrefs>)=>onChange({...value,...patch})
 return <section className="theme-settings"><h3>全局 UI 主题包</h3><p className="muted">选择一套主题，所有房间一起换装。下面的局部选项可以独立微调。</p>
 <div className="theme-gallery">{THEMES.map(t=><button type="button" key={t.id} className={'theme-tile '+(value.theme===t.id?'selected':'')} onClick={()=>update({theme:t.id})} aria-pressed={value.theme===t.id}><div className="theme-swatches">{t.swatches.map((c,i)=><span key={i} style={{background:c}}/>)}</div><b>{t.name}</b><small>{t.description}</small></button>)}</div>
 <h3>局部自定义</h3>
 <label>字体<select value={value.font} onChange={e=>update({font:e.target.value as ThemePrefs['font']})}><option value="serif">书页宋体</option><option value="sans">简洁无衬线</option></select></label>
 <label>全局字号 <strong>{value.scale}%</strong><input type="range" min="85" max="125" step="5" value={value.scale} onChange={e=>update({scale:Number(e.target.value)})}/></label>
 <label>圆角 <strong>{value.radius}px</strong><input type="range" min="4" max="28" step="2" value={value.radius} onChange={e=>update({radius:Number(e.target.value)})}/></label>
 <label>聊天背景<select value={value.chatBackground} onChange={e=>update({chatBackground:e.target.value as ThemePrefs['chatBackground']})}><option value="theme">跟随主题</option><option value="plain">纯色简洁</option></select></label>
 <label>聊天气泡<select value={value.bubble} onChange={e=>update({bubble:e.target.value as ThemePrefs['bubble']})}><option value="soft">柔和填充</option><option value="outlined">线框气泡</option></select></label>
 <button type="button" className="theme-reset" onClick={()=>onChange(DEFAULT_THEME)}>恢复默认外观</button>
 <p className="muted">主题配置随新房子的云端状态同步。后续可增加主题包导入与导出。</p></section>
}
