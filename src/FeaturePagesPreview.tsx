import { useState } from 'react'
import './FeaturePagesPreview.css'

type Role = { id: string; title: string; hint: string; note: string }
const roles: Role[] = [
  { id: 'image', title: '生图模型', hint: '文字生成图片、图片编辑', note: '对话中需要画图时使用' },
  { id: 'video', title: '视频模型', hint: '文字或图片生成视频', note: '视频生成能力需对应接口支持' },
  { id: 'embedding', title: '向量模型', hint: '记忆索引、语义搜索', note: '与记忆库的向量检索设置对应' },
  { id: 'vision', title: '视觉理解模型', hint: '识别图片与截图', note: '与生图模型不同：负责看图' },
  { id: 'speech', title: '语音识别模型', hint: '将语音转成文字', note: '语音输入时使用' },
  { id: 'voice', title: '语音合成模型', hint: '将文字读成语音', note: '语音回复时使用' },
  { id: 'rerank', title: '重排序模型', hint: '优化搜索与记忆召回', note: '按需启用的高级能力' },
]

const samples = [
  { label: '不指定', value: '' },
  { label: '中转站 A · 示例模型 1', value: 'example-a' },
  { label: '中转站 B · 示例模型 2', value: 'example-b' },
]
export function ModelFunctionsPreview() {
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<Role | null>(null)
  const [draft, setDraft] = useState('')
  return <div className="qj-feature-page">
    <header className="qj-feature-intro"><h2>模型功能</h2><p>供应商负责接入，模型功能负责分配用途。以下为演示模型，不代表已接通。</p></header>
    <div className="qj-feature-group"><h3>生成与理解</h3>{roles.slice(0,4).map(role => <button className="qj-feature-row" key={role.id} onClick={() => {setEditing(role);setDraft(selected[role.id] || '')}}>
      <span><b>{role.title}</b><small>{role.hint}</small></span><em>{samples.find(x => x.value === (selected[role.id] || ''))?.label || '未指定'} ›</em>
    </button>)}</div>
    <div className="qj-feature-group"><h3>语音与检索</h3>{roles.slice(4).map(role => <button className="qj-feature-row" key={role.id} onClick={() => {setEditing(role);setDraft(selected[role.id] || '')}}>
      <span><b>{role.title}</b><small>{role.hint}</small></span><em>{samples.find(x => x.value === (selected[role.id] || ''))?.label || '未指定'} ›</em>
    </button>)}</div>
    <p className="qj-feature-note">后续这里显示供应商和订阅账号实际可用、且支持对应能力的模型。是否支持生成图片、视频或语音，需要逐个接口验证。</p>
    {editing && <div className="qj-dialog-layer" onClick={() => setEditing(null)}><div className="qj-dialog" role="dialog" aria-modal="true" aria-label={'选择'+editing.title} onClick={e=>e.stopPropagation()}>
      <h3>{editing.title}</h3><p>{editing.note}</p>
      <div className="qj-dialog-options">{samples.map(option => <button key={option.label} type="button" onClick={() => setDraft(option.value)}>{option.label}<span>{draft === option.value ? '✓' : ''}</span></button>)}</div>
      <div className="qj-dialog-actions"><button className="qj-dialog-cancel" onClick={() => setEditing(null)}>取消</button><button onClick={() => {setSelected(old=>({...old,[editing.id]:draft}));setEditing(null)}}>保存选择</button></div>
    </div></div>}
  </div>
}

