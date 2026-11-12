export type ThemeId='lavender'|'paper'|'forest'|'night'
export type ThemePrefs={theme:ThemeId;font:'serif'|'sans'|'custom';scale:number;radius:number;chatBackground:'theme'|'plain'|'custom1'|'custom2';chatBgOpacity:number;bubble:'soft'|'outlined'|'image'}
/** 本机自定义素材（字体/背景/气泡图，dataURL）。不进云端快照，只存浏览器。 */
export type CustomAssets={bg1:string;bg2:string;bubble:string;fontName:string;fontData:string}
export const EMPTY_ASSETS:CustomAssets={bg1:'',bg2:'',bubble:'',fontName:'',fontData:''}
/** 每位助手独立的聊天外观覆盖；'follow' 或缺省 = 跟随全局 */
export type PersonAppearancePref={chatBackground:string;bubble:string}
export const DEFAULT_THEME:ThemePrefs={theme:'lavender',font:'serif',scale:100,radius:16,chatBackground:'theme',chatBgOpacity:100,bubble:'soft'}
export const THEMES:{id:ThemeId;name:string;description:string;swatches:string[]}[]=[
 {id:'lavender',name:'薄雾 Mist',description:'奶灰 · 低饱和浅紫',swatches:['#f3f0f4','#ffffff','#8a79aa']},
 {id:'paper',name:'暖米白书页',description:'午后的旧书房',swatches:['#f5f0e6','#eee8dc','#9b7b64']},
 {id:'forest',name:'青绿茶室',description:'安静的山间茶香',swatches:['#eff4ef','#dce9df','#4e7863']},
 {id:'night',name:'深夜星河',description:'柔和的夜色',swatches:['#222735','#333a4e','#a8a3d9']}
]

/**
 * Typography tokens：以 Android Material 3 移动端阅读比例为视觉基准映射到 Web 层。
 * 这里**不**声称 px === sp：Android sp 会跟随系统字体缩放，Web 侧由两层共同承载——
 *  1. 原生 MainActivity 读取系统 fontScale 后设置 WebView.setTextZoom，整页文字等比缩放；
 *  2. App 内「字体大小」设置写成 --font-scale，只缩放这一组语义字号。
 * 在 390dp 视口 / 默认密度下，16sp 正文的视觉尺寸约等于 16px、行高 24px。
 * 组件只引用 --type-*，未来换主题或加字号档位不用逐页改 font-size。
 */
