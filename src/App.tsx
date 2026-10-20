import { useCallback, useEffect, useState, useRef, type FormEvent } from 'react'
import './App.css'
import { Ledger } from './Ledger'
import { Diary } from './Diary'
import { ThemeSettings } from './ThemeSettings'
import { DEFAULT_THEME,themeStyle,type ThemePrefs } from './theme'
import { LEGACY_ASSISTANTS, type AssistantRecord } from './assistantIdentity'
import { CharacterSettings, blankCard, type CharacterCard } from './CharacterSettings'
import { WorldbookEditor, type WorldEntry } from './WorldbookEditor'

type Page = 'home' | 'room' | 'me' | 'fun' | 'settings'
type Person = '晏未晞' | '言朔'
type Tool = '人物设置' | '世界书' | '长期记忆' | '定时任务' | 'MCP' | '模型设置'
type MessageAttachment = { name: string; type: string; size: number; preview?: string; dataUrl?: string; textContent?: string }
type TokenUsage = { at?: string; promptTokens?: number; completionTokens?: number; cachedTokens?: number; cacheReadTokens?: number; elapsedMs?: number; tokensPerSecond?: number }
type ChatMessage = { role: 'user' | 'assistant'; content: string; attachments?: MessageAttachment[]; usage?: TokenUsage }
type Conversation = { id:string; title:string; messages:ChatMessage[]; updatedAt:string }
type ModelConfig = { endpoint: string; model: string; inputPrice?: string; outputPrice?: string; cachedInputPrice?: string; usdToCny?: string }
type MCPConnection = { id: string; person: Person; name: string; url: string; transport: string; enabled: boolean; hasToken?: boolean }
type MemoryEntry = { id:string; title:string; content:string; keywords:string; category:'人物关系'|'经历事件'|'偏好习惯'|'项目进度'|'其他'; pinned:boolean; updatedAt:string }
function readMessages(): Record<Person,ChatMessage[]> {
  const old = read<any>('ai-home.messages', { '晏未晞': [], '言朔': [] })
  const migrate = (xs:any[]):ChatMessage[] => xs.map(x => typeof x === 'string' ? {role:'user',content:x} : x).filter(x => x && (x.role === 'user' || x.role === 'assistant') && typeof x.content === 'string').map(x=>({...x,attachments:(x.attachments||[]).map((a:any)=>({name:a.name,type:a.type,size:a.size}))}))
  return {'晏未晞':migrate(old['晏未晞']||[]),'言朔':migrate(old['言朔']||[])}
}

const tools: Tool[] = ['人物设置', '世界书', '长期记忆', '定时任务', 'MCP', '模型设置']

