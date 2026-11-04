import { useState } from 'react'
import { DEFAULT_THEME, THEMES, type ThemePrefs, type CustomAssets } from './theme'
import './ThemeSettings.css'
type ThemeTab='recommended'|'font'|'interface'
const MB=1024*1024
// 素材存 IndexedDB（无 5MB 配额）：只对超大文件做加载性能提醒，不拦不吓。
function warnBig(file:File){ if(file.size>32*MB) alert('这个文件有 '+(file.size/MB).toFixed(1)+' MB，体积很大，保存和加载可能变慢。') }
function readFile(file:File,cb:(data:string)=>void){ const r=new FileReader(); r.onload=()=>cb(String(r.result||'')); r.readAsDataURL(file) }
export function ThemeSettings({value,onChange,assets,onAssetsChange}:{value:ThemePrefs;onChange:(v:ThemePrefs)=>void;assets:CustomAssets;onAssetsChange:(v:CustomAssets)=>void}){
 const [tab,setTab]=useState<ThemeTab>('recommended')
 const update=(patch:Partial<ThemePrefs>)=>onChange({...value,...patch})
 return <section className="theme-settings"><h3>主题设置</h3><p className="muted">先选分类，再调整细节。所有预览会即时应用。</p>
 <div className="theme-setting-tabs" role="tablist">{([{id:'recommended',label:'推荐'},{id:'font',label:'字体'},{id:'interface',label:'界面'}] as {id:ThemeTab;label:string}[]).map(x=><button type="button" role="tab" aria-selected={tab===x.id} className={tab===x.id?'active':''} key={x.id} onClick={()=>setTab(x.id)}>{x.label}</button>)}</div>
 {tab==='recommended'&&<><p className="theme-tab-intro">挑一套适合小家的整体氛围。</p><div className="theme-gallery">{THEMES.map(t=><button type="button" key={t.id} className={'theme-tile '+(value.theme===t.id?'selected':'')} onClick={()=>update({theme:t.id})} aria-pressed={value.theme===t.id}><div className="theme-swatches">{t.swatches.map((c,i)=><span key={i} style={{background:c}}/>)}</div><b>{t.name}</b><small>{t.description}</small></button>)}</div></>}
 {tab==='font'&&<div className="theme-tab-panel">
   <label>字体<select value={value.font||'serif'} onChange={e=>update({font:e.target.value as ThemePrefs['font']})}><option value="serif">书页宋体</option><option value="sans">简洁无衬线</option><option value="custom" disabled={!assets.fontData}>自定义字体{assets.fontName?'（'+assets.fontName+'）':''}</option></select></label>
   <div className="theme-upload-row"><label className="theme-upload">{assets.fontData?'重新上传字体':'上传字体'}<input type="file" accept=".ttf,.otf,.woff,.woff2" onChange={e=>{const f=e.target.files?.[0]; if(!f)return; warnBig(f); readFile(f,d=>onAssetsChange({...assets,fontName:f.name,fontData:d}))}}/></label><small className="theme-upload-note">{assets.fontData?'已上传 '+assets.fontName+'，在上方字体里选「自定义字体」即可使用':'支持 .ttf / .otf / .woff，保存在本机浏览器，大文件也没问题'}</small></div>
   <label>全局字号 <strong>{value.scale}%</strong><input type="range" min="85" max="125" step="5" value={value.scale} onChange={e=>update({scale:Number(e.target.value)})}/></label>
   <label>圆角大小 <strong>{value.radius}px</strong><input type="range" min="4" max="28" step="2" value={value.radius} onChange={e=>update({radius:Number(e.target.value)})}/></label>
 </div>}
 {tab==='interface'&&<div className="theme-tab-panel">
   <label>聊天背景<select value={value.chatBackground||'theme'} onChange={e=>update({chatBackground:e.target.value as ThemePrefs['chatBackground']})}><option value="theme">跟随主题</option><option value="plain">纯色简洁</option><option value="custom1" disabled={!assets.bg1}>自定义背景{assets.bg1?' ✓':'（未上传）'}</option></select></label>
   <div className="theme-upload-row"><label className="theme-upload">{assets.bg1?'重新上传背景':'上传背景'}<input type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0]; if(!f)return; warnBig(f); readFile(f,d=>onAssetsChange({...assets,bg1:d}))}}/></label><small className="theme-upload-note">{assets.bg1?'已上传，上方选「自定义背景」即生效':'上传一张图片作为聊天背景'}</small></div>
   <label>背景透明度 <strong>{value.chatBgOpacity??100}%</strong><input type="range" min="10" max="100" step="5" value={value.chatBgOpacity??100} onChange={e=>update({chatBgOpacity:Number(e.target.value)})}/></label>
   <label>聊天气泡<select value={value.bubble||'soft'} onChange={e=>update({bubble:e.target.value as ThemePrefs['bubble']})}><option value="soft">柔和填充</option><option value="outlined">线框气泡</option><option value="image" disabled={!assets.bubble}>自定义气泡图{assets.bubble?' ✓':'（未上传）'}</option></select></label>
   <div className="theme-upload-row"><label className="theme-upload">上传气泡图<input type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0]; if(!f)return; warnBig(f); readFile(f,d=>onAssetsChange({...assets,bubble:d}))}}/></label><small className="theme-upload-note">{assets.bubble?'已上传，上方气泡选「自定义气泡图」即可使用':'给聊天气泡铺一张底图'}</small></div>
   <p className="muted">想给某位助手单独设置背景和气泡？去 房间 → 工作区 → 角色外观。</p>
 </div>}
 <button type="button" className="theme-reset" onClick={()=>onChange(DEFAULT_THEME)}>恢复默认外观</button><p className="muted">开启像素风美化包时，整站配色会自动转为黑白灰，主题只决定明暗层次。</p><p className="muted">主题配置随小家的云端状态同步；上传的字体与图片只保存在本机浏览器。</p></section>
}
