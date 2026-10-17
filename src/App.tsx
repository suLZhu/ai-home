import { useEffect, useState, useRef, type FormEvent } from 'react'
import './App.css'
import { CharacterSettings, blankCard, type CharacterCard } from './CharacterSettings'
import { WorldbookEditor, type WorldEntry } from './WorldbookEditor'

type Page = 'home' | 'room' | 'me' | 'fun' | 'settings'
type Person = '晏未晞' | '言朔'
type Tool = '人物设置' | '世界书' | '长期记忆' | '定时任务' | 'MCP' | '模型设置'
type MessageAttachment = { name: string; type: string; size: number; preview?: string; dataUrl?: string; textContent?: string }
type ChatMessage = { role: 'user' | 'assistant'; content: string; attachments?: MessageAttachment[] }
type ModelConfig = { endpoint: string; model: string }
function readMessages(): Record<Person,ChatMessage[]> {
  const old = read<any>('ai-home.messages', { '晏未晞': [], '言朔': [] })
  const migrate = (xs:any[]):ChatMessage[] => xs.map(x => typeof x === 'string' ? {role:'user',content:x} : x).filter(x => x && (x.role === 'user' || x.role === 'assistant') && typeof x.content === 'string').map(x=>({...x,attachments:(x.attachments||[]).map((a:any)=>({name:a.name,type:a.type,size:a.size}))}))
  return {'晏未晞':migrate(old['晏未晞']||[]),'言朔':migrate(old['言朔']||[])}
}

const tools: Tool[] = ['人物设置', '世界书', '长期记忆', '定时任务', 'MCP', '模型设置']