function read<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || '') as T } catch { return fallback }
}
function initialConversations():Record<Person,Conversation[]> {
  const saved=read<any>('ai-home.conversations',null)
  if(saved&&Array.isArray(saved['晏未晞'])&&Array.isArray(saved['言朔'])) return {'晏未晞':saved['晏未晞'],'言朔':saved['言朔']}
  const old=readMessages();const now=new Date().toISOString()
  return {'晏未晞':[{id:'legacy-yanweixi',title:'旧聊天',messages:old['晏未晞'],updatedAt:now}],'言朔':[{id:'legacy-yanshu',title:'旧聊天',messages:old['言朔'],updatedAt:now}]}
}

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [themePrefs,setThemePrefs]=useState<ThemePrefs>(()=>read('ai-home.themePrefs',DEFAULT_THEME))
  const [assistants, setAssistants] = useState<AssistantRecord[]>(() => read('ai-home.assistants', LEGACY_ASSISTANTS.map(a => ({...a, createdAt:'1970-01-01T00:00:00.000Z'}))))
  const displayName = (name: Person) => assistants.find(a => a.id === LEGACY_ASSISTANTS.find(x => x.name === name)?.id)?.name || name
  const [person, setPerson] = useState<Person>('晏未晞')
  const [chatOpen, setChatOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<Record<Person, ChatMessage[]>>(readMessages)
  const [conversations,setConversations] = useState<Record<Person,Conversation[]>>(initialConversations)
  const [activeConversationIds,setActiveConversationIds] = useState<Record<Person,string>>(()=>{const saved=read<Record<Person,string>>('ai-home.activeConversationIds',{'晏未晞':'legacy-yanweixi','言朔':'legacy-yanshu'});const all=initialConversations();return {'晏未晞':all['晏未晞'].some(c=>c.id===saved['晏未晞'])?saved['晏未晞']:all['晏未晞'][0]?.id||'','言朔':all['言朔'].some(c=>c.id===saved['言朔'])?saved['言朔']:all['言朔'][0]?.id||''}})
  const [modelConfig, setModelConfig] = useState<Record<Person,ModelConfig>>(() => { const saved:any=read('ai-home.modelConfig',null); if(saved&&saved['晏未晞']&&saved['言朔']) return {'晏未晞':{inputPrice:'',outputPrice:'',cachedInputPrice:'',usdToCny:'7.2',...saved['晏未晞']},'言朔':{inputPrice:'',outputPrice:'',cachedInputPrice:'',usdToCny:'7.2',...saved['言朔']}}; const legacy=saved&&typeof saved.endpoint==='string'?saved:{endpoint:'',model:''}; return {'晏未晞':{inputPrice:'',outputPrice:'',cachedInputPrice:'',usdToCny:'7.2',...legacy},'言朔':{inputPrice:'',outputPrice:'',cachedInputPrice:'',usdToCny:'7.2',...legacy}} })
  const [apiKey, setApiKey] = useState<Record<Person,string>>({'晏未晞':'','言朔':''})
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState('')
  const [memory, setMemory] = useState<Record<Person, string>>(() => read('ai-home.memory', { '晏未晞': '', '言朔': '' }))
  const [memoryEntries, setMemoryEntries] = useState<Record<Person,MemoryEntry[]>>(() => read('ai-home.memoryEntries', { '晏未晞': [], '言朔': [] }))
  const [prompt, setPrompt] = useState<Record<Person, string>>(() => read('ai-home.prompt', { '晏未晞': '', '言朔': '' }))
  const [characters, setCharacters] = useState<Record<Person,CharacterCard>>(() => read('ai-home.characters', { '晏未晞': blankCard('晏未晞'), '言朔': blankCard('言朔') }))
  const [worldEntries, setWorldEntries] = useState<WorldEntry[]>(() => { const raw:any=read('ai-home.worldEntries', []); if(Array.isArray(raw)) return raw.map((e:any)=>({...e,boundCharacters:Array.isArray(e.boundCharacters)?e.boundCharacters:(e.boundCharacter?[e.boundCharacter]:['晏未晞'])})); return ['晏未晞','言朔'].flatMap((person:any)=>Array.isArray(raw?.[person])?raw[person].map((e:any)=>({...e,boundCharacters:[person]})):[]) })
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
  const cloudSaveInFlight = useRef(false)
  const queuedCloudSnapshot = useRef<any>(null)

  const getSnapshot = useCallback(() => ({ version: 2, themePrefs, assistants, messages, conversations, activeConversationIds, modelConfig, memory, memoryEntries, prompt, characters, worldEntries, worldbook, mcpConnections, tasks }), [themePrefs, assistants, messages, conversations, activeConversationIds, modelConfig, memory, memoryEntries, prompt, characters, worldEntries, worldbook, mcpConnections, tasks])
  // Keep the latest snapshot available without making the one-time cloud-load callback
  // change identity on every edit. Otherwise the session-check effect reloads stale cloud
  // state after every local change and can resurrect deleted conversations.
  const latestSnapshot = useRef<any>(null)
  useEffect(() => { latestSnapshot.current = getSnapshot() }, [getSnapshot])
  const applySnapshot = useCallback((data: any) => {
    if (data.themePrefs && typeof data.themePrefs==='object' && ['lavender','paper','forest','night'].includes(data.themePrefs.theme)) setThemePrefs({...DEFAULT_THEME,...data.themePrefs})
    if (Array.isArray(data.assistants) && data.assistants.length) setAssistants(data.assistants)
    if (data.conversations && Array.isArray(data.conversations['晏未晞']) && Array.isArray(data.conversations['言朔'])) {
      const convs:Record<Person,Conversation[]>={'晏未晞':data.conversations['晏未晞'],'言朔':data.conversations['言朔']}
      setConversations(convs)
      const ids=data.activeConversationIds||{'晏未晞':convs['晏未晞'][0]?.id||'','言朔':convs['言朔'][0]?.id||''}
      setActiveConversationIds({'晏未晞':convs['晏未晞'].some((c:Conversation)=>c.id===ids['晏未晞'])?ids['晏未晞']:convs['晏未晞'][0]?.id||'','言朔':convs['言朔'].some((c:Conversation)=>c.id===ids['言朔'])?ids['言朔']:convs['言朔'][0]?.id||''})
      setMessages({'晏未晞':convs['晏未晞'].find((c:Conversation)=>c.id===ids['晏未晞'])?.messages||[],'言朔':convs['言朔'].find((c:Conversation)=>c.id===ids['言朔'])?.messages||[]})
    } else if (data.messages && typeof data.messages === 'object') {
      const legacy={'晏未晞':Array.isArray(data.messages['晏未晞'])?data.messages['晏未晞']:[],'言朔':Array.isArray(data.messages['言朔'])?data.messages['言朔']:[]}
      setMessages(legacy)
      const now=new Date().toISOString();const convs:Record<Person,Conversation[]>={'晏未晞':[{id:'legacy-yanweixi',title:'旧聊天',messages:legacy['晏未晞'],updatedAt:now}],'言朔':[{id:'legacy-yanshu',title:'旧聊天',messages:legacy['言朔'],updatedAt:now}]}
      setConversations(convs);setActiveConversationIds({'晏未晞':'legacy-yanweixi','言朔':'legacy-yanshu'})
    }
    if (data.modelConfig && typeof data.modelConfig === 'object') { const saved:any=data.modelConfig; if(saved['晏未晞']&&saved['言朔']) setModelConfig(saved); else setModelConfig({'晏未晞':saved,'言朔':saved}) }
    if (data.memory && typeof data.memory === 'object') setMemory({'晏未晞': data.memory['晏未晞'] || '', '言朔': data.memory['言朔'] || ''})
    if (data.memoryEntries && typeof data.memoryEntries === 'object') setMemoryEntries({'晏未晞': Array.isArray(data.memoryEntries['晏未晞']) ? data.memoryEntries['晏未晞'] : [], '言朔': Array.isArray(data.memoryEntries['言朔']) ? data.memoryEntries['言朔'] : []})
    if (data.prompt && typeof data.prompt === 'object') setPrompt({'晏未晞': data.prompt['晏未晞'] || '', '言朔': data.prompt['言朔'] || ''})
    if (data.characters && typeof data.characters === 'object') setCharacters(data.characters)
    if (Array.isArray(data.worldEntries)) setWorldEntries(data.worldEntries.map((e:any)=>({...{enabled:true,always:false,useRegex:false,caseSensitive:false,scanDepth:4,sticky:0,cooldown:0,delay:0,target:'system',position:'tail',depth:4,priority:0},...e,boundCharacters:Array.isArray(e.boundCharacters)?e.boundCharacters:(e.boundCharacter?[e.boundCharacter]:['晏未晞'])}))); else if (data.worldEntries && typeof data.worldEntries === 'object') setWorldEntries(['晏未晞','言朔'].flatMap((person:any)=>Array.isArray(data.worldEntries[person])?data.worldEntries[person].map((e:any)=>({...{enabled:true,always:false,useRegex:false,caseSensitive:false,scanDepth:4,sticky:0,cooldown:0,delay:0,target:'system',position:'tail',depth:4,priority:0},...e,boundCharacters:[person]})):[]))
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
      const saved = await fetch('/api/state', { method: 'PUT', credentials: 'same-origin', headers: {'Content-Type':'application/json'}, body: JSON.stringify({state:latestSnapshot.current}) })
      if (!saved.ok) throw new Error('首次迁移本机数据到云端失败：HTTP ' + saved.status)
    }
    setCloudReady(true)
    setCloudStatus('saved')
  }, [applySnapshot])
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
      const snapshot = getSnapshot()
      if (cloudSaveInFlight.current) {
        queuedCloudSnapshot.current = snapshot
        return
      }
      cloudSaveInFlight.current = true
      let nextSnapshot: any = snapshot
      setCloudStatus('saving')
      try {
        while (nextSnapshot) {
          queuedCloudSnapshot.current = null
          const response = await fetch('/api/state', {method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:nextSnapshot})})
          if (response.status === 401) { setCloudReady(false); setAuthStatus('signedOut'); setAuthError('登录已过期，请重新登录。'); return }
          if (!response.ok) throw new Error('HTTP '+response.status)
          nextSnapshot = queuedCloudSnapshot.current
        }
        setCloudStatus('saved')
      } catch {
        setCloudStatus('error')
      } finally {
        cloudSaveInFlight.current = false
      }
    }, 700)
    return ()=>window.clearTimeout(timer)
  }, [cloudReady, authStatus, getSnapshot, messages, conversations, activeConversationIds, modelConfig, memory, memoryEntries, prompt, characters, worldEntries, worldbook, mcpConnections, tasks, assistants])

  useEffect(() => {
    const update = () => setTime(new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()))
    update()
    const timer = window.setInterval(update, 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => { localStorage.setItem('ai-home.assistants', JSON.stringify(assistants)) }, [assistants])
  useEffect(() => { try { localStorage.setItem('ai-home.conversations', JSON.stringify(conversations)) } catch { /* keep chat usable if local storage is full */ } }, [conversations])
  useEffect(() => localStorage.setItem('ai-home.activeConversationIds', JSON.stringify(activeConversationIds)), [activeConversationIds])
  useEffect(() => { try { localStorage.setItem('ai-home.messages', JSON.stringify(Object.fromEntries(Object.entries(messages).map(([k,v])=>[k,(v as ChatMessage[]).map(m=>({...m,attachments:m.attachments?.map(a=>({name:a.name,type:a.type,size:a.size}))}))])))) } catch { /* avoid crashing chat if local storage is full */ } }, [messages])
  useEffect(() => localStorage.setItem('ai-home.modelConfig', JSON.stringify(modelConfig)), [modelConfig])
  useEffect(() => localStorage.setItem('ai-home.memory', JSON.stringify(memory)), [memory])
  useEffect(() => localStorage.setItem('ai-home.memoryEntries', JSON.stringify(memoryEntries)), [memoryEntries])
  useEffect(() => localStorage.setItem('ai-home.prompt', JSON.stringify(prompt)), [prompt])
  useEffect(() => localStorage.setItem('ai-home.characters', JSON.stringify(characters)), [characters])
  useEffect(() => localStorage.setItem('ai-home.worldbook', JSON.stringify(worldbook)), [worldbook])
  useEffect(() => localStorage.setItem('ai-home.mcpConnections', JSON.stringify(mcpConnections)), [mcpConnections])
  useEffect(() => localStorage.setItem('ai-home.worldEntries', JSON.stringify(worldEntries)), [worldEntries])
  useEffect(() => localStorage.setItem('ai-home.tasks', JSON.stringify(tasks)), [tasks])

  function openPerson(p: Person) { setPerson(p); setPage('room'); setChatOpen(true); setActiveTool('') }
  function updateActiveConversationMessages(target:Person, update:(items:ChatMessage[])=>ChatMessage[]) {
    const id=activeConversationIds[target]
    setMessages(prev=>({...prev,[target]:update(prev[target])}))
    if(id) setConversations(prev=>({...prev,[target]:(prev[target]||[]).map(c=>c.id===id?{...c,messages:update(c.messages),updatedAt:new Date().toISOString()}:c)}))
  }

  async function send(textInput: string, attachments: MessageAttachment[] = []) {
    const text = textInput.trim()
    if ((!text && !attachments.length) || sending) return
    const target = person
    const activeModel = modelConfig[target]
    const activeApiKey = apiKey[target] || ''
    if (!activeModel.endpoint.trim() || !activeModel.model.trim() || !activeApiKey.trim()) {
      setChatError('请先在当前助手的工作区 → 模型设置中填写 API 地址、模型名称和 API Key（Key 只保存在当前会话内）。')
      return
    }
    const history = (conversations[target]||[]).find(c=>c.id===activeConversationIds[target])?.messages || messages[target]
    const card = characters[target]
    const messageCount=history.length+1
    const runtimeKey='ai-home.worldbookRuntime.'+target
    let runtime:Record<string,{activeUntil?:number;cooldownUntil?:number}>={};try{runtime=JSON.parse(localStorage.getItem(runtimeKey)||'{}')}catch{}
    const matched:WorldEntry[]=[]
    for(const entry of worldEntries.filter(e=>e.enabled&&e.boundCharacters?.includes(target))){
      const scanText=[text,...history.slice(-(entry.scanDepth||4)).reverse().map(m=>m.content)].join('\n')
      const state=runtime[entry.id]||{}
      const stickyActive=messageCount<=(state.activeUntil||0)
      const inCooldown=messageCount<=(state.cooldownUntil||0)
      const keywordHit=entry.keywords.split(/[,，、\n]/).map(k=>k.trim()).filter(Boolean).some(k=>{if(entry.useRegex){try{return new RegExp(k,entry.caseSensitive?'u':'iu').test(scanText)}catch{return false}}return entry.caseSensitive?scanText.includes(k):scanText.toLowerCase().includes(k.toLowerCase())})
      if(stickyActive){matched.push(entry);continue}
      if(messageCount<(entry.delay||0)||inCooldown||(!entry.always&&!keywordHit))continue
      matched.push(entry)
      runtime[entry.id]={activeUntil:messageCount+(entry.sticky||0),cooldownUntil:messageCount+(entry.cooldown||0)}
    }
    try{localStorage.setItem(runtimeKey,JSON.stringify(runtime))}catch{}
    matched.sort((a,b)=>(b.priority||0)-(a.priority||0))
    const system = [
      '【当前扮演角色】你是 '+(card.name||target)+'。请始终保持该角色身份。',
      '【用户浏览器当前日期】'+new Date().toLocaleDateString('en-CA')+'。记账工具只在用户明确要求记账时使用，成功返回前不要声称已记账。',
      card.description && '【角色描述】\n'+card.description,
      card.definition && '【角色设定】\n'+card.definition,
      card.language && '【语言与表达要求】\n'+card.language,
      prompt[target] && '【补充人物提示】\n'+prompt[target],
      memory[target] && '【长期记忆（旧版文本）】\n'+memory[target],
      memoryEntries[target].length && '【长期记忆库召回】\n'+memoryEntries[target].filter(e=>e.pinned || e.keywords.split(/[,，、\n]/).map(k=>k.trim()).filter(Boolean).some(k=>text.includes(k))).slice(0,12).map(e=>'['+e.category+'] '+e.title+'\n'+e.content).join('\n\n'),
      worldbook[target] && '【世界书补充】\n'+worldbook[target],
      matched.some(e=>e.target==='system'&&e.position==='top') && '【世界书】\n'+matched.filter(e=>e.target==='system'&&e.position==='top').map(e=>'['+e.title+']\n'+e.content).join('\n\n'),
      matched.some(e=>e.target==='system'&&e.position==='tail') && '【世界书】\n'+matched.filter(e=>e.target==='system'&&e.position==='tail').map(e=>'['+e.title+']\n'+e.content).join('\n\n')
    ].filter(Boolean).join('\n\n')
    const attachmentLabel = attachments.length ? '\n[附件：'+attachments.map(a=>a.name).join('、')+']' : ''
    const userMessage: ChatMessage = {role:'user',content:text,attachments:attachments.map(a=>({...a,preview:a.preview||a.dataUrl,dataUrl:undefined}))}
    updateActiveConversationMessages(target,prev=>[...prev,userMessage,{role:'assistant',content:''}])
    setDraft('');setChatError('');setSending(true)
    const requestStartedAt=performance.now()
    const usageTotals:TokenUsage={promptTokens:0,completionTokens:0,cachedTokens:0,cacheReadTokens:0}
    try {
      const base=activeModel.endpoint.trim().replace(/\/+$/,'')
      const url=/\/chat\/completions$/.test(base)?base:base.endsWith('/v1')?base+'/chat/completions':base+'/v1/chat/completions'
      const previous=history.slice(-24).map(m=>({role:m.role,content:m.content+(m.attachments?.length?'\n[此前附件：'+m.attachments.map(a=>a.name).join('、')+']':'')}))
      const content:any[]=[{type:'text',text:text+(attachments.filter(a=>a.textContent).map(a=>'\n\n【文件 '+a.name+' 内容】\n'+a.textContent).join(''))+(attachments.filter(a=>!a.dataUrl&&!a.textContent).map(a=>'\n[附带文件：'+a.name+'；当前未提取该文件内容]').join(''))}]
      for(const a of attachments.filter(a=>a.dataUrl&&a.type.startsWith('image/'))) content.push({type:'image_url',image_url:{url:a.dataUrl}})
      let currentContent:any=content.some(c=>c.type==='image_url')||attachments.some(a=>a.textContent)?content:text+(attachmentLabel)
      const userTop=matched.filter(e=>e.target==='user'&&e.position==='top').map(e=>'['+e.title+']\n'+e.content).join('\n\n')
      const userTail=matched.filter(e=>e.target==='user'&&e.position!=='top').map(e=>'['+e.title+']\n'+e.content).join('\n\n')
      if(Array.isArray(currentContent)){if(userTop)currentContent=[{type:'text',text:'【世界书】\n'+userTop+'\n\n'},...currentContent];if(userTail)currentContent=[...currentContent,{type:'text',text:'\n\n【世界书】\n'+userTail}]}else currentContent=[userTop&&'【世界书】\n'+userTop,currentContent,userTail&&'【世界书】\n'+userTail].filter(Boolean).join('\n\n')
      const historyWithWorld:any[]=[...previous]
      for(const e of matched.filter(e=>e.target==='assistant')){const item={role:'assistant',content:'【世界书：'+e.title+'】\n'+e.content};const at=e.position==='top'?0:e.position==='tail'?historyWithWorld.length:Math.max(0,historyWithWorld.length-Math.max(0,e.depth));historyWithWorld.splice(at,0,item)}
      const requestMessages:any[]=[...(system?[{role:'system',content:system}]:[]),...historyWithWorld,{role:'user',content:currentContent}]
      for(const e of matched.filter(e=>e.target==='system'&&e.position==='depth')){const at=Math.max(system?1:0,requestMessages.length-1-Math.max(0,e.depth));requestMessages.splice(at,0,{role:'system',content:'【世界书：'+e.title+'】\n'+e.content})}
      for(const e of matched.filter(e=>e.target==='user'&&e.position==='depth')){const at=Math.max(system?1:0,requestMessages.length-1-Math.max(0,e.depth));requestMessages.splice(at,0,{role:'user',content:'【世界书：'+e.title+'】\n'+e.content})}
      // Load tools only from the active character's server-side MCP bindings.
      const toolRoutes=new Map<string,{id:string;person:Person;name:string}>()
      const openAITools:any[]=[]
      // Both characters may add entries to the same authenticated shared ledger.
      openAITools.push({type:'function',function:{name:'ledger_add_entry',description:'仅当用户明确要求记账时，将一笔真实收入或支出写入用户的共享记账单。不得虚构金额；不确定的日期、币种或金额应先询问。写入后向用户确认。',parameters:{type:'object',properties:{kind:{type:'string',enum:['income','expense']},amount:{type:'number',description:'金额，正数'},currency:{type:'string',enum:['CNY','JPY','USD','EUR','HKD'],description:'币种，元默认CNY，日元JPY'},category:{type:'string'},note:{type:'string'},date:{type:'string',description:'YYYY-MM-DD，用户所在日期'},},required:['kind','amount','currency','category','date'],additionalProperties:false}}})

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
        const requestBody:any={model:activeModel.model.trim(),messages:requestMessages,stream:true,stream_options:{include_usage:true}}
        if(openAITools.length){requestBody.tools=openAITools;requestBody.tool_choice='auto'}
        let response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+activeApiKey.trim()},body:JSON.stringify(requestBody)})
        if(!response.ok){const detail=await response.text();if(response.status===400&&/stream_options|include_usage/i.test(detail)){delete requestBody.stream_options;response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+activeApiKey.trim()},body:JSON.stringify(requestBody)});if(!response.ok)throw new Error('接口返回 HTTP '+response.status+'：'+(await response.text()).slice(0,300))}else throw new Error('接口返回 HTTP '+response.status+'：'+detail.slice(0,300))}
        if(!response.body) throw new Error('当前浏览器未提供流式响应读取能力')
        const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';let roundText='';const calls:Record<number,{id:string;type:string;function:{name:string;arguments:string}}>={}
        while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split(/\r?\n/);buffer=lines.pop()||'';for(const line of lines){if(!line.startsWith('data:'))continue;const data=line.slice(5).trim();if(!data||data==='[DONE]')continue;try{const chunk=JSON.parse(data);const usage=chunk.usage;if(usage&&typeof usage==='object'){const promptTokens=Number(usage.prompt_tokens??usage.input_tokens??0);const completionTokens=Number(usage.completion_tokens??usage.output_tokens??0);const cachedTokens=Number(usage.prompt_tokens_details?.cached_tokens??usage.input_tokens_details?.cached_tokens??0);const cacheReadTokens=Number(usage.prompt_tokens_details?.cache_read_input_tokens??usage.input_tokens_details?.cache_read_input_tokens??usage.cache_read_input_tokens??0);if(Number.isFinite(promptTokens))usageTotals.promptTokens=(usageTotals.promptTokens||0)+promptTokens;if(Number.isFinite(completionTokens))usageTotals.completionTokens=(usageTotals.completionTokens||0)+completionTokens;if(Number.isFinite(cachedTokens))usageTotals.cachedTokens=(usageTotals.cachedTokens||0)+cachedTokens;if(Number.isFinite(cacheReadTokens))usageTotals.cacheReadTokens=(usageTotals.cacheReadTokens||0)+cacheReadTokens}const delta=chunk.choices?.[0]?.delta;const piece=delta?.content;if(typeof piece==='string'&&piece){roundText+=piece;answer+=piece;updateActiveConversationMessages(target,prev=>prev.map((m,i)=>i===prev.length-1?{role:'assistant',content:answer}:m))}for(const call of (delta?.tool_calls||[])){const idx=call.index??0;calls[idx]??={id:'',type:'function',function:{name:'',arguments:''}};if(call.id)calls[idx].id+=call.id;if(call.type)calls[idx].type=call.type;if(call.function?.name)calls[idx].function.name+=call.function.name;if(call.function?.arguments)calls[idx].function.arguments+=call.function.arguments}}catch{}}}
        const toolCalls=Object.keys(calls).map(k=>calls[Number(k)]).filter(c=>c.id&&c.function.name)
        if(!toolCalls.length){finished=true;break}
        requestMessages.push({role:'assistant',content:roundText||null,tool_calls:toolCalls})
        for(const call of toolCalls){
          const route=toolRoutes.get(call.function.name)
          let resultContent=''
          try{
            if(call.function.name!=='ledger_add_entry' && (!route||route.person!==target)) throw new Error('工具没有绑定到当前人物，已拒绝调用。')
            let args:any={};try{args=JSON.parse(call.function.arguments||'{}')}catch{throw new Error('模型生成的工具参数不是合法 JSON。')}
            if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('工具参数必须是 JSON 对象。')
            updateActiveConversationMessages(target,prev=>prev.map((m,i)=>i===prev.length-1?{role:'assistant',content:(answer?answer+'\n\n':'')+'正在调用工具：'+(route?.name||'共享记账单')+'…'}:m))
            const toolResponse=call.function.name==='ledger_add_entry'
              ? await fetch('/api/ledger',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({...args,actor:target,requestId:call.id})})
              : await fetch('/api/mcp/'+route!.id+'/call',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({person:target,name:route!.name,arguments:args})})
            const toolData=await toolResponse.json();if(!toolResponse.ok)throw new Error(toolData.error||'MCP 工具调用失败')
            resultContent=JSON.stringify(call.function.name==='ledger_add_entry'?toolData:toolData.result)
          }catch(error){resultContent=JSON.stringify({error:error instanceof Error?error.message:String(error)})}
          requestMessages.push({role:'tool',tool_call_id:call.id,content:resultContent.slice(0,30000)})
        }
        if(round===4) throw new Error('工具调用轮数达到安全上限（5 轮），请缩小任务后重试。')
      }
      const elapsedMs=Math.max(1,Math.round(performance.now()-requestStartedAt))
      const completionTokens=usageTotals.completionTokens||0
      const hasUsage=Boolean(usageTotals.promptTokens||usageTotals.completionTokens||usageTotals.cachedTokens||usageTotals.cacheReadTokens)
      const finalUsage:TokenUsage|undefined=hasUsage?{...usageTotals,at:new Date().toISOString(),elapsedMs,tokensPerSecond:completionTokens?Math.round(completionTokens/(elapsedMs/1000)*10)/10:undefined}:undefined
      if(!answer) updateActiveConversationMessages(target,prev=>prev.map((m,i)=>i===prev.length-1?{role:'assistant',content:'（接口已响应，但没有收到文本内容。请检查模型名称、工具调用兼容性或接口的流式支持。）',usage:finalUsage}:m))
      else if(finalUsage) updateActiveConversationMessages(target,prev=>prev.map((m,i)=>i===prev.length-1?{...m,usage:finalUsage}:m))
    } catch(err) {
      const msg=err instanceof Error?err.message:String(err)
      setChatError(msg.includes('Failed to fetch')?'连接失败：可能是 API 地址不可达或浏览器跨域（CORS）限制。若中转站不允许网页跨域，需要在云服务器增加安全的后端代理。':msg)
      updateActiveConversationMessages(target,prev=>prev.map((m,i)=>i===prev.length-1&&m.role==='assistant'?{role:'assistant',content:'请求失败，请查看上方错误提示并检查模型设置。'}:m))
    } finally {setSending(false)}
  }

  function addTask() {
    const text = draft.trim()
    if (!text) return
    setTasks(prev => ({ ...prev, [person]: [...prev[person], text] }))
    setDraft('')
  }

  if (authStatus !== 'signedIn') return <LoginScreen status={authStatus} password={loginPassword} setPassword={setLoginPassword} error={authError} onSubmit={login}/>

  return <main className={"shell theme-"+themePrefs.theme+" bubble-"+themePrefs.bubble+" chatbg-"+themePrefs.chatBackground} style={themeStyle(themePrefs) as React.CSSProperties}>
    <section className="screen">
      {page === 'home' && <Home onPerson={openPerson} onMe={() => setPage('me')} time={time} displayName={displayName} characters={characters} />}
      {page === 'room' && <Room person={person} setPerson={setPerson} displayName={displayName} chatOpen={chatOpen} setChatOpen={setChatOpen}
        draft={draft} setDraft={setDraft} messages={messages} send={send} conversations={conversations} activeConversationIds={activeConversationIds} setConversations={setConversations} setActiveConversationIds={setActiveConversationIds} setMessages={setMessages}
        activeTool={activeTool} setActiveTool={setActiveTool} memory={memory} setMemory={setMemory}
        prompt={prompt} setPrompt={setPrompt} characters={characters} setCharacters={setCharacters} worldbook={worldbook} setWorldbook={setWorldbook} worldEntries={worldEntries} setWorldEntries={setWorldEntries} memoryEntries={memoryEntries} setMemoryEntries={setMemoryEntries} mcpConnections={mcpConnections} setMcpConnections={setMcpConnections}
        modelConfig={modelConfig[person]} setModelConfig={(v:React.SetStateAction<ModelConfig>)=>setModelConfig(old=>({...old,[person]:typeof v==='function'?v(old[person]):v}))} apiKey={apiKey[person]||''} setApiKey={(v:string)=>setApiKey(old=>({...old,[person]:v}))}
        sending={sending} chatError={chatError} setChatError={setChatError}
        tasks={tasks} addTask={addTask} />}
      {page === 'me' && <MyRoom />}
      {page === 'fun' && <Fun />}
      {page === 'settings' && <Settings onLogout={logout} cloudStatus={cloudStatus} assistants={assistants} setAssistants={setAssistants} themePrefs={themePrefs} setThemePrefs={setThemePrefs} conversations={conversations} modelConfig={modelConfig} onOpenTool={(tool)=>{setPerson(tool.person);setActiveTool(tool.tool);setPage('room')}} />}
    </section>
    {cloudStatus!=='saved' && <div className={'cloud-status '+cloudStatus} role="status"><span>{cloudStatus==='saving'?'云端保存中…':cloudStatus==='error'?'云端保存失败':'连接云端…'}</span>{cloudStatus==='error'&&<button onClick={logout}>重新登录</button>}</div>}
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

