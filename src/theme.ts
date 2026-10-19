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
 const themes:Record<ThemeId,Record<string,string>>={
 lavender:{'--page-bg':'#e6e1e9','--surface':'#f5f1f7','--card':'#e9e1f0','--field':'#fcf9fd','--line':'#cbc0d3','--muted':'#7b7183','--ink':'#41384b','--accent':'#8871a5','--user-bubble':'#e4d8ed','--assistant-bubble':'#eee8f3'},
 paper:{'--page-bg':'#ded6c9','--surface':'#f5f0e6','--card':'#eee8dc','--field':'#faf6ef','--line':'#c9c0b4','--muted':'#81786d','--ink':'#403b35','--accent':'#9b7b64','--user-bubble':'#e7dfd1','--assistant-bubble':'#eee6d9'},
 forest:{'--page-bg':'#dbe5dd','--surface':'#f0f5ef','--card':'#dce9df','--field':'#f9fcf9','--line':'#b9cdbd','--muted':'#667a6a','--ink':'#334a3a','--accent':'#4e7863','--user-bubble':'#d4e8d9','--assistant-bubble':'#e4efe6'},
 night:{'--page-bg':'#171b27','--surface':'#222735','--card':'#333a4e','--field':'#2c3344','--line':'#555c73','--muted':'#b6b6c9','--ink':'#f0eef7','--accent':'#a8a3d9','--user-bubble':'#444668','--assistant-bubble':'#363d53'}
 }
 return {...themes[p.theme], '--font-family':p.font==='serif'?'"Noto Serif SC","Songti SC",serif':'system-ui,"Noto Sans SC",sans-serif','--font-scale':String(p.scale/100),'--radius':p.radius+'px'}
}
