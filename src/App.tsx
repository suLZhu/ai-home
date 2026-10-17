import { useCallback, useEffect, useState, useRef, type FormEvent } from 'react'
import './App.css'
import { CharacterSettings, blankCard, type CharacterCard } from './CharacterSettings'
import { WorldbookEditor, type WorldEntry } from './WorldbookEditor'

type Page = 'home' | 'room' | 'me' | 'fun' | 'settings'
type Person = '晏未晞' | '言朔'
type Tool = '人物设置' | '世界书' | '长期记忆' | '定时任务' | 'MCP' | '模型设置'
type MessageAttachment = { name: string; type: string; size: number; preview?: string; dataUrl?: string; textContent?: string }
type ChatMessage = { role: 'user' | 'assistant'; content: string; attachments?: MessageAttachment[] }
type ModelConfig = { endpoint: string; model: string }
type MCPConnection = { id: string; person: Person; name: string; url: string; transport: string; enabled: boolean; hasToken?: boolean }
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
  const [mcpConnections, setMcpConnections] = useState<Record<Person, MCPConnection[]>>(() => read('ai-home.mcpConnections', { '晏未晞': [], '言朔': [] }))
  const [tasks, setTasks] = useState<Record<Person, string[]>>(() => read('ai-home.tasks', { '晏未晞': [], '言朔': [] }))
  const [activeTool, setActiveTool] = useState<Tool | ''>('')
  const [time, setTime] = useState('')
  const [authStatus, setAuthStatus] = useState<'checking'|'signedOut'|'signedIn'>('checking')
  const [loginPassword, setLoginPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [cloudReady, setCloudReady] = useState(false)
  const [cloudStatus, setCloudStatus] = useState<'loading'|'saving'|'saved'|'error'>('loading')

  const getSnapshot = useCallback(() => ({ version: 1, messages, modelConfig, memory, prompt, characters, worldEntries, worldbook, mcpConnections, tasks }), [messages, modelConfig, memory, prompt, characters, worldEntries, worldbook, mcpConnections, tasks])
  const applySnapshot = useCallback((data: any) => {
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
    if (data.mcpConnections && typeof data.mcpConnections === 'object') setMcpConnections({'晏未晞': Array.isArray(data.mcpConnections['晏未晞']) ? data.mcpConnections['晏未晞'].map((x:MCPConnection)=>({...x,person:'晏未晞'})) : [], '言朔': Array.isArray(data.mcpConnections['言朔']) ? data.mcpConnections['言朔'].map((x:MCPConnection)=>({...x,person:'言朔'})) : []})
    if (data.tasks && typeof data.tasks === 'object') setTasks({'晏未晞': data.tasks['晏未晞'] || [], '言朔': data.tasks['言朔'] || []})
  }, [])
  const loadCloudState = useCallback(async () => {
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
  }, [applySnapshot, getSnapshot])
  const login = useCallback(async (e: FormEvent) => {
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
  }, [loginPassword, loadCloudState])
  const logout = useCallback(async () => {
    await fetch('/api/logout', {method:'POST',credentials:'same-origin'}).catch(()=>{})
    setCloudReady(false)
    setAuthStatus('signedOut')
    setCloudStatus('loading')
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/session', {credentials:'same-origin'}).then(r=>r.json()).then(async result=>{
      if(cancelled)return
      if(!result.authenticated){setAuthStatus('signedOut');return}
      try { await loadCloudState(); if(!cancelled)setAuthStatus('signedIn') }
      catch(error){ if(!cancelled){setAuthError(error instanceof Error?error.message:String(error));setAuthStatus('signedOut')} }
    }).catch(()=>{if(!cancelled){setAuthError('无法连接云端数据服务，请稍后重试。');setAuthStatus('signedOut')}})
    return ()=>{cancelled=true}
  }, [loadCloudState])

  useEffect(() => {
    if (!cloudReady || authStatus !== 'signedIn') return
    const timer = window.setTimeout(async () => {
      setCloudStatus('saving')
      try {
        const response = await fetch('/api/state', {method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:getSnapshot()})})
        if (response.status === 401) { setCloudReady(false); setAuthStatus('signedOut'); setAuthError('登录已过期，请重新登录。'); return }
        if (!response.ok) throw new Error('HTTP '+response.status)
        setCloudStatus('saved')
      } catch { setCloudStatus('error') }
    }, 700)
    return ()=>window.clearTimeout(timer)
  }, [cloudReady, authStatus, getSnapshot, messages, modelConfig, memory, prompt, characters, worldEntries, worldbook, mcpConnections, tasks])

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
  useEffect(() => localStorage.setItem('ai-home.mcpConnections', JSON.stringify(mcpConnections)), [mcpConnections])
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
      const requestMessages:any[]=[...(system?[{role:'system',content:system}]:[]),...previous,{role:'user',content:currentContent}]
      // Load tools only from the active character's server-side MCP bindings.
      const toolRoutes=new Map<string,{id:string;person:Person;name:string}>()
      const openAITools:any[]=[]
      try {
        const listResponse=await fetch('/api/mcp?person='+encodeURIComponent(target),{credentials:'same-origin'})
        if(listResponse.ok){
          const listData=await listResponse.json()
          for(const connection of (listData.connections||[]).filter((c:any)=>c.enabled)){
            try {
              const toolResponse=await fetch('/api/mcp/'+connection.id+'/tools',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({person:target})})
              if(!toolResponse.ok) continue
              const toolData=await toolResponse.json()
              for(const tool of (toolData.tools||[])){
                const safeName=('mcp_'+connection.id.replace(/-/g,'').slice(0,8)+'_'+tool.name).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,64)
                if(toolRoutes.has(safeName)) continue
                toolRoutes.set(safeName,{id:connection.id,person:target,name:tool.name})
                openAITools.push({type:'function',function:{name:safeName,description:('MCP 服务：'+connection.name+'；工具：'+tool.name+'。'+(tool.description||'')).slice(0,1000),parameters:tool.inputSchema&&tool.inputSchema.type==='object'?tool.inputSchema:{type:'object',properties:{},additionalProperties:true}}})
              }
            } catch { /* An unavailable MCP must not prevent ordinary chat. */ }
          }
        }
      } catch { /* MCP is optional; continue with normal model chat. */ }
      let answer=''
      let finished=false
      for(let round=0;round<5&&!finished;round++){
        const requestBody:any={model:modelConfig.model.trim(),messages:requestMessages,stream:true}
        if(openAITools.length){requestBody.tools=openAITools;requestBody.tool_choice='auto'}
        const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey.trim()},body:JSON.stringify(requestBody)})
        if(!response.ok) throw new Error('接口返回 HTTP '+response.status+'：'+(await response.text()).slice(0,300))
        if(!response.body) throw new Error('当前浏览器未提供流式响应读取能力')
        const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';let roundText='';const calls:Record<number,{id:string;type:string;function:{name:string;arguments:string}}>={}
        while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split(/\r?\n/);buffer=lines.pop()||'';for(const line of lines){if(!line.startsWith('data:'))continue;const data=line.slice(5).trim();if(!data||data==='[DONE]')continue;try{const chunk=JSON.parse(data);const delta=chunk.choices?.[0]?.delta;const piece=delta?.content;if(typeof piece==='string'&&piece){roundText+=piece;answer+=piece;setMessages(prev=>({...prev,[target]:prev[target].map((m,i)=>i===prev[target].length-1?{role:'assistant',content:answer}:m)}))}for(const call of (delta?.tool_calls||[])){const idx=call.index??0;calls[idx]??={id:'',type:'function',function:{name:'',arguments:''}};if(call.id)calls[idx].id+=call.id;if(call.type)calls[idx].type=call.type;if(call.function?.name)calls[idx].function.name+=call.function.name;if(call.function?.arguments)calls[idx].function.arguments+=call.function.arguments}}catch{}}}
        const toolCalls=Object.keys(calls).map(k=>calls[Number(k)]).filter(c=>c.id&&c.function.name)
        if(!toolCalls.length){finished=true;break}
        requestMessages.push({role:'assistant',content:roundText||null,tool_calls:toolCalls})
        for(const call of toolCalls){
          const route=toolRoutes.get(call.function.name)
          let resultContent=''
          try{
            if(!route||route.person!==target) throw new Error('工具没有绑定到当前人物，已拒绝调用。')
            let args:any={};try{args=JSON.parse(call.function.arguments||'{}')}catch{throw new Error('模型生成的工具参数不是合法 JSON。')}
            if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('工具参数必须是 JSON 对象。')
            setMessages(prev=>({...prev,[target]:prev[target].map((m,i)=>i===prev[target].length-1?{role:'assistant',content:(answer?answer+'\n\n':'')+'正在调用工具：'+route.name+'…'}:m)}))
            const toolResponse=await fetch('/api/mcp/'+route.id+'/call',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({person:target,name:route.name,arguments:args})})
            const toolData=await toolResponse.json();if(!toolResponse.ok)throw new Error(toolData.error||'MCP 工具调用失败')
            resultContent=JSON.stringify(toolData.result)
          }catch(error){resultContent=JSON.stringify({error:error instanceof Error?error.message:String(error)})}
          requestMessages.push({role:'tool',tool_call_id:call.id,content:resultContent.slice(0,30000)})
        }
        if(round===4) throw new Error('工具调用轮数达到安全上限（5 轮），请缩小任务后重试。')
      }
      if(!answer) setMessages(prev=>({...prev,[target]:prev[target].map((m,i)=>i===prev[target].length-1?{role:'assistant',content:'（接口已响应，但没有收到文本内容。请检查模型名称、工具调用兼容性或接口的流式支持。）'}:m)}))
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
        prompt={prompt} setPrompt={setPrompt} characters={characters} setCharacters={setCharacters} worldbook={worldbook} setWorldbook={setWorldbook} worldEntries={worldEntries} setWorldEntries={setWorldEntries} mcpConnections={mcpConnections} setMcpConnections={setMcpConnections}
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
  mcpConnections: Record<Person,MCPConnection[]>, setMcpConnections: React.Dispatch<React.SetStateAction<Record<Person,MCPConnection[]>>>,
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
  if (t === 'MCP') return <MCPSettings person={p.person}/>
  if (t === '模型设置') return <ModelSettings value={p.modelConfig} onChange={p.setModelConfig} apiKey={p.apiKey} setApiKey={p.setApiKey}/>
  if (t === '长期记忆') return <Editor title="长期记忆" value={p.memory[p.person]} onChange={(v:string)=>p.setMemory((x:any)=>({...x,[p.person]:v}))} placeholder="这里先作为第一版本地记忆入口。" />
  if (t === '定时任务') return <div className="tool-panel"><h3>定时任务</h3><form onSubmit={(e)=>{e.preventDefault();p.addTask()}}><input value={p.draft} onChange={(e)=>p.setDraft(e.target.value)} placeholder="例如：晚上 23:00 提醒我休息"/><button>加入</button></form>{p.tasks[p.person].map((x:string,i:number)=><p className="task-line" key={i}>{x}</p>)}<small>第一版只保存任务，不执行调度。</small></div>
  return <div className="tool-panel"><h3>{t}</h3><p className="muted">{t === 'MCP' ? '预留工具连接层，后续接入 MCP 客户端。' : '预留模型适配层，后续接入 OpenAI 兼容接口、聚合站或本地模型。'}</p></div>
}