function Home({ onPerson, onMe, time, displayName, characters }: { onPerson: (p: Person) => void, onMe: () => void, time: string, displayName:(p:Person)=>string, characters:Record<Person,CharacterCard> }) {
  return <div className="home-screen">
    <div className="home-people" aria-label="房间入口">
      {(['晏未晞', 'me', '言朔'] as const).map(item => {
        const mine = item === 'me'
        const name = mine ? '我的房间' : displayName(item)
        const avatar = mine ? '' : characters[item]?.avatar
        return <button key={item} type="button" className={'home-person'+(mine?' is-me':'')} onClick={() => mine ? onMe() : onPerson(item)} aria-label={'进入'+name}>
          <span className="home-person-circle">{avatar ? <img src={avatar} alt="" /> : <span aria-hidden="true">{mine?'我':name.slice(0,1)||'助'}</span>}</span>
          <span className="home-person-label">{name}</span>
          <span className="home-person-caption">{mine?'我的空间':'进入聊天'}</span>
        </button>
      })}
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
  person: Person, setPerson: (p: Person) => void, displayName:(p:Person)=>string, chatOpen: boolean, setChatOpen: (v: boolean) => void,
  draft: string, setDraft: (v: string) => void, messages: Record<Person,ChatMessage[]>, send: (textInput: string, attachments?: MessageAttachment[]) => void,
  conversations:Record<Person,Conversation[]>, activeConversationIds:Record<Person,string>, setConversations:React.Dispatch<React.SetStateAction<Record<Person,Conversation[]>>>, setActiveConversationIds:React.Dispatch<React.SetStateAction<Record<Person,string>>>, setMessages:React.Dispatch<React.SetStateAction<Record<Person,ChatMessage[]>>>,
  activeTool: Tool | '', setActiveTool: (v: Tool | '') => void,
  memory: Record<Person,string>, setMemory: React.Dispatch<React.SetStateAction<Record<Person,string>>>,
  prompt: Record<Person,string>, setPrompt: React.Dispatch<React.SetStateAction<Record<Person,string>>>,
  characters: Record<Person,CharacterCard>, setCharacters: React.Dispatch<React.SetStateAction<Record<Person,CharacterCard>>>,
  worldbook: Record<Person,string>, setWorldbook: React.Dispatch<React.SetStateAction<Record<Person,string>>>,
  worldEntries: WorldEntry[], setWorldEntries: React.Dispatch<React.SetStateAction<WorldEntry[]>>,
  memoryEntries: Record<Person,MemoryEntry[]>, setMemoryEntries: React.Dispatch<React.SetStateAction<Record<Person,MemoryEntry[]>>>,
  mcpConnections: Record<Person,MCPConnection[]>, setMcpConnections: React.Dispatch<React.SetStateAction<Record<Person,MCPConnection[]>>>,
  tasks: Record<Person,string[]>, addTask: () => void,
  modelConfig: ModelConfig, setModelConfig: React.Dispatch<React.SetStateAction<ModelConfig>>, apiKey: string, setApiKey: (v:string)=>void,
  sending: boolean, chatError: string, setChatError: (v:string)=>void
}) {
  if (props.chatOpen) return <Chat {...props} />
  return <div className="room-screen">
    <header className="room-header"><div className="room-name"><span>{props.person === '晏未晞' ? '晏' : '言'}</span><div><b>{props.displayName(props.person)} 的房间</b><small>独立工作区</small></div><div className="room-person-switch" aria-label="切换房间">{(['晏未晞','言朔'] as Person[]).map(name=><button key={name} type="button" className={props.person===name?'selected':''} aria-pressed={props.person===name} onClick={()=>{props.setPerson(name);props.setActiveTool('')}}>{props.displayName(name).slice(0,1)}<small>{props.displayName(name)}</small></button>)}</div></div></header>
    <div className="room-session-switch"><div className="room-session-heading"><b>独立会话</b><small>{(props.conversations[props.person]||[]).length} 条对话</small></div><div className="room-session-controls"><select aria-label="切换聊天会话" value={props.activeConversationIds[props.person]||''} onChange={e=>{const nextId=e.target.value;const currentId=props.activeConversationIds[props.person];props.setConversations((old:Record<Person,Conversation[]>)=>({...old,[props.person]:(old[props.person]||[]).map(c=>c.id===currentId?{...c,messages:props.messages[props.person],updatedAt:new Date().toISOString()}:c)}));const next=(props.conversations[props.person]||[]).find((c:Conversation)=>c.id===nextId);props.setActiveConversationIds((old:Record<Person,string>)=>({...old,[props.person]:nextId}));props.setMessages((old:Record<Person,ChatMessage[]>)=>({...old,[props.person]:next?.messages||[]}));props.setChatError('')}}>{(props.conversations[props.person]||[]).map((c:Conversation)=><option key={c.id} value={c.id}>{c.title||'未命名会话'}</option>)}</select><button type="button" onClick={()=>{const id=crypto.randomUUID();const list=props.conversations[props.person]||[];const currentId=props.activeConversationIds[props.person];const title='新对话 '+(list.length+1);props.setConversations((old:Record<Person,Conversation[]>)=>({...old,[props.person]:[...(old[props.person]||[]).map(c=>c.id===currentId?{...c,messages:props.messages[props.person],updatedAt:new Date().toISOString()}:c),{id,title,messages:[],updatedAt:new Date().toISOString()}]}));props.setActiveConversationIds((old:Record<Person,string>)=>({...old,[props.person]:id}));props.setMessages((old:Record<Person,ChatMessage[]>)=>({...old,[props.person]:[]}));props.setChatError('')}}>＋ 新会话</button></div><small className="room-session-hint">可以在这里切换对话，不必先打开聊天窗口。</small></div>
    <button className="chat-entry" onClick={() => props.setChatOpen(true)}><b>聊天窗口</b><span>点击进入 {props.person} 的全屏聊天</span><em>→</em></button>
    <div className="workspace-title">工作区</div>
    <div className="tool-grid">{tools.map(t => <button key={t} className={props.activeTool===t ? 'tool-active' : ''} aria-expanded={props.activeTool===t} onClick={() => props.setActiveTool(props.activeTool===t ? '' : t)}><b>{t}</b><span>{toolHint(t)}</span></button>)}</div>
    {props.activeTool && <ToolPanel {...props} />}
  </div>
}

