import { useEffect, useState, type FormEvent } from 'react'
import './Diary.css'
import { ASSISTANT_IDS } from './assistantIdentity'
type Entry={id:string;owner:string;title:string;date:string;visibility:'public'|'locked';content?:string}
const owners=['阿懒',...ASSISTANT_IDS]
export function Diary({personLabel}:{personLabel?:(id:string)=>string}){
 const label=(who:string)=>personLabel&&who!=='阿懒'?personLabel(who):who
 const [entries,setEntries]=useState<Entry[]>([])
 const [owner,setOwner]=useState('阿懒')
 const [title,setTitle]=useState('')
 const [content,setContent]=useState('')
 const [locked,setLocked]=useState(true)
 const [secret,setSecret]=useState('')
 const [view,setView]=useState<Record<string,string>>({})
 const [passwords,setPasswords]=useState<Record<string,string>>({})
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 async function refresh(){const r=await fetch('/api/diary',{credentials:'same-origin'});const d=await r.json();if(!r.ok)throw Error(d.error||'读取失败');setEntries(d.entries||[])}
 useEffect(()=>{refresh().catch(e=>setError(e.message))},[])
 async function add(e:FormEvent){e.preventDefault();if(!title.trim()||!content.trim()||locked&&secret.length<6){setError('请填写标题、正文；上锁时暗号至少6位。');return}setBusy(true);setError('');try{const r=await fetch('/api/diary',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner,title,content,visibility:locked?'locked':'public',secret:locked?secret:undefined})});const d=await r.json();if(!r.ok)throw Error(d.error||'保存失败');setTitle('');setContent('');setSecret('');await refresh()}catch(e){setError(e instanceof Error?e.message:'保存失败')}finally{setBusy(false)}}
 async function unlock(entry:Entry){setError('');try{const r=await fetch('/api/diary/'+entry.id+'/read',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:passwords[entry.id]||''})});const d=await r.json();if(!r.ok)throw Error(d.error||'暗号错误');setView(old=>({...old,[entry.id]:d.content}));setPasswords(old=>({...old,[entry.id]:''}))}catch(e){setError(e instanceof Error?e.message:'解锁失败')}}
 async function remove(entry:Entry){if(!window.confirm('确定删除这篇日记吗？'))return;try{const r=await fetch('/api/diary/'+entry.id,{method:'DELETE',credentials:'same-origin'});const d=await r.json();if(!r.ok)throw Error(d.error||'删除失败');setView(old=>{const n={...old};delete n[entry.id];return n});await refresh()}catch(e){setError(e instanceof Error?e.message:'删除失败')}}
 return <section className="diary"><h3>📖 三人秘密日记</h3><p className="muted">三本小日记，每篇独立公开或上锁。锁定日记需要主人给的暗号。</p><form onSubmit={add} className="diary-editor"><h4>写一篇日记</h4><label>作者<select value={owner} onChange={e=>setOwner(e.target.value)}>{owners.map(x=><option key={x} value={x}>{label(x)}</option>)}</select></label><label>标题<input maxLength={100} value={title} onChange={e=>setTitle(e.target.value)} required placeholder="今天想记下什么？"/></label><label>正文<textarea rows={5} maxLength={20000} value={content} onChange={e=>setContent(e.target.value)} required/></label><div className="diary-toggle"><label><input type="checkbox" checked={locked} onChange={e=>setLocked(e.target.checked)}/> 🔒 上锁（默认）</label><span>{locked?'仅持有暗号的人可解锁':'🌿 公开给三个人阅读'}</span></div>{locked&&<label>解锁暗号<input type="password" autoComplete="new-password" minLength={6} maxLength={100} value={secret} onChange={e=>setSecret(e.target.value)} placeholder="至少6位；忘记无法恢复"/></label>}<button disabled={busy}>{busy?'保存中…':'保存日记'}</button></form>
 {error&&<p role="alert" className="diary-error">{error}</p>}
 <div className="diary-shelves">{owners.map(who=><section key={who}><h4>📔 {label(who)}的日记</h4>{entries.filter(e=>e.owner===who).length===0?<p className="muted">还没有日记</p>:entries.filter(e=>e.owner===who).map(e=><article key={e.id}><div className="diary-entry-head"><div><b>{e.visibility==='locked'?'🔒':'🌿'} {e.title}</b><small>{e.date}</small></div><button type="button" onClick={()=>remove(e)}>删除</button></div>{e.visibility==='public'||view[e.id]!==undefined?<><p className="diary-text">{e.visibility==='public'?e.content:view[e.id]}</p>{e.visibility==='locked'&&<button type="button" onClick={()=>setView(old=>{const n={...old};delete n[e.id];return n})}>重新上锁</button>}</>:<div className="diary-unlock"><input type="password" autoComplete="off" aria-label={'输入'+e.title+'的暗号'} value={passwords[e.id]||''} onChange={ev=>setPasswords(old=>({...old,[e.id]:ev.target.value}))} placeholder="向主人索取暗号"/><button type="button" onClick={()=>unlock(e)}>解锁</button></div>}</article>)}</section>)}</div>
 <p className="muted">安全提示：目前所有人共用一个登录会话，尚不能验证真正的作者身份；请勿把作者选择当成身份认证。锁定正文由暗号加密，忘记暗号无法恢复。</p></section>
}
