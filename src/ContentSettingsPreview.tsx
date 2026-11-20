import { useState } from 'react'
import { ChatDisplaySettings } from './ChatDisplay'
import './ContentSettingsPreview.css'

type Topic = { name: string; desc: string }
type Dialog = { name: string; desc: string; danger?: boolean; choices?: string[] }
const memoryGroups: { title: string; rows: Topic[] }[] = [
  { title: '长期记忆', rows: [
    {name:'记忆条目',desc:'按助手查看、检索与整理记忆'},
    {name:'记忆搜索',desc:'关键词、语义检索与命中来源'},
    {name:'记忆写入规则',desc:'需要确认的记忆、自动记录范围'},
  ]},
  { title: '世界书与上下文', rows: [
    {name:'世界书',desc:'条目编辑、触发词与助手绑定'},
    {name:'上下文设置',desc:'历史消息、压缩摘要、Token 限制'},
    {name:'助手使用说明',desc:'查看栖间说明与可调用的帮助'},
  ]},
]
const chatGroups: { title: string; rows: Topic[] }[] = [
  {title:'显示与排版',rows:[
    {name:'聊天字号',desc:'预览默认 12 号，可单独调整'},
    {name:'气泡样式',desc:'背景、圆角与消息宽度'},
    {name:'消息时间与头像',desc:'显示方式与位置'},
  ]},
  {title:'聊天操作',rows:[
    {name:'消息管理',desc:'编辑、删除、多选与重新生成'},
    {name:'待发送消息',desc:'上一条生成期间继续排队'},
    {name:'模型调用设置',desc:'单次工具调用上限及失败提示'},
  ]},
  {title:'通知',rows:[
    {name:'通知偏好',desc:'新消息、任务提醒与震动'},
    {name:'提示铃声',desc:'系统通知渠道与测试通知'},
  ]},
]
const diagnosticGroups: { title: string; rows: Topic[] }[] = [
  {title:'检查与记录',rows:[
    {name:'运行状态',desc:'前端、网络与原生能力检查'},
    {name:'请求日志',desc:'时间、模型、耗时、错误代码'},
    {name:'定时任务日志',desc:'触发时间、运行结果与通知投递'},
    {name:'工具调用日志',desc:'MCP、网页与工作区调用详情'},
  ]},
  {title:'维护',rows:[
    {name:'备份状态',desc:'备份时间、目标与恢复记录'},
    {name:'清理缓存',desc:'先预览范围，再确认清除'},
    {name:'使用说明',desc:'查看功能说明与常见问题'},
    {name:'关于与版本',desc:'当前版本、更新及开源信息'},
  ]},
]
const entries = [
  {id:'a',title:'助手身份',desc:'每位助手有自己的设定与记忆范围'},
  {id:'b',title:'页面设计习惯',desc:'界面保持紧凑，返回时保留位置'},
  {id:'c',title:'重要约定',desc:'定时任务要自然地发消息，不朗读任务描述'},
]
export function ContentSettingsPreview({ type }: {type:'memory'|'chat'|'diagnostic'}) {
  const [topic, setTopic] = useState('')
  const [dialog, setDialog] = useState<Dialog|null>(null)
  const [who,setWho] = useState<'小晏'|'言朔'>('小晏')
  const [search,setSearch] = useState('')
  const [fontSize,setFontSize] = useState('12')
  const [switches,setSwitches] = useState<Record<string,boolean>>({})
  const [notice,setNotice] = useState('')
  const groups = type==='memory'?memoryGroups:type==='chat'?chatGroups:diagnosticGroups
  const title = type==='memory'?'记忆与上下文':type==='chat'?'聊天与消息':'诊断与维护'
  function open(name:string) {setTopic(name);setSearch('');setNotice('')}
  const previewRow = (name:string,desc:string,onClick:()=>void,right='›')=><button key={name} className="qj-content-row" onClick={onClick}><span><b>{name}</b><small>{desc}</small></span><em>{right}</em></button>
  const toggle = (name:string,desc:string) =>previewRow(name,desc,()=>setSwitches(old=>({...old,[name]:!old[name]})),switches[name]?'演示开启':'演示关闭')
  return <div className="qj-content-page">
    <header className="qj-content-title">
      {topic&&<button className="qj-content-back" onClick={()=>setTopic('')}>‹ 返回分类</button>}
      <h2>{topic||title}</h2><p>交互布局预览 · 模拟数据不会写入真实设置</p>
    </header>
    {!topic && groups.map(group=><section className="qj-content-group" key={group.title}><h3>{group.title}</h3><div className="qj-content-list">{group.rows.map(x=>previewRow(x.name,x.desc,()=>open(x.name)))}</div></section>)}
    {!!topic && <>
      {type==='memory' && ['记忆条目','记忆搜索','世界书'].includes(topic) ? <>
        <div className="qj-content-tabs">{(['小晏','言朔'] as const).map(x=><button key={x} className={who===x?'active':''} onClick={()=>setWho(x)}>{x}</button>)}</div>
        <input className="qj-content-input" placeholder={'搜索'+topic+'（演示）'} value={search} onChange={e=>setSearch(e.target.value)}/>
        <div className="qj-content-list">{entries.filter(x=>(x.title+x.desc).includes(search)).map(x=>previewRow(x.title,x.desc,()=>setDialog({name:x.title,desc:'查看内容、修改或删除时，正式版将打开对应助手的真实条目。',choices:['预览编辑','预览删除']})))}</div>
        <button className="qj-content-primary" onClick={()=>setDialog({name:'新增'+(topic==='世界书'?'条目':'记忆'),desc:'正式版添加标题、正文、触发关键词和助手绑定。'})}>＋ 新增{topic==='世界书'?'条目':'记忆'}</button>
        <p className="qj-content-note">当前只是独立助手数据区的布局示范，演示内容不代表真实记忆。</p>
      </> : null}
      {topic==='聊天字号'&&<div className="qj-content-panel"><p>当前预览聊天文字大小：{fontSize} 号</p><div className="qj-content-pills">{['12','13','14','15','16'].map(x=><button key={x} className={fontSize===x?'active':''} onClick={()=>setFontSize(x)}>{x} 号</button>)}</div><div className="qj-content-chat-sample" style={{fontSize:Number(fontSize)}}>文字大小预览：一行容纳更多文字，阅读也要舒服。</div><small>字号这项仍是新版布局预览；头像、名称、时间、Token、思考与工具调用已经接入真实聊天展示设置。</small><ChatDisplaySettings /></div>}
      {topic==='待发送消息'&&<div className="qj-content-panel">{toggle('开启待发送区','生成上一条回复时允许排队输入')}{toggle('发送前允许编辑','待发送内容可随时修改或撤回')}<p className="qj-content-note">两个开关仅演示交互；真实排队机制待功能集成。</p></div>}
      {topic==='通知偏好'&&<div className="qj-content-panel">{toggle('新消息提醒','其他会话或后台收到消息时通知')}{toggle('主动任务通知','任务完成后的主动消息')}{toggle('振动提醒','以 Android 系统通知渠道为准')}</div>}
      {topic==='提示铃声'&&<div className="qj-content-panel">
        {previewRow('系统通知渠道','铃声、通知重要性与勿扰状态由 Android 管理',()=>setDialog({name:'系统通知渠道',desc:'正式版需调用 Android 原生能力，打开系统渠道页面。'}))}
        {previewRow('测试铃声','通过原生测试通知检查真实发声',()=>setDialog({name:'发送测试通知',desc:'预览不会播放假铃声；此入口将在功能接入后发送真实 Android 通知。'}))}
      </div>}
      {type==='diagnostic'&&<div className="qj-content-panel"><div className="qj-content-health"><b>无法检查</b><small>演示版本不连接真实设备或服务器状态</small></div>
        {previewRow('查看检查内容','权限、任务、请求和日志',()=>setDialog({name:topic,desc:'正式版从原有诊断、日志或备份系统获取最新状态，不展示虚构的成功结果。'}))}
        {topic==='清理缓存'&&previewRow('清理临时缓存','危险操作需要二次确认',()=>setDialog({name:'确认清理缓存',desc:'演示版不会真正清理或删除任何数据。',danger:true}))}
      </div>}
      {topic && type!=='diagnostic' && !['记忆条目','记忆搜索','世界书','聊天字号','待发送消息','通知偏好','提示铃声'].includes(topic) &&
        <div className="qj-content-panel">{previewRow('基础设置','查看和编辑当前功能选项',()=>setDialog({name:topic,desc:'这里将复用栖间原版的实际功能及数据；当前展示统一编辑窗口。'}))}
        {previewRow('高级选项','收纳不常用的细节',()=>setDialog({name:'高级选项',desc:'正式版只展示实际可用的配置项，不增加虚假功能。'}))}</div>}
    </>}
    {notice&&<p className="qj-content-note" role="status">{notice}</p>}
    {dialog&&<div className="qj-dialog-layer" onClick={()=>setDialog(null)}><div className="qj-dialog" role="dialog" aria-modal="true" aria-label={dialog.name} onClick={e=>e.stopPropagation()}>
      <h3>{dialog.name}</h3><p>{dialog.desc}</p>
      {dialog.choices&&<div className="qj-dialog-options">{dialog.choices.map(x=><button key={x} onClick={()=>{setNotice(x+'：演示操作，不修改真实数据');setDialog(null)}}>{x}<span>›</span></button>)}</div>}
      {dialog.danger&&<p className="qj-dialog-warning">此版本不会实际清理。</p>}
      <div className="qj-dialog-actions">
        <button className="qj-dialog-cancel" onClick={()=>setDialog(null)}>{dialog.danger?'取消':'关闭'}</button>
        {dialog.danger&&<button className="qj-dialog-danger" onClick={()=>{setNotice('演示确认完成，真实缓存和数据没有改变。');setDialog(null)}}>确认清理</button>}
      </div>
    </div></div>}
  </div>
}