function read<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || '') as T } catch { return fallback }
}

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [person, setPerson] = useState<Person>('晏未晞')
  const [chatOpen, setChatOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<Record<Person, ChatMessage[]>>(readMessages)
  const [modelConfig, setModelConfig] = useState<ModelConfig>(() => read('ai-home.modelConfig', { endpoint: '', model: '' }))
  const [apiKey, setApiKey] = useState('')
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState('')
  const [memory, setMemory] = useState<Record<Person, string>>(() => read('ai-home.memory', { '晏未晞': '', '言朔': '' }))
  const [prompt, setPrompt] = useState<Record<Person, string>>(() => read('ai-home.prompt', { '晏未晞': '', '言朔': '' }))
  const [characters, setCharacters] = useState<Record<Person,CharacterCard>>(() => read('ai-home.characters', { '晏未晞': blankCard('晏未晞'), '言朔': blankCard('言朔') }))
  const [worldEntries, setWorldEntries] = useState<Record<Person, WorldEntry[]>>(() => read('ai-home.worldEntries', { '晏未晞': [], '言朔': [] }))
  const [worldbook, setWorldbook] = useState<Record<Person, string>>(() => read('ai-home.worldbook', { '晏未晞': '', '言朔': '' }))
  const [tasks, setTasks] = useState<Record<Person, string[]>>(() => read('ai-home.tasks', { '晏未晞': [], '言朔': [] }))
  const [activeTool, setActiveTool] = useState<Tool | ''>('')
  const [time, setTime] = useState('')
  const [authStatus, setAuthStatus] = useState<'checking'|'signedOut'|'signedIn'>('checking')
  const [loginPassword, setLoginPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [cloudReady, setCloudReady] = useState(false)
  const [cloudStatus, setCloudStatus] = useState<'loading'|'saving'|'saved'|'error'>('loading')

  function getSnapshot() {
    return { version: 1, messages, modelConfig, memory, prompt, characters, worldEntries, worldbook, tasks }
  }
  function applySnapshot(data: any) {
    if (data.messages && typeof data.messages === 'object') setMessages({
      '晏未晞': Array.isArray(data.messages['晏未晞']) ? data.messages['晏未晞'] : [],
      '言朔': Array.isArray(data.messages['言朔']) ? data.messages['言朔'] : []
    })
    if (data.modelConfig && typeof data.modelConfig === 'object') setModelConfig(data.modelConfig)
    if (data.memory && typeof data.memory === 'object') setMemory({'晏未晞': data.memory['晏未晞'] || '', '言朔': data.memory['言朔'] || ''})
    if (data.prompt && typeof data.prompt === 'object') setPrompt({'晏未晞': data.prompt['晏未晞'] || '', '言朔': data.prompt['言朔'] || ''})
    if (data.characters && typeof data.characters === 'object') setCharacters(data.characters)
    if (data.worldEntries && typeof data.worldEntries === 'object') setWorldEntries({'晏未晞': data.worldEntries['晏未晞'] || [], '言朔': data.worldEntries['言朔'] || []})
    if (data.worldbook && typeof data.worldbook === 'object') setWorldbook({'晏未晞': data.worldbook['晏未晞'] || '', '言朔': data.worldbook['言朔'] || ''})
    if (data.tasks && typeof data.tasks === 'object') setTasks({'晏未晞': data.tasks['晏未晞'] || [], '言朔': data.tasks['言朔'] || []})
  }
  async function loadCloudState() {
    const response = await fetch('/api/state', { credentials: 'same-origin' })
    if (!response.ok) throw new Error(response.status === 401 ? '登录已过期，请重新登录。' : '读取云端数据失败：HTTP ' + response.status)
    const result = await response.json()
    if (result.state) applySnapshot(result.state)
    else {
      const saved = await fetch('/api/state', { method: 'PUT', credentials: 'same-origin', headers: {'Content-Type':'application/json'}, body: JSON.stringify({state:getSnapshot()}) })
      if (!saved.ok) throw new Error('首次迁移本机数据到云端失败：HTTP ' + saved.status)
    }
    setCloudReady(true)
    setCloudStatus('saved')
  }
  async function login(e: FormEvent) {
    e.preventDefault()
    setAuthError('')
    try {
      const response = await fetch('/api/login', { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:loginPassword}) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '登录失败')
      await loadCloudState()
      setLoginPassword('')
      setAuthStatus('signedIn')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error))
    }
  }
  async function logout() {
    await fetch('/api/logout', {method:'POST',credentials:'same-origin'}).catch(()=>{})
    setCloudReady(false)
    setAuthStatus('signedOut')
    setCloudStatus('loading')
  }

  useEffect(() => {
    let cancelled = false
    fetch('/api/session', {credentials:'same-origin'}).then(r=>r.json()).then(async result=>{
      if(cancelled)return
      if(!result.authenticated){setAuthStatus('signedOut');return}
      try { await loadCloudState(); if(!cancelled)setAuthStatus('signedIn') }
      catch(error){ if(!cancelled){setAuthError(error instanceof Error?error.message:String(error));setAuthStatus('signedOut')} }
    }).catch(()=>{if(!cancelled){setAuthError('无法连接云端数据服务，请稍后重试。');setAuthStatus('signedOut')}})
    return ()=>{cancelled=true}
  }, [])

  useEffect(() => {
    if (!cloudReady || authStatus !== 'signedIn') return
    setCloudStatus('saving')
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/state', {method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:getSnapshot()})})
        if (response.status === 401) { setCloudReady(false); setAuthStatus('signedOut'); setAuthError('登录已过期，请重新登录。'); return }
        if (!response.ok) throw new Error('HTTP '+response.status)
        setCloudStatus('saved')
      } catch { setCloudStatus('error') }
    }, 700)
    return ()=>window.clearTimeout(timer)
  }, [cloudReady, authStatus, messages, modelConfig, memory, prompt, characters, worldEntries, worldbook, tasks])

  useEffect(() => {
    const update = () => setTime(new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()))
    update()
    const timer = window.setInterval(update, 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => { try { localStorage.setItem('ai-home.messages', JSON.stringify(Object.fromEntries(Object.entries(messages).map(([k,v])=>[k,(v as ChatMessage[]).map(m=>({...m,attachments:m.attachments?.map(a=>({name:a.name,type:a.type,size:a.size}))}))])))) } catch { /* avoid crashing chat if local storage is full */ } }, [messages])
  useEffect(() => localStorage.setItem('ai-home.modelConfig', JSON.stringify(modelConfig)), [modelConfig])
  useEffect(() => localStorage.setItem('ai-home.memory', JSON.stringify(memory)), [memory])
  useEffect(() => localStorage.setItem('ai-home.prompt', JSON.stringify(prompt)), [prompt])
  useEffect(() => localStorage.setItem('ai-home.characters', JSON.stringify(characters)), [characters])
  useEffect(() => localStorage.setItem('ai-home.worldbook', JSON.stringify(worldbook)), [worldbook])
  useEffect(() => localStorage.setItem('ai-home.worldEntries', JSON.stringify(worldEntries)), [worldEntries])
  useEffect(() => localStorage.setItem('ai-home.tasks', JSON.stringify(tasks)), [tasks])

  function openPerson(p: Person) { setPerson(p); setPage('room'); setChatOpen(true); setActiveTool('') }
  async function send(textInput: string, attachments: MessageAttachment[] = []) {
    const text = textInput.trim()
    if ((!text && !attachments.length) || sending) return
    if (!modelConfig.endpoint.trim() || !modelConfig.model.trim() || !apiKey.trim()) {
      setChatError('请先在房间工作区 → 模型设置中填写 API 地址、模型名称和 API Key（Key 只保存在当前会话内）。')
      return
    }
    const target = person
    const history = messages[target]
    const card = characters[target]
    const matched = worldEntries[target].filter(e => e.enabled && (e.always || e.keywords.split(/[,，、\n]/).map(k=>k.trim()).filter(Boolean).some(k=>text.includes(k))))
    const system = [
      '【当前扮演角色】你是 '+(card.name||target)+'。请始终保持该角色身份。',
      card.description && '【角色描述】\n'+card.description,
      card.definition && '【角色设定】\n'+card.definition,
      card.language && '【语言与表达要求】\n'+card.language,
      prompt[target] && '【补充人物提示】\n'+prompt[target],
      memory[target] && '【长期记忆】\n'+memory[target],
      worldbook[target] && '【世界书补充】\n'+worldbook[target],
      matched.length && '【本轮召回的世界书】\n'+matched.map(e=>'['+e.title+']\n'+e.content).join('\n\n')
    ].filter(Boolean).join('\n\n')
    const attachmentLabel = attachments.length ? '\n[附件：'+attachments.map(a=>a.name).join('、')+']' : ''
    const userMessage: ChatMessage = {role:'user',content:text,attachments:attachments.map(a=>({...a,preview:a.preview||a.dataUrl,dataUrl:undefined}))}
    setMessages(prev=>({...prev,[target]:[...prev[target],userMessage,{role:'assistant',content:''}]}))
    setDraft('');setChatError('');setSending(true)
    try {
      const base=modelConfig.endpoint.trim().replace(/\/+$/,'')
      const url=/\/chat\/completions$/.test(base)?base:base.endsWith('/v1')?base+'/chat/completions':base+'/v1/chat/completions'
      const previous=history.slice(-24).map(m=>({role:m.role,content:m.content+(m.attachments?.length?'\n[此前附件：'+m.attachments.map(a=>a.name).join('、')+']':'')}))
      const content:any[]=[{type:'text',text:text+(attachments.filter(a=>a.textContent).map(a=>'\n\n【文件 '+a.name+' 内容】\n'+a.textContent).join(''))+(attachments.filter(a=>!a.dataUrl&&!a.textContent).map(a=>'\n[附带文件：'+a.name+'；当前未提取该文件内容]').join(''))}]
      for(const a of attachments.filter(a=>a.dataUrl&&a.type.startsWith('image/'))) content.push({type:'image_url',image_url:{url:a.dataUrl}})
      const currentContent=content.some(c=>c.type==='image_url')||attachments.some(a=>a.textContent)?content:text+(attachmentLabel)
      const bodyMessages=[...(system?[{role:'system',content:system}]:[]),...previous,{role:'user',content:currentContent}]
      const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey.trim()},body:JSON.stringify({model:modelConfig.model.trim(),messages:bodyMessages,stream:true})})
      if(!response.ok) throw new Error('接口返回 HTTP '+response.status+'：'+(await response.text()).slice(0,300))
      if(!response.body) throw new Error('当前浏览器未提供流式响应读取能力')
      const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';let answer=''
      while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split(/\r?\n/);buffer=lines.pop()||'';for(const line of lines){if(!line.startsWith('data:'))continue;const data=line.slice(5).trim();if(!data||data==='[DONE]')continue;try{const chunk=JSON.parse(data);const piece=chunk.choices?.[0]?.delta?.content;if(typeof piece==='string'&&piece){answer+=piece;setMessages(prev=>({...prev,[target]:prev[target].map((m,i)=>i===prev[target].length-1?{role:'assistant',content:answer}:m)}))}}catch{}}}
      if(!answer) setMessages(prev=>({...prev,[target]:prev[target].map((m,i)=>i===prev[target].length-1?{role:'assistant',content:'（接口已响应，但没有收到文本内容。请检查模型名称或接口的流式兼容性。）'}:m)}))
    } catch(err) {
      const msg=err instanceof Error?err.message:String(err)
      setChatError(msg.includes('Failed to fetch')?'连接失败：可能是 API 地址不可达或浏览器跨域（CORS）限制。若中转站不允许网页跨域，需要在云服务器增加安全的后端代理。':msg)
      setMessages(prev=>({...prev,[target]:prev[target].map((m,i)=>i===prev[target].length-1&&m.role==='assistant'?{role:'assistant',content:'请求失败，请查看上方错误提示并检查模型设置。'}:m)}))
    } finally {setSending(false)}
  }

  function addTask() {
    const text = draft.trim()
    if (!text) return
    setTasks(prev => ({ ...prev, [person]: [...prev[person], text] }))
    setDraft('')
  }

  if (authStatus !== 'signedIn') return <LoginScreen status={authStatus} password={loginPassword} setPassword={setLoginPassword} error={authError} onSubmit={login}/>

  return <main className="shell">
    <section className="screen">
      {page === 'home' && <Home onPerson={openPerson} onMe={() => setPage('me')} time={time} />}
      {page === 'room' && <Room person={person} setPerson={setPerson} chatOpen={chatOpen} setChatOpen={setChatOpen}
        draft={draft} setDraft={setDraft} messages={messages} send={send}
        activeTool={activeTool} setActiveTool={setActiveTool} memory={memory} setMemory={setMemory}
        prompt={prompt} setPrompt={setPrompt} characters={characters} setCharacters={setCharacters} worldbook={worldbook} setWorldbook={setWorldbook} worldEntries={worldEntries} setWorldEntries={setWorldEntries}
        modelConfig={modelConfig} setModelConfig={setModelConfig} apiKey={apiKey} setApiKey={setApiKey}
        sending={sending} chatError={chatError} setChatError={setChatError}
        tasks={tasks} addTask={addTask} />}
      {page === 'me' && <MyRoom />}
      {page === 'fun' && <Fun />}
      {page === 'settings' && <Settings />}
    </section>
    <div className={'cloud-status '+cloudStatus}><span>{cloudStatus==='saving'?'云端保存中…':cloudStatus==='saved'?'云端已保存':cloudStatus==='error'?'云端保存失败':'连接云端…'}</span><button onClick={logout}>退出</button></div>
    {!chatOpen && <nav className="bottom-nav">
      {(['home','room','fun','settings'] as Page[]).map((p, i) => <button key={p} className={page === p ? 'active' : ''} onClick={() => { setPage(p); setActiveTool('') }}>{['主页','房间','娱乐房','设置'][i]}</button>)}
    </nav>}
  </main>
}

