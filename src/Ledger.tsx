import { useEffect, useMemo, useState, type FormEvent } from 'react'
import './Ledger.css'

type Entry = { id:string; kind:'expense'|'income'; amount:number; category:string; note:string; date:string }
const storageKey='ai-home.ledger.v1'
const today=()=>new Date().toLocaleDateString('en-CA')
function load():Entry[]{try{const raw=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(raw)?raw.filter((x:any)=>x&&typeof x.id==='string'&&Number.isFinite(x.amount)&&x.amount>0&&(x.kind==='expense'||x.kind==='income')):[]}catch{return []}}
const money=(value:number)=>value.toFixed(2)
export function Ledger(){
 const [entries,setEntries]=useState<Entry[]>(load)
 const [kind,setKind]=useState<'expense'|'income'>('expense')
 const [amount,setAmount]=useState('')
 const [category,setCategory]=useState('餐饮')
 const [note,setNote]=useState('')
 const [date,setDate]=useState(today)
 const [month,setMonth]=useState(today().slice(0,7))
 const [error,setError]=useState('')
 useEffect(()=>{try{localStorage.setItem(storageKey,JSON.stringify(entries));setError('')}catch{setError('浏览器存储空间不足，最新记录可能未保存。')}},[entries])
 const visible=useMemo(()=>entries.filter(e=>e.date.startsWith(month)).sort((a,b)=>b.date.localeCompare(a.date)),[entries,month])
 const income=visible.filter(e=>e.kind==='income').reduce((s,e)=>s+e.amount,0)
 const expense=visible.filter(e=>e.kind==='expense').reduce((s,e)=>s+e.amount,0)
 function add(e:FormEvent){e.preventDefault();const value=Number(amount);if(!Number.isFinite(value)||value<=0||value>1e10||!date||!/^\d{4}-\d{2}-\d{2}$/.test(date)){setError('请填写有效日期和大于 0 的金额。');return}setEntries(old=>[{id:crypto.randomUUID(),kind,amount:Math.round(value*100)/100,category:category.trim()||'其他',note:note.trim(),date},...old]);setMonth(date.slice(0,7));setAmount('');setNote('');setError('')}
 function remove(id:string){if(window.confirm('确定删除这条账目吗？'))setEntries(old=>old.filter(x=>x.id!==id))}
 return <section className="ledger"><header className="ledger-heading"><h3>我的记账单</h3><small>私人收支记录 · 当前浏览器保存</small></header>
 <label className="ledger-month">查看月份 <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label>
 <div className="ledger-summary"><div><small>本月收入</small><b>＋{money(income)}</b></div><div><small>本月支出</small><b>－{money(expense)}</b></div><div><small>本月结余</small><b>{money(income-expense)}</b></div></div>
 <form className="ledger-form" onSubmit={add}><h4>记一笔</h4><div className="ledger-kinds"><button type="button" className={kind==='expense'?'selected':''} onClick={()=>{setKind('expense');setCategory('餐饮')}}>支出</button><button type="button" className={kind==='income'?'selected':''} onClick={()=>{setKind('income');setCategory('工资')}}>收入</button></div>
 <div className="ledger-fields"><label>金额<input required type="number" min="0.01" max="10000000000" step="0.01" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00"/></label><label>日期<input required type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>分类<select value={category} onChange={e=>setCategory(e.target.value)}>{(kind==='expense'?['餐饮','购物','交通','住房','娱乐','健康','其他']:['工资','奖金','红包','退款','其他']).map(x=><option key={x}>{x}</option>)}</select></label><label>备注<input value={note} maxLength={100} onChange={e=>setNote(e.target.value)} placeholder="可选"/></label></div><button className="ledger-add" type="submit">＋ 保存账目</button></form>
 {error&&<p role="alert" className="ledger-error">{error}</p>}
 <div className="ledger-history"><h4>{month} · 账目明细</h4>{visible.length?visible.map(x=><article key={x.id}><div><b>{x.category}</b><small>{x.date}{x.note?' · '+x.note:''}</small></div><strong className={x.kind}>{x.kind==='income'?'+':'−'}{money(x.amount)}</strong><button type="button" onClick={()=>remove(x.id)} aria-label={'删除'+x.category+'账目'}>删除</button></article>):<p className="muted">这个月还没有账目，记下第一笔吧。</p>}</div>
 <p className="ledger-notice">目前仅保存在此浏览器中，清理浏览器数据可能导致记录丢失。云端同步和导出功能待接入。</p></section>
}