function toolHint(t: Tool) {
  return ({'人物设置':'角色卡、头像、开场白与语言','世界书':'世界观与关键词','长期记忆':'值得长期留下的事','定时任务':'稍后提醒与主动消息','MCP':'外部工具连接','模型设置':'接口与模型'} as Record<Tool,string>)[t]
}

function ToolPanel(p: any) {
  const t=p.activeTool as Tool
  if (t === '人物设置') return <CharacterSettings key={p.person} value={p.characters[p.person]} onSave={(v:CharacterCard)=>p.setCharacters((x:Record<Person,CharacterCard>)=>({...x,[p.person]:v}))}/>
  if (t === '世界书') return <WorldbookEditor entries={p.worldEntries.filter((e:WorldEntry)=>e.boundCharacters?.includes(p.person))} onChange={(v:WorldEntry[])=>p.setWorldEntries((old:WorldEntry[])=>{const visibleIds=new Set(old.filter(e=>e.boundCharacters?.includes(p.person)).map(e=>e.id));const incoming=new Map(v.map(e=>[e.id,e]));const kept=old.flatMap(e=>{if(!visibleIds.has(e.id))return [e];const replacement=incoming.get(e.id);if(replacement)return [replacement];const remaining=e.boundCharacters.filter(name=>name!==p.person);return remaining.length?[{...e,boundCharacters:remaining}]:[]});const oldIds=new Set(old.map(e=>e.id));return [...kept,...v.filter(e=>!oldIds.has(e.id))]})}/>
  if (t === 'MCP') return <MCPSettings person={p.person}/>
  if (t === '模型设置') return <ModelSettings value={p.modelConfig} onChange={p.setModelConfig} apiKey={p.apiKey} setApiKey={p.setApiKey}/>
  if (t === '长期记忆') return <><MemoryWorkbench person={p.person} entries={p.memoryEntries[p.person]} onChange={(v:MemoryEntry[])=>p.setMemoryEntries((x:Record<Person,MemoryEntry[]>)=>({...x,[p.person]:v}))}/><Editor title="补充记忆文本（兼容旧版）" value={p.memory[p.person]} onChange={(v:string)=>p.setMemory((x:any)=>({...x,[p.person]:v}))} placeholder="旧版自由文本记忆，可逐步整理进上面的分类记忆库。" /></>
  if (t === '定时任务') return <TaskManager person={p.person}/>
  return <div className="tool-panel"><h3>{t}</h3><p className="muted">{t === 'MCP' ? '预留工具连接层，后续接入 MCP 客户端。' : '预留模型适配层，后续接入 OpenAI 兼容接口、聚合站或本地模型。'}</p></div>
}