type Task = { id: number; title: string; prompt: string; recurrence: string; active: boolean; next: string }
const initialTasks: Task[] = [
  { id: 1, title: '每两小时来聊天', prompt: '自然地找我说说话，不要念任务要求。', recurrence: '每两小时', active: true, next: '下次：16:00' },
  { id: 2, title: '每日回顾', prompt: '整理当天的待办和约定。', recurrence: '每天', active: false, next: '下次：明天 20:00' },
]
const intervals = ['仅一次', '每两小时', '每天', '每周']
export function ScheduledTasksPreview() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [editing, setEditing] = useState<Task | 'new' | null>(null)
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [repeat, setRepeat] = useState('每两小时')
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  function edit(task: Task | 'new') {
    setEditing(task)
    setTitle(task === 'new' ? '' : task.title)
    setPrompt(task === 'new' ? '' : task.prompt)
    setRepeat(task === 'new' ? '仅一次' : task.recurrence)
  }
  function save() {
    if (!title.trim() || !prompt.trim()) return
    if (editing === 'new') setTasks(old => [...old,{id:Math.max(0,...old.map(x=>x.id))+1,title:title.trim(),prompt:prompt.trim(),recurrence:repeat,active:true,next:'待设置开始时间'}])
    else if (editing) setTasks(old => old.map(x => x.id === editing.id ? {...x,title:title.trim(),prompt:prompt.trim(),recurrence:repeat} : x))
    setEditing(null)
  }
  return <div className="qj-feature-page">
    <header className="qj-feature-intro"><h2>定时任务</h2><p>创建提醒、主动聊天与重复任务；本页只演示布局。</p></header>
    <div className="qj-task-stats"><span><b>{tasks.filter(x=>x.active).length}</b><small>进行中</small></span><span><b>{tasks.filter(x=>!x.active).length}</b><small>已暂停</small></span><button onClick={() => edit('new')}>＋ 新建任务</button></div>
    <div className="qj-feature-group"><h3>任务列表</h3>{tasks.length ? tasks.map(task => <div className="qj-task-row" key={task.id}>
      <div><b>{task.title}</b><small>{task.recurrence} · {task.next}</small><p>{task.prompt}</p></div>
      <div className="qj-task-actions"><button onClick={() => edit(task)}>编辑</button><button onClick={() => setTasks(old=>old.map(x=>x.id===task.id?{...x,active:!x.active}:x))}>{task.active?'暂停':'恢复'}</button><button onClick={() => setConfirmDelete(task.id)}>删除</button></div>
    </div>) : <p className="qj-feature-note">还没有任务，点击右上方创建。</p>}</div>
    <button className="qj-feature-record" onClick={() => edit('new')}>＋ 创建其他定时任务 <span>›</span></button>
    <p className="qj-feature-note">任务执行记录、失败原因和真实触发时间将在功能接入阶段从原版数据读取。</p>
    {editing && <div className="qj-dialog-layer" onClick={() => setEditing(null)}><div className="qj-dialog qj-edit-dialog" role="dialog" aria-modal="true" aria-label={editing==='new'?'创建任务':'编辑任务'} onClick={e=>e.stopPropagation()}>
      <h3>{editing === 'new' ? '创建任务' : '编辑任务'}</h3>
      <label>任务名称<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="例如：每两小时找我聊天" /></label>
      <label>任务内容<textarea rows={3} value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="到点后助手要做什么" /></label>
      <label>重复规则<select value={repeat} onChange={e=>setRepeat(e.target.value)}>{intervals.map(x=><option key={x}>{x}</option>)}</select></label>
      <p>开始时间和真实执行状态将在功能接入后连接原版调度器。</p>
      <div className="qj-dialog-actions"><button className="qj-dialog-cancel" onClick={() => setEditing(null)}>取消</button><button disabled={!title.trim()||!prompt.trim()} onClick={save}>保存</button></div>
    </div></div>}
    {confirmDelete !== null && <div className="qj-dialog-layer" onClick={() => setConfirmDelete(null)}><div className="qj-dialog" role="dialog" aria-modal="true" aria-label="确认删除任务" onClick={e=>e.stopPropagation()}>
      <h3>删除任务？</h3><p>确认后从本次预览列表移除，不会删除真实任务。</p><div className="qj-dialog-actions"><button className="qj-dialog-cancel" onClick={()=>setConfirmDelete(null)}>取消</button><button className="qj-dialog-danger" onClick={()=>{setTasks(old=>old.filter(x=>x.id!==confirmDelete));setConfirmDelete(null)}}>删除</button></div>
    </div></div>}
  </div>
}