export const TYPOGRAPHY_TOKENS:Record<string,string>={
  '--type-display':'calc(21px * var(--font-scale,1))',   // 页面大标题 20–22sp
  '--type-title':'calc(16px * var(--font-scale,1))',     // 助手名 / 中型标题 16sp
  '--type-body':'calc(16px * var(--font-scale,1))',      // 聊天正文 16sp
  '--type-body-line':'calc(24px * var(--font-scale,1))', // 聊天正文行高 24sp
  '--type-item':'calc(14.5px * var(--font-scale,1))',   // 普通设置项 14–15sp
  '--type-button':'calc(14px * var(--font-scale,1))',   // 普通按钮 14sp
  '--type-caption':'calc(12.5px * var(--font-scale,1))',// 次级信息 12–13sp
  '--type-meta':'calc(11px * var(--font-scale,1))',     // 时间 / token / latency / 状态 11–12sp
}
/** 与颜色无关的形与间距：Tokens → Components → Pages 的中间层。 */
export const SHAPE_TOKENS:Record<string,string>={
  '--radius-sm':'10px','--radius-md':'14px','--radius-lg':'20px','--radius-sheet':'24px','--radius-pill':'999px',
  '--shadow-sm':'0 2px 8px rgba(48,42,58,.06)','--shadow-md':'0 10px 28px rgba(48,42,58,.10)',
  '--space-1':'4px','--space-2':'8px','--space-3':'12px','--space-4':'16px','--space-5':'20px','--space-6':'24px',
}
export function themeStyle(p:ThemePrefs):Record<string,string>{
 // Shared semantic tokens. The three light themes intentionally reuse one purple /
 // green / red family so the sidebar, entertainment room, dashboard and chat never
 // drift into different purples. Night theme keeps the same meanings with lighter ink.
 const lightSemantics:Record<string,string>={
  '--accent-soft':'#ede7f4',
  '--running':'#7a71b5','--running-soft':'#e8e3f6',
  '--ok':'#4f7d62','--ok-soft':'#dcecdf',
  '--danger':'#ac5f68','--danger-soft':'#f4dee1',
  '--shadow-card':'0 5px 18px rgba(64,50,74,.07)',
  '--shadow-lift':'0 10px 28px rgba(64,50,74,.12)',
  // 像素风选框/图标：纯黑白灰，不随主题着色。
  '--pixel-ink':'#2f2c33','--pixel-paper':'#f7f5f2',
  '--pixel-shadow':'rgba(47,44,51,.22)',
 }
 const nightSemantics:Record<string,string>={
  '--accent-soft':'#343049',
  '--running':'#b3aee0','--running-soft':'#3b3763',
  '--ok':'#86bd97','--ok-soft':'#2e4a39',
  '--danger':'#dd9ba1','--danger-soft':'#5c363c',
  '--shadow-card':'0 5px 18px rgba(0,0,0,.28)',
  '--shadow-lift':'0 10px 28px rgba(0,0,0,.4)',
  '--pixel-ink':'#e8e6ee','--pixel-paper':'#262b3a',
  '--pixel-shadow':'rgba(0,0,0,.45)',
 }
 const semantics=p.theme==='night'?nightSemantics:lightSemantics
 // 每套主题都给出完整语义色；新增 Liquid / Soft / Paper / Aurora / OLED 时只需替换这一层。
 const themes:Record<ThemeId,Record<string,string>>={
  // 薄雾 Mist：奶灰页面、白色 surface、低饱和薰衣草强调、极淡灰紫描边。
  lavender:{'--page-bg':'#f3f0f4','--surface':'#ffffff','--surface-elevated':'#ffffff','--card':'#faf8fc','--field':'#f7f4fa','--line':'#e8e2ee','--divider':'#eee9f1','--border-subtle':'#eee9f1','--muted':'#8b8494','--ink':'#302c37','--text-primary':'#302c37','--text-secondary':'#8b8494','--accent':'#8a79aa','--primary':'#8a79aa','--primary-soft':'#ede7f4','--user-bubble':'#e9e1f3','--assistant-bubble':'#f8f6fa','--bubble-user':'#e9e1f3','--bubble-assistant':'#f8f6fa'},
  paper:{'--page-bg':'#ded6c9','--surface':'#f5f0e6','--surface-elevated':'#fffdf9','--card':'#eee8dc','--field':'#faf6ef','--line':'#ddd5c7','--divider':'#e6ded1','--border-subtle':'#e6ded1','--muted':'#81786d','--ink':'#403b35','--text-primary':'#403b35','--text-secondary':'#81786d','--accent':'#9b7b64','--primary':'#9b7b64','--primary-soft':'#ede3d5','--user-bubble':'#e7dfd1','--assistant-bubble':'#f6f1e7','--bubble-user':'#e7dfd1','--bubble-assistant':'#f6f1e7'},
  forest:{'--page-bg':'#dbe5dd','--surface':'#f0f5ef','--surface-elevated':'#ffffff','--card':'#dce9df','--field':'#f9fcf9','--line':'#d3e2d6','--divider':'#e0ebe2','--border-subtle':'#e0ebe2','--muted':'#667a6a','--ink':'#334a3a','--text-primary':'#334a3a','--text-secondary':'#667a6a','--accent':'#4e7863','--primary':'#4e7863','--primary-soft':'#dcecdf','--user-bubble':'#d4e8d9','--assistant-bubble':'#f1f7f2','--bubble-user':'#d4e8d9','--bubble-assistant':'#f1f7f2'},
  night:{'--page-bg':'#171b27','--surface':'#222735','--surface-elevated':'#2b3142','--card':'#333a4e','--field':'#2c3344','--line':'#414a61','--divider':'#3a4358','--border-subtle':'#3a4358','--muted':'#b6b6c9','--ink':'#f0eef7','--text-primary':'#f0eef7','--text-secondary':'#b6b6c9','--accent':'#a8a3d9','--primary':'#a8a3d9','--primary-soft':'#343049','--user-bubble':'#444668','--assistant-bubble':'#2c3344','--bubble-user':'#444668','--bubble-assistant':'#2c3344'}
 }
 return {
  ...themes[p.theme], ...semantics, ...TYPOGRAPHY_TOKENS, ...SHAPE_TOKENS,
  '--font-family':p.font==='custom'?'"CustomUpload","Noto Serif SC","Songti SC",serif':p.font==='serif'?'"Noto Serif SC","Songti SC",serif':'system-ui,"Noto Sans SC",sans-serif',
  '--font-scale':String(p.scale/100),'--radius':p.radius+'px',
 }
}