function MemoryWorkbench({person,entries,onChange}:{person:Person;entries:MemoryEntry[];onChange:(v:MemoryEntry[])=>void}) {
  const [title,setTitle]=useState('');const [content,setContent]=useState('');const [keywords,setKeywords]=useState('');const [category,setCategory]=useState<MemoryEntry['category']>('其他');const [pinned,setPinned]=useState(false);const [query,setQuery]=useState('');const [editingId,setEditingId]=useState<string|null>(null)
  const visible=entries.filter(e=>(e.title+' '+e.content+' '+e.keywords+' '+e.category).toLowerCase().includes(query.toLowerCase()))
  function add(e:FormEvent){e.preventDefault();if(!title.trim()||!content.trim())return;const entry={id:editingId||crypto.randomUUID(),title:title.trim(),content:content.trim(),keywords:keywords.trim(),category,pinned,updatedAt:new Date().toISOString()};onChange(editingId?entries.map(old=>old.id===editingId?entry:old):[entry,...entries]);setTitle('');setContent('');setKeywords('');setPinned(false);setEditingId(null)}
  function edit(item:MemoryEntry){setEditingId(item.id);setTitle(item.title);setContent(item.content);setKeywords(item.keywords);setCategory(item.category);setPinned(item.pinned)}
  function cancelEdit(){setEditingId(null);setTitle('');setContent('');setKeywords('');setCategory('其他');setPinned(false)}
  return <div className="tool-panel memory-workbench"><h3>{person} · 独立长期记忆库</h3><p className="muted">每位助手分别保存自己的记忆。固定记忆每轮注入；其他记忆按关键词匹配召回。当前记录随账号云端快照同步。</p><input className="memory-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索这位角色的记忆……"/><form className="memory-create" onSubmit={add}><h4>{editingId?"编辑记忆":"新增记忆"}</h4><label>记忆标题<input value={title} onChange={e=>setTitle(e.target.value)} required placeholder="例如：我们正在搭建新房子"/></label><label>分类<select value={category} onChange={e=>setCategory(e.target.value as MemoryEntry['category'])}>{['人物关系','经历事件','偏好习惯','项目进度','其他'].map(x=><option key={x}>{x}</option>)}</select></label><label>关键词（逗号分隔）<input value={keywords} onChange={e=>setKeywords(e.target.value)} placeholder="新房子, MCP, 框架"/></label><label>记忆内容<textarea rows={4} value={content} onChange={e=>setContent(e.target.value)} required placeholder="记录需要以后继续使用的事实、约定或进度。"/></label><label className="memory-pin"><input type="checkbox" checked={pinned} onChange={e=>setPinned(e.target.checked)}/> 固定记忆（每轮都注入提示词）</label><div className="memory-form-actions"><button disabled={!title.trim()||!content.trim()}>{editingId?"保存修改":"保存记忆"}</button>{editingId&&<button type="button" onClick={cancelEdit}>取消</button>}</div></form><div className="memory-list-heading"><b>已保存 {entries.length} 条</b><small>当前显示 {visible.length} 条</small></div>{visible.length===0?<p className="muted">没有匹配的记忆，可以新增一条。</p>:visible.map(item=><article className="memory-item" key={item.id}><div><b>{item.title}</b><span>{item.category}{item.pinned?' · 固定记忆':''}</span></div><p>{item.content}</p>{item.keywords&&<small>关键词：{item.keywords}</small>}<div className="memory-actions"><button type="button" onClick={()=>onChange(entries.map(e=>e.id===item.id?{...e,pinned:!e.pinned,updatedAt:new Date().toISOString()}:e))}>{item.pinned?'取消固定':'固定'}</button><button type="button" onClick={()=>edit(item)}>编辑</button><button type="button" onClick={()=>onChange(entries.filter(e=>e.id!==item.id))}>删除</button></div></article>)}</div>
}

