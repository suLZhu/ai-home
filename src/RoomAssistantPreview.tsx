import { useState } from 'react'
import './RoomAssistantPreview.css'

type Assistant = '小晏' | '言朔'
type Dialog = { title: string; text: string; danger?: boolean; action?: 'delete-conversation'|'remove-widget'; targetId?: string }

const initialConversations = [
  { id: 'today', title: '今天的聊天', detail: '最近消息 · 10:24' },
  { id: 'plan', title: '栖间功能规划', detail: '昨天 · 18:42' },
]
const widgets = [
  { id: 'note', title: '便签', detail: '记录随手写下的内容' },
  { id: 'list', title: '清单', detail: '待办、愿望和约定' },
  { id: 'ledger', title: '记账', detail: '简单记录数字和说明' },
]

export function RoomAssistantPreview() {
  const [assistant,setAssistant] = useState<Assistant>('小晏')
  const [page,setPage] = useState<'root'|'profile'|'sessions'|'room'|'widgets'>('root')
  const [roomStyle,setRoomStyle] = useState('浅色房间')
  const [enabledWidgets,setEnabledWidgets] = useState(['note'])
  const [conversationList,setConversationList] = useState(initialConversations)
  const [dialog,setDialog] = useState<Dialog|null>(null)
  const [notice,setNotice] = useState('')

  function back(){ setDialog(null); setNotice(''); setPage('root') }
  const row = (title:string, detail:string, onClick:()=>void, right='›') =>
    <button className="qj-ra-row" onClick={onClick} key={title}><span><b>{title}</b><small>{detail}</small></span><em>{right}</em></button>

  return <div className="qj-ra-page">
    <header className="qj-ra-head">
      {page!=='root'&&<button onClick={back}>‹ 返回</button>}
      <h2>{page==='root'?'房间与助手':page==='profile'?'助手详情':page==='sessions'?'独立会话':page==='room'?'房间布置':'房间小组件'}</h2>
      <p>布局预览 · 助手数据与房间内容均为模拟</p>
    </header>

    {page==='root'&&<>
      <div className="qj-ra-assistant-switch">{(['小晏','言朔'] as const).map(x=><button key={x} className={assistant===x?'active':''} onClick={()=>setAssistant(x)}>{x}</button>)}</div>
      <div className="qj-ra-profile-card"><div className="qj-ra-avatar">{assistant.slice(0,1)}</div><div><b>{assistant}</b><small>独立助手资料与专属空间</small></div></div>
      <section><h3>助手</h3><div className="qj-ra-list">
        {row('助手详情','名称、设定、语言与形象',()=>setPage('profile'))}
        {row('独立会话','查看与切换该助手的聊天',()=>setPage('sessions'))}
      </div></section>
      <section><h3>房间</h3><div className="qj-ra-list">
        {row('房间布置','背景、场景与房间样式',()=>setPage('room'))}
        {row('房间小组件','便签、清单与自定义组件',()=>setPage('widgets'))}
      </div></section>
    </>}

    {page==='profile'&&<div className="qj-ra-panel">
      <div className="qj-ra-profile-card"><div className="qj-ra-avatar large">{assistant.slice(0,1)}</div><div><b>{assistant}</b><small>这里不会重新设计一套助手档案</small></div></div>
      <p>正式接入时直接复用栖间原版已经存在的助手详情页、设定字段和已有数据，仅统一新版页面容器、按钮和返回样式。</p>
      <div className="qj-ra-list">
        {row('基础资料','名称、头像、语言、角色设定',()=>setNotice('正式版复用原助手详情字段。'))}
        {row('模型与工具绑定','查看该助手当前绑定',()=>setNotice('正式版读取真实绑定关系。'))}
        {row('记忆与世界书','跳转对应助手的独立数据',()=>setNotice('正式版跳转到真实记忆与世界书。'))}
      </div>
    </div>}

    {page==='sessions'&&<div className="qj-ra-panel">
      <div className="qj-ra-toolbar"><strong>{assistant}的会话</strong><button onClick={()=>setNotice('演示：正式版在这里创建真实会话。')}>＋ 新建</button></div>
      <div className="qj-ra-list">{conversationList.map(c=><div className="qj-ra-session" key={c.id}><button onClick={()=>setNotice('演示打开「'+c.title+'」')}><b>{c.title}</b><small>{c.detail}</small></button><button className="more" onClick={()=>setDialog({title:'删除会话？',text:'确认后仅从预览中演示移除，不会删除真实聊天。',danger:true,action:'delete-conversation',targetId:c.id})}>⋯</button></div>)}</div>
      <p className="qj-ra-note">正式版返回该列表时应保留原来的滚动位置。</p>
    </div>}

    {page==='room'&&<div className="qj-ra-panel">
      <div className={'qj-ra-room '+(roomStyle==='夜间房间'?'night':'')}><span>窗</span><i>桌</i><b>{assistant}的小空间</b></div>
      <div className="qj-ra-list">
        {['浅色房间','夜间房间','自定义背景'].map(x=>row(x,x===roomStyle?'当前选择':'点击预览',()=>setRoomStyle(x),x===roomStyle?'✓':'›'))}
      </div>
      <p className="qj-ra-note">图库与完整主题系统属于后续项目；这里先预留房间自身的背景和场景入口。</p>
    </div>}

    {page==='widgets'&&<div className="qj-ra-panel">
      <div className="qj-ra-toolbar"><strong>已启用 {enabledWidgets.length} 个</strong><button onClick={()=>setNotice('演示：以后可从组件库添加。')}>＋ 添加组件</button></div>
      <div className="qj-ra-list">{widgets.map(w=><div className="qj-ra-widget" key={w.id}><div><b>{w.title}</b><small>{w.detail}</small></div>{enabledWidgets.includes(w.id)?<button onClick={()=>setDialog({title:'移除组件？',text:'仅从房间中移除，不删除组件数据。',danger:true,action:'remove-widget',targetId:w.id})}>移除</button>:<button onClick={()=>setEnabledWidgets(old=>[...old,w.id])}>添加</button>}</div>)}</div>
      <p className="qj-ra-note">组件数据、排序和自由拖动留待真实房间功能接入后测试。</p>
    </div>}

    {notice&&<p className="qj-ra-notice" role="status">{notice}</p>}
    {dialog&&<div className="qj-dialog-layer" onClick={()=>setDialog(null)}><div className="qj-dialog" role="dialog" aria-modal="true" aria-label={dialog.title} onClick={e=>e.stopPropagation()}>
      <h3>{dialog.title}</h3><p>{dialog.text}</p>{dialog.danger&&<p className="qj-dialog-warning">当前为预览，不会修改真实数据。</p>}
      <div className="qj-dialog-actions"><button className="qj-dialog-cancel" onClick={()=>setDialog(null)}>取消</button><button className="qj-dialog-danger" onClick={()=>{
        if(dialog.action==='remove-widget'&&dialog.targetId)setEnabledWidgets(old=>old.filter(id=>id!==dialog.targetId))
        if(dialog.action==='delete-conversation'&&dialog.targetId)setConversationList(old=>old.filter(item=>item.id!==dialog.targetId))
        setNotice('演示操作完成，真实数据没有改变。');setDialog(null)
      }}>确认</button></div>
    </div></div>}
  </div>
}
