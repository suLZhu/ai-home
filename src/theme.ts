export type ThemeId='lavender'|'paper'|'forest'|'night'
export type ThemePrefs={theme:ThemeId;font:'serif'|'sans';scale:number;radius:number;chatBackground:'theme'|'plain';bubble:'soft'|'outlined'}
export const DEFAULT_THEME:ThemePrefs={theme:'lavender',font:'serif',scale:100,radius:16,chatBackground:'theme',bubble:'soft'}
export const THEMES:{id:ThemeId;name:string;description:string;swatches:string[]}[]=[
 {id:'lavender',name:'奶灰浅紫',description:'温柔的默认小家',swatches:['#f2eef4','#e9e1f0','#8871a5']},
 {id:'paper',name:'暖米白书页',description:'午后的旧书房',swatches:['#f5f0e6','#eee8dc','#9b7b64']},
 {id:'forest',name:'青绿茶室',description:'安静的山间茶香',swatches:['#eff4ef','#dce9df','#4e7863']},
 {id:'night',name:'深夜星河',description:'柔和的夜色',swatches:['#222735','#333a4e','#a8a3d9']}
]
export function themeStyle(p:ThemePrefs):Record<string,string>{
 // Shared semantic tokens. The three light themes intentionally reuse one purple /
 // green / red family so the sidebar, entertainment room, dashboard and chat never
 // drift into different purples. Night theme keeps the same meanings with lighter ink.
 const lightSemantics:Record<string,string>={
  '--accent-soft':'#ede6f4',
  '--running':'#7a71b5','--running-soft':'#e8e3f6',
  '--ok':'#4f7d62','--ok-soft':'#dcecdf',
  '--danger':'#ac5f68','--danger-soft':'#f4dee1',
  '--shadow-card':'0 5px 18px rgba(64,50,74,.07)',
  '--shadow-lift':'0 10px 28px rgba(64,50,74,.12)',
  // 像素风选框/图标：纯黑白灰，不随主题着色。
  '--pixel-ink':'#2f2c33','--pixel-paper':'#f7f5f2',
  '--pixel-dither':'rgba(47,44,51,.10)','--pixel-shadow':'rgba(47,44,51,.30)',
 }
 const nightSemantics:Record<string,string>={
  '--accent-soft':'#343049',
  '--running':'#b3aee0','--running-soft':'#3b3763',
  '--ok':'#86bd97','--ok-soft':'#2e4a39',
  '--danger':'#dd9ba1','--danger-soft':'#5c363c',
  '--shadow-card':'0 5px 18px rgba(0,0,0,.28)',
  '--shadow-lift':'0 10px 28px rgba(0,0,0,.4)',
  '--pixel-ink':'#e8e6ee','--pixel-paper':'#262b3a',
  '--pixel-dither':'rgba(232,230,238,.12)','--pixel-shadow':'rgba(0,0,0,.55)',
 }
 const semantics=p.theme==='night'?nightSemantics:lightSemantics
 const themes:Record<ThemeId,Record<string,string>>={
  lavender:{'--page-bg':'#e6e1e9','--surface':'#f5f1f7','--card':'#e9e1f0','--field':'#fcf9fd','--line':'#cbc0d3','--muted':'#7b7183','--ink':'#41384b','--accent':'#8871a5','--user-bubble':'#e4d8ed','--assistant-bubble':'#eee8f3'},
  paper:{'--page-bg':'#ded6c9','--surface':'#f5f0e6','--card':'#eee8dc','--field':'#faf6ef','--line':'#c9c0b4','--muted':'#81786d','--ink':'#403b35','--accent':'#9b7b64','--user-bubble':'#e7dfd1','--assistant-bubble':'#eee6d9'},
  forest:{'--page-bg':'#dbe5dd','--surface':'#f0f5ef','--card':'#dce9df','--field':'#f9fcf9','--line':'#b9cdbd','--muted':'#667a6a','--ink':'#334a3a','--accent':'#4e7863','--user-bubble':'#d4e8d9','--assistant-bubble':'#e4efe6'},
  night:{'--page-bg':'#171b27','--surface':'#222735','--card':'#333a4e','--field':'#2c3344','--line':'#555c73','--muted':'#b6b6c9','--ink':'#f0eef7','--accent':'#a8a3d9','--user-bubble':'#444668','--assistant-bubble':'#363d53'}
 }
 return {...themes[p.theme], ...semantics, '--font-family':p.font==='serif'?'"Noto Serif SC","Songti SC",serif':'system-ui,"Noto Sans SC",sans-serif','--font-scale':String(p.scale/100),'--radius':p.radius+'px'}
}