type ScheduledTask = { id:string; person:Person; title:string; prompt:string; run_at:string; recurrence:'once'|'daily'|'weekly'; status:'scheduled'|'ready'|'completed'|'paused'; last_run_at:string|null; created_at:string; updated_at:string }
function TaskManager({person}:{person:Person}) {
  const [tasks,setTasks]=useState<ScheduledTask[]>([])
  const [title,setTitle]=useState('')
  const [prompt,setPrompt]=useState('')
  const [runAt,setRunAt]=useState('')
  const [recurrence,setRecurrence]=useState<'once'|'daily'|'weekly'>('once')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const refresh=useCallback(async()=>{const r=await fetch('/api/tasks?person='+encodeURIComponent(person),{credentials:'same-origin'});const d=await r.json();if(!r.ok)throw new Error(d.error||'读取任务失败');setTasks(d.tasks||[])},[person])
  useEffect(()=>{refresh().catch(e=>setError(e.message))},[refresh])
  async function create(e:FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');try{const r=await fetch('/api/tasks',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({person,title,prompt,runAt:new Date(runAt).toISOString(),recurrence})});const d=await r.json();if(!r.ok)throw new Error(d.error||'创建任务失败');setTitle('');setPrompt('');setNotice('任务已保存到云端调度队列。');await refresh()}catch(e){setError(e instanceof Error?e.message:'创建任务失败')}finally{setBusy(false)}}
  async function update(task:ScheduledTask,patch:Record<string,unknown>){setError('');setNotice('');try{const r=await fetch('/api/tasks/'+task.id,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({person,...patch})});const d=await r.json();if(!r.ok)throw new Error(d.error||'更新任务失败');await refresh()}catch(e){setError(e instanceof Error?e.message:'更新任务失败')}}
  async function remove(task:ScheduledTask){if(!window.confirm('删除任务“'+task.title+'”？'))return;try{const r=await fetch('/api/tasks/'+task.id,{method:'DELETE',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({person})});const d=await r.json();if(!r.ok)throw new Error(d.error||'删除失败');await refresh()}catch(e){setError(e instanceof Error?e.message:'删除失败')}}
  const localDate=(iso:string)=>{const d=new Date(iso);return Number.isNaN(d.getTime())?'时间无效':d.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})}
  const statusLabel=(s:ScheduledTask['status'])=>({scheduled:'等待执行',ready:'已到期 · 待接入模型执行',completed:'已完成',paused:'已暂停'}[s])
  return <div className="tool-panel task-manager"><h3>{person} · 定时任务</h3><p className="muted">任务保存在云端数据库。调度器会在服务器后台检查到期时间；模型接入后，再由执行适配器把任务写回绑定人物的会话。</p>{error&&<p className="mcp-error">{error}</p>}{notice&&<p className="mcp-notice">{notice}</p>}
    <form className="task-create" onSubmit={create}><label>任务名称<input required maxLength={160} value={title} onChange={e=>setTitle(e.target.value)} placeholder="例如：早上检查雾潮群岛进度"/></label><label>执行时间<input required type="datetime-local" value={runAt} onChange={e=>setRunAt(e.target.value)}/></label><label>重复规则<select value={recurrence} onChange={e=>setRecurrence(e.target.value as typeof recurrence)}><option value="once">仅一次</option><option value="daily">每天</option><option value="weekly">每周</option></select></label><label>任务内容<textarea required rows={4} value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="写清楚到时间后要检查什么、执行什么，以及结果应该写回哪里。"/></label><button type="submit" disabled={busy||!title.trim()||!prompt.trim()||!runAt}>{busy?'保存中…':'保存任务'}</button></form>
    <div className="task-list-heading"><b>任务列表</b><button type="button" onClick={()=>refresh().catch(e=>setError(e.message))}>刷新</button></div>{tasks.length===0?<p className="muted">这里还没有任务。</p>:tasks.map(task=><article className="scheduled-task" key={task.id}><div className="scheduled-task-top"><b>{task.title}</b><span className={'task-status '+task.status}>{statusLabel(task.status)}</span></div><p>{task.prompt}</p><small>执行时间：{localDate(task.run_at)} · {task.recurrence==='once'?'仅一次':task.recurrence==='daily'?'每天':'每周'}{task.last_run_at?' · 上次触发：'+localDate(task.last_run_at):''}</small><div className="scheduled-task-actions">{task.status==='scheduled'&&<button type="button" onClick={()=>update(task,{status:'paused'})}>暂停</button>}{task.status==='paused'&&<button type="button" onClick={()=>update(task,{status:'scheduled'})}>恢复</button>}{task.status==='ready'&&<button type="button" onClick={()=>update(task,{status:'completed'})}>标记完成</button>}<button type="button" onClick={()=>remove(task)}>删除</button></div></article>)}</div>
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
  const refresh = useCallback(async()=>{
    const r = await fetch('/api/mcp?person='+encodeURIComponent(person),{credentials:'same-origin'})
    const data = await r.json()
    if(!r.ok) throw new Error(data.error || '读取 MCP 列表失败')
    setConnections(data.connections)
  },[person])
  useEffect(()=>{refresh().catch(e=>setError(e.message))},[refresh])
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
 const [testing,setTesting]=useState(false)
 const [testResult,setTestResult]=useState<{ok:boolean;text:string}|null>(null)
 async function testConnection(){
   if(!value.endpoint.trim()||!value.model.trim()||!apiKey.trim()){setTestResult({ok:false,text:'请先填写 API 地址、模型名称和 API Key。'});return}
   let endpoint=value.endpoint.trim().replace(/\/+$/,'')
   if(!/\/v1$/.test(endpoint))endpoint+='/v1'
   setTesting(true);setTestResult(null)
   try{
     const response=await fetch(endpoint+'/models',{headers:{Authorization:'Bearer '+apiKey}})
     if(!response.ok){const detail=(await response.text()).slice(0,180);throw new Error('HTTP '+response.status+(detail?' · '+detail:''))}
     const data=await response.json()
     const models=Array.isArray(data?.data)?data.data:[]
     const found=models.some((m:any)=>m?.id===value.model)
     setTestResult({ok:true,text:models.length?(found?'连接成功，且模型在可用列表中。':'连接成功；未在模型列表中找到所填模型，请确认模型 ID。'):'接口响应正常，但未返回标准模型列表。'})
   }catch(e){setTestResult({ok:false,text:e instanceof Error?(/Failed to fetch|NetworkError/i.test(e.message)?'浏览器无法读取接口。可能是 CORS、网络或地址问题；这不一定代表 API Key 错误。':e.message):'连接测试失败。'})}
   finally{setTesting(false)}
 }
 return <div className="tool-panel"><h3>模型连接</h3><p className="muted">支持 OpenAI 兼容接口，例如 One API / New API。API Key 只保存在当前页面内存，不写入浏览器存储；刷新后需要重新填写。</p><label className="model-field">API 地址<input value={value.endpoint} onChange={e=>{onChange({...value,endpoint:e.target.value});setTestResult(null)}} placeholder="https://你的中转站/v1"/></label><label className="model-field">模型名称<input value={value.model} onChange={e=>{onChange({...value,model:e.target.value});setTestResult(null)}} placeholder="例如 gpt-4o-mini"/></label><label className="model-field">API Key（本次打开有效）<input type="password" autoComplete="off" value={apiKey} onChange={e=>{setApiKey(e.target.value);setTestResult(null)}} placeholder="sk-…"/></label><div className="pricing-settings"><b>用量费用估算（最终显示人民币 ¥）</b><small>输入价格按服务商 USD / 百万 tokens 资费填写；汇率可自行调整。留空价格则不估算费用，缓存价格留空时按普通输入价估算。</small><div className="pricing-grid"><label>输入价格<input type="number" min="0" step="any" value={value.inputPrice??''} onChange={e=>onChange({...value,inputPrice:e.target.value})} placeholder="例如 2.5"/></label><label>输出价格<input type="number" min="0" step="any" value={value.outputPrice??''} onChange={e=>onChange({...value,outputPrice:e.target.value})} placeholder="例如 10"/></label><label>缓存输入价格<input type="number" min="0" step="any" value={value.cachedInputPrice??''} onChange={e=>onChange({...value,cachedInputPrice:e.target.value})} placeholder="可选"/></label><label>美元兑人民币汇率<input type="number" min="0.01" step="0.01" value={value.usdToCny??'7.2'} onChange={e=>onChange({...value,usdToCny:e.target.value})} placeholder="例如 7.2"/></label></div></div><button type="button" disabled={testing} onClick={testConnection}>{testing?'正在测试连接…':'测试 API 连接'}</button>{testResult&&<p role="status" className={testResult.ok?'model-test-ok':'model-test-error'}>{testResult.text}</p>}<small>地址、模型名和价格设置自动保存在此浏览器。API Key 不会持久化。若接口不支持 CORS，需要由云端代理转发，不能靠前端绕过。</small></div>
}