function LoginScreen({status,password,setPassword,error,onSubmit}:{status:'checking'|'signedOut'|'signedIn',password:string,setPassword:(v:string)=>void,error:string,onSubmit:(e:FormEvent)=>void}) {
  return <main className="login-shell"><form className="login-card" onSubmit={onSubmit}>
    <div className="login-mark">居</div><p className="login-eyebrow">A SMALL PRIVATE SPACE</p><h1>回到自己的房间</h1>
    <p className="login-copy">登录后，聊天记录、人物设置、世界书和长期记忆会保存到你的云服务器。</p>
    {status==='checking'?<p className="login-copy">正在检查登录状态……</p>:<>
      <label>房间密码<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" placeholder="输入房间密码" autoFocus/></label>
      {error&&<p className="login-error">{error}</p>}
      <button className="login-submit" type="submit" disabled={!password}>进入房间</button>
      <small>这是私人预览版。请勿把房间密码分享给别人。</small>
    </>}
  </form></main>
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
  draft: string, setDraft: (v: string) => void, messages: Record<Person,ChatMessage[]>, send: (textInput: string, attachments?: MessageAttachment[]) => void,
  activeTool: Tool | '', setActiveTool: (v: Tool | '') => void,
  memory: Record<Person,string>, setMemory: React.Dispatch<React.SetStateAction<Record<Person,string>>>,
  prompt: Record<Person,string>, setPrompt: React.Dispatch<React.SetStateAction<Record<Person,string>>>,
  characters: Record<Person,CharacterCard>, setCharacters: React.Dispatch<React.SetStateAction<Record<Person,CharacterCard>>>,
  worldbook: Record<Person,string>, setWorldbook: React.Dispatch<React.SetStateAction<Record<Person,string>>>,
  worldEntries: Record<Person,WorldEntry[]>, setWorldEntries: React.Dispatch<React.SetStateAction<Record<Person,WorldEntry[]>>>,
  tasks: Record<Person,string[]>, addTask: () => void,
  modelConfig: ModelConfig, setModelConfig: React.Dispatch<React.SetStateAction<ModelConfig>>, apiKey: string, setApiKey: (v:string)=>void,
  sending: boolean, chatError: string, setChatError: (v:string)=>void
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
  if (t === '模型设置') return <ModelSettings value={p.modelConfig} onChange={p.setModelConfig} apiKey={p.apiKey} setApiKey={p.setApiKey}/>
  if (t === '长期记忆') return <Editor title="长期记忆" value={p.memory[p.person]} onChange={(v:string)=>p.setMemory((x:any)=>({...x,[p.person]:v}))} placeholder="这里先作为第一版本地记忆入口。" />
  if (t === '定时任务') return <div className="tool-panel"><h3>定时任务</h3><form onSubmit={(e)=>{e.preventDefault();p.addTask()}}><input value={p.draft} onChange={(e)=>p.setDraft(e.target.value)} placeholder="例如：晚上 23:00 提醒我休息"/><button>加入</button></form>{p.tasks[p.person].map((x:string,i:number)=><p className="task-line" key={i}>{x}</p>)}<small>第一版只保存任务，不执行调度。</small></div>
  return <div className="tool-panel"><h3>{t}</h3><p className="muted">{t === 'MCP' ? '预留工具连接层，后续接入 MCP 客户端。' : '预留模型适配层，后续接入 OpenAI 兼容接口、聚合站或本地模型。'}</p></div>
}

