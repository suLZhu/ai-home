import { useState } from 'react'
import { DEFAULT_THEME, THEMES, BUBBLE_STYLES, type ThemePrefs, type CustomAssets } from './theme'
import './ThemeSettings.css'
import { SoftSelect } from './SoftSelect'
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
   <label>字体<SoftSelect ariaLabel="字体" value={value.font||'serif'} onChange={v=>update({font:v as ThemePrefs['font']})} options={[{value:'serif',label:'书页宋体'},{value:'sans',label:'简洁无衬线'},{value:'custom',label:'自定义字体'+(assets.fontName?'（'+assets.fontName+'）':''),disabled:!assets.fontData}]}/></label>
   <div className="theme-upload-row"><label className="theme-upload">{assets.fontData?'重新上传字体':'上传字体'}<input type="file" accept=".ttf,.otf,.woff,.woff2" onChange={e=>{const f=e.target.files?.[0]; if(!f)return; warnBig(f); readFile(f,d=>onAssetsChange({...assets,fontName:f.name,fontData:d}))}}/></label><small className="theme-upload-note">{assets.fontData?'已上传 '+assets.fontName+'，在上方字体里选「自定义字体」即可使用':'支持 .ttf / .otf / .woff，保存在本机浏览器，大文件也没问题'}</small></div>
   <label>圆角大小 <strong>{value.radius}px</strong><input type="range" min="4" max="28" step="2" value={value.radius} onChange={e=>update({radius:Number(e.target.value)})}/></label>
 </div>}
 {tab==='interface'&&<div className="theme-tab-panel">
   <label>聊天背景<SoftSelect ariaLabel="聊天背景" value={value.chatBackground||'theme'} onChange={v=>update({chatBackground:v as ThemePrefs['chatBackground']})} options={[{value:'theme',label:'跟随主题'},{value:'plain',label:'纯色简洁'},{value:'custom1',label:'自定义背景'+(assets.bg1?' ✓':'（未上传）'),disabled:!assets.bg1}]}/></label>
   <div className="theme-upload-row"><label className="theme-upload">{assets.bg1?'重新上传背景':'上传背景'}<input type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0]; if(!f)return; warnBig(f); readFile(f,d=>onAssetsChange({...assets,bg1:d}))}}/></label><small className="theme-upload-note">{assets.bg1?'已上传，上方选「自定义背景」即生效':'上传一张图片作为聊天背景'}</small></div>
   <label>背景透明度 <strong>{value.chatBgOpacity??100}%</strong><input type="range" min="10" max="100" step="5" value={value.chatBgOpacity??100} onChange={e=>update({chatBgOpacity:Number(e.target.value)})}/></label>
   <div className="bubble-style-label">聊天气泡</div>
   <div className="bubble-style-list" role="radiogroup" aria-label="聊天气泡样式">
     {BUBBLE_STYLES.map(style => <button type="button" role="radio" aria-checked={(value.bubble||'soft')===style.id}
       key={style.id} className={'bubble-style-row'+(value.bubble===style.id?' selected':'')}
       disabled={style.id==='image'&&!assets.bubble}
       onClick={()=>update({bubble:style.id as ThemePrefs['bubble']})}>
       <span className="bubble-style-copy"><b>{style.name}</b><small>{style.desc}</small></span>
       <span className={'bubble-style-preview style-'+style.id}>{style.id==='image'&&assets.bubble?<img src={assets.bubble} alt=""/>:'你好呀'}</span>
     </button>)}
   </div>
   <div className="theme-upload-row"><label className="theme-upload">上传气泡图<input type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0]; if(!f)return; warnBig(f); readFile(f,d=>onAssetsChange({...assets,bubble:d}))}}/></label><small className="theme-upload-note">{assets.bubble?'已上传，上方气泡选「自定义气泡图」即可使用':'给聊天气泡铺一张底图'}</small></div>
   <p className="muted">想给某位助手单独设置背景和气泡？去 房间 → 工作区 → 角色外观。</p>
 </div>}
 <div className="theme-fontctl">
   <div className="theme-fontctl-head"><b>字体大小</b><span>{value.scale}%</span></div>
   <p className="theme-fontctl-hint">默认跟随系统字体和系统字号；觉得软件里的字小，就把下面的拉条往右拉，整站文字一起放大。</p>
   <div className="theme-fontctl-range">
     <span className="theme-fontctl-a" aria-hidden="true">A</span>
     <input type="range" min="80" max="160" step="5" value={value.scale} aria-label="字体大小" onChange={e=>update({scale:Number(e.target.value)})}/>
     <span className="theme-fontctl-a large" aria-hidden="true">A</span>
   </div>
   <div className="theme-fontctl-foot"><button type="button" onClick={()=>update({scale:100})}>跟随系统</button><small>100% = 系统字号</small></div>
 </div>
 <button type="button" className="theme-reset" onClick={()=>onChange(DEFAULT_THEME)}>恢复默认外观</button><p className="muted">开启像素风美化包时，整站配色会自动转为黑白灰，主题只决定明暗层次。</p></section>
}