function Chat(p: any) {
  const chatPerson:Person=p.person as Person
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
  function estimatedCost(usage:TokenUsage):number|null {
    const cfg=p.modelConfig as ModelConfig
    if(cfg.inputPrice==null||cfg.inputPrice.trim()===''||cfg.outputPrice==null||cfg.outputPrice.trim()==='')return null
    const input=Number(cfg.inputPrice),output=Number(cfg.outputPrice),cachePrice=cfg.cachedInputPrice==null||cfg.cachedInputPrice.trim()===''?input:Number(cfg.cachedInputPrice)
    if(![input,output,cachePrice].every(n=>Number.isFinite(n)&&n>=0))return null
    const prompt=Math.max(0,usage.promptTokens||0),cached=Math.min(prompt,Math.max(0,usage.cachedTokens||usage.cacheReadTokens||0)),completion=Math.max(0,usage.completionTokens||0)
    const rate=Number(cfg.usdToCny??'7.2')
    if(!Number.isFinite(rate)||rate<=0)return null
    return (((prompt-cached)*input+cached*cachePrice+completion*output)/1_000_000)*rate
  }
  const creatingConversation = useRef(false)
  function createConversation(){
    if(creatingConversation.current)return
    creatingConversation.current=true
    const current=p.activeConversationIds[chatPerson]
    const id=crypto.randomUUID()
    const existing=p.conversations[chatPerson]||[]
    const title='新对话 '+(existing.length+1)
    p.setConversations((old:Record<Person,Conversation[]>)=>({...old,[chatPerson]:[...(old[chatPerson]||[]).map(x=>x.id===current?{...x,messages:p.messages[chatPerson],updatedAt:new Date().toISOString()}:x),{id,title,messages:[],updatedAt:new Date().toISOString()}]}))
    p.setActiveConversationIds((old:Record<Person,string>)=>({...old,[chatPerson]:id}))
    p.setMessages((old:Record<Person,ChatMessage[]>)=>({...old,[chatPerson]:[]}))
    p.setChatError('')
    window.setTimeout(()=>{creatingConversation.current=false},350)
  }
  function renameConversation(){
    const current=(p.conversations[chatPerson]||[]).find((x:Conversation)=>x.id===p.activeConversationIds[chatPerson])
    if(!current)return
    const name=window.prompt('给这条会话起个名字',current.title)
    if(!name?.trim())return
    p.setConversations((old:Record<Person,Conversation[]>)=>({...old,[chatPerson]:(old[chatPerson]||[]).map(x=>x.id===current.id?{...x,title:name.trim(),updatedAt:new Date().toISOString()}:x)}))
  }
  function deleteConversation(){
    const currentId=p.activeConversationIds[chatPerson]
    const current=(p.conversations[chatPerson]||[]).find((x:Conversation)=>x.id===currentId)
    if(!current||!window.confirm('删除「'+current.title+'」？此操作会删除这条会话及其消息，无法撤销。'))return
    const remaining=(p.conversations[chatPerson]||[]).filter((x:Conversation)=>x.id!==currentId)
    const next=remaining.length?remaining:[{id:crypto.randomUUID(),title:'新对话',messages:[],updatedAt:new Date().toISOString()}]
    const nextActive=next[Math.max(0,(p.conversations[chatPerson]||[]).findIndex((x:Conversation)=>x.id===currentId)-1)]||next[0]
    p.setConversations((old:Record<Person,Conversation[]>)=>({...old,[chatPerson]:next}))
    p.setActiveConversationIds((old:Record<Person,string>)=>({...old,[chatPerson]:nextActive.id}))
    p.setMessages((old:Record<Person,ChatMessage[]>)=>({...old,[chatPerson]:nextActive.messages}))
    p.setChatError('')
  }
  return <div className="fullscreen-chat">
    <header className="chat-header"><button onClick={()=>p.setChatOpen(false)}>← 房间</button><b>{p.displayName(p.person)}</b><button onClick={()=>{p.setPerson(p.person === '晏未晞' ? '言朔' : '晏未晞');p.setChatError('')}}>切换</button></header>
    <div className="conversation-bar"><div className="conversation-list">{(p.conversations[chatPerson]||[]).map((c:Conversation)=><button key={c.id} type="button" className={p.activeConversationIds[chatPerson]===c.id?'selected':''} onClick={()=>{const nextId=c.id;p.setConversations((old:Record<Person,Conversation[]>)=>{const active=old[chatPerson]?.find(x=>x.id===p.activeConversationIds[chatPerson]);const list=(old[chatPerson]||[]).map(x=>x.id===active?.id?{...x,messages:p.messages[chatPerson],updatedAt:new Date().toISOString()}:x);return {...old,[chatPerson]:list}});p.setActiveConversationIds((old:Record<Person,string>)=>({...old,[chatPerson]:nextId}));p.setMessages((old:Record<Person,ChatMessage[]>)=>({...old,[chatPerson]:(p.conversations[chatPerson]||[]).find((x:Conversation)=>x.id===nextId)?.messages||[]}));p.setChatError('')}}>{c.title||'新对话'}</button>)}</div><button type="button" className="conversation-new" disabled={creatingConversation.current} onClick={createConversation}>＋ 新对话</button><button type="button" className="conversation-rename" onClick={renameConversation}>重命名</button><button type="button" className="conversation-delete" onClick={deleteConversation}>删除当前</button></div>
    {p.chatError&&<div className="chat-error"><span>{p.chatError}</span><button onClick={()=>p.setChatError('')}>×</button></div>}
    <div className="chat-body">{p.messages[p.person].length ? p.messages[p.person].map((m:ChatMessage,i:number)=><div className={'message-row '+m.role} key={i}><div className={'bubble '+m.role}>{m.content|| (p.sending&&i===p.messages[p.person].length-1?'正在思考……':'')}{m.attachments?.map((a:MessageAttachment,j:number)=><div className="sent-attachment" key={j}>{a.type.startsWith('image/')?<div className="sent-image-placeholder">{a.preview?<button type="button" className="image-open-button" title="点击放大图片" onClick={()=>setLightbox({src:a.preview!,name:a.name})}><img src={a.preview} alt={a.name}/></button>:<>🖼 {a.name}</>}</div>:<div className="sent-file"><span>▤</span><div><b>{a.name}</b><small>{formatSize(a.size)}</small>{a.textContent&&<button type="button" className="download-text" onClick={()=>downloadText(a)}>下载文本副本</button>}</div></div>}</div>)}</div>{m.role==='assistant'&&m.usage&&<div className="message-usage" title="用量来自模型 API 返回的 usage 字段；未返回时不估算缓存量。"><span>↑ {m.usage.promptTokens??'—'} tokens</span><span>↓ {m.usage.completionTokens??'—'} tokens</span>{(m.usage.cachedTokens||m.usage.cacheReadTokens)?<span>⚡ 缓存 {Math.max(m.usage.cachedTokens||0,m.usage.cacheReadTokens||0)} tokens</span>:<span>缓存未报告</span>}{m.usage.tokensPerSecond!==undefined&&<span>{m.usage.tokensPerSecond} tok/s</span>}{m.usage.elapsedMs!==undefined&&<span>{(m.usage.elapsedMs/1000).toFixed(1)}s</span>}{estimatedCost(m.usage)!==null&&<span>≈ ${estimatedCost(m.usage)!.toFixed(6)}</span>}</div>}</div>) : <div className="empty-chat">这里是 {p.person} 的独立房间。<br/>配置模型后，就可以在这里聊天啦。</div>}</div>
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

function Fun() {
  const [active,setActive]=useState('客厅')
  const [draft,setDraft]=useState('')
  const [messages,setMessages]=useState<{id:string;author:string;content:string;at:string}[]>(()=>read('ai-home.loungeMessages',[]))
  useEffect(()=>{localStorage.setItem('ai-home.loungeMessages',JSON.stringify(messages))},[messages])
  const rooms=['客厅','内嵌浏览器','可视化网页','相册','播放器','记账单','日记本','待定']
  function post(e:FormEvent){e.preventDefault();if(!draft.trim())return;setMessages(old=>[...old,{id:crypto.randomUUID(),author:'顾',content:draft.trim(),at:new Date().toISOString()}]);setDraft('')}
  return <div className="fun-screen"><h2>娱乐房</h2><p>公共空间与扩展模块。先把入口搭好，后续再逐个接入实际能力。</p><div className="fun-tabs">{rooms.map(x=><button type="button" className={active===x?'selected':''} key={x} onClick={()=>setActive(x)}>{x}</button>)}</div>{active==='记账单'?<Ledger/>:active==='日记本'?<Diary/>:active==='客厅'?<section className="lounge-panel"><h3>公共客厅</h3><p className="muted">这里是以后大家一起讨论的地方。当前先搭好共享留言结构；AI 自动参与、实时推送与跨设备同步待后续接入。</p><div className="lounge-messages">{messages.length?messages.map(m=><article key={m.id}><b>{m.author}</b><small>{new Date(m.at).toLocaleString('zh-CN')}</small><p>{m.content}</p></article>):<p className="muted">客厅还很安静，留下一条消息试试。</p>}</div><form onSubmit={post} className="lounge-compose"><textarea rows={2} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="给客厅留句话……"/><button disabled={!draft.trim()}>发送留言</button></form></section>:<section className="lounge-panel"><h3>{active}</h3><p className="muted">模块入口已预留。后续接入真实组件时，不需要重做房间导航。</p><div className="module-placeholder"><span>⌂</span><b>{active}工作区</b><small>框架已预留 · 等待接入</small></div></section>}</div>
}
function UsagePanel({conversations,modelConfig}:{conversations:Record<Person,Conversation[]>;modelConfig:Record<Person,ModelConfig>}) {
 const [range,setRange]=useState<'today'|'7d'|'30d'|'all'>('7d')
 const now=new Date();const start=new Date(now);if(range==='today')start.setHours(0,0,0,0);else if(range==='7d')start.setDate(start.getDate()-6);else if(range==='30d')start.setDate(start.getDate()-29);else start.setTime(0)
 const rows=(['晏未晞','言朔'] as Person[]).map(person=>{const messages=(conversations[person]||[]).flatMap(c=>c.messages||[]).filter(m=>m.role==='assistant'&&!!m.usage&&(range==='all'||new Date(m.usage.at||0).getTime()>=start.getTime()));const input=messages.reduce((n,m)=>n+(m.usage?.promptTokens||0),0);const output=messages.reduce((n,m)=>n+(m.usage?.completionTokens||0),0);const cached=messages.reduce((n,m)=>n+Math.max(m.usage?.cachedTokens||0,m.usage?.cacheReadTokens||0),0);const cfg=modelConfig[person];let cost:number|null=null;if(messages.length&&cfg?.inputPrice?.trim()&&cfg?.outputPrice?.trim()){const a=Number(cfg.inputPrice),b=Number(cfg.outputPrice),c=cfg.cachedInputPrice?.trim()?Number(cfg.cachedInputPrice):a,fx=Number(cfg.usdToCny||'7.2');if([a,b,c,fx].every(v=>Number.isFinite(v)&&v>=0)&&fx>0)cost=messages.reduce((sum,m)=>{const u=m.usage!;const p=Math.max(0,u.promptTokens||0),cache=Math.min(p,Math.max(u.cachedTokens||0,u.cacheReadTokens||0)),o=Math.max(0,u.completionTokens||0);return sum+((p-cache)*a+cache*c+o*b)/1_000_000*fx},0)}return {person,count:messages.length,input,output,cached,cost}})
 const total=(k:'input'|'output'|'cached')=>rows.reduce((n,r)=>n+r[k],0)
 return <section className="usage-panel"><div className="usage-panel-heading"><div><h3>AI 用量统计</h3><p>汇总已保存的助手回复用量；仅统计 API 实际返回并保存的 usage。</p></div><select aria-label="用量时间范围" value={range} onChange={e=>setRange(e.target.value as any)}><option value="today">今天</option><option value="7d">近 7 天</option><option value="30d">近 30 天</option><option value="all">全部记录</option></select></div><div className="usage-total-grid"><div><small>输入 Token</small><b>{total('input').toLocaleString()}</b></div><div><small>输出 Token</small><b>{total('output').toLocaleString()}</b></div><div><small>缓存 Token</small><b>{total('cached').toLocaleString()}</b></div></div>{rows.map(r=><div className="usage-assistant-row" key={r.person}><b>{r.person}</b><span>{r.count} 条回复</span><span>估算费用：{r.cost===null?'未配置价格':'¥'+r.cost.toFixed(4)}</span></div>)}<small className="usage-note">说明：旧回复、未返回 usage 的接口以及未保存用量的消息不会被计入。费用依据设置中的模型价格和汇率估算，不等同于服务商账单。</small></section>
}
function Settings({onLogout,cloudStatus,assistants,setAssistants,themePrefs,setThemePrefs,conversations,modelConfig,onOpenTool}:{onLogout:()=>void;cloudStatus:string;assistants:AssistantRecord[];setAssistants:React.Dispatch<React.SetStateAction<AssistantRecord[]>>;themePrefs:ThemePrefs;setThemePrefs:(v:ThemePrefs)=>void;conversations:Record<Person,Conversation[]>;modelConfig:Record<Person,ModelConfig>;onOpenTool:(v:{person:Person;tool:Tool})=>void}) { return <div className="settings-screen"><h2>设置</h2><UsagePanel conversations={conversations} modelConfig={modelConfig}/><ThemeSettings value={themePrefs} onChange={setThemePrefs}/><div className="setting-card"><b>工作区快捷入口</b><p>快速进入各助手的模型、记忆与工具设置。</p><div className="settings-shortcuts">{(['晏未晞','言朔'] as Person[]).map(person=><div className="settings-shortcut-group" key={person}><b>{person}</b><div><button type="button" onClick={()=>onOpenTool({person,tool:'模型设置'})}>模型 API</button><button type="button" onClick={()=>onOpenTool({person,tool:'长期记忆'})}>独立记忆</button><button type="button" onClick={()=>onOpenTool({person,tool:'MCP'})}>工具权限</button></div></div>)}</div></div><div className="setting-card"><b>助手管理 · 名称</b><p>修改显示名称不会改变身份 ID，也不会移动原有聊天和记忆。新增助手功能仍在施工中。</p>{assistants.map(a=><label key={a.id} style={{display:'block',marginTop:12}}><small>{a.id}</small><input aria-label={a.id+'显示名称'} maxLength={32} style={{display:'block',width:'100%',padding:10,marginTop:4,borderRadius:10}} value={a.name} onChange={e=>setAssistants(old=>old.map(x=>x.id===a.id?{...x,name:e.target.value}:x))}/></label>)}</div><p>全局主题先保持书页感。模型、记忆、MCP 等能力逐步接入。</p><div className="setting-card"><b>当前主题</b><span>暖米白 · 书页</span></div><div className="setting-card"><b>云端数据</b><span>{cloudStatus==='error'?'最近一次保存失败，请检查连接后重试。':cloudStatus==='saving'?'正在保存最新更改…':'已启用自动保存。修改会话名称后请稍等片刻，数据会自动同步。'}</span></div><button className="settings-logout" onClick={onLogout}>退出登录</button></div> }
