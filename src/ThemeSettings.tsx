import { useState } from 'react'
import { DEFAULT_THEME, THEMES, type ThemePrefs } from './theme'
import './ThemeSettings.css'
type ThemeTab='recommended'|'custom'|'character'|'interface'
export function ThemeSettings({value,onChange}:{value:ThemePrefs;onChange:(v:ThemePrefs)=>void}){
 const [tab,setTab]=useState<ThemeTab>('recommended')
 const update=(patch:Partial<ThemePrefs>)=>onChange({...value,...patch})
 return <section className="theme-settings"><h3>主题设置</h3><p className="muted">先选分类，再调整细节。所有预览会即时应用。</p>
 <div className="theme-setting-tabs" role="tablist">{([{id:'recommended',label:'推荐'},{id:'custom',label:'自定义'},{id:'character',label:'角色'},{id:'interface',label:'界面'}] as {id:ThemeTab;label:string}[]).map(x=><button type="button" role="tab" aria-selected={tab===x.id} className={tab===x.id?'active':''} key={x.id} onClick={()=>setTab(x.id)}>{x.label}</button>)}</div>
 {tab==='recommended'&&<><p className="theme-tab-intro">挑一套适合小家的整体氛围。</p><div className="theme-gallery">{THEMES.map(t=><button type="button" key={t.id} className={'theme-tile '+(value.theme===t.id?'selected':'')} onClick={()=>update({theme:t.id})} aria-pressed={value.theme===t.id}><div className="theme-swatches">{t.swatches.map((c,i)=><span key={i} style={{background:c}}/>)}</div><b>{t.name}</b><small>{t.description}</small></button>)}</div></>}
 {tab==='custom'&&<div className="theme-tab-panel"><label>字体<select value={value.font} onChange={e=>update({font:e.target.value as ThemePrefs['font']})}><option value="serif">书页宋体</option><option value="sans">简洁无衬线</option></select></label><label>全局字号 <strong>{value.scale}%</strong><input type="range" min="85" max="125" step="5" value={value.scale} onChange={e=>update({scale:Number(e.target.value)})}/></label><label>圆角大小 <strong>{value.radius}px</strong><input type="range" min="4" max="28" step="2" value={value.radius} onChange={e=>update({radius:Number(e.target.value)})}/></label></div>}
 {tab==='character'&&<div className="theme-tab-panel"><h4>角色外观</h4><p className="muted">这里以后放每位助手独立的头像、聊天背景和角色主题。当前全局主题不会覆盖两位助手的独立记忆与身份设置。</p><div className="theme-character-note"><span>晏</span><span>言</span><b>角色专属主题 · 待接入</b></div></div>}
 {tab==='interface'&&<div className="theme-tab-panel"><label>聊天背景<select value={value.chatBackground} onChange={e=>update({chatBackground:e.target.value as ThemePrefs['chatBackground']})}><option value="theme">跟随主题</option><option value="plain">纯色简洁</option></select></label><label>聊天气泡<select value={value.bubble} onChange={e=>update({bubble:e.target.value as ThemePrefs['bubble']})}><option value="soft">柔和填充</option><option value="outlined">线框气泡</option></select></label></div>}
 <button type="button" className="theme-reset" onClick={()=>onChange(DEFAULT_THEME)}>恢复默认外观</button><p className="muted">主题配置随小家的云端状态同步。</p></section>
}