function Editor({title,value,onChange,placeholder}:{title:string,value:string,onChange:(v:string)=>void,placeholder:string}) {
  return <div className="tool-panel"><h3>{title}</h3><textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/><small>自动保存在本机浏览器。</small></div>
}

function ModelSettings({value,onChange,apiKey,setApiKey}:{value:ModelConfig,onChange:(v:ModelConfig)=>void,apiKey:string,setApiKey:(v:string)=>void}) {
 return <div className="tool-panel"><h3>模型连接</h3><p className="muted">支持 OpenAI 兼容接口，例如 One API / New API。API Key 只保存在当前页面内存，不写入浏览器存储；刷新后需要重新填写。</p><label className="model-field">API 地址<input value={value.endpoint} onChange={e=>onChange({...value,endpoint:e.target.value})} placeholder="https://你的中转站/v1"/></label><label className="model-field">模型名称<input value={value.model} onChange={e=>onChange({...value,model:e.target.value})} placeholder="例如 gpt-4o-mini"/></label><label className="model-field">API Key（本次打开有效）<input type="password" autoComplete="off" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="sk-…"/></label><small>地址与模型名自动保存在此浏览器。当前为浏览器直连；若接口不支持 CORS，需加云端代理，不能靠前端绕过。</small></div>
}

