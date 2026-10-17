import { useEffect, useState } from 'react'
import './App.css'
import { CharacterSettings, blankCard, type CharacterCard } from './CharacterSettings'
import { WorldbookEditor, type WorldEntry } from './WorldbookEditor'

type Page = 'home' | 'room' | 'me' | 'fun' | 'settings'
type Person = '晏未晞' | '言朔'
type Tool = '人物设置' | '世界书' | '长期记忆' | '定时任务' | 'MCP' | '模型设置'

const tools: Tool[] = ['人物设置', '世界书', '长期记忆', '定时任务', 'MCP', '模型设置']

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
  const [characters, setCharacters] = useState<Record<Person,CharacterCard>>(() => read('ai-home.characters', { '晏未晞': blankCard('晏未晞'), '言朔': blankCard('言朔') }))
  const [worldEntries, setWorldEntries] = useState<Record<Person, WorldEntry[]>>(() => read('ai-home.worldEntries', { '晏未晞': [], '言朔': [] }))
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
  useEffect(() => localStorage.setItem('ai-home.characters', JSON.stringify(characters)), [characters])
  useEffect(() => localStorage.setItem('ai-home.worldbook', JSON.stringify(worldbook)), [worldbook])
  useEffect(() => localStorage.setItem('ai-home.worldEntries', JSON.stringify(worldEntries)), [worldEntries])
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
      {page === 'home' && <Home onPerson={openPerson} onMe={() => setPage('me')} time={time} />}
      {page === 'room' && <Room person={person} setPerson={setPerson} chatOpen={chatOpen} setChatOpen={setChatOpen}
        draft={draft} setDraft={setDraft} messages={messages} send={send}
        activeTool={activeTool} setActiveTool={setActiveTool} memory={memory} setMemory={setMemory}
        prompt={prompt} setPrompt={setPrompt} characters={characters} setCharacters={setCharacters} worldbook={worldbook} setWorldbook={setWorldbook} worldEntries={worldEntries} setWorldEntries={setWorldEntries}
        tasks={tasks} addTask={addTask} />}
      {page === 'me' && <MyRoom />}
      {page === 'fun' && <Fun />}
      {page === 'settings' && <Settings />}
    </section>
    {!chatOpen && <nav className="bottom-nav">
      {(['home','room','fun','settings'] as Page[]).map((p, i) => <button key={p} className={page === p ? 'active' : ''} onClick={() => { setPage(p); setActiveTool('') }}>{['主页','房间','娱乐房','设置'][i]}</button>)}
    </nav>}
  </main>
}

function Home({ onPerson, onMe, time }: { onPerson: (p: Person) => void, onMe: () => void, time: string }) {
  return <div className="home-screen">
    <div className="home-people">
      <button className="avatar" onClick={() => onPerson('晏未晞')}>晏</button>
      <button className="avatar center" onClick={onMe}>顾</button>
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

function MyRoom() {
  return <div className="room-screen">
    <header className="room-header"><div className="room-name"><span>顾</span><div><b>我的房间</b><small>自己的工作区</small></div></div></header>
    <div className="workspace-title">我的空间</div>
    <div className="tool-grid">
      <button><b>日历与日程</b><span>安排今天与之后的事情</span></button>
      <button><b>我的备忘</b><span>只属于自己的记录</span></button>
      <button><b>共同记忆</b><span>与两个角色共同留下的事</span></button>
      <button><b>个人设置</b><span>头像、昵称与偏好</span></button>
    </div>
    <p className="home-note">这里以后就是你的房间。AI 房间和你的空间分开。</p>
  </div>
}

function Room(props: {
  person: Person, setPerson: (p: Person) => void, chatOpen: boolean, setChatOpen: (v: boolean) => void,
  draft: string, setDraft: (v: string) => void, messages: Record<Person,string[]>, send: () => void,
  activeTool: Tool | '', setActiveTool: (v: Tool | '') => void,
  memory: Record<Person,string>, setMemory: React.Dispatch<React.SetStateAction<Record<Person,string>>>,
  prompt: Record<Person,string>, setPrompt: React.Dispatch<React.SetStateAction<Record<Person,string>>>,
  characters: Record<Person,CharacterCard>, setCharacters: React.Dispatch<React.SetStateAction<Record<Person,CharacterCard>>>,
  worldbook: Record<Person,string>, setWorldbook: React.Dispatch<React.SetStateAction<Record<Person,string>>>,
  worldEntries: Record<Person,WorldEntry[]>, setWorldEntries: React.Dispatch<React.SetStateAction<Record<Person,WorldEntry[]>>>,
  tasks: Record<Person,string[]>, addTask: () => void
}) {
  if (props.chatOpen) return <Chat {...props} />
  return <div className="room-screen">
    <header className="room-header"><div className="room-name"><span>{props.person === '晏未晞' ? '晏' : '言'}</span><div><b>{props.person} 的房间</b><small>独立工作区</small></div><div className="room-person-switch" aria-label="切换房间">{(['晏未晞','言朔'] as Person[]).map(name=><button key={name} type="button" className={props.person===name?'selected':''} aria-pressed={props.person===name} onClick={()=>{props.setPerson(name);props.setActiveTool('')}}>{name==='晏未晞'?'晏':'言'}<small>{name}</small></button>)}</div></div></header>
    <button className="chat-entry" onClick={() => props.setChatOpen(true)}><b>聊天窗口</b><span>点击进入 {props.person} 的全屏聊天</span><em>→</em></button>
    <div className="workspace-title">工作区</div>
    <div className="tool-grid">{tools.map(t => <button key={t} onClick={() => props.setActiveTool(t)}><b>{t}</b><span>{toolHint(t)}</span></button>)}</div>
    {props.activeTool && <ToolPanel {...props} />}
  </div>
}

function toolHint(t: Tool) {
  return ({'人物设置':'角色卡、头像、开场白与语言','世界书':'世界观与关键词','长期记忆':'值得长期留下的事','定时任务':'稍后提醒与主动消息','MCP':'外部工具连接','模型设置':'接口与模型'} as Record<Tool,string>)[t]
}

function ToolPanel(p: any) {
  const t=p.activeTool as Tool
  if (t === '人物设置') return <CharacterSettings key={p.person} value={p.characters[p.person]} onSave={(v:CharacterCard)=>p.setCharacters((x:Record<Person,CharacterCard>)=>({...x,[p.person]:v}))}/>
  if (t === '世界书') return <WorldbookEditor entries={p.worldEntries[p.person]} onChange={(v:WorldEntry[])=>p.setWorldEntries((x:Record<Person,WorldEntry[]>)=>({...x,[p.person]:v}))}/>
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
