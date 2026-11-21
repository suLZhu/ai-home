import { useCallback, useEffect, useMemo, useState, useRef, type FormEvent, type ChangeEvent } from 'react'
import './App.css'
import { Ledger } from './Ledger'
import { Diary } from './Diary'
import { ThemeSettings } from './ThemeSettings'
import './ThemePage.css'
import { DEFAULT_THEME,themeStyle,type ThemePrefs,type CustomAssets,type PersonAppearancePref,EMPTY_ASSETS } from './theme'
import { LEGACY_ASSISTANTS, DEFAULT_DISPLAY_NAMES, migrateLocalStorage, toAssistantId, type AssistantRecord } from './assistantIdentity'
import { CharacterSettings, blankCard, type CharacterCard } from './CharacterSettings'
import { WorldbookEditor, type WorldEntry } from './WorldbookEditor'
import { enabledSkillsBlock, loadSkills, parseSkillMarkdown } from './skills.mjs'
import { ToolDashboard } from './ToolDashboard'
import { MemoryPanel } from './MemoryPanel'
import { runLocalOrganize, tidyMemoryLibrary, readLocalAuto } from './memoryLocalOrganize.mjs'
import { readMemoryModels, embeddingTarget, embedText, cosine } from './memoryModels.mjs'
import { RichText } from './RichText.tsx'
import { UiDialogHost } from './UiDialogHost'
import { SystemSetupSheet } from './SystemSetupSheet'
import { BackupCenter } from './BackupCenter'
import { WebBrowser, type WebPage } from './WebBrowser'
import { GUIDE_BRIEF, GUIDE_MARKDOWN } from './guide.mjs'
import { applyWebUpdate, compareVersions, currentBundle, liveUpdateSupported, notifyAppReady, resetToBuiltin } from './liveUpdate.mjs'
import { applyPackVars, getActivePackId, loadThemePacks, normalizeThemePack, setActivePack as setStoredActivePack, upsertThemePack, type ThemePack } from './themePack.mjs'
import { DEFAULT_ROOM_LAYOUT, loadRoomLayout, saveRoomLayout, resetRoomLayout, type RoomItem, type RoomLayout } from './roomLayout.mjs'
import { WorkspaceSettings, type WorkspaceConfig } from './WorkspaceSettings'
import { confirmDialog } from './uiDialog'
import { planCompaction, buildSummarySystemMessage, searchHistory, CONTEXT_LIMITS } from './contextCompression.mjs'
import { IconHome, IconChat, IconSettings, IconClock, IconMemory, IconCalendar, IconSun, IconPalette, IconPlug, IconChart, IconSparkles, IconFolder, IconShield, IconInfo, IconFlower, IconPlus, IconBack, IconChevronRight, IconChevronDown, IconChevronUp, IconClose, IconEdit, IconTrash, IconEye, IconEyeOff, IconArrowUp, IconArrowDown, IconSwitch, IconShare, IconTest, IconSearch, IconMinus, IconFile, IconWarning, IconMail, IconBook, IconCheck, IconCopy, IconRefresh, IconEmoji, IconPhoto, IconCoffee, IconMusic, IconLedger, IconGrid, IconMore, IconStar, IconMenu, IconMic, IconStop, IconSend, type IconComponent } from './icons'
import { IconButton, SettingsRow } from './uiPrimitives'
import { DEFAULT_BEAUTIFY_PACK, BEAUTIFY_PACKS } from './beautify'
import { BUILTIN_THEME_PACKS } from './builtinThemePacks.mjs'
import { PersonAppearance } from './PersonAppearance'
import { reportToolCallStart, reportToolCallEnd, classifyToolError, useToolCalls, useMessageToolCalls, TOOL_STATUS_LABEL, type ToolCallSource } from './toolCalls'
import { decideTaskConsumption, parseTaskEnvelope } from './taskResult.mjs'
import { normalizeTimeZone, buildTimeContext } from './timeContext.mjs'
// 生成态待发送队列：纯函数状态机 + 本机持久化（当前生成成功后按 scope 自动补发，非定时缓发）。
import { pendingScopeKey, makePending, setPending, clearPending, patchPendingText, markNeedsReview, loadPendingSends, savePendingSends, type PendingItem } from './pendingSend.mjs'
// 模型输出清洗：隐藏 <system_warning> 系统注入、移除 DSML/function_calls 协议标签。
// SSE 逐块到达，标签可能被拆到多个 chunk，必须用有状态的流式清洗器（见 messageCleanup.mjs）。
import { cleanupMessageText, createStreamCleanup } from './messageCleanup.mjs'
// 消息呈现层纯函数：Token 汇总 / 工具卡分组 / reasoning 翻译判定与请求构造。
import { formatDuration, summarizeTokenUsage, groupToolCalls, needsChineseTranslation, buildTranslationMessages } from './messagePresentation.mjs'
// 消息操作：重新生成目标解析 + 历史消息 id 补齐/对齐（编辑、删除、重新生成按 id 定位）。
import { resolveRegenerateContext, alignMessageIds } from './messageOps.mjs'
import { needsUpload, assetIdsOfMessages, collectReferencedAssetIds, releasedAssetIds } from './attachmentRefs.mjs'
import { messageWithVision, historyVisionMessageIndexes, historicalMessageWithoutVision } from './visionAttachments.mjs'
// 会话内消息搜索（微信式）：纯字符串匹配 + 上一条/下一条循环 + messageId 定位。
import { searchMessages, stepMatchIndex, type ChatSearchResult } from './chatSearch.mjs'
// 云端恢复决策（数据安全）：启动动作判定、覆盖前本地备份、快照→视图提取。
import { RECOVERY_BACKUP_KEY, decideCloudLoadAction, classifyCloudLoadError, shouldBackupBeforeApply, buildRecoveryBackup, pickActiveConversationIds, pickActiveMessagesFromSnapshot } from './cloudRecovery.mjs'
// 模型请求诊断（黑匣子）：只旁路观察最终 payload，绝不改请求、绝不记录凭证。
// 资源库绑定层：设置区一次性添加模型/MCP/世界书，聊天窗口按助手选择由哪个使用。
import { createToolExecutionBudget } from './toolExecutionBudget.mjs'
import { clipContextText, compactToolSchema, takeWithinBudget } from './contextBudget.mjs'
import { emptyBinding, normalizeProfiles, normalizeBindings, normalizePool, isInPool, togglePool, poolLabel, resolveModelConfig, resolveMcpConnections, isWorldEntryBound, toggleWorldEntryBinding, toggleMcpId, type ModelProfile, type PersonBinding, type ChatPool } from './resourceBindings.mjs'
// 供应商中心：预置服务商 + 模型多选 + 多 KEY；勾选结果同步进模型预设池。
import { normalizeVendors, syncVendorProfiles, allVendorKeys, resolveVendorKey, resolveKeyCandidates, chatRequestUrl, modelListUrl, groupModels, orderedKeys, DEFAULT_API_PATH, type Vendor } from './vendors.mjs'
// 订阅账号：本地持久化归一化；极简账号登录面板单独放一个文件。
import { SUBSCRIPTION_STORAGE_KEY, normalizeSubscriptions, type SubscriptionAccount } from './subscriptionChannels.mjs'
import { SubscriptionAccounts } from './SubscriptionAccounts'
// 统一模型线路层：一个逻辑模型可挂多条线路，主线路优先 + 自动 fallback。
// 线路配置（可能含内联 Key）只存本机，整包不进云端快照。
import { logicalModelId, buildRoutePlan, MAX_ROUTE_ATTEMPTS } from './modelRoutes.mjs'
import { ROUTE_STATE_KEY, normalizeRouteState, activeLogicalId, fixedRouteId, type RouteState } from './routeState.mjs'
import { summarizeRouteReport } from './routeFallback.mjs'
// 统一简洁下拉：替换原生 select，避免 Android WebView 弹系统白方框。
import { SoftSelect } from './SoftSelect'
import { ModelPickerSheet } from './ModelPickerSheet'
import { ModelSpecPage } from './ModelSpecPage'
import { ModelChips } from './ModelChips'
import { specForModel, withModelSpec, clearModelSpec, specBadges, inferModelSpec } from './modelSpecs.mjs'
import { parseKelivoModelConfigs, kelivoConfigsToVendors, kelivoImportSummary } from './kelivoImport.mjs'
// 用户设置：每位助手单独记「怎么称呼用户 / 用户是谁 / 偏好」，聊天时注入 system 提示。
import { USER_SETTINGS_KEY, blankUserSettings, normalizeUserSettings, buildUserContext, type UserSettings } from './userSettings.mjs'
// 头像：本机选图裁方压缩，两位助手各存一份，互不影响。
import { fileToAvatar, isAvatarDataUrl } from './avatarImage.mjs'
import { ChatDisplaySettings, useChatDisplay } from './ChatDisplay'
import { AppLockSettings } from './AppLockSettings'
import { UsageStats } from './UsageStats'
import { formatMessageTime, loadChatDisplay } from './chatDisplayPrefs.mjs'
// 统一 API Base URL：Web 同源（空 base）与 Android/生产（构建期 VITE_API_BASE_URL + 开发者设置覆盖）走同一机制。
import { API_BASE_STORAGE_KEY, resolveApiBase, normalizeApiBase, assetUrl, apiFetch, setApiBase, getApiBase, isLocalMode, setSessionToken, clearSessionToken } from './apiBase.mjs'
// Android 返回键处理栈：临时层（灯泡图/搜索/多选/表情/设置子页）先关，栈空才退出到根。
import { pushBackHandler, handleBack as runBackStack } from './backStack.mjs'
import { App as CapApp } from '@capacitor/app'
import { loadCustomAssets, saveCustomAssets } from './assetStore.mjs'
// Android 系统能力：真实状态列表、系统通知、精确闹钟、开机恢复。
// 桌面没有原生桥时全部静默降级，不影响现有聊天 / 订阅 / 多线路链路。
import { AndroidSystemSettings } from './AndroidSystemSettings'
import { channelPlan, notificationPayload, decideNotification, loadNotified, markNotified, routeFromNotificationOpen } from './notificationDispatch.mjs'
import { buildAlarmPlan } from './taskAlarms.mjs'
import { readNotificationPrefs } from './notificationPreferences.mjs'
import { registerSystemHandlers, clearConversationNotifications, systemBridgeAvailable, syncSystemChannels, syncSystemAlarms, showSystemNotification, consumePendingOpen, readNativeDelivered, setGenerationForeground, nativeTextZoomAvailable, setAppTextZoom, nativeHttpStreamAvailable, openNativeWebView, readClipboardText, appVersion } from './nativeSystem.mjs'
import { friendlyHttpError, routeInfoFromError } from './chatHttpError.mjs'
import { readActiveGeneration, startGeneration, finishGeneration, needsGenerationRecovery, recoverInterruptedMessages } from './generationRecovery.mjs'
import { BRAND_NAME, brandAsset } from './brandAssets'
// 像素黑白选框/图标层必须最后导入，才能覆盖各组件自带的彩色样式。
import './pixel.css'
// 薄雾 Mist 收尾层：Tokens → Components → Pages 的组件层，最后加载统一视觉。
import './mist.css'
// 极简白底基线必须最后加载：先统一结构，再做下一轮主题。
import './minimal.css'

type InboxMessage={id:string;person:Person;content:string;kind:string;created_at:string;read_at?:string|null}
type Page = 'home' | 'room' | 'fun' | 'settings'
// v3 起 Person 就是 assistantId；显示名只在渲染层查 displayName(id)。
type Person = string
const YWX: Person = 'assistant-yanweixi'
const YS: Person = 'assistant-yanshuo'
const ASSISTANT_PEOPLE: Person[] = [YWX, YS]
// 启动时把旧版以中文人名为键的本机数据一次性迁移到 assistantId（幂等）。
migrateLocalStorage()
// 助手名字只有一份：显示名 assistants[].name。旧版本角色卡里另存过一份「角色卡名称」，
// 两处各改各的就会出现「assistant-002 / 助手2号」不一致。初始化 / 云端恢复时统一对齐，
// 保证系统提示词里的角色名跟界面上的名字一致；names 为空时沿用旧值，避免覆盖老快照。
function alignCardNames(cards:Record<string,CharacterCard>|null|undefined, names:AssistantRecord[]):Record<Person,CharacterCard>{
  return Object.fromEntries(ASSISTANT_PEOPLE.map(id=>{
    const label=names.find(a=>a.id===id)?.name
    const card=cards?.[id]||blankCard(id)
    return [id,{...card,name:label||card.name||DEFAULT_DISPLAY_NAMES[id]||id}]
  })) as Record<Person,CharacterCard>
}
type Tool = '人物设置' | '世界书' | '记忆面板' | '工作流' | '自主生活' | 'MCP' | '模型设置' | 'SKILL 技能库' | '角色外观' | '工具调用看板' | '助手档案'
type MessageAttachment = { name: string; type: string; size: number; preview?: string; dataUrl?: string; textContent?: string; assetId?: string }
type TokenUsage = { at?: string; model?: string; promptTokens?: number; completionTokens?: number; cachedTokens?: number; cacheReadTokens?: number; elapsedMs?: number; preflightMs?: number; firstTokenMs?: number; streamMs?: number; tokensPerSecond?: number }
type ChatMessage = { role: 'user' | 'assistant'; content: string; at?: string; id?: string; contextNote?: string; attachments?: MessageAttachment[]; usage?: TokenUsage; taskRunId?: string; reasoning?: string }
type Conversation = { id:string; title:string; messages:ChatMessage[]; updatedAt:string; summary?:string; summaryThroughId?:string; summaryThrough?:number; summaryAt?:string }

async function fetchWithSoftTimeout(input:string, init:RequestInit, timeoutMs:number, parentSignal?:AbortSignal):Promise<Response>{
  const controller=new AbortController()
  const abort=()=>controller.abort()
  if(parentSignal){
    if(parentSignal.aborted) controller.abort()
    else parentSignal.addEventListener('abort',abort,{once:true})
  }
  const timer=window.setTimeout(()=>controller.abort(),timeoutMs)
  try{return await apiFetch(input,{...init,signal:controller.signal})}
  finally{
    window.clearTimeout(timer)
    parentSignal?.removeEventListener('abort',abort)
  }
}

async function settleWithin<T>(promise:Promise<T>, timeoutMs:number, fallback:T):Promise<T>{
  let timer:number|undefined
  try{
    return await Promise.race([promise,new Promise<T>(resolve=>{timer=window.setTimeout(()=>resolve(fallback),timeoutMs)})])
  }finally{
    if(timer!==undefined)window.clearTimeout(timer)
  }
}
type ModelConfig = { endpoint: string; model: string; inputPrice?: string; outputPrice?: string; cachedInputPrice?: string; usdToCny?: string }
type MCPConnection = { id: string; person: Person; name: string; url: string; transport: string; enabled: boolean; hasToken?: boolean }
// 资源库：全局模型预设池 + 每位助手的绑定。旧快照缺这两个字段时完全沿用旧行为。
// API Key 仍按助手单独存放（走 /api/keys，不进快照），预设里只放地址/模型/计价。
const MODEL_PROFILES_KEY = 'ai-home.modelProfiles'
const BINDINGS_KEY = 'ai-home.bindings'
// 供应商（含 API Key）只存本机，不进云端快照；勾选池不含凭证，随快照同步。
const VENDORS_KEY = 'ai-home.vendors'
const DEFAULT_MODEL_KEY = 'ai-home.defaultModel'
const CHAT_POOL_KEY = 'ai-home.chatPool'
type ProjectTask={id:string;text:string;done:boolean}
type ProjectRecord={id:string;title:string;description:string;status:'进行中'|'已归档';category:string;updatedAt:string;nextStep?:string;tasks?:ProjectTask[]}
type MemoryEntry = { id:string; title:string; content:string; keywords:string; category:'人物关系'|'经历事件'|'偏好习惯'|'项目进度'|'其他'; pinned:boolean; updatedAt:string }
function readMessages(): Record<Person,ChatMessage[]> {
  const old = read<any>('ai-home.messages', {})
  const migrate = (xs:any[]):ChatMessage[] => xs.map(x => typeof x === 'string' ? {role:'user',content:x} : x).filter(x => x && (x.role === 'user' || x.role === 'assistant') && typeof x.content === 'string').map(x=>({...x,attachments:(x.attachments||[]).map((a:any)=>({name:a.name,type:a.type,size:a.size,preview:a.preview,assetId:a.assetId,textContent:a.textContent}))}))
  return Object.fromEntries(ASSISTANT_PEOPLE.map(id=>[id,migrate(Array.isArray(old?.[id])?old[id]:[])])) as Record<Person,ChatMessage[]>
}

// 工作区只陈列 6 个「小程序」卡片：模型 / 世界书 / MCP 的选择与绑定在聊天窗口，
// 资源的增删改与 API Key 统一在「设置 → 资源库」。三类工具面板本身仍保留，
// 设置页的快捷入口可以直达，但房间工作区不再陈列这些配置入口。
// 云端凭证失效 → 已自动切回本地模式的一次性提示语（三处降级点共用同一句文案）。
const FALLBACK_LOCAL_NOTICE = '云端登录已过期，已切换为本地模式（数据只存本机）'
// 系统默认名 → 当前默认名（仅迁移「从未改过名」的助手，用户改过的名字保留）。
// 历史默认名含旧中文名与「默认助手/默认助手2号」，统一视为未自定义并换成编号名。
function applyDefaultDisplayNames(list: AssistantRecord[]): AssistantRecord[] {
  return list.map(a => ({ ...a, name: String(a.name || '').trim() || DEFAULT_DISPLAY_NAMES[a.id] || a.id }))
}

function read<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || '') as T } catch { return fallback }
}
function initialConversations():Record<Person,Conversation[]> {
  const saved=read<any>('ai-home.conversations',null)
  if(saved&&ASSISTANT_PEOPLE.every(id=>Array.isArray(saved[id]))) return Object.fromEntries(ASSISTANT_PEOPLE.map(id=>[id,saved[id]])) as Record<Person,Conversation[]>
  const old=readMessages();const now=new Date().toISOString()
  const legacyId:Record<Person,string>={[YWX]:'legacy-yanweixi',[YS]:'legacy-yanshu'}
  return Object.fromEntries(ASSISTANT_PEOPLE.map(id=>[id,[{id:legacyId[id],title:'旧聊天',messages:old[id],updatedAt:now}]])) as Record<Person,Conversation[]>
}

// 真实工具调用事件统一由 src/toolCalls.ts 的事件层上报（见 send() 内调用点）；
// 模型文字永远不会产生调用记录。

// 软键盘弹起时，Android WebView 的 100dvh 不一定跟着缩小，布局可能整体被上推：
// 消息列表滚到屏幕外，只剩一片空白。键盘高度优先用 visualViewport 量到的真实重叠，
// Android 11+ edge-to-edge 下窗口不随 IME 缩小、visualViewport 量不到时，改用原生回传的
// --native-ime-bottom 兜底（见 MainActivity 的 ime inset 处理）。判定逻辑抽到
// keyboardViewport.mjs，便于单测。原生 inset 重分发（aihome:insets）也触发重算。
import { computeKeyboardState } from './keyboardViewport.mjs'
import { genDebug } from './generationDebug.mjs'
function useKeyboardViewport(){
  useEffect(()=>{
    const vv=window.visualViewport
    const root=document.documentElement
    const clear=()=>{
      root.style.removeProperty('--app-visual-height')
      root.style.removeProperty('--app-keyboard-height')
      delete root.dataset.keyboard
      delete root.dataset.keyboardNative
    }
    let blurTimer: ReturnType<typeof setTimeout>|undefined
    const isEditing=()=>{
      const active=document.activeElement as HTMLElement|null
      return !!active&&(active.tagName==='INPUT'||active.tagName==='TEXTAREA'||active.isContentEditable)
    }
    const apply=()=>{
      // Android may dispatch an old IME inset after the send button blurs the editor.
      // Do not re-open keyboard spacing while no editable element has focus.
      if(!isEditing()){clear();return}
      const innerHeight=window.innerHeight
      const vvHeight=vv?vv.height:innerHeight
      const vvOffsetTop=vv?vv.offsetTop:0
      const nativeIme=parseFloat(getComputedStyle(root).getPropertyValue('--native-ime-bottom'))||0
      const st=computeKeyboardState({innerHeight,vvHeight,vvOffsetTop,innerWidth:window.innerWidth,nativeIme})
      if(st.open){
        root.style.setProperty('--app-keyboard-height',st.height+'px')
        if(st.source==='visualViewport'){
          // 窗口已随键盘缩小：直接把聊天锁封顶到可视高度，无需底部留白。
          root.style.setProperty('--app-visual-height',st.visualHeight+'px')
          delete root.dataset.keyboardNative
        }else{
          // 原生 IME：窗口未缩小，不重设整体高度，只在聊天锁底部留出键盘高度，
          // 把输入区顶到键盘上沿（CSS: html[data-keyboard-native="open"] .shell-chat-lock）。
          root.style.removeProperty('--app-visual-height')
          root.dataset.keyboardNative='open'
        }
        root.dataset.keyboard='open'
      }else clear()
    }
    apply()
    if(vv){
      vv.addEventListener('resize',apply)
      vv.addEventListener('scroll',apply)
    }
    window.addEventListener('resize',apply)
    // 原生 inset 重分发：键盘开合 / 切后台回前台 / 页面重新聚焦 / WebView resize 后，
    // 即使 visualViewport 无变化也要重新应用键盘高度。
    window.addEventListener('aihome:insets',apply)
    // 发送/点按钮后输入框失焦、键盘收起：若没有可编辑元素，主动清掉键盘占位，
    // 避免「发送后输入栏停在半屏、下面一大片空白」。
    const onFocusOut=()=>{
      if(blurTimer)window.clearTimeout(blurTimer)
      // Clear immediately, then recheck after Android's IME close animation.
      window.requestAnimationFrame(()=>{if(!isEditing())clear()})
      blurTimer=window.setTimeout(()=>{if(!isEditing())clear();else apply()},300)
    }
    const onFocusIn=()=>{if(blurTimer)window.clearTimeout(blurTimer);apply()}
    document.addEventListener('focusout',onFocusOut,true)
    document.addEventListener('focusin',onFocusIn,true)
    return ()=>{
      if(vv){vv.removeEventListener('resize',apply);vv.removeEventListener('scroll',apply)}
      window.removeEventListener('resize',apply)
      window.removeEventListener('aihome:insets',apply)
      document.removeEventListener('focusout',onFocusOut,true)
      document.removeEventListener('focusin',onFocusIn,true)
      if(blurTimer)window.clearTimeout(blurTimer)
      clear()
    }
  },[])
}

export default function App() {
  useKeyboardViewport()
  // 真机证据：切后台 / 回前台打点（对照 generation 链路日志，判断后台是否被系统暂停）。
  useEffect(() => {
    const onVis = () => genDebug(document.hidden ? 'app_backgrounded' : 'app_foregrounded', { hidden: document.hidden })
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])
  const [page, setPage] = useState<Page>(() => {
    try {
      const restored = sessionStorage.getItem('ai-home.afterRestorePage')
      if (restored === 'settings') {
        sessionStorage.removeItem('ai-home.afterRestorePage')
        return 'settings'
      }
    } catch { /* ignore */ }
    return 'home'
  })
  const pageBeforeSettings = useRef<Page>('home')
  // 鉴权状态提前声明：通知点击路由 / 闹钟同步的 effect 依赖数组会立即求值。
  const [authStatus, setAuthStatus] = useState<'checking'|'signedOut'|'signedIn'>('checking')
  // 冷启动点击通知时会话还没装载：先暂存，等鉴权 / 快照就绪再路由。
  const authStatusRef = useRef<string>('checking')
  useEffect(()=>{ authStatusRef.current = authStatus },[authStatus])
  const [themePrefs,setThemePrefs]=useState<ThemePrefs>(()=>({...DEFAULT_THEME,...read<Partial<ThemePrefs>>('ai-home.themePrefs',DEFAULT_THEME)}))
  // Android：字体大小交给原生 textZoom（系统字号 × App 倍数），整站文字一起缩放；
  // 桌面浏览器没有原生层时退回 CSS --font-scale，只缩放语义字号。
  useEffect(()=>{ if(nativeTextZoomAvailable()) setAppTextZoom(themePrefs.scale) },[themePrefs.scale])
  const [beautifyPack]=useState<string>(()=>read('ai-home.beautifyPack',DEFAULT_BEAUTIFY_PACK))
  useEffect(()=>{ try{localStorage.setItem('ai-home.beautifyPack',JSON.stringify(beautifyPack))}catch{ /* private mode */ } },[beautifyPack])
  // 全面屏状态栏 / 手势条图标明暗跟随主题：夜间主题用亮色图标，浅色主题用深色图标。
  // JS 接口在页面加载早期可能尚未注入，做几次短重试；Web 端不存在该接口，静默跳过。
  useEffect(()=>{
    const dark=themePrefs.theme==='night'
    let tries=0
    const sync=()=>{
      const bars=(window as any).AiHomeBars
      if(bars&&typeof bars.setDarkIcons==='function'){bars.setDarkIcons(!dark);return}
      if(tries++<12)window.setTimeout(sync,250)
    }
    sync()
    return ()=>{tries=999}
  },[themePrefs.theme])
  // 昵称不再单独编辑：「我的」页已去掉，称呼优先用助手设置里的「助手怎么称呼你 / 你的名字」，
  // 这里只保留历史值作为提示词里最后一级回退。
  const [roomName]=useState<string>(()=>{const saved=read<string>('ai-home.roomName','我的房间');return saved==='我的房间'?'用户':saved})
  const [customAssets,setCustomAssets]=useState<CustomAssets>(()=>read<CustomAssets>('ai-home.customAssets',EMPTY_ASSETS))
  // 大文件素材（字体/背景/气泡）存 IndexedDB：localStorage 只有 ~5MB，装不下字体。
  // 启动时从 IDB（或旧 localStorage 副本）恢复；保存失败才回退 localStorage。
  useEffect(()=>{ let cancelled=false; loadCustomAssets(EMPTY_ASSETS).then((v:CustomAssets)=>{ if(!cancelled) setCustomAssets(v) }).catch(()=>{ /* 恢复失败保持初始值 */ }); return ()=>{cancelled=true} },[])
  useEffect(()=>{ saveCustomAssets(customAssets).catch(()=>{ try{localStorage.setItem('ai-home.customAssets',JSON.stringify(customAssets))}catch{ console.warn('自定义素材过大，未能存入本地存储') } }) },[customAssets])
  const [personAppearance,setPersonAppearance]=useState<Record<string,PersonAppearancePref>>(()=>read('ai-home.personAppearance',{}))
  useEffect(()=>{ try{localStorage.setItem('ai-home.personAppearance',JSON.stringify(personAppearance))}catch{ /* private mode */ } },[personAppearance])
  // 自定义字体：选中「自定义」时把上传的字体注入 @font-face
  useEffect(()=>{
    let el=document.getElementById('ai-custom-font') as HTMLStyleElement|null
    if(customAssets.fontData&&themePrefs.font==='custom'){
      if(!el){el=document.createElement('style');el.id='ai-custom-font';document.head.appendChild(el)}
      el.textContent='@font-face{font-family:"CustomUpload";src:url("'+customAssets.fontData+'");font-display:swap;}'
    }else if(el){el.textContent=''}
  },[customAssets.fontData,themePrefs.font])
  const [assistants, setAssistants] = useState<AssistantRecord[]>(() => applyDefaultDisplayNames(read<AssistantRecord[]>('ai-home.assistants', LEGACY_ASSISTANTS.map(a => ({...a, createdAt:'1970-01-01T00:00:00.000Z'})))))
  const displayName = (id: Person) => assistants.find(a => a.id === id)?.name || DEFAULT_DISPLAY_NAMES[id] || id
  const [person, setPerson] = useState<Person>(YWX)
  const [chatOpen, setChatOpen] = useState(false)
  const [drafts, setDrafts] = useState<Record<string,string>>(() => read<Record<string,string>>('ai-home.chatDrafts', {}))
  const [messages, setMessages] = useState<Record<Person, ChatMessage[]>>(readMessages)
  const [conversations,setConversations] = useState<Record<Person,Conversation[]>>(initialConversations)
  const [activeConversationIds,setActiveConversationIds] = useState<Record<Person,string>>(()=>{const saved=read<Record<string,string>>('ai-home.activeConversationIds',{});const all=initialConversations();return Object.fromEntries(ASSISTANT_PEOPLE.map(id=>[id,all[id].some(c=>c.id===saved[id])?saved[id]:all[id][0]?.id||''])) as Record<Person,string>})
  // Drafts are isolated by assistant AND conversation, including during background generation.
  const [sendingScopes, setSendingScopes] = useState<Record<string,boolean>>({})
  const [generationStages, setGenerationStages] = useState<Record<string,''|'preparing'|'connecting'|'streaming'|'tools'>>({})
  const draftKey = pendingScopeKey(person, activeConversationIds[person] || '')
  const sending = !!sendingScopes[draftKey]
  const draft = drafts[draftKey] || ''
  const setDraft = (value: string | ((previous: string) => string)) => {
    setDrafts(previous => {
      const nextValue = typeof value === 'function' ? value(previous[draftKey] || '') : value
      return { ...previous, [draftKey]: nextValue }
    })
  }
  useEffect(() => { try { localStorage.setItem('ai-home.chatDrafts', JSON.stringify(drafts)) } catch {} }, [drafts])
  // 流式生成是异步长任务：send() 闭包里的 activeConversationIds 会随用户切换会话而过期。
  // 用 ref 持有最新值，让流式回写能判断「视图是否还停在原会话」，避免把内容写进错误的会话。
  const activeConversationIdsRef = useRef(activeConversationIds)
  useEffect(() => { activeConversationIdsRef.current = activeConversationIds }, [activeConversationIds])
  // 任务结果消费判定要读「最新的持久化会话状态」；轮询回调里的闭包会过期，用 ref 兜底。
  const conversationsRef = useRef(conversations)
  useEffect(() => { conversationsRef.current = conversations }, [conversations])
  const [modelConfig, setModelConfig] = useState<Record<Person,ModelConfig>>(() => { const saved:any=read('ai-home.modelConfig',null); const blank={inputPrice:'',outputPrice:'',cachedInputPrice:'',usdToCny:'7.2'}; if(saved&&typeof saved==='object'&&!saved.endpoint&&ASSISTANT_PEOPLE.every(id=>saved[id])) return Object.fromEntries(ASSISTANT_PEOPLE.map(id=>[id,{...blank,...saved[id]}])) as Record<Person,ModelConfig>; const legacy=saved&&typeof saved.endpoint==='string'?saved:{endpoint:'',model:''}; return Object.fromEntries(ASSISTANT_PEOPLE.map(id=>[id,{...blank,...legacy}])) as Record<Person,ModelConfig> })
  const [apiKey, setApiKey] = useState<Record<Person,string>>(() => { const saved=read<Record<string,string>|null>('ai-home.apiKey',null); return Object.fromEntries(ASSISTANT_PEOPLE.map(id=>[id,saved?.[id]||''])) as Record<Person,string> })
  // 本机工作区配置（按助手）：只在服务器模式下有；聊天工具据此决定是否向模型开放文件/Git/命令。
  const [workspaceConfigs, setWorkspaceConfigs] = useState<Record<string, WorkspaceConfig>>({})
  const [webPage, setWebPage] = useState<WebPage | null>(null)
  const [chatError, setChatError] = useState('')
  const [memory, setMemory] = useState<Record<Person, string>>(() => { const saved=read<Record<string,string>>('ai-home.memory',{}); return Object.fromEntries(ASSISTANT_PEOPLE.map(id=>[id,saved?.[id]||''])) as Record<Person,string> })
  const [memoryEntries, setMemoryEntries] = useState<Record<Person,MemoryEntry[]>>(() => { const saved=read<Record<string,MemoryEntry[]>>('ai-home.memoryEntries',{}); return Object.fromEntries(ASSISTANT_PEOPLE.map(id=>[id,Array.isArray(saved?.[id])?saved[id]:[]])) as Record<Person,MemoryEntry[]> })
  const [prompt, setPrompt] = useState<Record<Person, string>>(() => { const saved=read<Record<string,string>>('ai-home.prompt',{}); return Object.fromEntries(ASSISTANT_PEOPLE.map(id=>[id,saved?.[id]||''])) as Record<Person,string> })
  const [characters, setCharacters] = useState<Record<Person,CharacterCard>>(() => alignCardNames(read<Record<string,CharacterCard>>('ai-home.characters',{}), assistants))
  // 用户设置按助手隔离：这个助手怎么称呼我、我是谁、有哪些偏好，聊天时注入首条 system 提示。
  const [userSettings,setUserSettings]=useState<Record<Person,UserSettings>>(()=>normalizeUserSettings(read<unknown>(USER_SETTINGS_KEY,null),ASSISTANT_PEOPLE))
  const [worldEntries, setWorldEntries] = useState<WorldEntry[]>(() => { const raw:any=read('ai-home.worldEntries', []); if(Array.isArray(raw)) return raw.map((e:any)=>({...e,boundCharacters:(Array.isArray(e.boundCharacters)?e.boundCharacters:(e.boundCharacter?[e.boundCharacter]:[])).map((x:string)=>toAssistantId(String(x)))})); return ASSISTANT_PEOPLE.flatMap((id:any)=>Array.isArray(raw?.[id])?raw[id].map((e:any)=>({...e,boundCharacters:[id]})):[]) })
  const [worldbook, setWorldbook] = useState<Record<Person, string>>(() => { const saved=read<Record<string,string>>('ai-home.worldbook',{}); return Object.fromEntries(ASSISTANT_PEOPLE.map(id=>[id,saved?.[id]||''])) as Record<Person,string> })
  const [mcpConnections, setMcpConnections] = useState<Record<Person, MCPConnection[]>>(() => { const saved=read<Record<string,MCPConnection[]>>('ai-home.mcpConnections',{}); return Object.fromEntries(ASSISTANT_PEOPLE.map(id=>[id,Array.isArray(saved?.[id])?saved[id]:[]])) as Record<Person,MCPConnection[]> })
  // 设置区「资源库」统一维护：模型预设是全局池，bindings 记录每位助手用哪套。
  const [modelProfiles, setModelProfiles] = useState<ModelProfile[]>(() => normalizeProfiles(read<unknown>(MODEL_PROFILES_KEY, [])))
  const [bindings, setBindings] = useState<Record<Person,PersonBinding>>(() => normalizeBindings(read<unknown>(BINDINGS_KEY, null), ASSISTANT_PEOPLE))
  // 供应商与 Key 只落本机；聊天窗口「设置页勾选池」决定哪些世界书 / MCP 会出现在图标面板。
  const [vendors, setVendors] = useState<Vendor[]>(() => normalizeVendors(read<unknown>(VENDORS_KEY, null)))
  // 默认模型：助手没单独选模型时用它兜底，只存本机。
  const [defaultModelId, setDefaultModelId] = useState<string>(() => String(read<unknown>(DEFAULT_MODEL_KEY, '') || ''))
  // 订阅账号含 API Key，只存本机；云端快照里永远不含这一项。
  const [subscriptions, setSubscriptions] = useState<SubscriptionAccount[]>(() => normalizeSubscriptions(read<unknown>(SUBSCRIPTION_STORAGE_KEY, [])))
  const [chatPool, setChatPool] = useState<ChatPool>(() => normalizePool(read<unknown>(CHAT_POOL_KEY, null)))
  // 线路层：线路配置 + 当前选中的逻辑模型 + 按助手手动固定的线路。
  // 独立于 modelProfiles / bindings 存放，老快照与老配置完全不受影响。
  const [routeState, setRouteState] = useState<RouteState>(() => normalizeRouteState(read<unknown>(ROUTE_STATE_KEY, null)))
  const [lastRouteInfo, setLastRouteInfo] = useState('')
  const [projects,setProjects]=useState<ProjectRecord[]>(()=>read('ai-home.projects',[]))
  // 用户配置的 IANA 时区：只影响服务端生成的时间上下文（日期/星期/时间/时段），
  // 不发起任何网络请求。非法或空值由 normalizeTimeZone 回退到 Asia/Shanghai。
  const [timeZone,setTimeZone]=useState<string>(()=>normalizeTimeZone(read<string>('ai-home.timeZone','')))
  useEffect(()=>{ try{localStorage.setItem('ai-home.timeZone',JSON.stringify(timeZone))}catch{ /* private mode */ } },[timeZone])
  // ── Android 返回键 ──
  // 顺序：先让返回键处理栈关临时层（灯泡图/搜索/多选/表情/设置子页）；
  // 栈空且在聊天页 → 关聊天回房间；栈空且在根页面 → 退出 App。
  // Web 端无 backButton 事件，此 effect 静默不生效，不影响浏览器行为。
  const chatOpenRef = useRef(chatOpen)
  useEffect(()=>{ chatOpenRef.current = chatOpen },[chatOpen])
  // ── Android 系统能力：通知去重、点击直达会话、原生闹钟同步 ─────────────────
  const personRef = useRef(person)
  useEffect(()=>{ personRef.current = person },[person])
  const pageRef = useRef(page)
  useEffect(()=>{ pageRef.current = page },[page])
  const assistantsRef = useRef(assistants)
  useEffect(()=>{ assistantsRef.current = assistants },[assistants])
  const charactersRef = useRef(characters)
  useEffect(()=>{ charactersRef.current = characters },[characters])
  const pendingNotificationRef = useRef<any>(null)
  type SystemHandlers = { onOpen:(payload:any)=>void; onTaskFire:(runId:string)=>void; onStatusChanged:()=>void }
  const systemHandlersRef = useRef<SystemHandlers>({ onOpen:()=>{}, onTaskFire:()=>{}, onStatusChanged:()=>{} })
  // 原生闹钟触发时，若 WebView 进程还活着就立刻补跑一次本地任务结算。
  const localTaskTickRef = useRef<()=>void>(()=>{})
  const [alarmSyncTick, setAlarmSyncTick] = useState(0)
  // Read receipts dismiss only the visible conversation's message notifications.
  // This does not stop or dismiss the foreground generation service.
  useEffect(() => {
    const clearViewed = () => {
      if (page !== 'room' || !chatOpen || document.hidden || !readNotificationPrefs().autoClear) return
      clearConversationNotifications(person, activeConversationIds[person] || '')
    }
    clearViewed()
    document.addEventListener('visibilitychange', clearViewed)
    window.addEventListener('focus', clearViewed)
    return () => {
      document.removeEventListener('visibilitychange', clearViewed)
      window.removeEventListener('focus', clearViewed)
    }
  }, [page, chatOpen, person, activeConversationIds])

  // 「成功写入聊天」是唯一允许发通知的入口；重复调用也不会发第二条。
  const notifyAfterWrite = useCallback((input: Record<string, unknown>) => {
    const prefs = readNotificationPrefs()
    if (!prefs.enabled || (!prefs.proactive && ['task','task_result','task_notice'].includes(String(input.kind || '')))) return false
    const who = String(input.person || '')
    const payload = notificationPayload({
      ...input,
      label: assistantsRef.current.find(a => a.id === who)?.name || '',
      avatar: charactersRef.current[who]?.avatar || '',
    })
    const decision = decideNotification({
      payload,
      activePerson: personRef.current,
      activeConversationId: activeConversationIdsRef.current[who] || '',
      page: pageRef.current,
      chatOpen: chatOpenRef.current,
      visible: typeof document !== 'undefined' && !document.hidden,
      notified: loadNotified(localStorage),
      // 锁屏期间原生闹钟已弹过的 runId：恢复前台补写聊天时不再弹第二条。
      nativeDelivered: readNativeDelivered(),
    })
    genDebug('notification_requested',{key:payload.key,kind:payload.kind,person:payload.assistantId,conversationId:payload.conversationId,notify:decision.notify,reason:decision.reason||'?'})
    if (!decision.notify) return false
    const sent = showSystemNotification({ ...payload, silent: !prefs.sound })
    // 去重集合记的是「通知发出的时间」，不是消息产生的时间：补跑几天前的任务
    // 不会因为这个时间戳过期而在后续轮询里重复弹。
    if (sent) markNotified(localStorage, payload.key, Date.now())
    return sent
  }, [])
  const sendingRef = useRef<Record<string,boolean>>({})
  // 切后台/锁屏期间 WebView 若被系统回收，快照里会残留一条空内容的助手占位气泡。
  // 回前台或冷启动状态就绪后，只把它标成「上次回复未完成」，不覆盖已写出的内容。
  const recoverStaleGeneration = useCallback(() => {
    const active = readActiveGeneration(localStorage)
    if (!active || !needsGenerationRecovery(active, Object.values(sendingRef.current).some(Boolean))) return false
    const personId = String(active.person || '')
    const convId = String(active.conversationId || '')
    const messageId = String(active.messageId || '')
    finishGeneration(localStorage, messageId)
    const patch = (list: any[]) => recoverInterruptedMessages(list, messageId).messages
    if (convId) setConversations(old => ({ ...old, [personId]: (old[personId] || []).map(c => c.id === convId ? { ...c, messages: patch(c.messages || []) } : c) }))
    if (!convId || activeConversationIdsRef.current[personId] === convId) setMessages(old => ({ ...old, [personId]: patch(old[personId] || []) }))
    return true
  }, [])
  // 每次渲染后把最新状态灌进处理器引用，避免原生回调拿到过期的会话状态。
  useEffect(() => {
    const activateConversation = (personId: string, conversationId: string) => {
      setPerson(personId); setPage('room'); setChatOpen(true); setActiveTool(''); setToast(null)
      if (!conversationId) return
      const target = (conversationsRef.current[personId] || []).find(c => c.id === conversationId)
      if (!target) return
      const prevActive = activeConversationIdsRef.current[personId]
      if (prevActive === target.id) return
      setConversations(old => ({ ...old, [personId]: (old[personId] || []).map(c => c.id === prevActive ? { ...c, messages: messages[personId] || [], updatedAt: new Date().toISOString() } : c) }))
      setActiveConversationIds(old => ({ ...old, [personId]: target.id }))
      setMessages(old => ({ ...old, [personId]: target.messages || [] }))
    }
    systemHandlersRef.current = {
      onOpen: (payload) => {
        genDebug('notification_tapped',{payload})
        const route = routeFromNotificationOpen(payload, assistantsRef.current.map(a => a.id))
        if (!route) return
        genDebug('route_restored',{person:route.person,conversationId:route.conversationId})
        if (authStatusRef.current !== 'signedIn') { pendingNotificationRef.current = payload; return }
        const quickReply = String((payload && payload.quickReply) || '').trim()
        if (quickReply) {
          activateConversation(route.person, route.conversationId)
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('aihome:quick-reply', {
              detail: { person: route.person, conversationId: route.conversationId, text: quickReply },
            }))
          }, 1200)
          return
        }
        activateConversation(route.person, route.conversationId)
      },
      onTaskFire: () => localTaskTickRef.current(),
      onStatusChanged: () => {},
    }
  })
  useEffect(() => {
    const unregister = registerSystemHandlers({
      onOpen: (payload) => systemHandlersRef.current.onOpen(payload),
      onTaskFire: (runId) => systemHandlersRef.current.onTaskFire(runId),
      onStatusChanged: () => systemHandlersRef.current.onStatusChanged(),
    })
    const pending = consumePendingOpen()
    if (pending) pendingNotificationRef.current = pending
    const onVisible = () => {
      if (document.hidden) return
      // 回到前台先恢复上次被中断的生成状态，再处理通知点击的会话跳转。
      recoverStaleGeneration()
      const p = consumePendingOpen(); if (p) systemHandlersRef.current.onOpen(p)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => { unregister(); document.removeEventListener('visibilitychange', onVisible) }
  }, [recoverStaleGeneration])
  // 冷启动时 WebView 尚未装载完会话，等本地/云端状态就绪再跳转。
  useEffect(() => {
    if (authStatus !== 'signedIn') return
    const timer = window.setTimeout(() => {
      // 冷启动：等本地/云端会话状态装载完，再判断上次生成是否被系统中断。
      recoverStaleGeneration()
      const payload = pendingNotificationRef.current
      pendingNotificationRef.current = null
      if (payload) systemHandlersRef.current.onOpen(payload)
    }, 500)
    return () => window.clearTimeout(timer)
  }, [authStatus, recoverStaleGeneration])
  // 动态注册通知渠道：每新增一位助手就多一条渠道，原生层不写死人物。
  useEffect(() => {
    if (!systemBridgeAvailable()) return
    const names = Object.fromEntries(assistants.map(a => [a.id, a.name]))
    syncSystemChannels(channelPlan(assistants.map(a => a.id), id => names[id] || id, id => characters[id]?.avatar || ''))
  }, [assistants, characters])
  // 把仍有效的本地定时计划交给原生 AlarmManager（精确权限缺失时原生自动降级）。
  useEffect(() => {
    if (authStatus !== 'signedIn' || !systemBridgeAvailable()) return
    let cancelled = false
    const sync = async () => {
      const collected: any[] = []
      for (const a of assistantsRef.current) {
        try {
          const r = await apiFetch('/api/tasks?person=' + encodeURIComponent(a.id))
          if (!r.ok) continue
          const data: any = await r.json()
          if (Array.isArray(data.tasks)) collected.push(...data.tasks)
        } catch { /* 离线时保留上一份已注册的闹钟计划 */ }
      }
      if (cancelled) return
      // 原生在锁屏 / 后台直接弹提醒，拿不到 React 里的助手名，这里随计划一起下发。
      const names = Object.fromEntries(assistantsRef.current.map(a => [a.id, a.name]))
      const plan = buildAlarmPlan(collected, Date.now()).map(p => ({ ...p, assistantName: names[p.assistantId] || '' }))
      syncSystemAlarms(plan)
    }
    void sync()
    const timer = window.setInterval(() => void sync(), 5 * 60 * 1000)
    const onFocus = () => void sync()
    window.addEventListener('focus', onFocus)
    const bump = () => setAlarmSyncTick(v => v + 1)
    window.addEventListener('aihome:alarms-changed', bump)
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', onFocus); window.removeEventListener('aihome:alarms-changed', bump) }
  }, [authStatus, assistants, alarmSyncTick])
  useEffect(()=>{
    let cancelled = false
    const listener = CapApp.addListener('backButton', () => {
      if (cancelled) return
      if (runBackStack()) return           // 临时层消费了本次返回
      if (activeToolRef.current) { const fromSettings = toolReturnRef.current; setActiveTool(''); if (fromSettings) { setPage('settings'); setToolReturnToSettings(false) } return }
      if (chatOpenRef.current) { setChatOpen(false); return } // 聊天页 → 房间
      if (pageRef.current !== 'home') { setPage('home'); setActiveTool(''); return } // 任何页 → 主页
      void CapApp.exitApp()                // 根页面 → 退出
    })
    return () => { cancelled = true; void listener.then(h => h.remove()).catch(() => {}) }
  },[])
  // ── 生成态待发送队列（conversation queue）──
  // 一个 scope（助手 + 会话）至多 1 条 pending；刷新/切后台后由 loadPendingSends 恢复，不丢。
  // 与旧 20 秒定时缓发不同：pending 在「当前该会话的生成」成功结束后自动补发，不靠计时器。
  const [pendingSends, setPendingSends] = useState<Record<string, PendingItem>>(() => loadPendingSends(localStorage))
  const pendingSendsRef = useRef(pendingSends)
  useEffect(() => { pendingSendsRef.current = pendingSends })
  function commitPending(next: Record<string, PendingItem>) {
    try { savePendingSends(localStorage, next) } catch { /* 存储满时内存队列仍可用 */ }
    pendingSendsRef.current = next
    setPendingSends(next)
  }
  const [tasks, setTasks] = useState<Record<Person, string[]>>(() => { const saved=read<Record<string,string[]>>('ai-home.tasks',{}); return Object.fromEntries(ASSISTANT_PEOPLE.map(id=>[id,Array.isArray(saved?.[id])?saved[id]:[]])) as Record<Person,string[]> })
  const [activeTool, setActiveTool] = useState<Tool | ''>('')
  // 页面/房间/聊天之间切换时记住各自的窗口滚动位置，返回不再弹回顶部。
  const navScrollRef=useRef<Record<string,number>>({})
  const navKeyRef=useRef('')
  useEffect(()=>{
    const key=[page,activeTool,chatOpen?'chat':'main',person].join('|')
    if(navKeyRef.current&&navKeyRef.current!==key){
      navScrollRef.current[navKeyRef.current]=window.scrollY
      const y=navScrollRef.current[key]||0
      let cancelled=false
      const restore=()=>{if(!cancelled)window.scrollTo(0,y)}
      const raf=requestAnimationFrame(restore)
      const t1=window.setTimeout(restore,90)
      const t2=window.setTimeout(restore,260)
      navKeyRef.current=key
      return ()=>{cancelled=true;cancelAnimationFrame(raf);window.clearTimeout(t1);window.clearTimeout(t2)}
    }
    navKeyRef.current=key
  },[page,activeTool,chatOpen,person])
  const [toolReturnToSettings, setToolReturnToSettings] = useState(false)
  const activeToolRef = useRef<Tool | ''>(activeTool)
  const toolReturnRef = useRef(false)
  useEffect(() => { activeToolRef.current = activeTool }, [activeTool])
  useEffect(() => { toolReturnRef.current = toolReturnToSettings }, [toolReturnToSettings])
  // 聊天里点头像 → 关聊天打开助手档案；档案左上按钮据此变成「← 返回聊天」。
  const [profileFromChat,setProfileFromChat]=useState(false)
  const openAssistantProfile=(fromChat=false)=>{setProfileFromChat(fromChat);setChatOpen(false);setActiveTool('助手档案');setPage('room')}
  // 左侧抽屉默认完全收起：屏幕边缘只留一条细把手，点一下才滑出，再点遮罩 / × / 系统返回手势收起。
  // 不再定时自动收回——用户要在里面翻历史会话、重命名，自动收回会打断操作。
  const [sidebarOpen,setSidebarOpen]=useState(false)
  // 抽屉里的会话重命名：输入框与草稿只属于抽屉，不占用聊天顶栏。
  const [drawerRenameId,setDrawerRenameId]=useState<string|null>(null)
  const [drawerRenameDraft,setDrawerRenameDraft]=useState('')
  useEffect(()=>{ (window as any).AiHomeGuide=GUIDE_MARKDOWN; return ()=>{ delete (window as any).AiHomeGuide } },[])
  useEffect(()=>{ void notifyAppReady() },[])
  useEffect(()=>{
    if(!liveUpdateSupported())return
    let target=''
    try{ target=localStorage.getItem('ai-home.updateUrl')||'' }catch{}
    if(!target)return
    try{ if(localStorage.getItem('ai-home.autoUpdate')==='0')return }catch{}
    const timer=window.setTimeout(()=>{ void (async()=>{
      try{
        const res=await fetch(target,{cache:'no-store',credentials:'omit'})
        const data=await res.json()
        const version=String(data.webVersion||'')
        const bundleUrl=String(data.webUrl||'')
        if(!version||!bundleUrl)return
        const cur=await currentBundle()
        if(cur?.bundle?.version&&compareVersions(version,cur.bundle.version)<=0)return
        await applyWebUpdate(bundleUrl,version,String(data.webChecksum||'')||undefined)
      }catch{ /* 自动检查失败不打扰用户 */ }
    })() },5000)
    return ()=>window.clearTimeout(timer)
  },[])
  const [activePack,setActivePack]=useState<ThemePack|null>(()=>{const id=getActivePackId();return [...BUILTIN_THEME_PACKS,...loadThemePacks()].find(p=>p.id===id)||null})
  useEffect(()=>{ applyPackVars(activePack) },[activePack])
  useEffect(()=>{ const on=()=>{const id=getActivePackId();setActivePack([...BUILTIN_THEME_PACKS,...loadThemePacks()].find(p=>p.id===id)||null)}; window.addEventListener('aihome:theme-pack',on); return ()=>window.removeEventListener('aihome:theme-pack',on) },[])
  useEffect(()=>{
    if(!sidebarOpen)return
    const inside=(target:EventTarget|null)=>target instanceof Element&&!!target.closest('.app-sidebar,.sidebar-edge-handle')
    const onDown=(e:PointerEvent)=>{if(!inside(e.target))setSidebarOpen(false)}
    document.addEventListener('pointerdown',onDown)
  const unregister=pushBackHandler(()=>{setSidebarOpen(false);return true})
    return ()=>{document.removeEventListener('pointerdown',onDown);unregister()}
  },[sidebarOpen])
  // 工具/设置之间的返回：从设置页打开的工具，关闭后回到设置；其余回到房间。
  // 注意：这两个 effect 必须留在 App 顶层，不能写进上面的抽屉 effect 里（会触发 Invalid hook call）。
  useEffect(() => { if (!activeTool && toolReturnToSettings) { setPage('settings'); setToolReturnToSettings(false) } }, [activeTool, toolReturnToSettings])
  useEffect(() => { if (!activeTool) return; const un = pushBackHandler(() => { const fromSettings = toolReturnToSettings; setActiveTool(''); if (fromSettings) { setPage('settings'); setToolReturnToSettings(false) } return true }); return un }, [activeTool, toolReturnToSettings])
  const [funShortcut,setFunShortcut]=useState('')
  // 云端凭证失效后自动切回本地模式的一次性横幅文案（非空即显示，可手动关闭）。
  const [fallbackNotice, setFallbackNotice] = useState('')
  // 首启动不再弹「连接服务器」向导：没有配置地址时默认进入本地模式
  // （LocalBackend 应答全部 /api/*，开箱即用）。云同步地址是设置页里的可选项。
  const [apiSetupActive, setApiSetupActive] = useState(false)
  const [time, setTime] = useState('')
  const [todayLabel, setTodayLabel] = useState('')
  const [inbox,setInbox] = useState<InboxMessage[]>([])
  const [toast,setToast] = useState<InboxMessage|null>(null)
  const seenInbox = useRef<Set<string>>(new Set())
  const inboxInitialized = useRef(false)
  // 任务结果「先落盘、后确认」队列：写入 conversations 后只登记在此，
  // 等含该消息的云端快照 PUT 成功才发 /api/inbox/read——杜绝「确认了却没保存」的竞态。
  const pendingTaskAcks = useRef<Map<string, { runId: string; person: Person; conversationId: string }>>(new Map())
  // 触发一次云保存周期（确认已读需要一次成功保存作凭证）。
  const [ackTick, setAckTick] = useState(0)
  useEffect(()=>{
    if(authStatus!=='signedIn')return
    let alive=true
    const poll=async()=>{
      try {
        const response=await apiFetch('/api/inbox',{credentials:'include'})
        if(!response.ok)return
        const data=await response.json()
        if(!alive)return
        const items:InboxMessage[]=Array.isArray(data.messages)?data.messages:[]
        if(inboxInitialized.current){
          const fresh=items.filter(m=>!seenInbox.current.has(m.id))
          if(fresh.length)setToast(fresh[0])
          // 主动消息成功进入收件箱后发系统通知。任务类走「写回聊天」入口统一发，
          // 否则同一 runId 会因为 task_notice / task_result 两条收件箱行弹两次。
          for(const m of fresh){
            if(m.kind==='task_result'||m.kind==='task_notice')continue
            notifyAfterWrite({kind:m.kind||'message',person:m.person,messageId:m.id,text:m.content,at:Date.parse(m.created_at)||Date.now()})
          }
        }
        items.forEach(m=>seenInbox.current.add(m.id))
        inboxInitialized.current=true
        setInbox(items)
      }catch{/* offline polling retries */}
    }
    void poll()
        const timer=window.setInterval(poll,12000)
        return()=>{alive=false;window.clearInterval(timer)}
      },[authStatus,notifyAfterWrite])
  useEffect(()=>{if(!toast)return;const timer=window.setTimeout(()=>setToast(null),6500);return()=>window.clearTimeout(timer)},[toast])
  async function openInboxMessage(message:InboxMessage) {
    setPerson(message.person);setPage('room');setChatOpen(true);setActiveTool('');setToast(null)
    if (message.kind === 'task_result') {
      // 任务结果：跳到绑定会话供查看；已读确认交给「持久化成功后 ack」的管线，
      // 点击本身绝不提前确认——否则可能确认一条尚未落盘的消息。
      const env = parseTaskEnvelope(message.content)
      if (env?.conversationId) {
        const list = conversations[message.person] || []
        const target = list.find(c => c.id === env.conversationId)
        if (target) {
          const prevActive = activeConversationIds[message.person]
          if (prevActive !== target.id) {
            // 与 ChatPanel.openConversation 相同：先存当前视图，再装载目标会话。
            setConversations(old => ({ ...old, [message.person]: (old[message.person] || []).map(c => c.id === prevActive ? { ...c, messages: messages[message.person] || [], updatedAt: new Date().toISOString() } : c) }))
            setActiveConversationIds(old => ({ ...old, [message.person]: target.id }))
            setMessages(old => ({ ...old, [message.person]: target.messages || [] }))
          }
        }
      }
      return
    }
    try{await apiFetch('/api/inbox/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:message.id})})}catch{}
    setInbox(old=>old.map(m=>m.id===message.id?{...m,read_at:new Date().toISOString()}:m))
  }
  const [loginPassword, setLoginPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [cloudReady, setCloudReady] = useState(false)
  const [cloudStatus, setCloudStatus] = useState<'loading'|'saving'|'saved'|'error'>('loading')
  const cloudSaveInFlight = useRef(false)
  const queuedCloudSnapshot = useRef<any>(null)
  // 防抖的最大延迟哨兵：流式生成期间每个 chunk 都会重置 700ms 计时器，
  // 若不设上限，整条流可能一次都不落盘——发送后刷新即丢消息。
  // 记录「最早未保存变更」的时间，超过 CLOUD_FLUSH_MAX_MS 就强制保存。
  const CLOUD_FLUSH_MAX_MS = 5000
  const firstDirtyAtRef = useRef(0)

  const getSnapshot = useCallback(() => ({ version: 2, themePrefs, assistants, messages, conversations, activeConversationIds, modelConfig, memory, memoryEntries, prompt, characters, userSettings, worldEntries, worldbook, mcpConnections, tasks, projects, timeZone, modelProfiles, bindings, chatPool }), [themePrefs, assistants, messages, conversations, activeConversationIds, modelConfig, memory, memoryEntries, prompt, characters, userSettings, worldEntries, worldbook, mcpConnections, tasks, projects, timeZone, modelProfiles, bindings, chatPool])
  // Keep the latest snapshot available without making the one-time cloud-load callback
  // change identity on every edit. Otherwise the session-check effect reloads stale cloud
  // state after every local change and can resurrect deleted conversations.
  const latestSnapshot = useRef<any>(null)
  useEffect(() => { latestSnapshot.current = getSnapshot() }, [getSnapshot])
  const applySnapshot = useCallback((data: any) => {
    if (data.themePrefs && typeof data.themePrefs==='object' && ['lavender','paper','forest','night'].includes(data.themePrefs.theme)) setThemePrefs({...DEFAULT_THEME,...data.themePrefs})
    const restoredNames = Array.isArray(data.assistants)&&data.assistants.length?applyDefaultDisplayNames(data.assistants):[]
    if (restoredNames.length) setAssistants(restoredNames)
    if (data.conversations && ASSISTANT_PEOPLE.every(id=>Array.isArray(data.conversations[id]))) {
      const convs:Record<Person,Conversation[]>=Object.fromEntries(ASSISTANT_PEOPLE.map(id=>[id,data.conversations[id]])) as Record<Person,Conversation[]>
      // 数据安全（云端优先恢复的冲突保护）：本快照即将覆盖本地会话。若本地持有
      // 云端没有的内容（典型：上次会话末尾云保存失败，本地新、云端旧），先把本地
      // 整体备份到 localStorage——产品行为仍是云端优先，但本地不会静默消失。
      if (shouldBackupBeforeApply(conversationsRef.current, convs)) {
        try {
          localStorage.setItem(RECOVERY_BACKUP_KEY, JSON.stringify(buildRecoveryBackup(conversationsRef.current, activeConversationIdsRef.current)))
          console.warn('[ai-home] 云端快照覆盖前已备份本地聊天到 ' + RECOVERY_BACKUP_KEY)
        } catch { /* 备份失败不阻断恢复流程 */ }
      }
      setConversations(convs)
      const ids=data.activeConversationIds||{}
      setActiveConversationIds(pickActiveConversationIds(convs, ids) as Record<Person,string>)
      setMessages(pickActiveMessagesFromSnapshot(convs, ids) as Record<Person,ChatMessage[]>)
    } else if (data.messages && typeof data.messages === 'object') {
      const legacy=Object.fromEntries(ASSISTANT_PEOPLE.map(id=>[id,Array.isArray(data.messages[id])?data.messages[id]:[]])) as Record<Person,ChatMessage[]>
      setMessages(legacy)
      const now=new Date().toISOString();const legacyConvId:Record<Person,string>={[YWX]:'legacy-yanweixi',[YS]:'legacy-yanshu'}
      const convs=Object.fromEntries(ASSISTANT_PEOPLE.map(id=>[id,[{id:legacyConvId[id],title:'旧聊天',messages:legacy[id],updatedAt:now}]])) as Record<Person,Conversation[]>
      setConversations(convs);setActiveConversationIds({...legacyConvId})
    }
    if (data.modelConfig && typeof data.modelConfig === 'object') { const saved:any=data.modelConfig; if(!saved.endpoint&&ASSISTANT_PEOPLE.every(id=>saved[id])) setModelConfig(saved); else setModelConfig(Object.fromEntries(ASSISTANT_PEOPLE.map(id=>[id,saved])) as Record<Person,ModelConfig>) }
    if (data.memory && typeof data.memory === 'object') setMemory(Object.fromEntries(ASSISTANT_PEOPLE.map(id=>[id,data.memory[id]||''])) as Record<Person,string>)
    if (data.memoryEntries && typeof data.memoryEntries === 'object') setMemoryEntries(Object.fromEntries(ASSISTANT_PEOPLE.map(id=>[id,Array.isArray(data.memoryEntries[id])?data.memoryEntries[id]:[]])) as Record<Person,MemoryEntry[]>)
    if (data.prompt && typeof data.prompt === 'object') setPrompt(Object.fromEntries(ASSISTANT_PEOPLE.map(id=>[id,data.prompt[id]||''])) as Record<Person,string>)
    if (data.characters && typeof data.characters === 'object') setCharacters(alignCardNames(data.characters, restoredNames))
    else if (restoredNames.length) setCharacters((old:Record<Person,CharacterCard>)=>alignCardNames(old, restoredNames))
    // 用户设置是附加字段：旧快照没有时保持本机值不变。
    if (data.userSettings && typeof data.userSettings === 'object') setUserSettings(normalizeUserSettings(data.userSettings, ASSISTANT_PEOPLE))
    if (Array.isArray(data.worldEntries)) setWorldEntries(data.worldEntries.map((e:any)=>({...{enabled:true,always:false,useRegex:false,caseSensitive:false,scanDepth:4,sticky:0,cooldown:0,delay:0,target:'system',position:'tail',depth:4,priority:0},...e,boundCharacters:(Array.isArray(e.boundCharacters)?e.boundCharacters:(e.boundCharacter?[e.boundCharacter]:[])).map((x:string)=>toAssistantId(String(x)))}))); else if (data.worldEntries && typeof data.worldEntries === 'object') setWorldEntries(ASSISTANT_PEOPLE.flatMap((id:any)=>Array.isArray(data.worldEntries[id])?data.worldEntries[id].map((e:any)=>({...{enabled:true,always:false,useRegex:false,caseSensitive:false,scanDepth:4,sticky:0,cooldown:0,delay:0,target:'system',position:'tail',depth:4,priority:0},...e,boundCharacters:[id]})):[]))
    if (data.worldbook && typeof data.worldbook === 'object') setWorldbook(Object.fromEntries(ASSISTANT_PEOPLE.map(id=>[id,data.worldbook[id]||''])) as Record<Person,string>)
    if (data.mcpConnections && typeof data.mcpConnections === 'object') setMcpConnections(Object.fromEntries(ASSISTANT_PEOPLE.map(id=>[id,Array.isArray(data.mcpConnections[id])?data.mcpConnections[id].map((x:MCPConnection)=>({...x,person:id})):[]])) as Record<Person,MCPConnection[]>)
    if (data.tasks && typeof data.tasks === 'object') setTasks(Object.fromEntries(ASSISTANT_PEOPLE.map(id=>[id,Array.isArray(data.tasks[id])?data.tasks[id]:[]])) as Record<Person,string[]>)
    if (Array.isArray(data.projects)) setProjects(data.projects)
    // 未知/非法时区回退默认值；旧快照没有 timeZone 字段时保持本机配置不变。
    if (typeof data.timeZone === 'string' && data.timeZone.trim()) setTimeZone(normalizeTimeZone(data.timeZone))
    // 资源库字段是附加的：旧快照没有时不动本机值，行为与改造前一致。
    if (Array.isArray(data.modelProfiles)) setModelProfiles(normalizeProfiles(data.modelProfiles))
    if (data.bindings && typeof data.bindings === 'object') setBindings(normalizeBindings(data.bindings, ASSISTANT_PEOPLE))
    // 勾选池是附加字段：旧快照没有时保持本机值。供应商与 Key 从不进快照。
    if (data.chatPool && typeof data.chatPool === 'object') setChatPool(normalizePool(data.chatPool))
  }, [])
  const loadCloudState = useCallback(async () => {
    // 刚恢复过备份：先把恢复后的本地快照推到服务器，避免被旧云端快照盖回去。
    if (localStorage.getItem('ai-home.restorePending') === '1') {
      localStorage.removeItem('ai-home.restorePending')
      try {
        const saved = await apiFetch('/api/state', {
          method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: latestSnapshot.current || getSnapshot() }),
        })
        if (!saved.ok) throw new Error('HTTP ' + saved.status)
        setCloudReady(true)
        setCloudStatus('saved')
      } catch {
        setCloudReady(true)
        setCloudStatus('error')
      }
      return
    }
    const response = await apiFetch('/api/state', { credentials: 'include' })
    if (!response.ok) {
      // status 挂在错误上：调用方用 classifyCloudLoadError 区分「凭证失效」
      // （必须回登录页）与「云端暂不可用」（离线进入，本地数据保留）。
      const err = new Error(response.status === 401 ? '登录已过期，请重新登录。' : '读取云端数据失败：HTTP ' + response.status) as Error & { status?: number }
      err.status = response.status
      throw err
    }
    const result = await response.json()
    // 启动决策统一走纯函数（tests/cloud-recovery.test.mjs 锁定）：
    // 云端有快照 → apply（空本地绝无路径进入 PUT 分支，非空云端不被覆盖）；
    // 云端无快照 → 首次迁移上传本机状态。
    if (decideCloudLoadAction({ cloudState: result.state ?? null }) === 'apply-cloud') applySnapshot(result.state)
    else {
      const saved = await apiFetch('/api/state', { method: 'PUT', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify({state:latestSnapshot.current}) })
      if (!saved.ok) {
        const err = new Error('首次迁移本机数据到云端失败：HTTP ' + saved.status) as Error & { status?: number }
        err.status = saved.status
        throw err
      }
    }
    setCloudReady(true)
    setCloudStatus('saved')
    apiFetch('/api/keys', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(d => {
      const saved = d && d.keys && typeof d.keys === 'object' ? d.keys : null
      if (!saved) return
      setApiKey(prev => {
        const next = { ...prev }
        for (const p of ASSISTANT_PEOPLE) if (typeof saved[p] === 'string' && saved[p]) next[p] = saved[p]
        return next
      })
    }).catch(() => { /* 非关键路径，失败则仅用本机缓存 */ })
  }, [applySnapshot])
  // 云端凭证失效的统一降级（根治「一直弹云端登录页」）：清掉残留的服务器地址
  // 切回完整本地模式——LocalBackend 接管 /api/*、loadCloudState 读本机快照，
  // cloudReady 恢复 true，保存链路照常工作；同时用一次性横幅告知，给「去设置
  // 重新连接」的入口。与登录页的「改用本地模式」按钮走同一条路径，只是由系统
  // 在凭证失效时自动触发，不再把用户挡在登录页外。主动场景（设置页填地址、
  // 首启动向导）仍进登录页——只有「被动探测到失效」才自动降级。
  const fallBackToLocal = useCallback(async (reason: string) => {
    try { localStorage.removeItem(API_BASE_STORAGE_KEY) } catch { /* 忽略 */ }
    setApiBase('')
    setAuthError('')
    setFallbackNotice(reason)
    // loadCloudState 此时已路由到 LocalBackend：本机有快照则应用，没有则把
    // 当前内存状态首次迁移进去（upload-local），两条路都以 signedIn 收尾。
    try { await loadCloudState(); setAuthStatus('signedIn') }
    catch { setAuthStatus('signedIn'); setCloudStatus('error') }
  }, [loadCloudState])
  // 云端加载失败的统一处理（任务书场景 D）：凭证失效才回登录页；其余一律
  // 「云端暂不可用」——允许带本地数据进入（cloudReady 保持 false，所有云写入
  // 路径被门控关闭，本地数据原样保留），底部横幅非侵入提示并提供重连。
  const enterOfflineMode = useCallback((error: unknown) => {
    if (classifyCloudLoadError((error as { status?: number } | null)?.status) === 'auth') {
      // 凭证失效不再踢登录页（用户反馈「一直会有登录云端」）：自动清地址回本地。
      void fallBackToLocal(FALLBACK_LOCAL_NOTICE)
      return
    }
    setAuthStatus('signedIn')
    setCloudStatus('error')
  }, [fallBackToLocal])
  // 重连云端：成功后 loadCloudState 内部会 setCloudReady(true)+saved，同步自然恢复。
  const retryCloudConnection = useCallback(async () => {
    setCloudStatus('loading')
    try { await loadCloudState() } catch (error) { enterOfflineMode(error) }
  }, [loadCloudState, enterOfflineMode])
  const login = useCallback(async (e: FormEvent) => {
    e.preventDefault()
    setAuthError('')
    try {
      const response = await apiFetch('/api/login', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:loginPassword}) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '登录失败')
      // 服务端返回的登录 token：Android 跨源收不到 Cookie，靠它维持会话（Web 端与 Cookie 并存不冲突）。
      if (result.token) setSessionToken(result.token)
      setLoginPassword('')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error))
      return
    }
    // 密码已验证成功；云端读取失败不再阻拦进入（离线模式，本地数据保留）。
    try { await loadCloudState(); setFallbackNotice(''); setAuthStatus('signedIn') }
    catch (error) { enterOfflineMode(error) }
  }, [loginPassword, loadCloudState, enterOfflineMode])
  const logout = useCallback(async () => {
    await apiFetch('/api/logout', {method:'POST',credentials:'include'}).catch(()=>{})
    clearSessionToken()
    setCloudReady(false)
    setAuthStatus('signedOut')
    setCloudStatus('loading')
  }, [])

  // 首启动向导提交：存地址 → 立刻探测 /api/session → 三种结局：
  // 已登录（直接进）/ 未登录（转登录页）/ 连不上（返回错误留在向导，附排查提示）。
  const applyApiAddress = useCallback(async (raw: string): Promise<string> => {
    const norm = normalizeApiBase(raw)
    if (!norm) return '地址需以 http:// 或 https:// 开头，例如 http://192.168.8.4:4180'
    try { localStorage.setItem(API_BASE_STORAGE_KEY, norm) } catch { /* 存储不可用则仅本次会话生效 */ }
    setApiBase(resolveApiBase({ override: norm, buildBase: (import.meta as any).env?.VITE_API_BASE_URL ?? '' }))
    try {
      const response = await apiFetch('/api/session', { credentials: 'include' })
      const result = await response.json()
      setApiSetupActive(false)
      if (result.authenticated) {
        try { await loadCloudState(); setFallbackNotice(''); setAuthStatus('signedIn') }
        catch (error) { enterOfflineMode(error) }
      } else {
        setAuthError('')
        setAuthStatus('signedOut')
      }
      return ''
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return `连不上 ${norm}（${detail}）。请确认电脑上已运行 npm start，且手机与电脑在同一 Wi-Fi。`
    }
  }, [loadCloudState, enterOfflineMode])

  // 开发者设置里改完地址后立刻重查登录态：Android 跨源换地址不用重启 App 才生效。
  const recheckAfterApiChange = useCallback(async () => {
    if (!getApiBase()) {
      // 清空地址 = 切回本地模式：关掉向导、直接以本地快照进入，不需要密码门。
      setApiSetupActive(false)
      setAuthError('')
      setFallbackNotice('')
      try { await loadCloudState(); setAuthStatus('signedIn') }
      catch (error) { enterOfflineMode(error) }
      return
    }
    try {
      const response = await apiFetch('/api/session', { credentials: 'include' })
      const result = await response.json()
      if (result.authenticated) {
        try { await loadCloudState(); setFallbackNotice(''); setAuthStatus('signedIn') }
        catch (error) { enterOfflineMode(error) }
      } else {
        setAuthError('')
        setAuthStatus('signedOut')
      }
    } catch { /* 连不上新地址：保持现状（离线可用），不踢人 */ }
  }, [loadCloudState, enterOfflineMode])

  useEffect(() => {
    let cancelled = false
    // 本地模式下 /api/session 由 LocalBackend 恒真应答，探测照常走：
    // 进入 → 读本地快照 → signedIn；配置了地址则按云端语义探测（同历史行为）。
    apiFetch('/api/session', {credentials:'include'}).then(r=>r.json()).then(async result=>{
      if(cancelled)return
      // 凭证失效（典型：手机上残留旧服务器地址、token 已过期）→ 不再踢登录页，
      // 自动清地址切回本地模式，横幅告知可随时去设置重新连接。
      if(!result.authenticated){void fallBackToLocal(FALLBACK_LOCAL_NOTICE);return}
      try { await loadCloudState(); if(!cancelled)setAuthStatus('signedIn') }
      catch(error){ if(!cancelled)enterOfflineMode(error) }
    }).catch(()=>{
      // 连 /api/session 都不通（后端未启动/断网）：本地数据仍可用，
      // 进入离线模式而不是把用户挡在登录页外。
      if(!cancelled){setAuthStatus('signedIn');setCloudStatus('error')}
    })
    return ()=>{cancelled=true}
  }, [loadCloudState, enterOfflineMode, fallBackToLocal])

  useEffect(() => {
    if (!cloudReady || authStatus !== 'signedIn') return
    const now = Date.now()
    if (!firstDirtyAtRef.current) firstDirtyAtRef.current = now
    // 普通编辑仍走 700ms 防抖；一旦「未保存状态」滞留超过上限（典型是流式生成中
    // 每个 chunk 都重置计时器），改用 0 延迟强制落盘，保证长回复不会零次保存。
    const delay = now - firstDirtyAtRef.current >= CLOUD_FLUSH_MAX_MS ? 0 : 700
    const timer = window.setTimeout(async () => {
      firstDirtyAtRef.current = 0
      const snapshot = getSnapshot()
      if (cloudSaveInFlight.current) {
        queuedCloudSnapshot.current = snapshot
        return
      }
      cloudSaveInFlight.current = true
      let nextSnapshot: any = snapshot
      let lastSaved: any = null
      setCloudStatus('saving')
      try {
        while (nextSnapshot) {
          queuedCloudSnapshot.current = null
          const response = await apiFetch('/api/state', {method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:nextSnapshot})})
          if (response.status === 401) { setCloudReady(false); void fallBackToLocal(FALLBACK_LOCAL_NOTICE); return }
          if (!response.ok) throw new Error('HTTP '+response.status)
          lastSaved = nextSnapshot
          nextSnapshot = queuedCloudSnapshot.current
        }
        setCloudStatus('saved')
        // 任务结果确认已读的竞态防线：只有当「确实包含该消息的快照」已成功
        // PUT 到云端，才把对应收件箱行标为已读。否则页面在保存前崩溃会
        // 丢消息却显示已消费；确认后即使崩溃，重开也能从云端快照恢复。
        if (pendingTaskAcks.current.size && lastSaved) {
          for (const [inboxId, info] of [...pendingTaskAcks.current]) {
            const convs = lastSaved.conversations?.[info.person]
            const persisted = Array.isArray(convs) && convs.some((c: any) => c && c.id === info.conversationId && Array.isArray(c.messages) && c.messages.some((x: any) => x && x.taskRunId === info.runId))
            if (!persisted) continue
            pendingTaskAcks.current.delete(inboxId)
            apiFetch('/api/inbox/read', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: inboxId }) })
              .then(r => { if (!r.ok) pendingTaskAcks.current.set(inboxId, info) })
              .catch(() => { pendingTaskAcks.current.set(inboxId, info) })
            setInbox(old => old.map(m => m.id === inboxId ? { ...m, read_at: new Date().toISOString() } : m))
          }
        }
      } catch {
        setCloudStatus('error')
      } finally {
        cloudSaveInFlight.current = false
      }
    }, delay)
    return ()=>window.clearTimeout(timer)
  }, [cloudReady, authStatus, getSnapshot, messages, conversations, activeConversationIds, modelConfig, memory, memoryEntries, prompt, characters, userSettings, worldEntries, worldbook, mcpConnections, tasks, assistants, ackTick, timeZone, fallBackToLocal, modelProfiles, bindings, chatPool])

  useEffect(() => {
    if (authStatus !== 'signedIn' || isLocalMode()) return
    let alive = true
    ;(async () => {
      const next: Record<string, WorkspaceConfig> = {}
      for (const id of ASSISTANT_PEOPLE) {
        try {
          const response = await apiFetch('/api/workspace?person=' + encodeURIComponent(id), { credentials: 'include' })
          if (response.ok) next[id] = await response.json()
        } catch { /* 工作区是可选能力，读取失败不阻断应用 */ }
      }
      if (alive) setWorkspaceConfigs(next)
    })()
    return () => { alive = false }
  }, [authStatus])

  useEffect(() => {
    const update = () => {
      const now = new Date()
      setTime(new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now))
      // 日期跟着同一个计时器走：跨过零点时首页不用重新挂载也能换日期。
      setTodayLabel(now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }))
    }
    update()
    const timer = window.setInterval(update, 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => { localStorage.setItem('ai-home.assistants', JSON.stringify(assistants)) }, [assistants])
  useEffect(() => { try { localStorage.setItem('ai-home.conversations', JSON.stringify(conversations)) } catch { /* keep chat usable if local storage is full */ } }, [conversations])
  useEffect(() => localStorage.setItem('ai-home.activeConversationIds', JSON.stringify(activeConversationIds)), [activeConversationIds])
  useEffect(() => { try { localStorage.setItem('ai-home.messages', JSON.stringify(Object.fromEntries(Object.entries(messages).map(([k,v])=>[k,(v as ChatMessage[]).map(m=>({...m,attachments:m.attachments?.map(a=>({name:a.name,type:a.type,size:a.size,preview:a.preview,assetId:a.assetId,textContent:a.textContent}))}))])))) } catch { /* avoid crashing chat if local storage is full */ } }, [messages])
  // 消息 id 补齐（一次性迁移，幂等）：老版本的用户消息没有 id，而编辑/删除/重新生成都按 id 定位。
  // 视图（messages）与持久化（conversations）按「同会话、同位置、同角色同内容」对齐，
  // 保证两边拿到同一个 id——修改才能同时写进两边、刷新后仍生效。
  // alignMessageIds 无缺失时返回原引用 → changed=false → 不再 setState，effect 自然收敛不循环。
  useEffect(() => {
    let convDirty = false
    let viewDirty = false
    const nextConversations: Record<Person, Conversation[]> = { ...conversations }
    const nextMessages: Record<Person, ChatMessage[]> = { ...messages }
    for (const id of ASSISTANT_PEOPLE) {
      const convs = conversations[id] || []
      let personConvDirty = false
      let alignedView: ChatMessage[] | null = null
      const mapped = convs.map(c => {
        const isActive = activeConversationIds[id] === c.id
        const view = isActive ? (messages[id] || []) : null
        const r = alignMessageIds(view, c.messages || [])
        if (r.conv !== (c.messages || [])) personConvDirty = true
        if (isActive && r.view && r.view !== messages[id]) alignedView = r.view
        return r.conv === (c.messages || []) ? c : { ...c, messages: r.conv }
      })
      if (personConvDirty) { nextConversations[id] = mapped; convDirty = true }
      if (alignedView) { nextMessages[id] = alignedView; viewDirty = true }
      // 活跃会话不在 conversations 里（极旧数据）：只给视图侧独立补齐。
      if (!convs.some(c => c.id === activeConversationIds[id]) && (messages[id] || []).some(m => m && !m.id)) {
        const r = alignMessageIds(messages[id] || [], null)
        if (r.view) { nextMessages[id] = r.view; viewDirty = true }
      }
    }
    if (convDirty) setConversations(nextConversations)
    if (viewDirty) setMessages(nextMessages)
  }, [messages, conversations, activeConversationIds])
  useEffect(() => localStorage.setItem('ai-home.modelConfig', JSON.stringify(modelConfig)), [modelConfig])
  useEffect(() => { try { localStorage.setItem('ai-home.apiKey', JSON.stringify(apiKey)) } catch { /* private mode */ } }, [apiKey])
  useEffect(() => {
    if (!cloudReady) return
    const t = window.setTimeout(() => {
      for (const p of ASSISTANT_PEOPLE) apiFetch('/api/keys', { method:'PUT', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({person:p, apiKey:apiKey[p]||''}) }).catch(() => {})
    }, 600)
    return () => window.clearTimeout(t)
  }, [apiKey, cloudReady])
  useEffect(() => localStorage.setItem('ai-home.memory', JSON.stringify(memory)), [memory])
  useEffect(() => localStorage.setItem('ai-home.memoryEntries', JSON.stringify(memoryEntries)), [memoryEntries])
  useEffect(() => localStorage.setItem('ai-home.prompt', JSON.stringify(prompt)), [prompt])
  useEffect(() => localStorage.setItem('ai-home.characters', JSON.stringify(characters)), [characters])
  useEffect(() => { try { localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(userSettings)) } catch { /* 私密模式忽略 */ } }, [userSettings])
  useEffect(() => localStorage.setItem('ai-home.worldbook', JSON.stringify(worldbook)), [worldbook])
  useEffect(() => localStorage.setItem('ai-home.mcpConnections', JSON.stringify(mcpConnections)), [mcpConnections])
  useEffect(() => localStorage.setItem(MODEL_PROFILES_KEY, JSON.stringify(modelProfiles)), [modelProfiles])
  useEffect(() => { try { localStorage.setItem(ROUTE_STATE_KEY, JSON.stringify(routeState)) } catch { /* 私密模式忽略 */ } }, [routeState])
  useEffect(() => localStorage.setItem(BINDINGS_KEY, JSON.stringify(bindings)), [bindings])
  useEffect(() => { try { localStorage.setItem(VENDORS_KEY, JSON.stringify(vendors)) } catch { /* 私密模式忽略 */ } }, [vendors])
  useEffect(() => { try { localStorage.setItem(DEFAULT_MODEL_KEY, JSON.stringify(defaultModelId)) } catch { /* 私密模式忽略 */ } }, [defaultModelId])
  useEffect(() => { try { localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, JSON.stringify(subscriptions)) } catch { /* 私密模式忽略 */ } }, [subscriptions])
  useEffect(() => localStorage.setItem(CHAT_POOL_KEY, JSON.stringify(chatPool)), [chatPool])
  useEffect(() => localStorage.setItem('ai-home.worldEntries', JSON.stringify(worldEntries)), [worldEntries])
  useEffect(() => localStorage.setItem('ai-home.tasks', JSON.stringify(tasks)), [tasks])
  useEffect(() => { try{localStorage.setItem('ai-home.projects',JSON.stringify(projects))}catch{} },[projects])

  function openPerson(p: Person) { setPerson(p); setPage('room'); setChatOpen(true); setActiveTool('') }
  // 首页「今天的事」与底部「记忆」都走这里：直接打开某位助手的工具页。
  function openToolFor(target: Person, tool: Tool) {
    setPerson(target)
    setChatOpen(false)
    setActiveTool(tool)
    setPage('room')
  }
  // 把一次 send() 的回写锁在「发送时所在的会话」上：conversationId 由 send() 捕获。
  // 用户中途切走时只写 conversations（数据不丢、不污染别的会话），不再动当前视图；
  // 切回该会话时会从 conversations 重新装载，内容完整可见。
  function updateActiveConversationMessages(target:Person, update:(items:ChatMessage[])=>ChatMessage[], conversationId?:string) {
    const convId = conversationId ?? activeConversationIdsRef.current[target]
    if (activeConversationIdsRef.current[target] === convId) setMessages(prev=>({...prev,[target]:update(prev[target]||[])}))
    if (convId) setConversations(prev=>({...prev,[target]:(prev[target]||[]).map(c=>c.id===convId?{...c,messages:update(c.messages||[]),updatedAt:new Date().toISOString()}:c)}))
  }
  function ackInbox(id: string) {
    apiFetch('/api/inbox/read', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => {})
    setInbox(old => old.map(m => m.id === id ? { ...m, read_at: new Date().toISOString() } : m))
  }
  // ── 本地模式主动任务调度器 ────────────────────────────────────────────────
  // 不依赖云端常驻服务：App 前台每 15 秒结算一次到期任务；从后台切回时立即补跑。
  // 到点把提醒直接写进该助手的当前会话，LocalBackend 同时写一条收件箱消息，
  // 由现有收件箱轮询弹出前台横幅。runId 与消息里的 taskRunId 做幂等去重。
  useEffect(()=>{
    if(authStatus!=='signedIn')return
    let alive=true
    const tick=async()=>{
      if(!alive)return
      if(document.hidden){
        // 真机证据：后台 / 锁屏时主动任务的「执行」（写回聊天 + 结果通知）被跳过，
        // 只靠原生闹钟先弹一条提醒。对照 task_alarm_fired 与 task_exec_started 之间的缺口，
        // 即可确认「开 App 才看到 / 定点不弹」源于执行链路卡在等 WebView 回前台。
        genDebug('task_tick_skipped_hidden',{localMode:isLocalMode()})
        return
      }
      if(!isLocalMode())return
      try{
        const r=await apiFetch('/api/tasks/run',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({now:new Date().toISOString()})})
        if(!r.ok)return
        const d=await r.json()
        const fired:any[]=Array.isArray(d.fired)?d.fired:[]
        if(!alive||!fired.length)return
        for(const f of fired){
          const who=String(f.person||''),runId=String(f.runId||''),content=String(f.answer||'')
          if(!ASSISTANT_PEOPLE.includes(who)||!runId||!content)continue
          genDebug('task_exec_started',{runId,person:who,scheduledAt:String(f.runAt||''),conversationId:String(f.conversationId||'')})
          updateActiveConversationMessages(who,prev=>prev.some(x=>x&&x.taskRunId===runId)?prev:[...prev,{role:'assistant' as const,content,id:'local-task-'+runId,taskRunId:runId,contextNote:'本地主动任务'}])
          // 只有写回聊天之后才允许发通知；runId 与原生闹钟共用同一个去重键。
          notifyAfterWrite({kind:'task',person:who,runId,text:content,conversationId:String(f.conversationId||activeConversationIdsRef.current[who]||''),at:Date.parse(f.runAt)||Date.now()})
          genDebug('task_exec_completed',{runId,person:who,notifiedAt:Date.now()})
        }
        if(fired.length)setAlarmSyncTick(t=>t+1)
        // 提醒要尽快落到本机快照，别等防抖窗口。
        firstDirtyAtRef.current=Date.now()-CLOUD_FLUSH_MAX_MS
      }catch{/* 调度失败不影响聊天，下一个 tick 自动重试 */}
    }
    // 原生层在 WebView 进程仍存活时可以回调 __aihomeTaskFire 立刻补跑一次结算；
    // 进程被冻结时则由原生闹钟先发通知，回前台后这里再写回聊天且不重复通知。
    localTaskTickRef.current=()=>void tick()
    void tick()
    const timer=window.setInterval(()=>void tick(),15000)
    const onVisible=()=>{if(!document.hidden)void tick()}
    document.addEventListener('visibilitychange',onVisible)
    window.addEventListener('focus',onVisible)
        return()=>{alive=false;window.clearInterval(timer);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('focus',onVisible)}
      },[authStatus,notifyAfterWrite])
  // 定时任务结果消费：kind='task_result' 的收件箱行凭信封里的 conversationId
  // 精确写回原会话——不建新会话、不污染用户当前正看的聊天视图。幂等判定读的是
  // conversations 持久化状态里是否已含该 runId（decideTaskConsumption），不是
  // 内存去重：刷新、重启、重复轮询都不会写重。
  // 竞态防线：写入后不立即确认已读，只登记进 pendingTaskAcks；等含该消息的
  // 云端快照 PUT 成功（见云保存 effect）才发 /api/inbox/read。
  useEffect(() => {
    if (authStatus !== 'signedIn' || !cloudReady) return
    for (const m of inbox) {
      if (m.kind !== 'task_result' || m.read_at) continue
      const decision = decideTaskConsumption(conversationsRef.current[m.person], m.content)
      if (decision.action === 'write') {
        const { runId, title, answer } = decision.envelope
        const conversationId = decision.conversationId
        genDebug('task_exec_started',{runId,person:m.person,scheduledAt:String(m.created_at||''),conversationId,source:'cloud_inbox'})
        updateActiveConversationMessages(m.person, prev => prev.some(x => x && x.taskRunId === runId) ? prev : [...prev, { role: 'assistant', content: answer, id: 'task-' + runId, taskRunId: runId, contextNote: title ? '定时任务：' + title : '定时任务结果' }], conversationId)
        // 云端任务结果写回原会话后发通知；runId 与本地任务、原生闹钟是同一个稳定键。
        notifyAfterWrite({kind:'task',person:m.person,runId,text:answer,conversationId,messageId:m.id,at:Date.parse(m.created_at)||Date.now()})
        genDebug('task_exec_completed',{runId,person:m.person,notifiedAt:Date.now(),source:'cloud_inbox'})
        pendingTaskAcks.current.set(m.id, { runId, person: m.person, conversationId })
        // 把防抖哨兵拨到已超期：任务结果必须尽快落盘，之后才能确认已读。
        firstDirtyAtRef.current = Date.now() - CLOUD_FLUSH_MAX_MS
        setAckTick(t => t + 1)
      } else if (decision.action === 'already') {
        // 消息已在持久化会话里（例如上次确认前崩溃）——补确认是安全的。
        if (!pendingTaskAcks.current.has(m.id)) ackInbox(m.id)
      }
      // skip_no_conversation / skip_missing_conversation / skip_invalid：
      // 不写会话（绝不自动建会话）、不确认已读，消息保留在收件箱里可追溯。
    }
  }, [inbox, cloudReady, authStatus, notifyAfterWrite])

  // options.conversationId：缓发 flush 时把回写锁到「队列所在的会话」（用户此刻可能已切走）。
  // options.queuedIds：这些消息的气泡在排队时就已显示；构建请求时把它们从历史中排除，
  //   再合并成一条最终 user 消息——绝不重复插入、也绝不重复出现在请求里。
  // options.insertUser=false：flush 路径不再插入用户气泡（排队时已插入过）。
  // options.historyEndIndex + options.regenerate：重新生成——历史截断到原用户消息之前，
  //   把原用户消息作为本次输入重发（请求与原次一致），但原位替换旧回复、不新增气泡；
  //   失败/空白时恢复原有有效回复。
  // 返回 'ok'（完整走完）| 'fail'（配置或请求失败，调用方不得自动重试）| 'noop'（有请求在跑，本次未发出）。
  // 正在进行的模型请求：删除「正在生成」的助手消息时中止它；回写全部按 id 匹配，
  //   消息删除后天然无处可写，绝不会删除后又重新出现。
  const sendAbortRef = useRef<Record<string,{ id: string; controller: AbortController }>>({})
  async function send(textInput: string, attachments: MessageAttachment[] = [], options: { conversationId?: string; queuedIds?: string[]; insertUser?: boolean; historyEndIndex?: number; regenerate?: { replaceId: string; originalContent: string; originalUsage?: TokenUsage }; onUserInserted?: () => void } = {}): Promise<'ok'|'fail'|'noop'> {
    const text = textInput.trim()
    if ((!text && !attachments.length) || sending) return 'noop'
    const target = person
    // 聊天窗口选的模型预设优先；未绑定时回退旧的「每助手一份」配置（老数据零影响）。
    const activeModel = resolveModelConfig(bindings[target]?.modelProfileId || defaultModelId || '', modelProfiles, modelConfig[target])
    // 多 KEY：默认「备用优先、主号兜底」，服务端按顺序自动换下一把；
    // 聊天窗口显式选了某把 Key 就把它提到队首。旧的「每助手一份」Key 永远排在最后。
    const activeVendor = activeModel.vendorId ? vendors.find(v=>v.id===activeModel.vendorId) : undefined
    const activeChatUrl = activeVendor ? chatRequestUrl(activeVendor) : ''
    const apiKeyCandidates = resolveKeyCandidates(vendors, bindings[target]?.keyId || '', apiKey[target] || '', activeModel.vendorId || '')
    const activeApiKey = apiKeyCandidates[0] || resolveVendorKey(vendors, bindings[target]?.keyId || '') || apiKey[target] || ''
    // 统一模型线路层：当前逻辑模型挂了显式线路时，改走「主线路 → 自动 fallback」。
    // 没有线路就完全沿用上面的老链路（订阅登录 / 模型预设 / 多 KEY 零影响）。
    const logicalId = activeLogicalId(routeState, target, logicalModelId(activeModel.model || ''))
    const routePlan = buildRoutePlan({
      routes: routeState.routes, logicalId, vendors,
      fallbackKeys: [],
      binding: { fixedRouteId: fixedRouteId(routeState, target) },
      maxAttempts: MAX_ROUTE_ATTEMPTS,
    })
    const routeMode = routePlan.length > 0
    const subscriptionProtocol = !routeMode && activeVendor?.subscriptionChannel === 'gpt' ? 'codex'
      : !routeMode && activeVendor?.subscriptionChannel === 'claude' ? 'anthropic'
      : !routeMode && activeVendor?.subscriptionChannel === 'grok' ? 'grok' : ''
    const subscriptionAccountId = activeVendor?.subscriptionAccountId || ''
    if (subscriptionProtocol && isLocalMode() && !nativeHttpStreamAvailable()) {
      setChatError('订阅聊天需要 App 原生网络桥：请用最新 APK，或连接服务器 / 改用兼容网关。')
      return 'fail'
    }
    if (!routeMode && !subscriptionProtocol && (!activeModel.endpoint.trim() || !activeModel.model.trim() || !activeApiKey.trim())) {
      setChatError('请先在「设置 → 资源库」添加模型并在聊天窗口「配置」里选用，然后填写 API Key。')
      return 'fail'
    }
    const sendConversationId = options.conversationId ?? activeConversationIds[target] ?? ''
    const convHistory = (conversations[target]||[]).find(c=>c.id===sendConversationId)?.messages || (sendConversationId===activeConversationIds[target]?messages[target]:[])
    const history = options.historyEndIndex!=null ? convHistory.slice(0,Math.max(0,options.historyEndIndex)) : convHistory
    const card = characters[target]
    const messageCount=history.length+1
    const runtimeKey='ai-home.worldbookRuntime.'+target
    let runtime:Record<string,{activeUntil?:number;cooldownUntil?:number}>={};try{runtime=JSON.parse(localStorage.getItem(runtimeKey)||'{}')}catch{}
    const matched:WorldEntry[]=[]
    for(const entry of worldEntries.filter(e=>e.enabled&&isWorldEntryBound(e,target))){
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
    const legacyMemoryParts=memoryEntries[target]
      .filter(e=>e.pinned || e.keywords.split(/[,，、\n]/).map(k=>k.trim()).filter(Boolean).some(k=>text.includes(k)))
      .slice(0,10)
      .map(e=>'['+clipContextText(e.category,60)+'] '+clipContextText(e.title,120)+'\n'+clipContextText(e.content,1000))
    const systemWorldTop=takeWithinBudget(
      matched.filter(e=>e.target==='system'&&e.position==='top').map(e=>'['+clipContextText(e.title,120)+']\n'+clipContextText(e.content,1800)),
      7000,2000
    )
    const systemWorldTail=takeWithinBudget(
      matched.filter(e=>e.target==='system'&&e.position==='tail').map(e=>'['+clipContextText(e.title,120)+']\n'+clipContextText(e.content,1800)),
      7000,2000
    )
    const system = [
      '【当前扮演角色】你是 '+(card.name||target)+'。请始终保持该角色身份。',
      '【排版】需要时可以用 Markdown：表格、列表、代码块、标题；折叠用 <details><summary>标题</summary>正文</details>；强调颜色或字号用 <span style="color:#c46a5a;font-size:15px">文字</span>。只在确实更清楚时使用，不要每句都上颜色，也不要输出脚本或外部样式。',
      '记账工具只在用户明确要求记账时使用，成功返回前不要声称已记账。',
      '定时/提醒能力说明：用户想定时做事时，直接用 scheduled_task_create 创建定时任务（先问清时间和要做的事），到点系统会把提醒发进聊天，本地模式同样可用、不需要云端。也可以在「工具 → 主动任务/工作流」里手动管理，或用输入框的「延期发送」。不要简单回答「我做不到」。',
      card.description && '【角色描述】\n'+clipContextText(card.description,4000),
      // 用户设定：助手该怎么称呼我、我是谁、偏好与忌讳；每个助手单独配置，直接进入提示词。
      buildUserContext(userSettings[target], {roomName}),
      card.definition && '【角色设定】\n'+clipContextText(card.definition,12000),
      card.language && '【语言与表达要求】\n'+clipContextText(card.language,4000),
      prompt[target] && '【补充人物提示】\n'+clipContextText(prompt[target],6000),
      memory[target] && '【长期记忆（旧版文本）】\n'+clipContextText(memory[target],8000),
      legacyMemoryParts.length && '【长期记忆库召回】\n'+takeWithinBudget(legacyMemoryParts,6000,1200).join('\n\n'),
      worldbook[target] && '【世界书补充】\n'+clipContextText(worldbook[target],8000),
      enabledSkillsBlock(loadSkills(target),5000),
      GUIDE_BRIEF,
      systemWorldTop.length && '【世界书】\n'+systemWorldTop.join('\n\n'),
      systemWorldTail.length && '【世界书】\n'+systemWorldTail.join('\n\n')
    ].filter(Boolean).join('\n\n')
    // 记忆检索已下沉到「气泡上屏之后」执行：此前它挡在插入前，手机访问云端
    // 一个来回好几秒，用户自己的消息都要等它——现在气泡先出现，检索在后台跑。
    const attachmentLabel = attachments.length ? '\n[附件：'+attachments.map(a=>a.name).join('、')+']' : ''
    // 气泡里只显示用户输入的文字；动态时间上下文由服务端在每次模型请求前
    // 实时生成并作为独立 system 消息注入，前端不再附带任何本地上下文。
    const userMessage: ChatMessage = {at:new Date().toISOString(),role:'user',content:text,attachments:attachments.map(a=>({...a,preview:a.preview||a.dataUrl,dataUrl:undefined}))}
    // 工具调用事件绑定：一次 send() = 一个 runId；助手消息带 id，调用卡片按 messageId 挂到消息下方。
    // 重新生成复用原回复的 id：流式回写天然落在同一条消息上（= 覆盖旧回复，不新增第二版）。
    const regen = options.regenerate || null
    const assistantMessageId = regen ? regen.replaceId : crypto.randomUUID()
    const toolRunId = crypto.randomUUID()
    const toolConversationId = sendConversationId
    const abortController = new AbortController()
    const sendScope = pendingScopeKey(target,sendConversationId)
    sendAbortRef.current[sendScope] = { id: assistantMessageId, controller: abortController }
    // Batch high-frequency stream deltas so React does not rerender the whole app per token.
    let lastStreamPaint = 0
    let streamPaintTimer: ReturnType<typeof setTimeout> | undefined
    let latestStreamContent = ''
    let latestStreamReasoning = ''
    const flushStreamPaint = () => {
      if (streamPaintTimer !== undefined) { clearTimeout(streamPaintTimer); streamPaintTimer = undefined }
      lastStreamPaint = Date.now()
      const content = latestStreamContent
      const reasoning = latestStreamReasoning
      updateActiveConversationMessages(target, prev => prev.map(m => m.id === assistantMessageId ? {...m, content, reasoning} : m), sendConversationId)
    }
    const queueStreamPaint = (content: string, reasoning: string) => {
      latestStreamContent = content
      latestStreamReasoning = reasoning
      if (streamPaintTimer !== undefined) return
      const delay = Math.max(0, 90 - (Date.now() - lastStreamPaint))
      streamPaintTimer = setTimeout(flushStreamPaint, delay)
    }
    // 重新生成失败/空白时恢复原有有效回复；消息若已被用户删除，map 匹配不到、天然无副作用。
    const restoreRegenerate = () => {
      if (!regen) return
      updateActiveConversationMessages(target, prev => prev.map(m => m.id === assistantMessageId ? { ...m, content: regen.originalContent, usage: regen.originalUsage } : m), sendConversationId)
    }
    // 整条流的回写目标固定为 sendConversationId（即时=发送时所在会话；缓发 flush=队列所在会话）；
    // 用户随后切换会话不会改写别的会话。flush 路径用户气泡已显示过，只补助手占位；
    // 重新生成不插用户气泡，只把旧回复清空成「正在思考……」占位再原位重写。
    updateActiveConversationMessages(target,prev=>regen
      ? prev.map(m=>m.id===assistantMessageId?{...m,content:'',usage:undefined}:m)
      : options.insertUser===false
        ? [...prev,{role:'assistant',at:new Date().toISOString(),content:'',id:assistantMessageId}]
        : [...prev,userMessage,{role:'assistant',at:new Date().toISOString(),content:'',id:assistantMessageId}],sendConversationId)
    if(options.insertUser!==false)setDrafts(previous=>({...previous,[pendingScopeKey(target,sendConversationId)]:''}))
    // 用户气泡一入列就算「发出去了」：待发送卡片立刻消失，不必等助手回复生成完。
    options.onUserInserted?.()
    setChatError('');sendingRef.current[sendScope]=true;setSendingScopes(prev=>({...prev,[sendScope]:true}));setGenerationStages(prev=>({...prev,[sendScope]:'preparing'}))
    // 进程被系统回收时靠这条标记恢复「上次未完成的生成」，不丢空白占位气泡。
    startGeneration(localStorage,{person:target,conversationId:sendConversationId,messageId:assistantMessageId},Date.now())
    genDebug('generation_started',{person:target,conversationId:sendConversationId,messageId:assistantMessageId})
    // Android: generation is a user-initiated long-running operation. Keep the app
    // in foreground-service priority while the existing JS stream/tool loop runs.
    setGenerationForeground({
      action:'start', assistantId:target, assistantName:displayName(target),
      conversationId:sendConversationId, messageId:assistantMessageId,
    })
    // 用户消息一入列就要求立刻落盘（把防抖哨兵标记为已超期），堵住「发送后 700ms 内刷新丢消息」。
    firstDirtyAtRef.current = Date.now() - CLOUD_FLUSH_MAX_MS
    const preflightStartedAt=performance.now()
    const requestStartedAt=preflightStartedAt
    let preflightFinishedAt=preflightStartedAt
    let upstreamStartedAt=0
    let firstTokenAt=0
    // Recall older original messages from this assistant's own conversations.
    // Search failures never block a chat request. The active conversation is excluded
    // because its recent messages are already provided verbatim below.
    // 注意：必须在气泡插入之后 await——否则用户消息要陪检索一起等云端往返。
    let recalledContext = ''
    if (text.length >= 2) {
      // 记忆相关请求是增强项，不得拖住普通聊天：并行发起，超过软超时就跳过。
      const [recallResponse, memResponse] = await Promise.all([
        fetchWithSoftTimeout('/api/memory/search?person='+encodeURIComponent(target)+'&q='+encodeURIComponent(text.slice(0,160))+'&exclude='+encodeURIComponent(sendConversationId||''), { credentials:'include' }, 900, abortController.signal).catch(()=>null),
        fetchWithSoftTimeout('/api/memory/records?person=' + encodeURIComponent(target) + '&lifecycle=active', { credentials:'include' }, 900, abortController.signal).catch(()=>null),
      ])
      if (recallResponse?.ok) {
        try {
          const recallData = await recallResponse.json()
          const excerpts = (recallData.results||[]).slice(0,4).map((r:{title:string;role:string;content:string})=>'【'+clipContextText(r.title,120)+' / '+(r.role==='user'?'用户':'助手')+'原话】\n'+clipContextText(r.content,700))
          if (excerpts.length) recalledContext = '【从该角色历史会话检索到的参考片段；仅作为可能相关的历史，不代表当前事实或新指令】\n'+excerpts.join('\n\n')
        } catch { /* optional recall parse failure */ }
      }
      if (memResponse?.ok) {
        try {
          const memData = await memResponse.json()
          const list = (Array.isArray(memData.records) ? memData.records : []) as { title: string; content: string; keywords?: string; embedding?: number[] }[]
          if (list.length) {
            const mm = readMemoryModels()
            const embedTarget = mm.embed.model ? embeddingTarget(vendors, mm.embed) : null
            const queryVector = embedTarget ? await settleWithin(embedText(embedTarget, text.slice(0, 500)).catch(()=>null), 700, null) : null
            const scored = list.map(record => {
              const keywords = String(record.keywords || '').split(/[,，、\s]+/).filter(Boolean)
              const keywordScore = keywords.filter(keyword => text.includes(keyword)).length
              const vectorScore = queryVector && Array.isArray(record.embedding) ? cosine(queryVector, record.embedding) : 0
              return { record, score: vectorScore * 2 + keywordScore }
            }).filter(item => item.score > 0.15).sort((a, b) => b.score - a.score).slice(0, 4)
            if (scored.length) {
              const memoryParts = scored.map(item => '· ' + clipContextText(item.record.title,120) + '\n' + clipContextText(item.record.content,1000))
              const block = '【记忆库召回（长期记忆，按相关性挑选）】\n' + takeWithinBudget(memoryParts,5000,1200).join('\n\n')
              recalledContext = recalledContext ? recalledContext + '\n\n' + block : block
            }
          }
        } catch { /* optional memory parse/rank failure */ }
      }
    }
    const usageTotals:TokenUsage={promptTokens:0,completionTokens:0,cachedTokens:0,cacheReadTokens:0}
    // 真机证据：流式过程中每 2s 打一次「仍在接收」，用于判断后台是否被系统暂停。
    let lastStreamLog=0
    // 声明在 try 之外：catch 需要读取 answer，保留已流式到达的文本（块级作用域 let 进不了 catch）。
    let answer=''
    let finished=false
    // 记录本轮生成结果，供 finally 判断是否自动补发 pending（成功才补发；报错/中断保留）。
    let genOutcome: 'ok'|'fail'|'noop' = 'noop'
    try {
      // 缓发 flush：把已显示的待发消息从历史里排除，随后合并成一条最终 user 消息——
      // 同一条消息绝不在请求里出现两次（气泡也不重复插入）。
      const queuedFilter=options.queuedIds?new Set(options.queuedIds):null
      const priorHistory=queuedFilter?history.filter(m=>!(m&&m.id&&queuedFilter.has(m.id))):history
      // ── 上下文压缩 ──────────────────────────────────────────────
      // 不再静默丢掉更早的消息：把早段压成 conversation.summary，摘要覆盖点之后的消息
      // 全部原样带上。这样任何一条消息要么在摘要里、要么在原文里，不会失忆。
      const activeConv=(conversations[target]||[]).find(c=>c.id===sendConversationId)
      let contextSummary=String(activeConv?.summary||'')
      let summaryThroughId=String(activeConv?.summaryThroughId||'')
      let summaryCovered=Number(activeConv?.summaryThrough||0)
      let coveredIndex=summaryThroughId?priorHistory.findIndex(m=>m.id===summaryThroughId):-1
      let visibleHistory=priorHistory.slice(coveredIndex+1)
      let summaryFailed=false
      const compaction=planCompaction(visibleHistory)
      if(compaction.needed){
        // 首条真实模型请求优先：不再为了更新摘要先额外打一轮 /api/chat。
        // 已有摘要继续使用；本轮只保留最近消息。更早的原文需要时由 conversation_search 回查。
        summaryFailed=true
        visibleHistory=visibleHistory.slice(-CONTEXT_LIMITS.keepMessages)
      }
      // Restore previously uploaded image bytes for the model; a filename is not vision.
      const fetchVisionImage = (url:string) => url.startsWith('/api/attachments/')
        ? apiFetch(url,{signal:abortController.signal})
        : fetch(url,{signal:abortController.signal,credentials:'omit'})
      // 历史图片不再无限重放：文字压缩预算无法衡量 base64/视觉输入成本，
      // 过去会导致“文字不多但单次请求几十万 token”。只保留最近 1 条历史图片消息；
      // 当前用户本轮新发的图片仍完整发送，不受影响。
      const historyVisionIndexes=historyVisionMessageIndexes(visibleHistory,1)
      const previous=await Promise.all(visibleHistory.map(async (m,index)=>{
        if(m.role!=='user'||!m.attachments?.length)return {role:m.role,content:m.content}
        if(!historyVisionIndexes.has(index))return historicalMessageWithoutVision(m)
        const recentImages=m.attachments.filter(a=>a.type.startsWith('image/')).slice(-2)
        return settleWithin(messageWithVision(m.role,m.content,recentImages,fetchVisionImage),1200,historicalMessageWithoutVision(m))
      }))
      const content:any[]=[{type:'text',text:text+(attachments.filter(a=>a.textContent).map(a=>'\n\n【文件 '+a.name+' 内容】\n'+a.textContent).join(''))+(attachments.filter(a=>!a.dataUrl&&!a.textContent).map(a=>'\n[附带文件：'+a.name+'；当前未提取该文件内容]').join(''))}]
      for(const a of attachments.filter(a=>a.type.startsWith('image/'))){
        const resolved=await messageWithVision('user','',[a],fetchVisionImage)
        if(Array.isArray(resolved.content)){
          for(const part of resolved.content)if(part.type==='image_url')content.push(part)
        }else if(resolved.content)content[0].text+='\n'+resolved.content
      }
      let currentContent:any=content.some(c=>c.type==='image_url')||attachments.some(a=>a.textContent)?content:text+(attachmentLabel)
      const userTop=takeWithinBudget(
        matched.filter(e=>e.target==='user'&&e.position==='top').map(e=>'['+clipContextText(e.title,120)+']\n'+clipContextText(e.content,1800)),
        6000,2000
      ).join('\n\n')
      const userTail=takeWithinBudget(
        matched.filter(e=>e.target==='user'&&e.position!=='top'&&e.position!=='depth').map(e=>'['+clipContextText(e.title,120)+']\n'+clipContextText(e.content,1800)),
        6000,2000
      ).join('\n\n')
      if(Array.isArray(currentContent)){if(userTop)currentContent=[{type:'text',text:'【世界书】\n'+userTop+'\n\n'},...currentContent];if(userTail)currentContent=[...currentContent,{type:'text',text:'\n\n【世界书】\n'+userTail}]}else currentContent=[userTop&&'【世界书】\n'+userTop,currentContent,userTail&&'【世界书】\n'+userTail].filter(Boolean).join('\n\n')
      const historyWithWorld:any[]=[...previous]
      const assistantWorld=takeWithinBudget(
        matched.filter(e=>e.target==='assistant').map(e=>'【世界书：'+clipContextText(e.title,120)+'】\n'+clipContextText(e.content,1800)),
        6000,2000
      )
      for(const content of assistantWorld){historyWithWorld.push({role:'assistant',content})}
      const requestMessages:any[]=[
        ...(system?[{role:'system',content:system}]:[]),
        ...(contextSummary?[{role:'system',content:buildSummarySystemMessage(contextSummary,summaryCovered||Math.max(0,coveredIndex+1))}]:[]),
        ...(summaryFailed?[{role:'system',content:'【上下文提示】更早的对话因为压缩失败没有带上。需要细节时用 conversation_search 工具按关键词回顾原文，不要假装记得没看到的内容。'}]:[]),
        ...(recalledContext?[{role:'system',content:recalledContext}]:[]),
        ...historyWithWorld,
        {role:'user',content:currentContent},
      ]
      for(const e of matched.filter(e=>e.target==='system'&&e.position==='depth').slice(0,4)){const at=Math.max(system?1:0,requestMessages.length-1-Math.max(0,e.depth));requestMessages.splice(at,0,{role:'system',content:'【世界书：'+clipContextText(e.title,120)+'】\n'+clipContextText(e.content,1800)})}
      for(const e of matched.filter(e=>e.target==='user'&&e.position==='depth').slice(0,4)){const at=Math.max(system?1:0,requestMessages.length-1-Math.max(0,e.depth));requestMessages.splice(at,0,{role:'user',content:'【世界书：'+clipContextText(e.title,120)+'】\n'+clipContextText(e.content,1800)})}
      // Load tools only from the active character's server-side MCP bindings.
      const toolRoutes=new Map<string,{id:string;person:Person;name:string;connectionName:string}>()
      const openAITools:any[]=[]
      let mcpToolSchemaChars=0
      let mcpToolCount=0
      // The active assistant may manage only worldbook entries bound to itself.
      openAITools.push({type:'function',function:{name:'worldbook_create_entry',description:'在当前助手自己的世界书中新增条目。仅当用户明确要求记录或更新世界设定时使用；不要写入用户未确认的重大设定。',parameters:{type:'object',properties:{title:{type:'string'},keywords:{type:'string'},content:{type:'string'},always:{type:'boolean'},enabled:{type:'boolean'}},required:['title','keywords','content'],additionalProperties:false}}})
      openAITools.push({type:'function',function:{name:'worldbook_search_entries',description:'搜索当前助手有权限访问的世界书条目。',parameters:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false}}})
      openAITools.push({type:'function',function:{name:'worldbook_update_entry',description:'更新当前助手已绑定的世界书条目；必须先搜索并使用准确条目 ID。',parameters:{type:'object',properties:{id:{type:'string'},title:{type:'string'},keywords:{type:'string'},content:{type:'string'},always:{type:'boolean'},enabled:{type:'boolean'}},required:['id'],additionalProperties:false}}})
      // Both characters may add entries to the same authenticated shared ledger.
      openAITools.push({type:'function',function:{name:'ledger_add_entry',description:'仅当用户明确要求记账时，将一笔真实收入或支出写入用户的共享记账单。不得虚构金额；不确定的日期、币种或金额应先询问。写入后向用户确认。',parameters:{type:'object',properties:{kind:{type:'string',enum:['income','expense']},amount:{type:'number',description:'金额，正数'},currency:{type:'string',enum:['CNY','JPY','USD','EUR','HKD'],description:'币种，元默认CNY，日元JPY'},category:{type:'string'},note:{type:'string'},date:{type:'string',description:'YYYY-MM-DD，用户所在日期'},},required:['kind','amount','currency','category','date'],additionalProperties:false}}})
      // 定时任务与工作流：助手可查询/创建/管理「自己名下」的定时任务；归属与临时标记由服务端强制。
      openAITools.push({type:'function',function:{name:'scheduled_task_list',description:'查看当前助手名下所有定时任务与工作流（含标题、执行时间、是否重复、状态）。用户问"我有哪些定时任务/提醒/工作流"时使用。',parameters:{type:'object',properties:{},additionalProperties:false}}})
      openAITools.push({type:'function',function:{name:'scheduled_task_create',description:'为当前助手创建一条定时任务/工作流。仅当用户明确要求设定提醒、定时或重复任务时使用。若用户没说清时间或到点要做什么，应先询问，不要凭空编造。runAt 用 ISO 时间；recurrence 选 once(仅一次)/daily(每天)/weekly(每周)/every2h(每2小时)。temporary=true 表示这条任务之后可被助手自动删除（适合一次性提醒），重复任务应设为 false。',parameters:{type:'object',properties:{title:{type:'string',description:'任务标题'},prompt:{type:'string',description:'到点要执行的内容或要提醒用户的话'},runAt:{type:'string',description:'ISO 8601 时间，如 2026-01-01T09:00'},recurrence:{type:'string',enum:['once','daily','weekly','every2h']},temporary:{type:'boolean',description:'是否为可自动删除的临时任务，默认 true'}},required:['title','prompt','runAt'],additionalProperties:false}}})
      openAITools.push({type:'function',function:{name:'scheduled_task_manage',description:'管理当前助手已创建的定时任务：pause 暂停、resume 恢复、delete 删除。仅能操作助手自己创建的任务；用户创建的或长期(非临时)任务会被服务端拒绝，此时应如实告知用户去工作区手动处理。',parameters:{type:'object',properties:{id:{type:'string',description:'任务 ID，来自 scheduled_task_list'},action:{type:'string',enum:['pause','resume','delete']}},required:['id','action'],additionalProperties:false}}})
      // 回顾更早的对话：上下文压缩后，摘要之外的细节用这个只读工具回查原始消息。
      openAITools.push({type:'function',function:{name:'conversation_search',description:'检索当前助手所有会话的原始消息（包括已被上下文压缩的更早对话）。需要核对前情、原话或细节时使用；只读，不会修改任何数据。',parameters:{type:'object',properties:{query:{type:'string',description:'关键词或短句，1 至 60 字'},limit:{type:'number',description:'返回条数，默认 6，最多 12'}},required:['query'],additionalProperties:false}}})
      // 房间小组件：助手创建后长期存在，只有用户手动删除；本地/服务器模式都可用。
      openAITools.push({type:'function',function:{name:'widget_list',description:'列出当前助手房间工作区里已有的小组件（记账本/清单/便签/计数器）。',parameters:{type:'object',properties:{},additionalProperties:false}}})
      openAITools.push({type:'function',function:{name:'widget_create',description:'在房间工作区创建一个长期存在的、由你自由设计的小组件（不限于固定类型：记账、打卡、进度、倒计时、收藏、统计等都可以）。html 只写 body 内容（可含 style/script，不要 html/body 标签），不要依赖外部库；数据用 window.qijian.getData() 读、qijian.setData(obj) 存、qijian.onData(fn) 监听，数据会自动持久化。创建后一直留在工作区，除非用户手动删除。',parameters:{type:'object',properties:{title:{type:'string',description:'显示名称，例如“这个月的账”'},html:{type:'string',description:'小组件的 HTML/CSS/JS（body 内容）；用 qijian API 读写数据'},data:{type:'object',description:'可选初始 JSON 数据'},summary:{type:'string',description:'可选一句话摘要，卡片上显示'}},required:['title','html'],additionalProperties:false}}})
      openAITools.push({type:'function',function:{name:'widget_append',description:'往已有小组件里追加内容：记账本加一笔、清单加一项、便签追加文字、计数器加减。先用 widget_list 拿到 id。',parameters:{type:'object',properties:{id:{type:'string'},action:{type:'string',enum:['ledger','checklist','note','counter']},amount:{type:'number'},note:{type:'string'},kind:{type:'string',enum:['expense','income']},text:{type:'string'},delta:{type:'number'}},required:['id','action'],additionalProperties:false}}})
      // 联网搜索 + 内置浏览器：搜索结果由 web_search 返回，open_web_page 打开页面。
      openAITools.push({type:'function',function:{name:'web_search',description:'联网搜索网页，返回标题、真实链接和摘要。用户要求查最新信息、新闻、资料，或你不确定时使用。搜到后可以调用 open_web_page 打开具体网页。',parameters:{type:'object',properties:{query:{type:'string',description:'搜索词'}},required:['query'],additionalProperties:false}}})
      openAITools.push({type:'function',function:{name:'open_web_page',description:'在 App 内置浏览器里打开一个网页，用户随时可以关掉。只接受 http/https 链接。',parameters:{type:'object',properties:{url:{type:'string'},title:{type:'string',description:'可选标题'}},required:['url'],additionalProperties:false}}})

      // 房间场景：读取/改写开放式布局，客户端即时生效。
      openAITools.push({type:'function',function:{name:'room_get_layout',description:'读取当前助手房间的场景布局（JSON）。想改房间前先调用它，在原有 items 上增删，不要凭空整份覆盖。',parameters:{type:'object',properties:{},additionalProperties:false}}})
      openAITools.push({type:'function',function:{name:'room_set_layout',description:'把你设计的房间场景保存并立即生效。layout.background 支持任意 CSS 渐变/颜色/图片；layout.items 每项可用 x/y/w/h（百分比）、style（任意 CSS）、emoji/text、action（chat/world/mcp/skill/memory/settings，没有 action 就是纯装饰）。',parameters:{type:'object',properties:{layout:{type:'object',description:'完整房间布局',properties:{name:{type:'string'},background:{type:'object',properties:{css:{type:'string'},color:{type:'string'},image:{type:'string'}}},items:{type:'array',items:{type:'object'}}},required:['items']}},required:['layout'],additionalProperties:false}}})      // 本机工作区：只有开启后才把工具给模型；写/删/提交/命令还会在客户端逐次确认。

      // 美化包：让助手自己设计配色并应用。
      openAITools.push({type:'function',function:{name:'theme_pack_list',description:'列出用户已安装的美化包（名字、作者、主色）。想改主题前先看看已有的包。',parameters:{type:'object',properties:{},additionalProperties:false}}})
      openAITools.push({type:'function',function:{name:'theme_pack_apply',description:'按名字或 id 应用一个已安装的美化包。',parameters:{type:'object',properties:{name:{type:'string',description:'包名'},id:{type:'string',description:'包 id（可选）'}},additionalProperties:false}}})
      openAITools.push({type:'function',function:{name:'theme_pack_save',description:'创建或更新一个美化包并立即应用。pack 含 name、tokens（accent/accentSoft/surface/field/ink/muted/line）、background（color 或 image）、bubble（style/me/ai）、icons（emoji）、font（family）。颜色用 #hex 或 rgb()。',parameters:{type:'object',properties:{pack:{type:'object',description:'美化包定义',properties:{name:{type:'string'},author:{type:'string'},description:{type:'string'},tokens:{type:'object'},background:{type:'object'},bubble:{type:'object'},icons:{type:'object'},font:{type:'object'}},required:['name','tokens']}},required:['pack'],additionalProperties:false}}})
      const workspace=workspaceConfigs[target]
      if(workspace?.enabled&&!isLocalMode()){
        const rootNote='根目录：'+workspace.root
        openAITools.push({type:'function',function:{name:'workspace_list',description:'列出本机工作区某个目录下的文件（只读）。'+rootNote,parameters:{type:'object',properties:{path:{type:'string',description:'相对根目录的路径，省略表示根目录'}},additionalProperties:false}}})
        openAITools.push({type:'function',function:{name:'workspace_read',description:'读取工作区里的文本文件（只读，最多 4 万字符）。'+rootNote,parameters:{type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false}}})
        openAITools.push({type:'function',function:{name:'workspace_search',description:'在工作区里按文本搜索文件内容（只读，最多 60 条命中）。'+rootNote,parameters:{type:'object',properties:{query:{type:'string'},path:{type:'string',description:'可选，从哪个子目录开始'}},required:['query'],additionalProperties:false}}})
        openAITools.push({type:'function',function:{name:'workspace_git',description:'查看工作区的 Git 状态 / diff / 最近提交（只读）。'+rootNote,parameters:{type:'object',properties:{sub:{type:'string',enum:['status','diff','log']},path:{type:'string',description:'diff 时可限定文件'}},required:['sub'],additionalProperties:false}}})
        if(workspace.allowWrite)openAITools.push({type:'function',function:{name:'workspace_write',description:'把完整内容写入工作区里的文件（覆盖原文件；每次需要用户确认）。新建目录会自动创建。'+rootNote,parameters:{type:'object',properties:{path:{type:'string'},content:{type:'string'}},required:['path','content'],additionalProperties:false}}})
        if(workspace.allowWrite)openAITools.push({type:'function',function:{name:'workspace_replace',description:'把文件里的一段原文替换成新内容（每次需要用户确认）。找不到原文会拒绝。'+rootNote,parameters:{type:'object',properties:{path:{type:'string'},oldText:{type:'string'},newText:{type:'string'}},required:['path','oldText','newText'],additionalProperties:false}}})
        if(workspace.allowWrite)openAITools.push({type:'function',function:{name:'workspace_delete',description:'删除工作区里的文件或文件夹（每次需要用户确认）。删文件夹必须传 recursive=true。'+rootNote,parameters:{type:'object',properties:{path:{type:'string'},recursive:{type:'boolean'}},required:['path'],additionalProperties:false}}})
        if(workspace.allowWrite)openAITools.push({type:'function',function:{name:'workspace_git_commit',description:'把当前工作区的全部改动 git add -A 并提交（每次需要用户确认）。'+rootNote,parameters:{type:'object',properties:{message:{type:'string',description:'提交信息'}},required:['message'],additionalProperties:false}}})
        if(workspace.allowCommand)openAITools.push({type:'function',function:{name:'workspace_exec',description:'在工作区根目录执行 bash 命令（每次需要用户确认；30 秒超时）。用于运行测试、构建或查看文件。'+rootNote,parameters:{type:'object',properties:{command:{type:'string'},timeoutMs:{type:'number',description:'超时毫秒，默认 30000，最大 120000'}},required:['command'],additionalProperties:false}}})
      }

      try {
        const listResponse=await fetchWithSoftTimeout('/api/mcp?person='+encodeURIComponent(target),{credentials:'include'},800,abortController.signal)
        if(listResponse.ok){
          const listData=await listResponse.json()
          const activeConnections=resolveMcpConnections(listData.connections, bindings[target])
          // MCP schema 也是增强项：并行读取，每个连接都有软超时，慢服务不再串行拖住聊天。
          const toolResults=await Promise.all(activeConnections.map(async connection=>{
            try{
              const toolResponse=await fetchWithSoftTimeout('/api/mcp/'+connection.id+'/tools',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({person:target})},1200,abortController.signal)
              if(!toolResponse.ok)return null
              return {connection,toolData:await toolResponse.json()}
            }catch{return null}
          }))
          for(const loaded of toolResults){
            if(!loaded)continue
            const {connection,toolData}=loaded
            for(const tool of (toolData.tools||[])){
              const safeName=('mcp_'+connection.id.replace(/-/g,'').slice(0,8)+'_'+tool.name).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,64)
              if(toolRoutes.has(safeName)) continue
              const parameters=compactToolSchema(tool.inputSchema&&tool.inputSchema.type==='object'?tool.inputSchema:{type:'object',properties:{},additionalProperties:true},5000)
              const toolDef={type:'function',function:{name:safeName,description:('MCP 服务：'+connection.name+'；工具：'+tool.name+'。'+(tool.description||'')).slice(0,600),parameters}}
              const schemaCost=JSON.stringify(toolDef).length
              if(mcpToolCount>=24 || mcpToolSchemaChars+schemaCost>30000) continue
              mcpToolCount+=1
              mcpToolSchemaChars+=schemaCost
              toolRoutes.set(safeName,{id:connection.id,person:target,name:tool.name,connectionName:connection.name})
              openAITools.push(toolDef)
            }
          }
        }
      } catch { /* MCP is optional; continue with normal model chat. */ }
      const toolBudget=createToolExecutionBudget({roundLimit:loadChatDisplay().toolRoundLimit})
      for(let round=0;round<toolBudget.roundLimit&&!finished;round++){
        const requestBody:any={model:activeModel.model.trim(),messages:requestMessages,stream:true,stream_options:{include_usage:true}}
        if(openAITools.length){requestBody.tools=openAITools;requestBody.tool_choice='auto'}
        const chatProxy=()=>apiFetch('/api/chat',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},signal:abortController.signal,body:JSON.stringify({endpoint:activeModel.endpoint.trim(),chatUrl:activeChatUrl,apiKey:activeApiKey.trim(),apiKeys:apiKeyCandidates,timeZone,body:requestBody,...(subscriptionProtocol?{subscriptionProtocol,subscriptionAccountId}:{}),...(routeMode?{routes:routePlan}:{})})})
        if(!upstreamStartedAt){
          preflightFinishedAt=performance.now()
          upstreamStartedAt=preflightFinishedAt
        }
        setGenerationStages(prev=>({...prev,[sendScope]:'connecting'}))
        let response=await chatProxy()
        if(!response.ok){
          const detail=await response.text()
          // 上游原始报文（JSON / HTML / 堆栈）只进控制台，绝不直接显示在聊天气泡或错误条里。
          console.warn('[chat] upstream HTTP error',response.status,detail.slice(0,2000))
          if(routeMode){
            let report:any=null
            try{report=JSON.parse(detail)?.routeReport}catch{report=null}
            setLastRouteInfo(report?(summarizeRouteReport(report)||routeInfoFromError(response.status,detail)):routeInfoFromError(response.status,detail))
          }
          if(response.status===400&&/stream_options|include_usage/i.test(detail)){
            delete requestBody.stream_options;response=await chatProxy()
            if(!response.ok){const retryDetail=await response.text();console.warn('[chat] retry upstream HTTP error',response.status,retryDetail.slice(0,2000));throw new Error(friendlyHttpError(response.status,retryDetail))}
          }else throw new Error(friendlyHttpError(response.status,detail))
        }
        if(routeMode){const used=response.headers.get('X-Route-Used')||'';const usedLabel=(()=>{try{return decodeURIComponent(response.headers.get('X-Route-Label')||'')}catch{return ''}})();if(used)setLastRouteInfo('实际使用线路：'+(usedLabel||used))}
        if(!response.body) throw new Error('当前浏览器未提供流式响应读取能力')
        // 正文与思考各用一个有状态清洗器：跨 chunk 的协议标签由缓冲窗口负责识别，
        // 清洗后的增量才写进 answer / thinking（持久化与通知因此天然都是干净的）。
        const contentCleanup=createStreamCleanup();const reasoningCleanup=createStreamCleanup()
        const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';let roundText='';let thinking='';const calls:Record<number,{id:string;type:string;function:{name:string;arguments:string}}>={}
        let toolPayloadChars=0
      while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split(/\r?\n/);buffer=lines.pop()||'';for(const line of lines){if(!line.startsWith('data:'))continue;const data=line.slice(5).trim();if(!data||data==='[DONE]')continue;try{const chunk=JSON.parse(data);const usage=chunk.usage;if(usage&&typeof usage==='object'){const promptTokens=Number(usage.prompt_tokens??usage.input_tokens??0);const completionTokens=Number(usage.completion_tokens??usage.output_tokens??0);const cachedTokens=Number(usage.prompt_tokens_details?.cached_tokens??usage.input_tokens_details?.cached_tokens??0);const cacheReadTokens=Number(usage.prompt_tokens_details?.cache_read_input_tokens??usage.input_tokens_details?.cache_read_input_tokens??usage.cache_read_input_tokens??0);if(Number.isFinite(promptTokens))usageTotals.promptTokens=(usageTotals.promptTokens||0)+promptTokens;if(Number.isFinite(completionTokens))usageTotals.completionTokens=(usageTotals.completionTokens||0)+completionTokens;if(Number.isFinite(cachedTokens))usageTotals.cachedTokens=(usageTotals.cachedTokens||0)+cachedTokens;if(Number.isFinite(cacheReadTokens))usageTotals.cacheReadTokens=(usageTotals.cacheReadTokens||0)+cacheReadTokens}const delta=chunk.choices?.[0]?.delta;const thinkPiece=(delta as any)?.reasoning_content ?? (delta as any)?.reasoning;if(typeof thinkPiece==='string'&&thinkPiece){if(!firstTokenAt){firstTokenAt=performance.now();setGenerationStages(prev=>({...prev,[sendScope]:'streaming'}))}thinking+=reasoningCleanup.push(thinkPiece);queueStreamPaint(answer,thinking)}const piece=delta?.content;if(typeof piece==='string'&&piece){if(!firstTokenAt){firstTokenAt=performance.now();setGenerationStages(prev=>({...prev,[sendScope]:'streaming'}))}const cleanPiece=contentCleanup.push(piece);roundText+=cleanPiece;answer+=cleanPiece;{const _now=Date.now();if(_now-lastStreamLog>2000){lastStreamLog=_now;genDebug('stream_receiving',{person:target,conversationId:sendConversationId,messageId:assistantMessageId,len:answer.length})}queueStreamPaint(answer,thinking)}}for(const call of (delta?.tool_calls||[])){const idx=call.index??0;calls[idx]??={id:'',type:'function',function:{name:'',arguments:''}};if(call.id)calls[idx].id+=call.id;if(call.type)calls[idx].type=call.type;if(call.function?.name)calls[idx].function.name+=call.function.name;if(call.function?.arguments)calls[idx].function.arguments+=call.function.arguments}}catch{}}}
        // 本轮流结束：冲刷清洗器缓冲，把暂缓的尾部补回；未闭合的抑制块由 flush 丢弃，
        // 绝不把半截系统注入写进聊天记录或下一轮工具请求。
        const contentTail=contentCleanup.flush()
        if(contentTail){roundText+=contentTail;answer+=contentTail;updateActiveConversationMessages(target,prev=>prev.map(m=>m.id===assistantMessageId?{...m,content:answer}:m),sendConversationId)}
        const reasoningTail=reasoningCleanup.flush()
        if(reasoningTail){thinking+=reasoningTail;updateActiveConversationMessages(target,prev=>prev.map(m=>m.id===assistantMessageId?{...m,reasoning:thinking}:m),sendConversationId)}
        const toolCalls=Object.keys(calls).map(k=>calls[Number(k)]).filter(c=>c.id&&c.function.name)
        if(!toolCalls.length){finished=true;break}
        setGenerationStages(prev=>({...prev,[sendScope]:'tools'}))
        requestMessages.push({role:'assistant',content:roundText||null,tool_calls:toolCalls})
        for(const call of toolCalls){
          if(!toolBudget.tryStartTool()) throw new Error('本次消息的工具调用已达到安全上限（64 次），请缩小任务后继续。')
          const route=toolRoutes.get(call.function.name)
          let resultContent=''
          let callKey:string|null=null
          try{
            const localWorldbookTool=['worldbook_create_entry','worldbook_search_entries','worldbook_update_entry'].includes(call.function.name)
            const scheduledTaskTool=['scheduled_task_list','scheduled_task_create','scheduled_task_manage'].includes(call.function.name)
            const conversationTool=call.function.name==='conversation_search'
            const workspaceTool=call.function.name.startsWith('workspace_')
            const widgetTool=call.function.name.startsWith('widget_')
            const roomTool=call.function.name==='room_get_layout'||call.function.name==='room_set_layout'
            const themeTool=call.function.name==='theme_pack_list'||call.function.name==='theme_pack_apply'||call.function.name==='theme_pack_save'
            const webTool=call.function.name==='web_search'||call.function.name==='open_web_page'
            const logSource:ToolCallSource=webTool?'web':widgetTool?'widget':workspaceTool?'workspace':conversationTool?'memory':call.function.name==='ledger_add_entry'?'ledger':localWorldbookTool?'worldbook':scheduledTaskTool?'workflow':'mcp'
            // 真实调用点：模型发起的每一次工具调用都先登记（含随后被拒绝的），供聊天卡片与看板共用。
            let args:any;let argsParsed=true
            try{args=JSON.parse(call.function.arguments||'{}')}catch{argsParsed=false}
            callKey=reportToolCallStart({
              runId:toolRunId,conversationId:toolConversationId,messageId:assistantMessageId,
              person:target,source:logSource,
              toolName:route?route.name:call.function.name,
              serverName:route?route.connectionName:'',
              arguments:argsParsed?args:call.function.arguments||'{}',eventId:toolRunId+':'+call.id,
            })
            if(!webTool&&!widgetTool&&!roomTool&&!themeTool&&!workspaceTool&&!conversationTool&&call.function.name!=='ledger_add_entry'&&!localWorldbookTool&&!scheduledTaskTool&&(!route||route.person!==target)) throw new Error('工具没有绑定到当前人物，已拒绝调用。')
            if(!argsParsed)throw new Error('模型生成的工具参数不是合法 JSON。')
            if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('工具参数必须是 JSON 对象。')
            const toolLabel=route?route.name:(webTool?'联网 / 内置浏览器':widgetTool?'房间小组件':workspaceTool?'本机工作区':conversationTool?'回顾更早的对话':call.function.name==='ledger_add_entry'?'共享记账单':scheduledTaskTool?'定时任务':'本地工具')
            updateActiveConversationMessages(target,prev=>prev.map(m=>m.id===assistantMessageId?{...m,content:(answer?answer+'\n\n':'')+'正在调用工具：'+toolLabel+'…'}:m),sendConversationId)
            if(webTool){
              const name=call.function.name
              if(name==='web_search'){
                const searchQuery=String(args.query||'').trim()
                if(!searchQuery)throw new Error('搜索词不能为空。')
                const response=await apiFetch('/api/web/search?q='+encodeURIComponent(searchQuery),{credentials:'include'})
                const data=await response.json()
                if(!response.ok)throw new Error(data.error||'搜索失败')
                resultContent=JSON.stringify(data)
              }else{
                const url=String(args.url||'').trim()
                if(!/^https?:\/\//i.test(url))throw new Error('只能打开 http/https 网页。')
                const opened=openNativeWebView(url,String(args.title||''))
                if(!opened)setWebPage({url,title:String(args.title||'')})
                resultContent=JSON.stringify({ok:true,message:opened?'已在应用内置浏览器中打开，用户可以随时关闭。':'已打开内置浏览器。'})
              }
            }else if(widgetTool){
              const name=call.function.name
              const listResponse=await apiFetch('/api/widgets?person='+encodeURIComponent(target),{credentials:'include'})
              const listData=await listResponse.json()
              if(!listResponse.ok)throw new Error(listData.error||'读取小组件失败')
              if(name==='widget_list'){
                resultContent=JSON.stringify({widgets:(listData.widgets||[]).map((w:any)=>({id:w.id,type:w.type,title:w.title,summary:w.type==='custom'?String(w.config?.summary||'AI 小组件'):w.type==='ledger'?((w.config?.entries||[]).length+' 笔'):w.type==='checklist'?((w.config?.items||[]).length+' 项'):w.type==='counter'?String(w.config?.count||0):'便签'}))})
              }else if(name==='widget_create'){
                const html=String(args.html||'').trim()
                const legacyType=String(args.type||'')
                const type=html?'custom':(legacyType||'custom')
                const config=html?{html,data:args.data&&typeof args.data==='object'?args.data:{},summary:String(args.summary||'')}:(args.config||{})
                const createResponse=await apiFetch('/api/widgets',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({person:target,type,title:String(args.title||''),config})})
                const createData=await createResponse.json()
                if(!createResponse.ok)throw new Error(createData.error||'创建小组件失败')
                try{window.dispatchEvent(new Event('aihome:widgets-changed'))}catch{}
                resultContent=JSON.stringify({ok:true,widget:createData.widget,message:'小组件已创建，已出现在房间工作区。'})
              }else{
                const widget=(listData.widgets||[]).find((w:any)=>w.id===String(args.id||''))
                if(!widget)throw new Error('找不到这个小组件，请先用 widget_list 查看 id。')
                const config:any={...(widget.config||{})}
                const action=String(args.action||'')
                if(action==='ledger'){
                  if(widget.type!=='ledger')throw new Error('这个小组件不是记账本。')
                  const amount=Math.abs(Number(args.amount)||0)
                  if(!amount)throw new Error('记账金额不能为 0。')
                  config.entries=[...(Array.isArray(config.entries)?config.entries:[]),{id:crypto.randomUUID(),amount,note:String(args.note||''),kind:args.kind==='income'?'income':'expense',at:new Date().toISOString()}]
                }else if(action==='checklist'){
                  if(widget.type!=='checklist')throw new Error('这个小组件不是清单。')
                  const text=String(args.text||'').trim()
                  if(!text)throw new Error('清单内容不能为空。')
                  config.items=[...(Array.isArray(config.items)?config.items:[]),{id:crypto.randomUUID(),text,done:false}]
                }else if(action==='note'){
                  if(widget.type!=='note')throw new Error('这个小组件不是便签。')
                  config.text=(config.text?String(config.text)+'\n':'')+String(args.text||'')
                }else if(action==='counter'){
                  if(widget.type!=='counter')throw new Error('这个小组件不是计数器。')
                  config.count=(Number(config.count)||0)+(Number(args.delta)||1)
                }else throw new Error('不支持的小组件操作。')
                const updateResponse=await apiFetch('/api/widgets/'+encodeURIComponent(widget.id),{method:'PATCH',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({person:target,config})})
                const updateData=await updateResponse.json()
                if(!updateResponse.ok)throw new Error(updateData.error||'更新小组件失败')
                try{window.dispatchEvent(new Event('aihome:widgets-changed'))}catch{}
                resultContent=JSON.stringify({ok:true,widget:updateData.widget})
              }
            }else if(roomTool){
              const name=call.function.name
              if(name==='room_get_layout'){
                resultContent=JSON.stringify({ok:true,layout:loadRoomLayout(target),actions:['chat','world','mcp','skill','memory','settings'],note:'位置都是百分比；修改后在原布局上增删，再用 room_set_layout 保存。'})
              }else{
                const layout=args.layout
                if(!layout||typeof layout!=='object')throw new Error('layout 必须是对象。')
                const saved=saveRoomLayout(target,layout)
                try{window.dispatchEvent(new Event('aihome:room-layout'))}catch{}
                resultContent=JSON.stringify({ok:true,layout:saved,message:'房间已更新，界面立即生效。'})
              }
            }else if(themeTool){
              const name=call.function.name
              if(name==='theme_pack_list'){
                const packs=[...BUILTIN_THEME_PACKS,...loadThemePacks()].map(pk=>({id:pk.id,name:pk.name,author:pk.author,accent:pk.tokens.accent,active:pk.id===getActivePackId()}))
                resultContent=JSON.stringify({packs,message:packs.length?'':'还没有美化包，可以用 theme_pack_save 创建一个。'})
              }else if(name==='theme_pack_apply'){
                const packs=[...BUILTIN_THEME_PACKS,...loadThemePacks()]
                const target=packs.find(pk=>pk.id===String(args.id||''))||packs.find(pk=>pk.name===String(args.name||''))
                if(!target)throw new Error('找不到这个美化包，先用 theme_pack_list 查看名字。')
                setStoredActivePack(target.id)
                window.dispatchEvent(new Event('aihome:theme-pack'))
                resultContent=JSON.stringify({ok:true,applied:target.name,message:'已切换到「'+target.name+'」，界面立即生效。'})
              }else{
                if(!args.pack||typeof args.pack!=='object')throw new Error('缺少 pack 对象。')
                const pack=normalizeThemePack(args.pack)
                upsertThemePack(pack)
                setStoredActivePack(pack.id)
                window.dispatchEvent(new Event('aihome:theme-pack'))
                resultContent=JSON.stringify({ok:true,pack:{id:pack.id,name:pack.name},message:'美化包「'+pack.name+'」已保存并应用。'})
              }
            }else if(workspaceTool){
              const name=call.function.name
              const confirmMap:{[key:string]:{title:string;message:string;confirmLabel?:string;danger?:boolean}} = {
                workspace_write:{title:'写入文件',message:'写入 '+String(args.path||'')+'（'+String(args.content||'').length+' 字）？'},
                workspace_replace:{title:'修改文件',message:'在 '+String(args.path||'')+' 中替换一段内容？'},
                workspace_delete:{title:'删除文件',message:'删除 '+String(args.path||'')+(args.recursive?'（递归删除文件夹）':'')+'？',confirmLabel:'删除',danger:true},
                workspace_git_commit:{title:'Git 提交',message:'提交全部改动：\n'+String(args.message||'')},
                workspace_exec:{title:'执行命令',message:'在 '+String(workspaceConfigs[target]?.root||'工作区')+' 执行：\n'+String(args.command||''),confirmLabel:'执行',danger:true},
              }
              const prompt=confirmMap[name]
              if(prompt&&!(await confirmDialog(prompt))) throw new Error('用户拒绝了这次工作区操作。')
              const wsAction=name==='workspace_list'?'list':name==='workspace_read'?'read':name==='workspace_search'?'search':name==='workspace_write'?'write':name==='workspace_replace'?'replace':name==='workspace_delete'?'delete':name==='workspace_git'?'git':name==='workspace_git_commit'?'git_commit':'exec'
              const wsArgs=name==='workspace_list'?{path:args.path}:name==='workspace_read'?{path:args.path}:name==='workspace_search'?{query:args.query,path:args.path}:name==='workspace_write'?{path:args.path,content:args.content}:name==='workspace_replace'?{path:args.path,oldText:args.oldText,newText:args.newText}:name==='workspace_delete'?{path:args.path,recursive:args.recursive}:name==='workspace_git'?{sub:args.sub,path:args.path}:name==='workspace_git_commit'?{message:args.message}:{command:args.command,timeoutMs:args.timeoutMs}
              const response=await apiFetch('/api/workspace/run',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({person:target,action:wsAction,args:wsArgs})})
              const data=await response.json()
              if(!response.ok)throw new Error(data.error||'工作区操作失败')
              resultContent=JSON.stringify(data.result)
            }else if(conversationTool){
              const query=String(args.query||'').trim()
              if(!query)throw new Error('回顾更早的对话需要关键词。')
              // 当前会话的消息可能还在内存态（messages[target]），合并进去一起检索。
              const searchable={...conversations,[target]:(conversations[target]||[]).map(c=>c.id===sendConversationId?{...c,messages:priorHistory}:c)}
              const hits=searchHistory(searchable,target,query,Number(args.limit)||6)
              resultContent=JSON.stringify({person:target,query,hits,note:hits.length?'':'没有检索到相关原文。'})
            }else if(localWorldbookTool){
              const owned=worldEntries.filter(e=>e.boundCharacters?.includes(target))
              if(call.function.name==='worldbook_search_entries'){
                const q=String(args.query||'').trim().toLowerCase()
                const found=owned.filter(e=>(e.title+' '+e.keywords+' '+e.content).toLowerCase().includes(q)).slice(0,20).map(e=>({id:e.id,title:e.title,keywords:e.keywords,content:e.content.slice(0,1200),enabled:e.enabled,always:e.always}))
                resultContent=JSON.stringify({person:target,entries:found})
              }else if(call.function.name==='worldbook_create_entry'){
                if(!String(args.title||'').trim()||!String(args.content||'').trim())throw new Error('新增世界书条目需要标题和内容。')
                const entry:WorldEntry={id:crypto.randomUUID(),title:String(args.title).trim().slice(0,160),keywords:String(args.keywords||'').slice(0,500),content:String(args.content).trim().slice(0,12000),enabled:args.enabled!==false,always:Boolean(args.always),boundCharacters:[target],useRegex:false,caseSensitive:false,scanDepth:4,sticky:0,cooldown:0,delay:0,target:'system',position:'tail',depth:4,priority:0}
                setWorldEntries(old=>[entry,...old]);resultContent=JSON.stringify({ok:true,person:target,id:entry.id,title:entry.title,message:'世界书条目已新增并绑定当前助手。'})
              }else{
                const existing=owned.find(e=>e.id===String(args.id||''));if(!existing)throw new Error('找不到属于当前助手的条目，拒绝修改。')
                const patch:any={};for(const key of ['title','keywords','content','always','enabled'])if(args[key]!==undefined)patch[key]=args[key]
                setWorldEntries(old=>old.map(e=>e.id===existing.id?{...e,...patch,updatedAt:new Date().toISOString()}:e));resultContent=JSON.stringify({ok:true,person:target,id:existing.id,message:'世界书条目已更新。'})
              }
            }else if(scheduledTaskTool){
            // 定时任务/工作流走服务端；创建用 workflows/manage（写入 created_by=当前助手），查询用 /api/tasks。
            if(call.function.name==='scheduled_task_list'){
              const r=await apiFetch('/api/tasks?person='+encodeURIComponent(target),{credentials:'include'})
              const d=await r.json();if(!r.ok)throw new Error(d.error||'查询定时任务失败')
              resultContent=JSON.stringify({person:target,tasks:(d.tasks||[]).map((t:any)=>({id:t.id,title:t.title,prompt:t.prompt,runAt:t.run_at,recurrence:Number(t.interval_minutes)===120?'every2h':t.recurrence,status:t.status,createdBy:t.created_by,temporary:!!t.temporary}))})
            }else if(call.function.name==='scheduled_task_create'){
              const r=await apiFetch('/api/workflows/manage',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({person:target,action:'create',title:args.title,prompt:args.prompt,runAt:args.runAt,recurrence:args.recurrence==='every2h'?'daily':args.recurrence||'once',intervalMinutes:args.recurrence==='every2h'?120:0,temporary:args.temporary!==false,conversationId:toolConversationId})})
              const d=await r.json();if(!r.ok)throw new Error(d.error||'创建定时任务失败')
              resultContent=JSON.stringify({ok:true,message:'定时任务已创建。',task:{id:d.task.id,title:d.task.title,runAt:d.task.run_at,recurrence:Number(d.task.interval_minutes)===120?'every2h':d.task.recurrence,status:d.task.status}});try{window.dispatchEvent(new Event('aihome:alarms-changed'))}catch{}
            }else{
              const r=await apiFetch('/api/workflows/manage',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({person:target,action:args.action,id:args.id})})
              const d=await r.json();if(!r.ok)throw new Error(d.error||'管理定时任务失败')
              resultContent=JSON.stringify(d.ok?{ok:true,message:'操作成功。'}:d);if(d.ok){try{window.dispatchEvent(new Event('aihome:alarms-changed'))}catch{}}
            }
            }else{
            const toolResponse=call.function.name==='ledger_add_entry'
              ? await apiFetch('/api/ledger',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({...args,actor:target,requestId:call.id})})
              : await apiFetch('/api/mcp/'+route!.id+'/call',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({person:target,name:route!.name,arguments:args})})
            const toolData=await toolResponse.json();if(!toolResponse.ok)throw new Error(toolData.error||'MCP 工具调用失败')
            resultContent=JSON.stringify(call.function.name==='ledger_add_entry'?toolData:(toolData.result??null))
            }
            resultContent=typeof resultContent==='string'?resultContent:JSON.stringify(resultContent??null)
            if(callKey)reportToolCallEnd(callKey,{status:'succeeded',resultSummary:resultContent})
          }catch(error){
            const message=error instanceof Error?error.message:String(error)
            resultContent=JSON.stringify({error:message})
            if(callKey)reportToolCallEnd(callKey,{status:'failed',errorMessage:message,errorCode:classifyToolError(message)})
          }
          {
            const perToolCap = call.function.name === 'workspace_read' ? 12000 : 6000
            let payload = resultContent
            if (payload.length > perToolCap) {
              payload = payload.slice(0, perToolCap) + '\n[结果已截断：原始 ' + resultContent.length + ' 字符]'
            }
            toolPayloadChars += payload.length
            if (toolPayloadChars > 30000) {
              payload = payload.slice(0, 1500) + '\n[本轮工具结果总量超限，已截断；需要细节请重新按关键词查询]'
            }
            requestMessages.push({role:'tool',tool_call_id:call.id,content:payload})
          }
        }
        {
          const toolMsgs = requestMessages.filter((m:any) => m.role === 'tool')
          toolMsgs.slice(0, -3).forEach((m:any) => {
            if (typeof m.content === 'string' && m.content.length > 800) {
              m.content = m.content.slice(0, 800) + '\n[较早的工具结果已压缩，需要时重新查询]'
            }
          })
        }
        if(toolBudget.isLastRound(round)) throw new Error('连续工具调用已达到所选上限（'+toolBudget.roundLimit+' 轮），请缩小任务或调整轮数后继续。')
      }
      genDebug('generation_completed',{person:target,conversationId:sendConversationId,messageId:assistantMessageId,elapsedMs:Math.max(1,Math.round(performance.now()-requestStartedAt)),completionTokens:usageTotals.completionTokens||0})
      const elapsedMs=Math.max(1,Math.round(performance.now()-requestStartedAt))
      const completionTokens=usageTotals.completionTokens||0
      const hasUsage=Boolean(usageTotals.promptTokens||usageTotals.completionTokens||usageTotals.cachedTokens||usageTotals.cacheReadTokens)
      const preflightMs=Math.max(0,Math.round(preflightFinishedAt-requestStartedAt))
      const firstTokenMs=firstTokenAt?Math.max(0,Math.round(firstTokenAt-upstreamStartedAt)):undefined
      const streamMs=firstTokenAt?Math.max(0,Math.round(performance.now()-firstTokenAt)):undefined
      const finalUsage:TokenUsage|undefined=hasUsage?{...usageTotals,model:activeModel.model,at:new Date().toISOString(),elapsedMs,preflightMs,firstTokenMs,streamMs,tokensPerSecond:completionTokens&&streamMs?Math.round(completionTokens/(streamMs/1000)*10)/10:undefined}:undefined
      if(!answer){
        // 重新生成拿到空白回复：不覆盖旧回复，恢复原样并提示（防止有效回复被空白顶掉）。
        if(regen){restoreRegenerate();setChatError('重新生成没有返回内容，已保留原来的回复。');return 'fail'}
        updateActiveConversationMessages(target,prev=>prev.map(m=>m.id===assistantMessageId?{...m,content:'（接口已响应，但没有收到文本内容。请检查模型名称、工具调用兼容性或接口的流式支持。）',usage:finalUsage}:m),sendConversationId)
      }
      else if(finalUsage) updateActiveConversationMessages(target,prev=>prev.map(m=>m.id===assistantMessageId?{...m,usage:finalUsage}:m),sendConversationId)
      // Ordinary replies now use the same deduplicated native notification path as
      // proactive/task messages. The decision layer suppresses it only while the
      // exact conversation is visibly open; background/lock-screen/other-chat gets it.
      if(answer){notifyAfterWrite({
        kind:'message', person:target, messageId:assistantMessageId,
        conversationId:sendConversationId, text:answer, at:Date.now(),
      });genDebug('conversation_write_completed',{person:target,conversationId:sendConversationId,messageId:assistantMessageId})}
      genOutcome='ok'
      return 'ok'
    } catch(err) {
      const msg=err instanceof Error?err.message:String(err)
      // 用户删除「正在生成」的回复会触发中止：消息已不在，不写错误文案、也不弹错误提示。
      if(!abortController.signal.aborted){
        if(regen){
          // 重新生成失败 → 恢复原有有效回复，绝不把旧回复换成失败占位。
          restoreRegenerate()
          setChatError('重新生成失败：'+(msg.includes('Failed to fetch')?(isLocalMode()?'连接模型接口失败，请检查模型设置里的 API 地址与网络。':'连接失败，请确认后端服务（'+(getApiBase()||'本机后端')+'）正在运行。'):msg))
        }else{
          setChatError(msg.includes('Failed to fetch')?(isLocalMode()?'连接模型接口失败：请检查模型设置里的 API 地址、API Key 与网络后重试。':'连接失败：后端未响应，请确认后端服务（'+(getApiBase()||'本机后端 127.0.0.1:4180')+'）正在运行，或检查网络后重试。'):msg)
          // 失败时保留已经流式到达的文本，只追加一行失败说明，不把已生成内容整段抹掉。
          updateActiveConversationMessages(target,prev=>prev.map(m=>m.id===assistantMessageId&&m.role==='assistant'?{...m,content:(answer?answer+'\n\n':'')+'（请求失败，请查看上方错误提示并检查模型设置。）'}:m),sendConversationId)
        }
      }
      genOutcome='fail'
      return 'fail'
    } finally {
      if (streamPaintTimer !== undefined) flushStreamPaint()
      if(sendAbortRef.current[sendScope]?.id===assistantMessageId)delete sendAbortRef.current[sendScope]
      delete sendingRef.current[sendScope]
      setSendingScopes(prev=>({...prev,[sendScope]:false}));setGenerationStages(prev=>({...prev,[sendScope]:''}))
      finishGeneration(localStorage, assistantMessageId)
      setGenerationForeground({action:'stop', messageId:assistantMessageId})
      // 生成成功 → 自动补发同会话的 pending，开启下一轮；报错/中断不自动发（保留给用户）。
      if (genOutcome === 'ok') void autoSendPending(target, sendConversationId)
    }
  }

  // ── 生成态待发送队列编排（conversation queue）──
  // send() 是异步长任务且闭包会过期：autoSend 必须调用「最新一次渲染」的 send，
  // 否则会话、模型配置等都会拿到排队时刻的旧值。
  const sendRef = useRef(send)
  useEffect(() => { sendRef.current = send })
  // 同步锁：effect 重挂载、按钮点击可能同刻竞争同一条 pending，锁保证同时只进一次 send。
  const flushLockRef = useRef(false)
  const autoSendLockRef = useRef(false)

  function markConversationDirty() {
    // 与 send() 相同的落盘防线：用户消息一入列就要求立刻保存，堵住「排队后立刻刷新丢消息」。
    firstDirtyAtRef.current = Date.now() - CLOUD_FLUSH_MAX_MS
    setAckTick(t => t + 1)
  }

  // 入队：生成态下用户点了「发送」→ 把当前输入存为 pending（不立即请求模型），
  // 输入立即清空、显示待发送卡片。一个 scope 仅 1 条：新内容覆盖旧内容。
  function enqueuePending(text: string, attachments: MessageAttachment[]): boolean {
    const target = person
    const convId = activeConversationIdsRef.current[target] || ''
    if (!target || !convId) return false
    const item = makePending(text, attachments, { assistantId: target, conversationId: convId })
    commitPending(setPending(pendingSendsRef.current, item))
    setDrafts(previous=>({...previous,[pendingScopeKey(target,convId)]:''}))
    markConversationDirty()
    return true
  }

  // 修改待发送内容（同 id；状态回到 pending）。
  function editPendingText(text: string): boolean {
    const target = person
    const convId = activeConversationIdsRef.current[target] || ''
    if (!target || !convId) return false
    if (!pendingSendsRef.current[pendingScopeKey(target, convId)]) return false
    commitPending(patchPendingText(pendingSendsRef.current, target, convId, text))
    return true
  }

  // 撤回待发送：消息从未真正发出，直接移除本地 pending（不入聊天记录，无需改 history）。
  function cancelPending() {
    const target = person
    const convId = activeConversationIdsRef.current[target] || ''
    if (!target || !convId) return
    commitPending(clearPending(pendingSendsRef.current, target, convId))
  }

  // 发送一条 pending：自动补发与用户手动「发送」共用。
  // confirmReview=true 允许发送 needs_review（用户显式确认）；自动路径永远只发 pending。
  async function flushPending(assistantId: string, conversationId: string, confirmReview = false, waitsLeft = 15) {
    if (flushLockRef.current) return
    const key = pendingScopeKey(assistantId, conversationId)
    const item = pendingSendsRef.current[key]
    if (!item) return
    if (item.status !== 'pending' && !(confirmReview && item.status === 'needs_review')) return
    // 仍在生成中：让出一次重渲染再试（send() 的 finally 里 setSending(false) 是异步的，
    // 需等 React 提交后 sendingRef/sendRef 才刷新到最新值，否则会拿到过期的 send 闭包）。
    // 这是「等当前生成结束」的事件驱动让步，不是定时缓发；有界重试杜绝无限轮询。
    if (sendingRef.current[pendingScopeKey(assistantId,conversationId)]) {
      if (waitsLeft <= 0) {
        genDebug('pending_flush_wait_timeout', { assistantId, conversationId })
        return // 保留 pending，绝不自动发；用户可手动发或下次生成结束再触发
      }
      window.setTimeout(() => void flushPending(assistantId, conversationId, confirmReview, waitsLeft - 1), 200)
      return
    }
    flushLockRef.current = true
    try {
      const outcome = await sendRef.current(item.text, item.attachments as MessageAttachment[], {
        conversationId,
        // 气泡一插入就清掉待发送卡片：用户看到「已发出」，不再等助手回复。
        onUserInserted: () => commitPending(clearPending(pendingSendsRef.current, assistantId, conversationId)),
      })
      if (outcome !== 'ok' && pendingSendsRef.current[pendingScopeKey(assistantId, conversationId)]) {
        // 还没走到插气泡就失败（比如没配模型）才保留卡片，方便重试。
        commitPending(markNeedsReview(pendingSendsRef.current, assistantId, conversationId))
      }
    } finally { flushLockRef.current = false }
  }

  // 当前会话生成成功结束后，自动补发其 pending（开启下一轮对话）。
  async function autoSendPending(assistantId: string, conversationId: string) {
    if (autoSendLockRef.current) return
    const key = pendingScopeKey(assistantId, conversationId)
    const item = pendingSendsRef.current[key]
    if (!item || item.status !== 'pending') return
    autoSendLockRef.current = true
    try { await flushPending(assistantId, conversationId, false) }
    finally { autoSendLockRef.current = false }
  }

  // 用户主动停止当前生成（AbortController）。pending 保留，可由用户随后手动发送。
  function stopGeneration() {
    const inf = sendAbortRef.current[pendingScopeKey(person,activeConversationIds[person] || '')]
    if (inf && inf.controller) { try { inf.controller.abort() } catch { /* 已结束 */ } }
  }

  // P1-5：按需翻译 reasoning。与 send() 完全隔离——不写会话历史、不发通知、不自动触发。
  // 复用同一 /api/chat 代理与当前模型配置，但用 stream:false 取一次完整回复。
  async function translateReasoningText(text: string): Promise<string> {
    const target = person
    const activeModel = resolveModelConfig(bindings[target]?.modelProfileId || defaultModelId || '', modelProfiles, modelConfig[target])
    const activeVendor = activeModel.vendorId ? vendors.find(v=>v.id===activeModel.vendorId) : undefined
    const activeChatUrl = activeVendor ? chatRequestUrl(activeVendor) : ''
    const apiKeyCandidates = resolveKeyCandidates(vendors, bindings[target]?.keyId || '', apiKey[target] || '', activeModel.vendorId || '')
    const activeApiKey = apiKeyCandidates[0] || resolveVendorKey(vendors, bindings[target]?.keyId || '') || apiKey[target] || ''
    const logicalId = activeLogicalId(routeState, target, logicalModelId(activeModel.model || ''))
    const routePlan = buildRoutePlan({routes:routeState.routes,logicalId,vendors,fallbackKeys:[],binding:{fixedRouteId:fixedRouteId(routeState,target)},maxAttempts:MAX_ROUTE_ATTEMPTS})
    const routeMode = routePlan.length>0
    const subscriptionProtocol = !routeMode && activeVendor?.subscriptionChannel === 'gpt' ? 'codex'
      : !routeMode && activeVendor?.subscriptionChannel === 'claude' ? 'anthropic'
      : !routeMode && activeVendor?.subscriptionChannel === 'grok' ? 'grok' : ''
    const subscriptionAccountId = activeVendor?.subscriptionAccountId || ''
    if(subscriptionProtocol&&isLocalMode()&&!nativeHttpStreamAvailable())throw new Error('订阅聊天需要 App 原生网络桥，请用最新 APK 或连接服务器。')
    if(!routeMode&&!subscriptionProtocol&&(!activeModel.endpoint.trim()||!activeModel.model.trim()||!activeApiKey.trim()))throw new Error('尚未配置可用的模型，无法翻译。')
    const body={model:activeModel.model.trim(),messages:buildTranslationMessages(text),stream:false}
    const response=await apiFetch('/api/chat',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:activeModel.endpoint.trim(),chatUrl:activeChatUrl,apiKey:activeApiKey.trim(),apiKeys:apiKeyCandidates,timeZone,body,...(subscriptionProtocol?{subscriptionProtocol,subscriptionAccountId}:{}),...(routeMode?{routes:routePlan}:{})})})
    if(!response.ok)throw new Error('翻译请求失败（HTTP '+response.status+'）')
    const data:any=await response.json()
    const out=data?.choices?.[0]?.message?.content??data?.choices?.[0]?.text
    if(typeof out!=='string'||!out.trim())throw new Error('模型没有返回翻译内容。')
    return cleanupMessageText(out.trim())
  }

  // ── 消息操作：修改 / 删除 / 重新生成（复制在 Chat 内完成）──
  // 修改：只更新这条消息的文字，双方消息均可；不调用模型、不动附件；
  // 视图（messages）与持久化（conversations）经 updateActiveConversationMessages 同时写，刷新后仍生效。
  function editMessage(messageId: string, newText: string): boolean {
    const text = newText.trim()
    if (!messageId || !text) return false
    const target = person
    const convId = activeConversationIds[target] || ''
    updateActiveConversationMessages(target, prev => prev.map(m => m.id === messageId ? { ...m, content: text } : m), convId)
    markConversationDirty()
    return true
  }
  // 删除：视图与持久化同时过滤。若删的是正在生成的回复——先中止请求；
  // 流式回写按 id 匹配，消息删除后无处可写，绝不会删除后又重新出现。
  function deleteMessage(messageId: string) {
    deleteMessages([messageId])
  }
  // 多选批量删除：一次性中止在途请求，同时过滤当前会话的视图与持久化——
  // 刷新不恢复，也不碰其他助手/会话。待发送（pending）不入聊天记录，无需在此剥离。
  function deleteMessages(ids: string[]) {
    const idSet = new Set(ids.filter(Boolean))
    if (!idSet.size) return
    const target = person
    const convId = activeConversationIds[target] || ''
    const inFlight = sendAbortRef.current[pendingScopeKey(target,convId)]
    if (inFlight && inFlight.id && idSet.has(inFlight.id)) { try { inFlight.controller.abort() } catch { /* 请求可能已结束 */ } }
    updateActiveConversationMessages(target, prev => prev.filter(m => !(m.id && idSet.has(m.id))), convId)
    markConversationDirty()
    releaseUnusedAssets(idSet)
  }
  // 附件引用安全：删除后扫描全局（全部助手会话 + 视图镜像 + 待发送队列），
  // 只对「本次被移除且已无人再引用」的图片调 DELETE，绝不误删其他消息仍在使用的文件。
  function releaseUnusedAssets(excludedMessageIds:Set<string>){
    const removed = new Set<string>()
    for (const m of messages[person] || []) if (m.id && excludedMessageIds.has(m.id)) for (const id of assetIdsOfMessages([m])) removed.add(id)
    const convList = (conversations[person] || []).find(c => c.id === (activeConversationIds[person] || ''))?.messages || []
    for (const m of convList) if (m.id && excludedMessageIds.has(m.id)) for (const id of assetIdsOfMessages([m])) removed.add(id)
    if (!removed.size) return
    const stillReferenced = collectReferencedAssetIds({ conversations, messages, pendingSends, excludeMessageIds: excludedMessageIds })
    for (const assetId of releasedAssetIds(removed, stillReferenced)) {
      // 失败无妨：孤儿文件不影响功能，后续清理即可，绝不能因删附件失败阻断消息删除。
      apiFetch('/api/attachments/' + encodeURIComponent(assetId), { method: 'DELETE', credentials: 'include' }).catch(() => {})
    }
  }
  // 重新生成：仅会话最新一条 AI 回复。复用 send() 重发同一条用户输入（历史截断到该用户消息之前），
  // 原位替换旧回复；失败/空白恢复原回复；regenLock + sending 双保险防重复请求。
  const regenLockRef = useRef(false)
  async function regenerateMessage(messageId: string): Promise<'ok'|'fail'|'noop'> {
    if (sending || regenLockRef.current) return 'noop'
    const target = person
    const convId = activeConversationIds[target] || ''
    const list = (conversations[target]||[]).find(c=>c.id===convId)?.messages || (convId===activeConversationIds[target]?messages[target]:[])
    const ctx = resolveRegenerateContext(list, messageId)
    if (!ctx) return 'fail'
    // 持久化副本里图片 dataUrl 已剥离：会话内的 data: 预览（贴纸等）重新接回，刷新过的死链自动跳过。
    const attachments = ((ctx.userMessage.attachments||[]) as MessageAttachment[]).map(a=>({...a,dataUrl:a.dataUrl||(a.type&&a.type.startsWith('image/')&&typeof a.preview==='string'&&a.preview.startsWith('data:')?a.preview:undefined)}))
    if (!ctx.userMessage.content.trim() && !attachments.length) { setChatError('这条回复对应的原消息没有可重发的内容。'); return 'fail' }
    regenLockRef.current = true
    try {
      return await send(ctx.userMessage.content, attachments, {
        conversationId: convId,
        historyEndIndex: ctx.userIndex,
        insertUser: false,
        regenerate: { replaceId: messageId, originalContent: ctx.original.content, originalUsage: ctx.original.usage as TokenUsage|undefined },
      })
    } finally { regenLockRef.current = false }
  }

  // 用户消息「保存并重发」：改文字 → 丢掉这条之后的旧回复 → 以这条为历史末尾重新请求一次回答。
  async function resendUserMessage(messageId: string, newText: string): Promise<'ok'|'fail'|'noop'> {
    const text = newText.trim()
    if (!messageId || !text) return 'fail'
    if (sending || regenLockRef.current) return 'noop'
    const target = person
    const convId = activeConversationIds[target] || ''
    const list = (conversations[target]||[]).find(c=>c.id===convId)?.messages || (convId===activeConversationIds[target]?messages[target]:[])
    const idx = list.findIndex(m => m && m.id === messageId)
    if (idx < 0 || list[idx].role !== 'user') return 'fail'
    editMessage(messageId, text)
    const after = list.slice(idx + 1).map(m => m.id).filter((id): id is string => !!id)
    if (after.length) deleteMessages(after)
    regenLockRef.current = true
    try {
      return await send(text, [], { conversationId: convId, historyEndIndex: idx, insertUser: false })
    } finally { regenLockRef.current = false }
  }

  function addTask() {
    const text = draft.trim()
    if (!text) return
    setTasks(prev => ({ ...prev, [person]: [...prev[person], text] }))
    setDraft('')
  }

  if (apiSetupActive) return <ApiSetupScreen onSubmit={applyApiAddress}/>
  // 启动探测期（checking）用中性加载页：不再渲染 LoginScreen，避免真机上
  // 网络慢时闪现/停留「云端登录」页（用户反馈「一直会有登录云端」的一半来源）。
  if (authStatus === 'checking') return <main className="login-shell"><div className="login-card boot-card"><div className="login-mark">居</div><p className="login-eyebrow">A SMALL PRIVATE SPACE</p><h1>正在进入小家</h1><div className="boot-spinner" aria-hidden="true"/><p className="login-copy">正在准备房间……</p></div></main>
  if (authStatus !== 'signedIn') return <LoginScreen status={authStatus} password={loginPassword} setPassword={setLoginPassword} error={authError} onSubmit={login} onUseLocal={() => { try { localStorage.removeItem(API_BASE_STORAGE_KEY) } catch { /* 忽略 */ } setApiBase(''); void recheckAfterApiChange() }}/>

  const navigate=(next:Page)=>{setPage(next);setActiveTool('');setSidebarOpen(false)}
  const openFunShortcut=(key:string)=>{if(key==='主动任务'||key==='自主行动'){setActiveTool(key==='主动任务'?'工作流':'自主生活');setPage('room');setSidebarOpen(false);return}setFunShortcut(key);setPage('fun');setSidebarOpen(false);setActiveTool('')}
  // 左侧抽屉里的会话操作：和房间页共用 conversations / messages / activeConversationIds，
  // 切换前先把当前聊天视图写回持久化会话，避免刚发出去的消息丢在旧会话里。
  const drawerConvs:Conversation[]=conversations[person]||[]
  const drawerActiveId:string=activeConversationIds[person]||''
  function drawerWriteBack(){
    if(!drawerActiveId)return
    setConversations((old:Record<Person,Conversation[]>)=>({...old,[person]:(old[person]||[]).map(c=>c.id===drawerActiveId?{...c,messages:messages[person],updatedAt:new Date().toISOString()}:c)}))
  }
  function drawerSwitch(id:string){
    if(id!==drawerActiveId){
      drawerWriteBack()
      const target=(conversations[person]||[]).find(c=>c.id===id)
      setActiveConversationIds((old:Record<Person,string>)=>({...old,[person]:id}))
      setMessages((old:Record<Person,ChatMessage[]>)=>({...old,[person]:target?.messages||[]}))
      setChatError('')
    }
    setPage('room');setActiveTool('');setChatOpen(true);setSidebarOpen(false);setDrawerRenameId(null)
  }
  function drawerCreate(){
    drawerWriteBack()
    const id=crypto.randomUUID()
    const count=(conversations[person]||[]).length
    setConversations((old:Record<Person,Conversation[]>)=>({...old,[person]:[...(old[person]||[]),{id,title:'新对话 '+(count+1),messages:[],updatedAt:new Date().toISOString()}]}))
    setActiveConversationIds((old:Record<Person,string>)=>({...old,[person]:id}))
    setMessages((old:Record<Person,ChatMessage[]>)=>({...old,[person]:[]}))
    setChatError('')
    setPage('room');setActiveTool('');setChatOpen(true);setSidebarOpen(false);setDrawerRenameId(null)
  }
  function drawerRename(id:string){
    const title=drawerRenameDraft.trim()
    setDrawerRenameId(null)
    if(!title)return
    setConversations((old:Record<Person,Conversation[]>)=>({...old,[person]:(old[person]||[]).map(c=>c.id===id?{...c,title}:c)}))
  }
  async function drawerDelete(id:string){
    const list=conversations[person]||[]
    const target=list.find(c=>c.id===id)
    if(!target)return
    if(!(await confirmDialog({ title:'删除会话', message:'删除「'+(target.title||'新对话')+'」？此操作会删除这条会话及其消息，无法撤销。', confirmLabel:'删除', danger:true })))return
    const remaining=list.filter(c=>c.id!==id)
    const next=remaining.length?remaining:[{id:crypto.randomUUID(),title:'新对话',messages:[],updatedAt:new Date().toISOString()}]
    setConversations((old:Record<Person,Conversation[]>)=>({...old,[person]:next}))
    if(id===drawerActiveId){
      const nextActive=next[Math.max(0,list.findIndex(c=>c.id===id)-1)]||next[0]
      setActiveConversationIds((old:Record<Person,string>)=>({...old,[person]:nextActive.id}))
      setMessages((old:Record<Person,ChatMessage[]>)=>({...old,[person]:nextActive.messages||[]}))
    }
    setChatError('')
    setDrawerRenameId(null)
  }
  // 聊天页没有「← 房间」按钮：从抽屉底部或系统返回手势回房间。
  const drawerBackToRoom=()=>{setSidebarOpen(false);setChatOpen(false);setActiveTool('')}
  const beautifyClass=BEAUTIFY_PACKS.find(p=>p.id===beautifyPack)?.cssClass||''
  // 聊天页优先用当前助手的独立外观（角色外观），否则跟随全局
  const effAppearance=chatOpen?personAppearance[person]:undefined
  const bgId=(effAppearance&&effAppearance.chatBackground)||themePrefs.chatBackground||'theme'
  const bubbleId=(effAppearance&&effAppearance.bubble)||themePrefs.bubble||'soft'
  const bgClass=bgId==='custom1'||bgId==='custom2'?'image':bgId
  const bubbleClass=bubbleId==='image'?'image':bubbleId
  const bgUrl=bgId==='custom1'?customAssets.bg1:bgId==='custom2'?customAssets.bg2:''
  const bubbleUrl=bubbleId==='image'?customAssets.bubble:''
  // 聊天打开时给整条布局链上锁：shell 用 height 封顶（而非 min-height），
  // 消息列表成为唯一滚动容器，页面整体不再被聊天记录撑长。
  const chatViewportLock=page==='room'&&chatOpen?' shell-chat-lock':''
  // 美化包激活时颜色变量交给包（写在 :root 上），shell 不再用内置主题色覆盖，否则包只换背景、颜色还是紫的。
  const themeVars = themeStyle(themePrefs)
  const packColorKeys = new Set([
    '--accent','--accent-soft','--accent-contrast','--accent-ink','--page-bg','--app-bg','--surface','--surface-elevated','--card','--field',
    '--ink','--muted','--line','--divider','--border-subtle','--ok','--warning','--danger',
    '--control-bg','--control-bg-hover','--control-bg-active','--control-border',
    '--icon','--icon-muted','--icon-accent','--icon-ok','--icon-warning','--icon-danger',
    '--button-primary-bg','--button-primary-fg','--button-secondary-bg','--button-secondary-fg','--button-secondary-border','--button-danger-bg','--button-danger-fg',
    '--wallpaper','--wallpaper-opacity','--theme-font-family',
  ])
  const shellVars = activePack ? Object.fromEntries(Object.entries(themeVars).filter(([k]) => !packColorKeys.has(k))) : themeVars
  return <main className={"shell theme-"+themePrefs.theme+" bubble-"+bubbleClass+" chatbg-"+bgClass+chatViewportLock+(beautifyClass?' '+beautifyClass:'')} style={{...shellVars,...(nativeTextZoomAvailable()?{'--font-scale':'1'}:{}),...(bgUrl?{'--chat-bg-image':'url("'+bgUrl+')'}:{}),...(bgClass==='image'?{'--chat-bg-opacity':String((themePrefs.chatBgOpacity??100)/100)}:{}),...(bubbleUrl?{'--bubble-image':'url("'+bubbleUrl+')'}:{})} as any}>
    {/* 全面屏：百宝箱与历史聊天都收进左侧抽屉，默认只露一条贴边细把手，点一下才滑出。 */}
    {/* 全面屏：主页显示完整「菜单」胶囊；进入房间/会话等页面自动收成贴边细把手，点一下才滑出。 */}
    {page!=='settings'&&(()=>{
      const edge=page!=='home'
      return <button type="button" className={'mobile-menu-toggle'+(edge?' sidebar-edge-handle':'')+(edge&&sidebarOpen?' moved':'')} aria-label={sidebarOpen?'收起菜单':'打开菜单'} aria-expanded={sidebarOpen} onClick={()=>setSidebarOpen(v=>!v)}><span aria-hidden="true"><IconMenu size={17}/></span>{edge?null:<b>菜单</b>}</button>
    })()}
    {sidebarOpen&&<button type="button" className="sidebar-scrim" aria-label="关闭侧边栏" onClick={()=>setSidebarOpen(false)}/>}
    <aside className={"app-sidebar"+(sidebarOpen?' sidebar-open':'')} aria-hidden={!sidebarOpen}>
      <div className="sidebar-brand"><div className="sidebar-logo"><IconFlower size={17}/></div><div><b>侧边栏</b><small>HISTORY &amp; TOOLS</small></div><button className="sidebar-close" aria-label="收起侧边栏" onClick={()=>setSidebarOpen(false)}><IconClose size={15}/></button></div>
      <div className="sidebar-scroll">
        <section className="sidebar-section sidebar-nav">
          <button type="button" className={'sidebar-nav-row'+(page==='home'?' active':'')} onClick={()=>{setSidebarOpen(false);navigate('home')}}><IconHome size={16}/><b>主页</b><small>概览 / 未读</small></button>
          <button type="button" className={'sidebar-nav-row'+(page==='room'?' active':'')} onClick={()=>{setSidebarOpen(false);setPage('room');setActiveTool('');setChatOpen(false)}}><IconChat size={16}/><b>房间</b><small>聊天与工具</small></button>
          <button type="button" className="sidebar-nav-row" onClick={()=>{setSidebarOpen(false);setPage('room');setChatOpen(false);setActiveTool('记忆面板')}}><span aria-hidden="true"><IconMemory size={17}/></span><b>记忆库</b><small>{displayName(person)}</small></button>
        </section>
        <section className="sidebar-section sidebar-combined">
          <div className="sidebar-combined-card">
            <div className="sidebar-combined-head"><b>历史聊天</b><small>{displayName(person)}</small></div>
            <div className="sidebar-conv-list">
              {drawerConvs.map((c:Conversation)=>(
                <div className={'sidebar-conv-row'+(c.id===drawerActiveId?' active':'')} key={c.id}>
                  {drawerRenameId===c.id
                    ? <input className="sidebar-conv-input" autoFocus value={drawerRenameDraft} onChange={e=>setDrawerRenameDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')drawerRename(c.id);if(e.key==='Escape')setDrawerRenameId(null)}} onBlur={()=>drawerRename(c.id)} aria-label="重命名会话"/>
                    : <button type="button" className="sidebar-conv-name" onClick={()=>drawerSwitch(c.id)}>{c.title||'新对话'}</button>}
                  <button type="button" className="sidebar-conv-edit" aria-label={'重命名 '+(c.title||'新对话')} title="重命名" onClick={()=>{setDrawerRenameId(c.id);setDrawerRenameDraft(c.title||'')}}><IconEdit size={14}/></button>
                  <button type="button" className="sidebar-conv-del" aria-label={'删除 '+(c.title||'新对话')} title="删除会话" onClick={()=>void drawerDelete(c.id)}><IconClose size={15}/></button>
                </div>
              ))}
            </div>
            <button type="button" className="sidebar-conv-new" onClick={drawerCreate}><IconPlus className="ui-icon-inline" size={14}/> 新建对话</button>
            <div className="sidebar-combined-sep" aria-hidden="true"/>
            <div className="sidebar-combined-head"><b>助手工具</b><small>{displayName(person)}</small></div>
            <div className="sidebar-assistant-card">
              <button type="button" className="sidebar-assistant-tool" onClick={()=>openFunShortcut('主动任务')}><span aria-hidden="true"><IconClock size={14}/></span><b>主动任务</b><small>定时 / 工作流</small></button>
              <button type="button" className="sidebar-assistant-tool" onClick={()=>openFunShortcut('自主行动')}><span aria-hidden="true"><IconSun size={14}/></span><b>自主行动</b><small>自主行为面板</small></button>
            </div>
          </div>
        </section>
        {chatOpen&&<button type="button" className="sidebar-back-room" onClick={drawerBackToRoom}><IconBack className="ui-icon-inline" size={14}/> 返回房间</button>}
      </div>
        <button type="button" className="sidebar-settings" onClick={()=>{pageBeforeSettings.current=page;setSidebarOpen(false);navigate('settings')}}><IconSettings size={16}/><b>设置</b></button>
      <div className="sidebar-footer"><span className="sidebar-status-dot"/><span>小家 · 侧边栏{inbox.filter(m=>!m.read_at).length?' · 未读 ' + inbox.filter(m=>!m.read_at).length:''}</span></div>
    </aside>
    {toast&&(()=>{const env=toast.kind==='task_result'?parseTaskEnvelope(toast.content):null;return <div className="inbox-toast" role="status"><button type="button" className="inbox-toast-main" onClick={()=>openInboxMessage(toast)}><b><IconMail className="ui-icon-inline" size={14}/> {displayName(toast.person)} · {env?'定时任务结果':toast.kind==='test'?'通知测试':'新消息'}</b><span>{env?env.answer||'（任务已完成，无文字总结）':toast.content}</span><small>{env?'点击查看结果会话':'点击打开聊天'}</small></button><button type="button" aria-label="收起消息" className="inbox-toast-dismiss" onClick={()=>setToast(null)}><IconClose size={15}/></button></div>})()}
    <section className="screen">
      {page === 'home' && <Home onPerson={openPerson} onOpenMemory={(target) => openToolFor(target, '记忆面板')} onOpenCalendar={() => openToolFor(person, '工作流')} time={time} today={todayLabel} displayName={displayName} characters={characters} conversations={conversations} inbox={inbox} />}
      {page === 'room' && <Room person={person} setPerson={setPerson} displayName={displayName} roomName={roomName} chatOpen={chatOpen} setChatOpen={setChatOpen} assistants={assistants} setAssistants={setAssistants}
        draft={draft} setDraft={setDraft} messages={messages} send={send} conversations={conversations} activeConversationIds={activeConversationIds} setConversations={setConversations} setActiveConversationIds={setActiveConversationIds} setMessages={setMessages}
         modelProfiles={modelProfiles} defaultModelId={defaultModelId} bindings={bindings} setBindings={setBindings}
         vendors={vendors} chatPool={chatPool} setChatPool={setChatPool}
         routeState={routeState} setRouteState={setRouteState} lastRouteInfo={lastRouteInfo}
         activeTool={activeTool} setActiveTool={(v)=>{ if(v===''&&toolReturnToSettings){ setToolReturnToSettings(false); setActiveTool(''); setPage('settings') } else setActiveTool(v) }} memory={memory} setMemory={setMemory}
        prompt={prompt} setPrompt={setPrompt} characters={characters} setCharacters={setCharacters} worldbook={worldbook} setWorldbook={setWorldbook} worldEntries={worldEntries} setWorldEntries={setWorldEntries} memoryEntries={memoryEntries} setMemoryEntries={setMemoryEntries} mcpConnections={mcpConnections} setMcpConnections={setMcpConnections}
        modelConfig={modelConfig[person]} setModelConfig={(v:React.SetStateAction<ModelConfig>)=>setModelConfig(old=>({...old,[person]:typeof v==='function'?v(old[person]):v}))} apiKey={apiKey[person]||''} setApiKey={(v:string)=>setApiKey(old=>({...old,[person]:v}))}
        sending={sending} generationStage={generationStages[draftKey]||''} chatError={chatError} setChatError={setChatError}
        personAppearance={personAppearance} setPersonAppearance={setPersonAppearance} customAssets={customAssets}
        pendingSends={pendingSends}
        enqueuePending={enqueuePending} flushPending={flushPending} cancelPending={cancelPending} editPendingText={editPendingText} stopGeneration={stopGeneration}
        editMessage={editMessage} deleteMessage={deleteMessage} deleteMessages={deleteMessages} regenerateMessage={regenerateMessage} resendUserMessage={resendUserMessage} translateReasoning={translateReasoningText}
        tasks={tasks} addTask={addTask}
        userSettings={userSettings} setUserSettings={setUserSettings}
        profileFromChat={profileFromChat} setProfileFromChat={setProfileFromChat} openAssistantProfile={openAssistantProfile} onOpenSettings={()=>{pageBeforeSettings.current='room';navigate('settings')}} packIcons={activePack?.icons} />}
      {page === 'fun' && <Fun shortcut={funShortcut} onShortcutUsed={()=>setFunShortcut('')} displayName={displayName} />}
      {page === 'settings' && <Settings packIcons={activePack?.icons} onBack={()=>{setPage('home');setActiveTool('');setChatOpen(false)}} onLogout={logout} cloudStatus={cloudStatus} themePrefs={themePrefs} setThemePrefs={setThemePrefs} customAssets={customAssets} conversations={conversations} modelConfig={modelConfig} personAppearance={personAppearance} setPersonAppearance={setPersonAppearance} onOpenTool={(tool)=>{setPerson(tool.person);setActiveTool(tool.tool);setPage('room');setToolReturnToSettings(true)}} displayName={displayName} timeZone={timeZone} setTimeZone={setTimeZone} worldEntries={worldEntries} setWorldEntries={setWorldEntries} modelProfiles={modelProfiles} setModelProfiles={setModelProfiles} bindings={bindings} setBindings={setBindings} vendors={vendors} setVendors={setVendors} subscriptions={subscriptions} setSubscriptions={setSubscriptions} onApiBaseApplied={recheckAfterApiChange} systemPeople={assistants.map(a=>a.id)} avatarOf={(id)=>characters[id]?.avatar||''} workspaceConfigs={workspaceConfigs} onWorkspaceSaved={(config)=>setWorkspaceConfigs(old=>({...old,[config.person]:config}))} defaultModelId={defaultModelId} setDefaultModelId={setDefaultModelId} />}
    </section>
    {fallbackNotice ? <div className="cloud-status error fallback-notice" role="status"><span><IconWarning className="ui-icon-inline" size={14}/> {fallbackNotice}</span><button onClick={()=>{setFallbackNotice('');navigate('settings')}}>去设置重新连接</button><button onClick={()=>setFallbackNotice('')}>知道了</button></div> : ((!isLocalMode()||cloudStatus==='error')&&cloudStatus!=='saved' && <div className={'cloud-status '+cloudStatus} role="status"><span>{cloudStatus==='saving'?(isLocalMode()?'本地保存中…':'云端保存中…'):cloudStatus==='error'?(isLocalMode()?'本地保存失败，请检查浏览器存储空间':'云端暂不可用，本地数据已保留'):'连接云端…'}</span>{cloudStatus==='error'&&<button onClick={retryCloudConnection}>{isLocalMode()?'重试保存':'重连云端'}</button>}</div>)}
    <UiDialogHost/>
    <WebBrowser page={webPage} onClose={() => setWebPage(null)}/>
    <SystemSetupSheet active={authStatus === 'signedIn'}/>
  </main>
}

function LoginScreen({status,password,setPassword,error,onSubmit,onUseLocal}:{status:'checking'|'signedOut'|'signedIn',password:string,setPassword:(v:string)=>void,error:string,onSubmit:(e:FormEvent)=>void,onUseLocal?:()=>void}) {
  return <main className="login-shell"><form className="login-card" onSubmit={onSubmit}>
    <div className="login-mark">居</div><p className="login-eyebrow">A SMALL PRIVATE SPACE</p><h1>回到自己的房间</h1>
    <p className="login-copy">登录后，聊天记录、人物设置、世界书和长期记忆会保存到你的云服务器。</p>
    {status==='checking'?<p className="login-copy">正在检查登录状态……</p>:<>
      <label>房间密码<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" placeholder="输入房间密码" autoFocus/></label>
      {error&&<p className="login-error">{error}</p>}
      <button className="login-submit" type="submit" disabled={!password}>进入房间</button>
      <small>这是私人预览版。请勿把房间密码分享给别人。</small>
      {onUseLocal&&<button type="button" className="login-local-mode" onClick={onUseLocal}>清除服务器地址，改用本地模式（数据只存本机）</button>}
    </>}
  </form></main>
}

// Android 首启动「连接服务器」向导：填一次 API 地址，保存即探测会话并推进到
// 登录页或直接进入（见 applyApiAddress）。样式复用 login-shell/login-card，
// 与登录页形成同一条视觉动线：连接 → 登录 → 进入房间。
function ApiSetupScreen({ onSubmit }: { onSubmit: (raw: string) => Promise<string> }) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      const failure = await onSubmit(draft)
      if (failure) setError(failure)
    } finally { setBusy(false) }
  }
  return <main className="login-shell"><form className="login-card" onSubmit={submit}>
    <div className="login-mark">居</div><p className="login-eyebrow">A SMALL PRIVATE SPACE</p><h1>连接你的服务器</h1>
    <p className="login-copy">第一次使用，先填写后端 API 地址。保存后会立即连接：已登录直接进入，否则输入房间密码。</p>
    <label>API 服务器地址
      <input value={draft} onChange={e=>setDraft(e.target.value)} inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false}
        placeholder="http://192.168.1.5:4180" autoFocus/>
    </label>
    {error&&<p className="login-error">{error}</p>}
    <button className="login-submit" type="submit" disabled={busy||!draft.trim()}>{busy?'正在连接……':'保存并继续'}</button>
    <small>地址来自电脑运行 npm start 后打印的卡片；手机需与电脑在同一 Wi-Fi。之后可在 设置 → 开发者 中修改。</small>
  </form></main>
}

// 关于页：主品牌 Logo 大尺寸展示，插画版作为完整品牌素材同位展示。
// 沿用 Mist 的 surface / 圆角 / 字阶，不把整页改成古风界面。
function BrandAbout(){
  return <div className="brand-about">
    <img className="brand-about-primary" src={brandAsset('logoPrimary')} alt={BRAND_NAME+' 主品牌 Logo'}/>
    <b>{BRAND_NAME}</b>
    <small>{isLocalMode()?'本地模式 · 数据只存这台设备':'云端同步模式'} · v{appVersion()}</small>
    <div className="brand-about-ornamental">
      <span>完整品牌插画</span>
      <img src={brandAsset('logoOrnamental')} alt={BRAND_NAME+' 完整品牌插画'}/>
    </div>
  </div>
}

// 首页「今天」：对齐 ai-home 定稿——大时钟、一句近况、两位助手的状态卡、
// 「今天的事」卡片。数据全部来自 v76 现有的会话/收件箱/记忆接口，不新增后端。
function clockOf(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

// 从最早一条会话算「认识第几天」。包成纯函数，避免在渲染体里直接读时钟。
function knownDaysFrom(conversations: Record<Person, Conversation[]>): number {
  const starts = ASSISTANT_PEOPLE
    .flatMap(person => (conversations[person] || []).map(c => Date.parse(c.updatedAt || '') || 0))
    .filter(Boolean)
  if (!starts.length) return 1
  return Math.max(1, Math.floor((Date.now() - Math.min(...starts)) / 86400000) + 1)
}

function greetingFor(hour: number): string {
  if (!Number.isFinite(hour)) return '你好'
  if (hour < 6) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

function Home({ onPerson, onOpenMemory, onOpenCalendar, time, today, displayName, characters, conversations, inbox }: {
  onPerson: (p: Person) => void
  onOpenMemory: (p: Person) => void
  onOpenCalendar: () => void
  time: string
  today: string
  displayName: (p: Person) => string
  characters: Record<Person, CharacterCard>
  conversations: Record<Person, Conversation[]>
  inbox: InboxMessage[]
}) {
  // 今天新增的记忆条数（按创建日期算，拒绝的墓碑不计）。取不到就显示 0，不打扰首页。
  const [memoryToday, setMemoryToday] = useState<Record<string, number>>({})
  useEffect(() => {
    let alive = true
    ;(async () => {
      const dayKey = new Date().toISOString().slice(0, 10)
      const next: Record<string, number> = {}
      for (const person of ASSISTANT_PEOPLE) {
        try {
          const response = await apiFetch('/api/memory/records?person=' + encodeURIComponent(person), { credentials: 'include' })
          if (!response.ok) continue
          const data = await response.json()
          next[person] = (Array.isArray(data.records) ? data.records : [])
            .filter((record: any) => record?.lifecycle !== 'rejected' && String(record?.createdAt || '').slice(0, 10) === dayKey)
            .length
        } catch { /* 记忆计数失败不影响首页 */ }
      }
      if (alive) setMemoryToday(next)
    })()
    return () => { alive = false }
  }, [])

  const greeting = greetingFor(Number(String(time).slice(0, 2)))
  const unreadOf = (id: Person) => inbox.filter(m => m.person === id && !m.read_at).length
  const lastOf = (id: Person) => {
    const list = (conversations[id] || []).slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    const conv = list[0]
    const messages = conv?.messages || []
    return { conv, last: messages[messages.length - 1] }
  }
  const first = lastOf(YWX)
  const unreadTotal = unreadOf(YWX) + unreadOf(YS)
  const greetText = unreadTotal
    ? '有 ' + unreadTotal + ' 条消息还没回。'
    : first.last
      ? displayName(YWX) + ' 上次说：' + String(first.last.content || '').slice(0, 18) + '…'
      : '家里很安静，说点什么吧。'
  const knownDays = knownDaysFrom(conversations)
  const todayEvents = ASSISTANT_PEOPLE.reduce((sum, person) => sum + (memoryToday[person] || 0), 0)

  return <div className="home-screen home-today">
    <header className="home-hero">
      <div className="home-clock">{time || '--:--'}</div>
      <div className="home-date">{today}</div>
      <p className="home-greet">{greeting}。{greetText}</p>
    </header>

    <div className="home-status-list">
      {ASSISTANT_PEOPLE.map((person, index) => {
        const { conv, last } = lastOf(person)
        const unread = unreadOf(person)
        const avatar = characters[person]?.avatar
        const count = memoryToday[person] || 0
        return <button type="button" key={person} className={'home-status' + (index === 1 ? ' alt' : '')} onClick={() => onPerson(person)}>
          <span className="home-avatar">{avatar ? <img src={avatar} alt="" /> : (index === 0 ? '1' : '2')}</span>
          <span className="home-status-body">
            <span className="home-status-top"><b>{displayName(person)}</b><small>{conv ? clockOf(conv.updatedAt) : '—'}</small></span>
            <span className="home-status-line">{last ? String(last.content || '').slice(0, 46) : '还没有聊过，进房间打个招呼吧。'}</span>
            <span className="home-status-tags">
              {unread > 0 && <span className="home-pill unread">{unread} 条未读</span>}
              {conv && <span className="home-pill">上次聊到 {conv.title || '新对话'}</span>}
              {count > 0 && <span className="home-pill live">记忆 +{count}</span>}
            </span>
          </span>
        </button>
      })}
    </div>

    <div className="home-section-title">今 天 的 事</div>
    <div className="home-today-card">
      <button type="button" className="home-today-row" onClick={() => onOpenMemory(ASSISTANT_PEOPLE[0])}>
        <span className="home-today-ico"><IconCalendar size={17}/></span>
        <span className="home-today-text"><b>认识第 {knownDays} 天</b><small>从第一次聊天算起</small></span>
      </button>
      <button type="button" className="home-today-row" onClick={onOpenCalendar}>
        <span className="home-today-ico"><IconClock size={17}/></span>
        <span className="home-today-text"><b>日程与约定</b><small>查看工作流与提醒</small></span>
      </button>
      <button type="button" className="home-today-row" onClick={() => onOpenMemory((memoryToday[YWX] || 0) >= (memoryToday[YS] || 0) ? YWX : YS)}>
        <span className="home-today-ico"><IconMemory size={17}/></span>
        <span className="home-today-text"><b>记忆里今天新增 {todayEvents} 条</b><small>{todayEvents ? '看看记下了什么' : '今天还没有新记忆'}</small></span>
      </button>
    </div>
  </div>
}

function Room(props: {
  person: Person, setPerson: (p: Person) => void, displayName:(p:Person)=>string, roomName: string, chatOpen: boolean, setChatOpen: (v: boolean) => void,
  assistants: AssistantRecord[], setAssistants: React.Dispatch<React.SetStateAction<AssistantRecord[]>>,
  draft: string, setDraft: (v: string) => void, messages: Record<Person,ChatMessage[]>, send: (textInput: string, attachments?: MessageAttachment[]) => void,
  conversations:Record<Person,Conversation[]>, activeConversationIds:Record<Person,string>, setConversations:React.Dispatch<React.SetStateAction<Record<Person,Conversation[]>>>, setActiveConversationIds:React.Dispatch<React.SetStateAction<Record<Person,string>>>, setMessages:React.Dispatch<React.SetStateAction<Record<Person,ChatMessage[]>>>,
  modelProfiles:ModelProfile[], defaultModelId:string, bindings:Record<Person,PersonBinding>, setBindings:React.Dispatch<React.SetStateAction<Record<Person,PersonBinding>>>,
  vendors:Vendor[], chatPool:ChatPool, setChatPool:React.Dispatch<React.SetStateAction<ChatPool>>,
  routeState:RouteState, setRouteState:React.Dispatch<React.SetStateAction<RouteState>>, lastRouteInfo:string,
  activeTool: Tool | '', setActiveTool: (v: Tool | '') => void,
  memory: Record<Person,string>, setMemory: React.Dispatch<React.SetStateAction<Record<Person,string>>>,
  prompt: Record<Person,string>, setPrompt: React.Dispatch<React.SetStateAction<Record<Person,string>>>,
  characters: Record<Person,CharacterCard>, setCharacters: React.Dispatch<React.SetStateAction<Record<Person,CharacterCard>>>,
  worldbook: Record<Person,string>, setWorldbook: React.Dispatch<React.SetStateAction<Record<Person,string>>>,
  worldEntries: WorldEntry[], setWorldEntries: React.Dispatch<React.SetStateAction<WorldEntry[]>>,
  memoryEntries: Record<Person,MemoryEntry[]>, setMemoryEntries: React.Dispatch<React.SetStateAction<Record<Person,MemoryEntry[]>>>,
  mcpConnections: Record<Person,MCPConnection[]>, setMcpConnections: React.Dispatch<React.SetStateAction<Record<Person,MCPConnection[]>>>,
  tasks: Record<Person,string[]>, addTask: () => void,
  userSettings:Record<Person,UserSettings>, setUserSettings:React.Dispatch<React.SetStateAction<Record<Person,UserSettings>>>,
  profileFromChat:boolean, setProfileFromChat:(v:boolean)=>void, openAssistantProfile:(fromChat?:boolean)=>void,
  modelConfig: ModelConfig, setModelConfig: React.Dispatch<React.SetStateAction<ModelConfig>>, apiKey: string, setApiKey: (v:string)=>void,
  sending: boolean, generationStage?: ''|'preparing'|'connecting'|'streaming'|'tools', chatError: string, setChatError: (v:string)=>void,
  personAppearance: Record<string,PersonAppearancePref>, setPersonAppearance: React.Dispatch<React.SetStateAction<Record<string,PersonAppearancePref>>>, customAssets: CustomAssets,
  // 生成态待发送队列（conversation queue）：pending 由 App 持有（跨会话/刷新不丢），
  // Chat 只负责输入状态机与待发送卡片的展示/交互。
  pendingSends: Record<string,PendingItem>,
  enqueuePending: (text:string, attachments:MessageAttachment[])=>boolean,
  flushPending: (assistantId:string, conversationId:string, confirmReview?:boolean)=>Promise<void>,
  cancelPending: ()=>void,
  editPendingText: (text:string)=>boolean,
  stopGeneration: ()=>void,
  // 消息操作菜单：修改/删除/重新生成在 App 层完成持久化与请求控制，Chat 只负责交互。
  editMessage: (messageId:string, newText:string)=>boolean,
  deleteMessage: (messageId:string)=>void,
  deleteMessages: (ids:string[])=>void,
  regenerateMessage: (messageId:string)=>Promise<'ok'|'fail'|'noop'>,
  resendUserMessage: (messageId:string,newText:string)=>Promise<'ok'|'fail'|'noop'>,
  translateReasoning: (text:string)=>Promise<string>, onOpenSettings?: ()=>void, packIcons?:Record<string,string>
}) {
  // 历史会话与工作区都默认展开：进来直接看到对话框名称与小程序。折叠偏好存本机，
  // 用 ref 设置 details.open，避免在下面的条件 return 之后引入 Hook（会打乱 Hook 顺序）。
  const toolsRef = useRef<HTMLDetailsElement>(null)
  const historyRef = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    if (historyRef.current) historyRef.current.open = localStorage.getItem('ai-home.roomHistoryExpanded') !== '0'
    if (toolsRef.current) toolsRef.current.open = localStorage.getItem('ai-home.roomToolsExpanded') !== '0'
  }, [])
  const [roomLayout,setRoomLayout]=useState<RoomLayout>(()=>loadRoomLayout(props.person))
  useEffect(()=>{ setRoomLayout(loadRoomLayout(props.person)) },[props.person])
  useEffect(()=>{ const onLayout=()=>setRoomLayout(loadRoomLayout(props.person)); window.addEventListener('aihome:room-layout',onLayout); return ()=>window.removeEventListener('aihome:room-layout',onLayout) },[props.person])
  useEffect(()=>{
    (window as any).AiHomeRoom={
      get:()=>loadRoomLayout(props.person),
      set:(layout:RoomLayout)=>{saveRoomLayout(props.person,layout);window.dispatchEvent(new Event('aihome:room-layout'))},
      reset:()=>{resetRoomLayout(props.person);window.dispatchEvent(new Event('aihome:room-layout'))},
      template:DEFAULT_ROOM_LAYOUT,
      buildItem:(input:any)=>({id:`item-${Date.now()}`,kind:'hotspot',label:'新入口',action:'chat',...input}),
    }
    return ()=>{ delete (window as any).AiHomeRoom }
  },[props.person])
  if (props.chatOpen) return <Chat {...props} />
  // 头部右侧是助手切换器：两个以内只放一个「切换」按钮（不铺开默认名
  // assistant-001/002 这类编号），超过两个才用下拉选框选择当前房间。
  const assistantIds = ASSISTANT_PEOPLE
  const nextPerson = assistantIds.find(id => id !== props.person) || props.person
  const personSwitcher = assistantIds.length > 2
    ? <SoftSelect className="room-person-select" ariaLabel="切换助手" value={assistantIds.includes(props.person)?props.person:assistantIds[0]} onChange={v=>{props.setPerson(v)}} options={assistantIds.map(id=>({value:id,label:props.displayName(id)}))}/>
    : assistantIds.length > 1
      ? <button type="button" className="room-person-toggle" title={'切换到 '+props.displayName(nextPerson)} aria-label={'切换到 '+props.displayName(nextPerson)} onClick={()=>{props.setPerson(nextPerson)}}><svg className="room-switch-icon" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M7 7h9l-2.6-2.6a1 1 0 1 1 1.4-1.4l4.3 4.3a1 1 0 0 1 0 1.4l-4.3 4.3a1 1 0 1 1-1.4-1.4L16 9H7a1 1 0 1 1 0-2z" fill="currentColor"/><path d="M17 17H8l2.6 2.6a1 1 0 1 1-1.4 1.4l-4.3-4.3a1 1 0 0 1 0-1.4l4.3-4.3a1 1 0 1 1 1.4 1.4L8 15h9a1 1 0 1 1 0 2z" fill="currentColor"/></svg><small>切换</small></button>
      : null
  const avatarSrc = props.characters[props.person]?.avatar || DEFAULT_AVATAR
  const roomHeader = <header className="room-header"><div className="room-name"><button type="button" className="room-name-avatar" title="人物设置与记忆" aria-label={'打开'+props.displayName(props.person)+'的助手档案'} onClick={()=>props.openAssistantProfile(false)}><img src={avatarSrc} alt=""/></button><div><b>{props.displayName(props.person)} 的房间</b><small>点头像设置人物与用户设定</small></div>{personSwitcher&&<div className="room-person-switch" aria-label="切换助手">{personSwitcher}</div>}</div></header>
  if (props.activeTool) return <div className="room-screen room-tool-screen">
    {/* 工具 / 档案页不再重复房间头部的头像与名字：整屏只留档案里那一份改名入口。 */}
    <header className="room-tool-header">
      <button className="settings-back" onClick={() => {const backToChat=props.profileFromChat&&props.activeTool==='助手档案';props.setActiveTool('');if(backToChat){props.setProfileFromChat(false);props.setChatOpen(true)}}}>{props.profileFromChat&&props.activeTool==='助手档案'?<><IconBack className="ui-icon-inline" size={14}/> 返回聊天</>:<><IconBack className="ui-icon-inline" size={14}/> 工作区</>}</button>
      <b className="room-tool-title">{props.activeTool}</b>
      {personSwitcher&&<div className="room-person-switch" aria-label="切换助手">{personSwitcher}</div>}
    </header>
    <ToolPanel {...props} />
  </div>
  const person=props.person
  const convs=props.conversations[person]||[]
  const activeId=props.activeConversationIds[person]||''
  const worldCount=(props.worldEntries||[]).length
  const mcpCount=Object.values(props.mcpConnections||{}).reduce((n,list)=>n+(list||[]).length,0)
  const skillCount=loadSkills(person).length
  const memoryCount=(props.memoryEntries?.[person]||[]).length
  function saveActiveMessages(){props.setConversations((old:Record<Person,Conversation[]>)=>({...old,[person]:(old[person]||[]).map(c=>c.id===activeId?{...c,messages:props.messages[person],updatedAt:new Date().toISOString()}:c)}))}
  function openConversation(id:string){if(id!==activeId){saveActiveMessages();const target=convs.find(c=>c.id===id);props.setActiveConversationIds((old:Record<Person,string>)=>({...old,[person]:id}));props.setMessages((old:Record<Person,ChatMessage[]>)=>({...old,[person]:target?.messages||[]}));props.setChatError('')}props.setChatOpen(true)}
  return <div className="room-screen">
    {roomHeader}
    <RoomScene layout={roomLayout} icons={props.packIcons} counts={{world:worldCount,mcp:mcpCount,skill:skillCount,memory:memoryCount}} onAction={(action:string)=>{
      if(action==='chat'){openConversation(activeId);return}
      if(action==='settings'){props.onOpenSettings?.();return}
      const map:Record<string,Tool>={world:'世界书',mcp:'MCP',skill:'SKILL 技能库',memory:'记忆面板'}
      const tool=map[action]; if(tool) props.setActiveTool(tool)
    }}/>
  </div>
}


function PackIcon({ value }: { value?: string }) {
  if (!value) return null
  if (/^data:image\//.test(value)) return <img className="pack-icon" src={value} alt="" aria-hidden="true"/>
  return <>{value}</>
}

// Only hide duplicate built-in navigation in the room scene. Keep custom widgets,
// decorations and saved layouts intact; settings and chat remain accessible elsewhere.
const ROOM_DUPLICATE_ACTIONS = new Set(['world','mcp','settings','chat','skill','memory'])
function RoomScene({layout,counts,onAction,icons}:{layout:RoomLayout;counts:Record<string,number>;onAction:(action:string)=>void;icons?:Record<string,string>}) {
  const bg=layout.background as Record<string,string>|undefined
  const bgStyle:React.CSSProperties|undefined=bg?(bg.image?{backgroundImage:`url(${bg.image})`,backgroundSize:'cover',backgroundPosition:'center'}:bg.css?{background:bg.css}:bg.color?{background:bg.color}:undefined):undefined
  return <div className={'room-illustration'+(bgStyle?' free-bg':'')} style={bgStyle}>
    {layout.items.filter((item:RoomItem)=>!ROOM_DUPLICATE_ACTIONS.has(String(item.action||''))).map((item:RoomItem)=>{
      const legacy=item.kind==='decor'&&item.type
      if(legacy){
        const cls='ri-'+String(item.type||'')+(item.cls?' '+item.cls:'')
        const kids=item.type==='window'?<><i/><i/><i/></>:item.type==='shelf'?<><i/><i/><i/><i/></>:item.type==='desk'?<><span className="ri-monitor"/><span className="ri-leg l"/><span className="ri-leg r"/></>:item.text?item.text:null
        return <div key={item.id} className={cls} style={item.style as any|undefined} aria-hidden="true">{kids}</div>
      }
      // 模板热点：沿用房间 CSS 的位置
      if(item.kind==='hotspot'&&item.hit){
        return <button key={item.id} type="button" className={'ri-hit '+item.hit} style={item.style as any|undefined} aria-label={item.label||'房间入口'} onClick={()=>onAction(item.action||'chat')}><span className="ri-tag">{icons?.[item.action||'']?<PackIcon value={icons[item.action||'']}/>:null}{icons?.[item.action||'']?' ':''}{item.label||'入口'}{item.countKey?<small> {counts[item.countKey]??0}</small>:null}</span></button>
      }
      // 自由物件：任意位置/尺寸/样式/文字，AI 可以画公园、星空、太空……
      const pos:React.CSSProperties={
        position:'absolute',
        left:item.x!=null?`${item.x}%`:(item.style?.left as string|undefined),
        top:item.y!=null?`${item.y}%`:(item.style?.top as string|undefined),
        width:item.w!=null?`${item.w}%`:(item.style?.width as string|undefined),
        height:item.h!=null?`${item.h}%`:(item.style?.height as string|undefined),
        ...(item.style as any|undefined),
      }
      const content=item.emoji||item.text||null
      if(item.action){
        return <button key={item.id} type="button" className="free-hotspot" style={pos} aria-label={item.label||item.action} onClick={()=>onAction(item.action as string)}>{content}{item.label&&<span className="ri-tag">{item.label}</span>}</button>
      }
      return <div key={item.id} className="free-item" style={pos} aria-hidden="true">{content}</div>
    })}
  </div>
}

// 助手档案：房间里 / 聊天里点助手头像后共用的设置面板。名称直接在这里改，
// 人物设定、用户设定两段；长期/短期记忆已并入独立的记忆面板，不再在这里重复。
function AssistantProfile(p: any) {
  const person=p.person as Person
  const [tab,setTab]=useState<'人物'|'用户'>('人物')
  // 改名输入用本地草稿：全部删掉时保持空白，让用户接着输入新名字，
  // 不让 displayName 的兜底默认名「蹦」回输入框。空值不写进数据，失焦才恢复显示名。
  // ToolPanel 用 key={person} 挂载，切换助手时草稿随组件重建自动同步，无需 effect 回填。
  const [nameDraft,setNameDraft]=useState(()=>String(p.displayName(person)||''))
  const pRef=useRef(p)
  useEffect(()=>{pRef.current=p})
  useEffect(()=>pushBackHandler(()=>{
    const q=pRef.current
    if(q.profileFromChat){q.setProfileFromChat(false);q.setActiveTool('');q.setChatOpen(true)}
    else q.setActiveTool('')
    return true
  }),[person])
  const tabs=[['人物','人物设置'],['用户','用户设置']] as const
  const rename=(value:string)=>{
    setNameDraft(value)
    const name=value.trim()
    if(!name)return
    p.setAssistants((old:AssistantRecord[])=>old.some(a=>a.id===person)?old.map(a=>a.id===person?{...a,name}:a):[...old,{id:person,name}])
    // 角色卡名称跟随显示名即时同步，提示词里的角色名与界面保持一致。
    p.setCharacters((old:Record<Person,CharacterCard>)=>({...old,[person]:{...(old[person]||blankCard(person)),name}}))
  }
  const userValue:UserSettings=p.userSettings?.[person]||blankUserSettings()
  const patchUser=(field:keyof UserSettings,v:string)=>p.setUserSettings((old:Record<Person,UserSettings>)=>({...old,[person]:{...(old[person]||blankUserSettings()),[field]:v}}))
  const card:CharacterCard=p.characters[person]||blankCard(person)
  const [avatarError,setAvatarError]=useState('')
  const fileRef=useRef<HTMLInputElement>(null)
  const changeAvatar=async(e:ChangeEvent<HTMLInputElement>)=>{
    const f=e.target.files?.[0]
    e.target.value=''
    if(!f)return
    setAvatarError('')
    try{
      const data=await fileToAvatar(f)
      p.setCharacters((old:Record<Person,CharacterCard>)=>({...old,[person]:{...(old[person]||blankCard(person)),avatar:data}}))
    }catch(err){setAvatarError(err instanceof Error?err.message:'头像设置失败')}
  }
  const resetAvatar=()=>{
    p.setCharacters((old:Record<Person,CharacterCard>)=>({...old,[person]:{...(old[person]||blankCard(person)),avatar:''}}))
    setAvatarError('')
  }
  return <div className="assistant-profile">
    <div className="ap-head">
      <button type="button" className="ap-avatar ap-avatar-button" title="更换当前助手的头像" aria-label="更换当前助手的头像" onClick={()=>fileRef.current?.click()}><img src={card.avatar||DEFAULT_AVATAR} alt=""/><span className="ap-avatar-pen" aria-hidden="true"><IconEdit size={12}/></span></button>
      <div className="ap-head-text"><input className="ap-name-input" aria-label="助手名称" title="直接改助手名称" maxLength={32} value={nameDraft} onChange={e=>rename(e.target.value)} onBlur={()=>{if(!nameDraft.trim())setNameDraft(String(p.displayName(person)||''))}}/><small>名称可直接修改 · 点头像换头像</small></div>
    </div>
    <div className="ap-avatar-bar"><button type="button" onClick={()=>fileRef.current?.click()}>更换头像</button>{!!card.avatar&&<button type="button" onClick={resetAvatar}>恢复默认</button>}<small>只改当前助手，另一位不受影响</small></div>
    <input ref={fileRef} className="ap-avatar-file" type="file" accept="image/*" aria-label="选择助手头像图片" onChange={e=>void changeAvatar(e)}/>
    {avatarError&&<p className="ap-avatar-error" role="alert">{avatarError}</p>}
    <div className="ap-tabs" role="tablist" aria-label="助手档案">{tabs.map(([key,label])=><button type="button" role="tab" aria-selected={tab===key} className={'ap-tab'+(tab===key?' active':'')} key={key} onClick={()=>setTab(key)}>{label}</button>)}</div>
    <div className="ap-body">
      {tab==='人物'&&<CharacterSettings key={person} value={card} onSave={(v:CharacterCard)=>p.setCharacters((x:Record<Person,CharacterCard>)=>({...x,[person]:v}))} hideAvatar/>}
      {tab==='用户'&&<UserSettingsEditor value={userValue} onChange={patchUser} assistantName={p.displayName(person)}/>}
    </div>
  </div>
}

// 用户设置一栏：只作用于当前助手，修改即时保存，聊天时由 buildUserContext 注入 system 提示。
// 输入框一律留白，不再铺「例如：…」的示例文字；我的头像也按助手各存一份。
function UserSettingsEditor({value,onChange,assistantName}:{value:UserSettings;onChange:(field:keyof UserSettings,v:string)=>void;assistantName:string}){
  const fields:[keyof UserSettings,string][]=[
    ['callName','助手怎么称呼你'],
    ['userName','你的名字'],
    ['identity','你的身份 / 职业'],
    ['relationship','你们的关系'],
  ]
  const fileRef=useRef<HTMLInputElement>(null)
  const [avatarError,setAvatarError]=useState('')
  const changeAvatar=async(e:ChangeEvent<HTMLInputElement>)=>{
    const f=e.target.files?.[0]
    e.target.value=''
    if(!f)return
    setAvatarError('')
    try{onChange('avatar',await fileToAvatar(f))}catch(err){setAvatarError(err instanceof Error?err.message:'头像设置失败')}
  }
  return <div id="user-settings-panel" className="user-settings-card">
    <div className="us-avatar-row">
      <button type="button" className="us-avatar" aria-label="更换我的头像" title="更换我的头像" onClick={()=>fileRef.current?.click()}>{isAvatarDataUrl(value.avatar)?<img src={value.avatar} alt=""/>:<span>我</span>}</button>
      <div className="us-avatar-text"><b>我的头像</b><small>只在这个助手的会话里显示</small></div>
      <button type="button" onClick={()=>fileRef.current?.click()}>更改</button>
      {value.avatar&&<button type="button" onClick={()=>onChange('avatar','')}>清除</button>}
    </div>
    <input ref={fileRef} className="ap-avatar-file" type="file" accept="image/*" aria-label="选择我的头像图片" onChange={e=>void changeAvatar(e)}/>
    {avatarError&&<p className="ap-avatar-error" role="alert">{avatarError}</p>}
    <p className="us-intro">只作用于「{assistantName}」：告诉它该怎么称呼你、你是谁、有哪些偏好。修改即时保存，聊天时自动生效。</p>
    {fields.map(([key,label])=><label className="us-field" key={key}>{label}<input aria-label={label} value={value[key]} onChange={e=>onChange(key,e.target.value)}/></label>)}
    <label className="us-field">偏好与忌讳<textarea rows={3} aria-label="偏好与忌讳" value={value.preferences} onChange={e=>onChange('preferences',e.target.value)}/></label>
    <label className="us-field">其他用户设定<textarea rows={3} aria-label="其他用户设定" value={value.notes} onChange={e=>onChange('notes',e.target.value)}/></label>
    <div className="us-preview"><b>聊天时会自动告诉助手</b><pre>{buildUserContext(value)||'（还没有填写任何设定）'}</pre></div>
    <small className="us-foot">这些设定按助手单独保存，只留在这台设备的本机数据里；没填的项目不会出现。</small>
  </div>
}

function ToolPanel(p: any) {
  const t=p.activeTool as Tool
  if (t === '助手档案') return <AssistantProfile key={p.person} {...p}/>
  if (t === '人物设置') return <><p className="muted">助手名称在房间顶部头像旁修改，这里只编辑人物设定。</p><CharacterSettings key={p.person} value={p.characters[p.person]} onSave={(v:CharacterCard)=>p.setCharacters((x:Record<Person,CharacterCard>)=>({...x,[p.person]:v}))}/></>
  if (t === '角色外观') return <PersonAppearance key={p.person} value={p.personAppearance?.[p.person]||null} assets={p.customAssets||EMPTY_ASSETS} onChange={(v:PersonAppearancePref|null)=>p.setPersonAppearance((old:Record<string,PersonAppearancePref>)=>{const next={...old};if(v)next[p.person]=v;else delete next[p.person];return next})}/>
  if (t === '世界书') return <WorldbookEditor personLabel={p.displayName} entries={p.worldEntries.filter((e:WorldEntry)=>e.boundCharacters?.includes(p.person))} onChange={(v:WorldEntry[])=>p.setWorldEntries((old:WorldEntry[])=>{const visibleIds=new Set(old.filter(e=>e.boundCharacters?.includes(p.person)).map(e=>e.id));const incoming=new Map(v.map(e=>[e.id,e]));const kept=old.flatMap(e=>{if(!visibleIds.has(e.id))return [e];const replacement=incoming.get(e.id);if(replacement)return [replacement];const remaining=e.boundCharacters.filter(name=>name!==p.person);return remaining.length?[{...e,boundCharacters:remaining}]:[]});const oldIds=new Set(old.map(e=>e.id));return [...kept,...v.filter(e=>!oldIds.has(e.id))]})}/>
  if (t === 'SKILL 技能库') return <SkillWorkbench person={p.person} personLabel={p.displayName}/>
  if (t === 'MCP') return <MCPSettings person={p.person} personLabel={p.displayName}/>
  if (t === '工具调用看板') return <ToolDashboard person={p.person} personLabel={p.displayName?p.displayName(p.person):p.person} onJumpToSource={(conversationId:string,messageId?:string)=>jumpToSource(p,conversationId,messageId)}/>
  if (t === '记忆面板') return <MemoryPanel person={p.person} personLabel={p.displayName?p.displayName(p.person):p.person} onJumpToSource={(conversationId:string,messageId?:string)=>jumpToSource(p,conversationId,messageId)} personMessages={p.messages?.[p.person]||[]} modelOptions={(p.vendors||[]).flatMap((v:any)=>(v.models||[]).filter((m:any)=>m.selected).map((m:any)=>({vendorId:v.id,model:m.id,label:v.name+' · '+(m.name||m.id)})))} onRunOrganize={async (cfg: any) => {
    const profileId = p.bindings?.[p.person]?.modelProfileId || p.defaultModelId || ''
    const active = resolveModelConfig(profileId, p.modelProfiles || [], p.modelConfig)
    const mm = readMemoryModels()
    // 记忆整理可以单独指定模型；没指定就用聊天模型。
    const organizeVendor = mm.organize.model ? (p.vendors || []).find((v: Vendor) => v.id === mm.organize.vendorId) : (p.vendors || []).find((v: Vendor) => v.id === active.vendorId)
    const organizeModel = mm.organize.model || active.model || ''
    const apiKey = resolveKeyCandidates(p.vendors || [], p.bindings?.[p.person]?.keyId || '', p.apiKey || '', organizeVendor?.id || '')[0] || ''
    return runLocalOrganize({
      person: p.person,
      messages: p.messages?.[p.person] || [],
      endpoint: organizeVendor?.endpoint || '',
      apiKey,
      chatUrl: organizeVendor ? chatRequestUrl(organizeVendor) : '',
      model: organizeModel,
      cfg,
      embedTarget: embeddingTarget(p.vendors || [], mm.embed),
    })
  }} onTidyMemories={isLocalMode() ? async (records: any[]) => {
    const profileId = p.bindings?.[p.person]?.modelProfileId || p.defaultModelId || ''
    const active = resolveModelConfig(profileId, p.modelProfiles || [], p.modelConfig)
    const mm = readMemoryModels()
    const tidyVendor = mm.organize.model ? (p.vendors || []).find((v: Vendor) => v.id === mm.organize.vendorId) : (p.vendors || []).find((v: Vendor) => v.id === active.vendorId)
    const tidyModel = mm.organize.model || active.model || ''
    const tidyKey = resolveKeyCandidates(p.vendors || [], p.bindings?.[p.person]?.keyId || '', p.apiKey || '', tidyVendor?.id || '')[0] || ''
    const auto = readLocalAuto()
    return tidyMemoryLibrary({ person: p.person, records, endpoint: tidyVendor?.endpoint || '', apiKey: tidyKey, chatUrl: tidyVendor ? chatRequestUrl(tidyVendor) : '', model: tidyModel, autoConfirm: auto.autoConfirm, rules: auto.rules })
  } : undefined}/>
  if (t === '模型设置') return <ModelSettings value={p.modelConfig} onChange={p.setModelConfig} apiKey={p.apiKey} setApiKey={p.setApiKey}/>
  if (t === '工作流') return <TaskManager person={p.person} personLabel={p.displayName}/>
  if (t === '自主生活') return <ProactivePanel person={p.person} personLabel={p.displayName}/>
  return <div className="tool-panel"><h3>{t}</h3><p className="muted">{t === 'MCP' ? '预留工具连接层，后续接入 MCP 客户端。' : '预留模型适配层，后续接入 OpenAI 兼容接口、聚合站或本地模型。'}</p></div>
}

// 记忆治理「跳回来源会话」：关掉看板 → 切到来源会话 → 打开聊天 → 滚动高亮来源消息。
function jumpToSource(p: any, conversationId: string, messageId?: string) {
  const person = p.person as Person
  p.setActiveTool('')
  const activeId = p.activeConversationIds[person] as string
  const target = (p.conversations[person] as Conversation[]).find((c: Conversation) => c.id === conversationId)
  if (target && conversationId !== activeId) {
    p.setConversations((old: Record<Person, Conversation[]>) => ({ ...old, [person]: (old[person] || []).map((c: Conversation) => c.id === activeId ? { ...c, messages: p.messages[person], updatedAt: new Date().toISOString() } : c) }))
    p.setActiveConversationIds((old: Record<Person, string>) => ({ ...old, [person]: conversationId }))
    p.setMessages((old: Record<Person, ChatMessage[]>) => ({ ...old, [person]: target.messages || [] }))
    p.setChatError('')
  }
  p.setChatOpen(true)
  if (messageId) {
    // 等聊天视图渲染完再滚动；找不到目标时静默忽略（记忆来源可能已被删除）。
    window.setTimeout(() => {
      const el = document.querySelector('[data-message-id="' + messageId + '"]') as HTMLElement | null
      if (!el) return
      el.scrollIntoView({ block: 'center' })
      el.classList.add('message-flash')
      window.setTimeout(() => el.classList.remove('message-flash'), 2400)
    }, 80)
  }
}

type SkillRecord={id:string;name:string;description:string;instructions:string;enabled:boolean;updatedAt:string}
function SkillWorkbench({person, personLabel}:{person:Person;personLabel?:(p:Person)=>string}) {
 const who = personLabel ? personLabel(person) : person
 const storageKey='ai-home.skills.'+person
 const [skills,setSkills]=useState<SkillRecord[]>(()=>{try{const v=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(v)?v:[]}catch{return []}})
 const skillFileRef=useRef<HTMLInputElement>(null)
 const [skillNotice,setSkillNotice]=useState('')
 const [name,setName]=useState('');const [description,setDescription]=useState('');const [instructions,setInstructions]=useState('');const [editing,setEditing]=useState<string|null>(null);const [query,setQuery]=useState('')
 useEffect(()=>{localStorage.setItem(storageKey,JSON.stringify(skills))},[storageKey,skills])
 const visible=skills.filter(s=>(s.name+' '+s.description+' '+s.instructions).toLowerCase().includes(query.toLowerCase()))
 function save(e:FormEvent){e.preventDefault();if(!name.trim()||!instructions.trim())return;const item:SkillRecord={id:editing||crypto.randomUUID(),name:name.trim(),description:description.trim(),instructions:instructions.trim(),enabled:editing?skills.find(s=>s.id===editing)?.enabled??true:true,updatedAt:new Date().toISOString()};setSkills(old=>editing?old.map(s=>s.id===editing?item:s):[item,...old]);clear()}
 function clear(){setName('');setDescription('');setInstructions('');setEditing(null)}
 async function importSkillFile(e:ChangeEvent<HTMLInputElement>){const f=e.target.files&&e.target.files[0];e.target.value='';if(!f)return;try{const parsed=parseSkillMarkdown(await f.text());if(!parsed.instructions){setSkillNotice('文件里没有可用内容');return}const fallback=f.name.replace(/\.md$/i,'');setSkills(old=>[{id:crypto.randomUUID(),name:(parsed.name||fallback).slice(0,100),description:parsed.description.slice(0,300),instructions:parsed.instructions,enabled:true,updatedAt:new Date().toISOString()},...old]);setSkillNotice('已导入 '+(parsed.name||fallback))}catch(err){setSkillNotice('导入失败：'+(err instanceof Error?err.message:String(err)))}}
 return <div className="tool-panel skill-workbench"><h3>{who} · SKILL 技能库</h3><p className="muted">启用的技能会按当前助手注入 system 提示（有长度预算，超出的会截断）；停用后不再注入。支持导入 SKILL.md。</p><div className="skill-import"><button type="button" onClick={()=>skillFileRef.current?.click()}>导入 SKILL.md</button><input ref={skillFileRef} type="file" accept=".md,text/markdown,text/plain" aria-label="导入 SKILL.md" onChange={e=>void importSkillFile(e)}/>{skillNotice&&<small>{skillNotice}</small>}</div><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索技能" aria-label="搜索技能"/><form className="memory-create" onSubmit={save}><h4>{editing?'编辑技能':'新增技能'}</h4><label>技能名称<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder="例如：旅行日志整理"/></label><label>简介<input value={description} onChange={e=>setDescription(e.target.value)} placeholder="这个技能解决什么问题"/></label><label>工作流程与规则<textarea required rows={5} value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="写清触发条件、步骤、限制与输出格式"/></label><div className="memory-form-actions"><button disabled={!name.trim()||!instructions.trim()}>{editing?'保存修改':'保存技能'}</button>{editing&&<button type="button" onClick={clear}>取消</button>}</div></form><div className="skill-list">{visible.map(skill=><article key={skill.id} className="skill-card"><div><b>{skill.name}</b><span className={skill.enabled?'skill-enabled':'skill-disabled'}>{skill.enabled?'已启用':'已停用'}</span></div>{skill.description&&<p>{skill.description}</p>}<pre>{skill.instructions}</pre><small>更新于 {new Date(skill.updatedAt).toLocaleString('zh-CN')}</small><div className="memory-form-actions"><button type="button" onClick={()=>{setEditing(skill.id);setName(skill.name);setDescription(skill.description);setInstructions(skill.instructions)}}>编辑</button><button type="button" onClick={()=>setSkills(old=>old.map(s=>s.id===skill.id?{...s,enabled:!s.enabled,updatedAt:new Date().toISOString()}:s))}>{skill.enabled?'停用':'启用'}</button><button type="button" onClick={()=>{void confirmDialog({ title:'删除技能', message:'删除「'+skill.name+'」？', confirmLabel:'删除', danger:true }).then(ok=>{if(ok)setSkills(old=>old.filter(s=>s.id!==skill.id))})}}>删除</button></div></article>)}</div>{visible.length===0&&<p className="muted">还没有匹配的技能，可以先创建一个。</p>}</div>
}

type ScheduledTask = { id:string; person:Person; title:string; prompt:string; run_at:string; recurrence:'once'|'daily'|'weekly'; interval_minutes?:number; status:'scheduled'|'ready'|'completed'|'paused'; last_run_at:string|null; created_at:string; updated_at:string }
function TaskManager({person,personLabel}:{person:Person;personLabel?:(p:Person)=>string}) {
 const who = personLabel ? personLabel(person) : person
  const [tasks,setTasks]=useState<ScheduledTask[]>([])
  const [title,setTitle]=useState('')
  const [prompt,setPrompt]=useState('')
  const [runAt,setRunAt]=useState('')
  const [recurrence,setRecurrence]=useState<'once'|'daily'|'weekly'|'every2h'>('once')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const refresh=useCallback(async()=>{const r=await apiFetch('/api/tasks?person='+encodeURIComponent(person),{credentials:'include'});const d=await r.json();if(!r.ok)throw new Error(d.error||'读取任务失败');setTasks(d.tasks||[])},[person])
  useEffect(()=>{refresh().catch(e=>setError(e.message))},[refresh])
  // 任务状态由服务端调度器推进；有未完成任务时轻量轮询，避免看到过期状态。
  useEffect(()=>{if(!tasks.some(t=>t.status==='scheduled'||t.status==='ready'))return;const timer=window.setInterval(()=>{if(!document.hidden)refresh().catch(()=>{})},10000);return()=>window.clearInterval(timer)},[tasks,refresh])
  async function create(e:FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');try{const r=await apiFetch('/api/tasks',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({person,title,prompt,runAt:new Date(runAt).toISOString(),recurrence:recurrence==='every2h'?'daily':recurrence,intervalMinutes:recurrence==='every2h'?120:0})});const d=await r.json();if(!r.ok)throw new Error(d.error||'创建任务失败');setTitle('');setPrompt('');setNotice(isLocalMode()?'任务已保存到本机，到点会自动提醒。':'任务已保存到云端调度队列。');await refresh();try{window.dispatchEvent(new Event('aihome:alarms-changed'))}catch{}}catch(e){setError(e instanceof Error?e.message:'创建任务失败')}finally{setBusy(false)}}
  async function update(task:ScheduledTask,patch:Record<string,unknown>){setError('');setNotice('');try{const r=await apiFetch('/api/tasks/'+task.id,{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({person,...patch})});const d=await r.json();if(!r.ok)throw new Error(d.error||'更新任务失败');await refresh();try{window.dispatchEvent(new Event('aihome:alarms-changed'))}catch{}}catch(e){setError(e instanceof Error?e.message:'更新任务失败')}}
  async function remove(task:ScheduledTask){if(!(await confirmDialog({ title:'删除任务', message:'删除「'+task.title+'」？', confirmLabel:'删除', danger:true })))return;try{const r=await apiFetch('/api/tasks/'+task.id,{method:'DELETE',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({person})});const d=await r.json();if(!r.ok)throw new Error(d.error||'删除失败');await refresh();try{window.dispatchEvent(new Event('aihome:alarms-changed'))}catch{}}catch(e){setError(e instanceof Error?e.message:'删除失败')}}
  const localDate=(iso:string)=>{const d=new Date(iso);return Number.isNaN(d.getTime())?'时间无效':d.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})}
  const statusLabel=(s:ScheduledTask['status'])=>({scheduled:'等待执行',ready:'执行中 · 助手正在跑',completed:'已完成',paused:'已暂停'}[s])
  return <div className="tool-panel task-manager"><h3>{who} · 工作流</h3><p className="muted">{isLocalMode()?'任务只存在这台设备，由 App 内的本地调度器到点把提醒发进聊天，不需要云端或后台常驻服务。App 在前台时执行，切回前台会补跑错过的任务（重复任务只补最近一次）。':'到期任务会由服务端 Agent Runner 真实执行（最多 5 轮工具循环），执行记录见「工具调用看板 · Agent 运行」。'}</p>{error&&<p className="mcp-error">{error}</p>}{notice&&<p className="mcp-notice">{notice}</p>}
    <form className="task-create" onSubmit={create}><label>工作流名称<input required maxLength={160} value={title} onChange={e=>setTitle(e.target.value)} placeholder="例如：早上检查雾潮群岛进度"/></label><label>执行时间<input required type="datetime-local" value={runAt} onChange={e=>setRunAt(e.target.value)}/></label><label>重复规则<SoftSelect value={recurrence} onChange={v=>setRecurrence(v as typeof recurrence)} options={[{value:'once',label:'仅一次'},{value:'every2h',label:'每两小时'},{value:'daily',label:'每天'},{value:'weekly',label:'每周'}]}/></label><label>执行步骤（每行一步）<textarea required rows={5} value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="第一步：检查状态\n第二步：判断条件\n第三步：执行操作\n第四步：保存结果"/></label><button type="submit" disabled={busy||!title.trim()||!prompt.trim()||!runAt}>{busy?'保存中…':'保存任务'}</button></form>
    <div className="task-list-heading"><b>任务列表</b><button type="button" onClick={()=>refresh().catch(e=>setError(e.message))}>刷新</button></div>{tasks.length===0?<p className="muted">这里还没有任务。</p>:tasks.map(task=><article className="scheduled-task" key={task.id}><div className="scheduled-task-top"><b>{task.title}</b><span className={'task-status '+task.status}>{statusLabel(task.status)}</span></div><ol className="workflow-steps">{task.prompt.split('\n').filter(line=>line.trim()).map((step,i)=><li key={i}>{step.replace(/^(?:第[一二三四五六七八九十]+步[：:]?|[0-9]+[.、：:]|[-•]\s*)/,'').trim()}</li>)}</ol><small>执行时间：{localDate(task.run_at)} · {Number(task.interval_minutes)===120?'每两小时':task.recurrence==='once'?'仅一次':task.recurrence==='daily'?'每天':'每周'}{task.last_run_at?' · 上次触发：'+localDate(task.last_run_at):''}</small><div className="scheduled-task-actions">{task.status==='scheduled'&&<button type="button" onClick={()=>update(task,{status:'paused'})}>暂停</button>}{task.status==='paused'&&<button type="button" onClick={()=>update(task,{status:'scheduled'})}>恢复</button>}{task.status==='ready'&&<button type="button" onClick={()=>update(task,{status:'completed'})}>标记完成</button>}<button type="button" onClick={()=>remove(task)}>删除</button></div></article>)}</div>
}

function ProactivePanel({person,personLabel}:{person:Person;personLabel?:(p:Person)=>string}) {
 const who = personLabel ? personLabel(person) : person
 const [config,setConfig]=useState<any>(null)
 const [events,setEvents]=useState<any[]>([])
 const [notice,setNotice]=useState('')
 const [busy,setBusy]=useState(false)
 const refresh=useCallback(async()=>{const r=await apiFetch('/api/proactive?person='+encodeURIComponent(person));const d=await r.json();if(!r.ok)throw Error(d.error||'读取失败');setConfig(d.settings);setEvents(d.events||[])},[person])
 useEffect(()=>{refresh().catch(e=>setNotice(e.message))},[refresh])
 async function act(body:any){setBusy(true);setNotice('');try{const r=await apiFetch('/api/proactive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({person,...body})});const d=await r.json();if(!r.ok)throw Error(d.error||'操作失败');setNotice(body.action==='wake'?(d.queued?'已生成一条待处理唤醒事件。接入后台模型后才能生成并投递消息。':'没有排队：'+d.reason):'已保存');await refresh()}catch(e){setNotice(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 return <div className="tool-panel"><h3>{who} · 自主生活</h3><p className="muted">独立心跳、主动程度、免打扰与唤醒记录。当前只生成待处理事件，不会冒充 AI 发消息；接入安全的后台模型执行器后才能真正主动发信。</p>{config&&<section className="memory-create"><label>自主唤醒 <input type="checkbox" checked={!!config.enabled} onChange={e=>setConfig({...config,enabled:e.target.checked?1:0})}/></label><label>主动程度<SoftSelect value={config.mode} onChange={v=>setConfig({...config,mode:v})} options={[{value:'quiet',label:'安静陪伴'},{value:'natural',label:'自然主动'},{value:'lively',label:'活泼黏人'}]}/></label><label>心跳间隔（小时）<input type="number" min={2} max={72} value={config.interval_hours} onChange={e=>setConfig({...config,interval_hours:Number(e.target.value)})}/></label><label>免打扰开始（0–23时）<input type="number" min={0} max={23} value={config.quiet_start} onChange={e=>setConfig({...config,quiet_start:Number(e.target.value)})}/></label><label>免打扰结束（0–23时）<input type="number" min={0} max={23} value={config.quiet_end} onChange={e=>setConfig({...config,quiet_end:Number(e.target.value)})}/></label><div className="memory-form-actions"><button disabled={busy} onClick={()=>act({action:'configure',...config,enabled:!!config.enabled})}>保存设置</button><button disabled={busy} onClick={()=>act({action:'wake'})}>测试唤醒</button><button disabled={busy} onClick={()=>refresh().catch(e=>setNotice(e.message))}>刷新记录</button><button disabled={busy} onClick={async()=>{try{const r=await apiFetch('/api/inbox/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({person})});if(!r.ok)throw Error('发送失败');setNotice('测试消息已进入小家收件箱，前台横幅会在下一次轮询时出现。')}catch(e){setNotice(String(e))}}}>测试消息弹窗</button></div></section>}{notice&&<p className="muted" role="status">{notice}</p>}<h4>最近唤醒事件</h4>{events.length===0?<p className="muted">还没有唤醒记录。</p>:events.map(e=><article className="memory-item" key={e.id}><b>{e.mood==='curious'?'✨ 好奇 / 想分享':'自主唤醒'}</b><p>{e.reason}</p><small>{new Date(e.created_at).toLocaleString()} · {e.status==='pending'?'待接入模型处理':'已忽略'}</small>{e.status==='pending'&&<button disabled={busy} onClick={()=>act({action:'dismiss',id:e.id})}>忽略</button>}</article>)}</div>
}

function MCPSettings({person,personLabel}:{person:Person;personLabel?:(p:Person)=>string}) {
 const who = personLabel ? personLabel(person) : person
  const [connections,setConnections] = useState<MCPConnection[]>([])
  const [name,setName] = useState('')
  const [url,setUrl] = useState('')
  const transport = 'httpStream'
  const [token,setToken] = useState('')
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [tools,setTools] = useState<Record<string,{name:string;description:string;inputSchema:unknown}[]>>({})
  const [expandedTools,setExpandedTools] = useState<Record<string,boolean>>({})
  const [args,setArgs] = useState<Record<string,string>>({})
  const [results,setResults] = useState<Record<string,string>>({})
  const refresh = useCallback(async()=>{
    const r = await apiFetch('/api/mcp?person='+encodeURIComponent(person),{credentials:'include'})
    const data = await r.json()
    if(!r.ok) throw new Error(data.error || '读取 MCP 列表失败')
    setConnections(data.connections)
  },[person])
  useEffect(()=>{refresh().catch(e=>setError(e.message))},[refresh])
  async function add(e:FormEvent) {
    e.preventDefault();setBusy(true);setError('');setNotice('')
    try {
      const r=await apiFetch('/api/mcp',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({person,name,url,transport,token})})
      const data=await r.json();if(!r.ok)throw new Error(data.error||'保存失败')
      setName('');setUrl('');setToken('');await refresh();setNotice('配置已安全保存，可以尝试连接并读取工具。')
    } catch(e){setError(e instanceof Error?e.message:String(e))} finally{setBusy(false)}
  }
  async function loadTools(c:MCPConnection) {
    setBusy(true);setError('');setNotice('正在连接 '+c.name+'…')
    try {
      const r=await apiFetch('/api/mcp/'+c.id+'/tools',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({person})})
      const data=await r.json();if(!r.ok)throw new Error(data.error||'连接失败')
      setTools(old=>({...old,[c.id]:data.tools}));setExpandedTools(old=>({...old,[c.id]:false}));setNotice('连接成功：发现 '+data.tools.length+' 个工具，可按需展开。')
    }catch(e){setError(e instanceof Error?e.message:String(e));setNotice('')}finally{setBusy(false)}
  }
  async function remove(c:MCPConnection) {
    if(!(await confirmDialog({ title:'移除 MCP 服务', message:'移除绑定到「'+person+'」的 MCP 服务「'+c.name+'」？', confirmLabel:'移除', danger:true })))return
    setError('');setNotice('')
    try{const r=await apiFetch('/api/mcp/'+c.id,{method:'DELETE',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({person})});const data=await r.json();if(!r.ok)throw new Error(data.error||'移除失败');await refresh();setTools(old=>{const n={...old};delete n[c.id];return n});setNotice('已移除该人物的 MCP 绑定。')}catch(e){setError(e instanceof Error?e.message:String(e))}
  }
  async function callTool(c:MCPConnection,t:{name:string;description:string}) {
    const key=c.id+':'+t.name;setError('');setNotice('正在调用 '+t.name+'…')
    let parsed:unknown={};try{parsed=JSON.parse(args[key]||'{}')}catch{setError('参数必须是合法 JSON');setNotice('');return}
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)){setError('工具参数必须是 JSON 对象');setNotice('');return}
    try{const r=await apiFetch('/api/mcp/'+c.id+'/call',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({person,name:t.name,arguments:parsed})});const data=await r.json();if(!r.ok)throw new Error(data.error||'调用失败');setResults(old=>({...old,[key]:JSON.stringify(data.result,null,2)}));setNotice('工具调用完成：'+t.name)}catch(e){setError(e instanceof Error?e.message:String(e));setNotice('')}
  }
  return <div className="tool-panel mcp-panel"><h3>{who} · MCP 工具</h3><p className="muted">每个服务独立绑定人物。连接凭证只保存在云端后端，并使用 AES-256-GCM 加密；不会返回给浏览器或写进人物世界书。</p><div className="mcp-boundary"><b>当前绑定：{who}</b><span>本页面只会列出绑定给{who}的 MCP。另一人物不能通过本页面调用这些连接。</span></div>
    {error&&<p className="mcp-error">{error}</p>}{notice&&<p className="mcp-notice">{notice}</p>}
    {connections.length===0&&<p className="muted">还没有为{person}绑定 MCP 服务。</p>}
    {connections.map(c=><section className="mcp-connection-card" key={c.id}><div className="mcp-connection"><div className="mcp-connection-info"><b>{c.name}</b><small>{c.url}</small><span>绑定人物：{personLabel?personLabel(c.person):c.person} · {c.transport==='httpStream'?'Streamable HTTP':'其他'}</span></div><button type="button" className="mcp-action" disabled={busy} onClick={()=>loadTools(c)}>连接 / 获取工具</button><button type="button" className="mcp-remove" onClick={()=>remove(c)}>移除</button></div>
      {(tools[c.id]||[]).length>0&&<button type="button" className="mcp-tools-toggle" aria-expanded={!!expandedTools[c.id]} onClick={()=>setExpandedTools(old=>({...old,[c.id]:!old[c.id]}))}><span>{expandedTools[c.id]?'收起工具列表':'展开工具列表'}</span><span className="mcp-tools-count">{tools[c.id].length} 个工具</span><span className="mcp-tools-chevron">{expandedTools[c.id]?<IconChevronUp size={14}/>:<IconChevronDown size={14}/>}</span></button>}
      {expandedTools[c.id]&&(tools[c.id]||[]).map(t=><div className="mcp-tool" key={t.name}><b>{t.name}</b>{t.description&&<p>{t.description}</p>}<label>调用参数（JSON）<textarea value={args[c.id+':'+t.name]??'{}'} onChange={e=>setArgs(old=>({...old,[c.id+':'+t.name]:e.target.value}))} rows={3}/></label><button type="button" className="mcp-action" disabled={busy} onClick={()=>callTool(c,t)}>调用工具</button>{results[c.id+':'+t.name]&&<pre>{results[c.id+':'+t.name]}</pre>}</div>)}
    </section>)}
    <form className="mcp-add-form" onSubmit={add}><h4>添加远程 MCP</h4><label>服务名称<input value={name} onChange={e=>setName(e.target.value)} placeholder="例如：huayuan-小晏" required/></label><label>主机地址<input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://example.com/mcp" type="url" required/></label><label>Token（可选）<input value={token} onChange={e=>setToken(e.target.value)} type="text" style={{WebkitTextSecurity:"disc"} as any} autoComplete="new-password" placeholder="在这里粘贴新生成的 Token"/></label><button type="submit" disabled={busy}>{busy?'请稍候…':'安全保存并绑定到'+person}</button></form><small>连接使用 HTTPS；保存后点击“连接 / 获取工具”验证服务。实际工具执行前会再次检查当前人物绑定。只支持 Streamable HTTP，不支持旧式 SSE 或 stdio。</small></div>
}

function PasteButton({ onPaste, label = '粘贴' }: { onPaste: (value: string) => void; label?: string }) {
  const [state, setState] = useState('')
  async function go() {
    const text = (await readClipboardText()).trim()
    if (!text) {
      setState('剪贴板空')
      window.setTimeout(() => setState(''), 1400)
      return
    }
    onPaste(text)
    setState('已粘贴')
    window.setTimeout(() => setState(''), 1200)
  }
  return <button type="button" className="paste-key-btn" title="从系统剪贴板粘贴" onClick={() => void go()}>{state || label}</button>
}

function ModelSettings({value,onChange,apiKey,setApiKey}:{value:ModelConfig,onChange:(v:ModelConfig)=>void,apiKey:string,setApiKey:(v:string)=>void}) {
 const [testing,setTesting]=useState(false)
 const [testResult,setTestResult]=useState<{ok:boolean;text:string}|null>(null)
 const [listing,setListing]=useState(false)
 const [modelList,setModelList]=useState<{ok:boolean;text:string;ids:string[]}|null>(null)
 const [modelOpen,setModelOpen]=useState(false)
 const [comboQuery,setComboQuery]=useState('')
 const comboRef=useRef<HTMLDivElement>(null)
 useEffect(()=>{
   if(!modelOpen)return
   const onDown=(e:MouseEvent)=>{if(comboRef.current&&!comboRef.current.contains(e.target as Node))setModelOpen(false)}
   const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setModelOpen(false)}
   document.addEventListener('mousedown',onDown)
   document.addEventListener('keydown',onKey)
   return ()=>{document.removeEventListener('mousedown',onDown);document.removeEventListener('keydown',onKey)}
 },[modelOpen])
 function openCombo(){if(modelList&&modelList.ids.length){setComboQuery('');setModelOpen(true)}}
 const comboIds=(modelList&&modelList.ids.length?modelList.ids:[]).filter(id=>id.toLowerCase().includes(comboQuery.trim().toLowerCase()))
 async function testConnection(){
   if(!value.endpoint.trim()||!value.model.trim()||!apiKey.trim()){setTestResult({ok:false,text:'请先填写 API 地址、模型名称和 API Key。'});return}
   setTesting(true);setTestResult(null)
   try{
     const response=await apiFetch('/api/models',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:value.endpoint,apiKey})})
     const data=await response.json().catch(()=>({}))
     if(!response.ok)throw new Error(data?.error||('HTTP '+response.status))
     const ids=Array.isArray(data?.models)?data.models:[]
     const found=ids.includes(value.model)
     if(ids.length)setModelList({ok:true,text:'',ids})
     setTestResult({ok:true,text:'连接成功'+(ids.length?(found?'，且模型在可用列表中。':'；未在列表中找到所填模型，请确认模型 ID。')+'模型名称框已可下拉选择。':'。')})
   }catch(e){setTestResult({ok:false,text:e instanceof Error?e.message:'连接测试失败。'})}
   finally{setTesting(false)}
 }
 async function fetchModels(){
   if(!value.endpoint.trim()){setModelList({ok:false,text:'请先填写 API 地址。',ids:[]});return}
   if(!apiKey.trim()){setModelList({ok:false,text:'请先填写 API Key，再获取模型列表。',ids:[]});return}
   setListing(true);setModelList(null)
   try{
     const response=await apiFetch('/api/models',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:value.endpoint,apiKey})})
     const data=await response.json().catch(()=>({}))
     if(!response.ok)throw new Error(data?.error||('HTTP '+response.status))
     const ids=Array.isArray(data?.models)?data.models:[]
     if(!ids.length){setModelList({ok:false,text:'接口响应正常，但未返回可用模型列表。',ids:[]});return}
     setModelList({ok:true,text:'已获取 '+ids.length+' 个模型，点击模型名称框即可下拉选择。',ids})
     if(!value.model.trim())onChange({...value,model:ids[0]})
   }catch(e){setModelList({ok:false,text:e instanceof Error?e.message:'获取模型列表失败。',ids:[]})}
   finally{setListing(false)}
 }
 return <div className="tool-panel"><h3>模型连接</h3><p className="muted">支持 OpenAI 兼容接口，例如 One API / New API。API Key 加密保存在后端数据库，登录后自动带回，换设备也无需重填；不进入云端快照明文备份。</p><label className="model-field">API 地址<input value={value.endpoint} onChange={e=>{onChange({...value,endpoint:e.target.value});setTestResult(null);setModelList(null)}} placeholder="https://你的中转站/v1"/></label><label className="model-field">模型名称<div className="model-combo" ref={comboRef}><input value={value.model} onFocus={openCombo} onChange={e=>{onChange({...value,model:e.target.value});setTestResult(null);setComboQuery(e.target.value);if(modelList&&modelList.ids.length)setModelOpen(true)}} placeholder={modelList&&modelList.ids.length?'点击输入框选择模型':'例如 gpt-4o-mini'}/>{modelList&&modelList.ids.length>0&&<button type="button" className={'model-combo-caret'+(modelOpen?' open':'')} aria-label="展开模型列表" onClick={()=>{if(modelOpen)setModelOpen(false);else openCombo()}}>▾</button>}{modelOpen&&<ul className="model-combo-list">{comboIds.length?comboIds.map(id=><li key={id}><button type="button" className={id===value.model?'current':''} onClick={()=>{onChange({...value,model:id});setTestResult(null);setModelOpen(false);setComboQuery('')}}>{id}</button></li>):<li className="model-combo-empty">没有匹配的模型</li>}</ul>}</div></label><label className="model-field">API Key<div className="key-input-row"><input type="password" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} inputMode="text" value={apiKey} onChange={e=>{setApiKey(e.target.value);setTestResult(null)}} placeholder="sk-…"/><PasteButton onPaste={v=>{setApiKey(v);setTestResult(null)}}/></div></label><div className="model-fetch-row"><button type="button" disabled={listing} onClick={fetchModels}>{listing?'正在获取…':'获取站点模型列表'}</button><small>拉取该站点可用模型，填好 API 地址与 Key 后点击，即可在模型名称框下拉选择。</small></div>{modelList&&<p role="status" className={modelList.ok?'model-test-ok':'model-test-error'}>{modelList.text}</p>}<div className="pricing-settings"><b>用量费用估算（最终显示人民币 ¥）</b><small>输入价格按服务商 USD / 百万 tokens 资费填写；汇率可自行调整。留空价格则不估算费用，缓存价格留空时按普通输入价估算。</small><div className="pricing-grid"><label>输入价格<input type="number" min="0" step="any" value={value.inputPrice??''} onChange={e=>onChange({...value,inputPrice:e.target.value})} placeholder="例如 2.5"/></label><label>输出价格<input type="number" min="0" step="any" value={value.outputPrice??''} onChange={e=>onChange({...value,outputPrice:e.target.value})} placeholder="例如 10"/></label><label>缓存输入价格<input type="number" min="0" step="any" value={value.cachedInputPrice??''} onChange={e=>onChange({...value,cachedInputPrice:e.target.value})} placeholder="可选"/></label><label>美元兑人民币汇率<input type="number" min="0.01" step="0.01" value={value.usdToCny??'7.2'} onChange={e=>onChange({...value,usdToCny:e.target.value})} placeholder="例如 7.2"/></label></div></div><button type="button" disabled={testing} onClick={testConnection}>{testing?'正在测试连接…':'测试 API 连接'}</button>{testResult&&<p role="status" className={testResult.ok?'model-test-ok':'model-test-error'}>{testResult.text}</p>}<small>地址、模型名和价格设置自动保存在此浏览器。API Key 以加密形式存于后端，登录后自动带回（换设备同样可用）；本机浏览器仅作离线缓存，不写入云端快照明文。模型列表、连接测试与聊天请求均经由本机后端代理转发，不受浏览器 CORS 限制。</small></div>
}

// 气泡内部的工具调用折叠卡（P1-4）：默认一行业务摘要，展开是「工具名 + 结果」，
// tool name / arguments / latency / raw result 收进二级「详情」。没有调用时整卡不渲染。
function MessageToolCalls({messageId}:{messageId:string}) {
  const calls=useMessageToolCalls(messageId)
  const display=useChatDisplay()
  const [open,setOpen]=useState(false)
  const group=groupToolCalls(calls)
  if(!group.total||!display.showToolCalls)return null
  // 卡片在气泡内部：阻止冒泡，避免点折叠按钮触发气泡长按菜单或多选。
  return <div className="msg-tool-calls" onClick={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()}>
    <button type="button" className="msg-tool-calls-head" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
      <span className="msg-tool-calls-icon" aria-hidden="true">{group.icon}</span>
      <b>工具调用（{group.total}）</b><small>{group.active?'执行中':group.failed?`${group.failed} 次失败`:'已完成'}</small>
      <span className="msg-tool-calls-chevron">{open?'收起':<IconChevronRight size={13}/>}</span>
    </button>
    {open&&<ul className="msg-tool-calls-list">{group.items.map(c=><li key={c.key} className={'msg-tool-call status-'+c.status}>
      <div className="msg-tool-call-top"><b>{c.status==='succeeded'?<IconCheck className="ui-icon-inline" size={13}/>:['failed','timed_out','cancelled'].includes(c.status)?<IconClose className="ui-icon-inline" size={13}/>:<IconClock className="ui-icon-inline" size={13}/>} {c.label}</b><span className={'msg-tool-outcome '+c.status}>{c.outcome}</span>{c.durationMs!=null&&<small>{formatDuration(c.durationMs)}</small>}</div>
      <details className="msg-tool-call-detail"><summary>详情</summary><pre>{JSON.stringify({工具:c.detail.toolName,参数:c.detail.arguments,原始结果:c.detail.resultSummary,...(c.detail.errorMessage?{错误:c.detail.errorMessage}:{}),...(c.detail.errorCode?{错误码:c.detail.errorCode}:{}),服务:c.detail.serverName||'—',耗时:c.detail.durationMs!=null?formatDuration(c.detail.durationMs):'—',开始时间:c.detail.startedAt?new Date(c.detail.startedAt).toLocaleString('zh-CN'):'—',...(c.detail.finishedAt?{结束时间:new Date(c.detail.finishedAt).toLocaleString('zh-CN')}:{})},null,2)}</pre></details>
    </li>)}</ul>}
  </div>
}

// 聊天顶部的实时状态栏：只显示当前会话仍在进行中的调用。
function ToolCallLiveBar({conversationId}:{conversationId:string}) {
  const calls=useToolCalls(conversationId)
  const active=calls.filter(c=>c.status==='queued'||c.status==='awaiting_confirmation'||c.status==='running')
  if(!active.length)return null
  return <div className="tool-live-bar" role="status" aria-live="polite">{active.map(c=><div className="tool-live-item" key={c.key}><span className="tool-live-dot" aria-hidden="true"/><b>{c.displayName}</b><small>{TOOL_STATUS_LABEL[c.status]}</small></div>)}</div>
}

// 默认助手头像：未上传头像时统一使用（圆形浅紫底 + 人像剪影，内嵌 SVG 免网络请求）。
const DEFAULT_AVATAR="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='32' fill='%23ded7ee'/%3E%3Ccircle cx='32' cy='25' r='11' fill='%238b7fb8'/%3E%3Cpath d='M10 57c4-12.5 13-19 22-19s18 6.5 22 19z' fill='%238b7fb8'/%3E%3C/svg%3E"

// 消息操作栏的线性图标（低对比度轻量风格，颜色跟随 currentColor / 主题变量）。

// 微信式表情面板：内置表情集（分类顺序≈微信：面孔→手势→动物→食物→活动→符号）与搜索关键词表。
const STICKERS=['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','☺️','😚','😋','😛','😜','🤪','😝','🤗','🤭','🫢','🤫','🤔','🫡','🤐','😶','😐','😑','😬','🙄','😯','😪','😮','😴','🤤','😌','😔','😏','🥲','😢','😭','😮‍💨','😲','😵','😵‍💫','🤠','😎','🤓','🧐','😕','🫤','😟','🙁','☹️','😰','😨','🥶','🥵','😱','😣','😫','😩','😖','😞','😤','😠','😡','🤬','🤯','😳','🥴','🤢','🤮','😷','🤒','🤕','👋','🤚','👌','🤌','✌️','🤞','🫰','🤟','🤙','👍','👎','🫱','🫲','🙏','💪','🙌','👏','🫶','🤝','🖖','☝️','👇','👈','👉','🧑','👨','👩','🧔','👦','👧','🕺','💃','🧎','🧘','🙇','🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🦄','🐝','🦋','🐢','🐍','🐙','🐧','🐦','🦅','🦉','🐞','🐟','🐠','🐬','🐳','🦈','🐊','🐉','🐲','🌵','🌴','🌳','🍀','🍁','🍂','🌿','🌷','🌹','🌺','🌻','🌼','🌸','🍉','🍓','🍒','🍑','🍊','🍋','🍌','🍇','🥝','🍅','🥑','🍞','🍔','🍟','🍕','🌭','🌮','🌯','🥪','🍜','🍛','🍚','🍣','🍤','🍳','🥞','🧀','🍰','🎂','🍪','☕','🍵','🍺','🍻','🥂','🍷','🥤','⚽','🏀','🎾','🏈','⚾','🎮','🎯','🎤','🎧','🎵','🎶','📷','📺','🎬','🎭','🎨','🎪','🎠','🎡','🎢','🎉','🎊','🎁','🎈','🏆','🥇','🎿','🛷','❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❣️','💕','💞','💓','💗','💖','💘','💝','⭐','🌟','✨','💫','🔥','💧','🌈','❄️','☀️','🌙','⚡','🌊','💯','❗','❓','✅','❌','⭕','🚫','💤','💌','📜','📌','📍','🔔']
const EMOJI_KW:Record<string,string>={'😀':'笑 开心 微笑 高兴','😃':'笑 开心','😄':'笑 开心','😁':'笑 开心','😆':'笑 搞笑','😅':'尴尬 汗 微笑','🤣':'笑 哭 搞笑','😂':'笑 哭 搞笑 滑稽','🙂':'微笑','🙃':'无奈 反转','😉':'眨眼 调皮','😊':'笑 温暖 微笑','😇':'天使 乖','🥰':'爱 甜 可爱 喜欢','😍':'爱 喜欢 心动','🤩':'惊喜 棒 厉害','😘':'亲亲 爱 么么哒','😗':'亲','☺️':'微笑 笑','😚':'亲亲','😋':'好吃 馋 美食','😛':'吐舌 调皮','😜':'吐舌 调皮 眨眼','🤪':'搞怪 疯','😝':'吐舌 调皮','🤗':'抱抱 欢迎','🤭':'偷笑 捂嘴','🫢':'惊讶 捂嘴','🤫':'嘘 保密','🤔':'思考 疑问 想','🫡':'敬礼 致敬','🤐':'闭嘴 拉链','😶':'无语 沉默','😐':'平静','😑':'无语','😬':'尴尬','🙄':'白眼 无语','😯':'惊讶','😪':'困 累','😮':'惊讶 张嘴','😴':'困 睡 晚安','🤤':'馋 垂涎','😌':'平静 放松','😔':'难过 失落','😏':'得意 坏笑','🥲':'苦笑 难过','😢':'哭 难过 伤心','😭':'哭 大哭 难过','😮‍💨':'叹气 无奈','😲':'惊讶','😵':'晕 头晕','😵‍💫':'晕 眼花','🤠':'牛仔 得意','😎':'酷 墨镜 得意','🤓':'书呆子 眼镜','🧐':'审视 打量','😕':'疑惑 为难','🫤':'疑惑 无奈','😟':'担心','🙁':'不高兴 难过','☹️':'难过 不开心','😰':'紧张 冒汗','😨':'害怕','🥶':'冷 冻','🥵':'热 热死了','😱':'惊叫 恐怖 吓','😣':'难受 痛苦','😫':'累 烦','😩':'累 崩溃','😖':'难受','😞':'失望 难过','😤':'生气 傲 哼','😠':'生气','😡':'生气 发火 怒','🤬':'骂 生气','🤯':'震惊 绝了 爆炸','😳':'害羞 尴尬','🥴':'晕 醉','🤢':'恶心','🤮':'吐 恶心','😷':'口罩 病','🤒':'生病 发烧','🤕':'受伤 包扎','👋':'打招呼 你好 拜拜 再见','🤚':'停 手','👌':'好的 OK','🤌':'拿捏','✌️':'胜利 剪刀手','🤞':'祈祷 好运','🫰':'比心 钱','🤟':'爱你','🤙':'酷 拨打','👍':'赞 好 棒 点赞','👎':'踩 不好','🫱':'握手','🫲':'握手','🙏':'拜托 谢谢 感谢 祈祷 加油','💪':'加油 强壮 力量','🙌':'欢呼 棒','👏':'鼓掌 棒 厉害','🫶':'比心 爱','🤝':'握手 合作 成交','🖖':' Vulcan 祝愿','☝️':'上 一','👇':'下','👈':'左','👉':'右','🧑':'人','👨':'男 他','👩':'女 她','🧔':'胡子','👦':'男孩','👧':'女孩','🕺':'跳舞','💃':'跳舞','🧎':'跪','🧘':'瑜伽 冥想','🙇':'鞠躬 抱歉','🐶':'狗 汪 宠物','🐱':'猫 喵 宠物','🐭':'老鼠','🐹':'仓鼠','🐰':'兔子 可爱','🦊':'狐狸','🐻':'熊','🐼':'熊猫','🐨':'考拉','🐯':'老虎','🦁':'狮子','🐮':'牛','🐷':'猪','🐸':'青蛙','🐵':'猴子','🙈':'害羞 不看','🙉':'不听','🙊':'不说 保密','🦄':'独角兽','🐝':'蜜蜂','🦋':'蝴蝶','🐢':'乌龟','🐍':'蛇','🐙':'章鱼','🐧':'企鹅','🐦':'鸟','🦅':'老鹰','🦉':'猫头鹰','🐞':'瓢虫','🐟':'鱼','🐠':'热带鱼','🐬':'海豚','🐳':'鲸','🦈':'鲨鱼','🐊':'鳄鱼','🐉':'龙','🐲':'龙','🌵':'仙人掌','🌴':'椰树','🌳':'树','🍀':'幸运 四叶草','🍁':'枫叶','🍂':'落叶','🌿':'草 叶子','🌷':'花 郁金香','🌹':'玫瑰 花 爱','🌺':'花','🌻':'向日葵 花','🌼':'花','🌸':'花 樱花 春天','🍉':'西瓜 水果','🍓':'草莓 水果','🍒':'樱桃 水果','🍑':'桃 水果','🍊':'橘子 水果','🍋':'柠檬 水果','🍌':'香蕉 水果','🍇':'葡萄 水果','🥝':'猕猴桃 水果','🍅':'西红柿 水果','🥑':'牛油果','🍞':'面包 吃','🍔':'汉堡 吃 饿','🍟':'薯条 吃','🍕':'披萨 吃 饿','🌭':'热狗 吃','🌮':'卷饼 吃','🌯':'卷饼','🥪':'三明治 吃','🍜':'面 吃 饿','🍛':'咖喱 吃','🍚':'米饭 吃','🍣':'寿司 吃','🍤':'虾 吃','🍳':'煎蛋 吃','🥞':'松饼 早餐','🧀':'奶酪','🍰':'蛋糕 甜','🎂':'生日 蛋糕 庆祝','🍪':'饼干 甜','☕':'咖啡 喝 提神','🍵':'茶 喝','🍺':'啤酒 喝','🍻':'干杯 喝','🥂':'干杯 庆祝','🍷':'红酒 喝','🥤':'奶茶 喝 饮料','⚽':'足球 运动','🏀':'篮球 运动','🎾':'网球 运动','🏈':'橄榄球 运动','⚾':'棒球 运动','🎮':'游戏 玩','🎯':'靶子 目标','🎤':'唱歌 麦克风','🎧':'听歌 音乐','🎵':'音乐 歌','🎶':'音乐 歌','📷':'拍照 图片','📺':'电视 看剧','🎬':'电影 拍戏','🎭':'戏剧 面具','🎨':'画画 艺术','🎪':'马戏','🎠':'旋转木马','🎡':'摩天轮','🎢':'过山车','🎉':'庆祝 派对 生日 开心','🎊':'庆祝 派对','🎁':'礼物 生日','🎈':'气球 生日','🏆':'冠军 奖杯','🥇':'第一 冠军','🎿':'滑雪 运动','🛷':'雪橇','❤️':'心 爱 红心 喜欢','🧡':'心 爱','💛':'心 爱','💚':'心 爱','💙':'心 爱','💜':'心 爱','🖤':'心 黑','🤍':'心 白','💔':'伤心 分手 难过','❣️':'心 爱','💕':'爱 心','💞':'爱 心','💓':'爱 心','💗':'爱 心','💖':'爱 心','💘':'爱 心 桃心','💝':'爱 心 礼物','⭐':'星 星星','🌟':'星 星星 闪亮','✨':'闪亮 棒','💫':'星 晕','🔥':'火 热 厉害','💧':'水 滴','🌈':'彩虹','❄️':'雪 冷','☀️':'太阳 晴 热','🌙':'月亮 晚上 晚安','⚡':'闪电 快','🌊':'海浪','💯':'满分 优秀 加油','❗':'重要 注意','❓':'疑问 问题','✅':'对 完成 可以','❌':'错 不行 禁止','⭕':'圈','🚫':'禁止 不行','💤':'困 睡 晚安','💌':'信 情书 爱','📜':'文书','📌':'定位 图钉','📍':'定位 地点','🔔':'铃 提醒'}
function matchEmoji(e:string,q:string){if(!q)return true;if(e===q)return true;const kw=EMOJI_KW[e];return !!kw&&kw.includes(q)}

// 「工具」图标里的小程序：附件统一走输入框右下角的 ＋，这里暂时只放主动任务。
// 后续做了小程序 / 单独可视化网页，往这个数组加一项即可（其余位置留空）。
type ChatQuickTool = { id:string; label:string; desc:string; icon:string }
const CHAT_QUICK_TOOLS: ChatQuickTool[] = [
  { id:'task', label:'主动任务', desc:'定时任务与工作流', icon:'◷' },
]

function RequestStats({ messages }: { messages: ChatMessage[] }) {
  const rows = messages.filter((m) => m.role === 'assistant' && m.usage).slice(-30).reverse()
  const totals = rows.reduce((acc, m) => {
    const u = m.usage || {}
    acc.prompt += Number(u.promptTokens) || 0
    acc.completion += Number(u.completionTokens) || 0
    acc.cached += Number(u.cachedTokens || u.cacheReadTokens) || 0
    return acc
  }, { prompt: 0, completion: 0, cached: 0 })
  if (!rows.length) return <p className="muted">还没有请求记录。发一条消息后这里会显示每次请求的 token。</p>
  return <div className="request-stats">
    <div className="request-stats-summary">
      <div><small>请求</small><b>{rows.length}</b></div>
      <div><small>输入</small><b>{totals.prompt.toLocaleString()}</b></div>
      <div><small>输出</small><b>{totals.completion.toLocaleString()}</b></div>
      <div><small>缓存命中</small><b>{totals.cached.toLocaleString()}</b></div>
    </div>
    <div className="request-stats-list">{rows.map((m) => {
      const u = m.usage || {}
      const time = u.at ? new Date(u.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''
      const total = (Number(u.promptTokens) || 0) + (Number(u.completionTokens) || 0)
      return <div className="request-stats-row" key={m.id || Math.random()}>
        <div className="request-stats-line1"><b>{u.model || '未知模型'}</b><span>{time}</span></div>
        <div className="request-stats-line2">
          <span>输入 {Number(u.promptTokens || 0).toLocaleString()}</span>
          <span>输出 {Number(u.completionTokens || 0).toLocaleString()}</span>
          <span>合计 {total.toLocaleString()}</span>
          {u.cachedTokens || u.cacheReadTokens ? <span>缓存 {Number(u.cachedTokens || u.cacheReadTokens || 0).toLocaleString()}</span> : null}
          {u.preflightMs!==undefined ? <span>前置 {(Number(u.preflightMs) / 1000).toFixed(1)}s</span> : null}
          {u.firstTokenMs!==undefined ? <span>首包 {(Number(u.firstTokenMs) / 1000).toFixed(1)}s</span> : null}
          {u.streamMs!==undefined ? <span>生成 {(Number(u.streamMs) / 1000).toFixed(1)}s</span> : null}
          {u.tokensPerSecond ? <span>{Math.round(Number(u.tokensPerSecond))} tok/s</span> : null}
          {u.elapsedMs ? <span>总计 {(Number(u.elapsedMs) / 1000).toFixed(1)}s</span> : null}
        </div>
      </div>
    })}</div>
  </div>
}

function Chat(p: any) {
  const chatPerson:Person=p.person as Person
 const chatDisplay = useChatDisplay()
  // 聊天窗口内的「配置」抽屉：按当前助手选择模型预设 / 世界书条目 / MCP 服务。
  // 输入栏图标点开的小面板：与表情面板互斥，不遮挡聊天记录。
  const [tray,setTray]=useState<''|'model'|'bind'|'tools'>('')
  const [bindOpen,setBindOpen]=useState(false)
  const formRef=useRef<HTMLFormElement>(null)
  const openTray=(id:''|'model'|'bind'|'tools')=>{
    // 打开半屏模型面板前先收起软键盘，否则键盘会把 sheet 顶到屏幕外。
    if(id==='model'){const active=document.activeElement;if(active instanceof HTMLElement)active.blur()}
    setTray(t=>t===id?'':id);setEmojiOpen(false);setAttachOpen(false)
  }
  const closeModelSheet=useCallback(()=>setTray(''),[])
  // P2-2：「+」Bottom Sheet 里的低频入口，点完立即收起 sheet 再落到原行为。
  // 附件：一个图标管图片和文件，点开先选类型。
  function pickAttachment(kind:'image'|'file'){
    setAttachOpen(false)
    if(kind==='image'){imageInput.current?.click();return}
    fileInput.current?.click()
  }
  const runQuickTool=(id:string)=>{
    setTray('')
    if(id==='task'){p.setChatOpen(false);p.setActiveTool('工作流');return}
    // 未来新增的小程序在这里按 id 分支即可，默认不动聊天窗口。
  }
  // 绑定条点哪一段，配置抽屉就定位到哪一段；seq 保证重复点同一段也会重新定位。
  // 顶栏不再显示只读状态条；绑定状态由输入栏小图标的角标与面板自己表达。
  const quickMcp=useMcpLibrary()
  const quickBinding:PersonBinding=p.bindings?.[chatPerson]||emptyBinding()
  const quickMine=quickMcp.connections.filter(c=>c.person===chatPerson)
  // 图标面板只显示「设置页勾进池里」的 001 / 002 条目；编号按设置页全量列表算，保证两边一致。
  const pool:ChatPool=p.chatPool||normalizePool(null)
  const worldAll=((p.worldEntries||[]) as WorldEntry[]).map(e=>e.id)
  const trayWorld=((p.worldEntries||[]) as WorldEntry[]).filter(e=>isInPool(pool,'worldIds',e.id,worldAll))
  const worldNo=(id:string)=>poolLabel(worldAll.indexOf(id))
  const mcpAll=quickMine.map(c=>c.id)
  const trayMcp=quickMine.filter(c=>isInPool(pool,'mcpIds',c.id,mcpAll))
  const mcpNo=(id:string)=>poolLabel(mcpAll.indexOf(id))
  const vendorKeyOptions=allVendorKeys(p.vendors||[])
  const patchBinding=(next:PersonBinding)=>p.setBindings((old:Record<Person,PersonBinding>)=>({...old,[chatPerson]:next}))
  // 输入栏图标只作为「打开对应面板去修改」的入口，不显示任何数量角标。
  // 会话内搜索：只搜当前会话（p.messages[chatPerson]），不跨会话、不跨助手。
  const [searchQuery,setSearchQuery]=useState('')
  const [searchActiveIdx,setSearchActiveIdx]=useState(-1)  // 当前定位到的匹配下标（-1=尚未选中）
  const [files,setFiles]=useState<MessageAttachment[]>([])
  const [emojiOpen,setEmojiOpen]=useState(false)
  const [emojiTab,setEmojiTab]=useState<'emoji'|'fav'|'search'>('emoji')
  useEffect(()=>{
    if(!emojiOpen)return
    const onDown=(e:PointerEvent)=>{const t=e.target;if(t instanceof Element&&!t.closest('.emoji-panel,.compose-icon'))setEmojiOpen(false)}
    document.addEventListener('pointerdown',onDown)
    return ()=>document.removeEventListener('pointerdown',onDown)
  },[emojiOpen])
  const [emojiQuery,setEmojiQuery]=useState('')
  const [recentEmojis,setRecentEmojis]=useState<string[]>(()=>read('ai-home.recentEmojis',[]))
  const [imageStickers,setImageStickers]=useState<string[]>(()=>read('ai-home.imageStickers',[]))
  const [stickerLink,setStickerLink]=useState('')
  const [stickerLinkError,setStickerLinkError]=useState('')
  const [customEmojis,setCustomEmojis]=useState<string[]>(()=>read('ai-home.customEmojis',[]))
  const [newCustom,setNewCustom]=useState('')
  const [attachOpen,setAttachOpen]=useState(false)
  const [plusOpen,setPlusOpen]=useState(false)
  void openTray
  // 点输入栏图标时浮出一条文字说明（1.4s 自动消失），图标本身只留图形。
  const [toolHint,setToolHint]=useState('')
  const hintTimerRef=useRef<number|undefined>(undefined)
  const showToolHint=(label:string)=>{setToolHint(label);if(hintTimerRef.current)window.clearTimeout(hintTimerRef.current);hintTimerRef.current=window.setTimeout(()=>setToolHint(''),1400)}
  const [searchOpen,setSearchOpen]=useState(false)
  // 会话的新建 / 切换 / 重命名 / 删除统一收进左侧边抽屉，顶栏不再承载历史会话控件。
  const [lightbox,setLightbox]=useState<{src:string;name:string}|null>(null)
  const imageInput=useRef<HTMLInputElement>(null)
  const cameraInput=useRef<HTMLInputElement>(null)
  const fileInput=useRef<HTMLInputElement>(null)
  const stickerInput=useRef<HTMLInputElement>(null)
  // 聊天自动滚底：仅当用户本来就停在底部（或刚发送消息）时才跟随最新内容；
  // 用户向上翻阅时不再打扰；jumpToSource 的定向跳转不受影响（它随后会覆盖位置）。
  const chatBodyRef=useRef<HTMLDivElement>(null)
  const scrollPinned=useRef(true)
  const [atBottom,setAtBottom]=useState(true)
  const [summaryOpen,setSummaryOpen]=useState(false)
  const [statsOpen,setStatsOpen]=useState(false)
  const scrollIndicatorRef=useRef<HTMLDivElement|null>(null)
  const indicatorTimerRef=useRef<number|undefined>(undefined)
  useEffect(()=>{
    const el=chatBodyRef.current
    if(!el)return
    const onScroll=()=>{
      // Background WebView resize can reset scrollTop to zero; do not treat it as intentional history browsing.
      if (document.hidden) return
      scrollPinned.current=el.scrollHeight-el.scrollTop-el.clientHeight<80
      setAtBottom(scrollPinned.current)
      // 系统滚动条已隐藏：滚动时自绘一条 3px 细指示条，停手 ~0.8s 后淡出；
      // 贴底跟随（新消息自动滚动）时不闪，只有向上翻阅历史才出现。
      const ind=scrollIndicatorRef.current
      if(!ind)return
      const total=el.scrollHeight,view=el.clientHeight
      if(total<=view+4||scrollPinned.current){ind.classList.remove('show');return}
      const thumbH=Math.max(26,Math.round(view*view/total))
      const travel=view-thumbH
      const progress=total>view?Math.min(1,Math.max(0,el.scrollTop/(total-view))):0
      ind.style.height=thumbH+'px'
      ind.style.top=(el.offsetTop+progress*travel)+'px'
      ind.classList.add('show')
      if(indicatorTimerRef.current)window.clearTimeout(indicatorTimerRef.current)
      indicatorTimerRef.current=window.setTimeout(()=>{scrollIndicatorRef.current?.classList.remove('show')},800)
    }
    onScroll()
    el.addEventListener('scroll',onScroll,{passive:true})
    return ()=>{el.removeEventListener('scroll',onScroll);if(indicatorTimerRef.current)window.clearTimeout(indicatorTimerRef.current)}
  },[])
  const currentMessages:ChatMessage[]=p.messages[chatPerson]||[]
  // 当前会话的前情提要（上下文压缩后的摘要）；原文仍在 conversations 里，可展开查看。
  const summaryConversation=(p.conversations?.[chatPerson]||[]).find((c:Conversation)=>c.id===(p.activeConversationIds?.[chatPerson]||''))
  const activeChatConversationId:string=p.activeConversationIds?.[chatPerson]||''
  const lastQuickReplyRef=useRef<{key:string;at:number}>({key:'',at:0})
  useEffect(()=>{
    const onQuick=(event:Event)=>{
      const detail=(event as CustomEvent).detail
      const text=String(detail?.text||'').trim()
      if(!text||detail.person!==chatPerson)return
      if(detail.conversationId&&detail.conversationId!==activeChatConversationId)return
      const key=detail.person+'|'+detail.conversationId+'|'+text
      const now=Date.now()
      if(lastQuickReplyRef.current.key===key&&now-lastQuickReplyRef.current.at<3000)return
      lastQuickReplyRef.current={key,at:now}
      p.send(text,[])
    }
    window.addEventListener('aihome:quick-reply',onQuick)
    return ()=>window.removeEventListener('aihome:quick-reply',onQuick)
  },[chatPerson,activeChatConversationId,p])
  // 当前（助手 + 会话）的待发送 pending：强绑定 scope，绝不通话；刷新/切后台后由 App 恢复。
  const pendingForScope:PendingItem|null=(p.pendingSends||{})[pendingScopeKey(chatPerson,activeChatConversationId)]||null
  const [pendingEditMode,setPendingEditMode]=useState(false)
  const [pendingEditText,setPendingEditText]=useState('')
  // ── 消息操作：常驻轻量图标栏（复制/修改/重新生成/删除）+ 微信式多选删除 ──
  const [selectMode,setSelectMode]=useState(false)          // 多选模式（只作用于当前会话）
  const [selectedIds,setSelectedIds]=useState<string[]>([])  // 已勾选的消息 id
  const [armedDelId,setArmedDelId]=useState<string|null>(null)   // 单条删除二次确认（点一次变红，再点一次才删）
  const [armedSelKey,setArmedSelKey]=useState<string|null>(null) // 批量删除二次确认（键=选中集合）
  // 图片加载失败的 preview 集合：历史消息的 blob: 死链走这里，显示明确的失效态而不是伪装成正常图片。
  const [brokenPreviews,setBrokenPreviews]=useState<Record<string,boolean>>({})
  const [editingId,setEditingId]=useState<string|null>(null)
  const [editDraft,setEditDraft]=useState('')
  const [copiedId,setCopiedId]=useState<string|null>(null)
  // P1-5：翻译结果按 messageId 缓存，只在该消息展开后由用户点「翻译」才请求；刷新不落盘。
  const [translations,setTranslations]=useState<Record<string,string>>({})
  const [translatingId,setTranslatingId]=useState<string|null>(null)
  const copyTimerRef=useRef<number|undefined>(undefined)
  const longPressRef=useRef<number|undefined>(undefined)
  const delArmTimerRef=useRef<number|undefined>(undefined)
  const pressStartRef=useRef(0)
  // 触屏长按只展开这一条消息的操作栏；多选删除改由顶栏入口触发，原有多选逻辑不变。
  // 多选就靠长按气泡进入：不再有「操作面板展开」这个中间态。
  const composeTextRef=useRef<HTMLTextAreaElement|null>(null)
  useEffect(()=>{
    const el=composeTextRef.current
    if(!el)return
    el.style.height='auto'
    el.style.height=Math.min(140,Math.max(48,el.scrollHeight))+'px'
  },[p.draft])
  // 输入框单行起步、随内容增高，超过 120px 后内部滚动（不撑开整张聊天页）。
  useEffect(()=>{
    const el=composeTextRef.current
    if(!el)return
    el.style.height='auto'
    const h=Math.min(el.scrollHeight,120)
    el.style.height=h+'px'
    el.style.overflowY=el.scrollHeight>120?'auto':'hidden'
  },[p.draft])
  useEffect(()=>()=>{if(copyTimerRef.current)window.clearTimeout(copyTimerRef.current);if(longPressRef.current)window.clearTimeout(longPressRef.current);if(delArmTimerRef.current)window.clearTimeout(delArmTimerRef.current)},[])
  // 切换助手 / 会话：多选只属于当前会话——自动退出；同时收起编辑、删除确认与搜索。
  useEffect(()=>{
    setSelectMode(false);setSelectedIds([]);setArmedSelKey(null);setArmedDelId(null)
    setEditingId(null);setEditDraft('')
    setSearchOpen(false);setSearchQuery('');setSearchActiveIdx(-1)
  },[chatPerson,activeChatConversationId])
  // 多选模式下按 Esc 退出（监听放在事件回调里，非 effect 渲染期调用）。
  useEffect(()=>{
    if(!selectMode)return
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){setSelectMode(false);setSelectedIds([]);setArmedSelKey(null);setArmedDelId(null)}}
    document.addEventListener('keydown',onKey)
    return()=>document.removeEventListener('keydown',onKey)
  },[selectMode])
  // Android 返回键：聊天页内临时层优先关闭（灯泡图→搜索→多选→表情/更多面板），
  // 全关完才把返回事件交还给上层（房间页/根），由 App 决定是否退出。
  useEffect(()=>{
    const anyLayer=!!lightbox||searchOpen||selectMode||emojiOpen||attachOpen
    if(!anyLayer)return
    const unregister=pushBackHandler(()=>{
      if(lightbox){setLightbox(null);return true}
      if(searchOpen){closeSearch();return true}
      if(selectMode){exitSelect();return true}
      if(emojiOpen){setEmojiOpen(false);return true}
      if(attachOpen){setAttachOpen(false);return true}
      return false
    })
    return unregister
  },[lightbox,searchOpen,selectMode,emojiOpen,attachOpen])
  // 编辑中的消息被删除 / 撤回后退出编辑态（取消编辑本来就不改原消息）。
  // 依赖用底层 state 引用（currentMessages 的 ||[] 兜底每次渲染都是新数组）。
  const editWatch:ChatMessage[]|undefined=p.messages[chatPerson]
  useEffect(()=>{const list=editWatch||[];if(editingId&&!list.some((m:ChatMessage)=>m.id===editingId)){setEditingId(null);setEditDraft('')}},[editWatch,editingId])
  async function copyMessage(m:ChatMessage){
    if(!m.id||!m.content)return
    // 只复制当前消息正文；助手消息先走清洗，绝不把系统注入/协议标签复制出去。
    const text=m.role==='assistant'?cleanupMessageText(m.content):m.content
    if(!text)return
    try{
      if(navigator.clipboard&&navigator.clipboard.writeText)await navigator.clipboard.writeText(text)
      else{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove()}
      setCopiedId(m.id)
      if(copyTimerRef.current)window.clearTimeout(copyTimerRef.current)
      copyTimerRef.current=window.setTimeout(()=>setCopiedId(v=>v===m.id?null:v),1600)
    }catch{p.setChatError('复制失败，请手动选择文本复制。')}
  }
  // P1-7：双方消息都可修改（只改文本，不重发、不重新生成）。助手消息用清洗后的正文做草稿。
  function startEdit(m:ChatMessage){if(!m.id||selectMode)return;setEditingId(m.id);setEditDraft(m.role==='assistant'?cleanupMessageText(m.content):m.content)}
  // P1-5：用户点「翻译」才请求，结果与原文分开展示，绝不自动翻译。
  async function doTranslate(m:ChatMessage){
    if(!m.id||!m.reasoning||translatingId)return
    setTranslatingId(m.id)
    try{
      const out=await p.translateReasoning(cleanupMessageText(m.reasoning))
      setTranslations(prev=>({...prev,[m.id!]:out}))
    }catch(e){p.setChatError('翻译失败：'+(e instanceof Error?e.message:String(e)))}
    finally{setTranslatingId(null)}
  }
  function saveEdit(){if(!editingId)return;const text=editDraft.trim();if(!text)return;p.editMessage(editingId,text);setEditingId(null);setEditDraft('')}
  // 用户消息专用：改完文字后，把这条之后的旧回复全部丢掉并重新请求一次回答。
  async function saveEditAndResend(m:ChatMessage){
    const text=editDraft.trim()
    if(!m.id||!text||p.sending)return
    setEditingId(null);setEditDraft('')
    await p.resendUserMessage(m.id,text)
  }
  function cancelEdit(){setEditingId(null);setEditDraft('')}
  // 单条删除：轻量二次确认——第一次点垃圾桶变红「删除？」，3 秒内再点一次才执行。
  function removeMessage(m:ChatMessage){
    if(!m.id||selectMode)return
    if(armedDelId!==m.id){
      setArmedDelId(m.id)
      if(delArmTimerRef.current)window.clearTimeout(delArmTimerRef.current)
      delArmTimerRef.current=window.setTimeout(()=>setArmedDelId(v=>v===m.id?null:v),3200)
      return
    }
    if(delArmTimerRef.current)window.clearTimeout(delArmTimerRef.current)
    setArmedDelId(null)
    if(editingId===m.id)cancelEdit()
    p.deleteMessage(m.id)
  }
  async function regenerate(m:ChatMessage){if(!m.id||selectMode)return;await p.regenerateMessage(m.id)}
  // ── 多选：进入 / 退出 / 勾选 / 批量删除（二次确认键=当前选中集合，选择一变即自动失效）──
  function enterSelect(id?:string){
    setSelectMode(true)
    setSelectedIds(id?[id]:[])
    setArmedSelKey(null);setArmedDelId(null)
    setEditingId(null);setEditDraft('')
    setEmojiOpen(false);setAttachOpen(false);closeSearch()
  }
  function exitSelect(){setSelectMode(false);setSelectedIds([]);setArmedSelKey(null);setArmedDelId(null)}
  function toggleSelect(id:string){if(!id)return;setSelectedIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id])}
  const selectKey=selectedIds.join('|')
  function batchDelete(){
    if(!selectedIds.length)return
    if(armedSelKey!==selectKey){setArmedSelKey(selectKey);return}
    p.deleteMessages(selectedIds)
    exitSelect()
  }
  // 触屏长按气泡 = 进入多选并选中这条；松手后的 click 由 pressStartRef 吞掉。
  // 时间戳用事件自带的 e.timeStamp（同一单调时钟），避免在组件体内调用 Date.now。
  function bubblePointerDown(e:React.PointerEvent,m:ChatMessage){
    pressStartRef.current=e.timeStamp
    if(e.pointerType!=='touch'||!m.id||selectMode)return
    const targetId=m.id
    if(longPressRef.current)window.clearTimeout(longPressRef.current)
    longPressRef.current=window.setTimeout(()=>{enterSelect(targetId)},480)
  }
  function bubblePointerEnd(){if(longPressRef.current){window.clearTimeout(longPressRef.current);longPressRef.current=undefined}}
  function bubbleClick(e:React.MouseEvent,m:ChatMessage){
    if(e.timeStamp-pressStartRef.current>420){pressStartRef.current=0;return} // 长按刚触发，吞掉这次 click
    if(selectMode){if(m.id)toggleSelect(m.id)}
  }
  const lastMessage=currentMessages[currentMessages.length-1]
  const lastContent=lastMessage?String(lastMessage.content||''):''
  useEffect(()=>{
    if(!scrollPinned.current)return
    const el=chatBodyRef.current
    if(!el)return
    const pin=()=>{el.scrollTop=el.scrollHeight}
    pin()
    // 消息追加 / 流式更新 / 键盘开合会改变高度：再补两次贴底，避免停在上面。
    const raf=requestAnimationFrame(pin)
    const timer=window.setTimeout(pin,140)
    return ()=>{cancelAnimationFrame(raf);window.clearTimeout(timer)}
  },[currentMessages.length,lastContent,p.person,activeChatConversationId,p.sending])
  // 打开聊天、切换助手或会话时直接贴底（新会话从最新消息开始看）；
  // 此后新消息只在用户仍在底部时跟随（上面的效果），向上翻阅不打扰。
  // jumpToSource 的定向跳转在其后 80ms 执行，仍能覆盖这里的位置。
  useEffect(()=>{
    scrollPinned.current=true
    const el=chatBodyRef.current
    if(!el)return
    const pin=()=>{if(scrollPinned.current)el.scrollTop=el.scrollHeight}
    pin()
    // 进入聊天时消息/图片/键盘可能晚一步撑高，补几次并监听 DOM 变化，确保落在最新一条。
    const timers=[60,220,500,900,1400,2000].map(ms=>window.setTimeout(pin,ms))
    const mo=new MutationObserver(()=>requestAnimationFrame(pin))
    mo.observe(el,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['src']})
    const onImgLoad=()=>requestAnimationFrame(pin)
    el.addEventListener('load',onImgLoad,true)
    const ro=new ResizeObserver(()=>requestAnimationFrame(pin))
    ro.observe(el)
    return ()=>{timers.forEach(t=>window.clearTimeout(t));mo.disconnect();ro.disconnect();el.removeEventListener('load',onImgLoad,true)}
  },[chatPerson,activeChatConversationId,p.person])
  // 打字时键盘把可视高度压小，容器 resize 后滚动位置会被浏览器重算；
  // 只要焦点还在输入框，就补滚到最新一条，保证「边打字边看得见聊天记录」。
  const pinToLatest=useCallback(()=>{
    const el=chatBodyRef.current
    if(!el)return
    scrollPinned.current=true
    setAtBottom(true)
    el.scrollTop=el.scrollHeight
  },[])
  useEffect(()=>{
    const vv=window.visualViewport
    if(!vv)return
    const onResize=()=>{
      const active=document.activeElement
      if(active instanceof HTMLElement&&active.classList.contains('compose-text'))requestAnimationFrame(pinToLatest)
    }
    vv.addEventListener('resize',onResize)
    return ()=>vv.removeEventListener('resize',onResize)
  },[pinToLatest])
  // Android resumes WebView with a stale scrollTop after background/keyboard layout changes.
  // Resume at newest message, then re-pin while the viewport settles; do not run while hidden.
  useEffect(()=>{
    let timers: number[]=[]
    const resume=()=>{
      if(document.hidden)return
      scrollPinned.current=true
      setAtBottom(true)
      const pin=()=>{const el=chatBodyRef.current;if(el&&scrollPinned.current)el.scrollTop=el.scrollHeight}
      pin()
      timers.forEach(window.clearTimeout)
      timers=[80,240,550,1000].map(ms=>window.setTimeout(pin,ms))
    }
    document.addEventListener('visibilitychange',resume)
    window.addEventListener('pageshow',resume)
    window.addEventListener('focus',resume)
    return ()=>{document.removeEventListener('visibilitychange',resume);window.removeEventListener('pageshow',resume);window.removeEventListener('focus',resume);timers.forEach(window.clearTimeout)}
  },[chatPerson,activeChatConversationId])
  // 图片上传换稳定引用：字节存后端（见 server/attachments.mjs），preview 持久化为
  // /api/attachments/<id>，聊天记录只带 assetId+URL，Base64 永不进 localStorage/云端快照。
  // 时机选在「选择图片」而非「发送」：loadFiles 本就是 async，
  // 上传后的稳定引用对普通发送与待发送卡片（pendingSend）两条路径都直接可用，发送逻辑无需改动。
  async function uploadAttachment(item:MessageAttachment):Promise<{id:string,url:string}|null>{
    try{
      const dataUrl=item.dataUrl||''
      const comma=dataUrl.indexOf(',')
      if(comma<0)return null
      const res=await apiFetch('/api/attachments',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:item.name,mime:item.type,data:dataUrl.slice(comma+1)})})
      if(!res.ok)return null
      const body=await res.json()
      if(!body||!body.id||!body.url)return null
      return {id:String(body.id),url:String(body.url)}
    }catch{return null}
  }
  async function loadFiles(list: FileList | null, imagesOnly=false) {
    if(!list)return
    const selected=Array.from(list).slice(0,8)
    const loaded:MessageAttachment[]=[]
    let uploadFailed=0
    for(const file of selected){
      if(imagesOnly&&!file.type.startsWith('image/'))continue
      if(file.size>12*1024*1024){p.setChatError('单个文件不能超过 12 MB：'+file.name);continue}
      const item:MessageAttachment={name:file.name,type:file.type||'application/octet-stream',size:file.size}
      if(file.type.startsWith('image/')){
        item.dataUrl=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('图片读取失败'));r.readAsDataURL(file)})
        item.preview=URL.createObjectURL(file)
        // 图片表情包（preview 本就是持久的 data:）不重复上传，保持既有链路。
        if(needsUpload(item)){
          const saved=await uploadAttachment(item)
          if(saved){item.preview=saved.url;item.assetId=saved.id}
          else uploadFailed++   // 降级：保留 blob: 本次会话仍可见，但刷新会失效，必须明示
        }
      } else if(/\.(txt|md|json|csv|log)$/i.test(file.name)&&file.size<500*1024){
        item.textContent=await file.text()
      }
      loaded.push(item)
    }
    // 附件持久化失败不再打断聊天：当前图片仍保留 dataUrl，可正常随本轮请求发送。
    // 这里只记开发日志；不要把“云端失败”作为每次发图都会弹出的用户提示。
    if(uploadFailed)console.warn('[attachments] persistence failed for',uploadFailed,'image(s); keeping in-session data only')
    setFiles(prev=>[...prev,...loaded].slice(0,8))
    if(imageInput.current)imageInput.current.value=''
    if(fileInput.current)fileInput.current.value=''
  }
  // 移除发送栏里还没发出的附件：已上传的图片要同步释放，否则会留孤儿文件。
  // 用全局引用扫描兜底——只要还有任何消息引用它就绝不删。
  function removePendingFile(index:number){
    const target=files[index]
    setFiles(prev=>prev.filter((_,j)=>j!==index))
    if(!target||!target.assetId)return
    const stillReferenced=collectReferencedAssetIds({conversations:p.conversations,messages:p.messages,pendingSends:p.pendingSends})
    if(stillReferenced.has(String(target.assetId)))return
    apiFetch('/api/attachments/'+encodeURIComponent(String(target.assetId)),{method:'DELETE',credentials:'include'}).catch(()=>{})
  }
  async function submit(e:FormEvent){e.preventDefault();scrollPinned.current=true;if(!p.draft.trim()&&!files.length)return;const text=p.draft.trim();const payload=files.map((a:MessageAttachment)=>({name:a.name,type:a.type,size:a.size,dataUrl:a.dataUrl,preview:a.preview,assetId:a.assetId,textContent:a.textContent}));if(p.sending){/* 生成态 + 有输入 → 入待发送队列（不立即请求模型）；输入立即清空，显示待发送卡片 */if(!p.enqueuePending(text,payload)){p.setChatError('这条会话已有待发送内容，先发送或撤回它再继续。');return}}else{p.send(text,payload)}setFiles([]);setEmojiOpen(false);setAttachOpen(false);closeSearch();for(const ms of [60,220,520])window.setTimeout(pinToLatest,ms)}
  function downloadText(a:MessageAttachment){if(!a.textContent)return;const blob=new Blob([a.textContent],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=a.name+'.txt';link.click();URL.revokeObjectURL(url)}
  function pickEmoji(emoji:string){p.setDraft(p.draft+emoji);const next=[emoji,...recentEmojis.filter(x=>x!==emoji)].slice(0,24);setRecentEmojis(next);localStorage.setItem('ai-home.recentEmojis',JSON.stringify(next))}
  const personAvatar=(p.characters&&p.characters[chatPerson]&&p.characters[chatPerson].avatar)||''
  // 我的头像按助手各存一份：在助手档案的「用户设置」里改。
  const userAvatar=(p.userSettings&&p.userSettings[chatPerson]&&p.userSettings[chatPerson].avatar)||''
  const myName=String(p.roomName||'我')
  // 图片表情包：上传后缩到 128px 存 localStorage（控制体积），点击即作为图片附件进发送栏。
  function shrinkSticker(src:string):Promise<string>{return new Promise(resolve=>{const img=new Image();img.onload=()=>{const max=128;const scale=Math.min(1,max/Math.max(img.width,img.height,1));const w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale));const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');if(!ctx){resolve(src);return}ctx.drawImage(img,0,0,w,h);let out='';try{out=c.toDataURL('image/webp',0.82)}catch{out=''}if(!out.startsWith('data:image/webp')){try{out=c.toDataURL('image/png')}catch{out=src}}resolve(out)};img.onerror=()=>resolve(src);img.src=src})}
  async function addImageStickers(list:FileList|null){if(!list||!list.length)return;const added:string[]=[];for(const file of Array.from(list).slice(0,9)){if(!file.type.startsWith('image/'))continue;const raw=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('图片读取失败'));r.readAsDataURL(file)}).catch(()=>'');if(raw)added.push(await shrinkSticker(raw))}if(!added.length)return;const next=[...imageStickers,...added].slice(-30);try{localStorage.setItem('ai-home.imageStickers',JSON.stringify(next))}catch{p.setChatError('图片表情保存失败：浏览器本地存储空间不足，可先「清空图片」再上传。');return}setImageStickers(next);if(stickerInput.current)stickerInput.current.value=''}
  function sendImageSticker(url:string){
    const type=/\.png(\?|$)/i.test(url)?'image/png':/\.jpe?g(\?|$)/i.test(url)?'image/jpeg':/\.gif(\?|$)/i.test(url)?'image/gif':'image/webp'
    const ext=type==='image/png'?'png':type==='image/jpeg'?'jpg':type==='image/gif'?'gif':'webp'
    setFiles(prev=>[...prev,{name:'图片表情'+(prev.length+1)+'.'+ext,type,size:Math.max(1,Math.round(url.length*0.75)),dataUrl:url,preview:url}].slice(0,8))
    setEmojiOpen(false)
  }
  function addImageStickerLink(){
    const url=stickerLink.trim()
    if(!/^https?:\/\//i.test(url)){setStickerLinkError('请粘贴 http/https 图片直链');return}
    if(imageStickers.includes(url)){setStickerLinkError('这张已经在表情包里了');return}
    const next=[...imageStickers,url].slice(-30)
    try{localStorage.setItem('ai-home.imageStickers',JSON.stringify(next))}catch{setStickerLinkError('保存失败：本地存储空间不足');return}
    setImageStickers(next);setStickerLink('');setStickerLinkError('')
  }
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
  // ── 会话内消息搜索（微信式）：只匹配当前会话的用户消息与 AI 回复。
  // useMemo：长聊天下只有「消息字典引用 / 助手 / 关键词」变化才重算，纯子串扫描 O(n)，不卡输入。
  // 依赖用底层 state 引用（currentMessages 的 ||[] 兜底每次渲染都是新数组，不能直接依赖）。
  // 不调用模型、不改写任何消息、不触发重新生成。
  const searchWatch:ChatMessage[]|undefined=p.messages[chatPerson]
  const searchResult:ChatSearchResult=useMemo(()=>searchMessages(searchWatch,searchQuery),[searchWatch,searchQuery])
  const searchCurrentId=searchOpen&&searchActiveIdx>=0?(searchResult.items[searchActiveIdx]?.messageId||''):''
  const flashTimerRef=useRef<number|undefined>(undefined)
  useEffect(()=>()=>{if(flashTimerRef.current)window.clearTimeout(flashTimerRef.current)},[])
  // 定位一律走真实消息节点（data-message-id，alignMessageIds 保证每条消息都有 id），
  // 不依赖数组下标——消息增删后下标会漂移，节点查询不会。
  function scrollToMatch(messageId:string){
    const body=chatBodyRef.current
    if(!body||!messageId)return
    const node=body.querySelector('[data-message-id="'+CSS.escape(messageId)+'"]')
    if(!node)return
    node.scrollIntoView({block:'center',behavior:'smooth'})
    // 短暂高亮：先移除再强制 reflow 再加回，连续跳转到同一条也能重放动画。
    node.classList.remove('search-flash')
    void (node as HTMLElement).offsetWidth
    node.classList.add('search-flash')
    if(flashTimerRef.current)window.clearTimeout(flashTimerRef.current)
    flashTimerRef.current=window.setTimeout(()=>node.classList.remove('search-flash'),1700)
  }
  function stepMatch(dir:number){
    const total=searchResult.items.length
    if(!total)return
    const next=stepMatchIndex(searchActiveIdx,total,dir)
    setSearchActiveIdx(next)
    const item=searchResult.items[next]
    if(item&&item.messageId)scrollToMatch(item.messageId)
  }
  function closeSearch(){setSearchOpen(false);setSearchQuery('');setSearchActiveIdx(-1)}
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
  // 会话切换 / 新建 / 重命名 / 删除统一收进左侧抽屉（AppSidebar），聊天顶栏不再出现任何会话控件。
  // 单条消息 = [复选框(多选时)] + [头像] + message-stack 列容器（气泡/修改框 + 操作栏 + 元信息）。
  // 图标栏与气泡在同一 flex 列里，天然贴在气泡正下方：AI 左对齐（不压头像）、用户右对齐。
  // 用户消息 = 复制/修改/删除；最新 AI 回复 = 复制/重新生成/删除；其他 AI 回复 = 复制/删除。
  function renderMessageRow(m:ChatMessage,i:number,list:ChatMessage[]){
    const isLast=i===list.length-1
    const isEditing=!!m.id&&editingId===m.id
    const canAct=!!m.id
    const inSelect=selectMode
    const selected=!!(inSelect&&canAct&&m.id&&selectedIds.includes(m.id))
    const armed=!!(m.id&&armedDelId===m.id)
    const canRegenerate=m.role==='assistant'&&isLast&&canAct&&!p.sending
    // 历史消息渲染兜底：老记录可能已存了系统注入/协议标签。只清洗助手输出，
    // 用户自己输入的原文（哪怕在讨论 <system_warning>）保持不变。
    const shownContent=m.role==='assistant'?cleanupMessageText(m.content||''):(m.content||'')
    const shownReasoning=m.role==='assistant'?cleanupMessageText(m.reasoning||''):(m.reasoning||'')
    const tokenSummary=m.role==='assistant'&&m.usage?summarizeTokenUsage(m.usage):null
    const timeText=formatMessageTime(m)
    return <div className={'message-row '+m.role+(inSelect?' select-mode':'')+(selected?' is-selected':'')+(searchCurrentId&&m.id===searchCurrentId?' search-current':'')} key={i} data-message-id={m.id||undefined}>
      {inSelect&&canAct&&<button type="button" className={'msg-check'+(selected?' on':'')} role="checkbox" aria-checked={selected} aria-label={selected?'取消选择这条消息':'选择这条消息'} onClick={()=>toggleSelect(m.id!)}>{selected?<IconCheck size={13}/>:null}</button>}
      {m.role==='assistant'&&chatDisplay.assistantAvatar&&<button type="button" className="message-avatar avatar-link" title="打开助手档案与用户设置" aria-label="打开助手档案" onClick={()=>p.openAssistantProfile(true)}>{personAvatar?<img src={personAvatar} alt=""/>:<img src={DEFAULT_AVATAR} alt=""/>}</button>}
      <div className={'message-stack '+(m.role==='user'?'stack-end':'stack-start')}>
        {!isEditing&&(chatDisplay.assistantName||chatDisplay.userName||(chatDisplay.time&&timeText))&&<div className={'message-meta'+(m.role==='user'?' end':'')}>
          {m.role==='assistant'&&chatDisplay.assistantName&&<span className="message-sender">{p.displayName(chatPerson)}</span>}
          {m.role==='user'&&chatDisplay.time&&timeText&&<span className="message-time">{timeText}</span>}
          {m.role==='assistant'&&chatDisplay.time&&timeText&&<span className="message-time">{timeText}</span>}
          {m.role==='user'&&chatDisplay.userName&&<span className="message-sender">{myName}</span>}
        </div>}
        {isEditing
          ? <div className="message-edit"><textarea value={editDraft} onChange={e=>setEditDraft(e.target.value)} rows={3} aria-label="修改消息内容" placeholder="修改这条消息的文字…（只改文字，不重新发送）"/><div className="message-edit-actions"><button type="button" onClick={cancelEdit}>取消</button>{m.role==='user'&&<button type="button" disabled={!editDraft.trim()||p.sending} onClick={()=>void saveEditAndResend(m)}>保存并重发</button>}<button type="button" className="primary" disabled={!editDraft.trim()} onClick={saveEdit}>保存</button></div></div>
          : <>

            <div className={'bubble '+m.role}
              onClick={e=>bubbleClick(e,m)}
              onPointerDown={e=>bubblePointerDown(e,m)} onPointerUp={bubblePointerEnd} onPointerLeave={bubblePointerEnd} onPointerCancel={bubblePointerEnd} onPointerMove={bubblePointerEnd}>
          {chatDisplay.showReasoning&&shownReasoning?<details className="reasoning" onToggle={e=>{if(e.currentTarget.open&&chatDisplay.autoTranslateReasoning&&needsChineseTranslation(shownReasoning)&&m.id&&!translations[m.id]&&!translatingId)void doTranslate(m)}}>
              <summary>{(p.sending&&isLast&&!shownContent)?'思考中……':'思考过程'}{chatDisplay.showReasoningDuration&&m.usage?.elapsedMs!==undefined?' · '+formatDuration(m.usage.elapsedMs):''}<span className="fold-chevron" aria-hidden="true"><IconChevronRight size={13}/></span></summary>
              <div className="reasoning-body">
                <div className="reasoning-original">{shownReasoning}</div>
                {needsChineseTranslation(shownReasoning)&&m.id&&<div className="reasoning-translate">
                  {translations[m.id]?null:<button type="button" disabled={translatingId===m.id} onClick={()=>void doTranslate(m)}>{translatingId===m.id?'翻译中…':'翻译'}</button>}
                </div>}
                {m.id&&translations[m.id]&&<div className="reasoning-translated"><b>中文翻译</b><div>{translations[m.id]}</div></div>}
              </div>
            </details>:null}
          {m.role==='assistant'&&shownContent
            ? <RichText text={shownContent}/>
            : (shownContent || (p.sending&&isLast?(p.generationStage==='preparing'?'正在准备上下文…':p.generationStage==='connecting'?'正在连接模型…':p.generationStage==='tools'?'正在调用工具…':'正在生成…'):'') )}{m.attachments?.map((a:MessageAttachment,j:number)=><div className="sent-attachment" key={j}>{a.type.startsWith('image/')?<div className="sent-image-placeholder">{a.preview&&!brokenPreviews[a.preview]?<button type="button" className="image-open-button" title="点击放大图片" onClick={()=>{if(selectMode)return;setLightbox({src:a.preview!,name:a.name})}}><img src={assetUrl(a.preview)} alt={a.name} onError={()=>setBrokenPreviews(prev=>({...prev,[String(a.preview)]:true}))}/></button>:<span className="attachment-missing" title={a.preview?'原始图片数据已丢失，无法恢复':'这条历史消息只保留了文件名'}><IconWarning size={14}/> {a.preview?'图片已失效':'图片 '+a.name}</span>}</div>:<div className="sent-file"><span><IconFile size={18}/></span><div><b>{a.name}</b><small>{formatSize(a.size)}</small>{a.textContent&&<button type="button" className="download-text" onClick={()=>{if(selectMode)return;downloadText(a)}}>下载文本副本</button>}</div></div>}</div>)}
          {m.role==='assistant'&&m.id&&<MessageToolCalls messageId={m.id}/>}
        </div>
          </>}
        {!isEditing&&canAct&&!inSelect&&<div className="message-actions">
          <IconButton icon={copiedId===m.id?IconCheck:IconCopy} label={copiedId===m.id?'已复制':'复制消息'} className="message-action" disabled={!m.content} onClick={()=>void copyMessage(m)}/>
          <IconButton icon={IconEdit} label="修改这条消息" className="message-action" onClick={()=>startEdit(m)}/>
          {m.role==='assistant'&&<IconButton icon={IconRefresh} label="重新生成回复" title={canRegenerate?'重新生成':'只有最新一条回复可以重新生成'} className="message-action" disabled={!canRegenerate} onClick={()=>void regenerate(m)}/>} 
          {armed
            ? <button type="button" className="message-action danger armed" title="再点一次确认删除这条消息" onClick={()=>removeMessage(m)}><span className="message-action-armed-text">删除？</span></button>
            : <IconButton icon={IconTrash} label="删除这条消息" className="message-action danger" onClick={()=>removeMessage(m)}/>}
          {m.role==='assistant'&&chatDisplay.token&&tokenSummary&&<details className="message-tech inline">
            <summary>{tokenSummary.label}</summary>
            <div className="message-tech-body">
              {tokenSummary.rows.map(r=><span key={r.label}>{r.label}：{r.value}</span>)}
              {estimatedCost(m.usage!)!==null&&<span>≈ ¥{estimatedCost(m.usage!)!.toFixed(4)}</span>}
              {p.lastRouteInfo&&<span>{p.lastRouteInfo}</span>}
            </div>
          </details>}
        </div>}
        {m.role==='user'&&m.contextNote&&<div className="message-context-note" title="发送时附带的本地上下文（仅注入模型提示词，不显示在气泡内）">{m.contextNote}</div>}
      </div>
      {m.role==='user'&&chatDisplay.userAvatar&&<button type="button" className="message-avatar message-avatar-me avatar-link" title="我的头像 · 点开助手档案的用户设置" aria-label="我的头像" onClick={()=>p.openAssistantProfile(true)}>{userAvatar?<img src={userAvatar} alt=""/>:myName.slice(0,1)}</button>}
    </div>
  }
  return <div className="fullscreen-chat">
    {/* 全面屏顶栏：不铺返回/会话控件。历史会话从左侧抽屉点选，返回房间走系统返回手势或抽屉底部入口。 */}
    <header className="chat-header chat-header-simple"><span className="chat-header-title"><button type="button" className="chat-avatar avatar-link" title="打开助手档案与用户设置" aria-label="打开助手档案" onClick={()=>p.openAssistantProfile(true)}>{personAvatar?<img src={personAvatar} alt=""/>:<img src={DEFAULT_AVATAR} alt=""/>}</button><b>{p.displayName(p.person)}</b></span><span className="chat-header-actions"><IconButton icon={IconPlus} label="新对话" className="btn-icon" iconSize={16} onClick={createConversation}/><IconButton icon={IconSwitch} label="切换助手" className="btn-icon" iconSize={16} onClick={()=>{p.setPerson(p.person === YWX ? YS : YWX);p.setChatError('')}}/></span></header>
    {searchOpen&&<div className="chat-search"><input autoFocus value={searchQuery} onChange={e=>{setSearchQuery(e.target.value);setSearchActiveIdx(-1)}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();stepMatch(1)}if(e.key==='Escape'){closeSearch()}}} placeholder="搜索当前会话的聊天记录……" aria-label="搜索当前会话的聊天记录"/>{searchQuery.trim()&&<span className="chat-search-count" aria-live="polite">{searchActiveIdx>=0?`${searchActiveIdx+1}/${searchResult.total}`:`共 ${searchResult.total} 条`}</span>}<button type="button" aria-label="上一条匹配" title="上一条匹配" disabled={!searchResult.items.length} onClick={()=>stepMatch(-1)}><IconArrowUp size={15}/></button><button type="button" aria-label="下一条匹配" title="下一条匹配（Enter 同效）" disabled={!searchResult.items.length} onClick={()=>stepMatch(1)}><IconArrowDown size={15}/></button>{searchQuery.trim()&&<button type="button" onClick={()=>setSearchQuery('')}>清除</button>}</div>}
    {searchOpen&&searchQuery.trim()&&<div className="chat-search-results" role="list">{searchResult.items.length?searchResult.items.map((x:any,i:number)=><button type="button" role="listitem" className={i===searchActiveIdx?'current':''} key={(x.messageId||'idx-'+x.index)+'-'+i} onClick={()=>{setSearchActiveIdx(i);if(x.messageId)scrollToMatch(x.messageId)}}><b>{x.role==='user'?'你':'助手'} · 第 {x.index+1} 条{x.count>1?` · ${x.count} 处匹配`:''}</b><span>{x.snippet}</span></button>):<p>没有找到匹配的消息。</p>}{searchResult.total>searchResult.items.length&&<p className="chat-search-overflow">仅显示前 {searchResult.items.length} 条，共 {searchResult.total} 条匹配。</p>}</div>}
    {/* 会话切换已收进顶栏下拉，这里不再铺头像卡片。 */}
    {p.chatError&&<div className="chat-error"><span>{p.chatError}</span><button onClick={()=>p.setChatError('')}><IconClose size={15}/></button></div>}
    <ToolCallLiveBar conversationId={p.activeConversationIds?.[chatPerson]||''}/>
    <div className="chat-body" ref={chatBodyRef}>
      {summaryConversation?.summary&&<button type="button" className="chat-summary-chip" onClick={()=>setSummaryOpen(true)}>前情 · 已压缩 {summaryConversation.summaryThrough||''} 条</button>}
      {p.messages[p.person].length ? p.messages[p.person].map((m:ChatMessage,i:number)=>renderMessageRow(m,i,p.messages[p.person])) : <div className="empty-chat">这里是 {p.displayName(p.person)} 的独立房间。<br/>配置模型后，就可以在这里聊天啦。</div>}
    </div>
    <div className="chat-scroll-indicator" ref={scrollIndicatorRef} aria-hidden="true"/>
    {summaryOpen&&summaryConversation?.summary&&<div className="chat-summary-modal" role="presentation" onClick={()=>setSummaryOpen(false)}>
      <div className="chat-summary-card" role="dialog" aria-modal="true" aria-label="前情提要" onClick={e=>e.stopPropagation()}>
        <header><b>前情提要</b><button type="button" onClick={()=>setSummaryOpen(false)} aria-label="关闭"><IconClose size={15}/></button></header>
        <div className="chat-summary-text">{summaryConversation.summary}</div>
        <small>原文仍完整保留；需要细节时助手可以用 conversation_search 回顾。</small>
      </div>
    </div>}
    {!atBottom&&<IconButton icon={IconArrowDown} label="回到最新消息" title="回到最新" className="chat-jump-bottom" iconSize={16} onClick={pinToLatest}/>}
    {files.length>0&&!selectMode&&<div className="attachment-tray">{files.map((a,i)=><div className="attachment-chip" key={i}>{a.type.startsWith('image/')?<img src={assetUrl(a.preview||a.dataUrl)} alt={a.name}/>:<span className="file-chip-icon"><IconFile size={18}/></span>}<span title={a.name}>{a.name}</span><button type="button" aria-label="移除附件" onClick={()=>removePendingFile(i)}><IconClose size={15}/></button></div>)}</div>}
    {emojiOpen&&<div className="emoji-panel emoji-wechat" aria-label="表情选择"><div className="emoji-body">{emojiTab==='search'&&<><div className="emoji-search-row"><input autoFocus value={emojiQuery} onChange={e=>setEmojiQuery(e.target.value)} placeholder="搜索表情：笑 / 哭 / 心 / 加油…" aria-label="搜索表情"/>{emojiQuery&&<button type="button" onClick={()=>setEmojiQuery('')}>清除</button>}</div>{STICKERS.filter(e=>matchEmoji(e,emojiQuery.trim())).length?<div className="emoji-grid">{STICKERS.filter(e=>matchEmoji(e,emojiQuery.trim())).map((e,i)=><button type="button" key={'s'+i} onClick={()=>pickEmoji(e)}>{e}</button>)}</div>:<p className="emoji-empty">没有找到匹配的表情，换个关键词试试。</p>}</>}{emojiTab==='emoji'&&<>{recentEmojis.length>0&&<div className="emoji-section"><h4>最近使用</h4><div className="emoji-grid">{recentEmojis.map((e,i)=><button type="button" key={'r'+i} onClick={()=>pickEmoji(e)}>{e}</button>)}</div></div>}<div className="emoji-section"><h4>所有表情</h4><div className="emoji-grid">{STICKERS.map((e,i)=><button type="button" key={'a'+i} onClick={()=>pickEmoji(e)}>{e}</button>)}</div></div></>}{emojiTab==='fav'&&<div className="emoji-section"><h4>图片表情包</h4>{imageStickers.length?<div className="emoji-grid sticker-grid">{imageStickers.map((u,i)=><button type="button" key={'k'+i} title="点击发送这张表情包" onClick={()=>sendImageSticker(u)}><img className="sticker-thumb" src={u} alt=""/></button>)}</div>:<p className="emoji-empty">还没有图片表情包，可以上传图片，或粘贴图床直链。</p>}<div className="sticker-actions"><button type="button" onClick={()=>stickerInput.current?.click()}><IconPhoto className="ui-icon-inline" size={14}/> 上传表情包</button><button type="button" disabled={!imageStickers.length} onClick={()=>{void confirmDialog({ title:'清空图片表情包', message:'清空全部图片表情包？', confirmLabel:'清空', danger:true }).then(ok=>{if(ok){setImageStickers([]);localStorage.setItem('ai-home.imageStickers','[]')}})}}>清空图片</button><input ref={stickerInput} className="hidden-file-input" type="file" accept="image/*" multiple onChange={e=>{void addImageStickers(e.target.files)}}/></div><div className="sticker-link-add"><input value={stickerLink} onChange={e=>{setStickerLink(e.target.value);setStickerLinkError('')}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addImageStickerLink()}}} placeholder="粘贴图床直链，如 https://.../cat.png" aria-label="图片表情链接"/><button type="button" disabled={!stickerLink.trim()} onClick={addImageStickerLink}>添加链接</button></div>{stickerLinkError&&<p className="emoji-empty">{stickerLinkError}</p>}<h4>文字表情</h4>{customEmojis.length?<div className="emoji-grid">{customEmojis.map((e,i)=><button type="button" key={'c'+i} title="点击插入" onClick={()=>pickEmoji(e)}>{e}</button>)}</div>:<p className="emoji-empty">还没有文字表情，输入文字或符号后点「添加」。</p>}<div className="custom-emoji-add"><input value={newCustom} maxLength={24} onChange={e=>setNewCustom(e.target.value)} placeholder="输入文字或符号" aria-label="新自定义表情"/><button type="button" disabled={!newCustom.trim()} onClick={()=>{const v=newCustom.trim();if(!v)return;const next=[...customEmojis.filter(x=>x!==v),v].slice(0,40);setCustomEmojis(next);localStorage.setItem('ai-home.customEmojis',JSON.stringify(next));setNewCustom('')}}>添加</button><button type="button" className="custom-emoji-clear" disabled={!customEmojis.length} onClick={()=>{setCustomEmojis([]);localStorage.setItem('ai-home.customEmojis','[]')}}>清空</button></div></div>}</div><div className="emoji-tabs"><button type="button" aria-label="搜索表情" title="搜索表情" className={emojiTab==='search'?'active':''} onClick={()=>setEmojiTab(emojiTab==='search'?'emoji':'search')}><IconSearch size={16}/></button><button type="button" aria-label="表情" title="表情" className={emojiTab==='emoji'?'active':''} onClick={()=>setEmojiTab('emoji')}><IconEmoji size={16}/></button><button type="button" aria-label="自定义表情" title="自定义表情" className={emojiTab==='fav'?'active':''} onClick={()=>setEmojiTab('fav')}><IconStar size={16}/></button></div></div>}
    {pendingForScope&&<div className="pending-card" role="status">
      <div className="pending-card-head">
        <span className="pending-card-badge">待发送</span>
        {pendingForScope.status==='needs_review'&&<span className="pending-card-warn">上次发送失败，可点「发送」重试</span>}
        {pendingForScope.attachments?.length?(<span className="pending-card-meta">· {pendingForScope.attachments.length} 个附件</span>):null}
      </div>
      {pendingEditMode
        ? <div className="pending-card-edit">
            <textarea value={pendingEditText} onChange={e=>setPendingEditText(e.target.value)} rows={3} aria-label="编辑待发送内容" placeholder="待发送内容…"/>
            <div className="pending-card-edit-actions">
              <button type="button" className="ghost" onClick={()=>setPendingEditMode(false)}>取消</button>
              <button type="button" className="primary" disabled={!pendingEditText.trim()} onClick={()=>{if(p.editPendingText(pendingEditText.trim()))setPendingEditMode(false)}}>保存</button>
            </div>
          </div>
        : <div className="pending-card-text" onDoubleClick={()=>{setPendingEditText(pendingForScope.text);setPendingEditMode(true)}} title="双击编辑">{pendingForScope.text||'(空消息)'}</div>}
      <div className="pending-card-actions">
        <button type="button" className="pending-send" disabled={p.sending} title="立即发送这条待发消息" onClick={()=>void p.flushPending(chatPerson,activeChatConversationId,true)}>发送</button>
        {!pendingEditMode&&<button type="button" className="ghost" title="编辑待发送内容" onClick={()=>{setPendingEditText(pendingForScope.text);setPendingEditMode(true)}}>编辑</button>}
        <button type="button" className="ghost danger" title="撤回待发送（不会发送）" onClick={()=>p.cancelPending()}>删除</button>
      </div>
    </div>}
    {/* 图标面板：点输入框底部的图标，在输入区上方展开；不遮罩、不打断聊天。 */}
    {tray&&tray!=='model'&&!selectMode&&<div className="compose-tray" role="dialog" aria-label="聊天工具面板">
      <div className="compose-tray-head"><b>{tray==='bind'?'世界书 / MCP':'工具'}</b><small>{p.displayName(chatPerson)} 的本次绑定</small>{tray==='bind'&&<button type="button" className="compose-tray-config" aria-label="完整绑定设置" title="完整绑定设置" onClick={()=>{setTray('');setBindOpen(true)}}><IconSettings size={15}/></button>}<button type="button" className="compose-tray-close" aria-label="关闭面板" onClick={()=>setTray('')}><IconClose size={15}/></button></div>
      <div className="compose-tray-body">
        {tray==='bind'&&<>
          <div className="tray-section">
            <b className="tray-section-title">MCP</b>
            {quickMcp.error&&<p className="mcp-error">{quickMcp.error}</p>}
            {trayMcp.length===0&&<p className="muted tray-empty">还没有 MCP 服务，到设置里添加。</p>}
            {trayMcp.map(c=><label className="tray-option tray-switch-row" key={c.id}><span><i className="tray-no">{mcpNo(c.id)}</i> {c.name}<small>{c.url}</small></span><input type="checkbox" className="tray-switch" checked={(quickBinding.mcpIds===null?mcpAll:quickBinding.mcpIds).includes(c.id)} onChange={v=>patchBinding(toggleMcpId(quickBinding,c.id,v.target.checked,mcpAll))}/></label>)}
          </div>
          <div className="tray-section">
            <b className="tray-section-title">世界书</b>
            {trayWorld.length===0&&<p className="muted tray-empty">还没有世界书条目。</p>}
            {trayWorld.map(e=><label className="tray-option tray-switch-row" key={e.id}><span><i className="tray-no">{worldNo(e.id)}</i> {e.title||'未命名条目'}<small>{e.enabled?'已启用':'已停用'} · 打开后这位助手的对话里生效</small></span><input type="checkbox" className="tray-switch" checked={isWorldEntryBound(e,chatPerson)} onChange={v=>p.setWorldEntries((old:WorldEntry[])=>toggleWorldEntryBinding(old,chatPerson,e.id,v.target.checked))}/></label>)}
          </div>
        </>}
        {tray==='tools'&&<div className="tray-tool-grid">{CHAT_QUICK_TOOLS.map(t=><button type="button" className="tray-tool-card" key={t.id} onClick={()=>runQuickTool(t.id)}><b>{t.icon} {t.label}</b><small>{t.desc}</small></button>)}</div>}
      </div>
    </div>}
    {selectMode
      ? <div className="multi-select-bar" role="toolbar" aria-label="多选删除操作">
          <span className="ms-count">已选择 <b>{selectedIds.length}</b> 条</span>
          <button type="button" className="ms-cancel" onClick={exitSelect}>取消</button>
          <button type="button" className={'ms-delete'+(armedSelKey===selectKey&&selectedIds.length?' armed':'')} disabled={!selectedIds.length} title={armedSelKey===selectKey&&selectedIds.length?'再点一次确认删除':'删除选中的消息'} onClick={batchDelete}>{armedSelKey===selectKey&&selectedIds.length?`确认删除 ${selectedIds.length} 条`:'删除'}</button>
        </div>
      : <form className="compose compose-box compose-wechat" ref={formRef} onSubmit={submit}>
      <div className="compose-editor">
        <textarea ref={composeTextRef} className="cw-input" rows={5} value={p.draft} onChange={e=>p.setDraft(e.target.value)} placeholder="请输入您的问题…" aria-label="聊天消息" onFocus={()=>{pinToLatest();for(const ms of [80,180,320,480])window.setTimeout(pinToLatest,ms)}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!(e.nativeEvent as any).isComposing){e.preventDefault();formRef.current?.requestSubmit()}}}/>
      </div>
      <div className="cw-row">
        <button type="button" className="compose-model-select" onClick={()=>{setPlusOpen(false);setEmojiOpen(false);openTray('model')}} aria-label="选择模型"><IconSparkles className="ui-icon-inline" size={14}/> {(()=>{const fixedId=fixedRouteId(p.routeState,chatPerson);const route=p.routeState.routes.find((r:any)=>r.id===fixedId);if(route){const vendor=p.vendors?.find((v:Vendor)=>v.id===route.vendorId);return `${vendor?.name||route.label||'独立线路'} · ${route.model}`}const profile=p.modelProfiles?.find((m:ModelProfile)=>m.id===quickBinding.modelProfileId)||p.modelProfiles?.find((m:ModelProfile)=>m.id===p.defaultModelId);if(!profile)return '选择模型';const vendor=p.vendors?.find((v:Vendor)=>v.id===profile.vendorId);return `${vendor?.name||profile.vendor||'未命名来源'} · ${profile.name||profile.model}`})()} <span><IconChevronDown size={13}/></span></button>
        <button type="button" className={'cw-circle'+(emojiOpen?' active':'')} aria-label="表情包" onClick={()=>{setTray('');setAttachOpen(false);setPlusOpen(false);setEmojiTab('emoji');setEmojiOpen(v=>!v)}}><IconEmoji size={17}/></button>
        <button type="button" className={'cw-circle'+(plusOpen?' active':'')} aria-label="更多" aria-expanded={plusOpen} onClick={()=>{setEmojiOpen(false);setTray('');setAttachOpen(false);setPlusOpen(v=>!v)}}><IconPlus size={17}/></button>
        <IconButton icon={IconMic} label="语音输入" className="cw-circle" iconSize={17} onClick={()=>showToolHint('语音输入待接入')}/>
        {p.sending&&!p.draft.trim()&&!files.length?<IconButton icon={IconStop} label="停止生成" className="cw-circle send stop" iconSize={16} onClick={()=>p.stopGeneration()}/>:<IconButton icon={IconSend} label="发送" type="submit" className="cw-circle send" iconSize={17} disabled={!p.draft.trim()&&!files.length}/>} 
      </div>
      {toolHint&&<div className="compose-tool-hint" role="status">{toolHint}</div>}
      {plusOpen&&<div className="compose-plus-panel" role="dialog" aria-label="更多功能">
        <div className="cp-grid">
          <button type="button" className="cp-item" onClick={()=>{setPlusOpen(false);cameraInput.current?.click()}}><span className="cp-ico"><IconPhoto size={18}/></span><small>拍照</small></button>
          <button type="button" className="cp-item" onClick={()=>{setPlusOpen(false);openTray('bind')}}><span className="cp-ico"><IconBook size={18}/></span><small>世界书</small></button>
          <button type="button" className="cp-item" onClick={()=>{setPlusOpen(false);openTray('bind')}}><span className="cp-ico"><IconPlug size={18}/></span><small>MCP</small></button>
          <button type="button" className="cp-item" onClick={()=>{setPlusOpen(false);setAttachOpen(true)}}><span className="cp-ico"><IconFile size={18}/></span><small>文件</small></button>
          <button type="button" className="cp-item" onClick={()=>{setPlusOpen(false);openTray('tools')}}><span className="cp-ico"><IconSettings size={18}/></span><small>工具</small></button>
          <button type="button" className="cp-item" onClick={()=>{setPlusOpen(false);if(searchOpen)closeSearch();else setSearchOpen(true)}}><span className="cp-ico"><IconSearch size={18}/></span><small>查找聊天记录</small></button>
          <button type="button" className="cp-item" onClick={()=>{setPlusOpen(false);setStatsOpen(true)}}><span className="cp-ico"><IconClock size={18}/></span><small>最近的请求</small></button>
        </div>
        <div className="cp-dots"><i className="on"/><i/></div>
      </div>}
      {statsOpen&&<div className="request-stats-modal" role="presentation" onClick={()=>setStatsOpen(false)}>
        <div className="request-stats-card" role="dialog" aria-modal="true" aria-label="最近的请求" onClick={e=>e.stopPropagation()}>
          <header><b>最近的请求</b><button type="button" onClick={()=>setStatsOpen(false)} aria-label="关闭"><IconClose size={15}/></button></header>
          <RequestStats messages={currentMessages}/>
        </div>
      </div>}
      <input ref={cameraInput} className="hidden-file-input" type="file" accept="image/*" capture="environment" onChange={e=>loadFiles(e.target.files,true)}/>
      {attachOpen&&<div className="compose-attach-menu" role="menu" aria-label="附件类型">
        <button type="button" role="menuitem" onClick={()=>pickAttachment('image')}>图片</button>
        <button type="button" role="menuitem" onClick={()=>pickAttachment('file')}>文件</button>
      </div>}
      <input ref={imageInput} className="hidden-file-input" type="file" accept="image/*" multiple onChange={e=>loadFiles(e.target.files,true)}/>
      <input ref={fileInput} className="hidden-file-input" type="file" multiple onChange={e=>loadFiles(e.target.files)}/>
    </form>}
    {lightbox&&<div className="image-lightbox" role="dialog" aria-modal="true" aria-label={lightbox.name} onClick={()=>setLightbox(null)}><button type="button" className="lightbox-close" aria-label="关闭图片预览" onClick={()=>setLightbox(null)}><IconClose size={15}/></button><img src={assetUrl(lightbox.src)} alt={lightbox.name} onClick={e=>e.stopPropagation()}/><div>{lightbox.name}</div></div>}
    {tray==='model'&&!selectMode&&<ModelPickerSheet profiles={p.modelProfiles||[]} activeId={quickBinding.modelProfileId} vendorKeys={vendorKeyOptions} binding={quickBinding} onPatchBinding={patchBinding} onPick={id=>{patchBinding({...quickBinding,modelProfileId:id});setTray('')}} onClose={closeModelSheet} subscriptionVendorIds={(p.vendors||[]).filter((v:Vendor)=>v.subscription).map((v:Vendor)=>v.id)} vendors={p.vendors||[]} routeState={p.routeState} setRouteState={p.setRouteState} lastRouteInfo={p.lastRouteInfo||''} person={chatPerson}/>}
    {bindOpen&&<ChatBindPanel person={chatPerson} displayName={p.displayName} worldEntries={p.worldEntries} setWorldEntries={p.setWorldEntries} bindings={p.bindings} setBindings={p.setBindings} onClose={()=>setBindOpen(false)}/>}
  </div>
}
function formatSize(size:number){return size<1024?size+' B':size<1024*1024?(size/1024).toFixed(1)+' KB':(size/1024/1024).toFixed(1)+' MB'}

function Fun({shortcut,onShortcutUsed,displayName}:{shortcut:string;onShortcutUsed:()=>void;displayName:(p:Person)=>string}) {
  const [active,setActive]=useState('')
  useEffect(()=>{if(shortcut){setActive(shortcut);onShortcutUsed()}},[shortcut,onShortcutUsed])
  const [draft,setDraft]=useState('')
  const [messages,setMessages]=useState<{id:string;author:string;content:string;at:string}[]>(()=>read('ai-home.loungeMessages',[]))
  useEffect(()=>{localStorage.setItem('ai-home.loungeMessages',JSON.stringify(messages))},[messages])
  const rooms:Array<{name:string;key:string;icon:IconComponent;desc:string}>=[{name:'公共客厅',key:'客厅',icon:IconCoffee,desc:'一起聊天、分享日常'},{name:'内嵌浏览器',key:'内嵌浏览器',icon:IconSearch,desc:'在小家里浏览网页'},{name:'可视化网页',key:'可视化网页',icon:IconGrid,desc:'查看互动网页与小工具'},{name:'相册',key:'相册',icon:IconPhoto,desc:'收藏图片与共同回忆'},{name:'播放器',key:'播放器',icon:IconMusic,desc:'音乐、音频与播放列表'},{name:'记账单',key:'记账单',icon:IconLedger,desc:'记录真实人民币收支'},{name:'日记本',key:'日记本',icon:IconBook,desc:'写下公开或上锁的日记'},{name:'更多工具',key:'待定',icon:IconPlus,desc:'以后继续扩展新模块'}]
  function post(e:FormEvent){e.preventDefault();if(!draft.trim())return;setMessages(old=>[...old,{id:crypto.randomUUID(),author:'顾',content:draft.trim(),at:new Date().toISOString()}]);setDraft('')}
  const selected=rooms.find(x=>x.key===active)
  return <div className="fun-screen"><header className="fun-heading"><div><span className="fun-eyebrow">OUR SHARED SPACE</span><h2>娱乐房</h2><p>把想用的功能做成独立小模块，点开就能进入。</p></div></header>{!active?<div className="fun-module-grid">{rooms.map((room,i)=>{const RoomIcon=room.icon;return <button type="button" className="fun-module-card" key={room.key} onClick={()=>setActive(room.key)}><span className={'fun-module-icon module-icon-'+i}><RoomIcon size={20}/></span><b>{room.name}</b><small>{room.desc}</small><span className="fun-module-arrow">进入 <IconShare size={13}/></span></button>})}</div>:<section className="fun-module-detail"><button className="fun-back" onClick={()=>setActive('')}><IconBack className="ui-icon-inline" size={14}/> 全部模块</button>{active==='记账单'?<Ledger/>:active==='日记本'?<Diary personLabel={displayName}/>:active==='客厅'?<section className="lounge-panel"><h3>公共客厅</h3><p className="muted">这里是大家一起讨论的地方。当前先搭好共享留言结构；AI 自动参与、实时推送与跨设备同步待后续接入。</p><div className="lounge-messages">{messages.length?messages.map(m=><article key={m.id}><b>{m.author}</b><small>{new Date(m.at).toLocaleString('zh-CN')}</small><p>{m.content}</p></article>):<p className="muted">客厅还很安静，留下一条消息试试。</p>}</div><form onSubmit={post} className="lounge-compose"><textarea rows={2} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="给客厅留句话……"/><button disabled={!draft.trim()}>发送留言</button></form></section>:<section className="lounge-panel"><h3>{selected?.name||active}</h3><p className="muted">{selected?.desc}</p><div className="module-placeholder"><span>{selected?(()=>{const I=selected.icon;return <I size={22}/>})():<IconPlus size={22}/>}</span><b>{selected?.name||active}工作区</b><small>模块入口已建立 · 实际功能待接入</small></div></section>}</section>}</div>
}
function Settings({onBack,onLogout,packIcons,cloudStatus,themePrefs,setThemePrefs,customAssets,conversations,modelConfig,onOpenTool,displayName,personAppearance,setPersonAppearance,timeZone,setTimeZone,worldEntries,setWorldEntries,modelProfiles,setModelProfiles,bindings,setBindings,vendors,setVendors,subscriptions,setSubscriptions,systemPeople,avatarOf,onApiBaseApplied,workspaceConfigs,onWorkspaceSaved,defaultModelId,setDefaultModelId}:{onBack:()=>void;onLogout:()=>void;packIcons?:Record<string,string>;cloudStatus:string;themePrefs:ThemePrefs;setThemePrefs:(v:ThemePrefs)=>void;customAssets:CustomAssets;conversations:Record<Person,Conversation[]>;modelConfig:Record<Person,ModelConfig>;onOpenTool:(v:{person:Person;tool:Tool})=>void;displayName:(p:Person)=>string;personAppearance:Record<string,PersonAppearancePref>;setPersonAppearance:React.Dispatch<React.SetStateAction<Record<string,PersonAppearancePref>>>;timeZone:string;setTimeZone:(v:string)=>void;worldEntries:WorldEntry[];setWorldEntries:React.Dispatch<React.SetStateAction<WorldEntry[]>>;modelProfiles:ModelProfile[];setModelProfiles:React.Dispatch<React.SetStateAction<ModelProfile[]>>;bindings:Record<Person,PersonBinding>;setBindings:React.Dispatch<React.SetStateAction<Record<Person,PersonBinding>>>;vendors:Vendor[];setVendors:React.Dispatch<React.SetStateAction<Vendor[]>>;subscriptions:SubscriptionAccount[];setSubscriptions:React.Dispatch<React.SetStateAction<SubscriptionAccount[]>>;systemPeople?:string[];avatarOf?:(p:string)=>string;onApiBaseApplied?:()=>void;workspaceConfigs:Record<string,WorkspaceConfig>;onWorkspaceSaved:(config:WorkspaceConfig)=>void;defaultModelId:string;setDefaultModelId:(v:string)=>void}) {
  void workspaceConfigs
  void packIcons
  const [section,setSection]=useState(()=>{
    try {
      const restored=sessionStorage.getItem('ai-home.afterRestoreSection')
      if(restored){
        sessionStorage.removeItem('ai-home.afterRestoreSection')
        return restored
      }
    } catch { /* ignore */ }
    return ''
  })
  // 二/三级页统一从顶部开始。旧版按 section 恢复 window.scrollY，会让不同层级看起来一页高一页低。
  const openSection=(next:string)=>{
    setSection(next)
    requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'auto'}))
  }
  useEffect(()=>{window.scrollTo({top:0,left:0,behavior:'auto'})},[section])
  // Android 返回键：二级页先退回一级，一级页再退回设置首页。
  useEffect(()=>{
    // 供应商详情 / 手动新增是列表下的二级页：先回「供应商列表」，其余仍回设置首页。
    const unregister=pushBackHandler(()=>{if(section.startsWith('vendor:keys:')){setSection('vendor:'+section.slice('vendor:keys:'.length));return true}if(section.startsWith('vendor:')){setSection('vendor');return true}if(section){setSection('');return true}onBack();return true})
    return unregister
  },[section,onBack])
  // 输入框是「编辑缓冲」：null 表示未在编辑，直接显示当前生效时区；
  // 云端快照回填 timeZone 后无需任何同步逻辑，派生值自动跟随。
  const [tzDraft,setTzDraft]=useState<string|null>(null)
  const tzInput=tzDraft??timeZone
  // 时区预览用的秒级时钟：只用于刷新展示，不发网络请求。
  const [timeTick,setTimeTick]=useState(()=>Date.now())
  useEffect(()=>{const t=window.setInterval(()=>setTimeTick(Date.now()),30000);return()=>window.clearInterval(t)},[])
  // 时区预览：只读展示当前时区此刻的日期/星期/时间/时段。
  const tzPreview=buildTimeContext(new Date(timeTick),timeZone)
  const tzError=(()=>{const raw=tzInput.trim();if(!raw)return '';try{new Intl.DateTimeFormat('en-US',{timeZone:raw});return ''}catch{return '无法识别的时区名称，请输入 IANA 时区（如 Asia/Shanghai）'}})()
  // 资源库按一级入口直达单 tab：世界书 / MCP / 添加供应商各自只显示自己那一块，
  // 旧链接 resources:xxx 仍兼容（显示完整三 tab 的资源库）。
  const SETTINGS_GROUPS:Record<string,{title:string;tabs:Array<[string,string]>}>={
    theme:{title:'主题',tabs:[['theme','主题'],['chatdisplay','聊天展示']]},
    usage:{title:'模型用量',tabs:[['usage','用量统计']]},
    extensions:{title:'智能扩展',tabs:[['world','世界书'],['mcp','MCP'],['skill','技能']]},
    workspace:{title:'工作区',tabs:[['workspace','助手工具'],['files','本机文件']]},
    system:{title:'系统与权限',tabs:[['system','权限'],['applock','应用锁'],['data','数据']]},
    about:{title:'关于栖间',tabs:[['about','关于'],['guide','说明']]},
  }
  const activeGroup=Object.values(SETTINGS_GROUPS).find(g=>g.tabs.some(([id])=>id===section))||null
const resourceTab=(section.startsWith('resources:')?section.slice('resources:'.length):section==='world'?'world':section==='mcp'?'mcp':'') as ''|'model'|'world'|'mcp'
  const resourceOnly=['world','mcp'].includes(section)
  const showResources=section==='resources'||!!resourceTab
  const cardIcons:Record<string,IconComponent>={theme:IconPalette,vendor:IconPlug,usage:IconChart,extensions:IconSparkles,workspace:IconFolder,system:IconShield,about:IconInfo}
  const cards=[
    {id:'theme',title:'主题',section:'theme'},
    {id:'vendor',title:'供应商',section:'vendor'},
    {id:'usage',title:'模型用量',section:'usage'},
    {id:'extensions',title:'智能扩展',section:'world'},
    {id:'workspace',title:'工作区',section:'workspace'},
    {id:'system',title:'系统与权限',section:'system'},
    {id:'about',title:'关于栖间',section:'about'},
  ]
  const vendorSectionId=section.startsWith('vendor:keys:')?section.slice('vendor:keys:'.length):(section.startsWith('vendor:')&&!['vendor:add','vendor:default','vendor:catalog','vendor:account'].includes(section)?section.slice('vendor:'.length):'')
  const vendorName=vendorSectionId?vendors.find(v=>v.id===vendorSectionId)?.name:''
  const sectionTitle=!section?'栖间 · 设置'
    :section==='vendor'?'供应商'
    :section==='vendor:add'?'添加供应商'
    :section==='vendor:default'?'默认模型'
    :section==='vendor:catalog'?'模型目录'
    :section==='vendor:account'?'订阅账号'
    :section.startsWith('vendor:keys:')?'多 Key 管理'
    :vendorName||activeGroup?.title||cards.find(c=>c.section===section)?.title||'设置'
  const settingsBack=()=>{
    if(!section){onBack();return}
    if(section.startsWith('vendor:keys:')){openSection('vendor:'+section.slice('vendor:keys:'.length));return}
    if(section.startsWith('vendor:')){openSection('vendor');return}
    openSection('')
  }
  const settingsBackLabel=!section?'主页':section.startsWith('vendor:')?'供应商':'全部设置'
  return <div className="settings-screen"><header className="settings-page-header"><button type="button" className="settings-page-back" onClick={settingsBack}><IconBack className="ui-icon-inline" size={15}/><span>{settingsBackLabel}</span></button><h2>{sectionTitle}</h2><span className="settings-page-head-spacer" aria-hidden="true"/></header>{!section?<div className="settings-groups settings-flat-list"><div className="settings-row-list">{cards.map(card=><SettingsRow key={card.id} icon={cardIcons[card.id]||IconInfo} title={card.title} onClick={()=>openSection(card.section)}/>)}</div></div>:<div className="settings-detail">{activeGroup&&<SettingsTabBar title={activeGroup.title} items={activeGroup.tabs} value={section} onChange={openSection}/>}{section==='guide'&&<SettingsGuidePage/>}{section==='skill'&&<SettingsSkillPage people={ASSISTANT_PEOPLE} displayName={displayName}/>}{section==='memory'&&<SettingsMemoryPage people={ASSISTANT_PEOPLE} displayName={displayName} onOpenTool={onOpenTool}/>}{section==='system'&&<AndroidSystemSettings people={systemPeople||[]} displayName={displayName} avatarOf={avatarOf||(()=>'')}/>}{(section==='theme'||section.startsWith('theme:'))&&<SettingsSubNav section={section} onSelect={setSection}/>}{section==='bind'&&<><ResourceLibrary key="bind-library" initialTab="world" tabs={['world','mcp']} worldEntries={worldEntries} setWorldEntries={setWorldEntries} modelProfiles={modelProfiles} setModelProfiles={setModelProfiles} bindings={bindings} setBindings={setBindings} displayName={displayName}/></>}{section.startsWith('vendor')&&section!=='vendor:account'&&<VendorCenter section={section} onSection={setSection} vendors={vendors} setVendors={setVendors} setModelProfiles={setModelProfiles} modelProfiles={modelProfiles} defaultModelId={defaultModelId} setDefaultModelId={setDefaultModelId}/>}{showResources&&<ResourceLibrary key={resourceTab||'resources'} initialTab={resourceTab||undefined} only={resourceOnly?(resourceTab||undefined):undefined} worldEntries={worldEntries} setWorldEntries={setWorldEntries} modelProfiles={modelProfiles} setModelProfiles={setModelProfiles} bindings={bindings} setBindings={setBindings} displayName={displayName} />}{(section==='theme'||section==='theme:global')&&<div className="theme-page"><ThemeSettings value={themePrefs} onChange={setThemePrefs}/></div>}{section==='theme:person'&&<AssistantThemeSettings personAppearance={personAppearance} setPersonAppearance={setPersonAppearance} assets={customAssets} displayName={displayName}/>}{section==='vendor:account'&&<SubscriptionAccounts vendors={vendors} setVendors={setVendors} setModelProfiles={setModelProfiles} subscriptions={subscriptions} setSubscriptions={setSubscriptions}/>}{section==='usage'&&<div className="setting-card settings-inner-card"><b>AI 用量统计</b><UsageStats people={ASSISTANT_PEOPLE} conversations={conversations} models={Object.fromEntries(ASSISTANT_PEOPLE.map(p=>[p,(modelConfig[p]&&modelConfig[p].model)||((modelProfiles.find(x=>x.id===(bindings[p]&&bindings[p].modelProfileId))||{}).name)||'']))} displayName={displayName}/></div>}{section==='workspace'&&<div className="setting-card settings-inner-card"><b>工作区工具</b><p className="muted">按助手直接打开主动任务、自主生活、工具看板与技能库。</p><div className="settings-shortcuts">{ASSISTANT_PEOPLE.map(person=><div className="settings-shortcut-group" key={person}><b>{displayName(person)}</b><div><button type="button" onClick={()=>onOpenTool({person,tool:'工作流'})}>主动任务</button><button type="button" onClick={()=>onOpenTool({person,tool:'自主生活'})}>自主生活</button><button type="button" onClick={()=>onOpenTool({person,tool:'工具调用看板'})}>调用看板</button><button type="button" onClick={()=>onOpenTool({person,tool:'记忆面板'})}>记忆面板</button><button type="button" onClick={()=>onOpenTool({person,tool:'SKILL 技能库'})}>技能库</button></div></div>)}</div></div>}{section==='applock'&&<AppLockSettings/>}{section==='files'&&<div className="setting-card settings-inner-card"><WorkspaceSettings people={ASSISTANT_PEOPLE} displayName={displayName} onSaved={onWorkspaceSaved}/></div>}{section==='chatdisplay'&&<ChatDisplaySettings/>}{section==='data'&&<div className="settings-data-rows">
<div className="setting-card settings-inner-card"><b>备份与恢复</b><BackupCenter people={systemPeople||[]} vendors={vendors} setVendors={setVendors} setModelProfiles={setModelProfiles}/></div>
<div className="setting-card settings-inner-card"><b>{isLocalMode()?'本地数据':'云端数据'}</b><p>{isLocalMode()?(cloudStatus==='error'?'最近一次保存失败：浏览器存储空间可能不足，请清理旧聊天或附件后重试。':'所有聊天、人物与设置都保存在这台设备的浏览器存储里，不上传任何服务器。修改后稍等片刻会自动保存。'):cloudStatus==='error'?'最近一次保存失败，请检查连接后重试。':cloudStatus==='saving'?'正在保存最新更改…':'已启用自动保存。修改后请稍等片刻，数据会自动同步。'}</p></div>
<div className="setting-card settings-inner-card"><b>时区（动态时间上下文）</b><p className="muted">助手感知到的日期、星期、时间与时段按此时区在服务端实时生成；默认 Asia/Shanghai（UTC+8）。只保存配置，不会获取你的位置或天气。</p><input className="memory-search" list="time-zone-options" value={tzInput} placeholder="如 Asia/Shanghai" aria-label="IANA 时区" onChange={e=>setTzDraft(e.target.value)} onBlur={()=>{if(!tzError&&tzInput.trim()){const tz=normalizeTimeZone(tzInput.trim());setTimeZone(tz);setTzDraft(null)}}}/><datalist id="time-zone-options">{['Asia/Shanghai','Asia/Hong_Kong','Asia/Taipei','Asia/Tokyo','Asia/Seoul','Asia/Singapore','Europe/London','Europe/Paris','America/New_York','America/Los_Angeles','UTC'].map(z=><option key={z} value={z}/>)}</datalist>{tzError?<p className="chat-error" style={{marginTop:8}}>{tzError}</p>:<p className="muted" style={{marginTop:8}}>当前生效：{timeZone} · 预览 {tzPreview.date} {tzPreview.weekday} {tzPreview.time}（{tzPreview.partOfDay}，{tzPreview.utcOffset}）</p>}</div>

{!isLocalMode()&&<button className="settings-logout" onClick={onLogout}>退出登录</button>}
</div>}{section==='about'&&<><AppUpdateCard/><div className="setting-card settings-inner-card"><b>关于 栖间</b><BrandAbout/></div><details className="data-fold"><summary>云同步服务器 / 调试</summary><ApiBaseSettings onApplied={onApiBaseApplied}/></details></>}</div>}</div>
}

// 二级设置：两个分组名横排成小标签，点一个只显示那一个内容，不再铺两行大卡片。
function SettingsTabBar({title,items,value,onChange}:{title:string;items:Array<[string,string]>;value:string;onChange:(id:string)=>void}) {
  return <div className="settings-tabs"><b className="settings-tabs-title">{title}</b><div className="settings-tabs-row" role="tablist">{items.map(([id,label])=><button type="button" role="tab" key={id} aria-selected={value===id} className={'settings-tab'+(value===id?' active':'')} onClick={()=>onChange(id)}>{label}</button>)}</div></div>
}

function AppUpdateCard() {
  const [url, setUrl] = useState(() => { try { return localStorage.getItem('ai-home.updateUrl') || '' } catch { return '' } })
  const [msg, setMsg] = useState('')
  const [auto, setAuto] = useState(() => { try { return localStorage.getItem('ai-home.autoUpdate') !== '0' } catch { return true } })
  const save = () => { try { localStorage.setItem('ai-home.updateUrl', url.trim()) } catch {} setMsg('更新地址已保存') }
  const check = () => {
    const bridge = (window as any).AiHomeSystem
    if (!bridge || typeof bridge.checkAppUpdate !== 'function') { setMsg('仅 Android App 内支持检查更新'); return }
    const target = url.trim()
    if (!/^https?:\/\//i.test(target)) { setMsg('请先填写 http(s) 的更新清单地址'); return }
    try { localStorage.setItem('ai-home.updateUrl', target) } catch {}
    bridge.checkAppUpdate(target)
    setMsg('已发起 APK 检查，发现新版本会弹窗提示下载安装')
  }
  const checkWeb = async () => {
    const target = url.trim()
    if (!/^https?:\/\//i.test(target)) { setMsg('请先填写 http(s) 的更新清单地址'); return }
    try {
      setMsg('正在检查界面更新…')
      const res = await fetch(target, { cache: 'no-store', credentials: 'omit' })
      const data = await res.json()
      const version = String(data.webVersion || '')
      const bundleUrl = String(data.webUrl || '')
      if (!version || !bundleUrl) { setMsg('清单缺少 webVersion / webUrl'); return }
      const cur = await currentBundle()
      if (cur?.bundle?.version && compareVersions(version, cur.bundle.version) <= 0) { setMsg('界面已是最新：' + cur.bundle.version); return }
      if (!window.confirm('发现新界面 ' + version + '，下载后立即生效，继续？')) { setMsg('已取消'); return }
      setMsg('正在下载界面包…')
      await applyWebUpdate(bundleUrl, version, String(data.webChecksum || '') || undefined)
    } catch (e: any) {
      setMsg('界面更新失败：' + (e?.message || String(e)))
    }
  }
  const resetWeb = async () => {
    if (!window.confirm('恢复到 App 内置界面？')) return
    try { await resetToBuiltin(); setMsg('已恢复内置界面，正在重载…') } catch (e: any) { setMsg('恢复失败：' + (e?.message || e)) }
  }
  return <div className="setting-card settings-inner-card">
    <b>应用更新</b>
    <p className="muted">清单 JSON：versionCode / versionName / apkUrl / notes，以及可选的 webVersion / webUrl。「检查 APK 更新」走系统安装；「检查界面更新」走 Live Update，只替换网页资源、立即生效，不用装 APK。</p>
    <input className="memory-search" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://your-server/qijian/latest.json" aria-label="更新清单地址"/>
    <label className="update-auto"><input type="checkbox" checked={auto} onChange={e => { setAuto(e.target.checked); try { localStorage.setItem('ai-home.autoUpdate', e.target.checked ? '1' : '0') } catch {} }}/> 启动时自动检查界面更新</label>
    <div className="settings-shortcuts">
      <div className="settings-shortcut-group"><div>
        <button type="button" onClick={save}>保存地址</button>
        <button type="button" onClick={check}>检查 APK 更新</button>
        <button type="button" onClick={() => void checkWeb()}>检查界面更新</button>
        <button type="button" onClick={() => void resetWeb()}>恢复内置界面</button>
      </div></div>
    </div>
    {msg && <p className="muted">{msg}</p>}
  </div>
}

function SettingsGuidePage() {
  const blocks: React.ReactNode[] = []
  let code: string[] | null = null
  const inline = (text: string) => text.split(/\*\*(.+?)\*\*/g).map((part, idx) => idx % 2 ? <b key={idx}>{part}</b> : <span key={idx}>{part}</span>)
  GUIDE_MARKDOWN.split('\n').forEach((line, i) => {
    if (line.startsWith('```')) {
      if (code) { blocks.push(<pre key={i} className="guide-code">{code.join('\n')}</pre>); code = null }
      else code = []
      return
    }
    if (code) { code.push(line); return }
    if (line.startsWith('# ')) return
    if (line.startsWith('## ')) { blocks.push(<h3 key={i} className="guide-h">{inline(line.slice(3))}</h3>); return }
    if (line.startsWith('### ')) { blocks.push(<h4 key={i} className="guide-h4">{inline(line.slice(4))}</h4>); return }
    if (!line.trim()) return
    if (/^[-*] /.test(line)) { blocks.push(<p key={i} className="guide-p guide-li">• {inline(line.slice(2))}</p>); return }
    blocks.push(<p key={i} className="guide-p">{inline(line)}</p>)
  })
  return <div className="setting-card settings-inner-card guide-page"><b>栖间使用说明</b><p className="muted">这份说明同时挂在 window.AiHomeGuide，助手可以读取。</p>{blocks}</div>
}

function SettingsSkillPage({people,displayName}:{people:string[];displayName:(p:string)=>string}) {
  const [person,setPerson]=useState(people[0]||'')
  return <div><div className="settings-tabs"><b className="settings-tabs-title">选择助手</b><div className="settings-tabs-row">{people.map(p=><button type="button" key={p} className={'settings-tab'+(p===person?' active':'')} onClick={()=>setPerson(p)}>{displayName(p)}</button>)}</div></div><SkillWorkbench key={person} person={person} personLabel={displayName}/></div>
}

function SettingsMemoryPage({people,displayName,onOpenTool}:{people:string[];displayName:(p:string)=>string;onOpenTool:(v:{person:string;tool:Tool})=>void}) {
  return <div className="setting-card settings-inner-card"><b>记忆</b><p className="muted">记忆面板按助手分开；点下面的助手直接打开。</p><div className="settings-shortcuts">{people.map(p=><div className="settings-shortcut-group" key={p}><b>{displayName(p)}</b><div><button type="button" onClick={()=>onOpenTool({person:p,tool:'记忆面板'})}>打开记忆面板</button></div></div>)}</div></div>
}

function SettingsSubNav({section,onSelect}:{section:string;onSelect:(s:string)=>void}) {
  const isTheme=section==='theme'||section.startsWith('theme:')
  const rows=isTheme
    ? [{id:'theme:global',label:'全局主题'},{id:'theme:person',label:'助手主题'}]
    : [{id:'vendor',label:'供应商列表'},{id:'vendor:default',label:'默认模型'},{id:'vendor:account',label:'订阅账号'}]
  const active=(section.startsWith('theme:')||section.startsWith('vendor:'))?section:rows[0].id
  return <div className="settings-subnav settings-tabs" role="tablist" aria-label={isTheme?'主题美化分组':'供应商分组'}>
    {rows.map(r=><button type="button" role="tab" aria-selected={active===r.id} className={'subnav-row'+(active===r.id?' active':'')} key={r.id} onClick={()=>onSelect(r.id)}><b>{r.label}</b></button>)}
  </div>
}

// 助手主题：原来工作区的「角色外观」收到设置页，按助手切换，数据不动。
function AssistantThemeSettings({personAppearance,setPersonAppearance,assets,displayName}:{
  personAppearance:Record<string,PersonAppearancePref>; setPersonAppearance:React.Dispatch<React.SetStateAction<Record<string,PersonAppearancePref>>>
  assets:CustomAssets; displayName:(p:Person)=>string
}) {
  const [person,setPerson]=useState<Person>(YWX)
  return <div className="theme-page assistant-theme">
    <b>助手主题</b>
    <p className="muted">只影响所选助手的聊天气泡、背景与头像；整个小家的配色在「全局主题」。</p>
    <label className="connection-person">助手<SoftSelect ariaLabel="选择要设置主题的助手" value={person} onChange={v=>setPerson(v as Person)} options={ASSISTANT_PEOPLE.map(id=>({value:id,label:displayName(id)}))}/></label>
    <PersonAppearance key={person} value={personAppearance[person]||null} assets={assets} onChange={v=>setPersonAppearance(old=>{const next={...old};if(v)next[person]=v;else delete next[person];return next})}/>
  </div>
}

// ── 资源库：设置区一次性添加模型 / 世界书 / MCP，聊天窗口按助手选用 ──────────
type McpLibraryItem = { id: string; person: Person; name: string; url: string; transport: string; enabled: boolean }

// MCP 的服务端按 person 做隔离（安全边界），所以这里逐个助手拉取后合并成一张总表；
// 添加时可选「全部助手」，一次提交就为每位助手各建一条，不用再切换工作区反复填。
function useMcpLibrary() {
  const [connections, setConnections] = useState<McpLibraryItem[]>([])
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    const all: McpLibraryItem[] = []
    for (const p of ASSISTANT_PEOPLE) {
      try {
        const r = await apiFetch('/api/mcp?person=' + encodeURIComponent(p), { credentials: 'include' })
        if (!r.ok) continue
        const d = await r.json()
        for (const c of (d.connections || [])) all.push({ ...c, person: p })
      } catch { /* 单个助手读取失败不影响其他助手 */ }
    }
    setConnections(all)
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  return { connections, error, setError, refresh }
}

const EMPTY_PROFILE = { id: '', name: '', endpoint: '', model: '', inputPrice: '', outputPrice: '', cachedInputPrice: '', usdToCny: '7.2' }

function groupModelsByName(ids: string[]): { id: string; label: string; models: string[] }[] {
  const FAMILY_ORDER = ['claude','gpt','grok','gemini','deepseek','qwen','kimi','glm','llama','mistral','doubao','yi','cohere','other'] as const
  const FAMILY_LABEL: Record<string,string> = {
    claude:'Claude', gpt:'GPT / OpenAI', grok:'Grok', gemini:'Gemini', deepseek:'DeepSeek',
    qwen:'Qwen', kimi:'Kimi', glm:'GLM', llama:'Llama / Meta', mistral:'Mistral',
    doubao:'Doubao', yi:'Yi', cohere:'Cohere', other:'其他',
  }
  const familyOf=(value:string)=>{
    const s=String(value||'').trim().toLowerCase()
    if(/claude|sonnet|opus|haiku|anthropic/.test(s)) return 'claude'
    if(/(?:^|[/._-])(gpt|chatgpt|o[1-9]|openai)(?:$|[/._-])|gpt-|chatgpt-|openai/.test(s)) return 'gpt'
    if(/grok|xai|x-ai/.test(s)) return 'grok'
    if(/gemini|gemma/.test(s)) return 'gemini'
    if(/deepseek/.test(s)) return 'deepseek'
    if(/qwen|qwq/.test(s)) return 'qwen'
    if(/kimi|moonshot/.test(s)) return 'kimi'
    if(/glm|zhipu|chatglm/.test(s)) return 'glm'
    if(/llama|meta-llama/.test(s)) return 'llama'
    if(/mistral|mixtral/.test(s)) return 'mistral'
    if(/doubao|豆包/.test(s)) return 'doubao'
    if(/(?:^|[/._-])yi(?:$|[/._-])|01-ai/.test(s)) return 'yi'
    if(/command-r|cohere/.test(s)) return 'cohere'
    return 'other'
  }
  const map = new Map<string,string[]>()
  for(const id of ids){
    const key=familyOf(id)
    const list=map.get(key)||[]
    list.push(id)
    map.set(key,list)
  }
  return FAMILY_ORDER
    .filter(key=>map.has(key))
    .map(key=>({id:'family-'+key,label:FAMILY_LABEL[key],models:(map.get(key)||[]).sort((x,y)=>x.localeCompare(y))}))
}

function brandOf(modelId:string):{icon:IconComponent;cls:string}{
  const s=modelId.toLowerCase()
  if(/gpt|openai|(?:^|[^a-z0-9])o[1-9]/.test(s)) return {icon:IconChat,cls:'brand-gpt'}
  if(/claude|sonnet|opus|haiku/.test(s)) return {icon:IconSparkles,cls:'brand-claude'}
  if(/gemini|gemma/.test(s)) return {icon:IconStar,cls:'brand-gemini'}
  if(/glm|zhipu/.test(s)) return {icon:IconGrid,cls:'brand-glm'}
  if(/deepseek/.test(s)) return {icon:IconMemory,cls:'brand-ds'}
  if(/qwen|qwq/.test(s)) return {icon:IconSparkles,cls:'brand-qwen'}
  if(/kimi|moonshot/.test(s)) return {icon:IconClock,cls:'brand-kimi'}
  if(/grok/.test(s)) return {icon:IconStar,cls:'brand-grok'}
  return {icon:IconSparkles,cls:'brand-other'}
}


// ── 供应商中心：一排两个小图标，点一家进入它自己的页面（配置 / 模型两个 tab） ─────────
// 模型不再来自写死的预置清单：填好 API Key 后按该网址 /models 实时拉取，
// 搜索 + 折叠分组 + 逐条 ＋ 点选；Key 只留本机，不进云端快照。
// 模型目录：跨供应商看所有已添加模型，按大类折叠；点一行回到那家供应商的模型页。
function ModelCatalogPage({vendors,onBack,onOpenVendor}:{
  vendors:Vendor[]; onBack:()=>void; onOpenVendor:(vendorId:string)=>void
}) {
  const [query,setQuery]=useState('')
  const [closed,setClosed]=useState<Record<string,boolean>>({})
  type Entry={vendorId:string;vendorName:string;modelId:string;name:string;spec:ReturnType<typeof specForModel>}
  const entries:Entry[]=vendors.filter(v=>v.enabled!==false).flatMap(v=>v.models.filter(m=>m.selected).map(m=>({
    vendorId:v.id,vendorName:v.name,modelId:m.id,name:m.name||m.id,spec:specForModel(v,m.id),
  })))
  const q=query.trim().toLowerCase()
  const filtered=entries.filter(e=>!q||[e.name,e.modelId,e.vendorName].some(x=>String(x||'').toLowerCase().includes(q)))
  const groups=new Map<string,{label:string;items:Entry[]}>()
  for(const e of filtered){
    const fam=groupModels([e.modelId])[0]
    const key=fam?fam.id:'other'
    const g=groups.get(key)||{label:fam?fam.label:'其他',items:[]}
    g.items.push(e);groups.set(key,g)
  }
  void onBack
  return <section className="vendor-page">
    <div className="vendor-card open">
      <div className="vendor-page-meta"><span>{entries.length} 个模型</span></div>
      <div className="vendor-card-body vendor-kelivo-model-page">
        <div className="vendor-kelivo-search"><span aria-hidden="true"><IconSearch size={15}/></span><input aria-label="搜索模型目录" placeholder="搜索模型或供应商" value={query} onChange={e=>setQuery(e.target.value)}/>{!!query&&<button type="button" aria-label="清除搜索" onClick={()=>setQuery('')}><IconClose size={15}/></button>}</div>
        <div className="vendor-kelivo-added">
          {filtered.length===0&&<div className="vendor-kelivo-empty"><b>{entries.length?'没有匹配的模型':'还没有模型'}</b><small>{entries.length?'换个关键词试试':'到某家供应商的「模型」里添加'}</small></div>}
          {[...groups.entries()].map(([key,g])=>{
            const collapsed=closed[key]===true
            return <div className="vendor-kelivo-added-group" key={key}>
              <button type="button" className="vendor-kelivo-added-group-head" aria-expanded={!collapsed} onClick={()=>setClosed(v=>({...v,[key]:!collapsed}))}><span >{collapsed?<IconChevronRight size={13}/>:<IconChevronDown size={13}/>}</span><b>{g.label}</b><small>{g.items.length}</small></button>
              {!collapsed&&g.items.map(e=>{
                const brand=brandOf(e.modelId); const BrandIcon=brand.icon
                return <div className="catalog-row" role="button" tabIndex={0} key={e.vendorId+':'+e.modelId}
                  onClick={()=>onOpenVendor(e.vendorId)}
                  onKeyDown={ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();onOpenVendor(e.vendorId)}}}>
                  <span className={'vendor-model-brand '+brand.cls} aria-hidden="true"><BrandIcon size={14}/></span>
                  <span className="catalog-main">
                    <b>{e.spec.displayName||e.name}</b>
                    <ModelChips spec={e.spec}/>
                    <em className="catalog-vendor">{e.vendorName}</em>
                  </span>
                  <span className="vendor-kelivo-provider-caret" aria-hidden="true"><IconChevronRight size={14}/></span>
                </div>})}
            </div>
          })}
        </div>
      </div>
    </div>
  </section>
}

// 默认模型：助手没单独选模型时的兜底。只列已经勾进池子的模型，按供应商分组。
function DefaultModelPage({profiles,vendors,defaultModelId,setDefaultModelId,onBack}:{
  profiles:ModelProfile[]; vendors:Vendor[]; defaultModelId:string; setDefaultModelId:(v:string)=>void; onBack:()=>void
}) {
  const [query,setQuery]=useState('')
  const vendorName=new Map(vendors.map(v=>[v.id,v.name]))
  const rows=profiles.filter(p=>{
    const q=query.trim().toLowerCase()
    if(!q)return true
    return [p.name,p.model,vendorName.get(p.vendorId||'')||p.vendor||''].some(x=>String(x||'').toLowerCase().includes(q))
  })
  const groups=new Map<string,{name:string;items:ModelProfile[]}>()
  for(const p of rows){
    const id=p.vendorId||'manual'
    const g=groups.get(id)||{name:vendorName.get(id)||p.vendor||'手动添加',items:[]}
    g.items.push(p);groups.set(id,g)
  }
  const current=profiles.find(p=>p.id===defaultModelId)
  void onBack
  return <section className="vendor-page default-model-page">
    <div className="vendor-card open">
      <div className="vendor-page-meta"><span>{current?(current.name||current.model):'未设置'}</span></div>
      <div className="vendor-card-body vendor-kelivo-model-page">
        <p className="resource-hint">助手没有单独选模型时，聊天用这个兜底；助手自己选过的，仍以助手的为准。</p>
        <div className="vendor-kelivo-search"><span aria-hidden="true"><IconSearch size={15}/></span><input aria-label="搜索默认模型" placeholder="搜索模型或供应商" value={query} onChange={e=>setQuery(e.target.value)}/>{!!query&&<button type="button" aria-label="清除搜索" onClick={()=>setQuery('')}><IconClose size={15}/></button>}</div>
        <div className="vendor-kelivo-added">
          {rows.length===0&&<div className="vendor-kelivo-empty"><b>还没有可用模型</b><small>到「供应商 → 模型」里勾选模型后再回来</small></div>}
          {[...groups.entries()].map(([vendorId,group])=><div className="vendor-kelivo-added-group" key={vendorId}>
            <div className="vendor-kelivo-added-group-head static"><b>{group.name}</b><small>{group.items.length}</small></div>
            {group.items.map(p=>{
              const on=p.id===defaultModelId
              const vendor=vendors.find(v=>v.id===p.vendorId)
              const spec=vendor?specForModel(vendor,p.model):null
              const badges=spec?specBadges(spec):[]
              return <div className={'vendor-kelivo-added-row'+(on?' selected':'')} key={p.id}>
                <span className="vendor-kelivo-model-mark" aria-hidden="true">{p.name.slice(0,1).toUpperCase()}</span>
                <button type="button" className="vendor-kelivo-model-label" aria-pressed={on} onClick={()=>setDefaultModelId(on?'':p.id)}>
                  <b>{p.name||p.model}</b>
                  <span className="vendor-kelivo-badges">{badges.length?badges.map(b=><small key={b.id} className={'m-spec-badge '+b.tone}>{b.label}</small>):<small>{p.model}</small>}</span>
                </button>
                <button type="button" className={'default-model-pick'+(on?' on':'')} aria-label={on?'取消默认':'设为默认'} onClick={()=>setDefaultModelId(on?'':p.id)}>{on?<IconCheck size={13}/>:null}</button>
              </div>})}
          </div>)}
        </div>
        <div className="vendor-kelivo-floating-actions"><button type="button" disabled={!defaultModelId} onClick={()=>setDefaultModelId('')}>清除默认</button></div>
      </div>
    </div>
  </section>
}

// 模型能力测试：三项独立探活，结果给测试小卡片用。
type CapKey = 'text' | 'image' | 'tool'
type CapResult = { state: 'run' | 'ok' | 'fail'; note: string }
const CAP_ROWS: [CapKey, string][] = [['text', '文本'], ['image', '图片'], ['tool', '工具']]
// 1×1 透明 PNG，用来验证模型是否接受图片输入。
const CAP_TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function VendorCenter({vendors,setVendors,setModelProfiles,section,onSection,modelProfiles,defaultModelId,setDefaultModelId}:{
  vendors:Vendor[]; setVendors:React.Dispatch<React.SetStateAction<Vendor[]>>
  setModelProfiles:React.Dispatch<React.SetStateAction<ModelProfile[]>>
  section:string; onSection:(s:string)=>void
  modelProfiles:ModelProfile[]; defaultModelId:string; setDefaultModelId:(v:string)=>void
}) {
  // 列表 / 新增 / 某家详情各自是一个独立页面（section 驱动），不再在列表下面展开面板。
  const showNew=section==='vendor:add'
  const showDefault=section==='vendor:default'
  const showCatalog=section==='vendor:catalog'
  const showKeyManager=section.startsWith('vendor:keys:')
  const activeId=showKeyManager?section.slice('vendor:keys:'.length):(section.startsWith('vendor:')&&!showNew&&!showDefault&&!showCatalog?section.slice('vendor:'.length):'')
  const [tab,setTab]=useState<'config'|'model'>('config')
  const [,setPickerOpen]=useState(false)
  const [modelSheetOpen,setModelSheetOpen]=useState(false)
  const [modelSheetQuery,setModelSheetQuery]=useState('')
  const [sheetGroupOpen,setSheetGroupOpen]=useState<Record<string,boolean>>({})

  const [batchIds,setBatchIds]=useState<string[]>([])
  const [modelSelectMode,setModelSelectMode]=useState(false)
  const [specTarget,setSpecTarget]=useState('')
  const [addedGroupOpen,setAddedGroupOpen]=useState<Record<string,boolean>>({})
  const [importOpen,setImportOpen]=useState(false)
  const [importText,setImportText]=useState('')
  const [importMsg,setImportMsg]=useState('')
  // 模型测试小卡片：按 文本 / 图片 / 工具 逐项探活，结果直接打勾打叉。
  const [capTest,setCapTest]=useState<{models:string[];results:Record<string,Partial<Record<CapKey,CapResult>>>}|null>(null)
  const [vendorQuery,setVendorQuery]=useState('')
  const [providerGroupOpen,setProviderGroupOpen]=useState<Record<string,boolean>>({})
  const [sortMode,setSortMode]=useState(false)
  const [selectMode,setSelectMode]=useState(false)
  const [selectedVendors,setSelectedVendors]=useState<string[]>([])
  const [groupPrompt,setGroupPrompt]=useState(false)
  const [groupDraft,setGroupDraft]=useState('')
  const [testState,setTestState]=useState<{busy:boolean;ok?:boolean;text:string}>({busy:false,text:''})
  const [remoteModels,setRemoteModels]=useState<Record<string,string[]>>({})
  const [listState,setListState]=useState<{loading:boolean;error:string}>({loading:false,error:''})
  const [customModelOpen,setCustomModelOpen]=useState(false)
  const [modelDraft,setModelDraft]=useState('')
  const [keyDraft,setKeyDraft]=useState({label:'',value:''})
  const [keyDraftRole,setKeyDraftRole]=useState<'primary'|'backup'>('backup')
  const [showKey,setShowKey]=useState(false)
  const [showBackupKeys,setShowBackupKeys]=useState(false)
  const [addTab,setAddTab]=useState<'openai'|'google'|'claude'|'account'>('openai')
  const [newEnabled,setNewEnabled]=useState(true)
  const [newResponseApi,setNewResponseApi]=useState(false)
  const [newName,setNewName]=useState('')
  const [newKey,setNewKey]=useState('')
  const [newMultiKey,setNewMultiKey]=useState(false)
  const [newExtraKeys,setNewExtraKeys]=useState<Array<{id:string;label:string;value:string;visible:boolean}>>([])
  const [newEndpoint,setNewEndpoint]=useState('')
  const [newApiPath,setNewApiPath]=useState('')
  useEffect(()=>{
    if(!modelSheetOpen&&!importOpen)return
    return pushBackHandler(()=>{
      if(modelSheetOpen){setModelSheetOpen(false);return true}
      if(importOpen){setImportOpen(false);return true}
      return false
    })
  },[modelSheetOpen,importOpen])
  // 每次改动都基于当前 vendors 算出新数组，再同步模型池；不在 setState updater 里嵌套 setState。
  const commit=(next:Vendor[])=>{setVendors(next);setModelProfiles(old=>syncVendorProfiles(next,old))}
  const patch=(id:string,fn:(v:Vendor)=>Vendor)=>commit(vendors.map(v=>v.id===id?fn(v):v))
  const active=activeId?vendors.find(v=>v.id===activeId):undefined
  const primary=active?(active.keys.find(k=>k.role==='primary')||active.keys[0]):undefined
  // 批量点选：一次 patch 落盘，避免连续 setState 互相覆盖。
  const pickModels=(vendorId:string,ids:string[])=>patch(vendorId,v=>{
    const map=new Map(v.models.map(m=>[m.id,m]))
    for(const id of ids){const m=map.get(id);map.set(id,m?{...m,selected:true}:{id,name:id,selected:true})}
    return {...v,models:[...map.values()]}
  })
  const pickModel=(vendorId:string,modelId:string)=>pickModels(vendorId,[modelId])
  // 取消选择 = 直接从清单移除。未选中的模型不再占位，下拉里会重新出现 ＋。
  const unpickModel=(vendorId:string,modelId:string)=>patch(vendorId,v=>({...v,models:v.models.filter(m=>m.id!==modelId)}))
  const toggleModel=(vendorId:string,modelId:string,picked:boolean)=>picked?unpickModel(vendorId,modelId):pickModel(vendorId,modelId)
  const setPrimary=(value:string)=>{if(!active)return;patch(active.id,v=>{
    const i=v.keys.findIndex(k=>k.role==='primary')
    if(i>=0)return {...v,keys:v.keys.map((k,j)=>j===i?{...k,value}:k)}
    return {...v,keys:[{id:crypto.randomUUID(),label:'主号',value,role:'primary'},...v.keys]}
  })}
  const addBackupKey=()=>{
    const value=keyDraft.value.trim();if(!value||!active)return
    const role=keyDraftRole
    patch(active.id,v=>{
      const keys=role==='primary'?v.keys.map(k=>({...k,role:'backup' as const})):v.keys
      return {...v,keys:[...keys,{id:crypto.randomUUID(),label:keyDraft.label.trim()||(role==='primary'?'主号':'备用 '+(v.keys.length+1)),value,role}]}
    })
    setKeyDraft({label:'',value:''});setKeyDraftRole('backup')
  }
  const setManagedKeyRole=(keyId:string,role:'primary'|'backup')=>{
    if(!active)return
    patch(active.id,v=>{
      let keys=v.keys.map(k=>k.id===keyId?{...k,role}:(role==='primary'&&k.role==='primary'?{...k,role:'backup' as const}:k))
      if(!keys.some(k=>k.role==='primary')&&keys[0])keys=keys.map((k,i)=>i===0?{...k,role:'primary' as const}:k)
      return {...v,keys}
    })
  }
  const removeManagedKey=(keyId:string)=>{
    if(!active)return
    patch(active.id,v=>{
      let keys=v.keys.filter(k=>k.id!==keyId)
      if(!keys.some(k=>k.role==='primary')&&keys[0])keys=keys.map((k,i)=>i===0?{...k,role:'primary' as const}:k)
      return {...v,keys}
    })
  }
  const deleteVendor=async(v:Vendor)=>{
    const ok=await confirmDialog({
      title:'删除供应商',
      message:'删除「'+v.name+'」及其 '+v.keys.length+' 把 Key 和模型？删除后可重新添加供应商。',
      confirmLabel:'删除',
      danger:true
    })
    if(!ok)return
    commit(vendors.filter(x=>x.id!==v.id));backToList()
  }
  const resetEditUI=()=>{setSpecTarget('');setAddedGroupOpen({});setTestState({busy:false,text:''});setSortMode(false);setSelectMode(false);setSelectedVendors([]);setGroupPrompt(false);setGroupDraft('');setCapTest(null);setPickerOpen(false);setModelSheetQuery('');setModelSheetOpen(false);setSheetGroupOpen({});setBatchIds([]);setModelSelectMode(false);setKeyDraftRole('backup');setListState({loading:false,error:''});setCustomModelOpen(false);setModelDraft('');setShowKey(false);setShowBackupKeys(false);setKeyDraft({label:'',value:''});setAddTab('openai');setNewEnabled(true);setNewResponseApi(false)}
  // 返回列表：清掉详情页的临时 UI 状态，页面由 section 决定。
  const backToList=()=>{resetEditUI();onSection('vendor')}
  const openVendorPage=(id:string)=>{setTab('config');resetEditUI();setShowBackupKeys(true);onSection('vendor:'+id)}
  const addVendor=(e:FormEvent)=>{
    e.preventDefault()
    const name=newName.trim(),endpoint=newEndpoint.trim()
    if(!name)return
    const id='custom-'+Math.random().toString(36).slice(2,10)
    const keys=[...(newKey.trim()?[{id:crypto.randomUUID(),label:'主号',value:newKey.trim(),role:'primary' as const}]:[]),...(newMultiKey?newExtraKeys.filter(k=>k.value.trim()).map((k,i)=>({id:k.id,label:k.label.trim()||('备用 '+(i+1)),value:k.value.trim(),role:'backup' as const})):[])]
    commit([...vendors,{id,name,endpoint,apiPath:newApiPath.trim(),modelsPath:'',builtin:false,enabled:newEnabled,group:'',avatar:'',providerType:addTab==='account'?'openai':addTab,responseApi:newResponseApi,promptCacheKey:false,keys,models:[],modelOverrides:{}}] as Vendor[])
    setTab('config');resetEditUI();setShowBackupKeys(true)
    setNewName('');setNewKey('');setNewMultiKey(false);setNewExtraKeys([]);setNewEndpoint('');setNewApiPath('');setNewEnabled(true);setNewResponseApi(false)
    onSection('vendor:'+id)
  }
  // 只向「当前这一家」的接口拉模型，用备用优先的第一把有效 Key。
  const fetchRemote=async(v:Vendor):Promise<string[]>=>{
    const key=orderedKeys(v.keys).find(k=>k.value)?.value||''
    if(!v.endpoint.trim()){setListState({loading:false,error:'请先填写 API Base URL。'});return []}
    if(!key){setListState({loading:false,error:'请先在「配置」里填写 API Key。'});return []}
    setListState({loading:true,error:''})
    try{
      const r=await apiFetch('/api/models',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:v.endpoint.trim(),apiKey:key,modelsUrl:modelListUrl(v)})})
      const d=await r.json().catch(()=>({}))
      if(!r.ok)throw new Error(d?.error||('HTTP '+r.status))
      const ids=Array.isArray(d?.models)?d.models.filter((x:unknown)=>typeof x==='string'&&x.trim()).map((x:string)=>x.trim()):[]
      if(!ids.length)throw new Error('该网址没有返回可用模型，可手动输入模型名。')
      const unique=[...new Set<string>(ids)]
      setRemoteModels(m=>({...m,[v.id]:unique}))
      setListState({loading:false,error:''})
      return unique
    }catch(e){setListState({loading:false,error:e instanceof Error?e.message:'获取模型失败'});return []}
  }
  // 排序：只在自己所属的分组里和相邻项交换，跨组不会因为点一下就把供应商挪组。
  const moveVendor=(id:string,dir:-1|1)=>{
    const target=vendors.find(v=>v.id===id); if(!target) return
    const group=target.group||''
    const same=vendors.filter(v=>(v.group||'')===group)
    const from=same.findIndex(v=>v.id===id), to=from+dir
    if(from<0||to<0||to>=same.length) return
    const a=same[from], b=same[to]
    const next=[...vendors]
    const ia=next.findIndex(v=>v.id===a.id), ib=next.findIndex(v=>v.id===b.id)
    next[ia]=b; next[ib]=a
    commit(next)
  }
  // 测试连接：复用 /api/models 代理拉一次列表，能拉通就说明地址与 Key 都对。
  const testVendor=async(v:Vendor)=>{
    const key=orderedKeys(v.keys).find(k=>k.value)?.value||''
    if(!v.endpoint.trim()){setTestState({busy:false,ok:false,text:'请先填写 API Base URL'});return}
    if(!key){setTestState({busy:false,ok:false,text:'请先填写 API Key'});return}
    setTestState({busy:true,text:'正在连接 '+v.name+'…'})
    const started=typeof performance!=='undefined'?performance.now():Date.now()
    try{
      const r=await apiFetch('/api/models',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:v.endpoint.trim(),apiKey:key,modelsUrl:modelListUrl(v)})})
      const d=await r.json().catch(()=>({}))
      const cost=Math.round((typeof performance!=='undefined'?performance.now():Date.now())-started)
      if(!r.ok)throw new Error(d?.error||('HTTP '+r.status))
      const count=Array.isArray(d?.models)?d.models.length:0
      setTestState({busy:false,ok:true,text:'连接成功 · '+cost+' ms · '+count+' 个模型'})
    }catch(e){setTestState({busy:false,ok:false,text:'连接失败：'+(e instanceof Error?e.message:'未知错误')})}
  }
  // 模型测试：文本 / 图片 / 工具 三项真打请求，结果进小卡片（✓ / ✗）。
  const capPatch=(model:string,key:CapKey,value:CapResult)=>setCapTest(old=>{
    if(!old) return old
    return {...old,results:{...old.results,[model]:{...(old.results[model]||{}),[key]:value}}}
  })
  const capRequest=async(v:Vendor,model:string,extra:Record<string,unknown>)=>{
    const key=orderedKeys(v.keys).find(k=>k.value)?.value||''
    if(!v.endpoint.trim()) throw new Error('缺少 API 地址')
    if(!key) throw new Error('缺少 API Key')
    const ac=new AbortController()
    const timer=window.setTimeout(()=>ac.abort(),25000)
    let r:Response
    try{
      r=await apiFetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:ac.signal,body:JSON.stringify({endpoint:v.endpoint.trim(),apiKey:key,body:{model,stream:false,...extra}})})
    }catch(e){
      throw new Error(e instanceof Error&&/abort|中断|超时/.test(e.message)?'超时，没等到响应':(e instanceof Error?e.message:'请求失败'))
    }finally{window.clearTimeout(timer)}
    const text=await r.text()
    if(!r.ok){
      let msg=text
      try{const d=JSON.parse(text);msg=(d&&d.error)||text}catch{}
      throw new Error(String(msg).replace(/^上游返回\s*/,'').slice(0,80))
    }
    return text
  }
  const capJson=(text:string):any=>{try{return JSON.parse(text)}catch{return null}}
  const runCapTest=async(v:Vendor,ids:string[])=>{
    if(!ids.length) return
    const blank:Record<string,Partial<Record<CapKey,CapResult>>>={}
    for(const id of ids) blank[id]={text:{state:'run',note:''},image:{state:'run',note:''},tool:{state:'run',note:''}}
    setCapTest({models:ids,results:blank})
    for(const id of ids){
      try{
        const text=await capRequest(v,id,{messages:[{role:'user',content:'连通性测试，只回复两个字：可用'}],max_tokens:16})
        const d=capJson(text)
        if(d&&!Array.isArray(d.choices)&&!d.content) throw new Error('返回格式不认识')
        if(!d&&!/choices|content/.test(text)) throw new Error('返回格式不认识')
        capPatch(id,'text',{state:'ok',note:''})
      }catch(e){capPatch(id,'text',{state:'fail',note:e instanceof Error?e.message:'请求失败'})}
      try{
        await capRequest(v,id,{messages:[{role:'user',content:[{type:'text',text:'这张图是什么颜色？用一个词回答'},{type:'image_url',image_url:{url:CAP_TINY_PNG}}]}],max_tokens:24})
        capPatch(id,'image',{state:'ok',note:''})
      }catch(e){capPatch(id,'image',{state:'fail',note:e instanceof Error?e.message:'不支持图片输入'})}
      try{
        const text=await capRequest(v,id,{messages:[{role:'user',content:'现在几点？必须调用 get_time 工具，不要直接回答。'}],max_tokens:80,tools:[{type:'function',function:{name:'get_time',description:'返回当前时间',parameters:{type:'object',properties:{},required:[]}}}]})
        const d=capJson(text)
        const calls=d&&d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.tool_calls
        if(Array.isArray(calls)&&calls.length) capPatch(id,'tool',{state:'ok',note:''})
        else capPatch(id,'tool',{state:'fail',note:'未返回工具调用'})
      }catch(e){capPatch(id,'tool',{state:'fail',note:e instanceof Error?e.message:'请求失败'})}
    }
  }
  const removeSelected=async(v:Vendor)=>{
    if(!batchIds.length) return
    const ok=await confirmDialog({title:'删除模型',message:'从「'+v.name+'」移除 '+batchIds.length+' 个模型？之后可以重新获取再添加。',confirmLabel:'删除',danger:true})
    if(!ok) return
    patch(v.id,x=>({...x,models:x.models.filter(m=>!batchIds.includes(m.id))}))
    setBatchIds([]);setModelSelectMode(false)
  }
  const remoteIds=active?(remoteModels[active.id]||[]):[]
  const pickedModels=active?active.models.filter(m=>m.selected):[]
  const requestUrlPreview=chatRequestUrl({endpoint:newEndpoint,apiPath:newApiPath})

  const [showHidden,setShowHidden]=useState(false)
  const [showMore,setShowMore]=useState(false)
  // 模型卡片：点一下进设置，长按进多选。长按用 pointer 计时，松手/移出/取消都清掉。
  // 长按触发后浏览器还会补一个 click，用触发时间戳把它吞掉，避免刚进多选就被反选。
  const pressTimer=useRef<number|null>(null)
  const pressAt=useRef(0)
  const clearPress=()=>{if(pressTimer.current!==null){window.clearTimeout(pressTimer.current);pressTimer.current=null}}
  const startPress=(id:string)=>{
    if(modelSelectMode) return
    clearPress()
    pressTimer.current=window.setTimeout(()=>{pressTimer.current=null;pressAt.current=Date.now();setModelSelectMode(true);setBatchIds([id])},480)
  }
  const tapModel=(id:string)=>{
    if(Date.now()-pressAt.current<700) return
    if(modelSelectMode){setBatchIds(ids=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]);return}
    setSpecTarget(id)
  }
  const isList=!showNew&&!showDefault&&!showCatalog&&!showKeyManager&&!active
  return <div className="vendor-center">
    {isList&&<>
      <div className="vendor-kelivo-list-head">
        <div className="vendor-head-tabs">
          
          <button type="button" className="vendor-head-title" onClick={()=>onSection('vendor:account')}>订阅账号</button>
        </div>
        <div className="vendor-kelivo-head-actions">
          <button type="button" className="vendor-head-add" onClick={()=>{resetEditUI();setNewName('OpenAI');setNewEndpoint('https://api.openai.com/v1');onSection('vendor:add')}}><IconPlus className="ui-icon-inline" size={14}/> 添加</button>
          <button type="button" className={'vendor-head-hide'+(showHidden?' on':'')} aria-pressed={showHidden} onClick={()=>setShowHidden(v=>!v)}>隐藏</button>
        </div>
      </div>
      <div className="vendor-kelivo-search"><span aria-hidden="true"><IconSearch size={15}/></span><input aria-label="搜索供应商" placeholder="搜索供应商或分组" value={vendorQuery} onChange={e=>setVendorQuery(e.target.value)}/>{!!vendorQuery&&<button type="button" aria-label="清除搜索" onClick={()=>setVendorQuery('')}><IconClose size={15}/></button>}</div>
      <div className="vendor-kelivo-provider-list" aria-label="供应商列表">
        {(()=>{
          const q=vendorQuery.trim().toLowerCase()
          const match=(v:Vendor)=>!q||v.name.toLowerCase().includes(q)||(v.group||'').toLowerCase().includes(q)
          const visibleVendors=showHidden?[]:vendors.filter(match).filter(v=>!v.hidden)
          const hiddenVendors=showHidden?vendors.filter(match).filter(v=>v.hidden):[]
          const map=new Map<string,Vendor[]>()
          for(const v of visibleVendors){const key=v.group||'';if(!map.has(key))map.set(key,[]);map.get(key)!.push(v)}
          const entries=[...map.entries()].sort((a,b)=>!a[0]?1:!b[0]?-1:0)
          const row=(v:Vendor)=>{
            const off=v.enabled===false
            const hasKey=v.keys.some(k=>!!k.value)
            const status=off?['禁用','off']:hasKey?['启用','on']:['未配置','warn']
            if(selectMode){
              const picked=selectedVendors.includes(v.id)
              return <div className={'vendor-kelivo-provider-row sortrow'+' pickrow'+(off?' off':'')+(picked?' picked':'')} key={v.id} role="button" tabIndex={0}
                onClick={()=>setSelectedVendors(ids=>picked?ids.filter(x=>x!==v.id):[...ids,v.id])}
                onKeyDown={ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();setSelectedVendors(ids=>picked?ids.filter(x=>x!==v.id):[...ids,v.id])}}}>
                <span className="vendor-pick" aria-hidden="true">{picked?<IconCheck size={13}/>:null}</span>
                <span className="vendor-kelivo-provider-icon" aria-hidden="true">{v.avatar||v.name.slice(0,1)}</span>
                <span className="vendor-kelivo-provider-info"><b>{v.name}</b><small>{v.keys.filter(k=>!!k.value).length} Key · {v.models.filter(m=>m.selected).length} 模型</small></span>
              </div>
            }
            if(sortMode) return <div className={'vendor-kelivo-provider-row sortrow'+(off?' off':'')} key={v.id}>
              <span className="vendor-kelivo-provider-icon" aria-hidden="true">{v.avatar||v.name.slice(0,1)}</span>
              <span className="vendor-kelivo-provider-info"><b>{v.name}</b><small>{v.keys.filter(k=>!!k.value).length} Key · {v.models.filter(m=>m.selected).length} 模型</small></span>
              <span className="vendor-sort-btns"><button type="button" aria-label={'上移 '+v.name} onClick={()=>moveVendor(v.id,-1)}><IconArrowUp size={14}/></button><button type="button" aria-label={'下移 '+v.name} onClick={()=>moveVendor(v.id,1)}><IconArrowDown size={14}/></button></span>
            </div>
            return <button type="button" className={'vendor-kelivo-provider-row'+(off?' off':'')} key={v.id} onClick={()=>openVendorPage(v.id)}>
              <span className="vendor-kelivo-provider-icon" aria-hidden="true">{v.avatar||v.name.slice(0,1)}</span>
              <span className="vendor-kelivo-provider-info"><b>{v.name}</b><small>{v.keys.filter(k=>!!k.value).length} Key · {v.models.filter(m=>m.selected).length} 模型</small></span>
              <span className={'vendor-kelivo-provider-status '+status[1]}>{status[0]}</span>
              <span className="vendor-kelivo-provider-caret"><IconChevronRight size={14}/></span>
            </button>
          }
          return <>
            {showHidden&&<div className="vendor-kelivo-provider-group vendor-hidden-group">
              {hiddenVendors.length===0?<p className="muted vendor-kelivo-empty-hint">还没有隐藏的供应商。进入某家供应商详情，打开「隐藏」后就会出现在这里。</p>:hiddenVendors.map(row)}
            </div>}
            {entries.map(([group,list])=>{
              const key=group||'_ungrouped'
              const collapsed=providerGroupOpen[key]===true
              return <div className="vendor-kelivo-provider-group" key={key}>
                {!!group&&<button type="button" className="vendor-kelivo-provider-group-head" aria-expanded={!collapsed} onClick={()=>setProviderGroupOpen(v=>({...v,[key]:!collapsed}))}><span >{collapsed?<IconChevronRight size={13}/>:<IconChevronDown size={13}/>}</span><b>{group}</b><small>{list.length}</small></button>}
                {!collapsed&&list.map(row)}
              </div>
            })}
            <button type="button" className="vendor-kelivo-provider-row add" onClick={()=>{resetEditUI();onSection('vendor:add')}}><span className="vendor-kelivo-provider-icon" aria-hidden="true"><IconPlus size={15}/></span><span className="vendor-kelivo-provider-info"><b>添加供应商</b></span><span className="vendor-kelivo-provider-caret"><IconChevronRight size={14}/></span></button>
          </>
        })()}
      </div>
      {!vendors.some(v=>{const q=vendorQuery.trim().toLowerCase();return !q||v.name.toLowerCase().includes(q)||(v.group||'').toLowerCase().includes(q)})&&<p className="muted vendor-kelivo-empty-hint">没有匹配的供应商</p>}
      {selectMode&&<div className="vendor-kelivo-batchbar vendor-select-bar">
        <button type="button" onClick={()=>setSelectedVendors(selectedVendors.length===vendors.length?[]:vendors.map(v=>v.id))}>{selectedVendors.length===vendors.length?'全不选':'全选'}</button>
        <button type="button" disabled={!selectedVendors.length} onClick={()=>{setGroupPrompt(true);setGroupDraft('')}}>分组</button>
        <button type="button" className="danger" disabled={!selectedVendors.length} onClick={()=>{
          const customs=selectedVendors.filter(id=>!vendors.find(v=>v.id===id)?.builtin)
          if(!customs.length){void confirmDialog({title:'无法删除',message:'内置供应商不能删除；可以在详情页把它停用或清空 Key。',confirmLabel:'知道了'}).then(()=>{});return}
          void confirmDialog({title:'删除供应商',message:'删除选中的 '+customs.length+' 家自建供应商及其 Key 与模型？',confirmLabel:'删除',danger:true}).then(ok=>{
            if(!ok) return
            commit(vendors.filter(v=>!customs.includes(v.id)))
            setSelectedVendors([]);setSelectMode(false)
          })
        }}>删除</button>
      </div>}
      {groupPrompt&&<div className="vendor-group-prompt">
        <input aria-label="新分组名称" value={groupDraft} placeholder="分组名称，留空表示未分组" onChange={e=>setGroupDraft(e.target.value)}/>
        <button type="button" onClick={()=>{
          const name=groupDraft.trim()
          commit(vendors.map(v=>selectedVendors.includes(v.id)?{...v,group:name}:v))
          setGroupPrompt(false);setGroupDraft('');setSelectedVendors([]);setSelectMode(false)
        }}>确定</button>
        <button type="button" onClick={()=>setGroupPrompt(false)}>取消</button>
      </div>}

    </>}

    {showCatalog&&<ModelCatalogPage vendors={vendors} onBack={backToList} onOpenVendor={id=>{setTab('model');openVendorPage(id)}}/>}

    {showDefault&&<DefaultModelPage profiles={modelProfiles} vendors={vendors} defaultModelId={defaultModelId} setDefaultModelId={setDefaultModelId} onBack={backToList}/>}


    {showKeyManager&&active&&<section className="vendor-page vendor-key-manager-page">
      <div className="vendor-page-meta"><span>{active.name} · 备用优先，主号兜底</span></div>
      <div className="vendor-key-manager-stats">
        <div><small>总计</small><b>{active.keys.length}</b></div>
        <div><small>主号</small><b>{active.keys.filter(k=>k.role==='primary').length||(active.keys.length?1:0)}</b></div>
        <div><small>备用</small><b>{active.keys.filter(k=>k.role==='backup').length}</b></div>
      </div>
      <div className="vendor-key-manager-list">
        {active.keys.length===0?<div className="vendor-kelivo-empty"><b>还没有 API Key</b><small>添加后可设置主号与备用 Key</small></div>:active.keys.map((k,index)=><div className="vendor-key-manager-row" key={k.id}>
          <div className="vendor-key-manager-row-head">
            <span className={'vendor-key-role-pill '+(k.role==='primary'?'primary':'backup')}>{k.role==='primary'?'主号':'备用 '+(index+1)}</span>
            <input aria-label="Key 备注名" value={k.label} onChange={e=>patch(active.id,v=>({...v,keys:v.keys.map(x=>x.id===k.id?{...x,label:e.target.value}:x)}))} placeholder="备注名"/>
            <SoftSelect className="vendor-key-role" ariaLabel="Key 角色" value={k.role||'backup'} onChange={v=>setManagedKeyRole(k.id,v as 'primary'|'backup')} options={[{value:'backup',label:'备用'},{value:'primary',label:'主号'}]}/>
          </div>
          <div className="key-input-row vendor-managed-key-input">
            <input aria-label={'API Key '+(index+1)} type="text" inputMode="text" style={{WebkitTextSecurity:showKey?'none':'disc'} as any} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={k.value} onChange={e=>patch(active.id,v=>({...v,keys:v.keys.map(x=>x.id===k.id?{...x,value:e.target.value}:x)}))} placeholder="API Key"/>
            <button type="button" className="paste-key-btn key-eye-btn" aria-label={showKey?'隐藏 Key':'显示 Key'} onClick={()=>setShowKey(v=>!v)}>{showKey?<IconEyeOff size={15}/>:<IconEye size={15}/>}</button>
            <button type="button" className="vendor-managed-key-remove" aria-label="删除这把 Key" onClick={()=>void confirmDialog({title:'删除 API Key',message:'确定删除这把 Key？',confirmLabel:'删除',danger:true}).then(ok=>{if(ok)removeManagedKey(k.id)})}><IconClose size={15}/></button>
          </div>
        </div>)}
      </div>
      <form className="vendor-key-add-card" onSubmit={e=>{e.preventDefault();addBackupKey()}}>
        <b>添加 Key</b>
        <div className="vendor-key-add-meta">
          <input aria-label="新 Key 备注名" value={keyDraft.label} onChange={e=>setKeyDraft(v=>({...v,label:e.target.value}))} placeholder="备注名"/>
          <SoftSelect className="vendor-key-role" ariaLabel="新 Key 角色" value={keyDraftRole} onChange={v=>setKeyDraftRole(v as 'primary'|'backup')} options={[{value:'backup',label:'备用'},{value:'primary',label:'主号'}]}/>
        </div>
        <div className="key-input-row vendor-managed-key-input">
          <input aria-label="新 API Key" type="text" inputMode="text" style={{WebkitTextSecurity:showKey?'none':'disc'} as any} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={keyDraft.value} onChange={e=>setKeyDraft(v=>({...v,value:e.target.value}))} placeholder="输入 API Key"/>
          <button type="button" className="paste-key-btn key-eye-btn" aria-label={showKey?'隐藏 Key':'显示 Key'} onClick={()=>setShowKey(v=>!v)}>{showKey?<IconEyeOff size={15}/>:<IconEye size={15}/>}</button>
        </div>
        <button type="submit" className="vendor-submit" disabled={!keyDraft.value.trim()}><IconPlus className="ui-icon-inline" size={14}/> 添加 Key</button>
        <small>Key 只保存在本机配置中；输入框使用普通文本键盘，不启用密码/安全键盘。</small>
      </form>
    </section>}

    {importOpen&&<div className="vendor-kelivo-sheet-overlay" role="presentation" onClick={()=>setImportOpen(false)}>
      <section className="vendor-kelivo-sheet vendor-import-sheet" role="dialog" aria-modal="true" aria-label="导入供应商" onClick={e=>e.stopPropagation()}>
        <div className="vendor-kelivo-sheet-grip"/>
        <header className="vendor-import-head"><b>导入供应商</b><button type="button" aria-label="关闭导入" onClick={()=>setImportOpen(false)}><IconClose size={15}/></button></header>
        <p className="vendor-import-hint">粘贴 Kelivo 导出的模型配置 JSON：数组，每项含 name / apiEndpoint / apiKey / modelName。只迁移地址、Key 与模型名。</p>
        <textarea className="vendor-import-text" aria-label="Kelivo 配置 JSON" placeholder='[{"name":"Aeon AI","apiEndpoint":"https://…/v1","apiKey":"sk-…","modelName":"gpt-5.6,glm-5.2"}]' value={importText} onChange={e=>setImportText(e.target.value)}/>
        {!!importMsg&&<p className="vendor-import-msg" role="status">{importMsg}</p>}
        <div className="vendor-import-actions">
          <button type="button" onClick={()=>setImportOpen(false)}>取消</button>
          <button type="button" className="primary" onClick={()=>{
            const configs=parseKelivoModelConfigs(importText)
            if(!configs){setImportMsg('没有解析到可导入的配置，请贴完整的 JSON 数组');return}
            const converted=kelivoConfigsToVendors(configs,vendors)
            const summary=kelivoImportSummary(converted)
            commit([...vendors,...converted])
            setImportMsg(`已导入 ${summary.vendors} 家供应商 / ${summary.models} 个模型 / ${summary.keys} 把 Key`)
            setImportText('')
          }}>导入</button>
        </div>
      </section>
    </div>}

    {showNew&&<div className="vendor-kelivo-sheet-overlay vendor-add-overlay" role="presentation" onClick={backToList}>
      <section className="vendor-kelivo-sheet vendor-add-sheet" role="dialog" aria-modal="true" aria-label="添加供应商" onClick={e=>e.stopPropagation()}>
        <div className="vendor-kelivo-sheet-grip"/>
        <header className="vendor-add-head"><button type="button" aria-label="关闭" onClick={backToList}><IconClose size={15}/></button><b>添加供应商</b><span aria-hidden="true"/></header>
        <div className="vendor-add-tabs" role="tablist" aria-label="供应商类型">
          {([['openai','OpenAI'],['google','Google'],['claude','Claude'],['account','账号登录']] as const).map(([id,label])=>(
            <button type="button" key={id} role="tab" aria-selected={addTab===id} className={addTab===id?'active':''} onClick={()=>{
              setAddTab(id)
              if(id==='openai'){setNewName('OpenAI');setNewEndpoint('https://api.openai.com/v1')}
              if(id==='google'){setNewName('Gemini');setNewEndpoint('https://generativelanguage.googleapis.com/v1beta/openai')}
              if(id==='claude'){setNewName('Claude');setNewEndpoint('https://api.anthropic.com/v1')}
            }}>{label}</button>))}
        </div>
        {addTab==='account'?<div className="vendor-add-account">
          <p>订阅账号用网页登录，不需要填 API Key。</p>
          <button type="button" className="vendor-submit" onClick={()=>onSection('vendor:account')}>去登录订阅账号</button>
        </div>:<form className="vendor-add-form" onSubmit={addVendor}>
          <label className="vendor-config-info vendor-config-switch"><span>启用</span><input type="checkbox" checked={newEnabled} onChange={e=>setNewEnabled(e.target.checked)}/></label>
          {addTab==='openai'&&<label className="vendor-config-info vendor-config-switch"><span>Response API <small>使用 /responses 端点</small></span><input type="checkbox" checked={newResponseApi} onChange={e=>setNewResponseApi(e.target.checked)}/></label>}
          <label className="vendor-field">名称<input aria-label="供应商名称" value={newName} onChange={e=>setNewName(e.target.value)} placeholder="例如 OpenAI"/></label>
          <label className="vendor-field">API Key <div className="key-input-row"><input aria-label="API Key" type="text" inputMode="text" style={{WebkitTextSecurity:"disc"} as any} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={newKey} onChange={e=>setNewKey(e.target.value)} placeholder="例如 sk-…"/></div></label>
          <label className="vendor-field">API Base URL<input aria-label="API Base URL" value={newEndpoint} onChange={e=>setNewEndpoint(e.target.value)} placeholder="https://…/v1"/></label>
          <p className="vendor-url-hint">请求地址 <b>{requestUrlPreview||'填写 Base URL 后显示'}</b></p>
          <label className="vendor-field">API 路径<input aria-label="API 路径" value={newApiPath} onChange={e=>setNewApiPath(e.target.value)} placeholder={DEFAULT_API_PATH}/></label>
          <label className="vendor-multi-toggle"><input type="checkbox" checked={newMultiKey} onChange={e=>{setNewMultiKey(e.target.checked);if(e.target.checked&&newExtraKeys.length===0)setNewExtraKeys([{id:crypto.randomUUID(),label:'',value:'',visible:false}])}}/> 启用多 Key 模式</label>
          {newMultiKey&&<div className="vendor-new-keys">{newExtraKeys.map((k,i)=><div className="vendor-new-key" key={k.id}><input aria-label={'备用 Key '+(i+1)+' 备注'} value={k.label} onChange={e=>setNewExtraKeys(a=>a.map(x=>x.id===k.id?{...x,label:e.target.value}:x))} placeholder="备注"/><input aria-label={'备用 API Key '+(i+1)} type="text" inputMode="text" style={{WebkitTextSecurity:k.visible?'none':'disc'} as any} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={k.value} onChange={e=>setNewExtraKeys(a=>a.map(x=>x.id===k.id?{...x,value:e.target.value}:x))} placeholder="API Key"/><button type="button" aria-label={k.visible?'隐藏 Key':'显示 Key'} onClick={()=>setNewExtraKeys(a=>a.map(x=>x.id===k.id?{...x,visible:!x.visible}:x))} >{k.visible?<IconEyeOff size={15}/>:<IconEye size={15}/>}</button><button type="button" aria-label="删除备用 Key" onClick={()=>setNewExtraKeys(a=>a.filter(x=>x.id!==k.id))}><IconClose size={15}/></button></div>)}<button type="button" className="vendor-add-key" aria-label="添加一把 Key" onClick={()=>setNewExtraKeys(a=>[...a,{id:crypto.randomUUID(),label:'',value:'',visible:false}])}><IconPlus size={15}/></button></div>}
          <button type="submit" className="vendor-submit"><IconPlus className="ui-icon-inline" size={14}/> 添加</button>
        </form>}
      </section>
    </div>}

    {active&&!showKeyManager&&<section className="vendor-page">
      <div className="vendor-inline-toolbar">
        <span className="vendor-inline-meta">{pickedModels.length} 个模型</span>
        {tab==='config'&&<div className="vendor-kelivo-head-actions vendor-actions-text">
          <button type="button" aria-label="测试连接" title="测试连接" disabled={testState.busy} onClick={()=>void testVendor(active)}><IconTest size={14}/><span>{testState.busy?'测试中':'测试'}</span></button>
          <button type="button" aria-label="删除供应商" title="删除供应商" className="danger" onClick={()=>void deleteVendor(active)}><IconTrash size={14}/><span>删除</span></button>
        </div>}
      </div>
      <div className="vendor-card open" key={active.id}>

      {tab==='config'&&<div className="vendor-card-body vendor-config-kelivo">
        <div className="vendor-config-hero"><b>供应商类型</b><SoftSelect className="vendor-config-select" ariaLabel="供应商类型" value={active.providerType||'openai'} onChange={v=>patch(active.id,x=>({...x,providerType:v as 'openai'|'google'|'claude'}))} options={[{value:'openai',label:'OpenAI 兼容'},{value:'google',label:'Google'},{value:'claude',label:'Claude'}]}/></div>
        <div className="vendor-config-menu">
          <div className="vendor-config-pair two">
            <label className="vendor-config-info vendor-config-switch"><span>隐藏</span><input type="checkbox" checked={active.hidden===true} onChange={e=>patch(active.id,x=>({...x,hidden:e.target.checked}))}/></label>
            <label className="vendor-config-info vendor-config-switch"><span>启用</span><input type="checkbox" checked={active.enabled!==false} onChange={e=>patch(active.id,x=>({...x,enabled:e.target.checked}))}/></label>
          </div>
          <label className="vendor-config-info vendor-config-switch"><span>多 Key 模式 <small>备用优先，主号兜底</small></span><input type="checkbox" checked={showBackupKeys} onChange={e=>setShowBackupKeys(e.target.checked)}/></label>
          {showBackupKeys&&<div className="vendor-inline-keys">
            {active.keys.length===0?<p className="vendor-inline-empty">还没有 API Key，添加后可设置主号与备用。</p>:active.keys.map((k,index)=><div className="vendor-key-manager-row" key={k.id}>
              <div className="vendor-key-manager-row-head">
                <span className={'vendor-key-role-pill '+(k.role==='primary'?'primary':'backup')}>{k.role==='primary'?'主号':'备用 '+(index+1)}</span>
                <input aria-label="Key 备注名" value={k.label} onChange={e=>patch(active.id,v=>({...v,keys:v.keys.map(x=>x.id===k.id?{...x,label:e.target.value}:x)}))} placeholder="备注名"/>
                <SoftSelect className="vendor-key-role" ariaLabel="Key 角色" value={k.role||'backup'} onChange={v=>setManagedKeyRole(k.id,v as 'primary'|'backup')} options={[{value:'backup',label:'备用'},{value:'primary',label:'主号'}]}/>
              </div>
              <div className="key-input-row vendor-managed-key-input">
                <input aria-label={'API Key '+(index+1)} type="text" inputMode="text" style={{WebkitTextSecurity:showKey?'none':'disc'} as any} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={k.value} onChange={e=>patch(active.id,v=>({...v,keys:v.keys.map(x=>x.id===k.id?{...x,value:e.target.value}:x)}))} placeholder="输入 API Key"/>
                <button type="button" className="paste-key-btn key-eye-btn" aria-label={showKey?'隐藏 Key':'显示 Key'} onClick={()=>setShowKey(v=>!v)}>{showKey?<IconEyeOff size={15}/>:<IconEye size={15}/>}</button>
                <button type="button" className="vendor-managed-key-remove" aria-label="删除这把 Key" onClick={()=>void confirmDialog({title:'删除 API Key',message:'确定删除这把 Key？',confirmLabel:'删除',danger:true}).then(ok=>{if(ok)removeManagedKey(k.id)})}><IconClose size={15}/></button>
              </div>
            </div>)}
            <form className="vendor-key-add-card inline" onSubmit={e=>{e.preventDefault();addBackupKey()}}>
              <b>添加 Key</b>
              <div className="vendor-key-add-meta">
                <input aria-label="新 Key 备注名" value={keyDraft.label} onChange={e=>setKeyDraft(v=>({...v,label:e.target.value}))} placeholder="备注名"/>
                <SoftSelect className="vendor-key-role" ariaLabel="新 Key 角色" value={keyDraftRole} onChange={v=>setKeyDraftRole(v as 'primary'|'backup')} options={[{value:'backup',label:'备用'},{value:'primary',label:'主号'}]}/>
              </div>
              <div className="key-input-row vendor-managed-key-input">
                <input aria-label="新 API Key" type="text" inputMode="text" style={{WebkitTextSecurity:showKey?'none':'disc'} as any} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={keyDraft.value} onChange={e=>setKeyDraft(v=>({...v,value:e.target.value}))} placeholder="输入 API Key"/>
                <button type="button" className="paste-key-btn key-eye-btn" aria-label={showKey?'隐藏 Key':'显示 Key'} onClick={()=>setShowKey(v=>!v)}>{showKey?<IconEyeOff size={15}/>:<IconEye size={15}/>}</button>
              </div>
              <button type="submit" className="vendor-submit" disabled={!keyDraft.value.trim()}><IconPlus className="ui-icon-inline" size={14}/> 添加 Key</button>
            </form>
          </div>}
          <button type="button" className="vendor-config-more-head" aria-expanded={showMore} onClick={()=>setShowMore(v=>!v)}>其他设置<span aria-hidden="true" >{showMore?<IconChevronUp size={14}/>:<IconChevronDown size={14}/>}</span></button>
          {showMore&&<>
            <label className="vendor-config-info vendor-config-switch"><span>Response API <small>使用 /responses 端点</small></span><input type="checkbox" checked={!!active.responseApi} onChange={e=>patch(active.id,x=>({...x,responseApi:e.target.checked}))}/></label>
            <label className="vendor-config-info vendor-config-switch"><span>发送会话缓存键 <small>OpenAI prompt_cache_key</small></span><input type="checkbox" checked={!!active.promptCacheKey} onChange={e=>patch(active.id,x=>({...x,promptCacheKey:e.target.checked}))}/></label>
            <div className="vendor-config-info"><span>图片与请求预算</span><span className="vendor-soon">继承默认</span></div>
            <div className="vendor-config-info"><span>网络代理</span><span className="vendor-soon">未接入</span></div>
            <div className="vendor-config-info"><span>自定义请求</span><span className="vendor-soon">未接入</span></div>
          </>}
        </div>
        <div className="vendor-config-section-title">连接设置</div>
        <div className="vendor-config-fields">
          <label className="vendor-field">名称<input aria-label="供应商名称" value={active.name} onChange={e=>patch(active.id,x=>({...x,name:e.target.value}))} placeholder="供应商名称"/></label>
          <datalist id="vendor-group-options">{[...new Set(vendors.map(v=>v.group).filter(Boolean))].map(g=><option key={g} value={g}/>)}</datalist>

          <label className="vendor-field">API Key <small>普通文本键盘输入，点击眼睛切换显示</small><div className="vendor-key-input"><input aria-label="API Key" type="text" inputMode="text" style={{WebkitTextSecurity:showKey?'none':'disc'} as any} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={primary?.value||''} onChange={e=>setPrimary(e.target.value)} placeholder="输入 API Key"/><button type="button" className="paste-key-btn key-eye-btn" aria-label={showKey?'隐藏 Key':'显示 Key'} onClick={()=>setShowKey(s=>!s)}>{showKey?<IconEyeOff size={15}/>:<IconEye size={15}/>}</button></div></label>
          <label className="vendor-field">API Base URL<input aria-label="API Base URL" type="url" autoCapitalize="off" spellCheck={false} value={active.endpoint} onChange={e=>patch(active.id,x=>({...x,endpoint:e.target.value}))} placeholder="https://api.example.com/v1"/></label>
          <label className="vendor-field">API 路径<input aria-label="API 路径" type="text" autoCapitalize="off" spellCheck={false} value={active.apiPath||''} onChange={e=>patch(active.id,x=>({...x,apiPath:e.target.value}))} placeholder={DEFAULT_API_PATH}/></label>
        </div>

      </div>}

      {tab==='model'&&<div className="vendor-card-body vendor-kelivo-model-page">
        <div className="vendor-kelivo-added">
          {pickedModels.length>0&&pickedModels.some(m=>m.hidden)&&<div className="vendor-kelivo-added-group vendor-hidden-models">
            <button type="button" className="vendor-kelivo-added-group-head" aria-expanded={addedGroupOpen._hidden!==false} onClick={()=>setAddedGroupOpen(v=>({...v,_hidden:v._hidden!==false?false:true}))}>
              <span >{addedGroupOpen._hidden!==false?<IconChevronDown size={13}/>:<IconChevronRight size={13}/>}</span><b>隐藏模型</b><small>{pickedModels.filter(m=>m.hidden).length}</small>
            </button>
            {addedGroupOpen._hidden!==false&&pickedModels.filter(m=>m.hidden).map(m=>{
              const spec=specForModel(active,m.id); const brand=brandOf(m.id); const BrandIcon=brand.icon
              return <div className="vendor-kelivo-added-row hidden-model" key={m.id}>
                <span className={'vendor-model-brand '+brand.cls} aria-hidden="true"><BrandIcon size={14}/></span>
                <button type="button" className="vendor-kelivo-model-label" onClick={()=>setSpecTarget(m.id)}><b>{spec.displayName||m.name||m.id}</b><ModelChips spec={spec}/></button>
                <button type="button" className="vendor-model-hide on" aria-label="取消隐藏" onClick={()=>patch(active.id,v=>({...v,models:v.models.map(x=>x.id===m.id?{...x,hidden:false}:x)}))}><IconEyeOff size={14}/></button>
              </div>
            })}
          </div>}
          {pickedModels.length===0?<div className="vendor-kelivo-empty"><b>暂无模型</b><small>点击下方按钮添加模型</small></div>:
            <div className="vendor-model-cards">
              {pickedModels.filter(m=>!m.hidden).sort((a,b)=>(a.name||a.id).localeCompare(b.name||b.id)).map(m=>{
                const spec=specForModel(active,m.id); const brand=brandOf(m.id); const BrandIcon=brand.icon; const picked=batchIds.includes(m.id)
                return <div className={'vendor-model-card'+(picked?' picked':'')} key={m.id} role="button" tabIndex={0}
                  onPointerDown={()=>startPress(m.id)}
                  onPointerUp={clearPress}
                  onPointerLeave={clearPress}
                  onPointerCancel={clearPress}
                  onContextMenu={ev=>ev.preventDefault()}
                  onClick={()=>tapModel(m.id)}
                  onKeyDown={ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();tapModel(m.id)}}}>
                  {modelSelectMode&&<span className={'vendor-model-check'+(picked?' on':'')} aria-hidden="true">{picked?<IconCheck size={12}/>:null}</span>}
                  <span className={'vendor-model-brand '+brand.cls} aria-hidden="true"><BrandIcon size={14}/></span>
                  <span className="vendor-model-card-main"><b>{spec.displayName||m.name||m.id}</b><ModelChips spec={spec}/></span>
                </div>
              })}
            </div>}
        </div>
        <div className="vendor-kelivo-bottomdock">
          {modelSelectMode?<div className="vendor-kelivo-batchbar">
            <button type="button" onClick={()=>setBatchIds(batchIds.length===pickedModels.length?[]:pickedModels.map(m=>m.id))}>{batchIds.length===pickedModels.length&&pickedModels.length?'全不选':'全选'}</button>
            <button type="button" className="probe" disabled={!batchIds.length} onClick={()=>{setModelSelectMode(false);void runCapTest(active,batchIds)}}>测试</button>
            <button type="button" className="danger" aria-label="删除所选模型" disabled={!batchIds.length} onClick={()=>void removeSelected(active)}><IconTrash size={15}/></button>
            <button type="button" className="exit" aria-label="退出多选" onClick={()=>{setModelSelectMode(false);setBatchIds([])}}><IconClose size={15}/></button>
          </div>:<div className="vendor-kelivo-floating-actions">
            <button type="button" aria-label="获取模型列表" title="获取模型列表" onClick={()=>{setModelSheetQuery('');setModelSheetOpen(true);if(!remoteIds.length)void fetchRemote(active)}}><IconGrid size={15}/></button>
            <button type="button" aria-label="手动添加模型" title="手动添加模型" onClick={()=>setCustomModelOpen(v=>!v)}><IconPlus size={15}/></button>
          </div>}
        </div>
        {capTest&&<div className="vendor-cap-layer" role="presentation" onClick={()=>setCapTest(null)}>
          <section className="vendor-cap-card" role="dialog" aria-label="模型测试" onClick={e=>e.stopPropagation()}>
            <header className="vendor-cap-head"><b>模型测试</b><button type="button" aria-label="关闭测试" onClick={()=>setCapTest(null)}><IconClose size={15}/></button></header>
            {capTest.models.map(id=>{
              const res=capTest.results[id]||{}
              const done=CAP_ROWS.every(([k])=>res[k]&&res[k]!.state!=='run')
              return <div className="vendor-cap-block" key={id}>
                <div className="vendor-cap-model"><small>{specForModel(active,id).displayName||id}</small>{done&&<em>完成</em>}</div>
                {CAP_ROWS.map(([k,label])=>{
                  const r=res[k]
                  return <div className="vendor-cap-row" key={k}>
                    <span className="vendor-cap-label">{label}</span>
                    {r&&r.note?<small className="vendor-cap-note">{r.note}</small>:null}
                    <i className={'vendor-cap-state '+(r?r.state:'run')} aria-label={r&&r.state==='ok'?'通过':r&&r.state==='fail'?'失败':'测试中'}>{r&&r.state==='ok'?<IconCheck size={13}/>:r&&r.state==='fail'?<IconClose size={13}/>:<IconMore size={13}/>}</i>
                  </div>
                })}
              </div>
            })}
          </section>
        </div>}
        {customModelOpen&&<div className="vendor-kelivo-custom"><input aria-label="手动添加模型 ID" value={modelDraft} placeholder="输入模型 ID" onChange={e=>setModelDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&modelDraft.trim()){pickModel(active.id,modelDraft.trim());setModelDraft('');setCustomModelOpen(false)}}}/><button type="button" onClick={()=>{if(!modelDraft.trim())return;pickModel(active.id,modelDraft.trim());setModelDraft('');setCustomModelOpen(false)}}>添加</button><button type="button" onClick={()=>setCustomModelOpen(false)}>取消</button></div>}
        {modelSheetOpen&&<div className="vendor-kelivo-sheet-overlay" role="presentation" onClick={()=>setModelSheetOpen(false)}>
          <section className="vendor-kelivo-sheet" role="dialog" aria-modal="true" aria-label={'从 '+active.name+' 添加模型'} onClick={e=>e.stopPropagation()}>
            <div className="vendor-kelivo-sheet-grip"/>
            <div className="vendor-kelivo-sheet-search">
              <span aria-hidden="true"><IconSearch size={15}/></span><input aria-label="在可用模型中搜索" autoFocus value={modelSheetQuery} onChange={e=>setModelSheetQuery(e.target.value)} placeholder="输入模型名称筛选"/>
              <button type="button" aria-label="全选" title="全选" onClick={()=>pickModels(active.id,[...new Set([...remoteIds,...pickedModels.map(m=>m.id)])].filter(id=>id.toLowerCase().includes(modelSheetQuery.trim().toLowerCase())))}><IconCheck size={14}/></button>
              <button type="button" aria-label="刷新当前供应商模型" disabled={listState.loading} onClick={()=>void fetchRemote(active)}>{listState.loading?<IconMore size={14}/>:<IconRefresh size={14}/>}</button>
            </div>
            {listState.error&&<p className="mcp-error" role="alert">{listState.error}</p>}
            {listState.loading&&<p className="muted">正在读取「{active.name}」的模型…</p>}
            <div className="vendor-kelivo-sheet-items">
              {groupModelsByName([...new Set([...remoteIds,...pickedModels.map(m=>m.id)])].filter(id=>id.toLowerCase().includes(modelSheetQuery.trim().toLowerCase()))).map(g=><div className="vendor-kelivo-sheet-group" key={g.id}>
                <button type="button" className="vendor-kelivo-sheet-group-head" aria-expanded={!sheetGroupOpen[g.id]} onClick={()=>setSheetGroupOpen(v=>({...v,[g.id]:!v[g.id]}))}><span >{sheetGroupOpen[g.id]?<IconChevronRight size={13}/>:<IconChevronDown size={13}/>}</span><b>{g.label}</b><small>{g.models.length}</small><span className="vendor-kelivo-sheet-group-add" role="button" tabIndex={0} onClick={e=>{e.stopPropagation();pickModels(active.id,g.models)}} onKeyDown={e=>{if(e.key==='Enter'){e.stopPropagation();pickModels(active.id,g.models)}}}><IconPlus size={14}/></span></button>
                {!sheetGroupOpen[g.id]&&g.models.map(id=>{const added=pickedModels.some(m=>m.id===id);const brand=brandOf(id);const BrandIcon=brand.icon;return <div className={'vendor-kelivo-sheet-model'+(added?' added':'')} key={id}><span className={'vendor-model-brand '+brand.cls} aria-hidden="true"><BrandIcon size={14}/></span><div className="vendor-kelivo-model-label"><b>{id}</b><ModelChips spec={inferModelSpec(id)} dense/></div><button type="button" aria-label={(added?'移除 ':'添加 ')+id} onClick={()=>toggleModel(active.id,id,added)} >{added?<IconMinus size={14}/>:<IconPlus size={14}/>}</button></div>})}
              </div>)}
              {!listState.loading&&!remoteIds.length&&<div className="vendor-kelivo-empty"><b>尚未获取模型</b><small>点击右上角刷新，或关闭弹层后手动添加模型</small></div>}
            </div>
            <button type="button" className="vendor-kelivo-sheet-done" onClick={()=>setModelSheetOpen(false)}>完成 · 已添加 {pickedModels.length} 个</button>
          </section>
        </div>}
        {!!specTarget&&<ModelSpecPage vendorName={active.name} modelId={specTarget} spec={specForModel(active,specTarget)} onClose={()=>setSpecTarget('')} onReset={()=>{patch(active.id,v=>clearModelSpec(v,specTarget) as Vendor);setSpecTarget('')}} onSave={spec=>{patch(active.id,v=>withModelSpec(v,specTarget,spec) as Vendor);setSpecTarget('')}}/>}
      </div>}
      <div className="vendor-tabs" role="tablist" aria-label="供应商设置">
        <button type="button" role="tab" aria-selected={tab==='config'} className={tab==='config'?'active':''} onClick={()=>{setTab('config');setModelSelectMode(false);setBatchIds([])}}>配置</button>
        <button type="button" role="tab" aria-selected={tab==='model'} className={tab==='model'?'active':''} onClick={()=>{setTab('model');setModelSelectMode(false);setBatchIds([])}}>模型</button>
      </div>
      </div>
    </section>}
  </div>
}

// 设置页「聊天可选清单」：勾进池里的条目才会出现在聊天窗口对应小图标里。
// 世界书 / MCP 两栏并排：设置页（勾选池）和聊天页（绑定当前助手）共用同一套布局。
function WorldMcpMatrix({mode,person,chatPool,setChatPool,worldEntries,setWorldEntries,bindings,setBindings}:{
  mode:'pool'|'bind'; person?:Person
  chatPool?:ChatPool; setChatPool?:React.Dispatch<React.SetStateAction<ChatPool>>
  worldEntries:WorldEntry[]; setWorldEntries:React.Dispatch<React.SetStateAction<WorldEntry[]>>
  bindings?:Record<Person,PersonBinding>; setBindings?:React.Dispatch<React.SetStateAction<Record<Person,PersonBinding>>>
}) {
  const mcp=useMcpLibrary()
  const pool=chatPool||{worldIds:null,mcpIds:null}
  const worldAll=worldEntries.map(e=>e.id)
  const binding=person?(bindings?.[person]||emptyBinding()):emptyBinding()
  const mineMine=mcp.connections.filter(c=>!person||c.person===person)
  const mcpAll=mineMine.map(c=>c.id)
  const mcpIds=binding.mcpIds===null?mcpAll:binding.mcpIds
  const patch=(next:PersonBinding)=>setBindings?.(old=>({...old,[person!]:next}))
  const row=(id:string,label:string,sub:string,checked:boolean,onChange:(v:boolean)=>void)=>
    <label className="tray-option tray-switch-row" key={id}><span>{label}<small>{sub}</small></span><input type="checkbox" className="tray-switch" checked={checked} onChange={e=>onChange(e.target.checked)}/></label>
  return <div className="world-mcp-matrix">
    <section className="wm-col"><h4>世界书</h4>
      {worldEntries.length===0&&<p className="muted tray-empty">还没有世界书条目。</p>}
      {worldEntries.map(e=>row(e.id,e.title||'未命名条目',e.enabled?'已启用':'已停用',
        mode==='bind'&&person?isWorldEntryBound(e,person):isInPool(pool,'worldIds',e.id,worldAll),
        v=>{ if(mode==='bind'&&person) setWorldEntries(old=>toggleWorldEntryBinding(old,person,e.id,v)); else setChatPool?.(old=>togglePool(old,'worldIds',e.id,v,worldAll)) }))}
    </section>
    <section className="wm-col"><h4>MCP</h4>
      {mcp.error&&<p className="mcp-error">{mcp.error}</p>}
      {mineMine.length===0&&<p className="muted tray-empty">还没有 MCP 服务。</p>}
      {mineMine.map(c=>row(c.id,c.name,c.url,
        mode==='bind'&&person?mcpIds.includes(c.id):isInPool(pool,'mcpIds',c.id,mcpAll),
        v=>{ if(mode==='bind'&&person) patch(toggleMcpId(binding,c.id,v,mcpAll)); else setChatPool?.(old=>togglePool(old,'mcpIds',c.id,v,mcpAll)) }))}
    </section>
  </div>
}

// 聊天页齿轮：直接打开「世界书 / MCP」两栏设置（不再跳到模型那一页）。
function ChatBindPanel({person,displayName,worldEntries,setWorldEntries,bindings,setBindings,onClose}:{
  person:Person; displayName:(p:Person)=>string
  worldEntries:WorldEntry[]; setWorldEntries:React.Dispatch<React.SetStateAction<WorldEntry[]>>
  bindings:Record<Person,PersonBinding>; setBindings:React.Dispatch<React.SetStateAction<Record<Person,PersonBinding>>>
  onClose:()=>void
}) {
  useEffect(()=>{
    const un=pushBackHandler(()=>{onClose();return true})
    return un
  },[onClose])
  return <div className="chat-config-backdrop" onClick={onClose}>
    <section className="chat-config-panel" role="dialog" aria-label="当前助手的世界书与 MCP" onClick={e=>e.stopPropagation()}>
      <header className="chat-config-head"><div><b>{displayName(person)} · 世界书 / MCP</b><small>只影响这位助手，改动会自动保存</small></div><button type="button" onClick={onClose} aria-label="关闭设置"><IconClose size={15}/></button></header>
      <div className="chat-config-body">
        <WorldMcpMatrix mode="bind" person={person} worldEntries={worldEntries} setWorldEntries={setWorldEntries} bindings={bindings} setBindings={setBindings}/>
      </div>
    </section>
  </div>
}

function ResourceLibrary({ initialTab, only, tabs, worldEntries, setWorldEntries, modelProfiles, setModelProfiles, bindings, setBindings, displayName }: {
  initialTab?: 'model'|'world'|'mcp'; only?: 'model'|'world'|'mcp'
  // 只显示指定几个 tab（世界书 / MCP 合并页只留 world + mcp，不重复暴露模型预设）。
  tabs?: Array<'model'|'world'|'mcp'>
  worldEntries: WorldEntry[]; setWorldEntries: React.Dispatch<React.SetStateAction<WorldEntry[]>>
  modelProfiles: ModelProfile[]; setModelProfiles: React.Dispatch<React.SetStateAction<ModelProfile[]>>
  bindings: Record<Person,PersonBinding>; setBindings: React.Dispatch<React.SetStateAction<Record<Person,PersonBinding>>>
  displayName: (p: Person) => string
}) {
  // 直达某个 tab 靠父层给的 key 重新挂载，初始 state 直接取 initialTab，不必在 effect 里 setState。
  const allowedTabs = tabs && tabs.length ? tabs : (['model','world','mcp'] as const)
  const [tab, setTab] = useState<'model'|'world'|'mcp'>(initialTab&&allowedTabs.includes(initialTab)?initialTab:(only||allowedTabs[0]))
  const [draft, setDraft] = useState({ ...EMPTY_PROFILE })
  const [mcpDraft, setMcpDraft] = useState({ name: '', url: '', token: '', owner: 'all' })
  const [mcpBusy, setMcpBusy] = useState(false)
  // 已添加的服务收进一个下拉：默认只占一行，选中才展开详情与移除按钮。
  const [mcpCounts, setMcpCounts] = useState<Record<string, number | undefined>>({})
  const [mcpStatus, setMcpStatus] = useState<Record<string, 'ok' | 'fail'>>({})
  const mcpStatusLoadedRef = useRef<Set<string>>(new Set())
  const [mcpEdit, setMcpEdit] = useState<Array<{ id: string; person: Person }>>([])
  const [mcpTest, setMcpTest] = useState<{ busy: boolean; ok?: boolean; message: string }>({ busy: false, message: '' })
  const [mcpFormOpen, setMcpFormOpen] = useState(false)
  const [mcpShowToken, setMcpShowToken] = useState(false)
  const mcp = useMcpLibrary()
  // 同一服务会为每位助手各存一条连接，这里按「名称 + 地址」合成一张卡片。
  const mcpGroups = useMemo(() => {
    const map = new Map<string, { key: string; name: string; url: string; items: McpLibraryItem[] }>()
    for (const c of mcp.connections) {
      const key = c.name + '|' + c.url
      if (!map.has(key)) map.set(key, { key, name: c.name, url: c.url, items: [] })
      map.get(key)!.items.push(c)
    }
    return [...map.values()]
  }, [mcp.connections])
  // 列表不再展开：进入 MCP tab 时后台探一次工具数/连通状态，小横条也能显示。
  useEffect(() => {
    if (tab !== 'mcp') return
    let cancelled = false
    const load = async () => {
      const pending = mcpGroups.filter(group => !mcpStatusLoadedRef.current.has(group.key))
      for (const group of pending) mcpStatusLoadedRef.current.add(group.key)
      // 并行探测：4 个服务不用排队等，切到 MCP 页更快出状态。
      await Promise.all(pending.map(async group => {
        const connection = group.items[0]
        if (!connection) return
        try {
          const response = await apiFetch('/api/mcp/' + encodeURIComponent(connection.id) + '/tools', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ person: connection.person }),
          })
          const data = await response.json().catch(() => ({}))
          if (cancelled) return
          setMcpStatus(old => ({ ...old, [group.key]: response.ok ? 'ok' : 'fail' }))
          if (response.ok && Array.isArray(data.tools)) setMcpCounts(old => ({ ...old, [group.key]: data.tools.length }))
        } catch {
          if (!cancelled) setMcpStatus(old => ({ ...old, [group.key]: 'fail' }))
        }
      }))
    }
    void load()
    return () => { cancelled = true }
  }, [tab, mcpGroups])

  const saveProfile = (e: FormEvent) => {
    e.preventDefault()
    if (!draft.name.trim() || !draft.endpoint.trim() || !draft.model.trim()) return
    const next: ModelProfile = { ...draft, id: draft.id || crypto.randomUUID(), name: draft.name.trim(), endpoint: draft.endpoint.trim(), model: draft.model.trim() }
    setModelProfiles(old => draft.id ? old.map(p => p.id === draft.id ? next : p) : [next, ...old])
    setDraft({ ...EMPTY_PROFILE })
  }
  const removeProfile = (id: string) => {
    void confirmDialog({ title:'删除模型预设', message:'删除这套模型预设？已选用它的助手会回退到工作区里的旧模型配置。', confirmLabel:'删除', danger:true }).then(ok => {
      if (!ok) return
      setModelProfiles(old => old.filter(p => p.id !== id))
      setBindings(old => Object.fromEntries(ASSISTANT_PEOPLE.map(p => [p, old[p]?.modelProfileId === id ? { ...(old[p] || emptyBinding()), modelProfileId: '' } : (old[p] || emptyBinding())])) as Record<Person,PersonBinding>)
    })
  }
  const testMcp = async () => {
    setMcpTest({ busy: true, message: '正在连接…' })
    try {
      const r = await apiFetch('/api/mcp/test', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: mcpDraft.url, token: mcpDraft.token }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.ok) throw new Error(d.error || '连接失败')
      setMcpTest({ busy: false, ok: true, message: '已连通 · 工具 ' + d.count })
    } catch (err) { setMcpTest({ busy: false, ok: false, message: err instanceof Error ? err.message : '连接失败' }) }
  }
  const addMcp = async (e: FormEvent) => {
    e.preventDefault(); setMcpBusy(true); mcp.setError('')
    try {
      if (mcpEdit.length) {
        // 修改：逐个助手 PUT，id 不变，聊天里的绑定不失效
        for (const it of mcpEdit) {
          const r = await apiFetch('/api/mcp/' + encodeURIComponent(it.id), { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ person: it.person, name: mcpDraft.name, url: mcpDraft.url, token: mcpDraft.token }) })
          const d = await r.json().catch(() => ({}))
          if (!r.ok) throw new Error(d.error || '修改 MCP 失败')
        }
        setMcpEdit([])
      } else {
        // 不再选归属助手：一次为所有助手各建一条，聊天里再按助手开关
        for (const person of ASSISTANT_PEOPLE) {
          const r = await apiFetch('/api/mcp', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ person, name: mcpDraft.name, url: mcpDraft.url, transport: 'httpStream', token: mcpDraft.token }) })
          const d = await r.json().catch(() => ({}))
          if (!r.ok) throw new Error(d.error || '保存 MCP 失败')
        }
      }
      setMcpDraft({ name: '', url: '', token: '', owner: 'all' })
      setMcpTest({ busy: false, message: '' })
      setMcpFormOpen(false)
      await mcp.refresh()
    } catch (err) { mcp.setError(err instanceof Error ? err.message : String(err)) }
    finally { setMcpBusy(false) }
  }
  const startEditMcp = (g: { name: string; url: string; items: McpLibraryItem[] }) => {
    setMcpFormOpen(true)
    setMcpEdit(g.items.map((c) => ({ id: c.id, person: c.person })))
    setMcpDraft({ name: g.name, url: g.url, token: '', owner: 'all' })
    document.querySelector('.resource-form')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  const toggleGroupEnabled = async (g: { name: string; items: McpLibraryItem[] }, enabled: boolean) => {
    mcp.setError('')
    try {
      for (const item of g.items) {
        const response = await apiFetch('/api/mcp/' + encodeURIComponent(item.id), {
          method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ person: item.person, enabled }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || '更新 MCP 失败')
      }
      await mcp.refresh()
    } catch (error) {
      mcp.setError(error instanceof Error ? error.message : String(error))
    }
  }

  const removeMcp = async (g: { name: string; items: McpLibraryItem[] }) => {
    if (!(await confirmDialog({ title:'移除 MCP 服务', message:'移除「' + g.name + '」？所有助手上的这条服务都会删除。', confirmLabel:'移除', danger:true }))) return
    mcp.setError('')
    try {
      for (const c of g.items) {
        const r = await apiFetch('/api/mcp/' + c.id, { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ person: c.person }) })
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || '移除失败') }
      }
      await mcp.refresh()
    } catch (err) { mcp.setError(err instanceof Error ? err.message : String(err)) }
  }
  return <div className="resource-library">
    {!only&&<div className="library-filter-tabs resource-tabs">
      {([['model','模型预设'],['world','世界书'],['mcp','MCP 服务']] as const).filter(([key])=>allowedTabs.includes(key)).map(([key,label]) => <button type="button" key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}>{label}<small>{key==='model'?modelProfiles.length:key==='world'?worldEntries.length:mcpGroups.length}</small></button>)}
    </div>}
    <p className="resource-hint">{only==='world'?'世界书条目在这里增删，上面的勾选清单决定哪些能进聊天窗口。':only==='mcp'?'MCP 服务在这里添加或移除，上面的勾选清单决定哪些能进聊天窗口。':only==='model'?'把服务商的模型预设、接口地址加进来；默认供应商在「供应商 → 添加供应商」，聊天窗口只负责选用。':'世界书 / MCP 在这里配置；聊天里按助手开关。'}</p>
    {tab==='model' && <>
      <div className="resource-list">
        {modelProfiles.length===0 && <p className="muted">还没有模型预设。添加一套后，聊天窗口里所有助手都能直接选用。</p>}
        {modelProfiles.map(p => <article className="resource-row" key={p.id}><div><b>{p.name}</b><small>{p.model} · {p.endpoint}</small><small>使用者：{ASSISTANT_PEOPLE.filter(x=>bindings[x]?.modelProfileId===p.id).map(displayName).join('、')||'暂未分配（聊天窗口可选用）'}</small></div><div className="resource-row-actions"><button type="button" onClick={()=>setDraft({...p})}>编辑</button><button type="button" className="resource-remove" onClick={()=>removeProfile(p.id)}>删除</button></div></article>)}
      </div>
      <form className="resource-form" onSubmit={saveProfile}><h4>{draft.id?'编辑模型预设':'新增模型预设'}</h4>
        <label>预设名称<input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="例如：日常聊天 · 便宜档" required/></label>
        <label>API 地址<input value={draft.endpoint} onChange={e=>setDraft({...draft,endpoint:e.target.value})} placeholder="https://你的中转站/v1" required/></label>
        <label>模型名称<input value={draft.model} onChange={e=>setDraft({...draft,model:e.target.value})} placeholder="例如 gpt-4o-mini" required/></label>
        <div className="resource-form-actions"><button type="submit">{draft.id?'保存修改':'添加预设'}</button>{draft.id&&<button type="button" onClick={()=>setDraft({...EMPTY_PROFILE})}>取消编辑</button>}</div>
        <small>价格与汇率不用填。API Key 在「供应商 → 订阅账号」按助手填写，或填在供应商卡片的多 KEY 里；只存本机，不上传云端快照。</small>
      </form>
    </>}
    {tab==='world' && <div className="resource-world"><WorldbookEditor entries={worldEntries} onChange={setWorldEntries} personLabel={displayName}/></div>}
    {tab==='mcp' && <>
      {mcpFormOpen ? <>
        <div className="worldbook-form-head"><button type="button" className="worldbook-back" onClick={() => { setMcpFormOpen(false); setMcpEdit([]); setMcpDraft({ name: '', url: '', token: '', owner: 'all' }); setMcpTest({ busy: false, message: '' }) }}><IconBack className="ui-icon-inline" size={14}/> 返回</button><b>{mcpEdit.length ? '编辑 MCP 服务' : '新增 MCP 服务'}</b></div>
        <form className="resource-form" onSubmit={addMcp}>
          <label>服务名称<input value={mcpDraft.name} onChange={e=>setMcpDraft({...mcpDraft,name:e.target.value})} placeholder="例如：记事本服务" required/></label>
          <label>主机地址<input value={mcpDraft.url} onChange={e=>setMcpDraft({...mcpDraft,url:e.target.value})} placeholder="https://example.com/mcp" type="url" required/></label>
          <label>Token（可选）<span className="mcp-token-field"><input value={mcpDraft.token} onChange={e=>setMcpDraft({...mcpDraft,token:e.target.value})} type={mcpShowToken ? "text" : "password"} autoComplete="new-password" placeholder={mcpEdit.length?'留空表示不修改':'需要鉴权时再填'}/><button type="button" className="mcp-token-eye" aria-label={mcpShowToken?'隐藏 Token':'显示 Token'} onClick={()=>setMcpShowToken(v=>!v)}>{mcpShowToken?'隐藏':'显示'}</button></span></label>
          <div className="resource-form-actions"><button type="submit" disabled={mcpBusy}>{mcpBusy?'正在保存…':(mcpEdit.length?'保存修改':'添加服务')}</button><button type="button" className="ghost" disabled={mcpBusy||mcpTest.busy||!mcpDraft.url.trim()} onClick={()=>void testMcp()}>{mcpTest.busy?'测试中…':'测试链接'}</button></div>
          {mcpTest.message&&<small className={'mcp-test'+(mcpTest.ok===false?' bad':mcpTest.ok?' ok':'')}>{mcpTest.ok?<IconCheck className="ui-icon-inline" size={13}/>:<IconClose className="ui-icon-inline" size={13}/>} {mcpTest.message}</small>}
          <small>添加后所有助手都可用；到聊天窗口的「世界书 / MCP」里再按助手打开或关闭。</small>
        </form>
      </> : <>
        <div className="mcp-list-head"><button type="button" className="worldbook-add-btn" onClick={() => { setMcpFormOpen(true); setMcpEdit([]); setMcpDraft({ name: '', url: '', token: '', owner: 'all' }); setMcpTest({ busy: false, message: '' }) }}><IconPlus className="ui-icon-inline" size={14}/> 添加 MCP 服务</button></div>
        <div className="mcp-tool-picker">
          {mcp.error && <p className="mcp-error">{mcp.error}</p>}
          {mcpGroups.length === 0 && <p className="muted mcp-empty">还没有 MCP 服务，点上面的按钮添加。</p>}
          {mcpGroups.map((g) => {
            const count = mcpCounts[g.key]
            const status = mcpStatus[g.key]
            const enabled = g.items.every((c) => c.enabled !== false)
            const host = (() => { try { return new URL(g.url).hostname } catch { return g.url } })()
            return <article className="mcp-card mcp-card-row" key={g.key}>
              <span className="mcp-card-main"><b>{g.name}</b><small>{count === undefined ? '工具 —' : '工具 ' + count + '/' + count} · {host}</small></span>
              <span className={'mcp-card-status' + (status === 'ok' ? ' ok' : status === 'fail' ? ' bad' : '')}>{status === 'ok' ? '已连通' : status === 'fail' ? '未连通' : '未测试'}</span>
              <label className="mcp-card-enable"><span>{enabled ? '启用' : '停用'}</span><input type="checkbox" className="tray-switch mcp-card-switch" checked={enabled} aria-label={enabled ? '停用这个 MCP' : '启用这个 MCP'} onChange={(e) => void toggleGroupEnabled(g, e.target.checked)}/></label>
              <button type="button" className="mcp-card-edit" aria-label={'编辑 ' + g.name} title="编辑" onClick={() => startEditMcp(g)}><IconEdit size={14}/></button>
              <button type="button" className="mcp-card-delete" aria-label={'删除 ' + g.name} title="删除" onClick={() => void removeMcp(g)}><IconClose size={15}/></button>
            </article>
          })}
        </div>
      </>}
    </>}
  </div>
}

// 聊天窗口的配置抽屉：只决定「当前助手」用哪套模型、哪几条世界书、哪几个 MCP。
function ApiBaseSettings({ onApplied }: { onApplied?: () => void } = {}) {
  const buildBase = (import.meta as any).env?.VITE_API_BASE_URL ?? ''
  const [draft, setDraft] = useState(() => { try { return localStorage.getItem(API_BASE_STORAGE_KEY) || '' } catch { return '' } })
  const [note, setNote] = useState('')
  const apply = () => {
    try {
      const normalized = normalizeApiBase(draft)
      if (!normalized) localStorage.removeItem(API_BASE_STORAGE_KEY)
      else localStorage.setItem(API_BASE_STORAGE_KEY, normalized)
      setDraft(normalized)
      setApiBase(resolveApiBase({ override: normalized, buildBase }))
      setNote(normalized ? '已生效：已切换到云同步模式，后续请求将发往 ' + normalized : '已切回本地模式：数据只保存在本机')
    } catch { setNote('保存失败：浏览器存储不可用') }
    // 通知宿主重查登录态（Android 跨源换地址即时生效，无需重启 App）。
    onApplied?.()
  }
  const reset = () => {
    try { localStorage.removeItem(API_BASE_STORAGE_KEY) } catch { /* 忽略 */ }
    setDraft(''); setApiBase(resolveApiBase({ buildBase })); setNote('已切回本地模式：数据只保存在本机')
  }
  return <div className="setting-card settings-inner-card"><b>云同步服务器地址（可选）</b><p className="muted">默认是本地模式：聊天与设置只保存在这台设备，开箱即用。填写后端地址（如 https://你的域名）并保存 = 开启云同步（登录后快照与 API Key 同步到该服务器）；清空并保存 = 切回本地模式。</p><input className="memory-search" value={draft} onChange={e=>{setDraft(e.target.value);setNote('')}} placeholder="https://example.com" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false}/><div className="settings-shortcuts"><button type="button" onClick={apply}>保存地址</button><button type="button" onClick={reset}>切回本地模式</button></div>{note&&<p className="muted" role="status">{note}</p>}</div>
}

