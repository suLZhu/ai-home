import { useState } from 'react'
export type WorldEntry = { id: string; title: string; keywords: string; content: string; enabled: boolean; always: boolean }
export function WorldbookEditor({entries,onChange}:{entries:WorldEntry[],onChange:(next:WorldEntry[])=>void}){
 const [editing,setEditing]=useState<string|null>(null)
 const [title,setTitle]=useState('')
 const [keywords,setKeywords]=useState('')
 const [content,setContent]=useState('')
 const [always,setAlways]=useState(false)
 const save=()=>{if(!title.trim()||!content.trim())return; const entry:WorldEntry={id:editing||crypto.randomUUID(),title:title.trim(),keywords:keywords.trim(),content:content.trim(),always,enabled:true};onChange(editing?entries.map(e=>e.id===editing?{...entry,enabled:e.enabled}:e):[...entries,entry]);clear()}
 const clear=()=>{setEditing(null);setTitle('');setKeywords('');setContent('');setAlways(false)}
 const edit=(e:WorldEntry)=>{setEditing(e.id);setTitle(e.title);setKeywords(e.keywords);setContent(e.content);setAlways(e.always)}
 return <div className="tool-panel"><h3>世界书</h3><p className="muted">每个人有自己的世界书。关键词用于未来聊天时触发条目；目前只保存和管理，不会注入模型。</p>
 {entries.map(e=><div className="world-entry" key={e.id}><div className="world-heading"><b>{e.title}</b><label><input type="checkbox" checked={e.enabled} onChange={v=>onChange(entries.map(x=>x.id===e.id?{...x,enabled:v.target.checked}:x))}/>启用</label></div><small>{e.always?'常驻条目':('关键词：'+(e.keywords||'未设置'))}</small><p>{e.content}</p><div className="world-actions"><button onClick={()=>edit(e)}>编辑</button><button onClick={()=>{if(window.confirm('删除这条世界书条目？')){onChange(entries.filter(x=>x.id!==e.id));if(editing===e.id)clear()}}}>删除</button></div></div>)}
 <div className="world-editor"><h4>{editing?'编辑条目':'新增条目'}</h4><label>标题<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="例如：白石岬"/></label><label>触发关键词<input value={keywords} onChange={e=>setKeywords(e.target.value)} placeholder="例如：白石岬,家"/></label><label>内容<textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="写下世界设定……"/></label><label className="world-checkbox"><input type="checkbox" checked={always} onChange={e=>setAlways(e.target.checked)}/>常驻条目（未来每轮注入）</label><div className="world-actions"><button onClick={save} disabled={!title.trim()||!content.trim()}>保存条目</button>{editing&&<button onClick={clear}>取消</button>}</div></div><small>仅保存在当前浏览器；清除浏览器数据会丢失，请勿填写秘密或 API 密钥。</small>
 </div>
}
