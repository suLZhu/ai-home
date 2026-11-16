import { useState, type ChangeEvent } from 'react'
export type CharacterCard = {
 name:string; avatar:string; description:string; definition:string; greeting:string;
 language:string; tags:string[]; notes:string; temperature:string;
}
export const blankCard = (name:string):CharacterCard => ({
 name,avatar:'',description:'',definition:'',greeting:'',language:'',tags:[],notes:'',temperature:''
})
export function CharacterSettings({value,onSave,hideAvatar}:{value:CharacterCard;onSave:(v:CharacterCard)=>void;hideAvatar?:boolean}){
 const [draft,setDraft]=useState<CharacterCard>(value)
 const [tag,setTag]=useState('')
 const [advanced,setAdvanced]=useState(false)
 const [status,setStatus]=useState('')
 function set(field:keyof CharacterCard, v:string){setDraft(p=>({...p,[field]:v}));setStatus('')}
 function upload(e:ChangeEvent<HTMLInputElement>){
  const f=e.target.files?.[0];if(!f)return
  if(!f.type.startsWith('image/')){setStatus('请选择图片文件');return}
  if(f.size>350*1024){setStatus('头像请使用小于 350KB 的图片（本地存储限制）');return}
  const reader=new FileReader()
  reader.onload=()=>{set('avatar',String(reader.result));setStatus('头像已选择，记得保存')}
  reader.readAsDataURL(f)
 }
 function addTag(){const t=tag.trim();if(t&&!draft.tags.includes(t))setDraft(p=>({...p,tags:[...p.tags,t]}));setTag('')}
 // 助手名字只有一份（显示名 assistants[].name），角色卡表单不再提供第二个改名框，
 // 保存时沿用外部传入的 name，避免界面叫小禾、提示词里还叫旧编号。
 function save(){
  const name = (value.name || draft.name || '助手').trim()
  try{onSave({...draft,name,avatar:hideAvatar?value.avatar:draft.avatar});setStatus('已保存到当前浏览器')}catch{setStatus('保存失败，请检查浏览器存储空间')}
 }
 return <div className="character-editor">
  {!hideAvatar&&<div className="character-head"><div className="character-avatar">{draft.avatar?<img src={draft.avatar} alt="角色头像"/>:<span>{draft.name.slice(0,1)||'角'}</span>}</div><label className="avatar-upload">更换头像<input type="file" accept="image/*" onChange={upload}/></label></div>}
  <label className="character-field">描述<textarea rows={3} value={draft.description} onChange={e=>set('description',e.target.value)} placeholder="简短介绍这个角色……"/></label>
  <label className="character-field">角色设定<textarea rows={6} value={draft.definition} onChange={e=>set('definition',e.target.value)} placeholder="角色身份、性格、关系与行为规则……"/></label>
  <label className="character-field">开场白<textarea rows={3} value={draft.greeting} onChange={e=>set('greeting',e.target.value)} placeholder="角色的开场白或问候语……"/></label>
  <label className="character-field">其他内容（语言）<textarea rows={3} value={draft.language} onChange={e=>set('language',e.target.value)} placeholder="语气、遣词、语言风格等……"/></label>
  <div className="character-field"><b>标签</b><div className="tag-list">{draft.tags.map(t=><button key={t} type="button" onClick={()=>setDraft(p=>({...p,tags:p.tags.filter(x=>x!==t)}))}>{t} ×</button>)}</div><div className="tag-add"><input value={tag} onChange={e=>setTag(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addTag()}}} placeholder="输入标签"/><button type="button" onClick={addTag}>添加</button></div></div>
  <button className="advanced-toggle" type="button" onClick={()=>setAdvanced(!advanced)}>{advanced?'⌃':'⌄'} 高级选项</button>
  {advanced&&<div className="advanced-fields"><label className="character-field">额外备注<textarea rows={3} value={draft.notes} onChange={e=>set('notes',e.target.value)} placeholder="可选备注……"/></label><label className="character-field">温度参数（预留）<input value={draft.temperature} onChange={e=>set('temperature',e.target.value)} /></label><small>高级选项仅保存配置，目前不连接模型。</small></div>}
  <div className="character-actions"><button type="button" onClick={()=>{setDraft({...value,avatar:hideAvatar?value.avatar:draft.avatar});setStatus('已撤销未保存的更改')}}>取消</button><button type="button" onClick={save}>保存</button></div>
  {status&&<p className="character-status" role="status">{status}</p>}
  <small className="character-warning">目前仅保存在此浏览器；尚未同步云端，也未注入 AI。请勿填写 API 密钥。</small>
 </div>
}
