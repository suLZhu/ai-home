import { useEffect, useState } from 'react'
import './App.css'

type Page = 'home' | 'room' | 'fun' | 'settings'
type Person = '晏未晞' | '言朔'
type Tool = '人物提示' | '世界书' | '长期记忆' | '定时任务' | 'MCP' | '模型设置'

const tools: Tool[] = ['人物提示', '世界书', '长期记忆', '定时任务', 'MCP', '模型设置']

function read<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || '') as T } catch { return fallback }
}

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [person, setPerson] = useState<Person>('晏未晞')
  const [chatOpen, setChatOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<Record<Person, string[]>>(() => read('ai-home.messages', { '晏未晞': [], '言朔': [] }))
  const [memory, setMemory] = useState<Record<Person, string>>(() => read('ai-home.memory', { '晏未晞': '', '言朔': '' }))
  const [prompt, setPrompt] = useState<Record<Person, string>>(() => read('ai-home.prompt', { '晏未晞': '', '言朔': '' }))
  const [worldbook, setWorldbook] = useState<Record<Person, string>>(() => read('ai-home.worldbook', { '晏未晞': '', '言朔': '' }))
  const [tasks, setTasks] = useState<Record<Person, string[]>>(() => read('ai-home.tasks', { '晏未晞': [], '言朔': [] }))
  const [activeTool, setActiveTool] = useState<Tool | ''>('')
  const [time, setTime] = useState('')

  useEffect(() => {
    const update = () => setTime(new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()))
    update()
    const timer = window.setInterval(update, 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => localStorage.setItem('ai-home.messages', JSON.stringify(messages)), [messages])
  useEffect(() => localStorage.setItem('ai-home.memory', JSON.stringify(memory)), [memory])
  useEffect(() => localStorage.setItem('ai-home.prompt', JSON.stringify(prompt)), [prompt])
  useEffect(() => localStorage.setItem('ai-home.worldbook', JSON.stringify(worldbook)), [worldbook])
  useEffect(() => localStorage.setItem('ai-home.tasks', JSON.stringify(tasks)), [tasks])

  function openPerson(p: Person) { setPerson(p); setPage('room'); setChatOpen(true); setActiveTool('') }
  function send() {
    const text = draft.trim()
    if (!text) return
    setMessages(prev => ({ ...prev, [person]: [...prev[person], text] }))
    setDraft('')
  }
  function addTask() {
    const text = draft.trim()
    if (!text) return
    setTasks(prev => ({ ...prev, [person]: [...prev[person], text] }))
    setDraft('')
  }

  return <main className="shell">
    <section className="screen">
      {page === 'home' && <Home onPerson={openPerson} time={time} />}
      {page === 'room' && <Room person={person} setPerson={setPerson} chatOpen={chatOpen} setChatOpen={setChatOpen}
        draft={draft} setDraft={setDraft} messages={messages} send={send}
        activeTool={activeTool} setActiveTool={setActiveTool} memory={memory} setMemory={setMemory}
        prompt={prompt} setPrompt={setPrompt} worldbook={worldbook} setWorldbook={setWorldbook}
        tasks={tasks} addTask={addTask} />}
      {page === 'fun' && <Fun />}
      {page === 'settings' && <Settings />}
    </section>
    {!chatOpen && <nav className="bottom-nav">
      {(['home','room','fun','settings'] as Page[]).map((p, i) => <button key={p} className={page === p ? 'active' : ''} onClick={() => { setPage(p); setActiveTool('') }}>{['主页','房间','娱乐房','设置'][i]}</button>)}
    </nav>}
  </main>
}

function Home({ onPerson, time }: { onPerson: (p: Person) => void, time: string }) {
  return <div className="home-screen">
    <div className="home-people">
      <button className="avatar" onClick={() => onPerson('晏未晞')}>晏</button>
      <button className="avatar center" onClick={() => onPerson('晏未晞')}>顾</button>
      <button className="avatar" onClick={() => onPerson('言朔')}>言</button>
    </div>
    <button className="calendar-card" onClick={() => onPerson('晏未晞')}>
      <b>日历或日程表</b><span>日程模块 · 待接入</span>
    </button>
    <div className="home-ornament" aria-hidden="true"><i/><i/><i/><i/></div>
    <div className="clock">{time}<small>时钟</small></div>
    <p className="home-note">今天也慢慢来。</p>
  </div>
}

function Room(props: {
  person: Person, setPerson: (p: Person) => void, chatOpen: boolean, setChatOpen: (v: boolean) => void,
  draft: string, setDraft: (v: string) => void, messages: Record<Person,string[]>, send: () => void,
  activeTool: Tool | '', setActiveTool: (v: Tool | '') => void,
  memory: Record<Person,string>, setMemory: React.Dispatch<React.SetStateAction<Record<Person,string>>>,
  prompt: Record<Person,string>, setPrompt: React.Dispatch<React.SetStateAction<Record<Person,string>>>,
  worldbook: Record<Person,string>, setWorldbook: React.Dispatch<React.SetStateAction<Record<Person,string>>>,
  tasks: Record<Person,string[]>, addTask: () => void
}) {
  if (props.chatOpen) return <Chat {...props} />
  return <div className="room-screen">
    <header className="room-header"><div className="room-name"><span>{props.person === '晏未晞' ? '晏' : '言'}</span><div><b>{props.person} 的房间</b><small>独立工作区</small></div></div></header>
    <button className="chat-entry" onClick={() => props.setChatOpen(true)}><b>聊天窗口</b><span>点击进入 {props.person} 的全屏聊天</span><em>→</em></button>
    <div className="workspace-title">工作区</div>
    <div className="tool-grid">{tools.map(t => <button key={t} onClick={() => props.setActiveTool(t)}><b>{t}</b><span>{toolHint(t)}</span></button>)}</div>
    {props.activeTool && <ToolPanel {...props} />}
  </div>
}

function toolHint(t: Tool) {
  return ({'人物提示':'角色设定与系统提示','世界书':'世界观与关键词','长期记忆':'值得长期留下的事','定时任务':'稍后提醒与主动消息','MCP':'外部工具连接','模型设置':'接口与模型'} as Record<Tool,string>)[t]
}

function ToolPanel(p: any) {
  const t=p.activeTool as Tool
  if (t === '人物提示') return <Editor title="人物提示" value={p.prompt[p.person]} onChange={(v:string)=>p.setPrompt((x:any)=>({...x,[p.person]:v}))} placeholder="写下这个角色希望如何与你相处……" />
  if (t === '世界书') return <Editor title="世界书" value={p.worldbook[p.person]} onChange={(v:string)=>p.setWorldbook((x:any)=>({...x,[p.person]:v}))} placeholder="写下会被关键词唤起的世界设定……" />
  if (t === '长期记忆') return <Editor title="长期记忆" value={p.memory[p.person]} onChange={(v:string)=>p.setMemory((x:any)=>({...x,[p.person]:v}))} placeholder="这里先作为第一版本地记忆入口。" />
  if (t === '定时任务') return <div className="tool-panel"><h3>定时任务</h3><form onSubmit={(e)=>{e.preventDefault();p.addTask()}}><input value={p.draft} onChange={(e)=>p.setDraft(e.target.value)} placeholder="例如：晚上 23:00 提醒我休息"/><button>加入</button></form>{p.tasks[p.person].map((x:string,i:number)=><p className="task-line" key={i}>{x}</p>)}<small>第一版只保存任务，不执行调度。</small></div>
  return <div className="tool-panel"><h3>{t}</h3><p className="muted">{t === 'MCP' ? '预留工具连接层，后续接入 MCP 客户端。' : '预留模型适配层，后续接入 OpenAI 兼容接口、聚合站或本地模型。'}</p></div>
}

function Editor({title,value,onChange,placeholder}:{title:string,value:string,onChange:(v:string)=>void,placeholder:string}) {
  return <div className="tool-panel"><h3>{title}</h3><textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/><small>自动保存在本机浏览器。</small></div>
}

function Chat(p: any) {
  return <div className="fullscreen-chat">
    <header className="chat-header"><button onClick={()=>p.setChatOpen(false)}>← 房间</button><b>{p.person}</b><button onClick={()=>p.setPerson(p.person === '晏未晞' ? '言朔' : '晏未晞')}>切换</button></header>
    <div className="chat-body">{p.messages[p.person].length ? p.messages[p.person].map((m:string,i:number)=><div className="bubble user" key={i}>{m}</div>) : <div className="empty-chat">这里是 {p.person} 的独立房间。<br/>第一版先把房子搭稳，AI 接口随后接上。</div>}</div>
    <form className="compose" onSubmit={e=>{e.preventDefault();p.send()}}><input value={p.draft} onChange={e=>p.setDraft(e.target.value)} placeholder="写点什么……"/><button>发送</button></form>
  </div>
}

function Fun() { return <div className="fun-screen"><h2>娱乐房</h2><p>以后这里放内嵌浏览器、可视化网页、相册、播放器，以及客厅。</p><div className="fun-grid">{['内嵌浏览器','可视化网页','相册','播放器','客厅'].map(x=><button key={x}><b>{x}</b><span>功能预留</span></button>)}</div></div> }
function Settings() { return <div className="settings-screen"><h2>设置</h2><p>全局主题先保持书页感。模型、记忆、MCP 等能力逐步接入。</p><div className="setting-card"><b>当前主题</b><span>暖米白 · 书页</span></div><div className="setting-card"><b>数据</b><span>第一版使用浏览器本地存储，不碰 Kelivo 数据。</span></div></div> }