function MCPSettings({person}:{person:Person}) {
  const [connections,setConnections] = useState<MCPConnection[]>([])
  const [name,setName] = useState('')
  const [url,setUrl] = useState('')
  const [transport,setTransport] = useState('httpStream')
  const [token,setToken] = useState('')
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [tools,setTools] = useState<Record<string,{name:string;description:string;inputSchema:unknown}[]>>({})
  const [expandedTools,setExpandedTools] = useState<Record<string,boolean>>({})
  const [args,setArgs] = useState<Record<string,string>>({})
  const [results,setResults] = useState<Record<string,string>>({})
  async function refresh() {
    const r = await fetch('/api/mcp?person='+encodeURIComponent(person),{credentials:'same-origin'})
    const data = await r.json()
    if(!r.ok) throw new Error(data.error || '读取 MCP 列表失败')
    setConnections(data.connections)
  }
  useEffect(()=>{setConnections([]);setTools({});setExpandedTools({});setResults({});setError('');setNotice('');refresh().catch(e=>setError(e.message))},[person])
  async function add(e:FormEvent) {
    e.preventDefault();setBusy(true);setError('');setNotice('')
    try {
      const r=await fetch('/api/mcp',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({person,name,url,transport,token})})
      const data=await r.json();if(!r.ok)throw new Error(data.error||'保存失败')
      setName('');setUrl('');setToken('');await refresh();setNotice('配置已安全保存，可以尝试连接并读取工具。')
    } catch(e){setError(e instanceof Error?e.message:String(e))} finally{setBusy(false)}
  }
  async function loadTools(c:MCPConnection) {
    setBusy(true);setError('');setNotice('正在连接 '+c.name+'…')
    try {
      const r=await fetch('/api/mcp/'+c.id+'/tools',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({person})})
      const data=await r.json();if(!r.ok)throw new Error(data.error||'连接失败')
      setTools(old=>({...old,[c.id]:data.tools}));setExpandedTools(old=>({...old,[c.id]:false}));setNotice('连接成功：发现 '+data.tools.length+' 个工具，可按需展开。')
    }catch(e){setError(e instanceof Error?e.message:String(e));setNotice('')}finally{setBusy(false)}
  }
  async function remove(c:MCPConnection) {
    if(!window.confirm('移除绑定到'+person+'的 MCP 服务“'+c.name+'”？'))return
    setError('');setNotice('')
    try{const r=await fetch('/api/mcp/'+c.id,{method:'DELETE',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({person})});const data=await r.json();if(!r.ok)throw new Error(data.error||'移除失败');await refresh();setTools(old=>{const n={...old};delete n[c.id];return n});setNotice('已移除该人物的 MCP 绑定。')}catch(e){setError(e instanceof Error?e.message:String(e))}
  }
  async function callTool(c:MCPConnection,t:{name:string;description:string}) {
    const key=c.id+':'+t.name;setError('');setNotice('正在调用 '+t.name+'…')
    let parsed:unknown={};try{parsed=JSON.parse(args[key]||'{}')}catch{setError('参数必须是合法 JSON');setNotice('');return}
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)){setError('工具参数必须是 JSON 对象');setNotice('');return}
    try{const r=await fetch('/api/mcp/'+c.id+'/call',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({person,name:t.name,arguments:parsed})});const data=await r.json();if(!r.ok)throw new Error(data.error||'调用失败');setResults(old=>({...old,[key]:JSON.stringify(data.result,null,2)}));setNotice('工具调用完成：'+t.name)}catch(e){setError(e instanceof Error?e.message:String(e));setNotice('')}
  }
  return <div className="tool-panel mcp-panel"><h3>{person} · MCP 工具</h3><p className="muted">每个服务独立绑定人物。连接凭证只保存在云端后端，并使用 AES-256-GCM 加密；不会返回给浏览器或写进人物世界书。</p><div className="mcp-boundary"><b>当前绑定：{person}</b><span>本页面只会列出绑定给{person}的 MCP。另一人物不能通过本页面调用这些连接。</span></div>
    {error&&<p className="mcp-error">{error}</p>}{notice&&<p className="mcp-notice">{notice}</p>}
    {connections.length===0&&<p className="muted">还没有为{person}绑定 MCP 服务。</p>}
    {connections.map(c=><section className="mcp-connection-card" key={c.id}><div className="mcp-connection"><div className="mcp-connection-info"><b>{c.name}</b><small>{c.url}</small><span>绑定人物：{c.person} · {c.transport==='httpStream'?'Streamable HTTP':'其他'}</span></div><button type="button" className="mcp-action" disabled={busy} onClick={()=>loadTools(c)}>连接 / 获取工具</button><button type="button" className="mcp-remove" onClick={()=>remove(c)}>移除</button></div>
      {(tools[c.id]||[]).length>0&&<button type="button" className="mcp-tools-toggle" aria-expanded={!!expandedTools[c.id]} onClick={()=>setExpandedTools(old=>({...old,[c.id]:!old[c.id]}))}><span>{expandedTools[c.id]?'收起工具列表':'展开工具列表'}</span><span className="mcp-tools-count">{tools[c.id].length} 个工具</span><span className="mcp-tools-chevron">{expandedTools[c.id]?'−':'＋'}</span></button>}
      {expandedTools[c.id]&&(tools[c.id]||[]).map(t=><div className="mcp-tool" key={t.name}><b>{t.name}</b>{t.description&&<p>{t.description}</p>}<label>调用参数（JSON）<textarea value={args[c.id+':'+t.name]??'{}'} onChange={e=>setArgs(old=>({...old,[c.id+':'+t.name]:e.target.value}))} rows={3}/></label><button type="button" className="mcp-action" disabled={busy} onClick={()=>callTool(c,t)}>调用工具</button>{results[c.id+':'+t.name]&&<pre>{results[c.id+':'+t.name]}</pre>}</div>)}
    </section>)}
    <form className="mcp-add-form" onSubmit={add}><h4>添加远程 MCP</h4><label>服务名称<input value={name} onChange={e=>setName(e.target.value)} placeholder="例如：huayuan-小晏" required/></label><label>主机地址<input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://example.com/mcp" type="url" required/></label><label>连接类型<select value={transport} onChange={e=>setTransport(e.target.value)}><option value="httpStream">Streamable HTTP（HTTP 流式）</option></select></label><label>Bearer Token（可选）<input value={token} onChange={e=>setToken(e.target.value)} type="password" autoComplete="new-password" placeholder="在这里粘贴新生成的 Token"/></label><button type="submit" disabled={busy}>{busy?'请稍候…':'安全保存并绑定到'+person}</button></form><small>连接使用 HTTPS；保存后点击“连接 / 获取工具”验证服务。实际工具执行前会再次检查当前人物绑定。只支持 Streamable HTTP，不支持旧式 SSE 或 stdio。</small></div>
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
  function submit(e:FormEvent){e.preventDefault();if(p.sending)return;if(!p.draft.trim()&&!files.length)return;const payload=files.map((a:MessageAttachment)=>({name:a.name,type:a.type,size:a.size,dataUrl:a.dataUrl,textContent:a.textContent}));p.send(p.draft,payload);setFiles([]);setEmojiOpen(false)}
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
