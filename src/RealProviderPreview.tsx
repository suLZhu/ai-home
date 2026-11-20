import { useMemo, useState } from 'react'
import { apiFetch } from './apiBase.mjs'
import { blankVendor, groupModels, modelListUrl, normalizeVendors, syncVendorProfiles, type Vendor, type VendorModel } from './vendors.mjs'
import './ProviderUsagePreview.css'

const VENDORS_KEY='ai-home.vendors'
const MODEL_PROFILES_KEY='ai-home.modelProfiles'

function readJson(key:string,fallback:any){
  try{return JSON.parse(localStorage.getItem(key)||'')}catch{return fallback}
}
function keyOf(v:Vendor){return v.keys?.[0]?.value||''}
function withKey(v:Vendor,value:string):Vendor{
  const keys=[...(v.keys||[])]
  if(keys.length)keys[0]={...keys[0],value}
  else keys.push({id:'key-'+Math.random().toString(36).slice(2,10),label:'主号',value,role:'primary'})
  return {...v,keys}
}

export function RealProviderPreview(){
  const [vendors,setVendors]=useState<Vendor[]>(()=>normalizeVendors(readJson(VENDORS_KEY,null)))
  const [active,setActive]=useState(()=>vendors.find(v=>!v.hidden)?.id||vendors[0]?.id||'')
  const [message,setMessage]=useState('')
  const [busy,setBusy]=useState(false)
  const current=vendors.find(v=>v.id===active)||null
  const visible=vendors.filter(v=>!v.hidden)

  function patch(next:Partial<Vendor>){
    if(!current)return
    setVendors(old=>old.map(v=>v.id===current.id?{...v,...next}:v))
    setMessage('')
  }
  function save(next=vendors){
    try{
      localStorage.setItem(VENDORS_KEY,JSON.stringify(next))
      const profiles=syncVendorProfiles(next,readJson(MODEL_PROFILES_KEY,[]))
      localStorage.setItem(MODEL_PROFILES_KEY,JSON.stringify(profiles))
      setMessage('已保存，并同步到聊天模型池。')
    }catch{
      setMessage('保存失败：当前环境无法写入本机配置。')
    }
  }
  function add(){
    const v=blankVendor('新供应商','')
    const next=[...vendors,v]
    setVendors(next);setActive(v.id);setMessage('')
  }
  function remove(){
    if(!current)return
    let next:Vendor[]
    if(current.builtin){
      next=vendors.map(v=>v.id===current.id?{...v,hidden:true,enabled:false}:v)
    }else{
      next=vendors.filter(v=>v.id!==current.id)
    }
    setVendors(next)
    setActive(next.find(v=>!v.hidden)?.id||'')
    save(next)
  }
  function toggleModel(id:string,checked:boolean){
    if(!current)return
    const models=(current.models||[]).map(m=>m.id===id?{...m,selected:checked}:m)
    patch({models})
  }
  function addManual(id:string){
    if(!current)return
    const value=id.trim();if(!value)return
    const exists=(current.models||[]).some(m=>m.id===value)
    const models=exists?(current.models||[]).map(m=>m.id===value?{...m,selected:true}:m):[...(current.models||[]),{id:value,name:value,selected:true,source:'manual'}]
    patch({models})
  }
  async function fetchModels(){
    if(!current)return
    const apiKey=keyOf(current).trim()
    if(!current.endpoint.trim()){setMessage('先填写接口网址。');return}
    if(!apiKey){setMessage('先填写 API Key。');return}
    setBusy(true);setMessage('')
    try{
      const response=await apiFetch('/api/models',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        endpoint:current.endpoint,apiKey,modelsUrl:modelListUrl(current)
      })})
      const data=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(data?.error||('HTTP '+response.status))
      const ids=Array.isArray(data?.models)?data.models.map((x:any)=>String(x)).filter(Boolean):[]
      if(!ids.length){setMessage('接口正常，但没有返回模型列表。');return}
      const old=new Map((current.models||[]).map(m=>[m.id,m]))
      const models: VendorModel[]=ids.map((id:string)=>old.get(id)||{id,name:id,selected:false,source:'remote'})
      for(const m of current.models||[])if(!models.some((x:VendorModel)=>x.id===m.id)&&m.selected)models.push(m)
      patch({models});setMessage('已获取 '+ids.length+' 个模型。')
    }catch(e){setMessage(e instanceof Error?e.message:'获取模型失败。')}
    finally{setBusy(false)}
  }

  const groups=useMemo(()=>current?groupModels((current.models||[]).map(m=>m.id)):[],[current])
  const selected=new Set((current?.models||[]).filter(m=>m.selected).map(m=>m.id))
  const [manual,setManual]=useState('')

  return <div className="pup-wrap">
    <header className="pup-head"><h2>供应商</h2><p>这里已经读写栖间真实供应商配置；保存后同步到聊天模型池。</p></header>
    <div className="pup-provider-nav">
      {visible.map(v=><button key={v.id} className={v.id===active?'active':''} onClick={()=>{setActive(v.id);setMessage('')}}>{v.name}</button>)}
      <button className="pup-add" onClick={add}>＋ 添加</button>
    </div>
    {current&&<div className="pup-simple-card">
      <label className="pup-field"><span>供应商名称</span><input value={current.name} onChange={e=>patch({name:e.target.value})}/></label>
      <label className="pup-field"><span>接口网址（Base URL）</span><input value={current.endpoint} onChange={e=>patch({endpoint:e.target.value})}/></label>
      <label className="pup-field"><span>API Key</span><input type="password" autoComplete="off" value={keyOf(current)} onChange={e=>setVendors(old=>old.map(v=>v.id===current.id?withKey(v,e.target.value):v))}/></label>
      <div className="pup-actionline"><button disabled={busy} onClick={()=>void fetchModels()}>{busy?'正在获取…':'↻ 获取模型列表'}</button><span className="pup-hint">{selected.size} 个模型已加入聊天池</span></div>
      <section className="pup-models">
        {groups.map(g=><details key={g.id} className="pup-family" open>
          <summary>{g.label}<small>{g.models.length} 个</small></summary>
          {g.models.map(id=><label className="pup-check-row" key={id}><input type="checkbox" checked={selected.has(id)} onChange={e=>toggleModel(id,e.target.checked)}/><span>{id}</span></label>)}
        </details>)}
        {!groups.length&&<p className="pup-empty">还没有模型，可先获取列表或手动添加。</p>}
        <div className="pup-actionline"><input placeholder="手动添加模型 ID" value={manual} onChange={e=>setManual(e.target.value)}/><button onClick={()=>{addManual(manual);setManual('')}}>＋ 添加</button></div>
      </section>
      {message&&<p className="pup-hint" role="status">{message}</p>}
      <div className="pup-provider-actions"><button className="pup-main-button" onClick={()=>save()}>保存供应商</button><button className="pup-delete-button" onClick={remove}>{current.builtin?'隐藏供应商':'删除供应商'}</button></div>
      {current.builtin&&<p className="pup-footnote">预置供应商不会物理删除；隐藏后会同时停用，避免升级或归一化时重新出现。</p>}
    </div>}
    {!current&&<div className="pup-simple-card"><p className="pup-empty">当前没有可见供应商，点击“添加”创建自定义供应商。</p></div>}
  </div>
}