function Chat(p: any) {
  const [files,setFiles]=useState<MessageAttachment[]>([])
  const [emojiOpen,setEmojiOpen]=useState(false)
  const [lightbox,setLightbox]=useState<{src:string;name:string}|null>(null)
  const imageInput=useRef<HTMLInputElement>(null)
  const fileInput=useRef<HTMLInputElement>(null)
  async function loadFiles(list: FileList | null, imagesOnly=false) {
    if(!list)return
    const selected=Array.from(list).slice(0,8)
    const loaded:MessageAttachment[]=[]
    for(const file of selected){
      if(imagesOnly&&!file.type.startsWith('image/'))continue
      if(file.size>12*1024*1024){p.setChatError('单个文件不能超过 12 MB：'+file.name);continue}
      const item:MessageAttachment={name:file.name,type:file.type||'application/octet-stream',size:file.size}
      if(file.type.startsWith('image/')){
        item.dataUrl=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('图片读取失败'));r.readAsDataURL(file)})
        item.preview=URL.createObjectURL(file)
      } else if(/\.(txt|md|json|csv|log)$/i.test(file.name)&&file.size<500*1024){
        item.textContent=await file.text()
      }
      loaded.push(item)
    }
    setFiles(prev=>[...prev,...loaded].slice(0,8))
    if(imageInput.current)imageInput.current.value=''
    if(fileInput.current)fileInput.current.value=''
  }
  function submit(e:FormEvent){e.preventDefault();if(p.sending)return;if(!p.draft.trim()&&!files.length)return;const payload=files.map(({preview,...a}:MessageAttachment)=>a);p.send(p.draft,payload);setFiles([]);setEmojiOpen(false)}
  function downloadText(a:MessageAttachment){if(!a.textContent)return;const blob=new Blob([a.textContent],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=a.name+'.txt';link.click();URL.revokeObjectURL(url)}
  const stickers=['😊','🥺','😂','🥰','😭','😤','❤️','🤔','✨','😘','👍','🎉','🌷','💜','🫂','🐱']
  return <div className="fullscreen-chat">
    <header className="chat-header"><button onClick={()=>p.setChatOpen(false)}>← 房间</button><b>{p.person}</b><button onClick={()=>{p.setPerson(p.person === '晏未晞' ? '言朔' : '晏未晞');p.setChatError('')}}>切换</button></header>
    {p.chatError&&<div className="chat-error"><span>{p.chatError}</span><button onClick={()=>p.setChatError('')}>×</button></div>}
    <div className="chat-body">{p.messages[p.person].length ? p.messages[p.person].map((m:ChatMessage,i:number)=><div className={'message-row '+m.role} key={i}><div className={'bubble '+m.role}>{m.content|| (p.sending&&i===p.messages[p.person].length-1?'正在思考……':'')}{m.attachments?.map((a:MessageAttachment,j:number)=><div className="sent-attachment" key={j}>{a.type.startsWith('image/')?<div className="sent-image-placeholder">{a.preview?<button type="button" className="image-open-button" title="点击放大图片" onClick={()=>setLightbox({src:a.preview!,name:a.name})}><img src={a.preview} alt={a.name}/></button>:<>🖼 {a.name}</>}</div>:<div className="sent-file"><span>▤</span><div><b>{a.name}</b><small>{formatSize(a.size)}</small>{a.textContent&&<button type="button" className="download-text" onClick={()=>downloadText(a)}>下载文本副本</button>}</div></div>}</div>)}</div></div>) : <div className="empty-chat">这里是 {p.person} 的独立房间。<br/>配置模型后，就可以在这里聊天啦。</div>}</div>
    {files.length>0&&<div className="attachment-tray">{files.map((a,i)=><div className="attachment-chip" key={i}>{a.type.startsWith('image/')?<img src={a.preview||a.dataUrl} alt={a.name}/>:<span className="file-chip-icon">▤</span>}<span title={a.name}>{a.name}</span><button type="button" aria-label="移除附件" onClick={()=>setFiles(prev=>prev.filter((_,j)=>j!==i))}>×</button></div>)}</div>}
    {emojiOpen&&<div className="emoji-panel" aria-label="表情包选择">{stickers.map((emoji,i)=><button type="button" key={i} onClick={()=>{p.setDraft(p.draft+emoji);setEmojiOpen(false)}}>{emoji}</button>)}</div>}
    <form className="compose compose-wechat" onSubmit={submit}>
      <input value={p.draft} onChange={e=>p.setDraft(e.target.value)} placeholder="写点什么……" aria-label="聊天消息"/>
      <button className="send-button" disabled={p.sending||(!p.draft.trim()&&!files.length)}>{p.sending?'生成中…':'发送'}</button>
      <div className="compose-tools">
        <button type="button" title="表情与贴纸" aria-label="表情与贴纸" className={emojiOpen?'tool-active':''} onClick={()=>setEmojiOpen(v=>!v)}>☺</button>
        <button type="button" title="发送图片" aria-label="发送图片" onClick={()=>imageInput.current?.click()}>▧</button>
        <button type="button" title="发送文件" aria-label="发送文件" onClick={()=>fileInput.current?.click()}>＋</button>
        <span className="tool-hint">表情 · 图片 · 文件</span>
        <input ref={imageInput} className="hidden-file-input" type="file" accept="image/*" multiple onChange={e=>loadFiles(e.target.files,true)}/>
        <input ref={fileInput} className="hidden-file-input" type="file" multiple onChange={e=>loadFiles(e.target.files)}/>
      </div>
    </form>
    <small className="attachment-note">图片可点击放大；TXT、MD、JSON、CSV、LOG 可读取文本并下载读取出的文本副本。其他文件的原文件下载与云端上传后续接入。</small>
    {lightbox&&<div className="image-lightbox" role="dialog" aria-modal="true" aria-label={lightbox.name} onClick={()=>setLightbox(null)}><button type="button" className="lightbox-close" aria-label="关闭图片预览" onClick={()=>setLightbox(null)}>×</button><img src={lightbox.src} alt={lightbox.name} onClick={e=>e.stopPropagation()}/><div>{lightbox.name}</div></div>}
  </div>
}
function formatSize(size:number){return size<1024?size+' B':size<1024*1024?(size/1024).toFixed(1)+' KB':(size/1024/1024).toFixed(1)+' MB'}

function Fun() { return <div className="fun-screen"><h2>娱乐房</h2><p>以后这里放内嵌浏览器、可视化网页、相册、播放器，以及客厅。</p><div className="fun-grid">{['内嵌浏览器','可视化网页','相册','播放器','客厅'].map(x=><button key={x}><b>{x}</b><span>功能预留</span></button>)}</div></div> }
function Settings() { return <div className="settings-screen"><h2>设置</h2><p>全局主题先保持书页感。模型、记忆、MCP 等能力逐步接入。</p><div className="setting-card"><b>当前主题</b><span>暖米白 · 书页</span></div><div className="setting-card"><b>数据</b><span>第一版使用浏览器本地存储，不碰 Kelivo 数据。</span></div></div> }
