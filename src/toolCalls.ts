// Unified tool-call event layer for the chat UI.
//
// Every event published here originates from a REAL execution site (the tool
// loop inside App.tsx send()). Model-generated prose never enters this bus.
// The layer owns three things:
//   1. one state machine shared with the server (see src/toolLog.mjs):
//      queued -> awaiting_confirmation -> running -> succeeded|failed|cancelled|timed_out
//   2. idempotent, order-insensitive publishing (eventId dedupe + transition guard)
//   3. two-way persistence: server SQLite rows (source of truth) + a bounded
//      localStorage cache so cards survive a refresh before the server answers.
import { useEffect, useState } from 'react'

export type ToolCallStatus = 'queued' | 'awaiting_confirmation' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timed_out'
export type ToolCallSource = 'mcp' | 'worldbook' | 'ledger' | 'workflow'

export type ToolCallRecord = {
  key: string            // client key: runId + ':' + tool_call id；同一调用的所有事件共用
  id: string | null      // 服务端记录 id（POST 成功后回填）
  eventId: string        // 幂等键：同一事件重复发布/重试 POST 不会产生第二行
  runId: string          // 一次 send() 生成一个；用于把整轮工具调用绑在一起
  conversationId: string // 绑定会话，刷新后按会话恢复卡片
  messageId: string      // 绑定承载这些调用的助手消息
  person: string
  source: ToolCallSource
  toolName: string       // 原始注册名（mcp_xxx_tool / worldbook_create_entry …）
  serverName: string     // MCP 服务名；本地工具为空串
  displayName: string    // 面向用户的名字，见 toolDisplayName()
  status: ToolCallStatus
  arguments: unknown
  resultSummary: unknown
  errorMessage?: string
  errorCode?: string
  startedAt: string
  finishedAt?: string
  durationMs?: number
}

const TERMINAL: ReadonlySet<ToolCallStatus> = new Set(['succeeded', 'failed', 'cancelled', 'timed_out'])
const ALLOWED_TRANSITIONS: Record<ToolCallStatus, ToolCallStatus[]> = {
  queued: ['awaiting_confirmation', 'running', 'cancelled', 'timed_out', 'failed'],
  awaiting_confirmation: ['running', 'cancelled', 'timed_out', 'failed'],
  running: ['succeeded', 'failed', 'cancelled', 'timed_out'],
  succeeded: [], failed: [], cancelled: [], timed_out: [],
}

// 显示名映射：本地工具用固定中文名；MCP 用「服务名 · 工具名」；
// 未配置服务名时回退为「工具名」。
const LOCAL_TOOL_NAMES: Record<string, string> = {
  ledger_add_entry: '共享记账单 · 记一笔',
  worldbook_create_entry: '世界书 · 新增条目',
  worldbook_search_entries: '世界书 · 搜索条目',
  worldbook_update_entry: '世界书 · 更新条目',
  scheduled_task_list: '定时任务 · 查看列表',
  scheduled_task_create: '定时任务 · 创建',
  scheduled_task_manage: '定时任务 · 管理',
}
export function toolDisplayName(source: ToolCallSource, serverName: string, toolName: string): string {
  void source // 本地/MCP 的区分已由 toolName 与 serverName 表达；保留参数便于后续按来源定制。
  if (LOCAL_TOOL_NAMES[toolName]) return LOCAL_TOOL_NAMES[toolName]
  if (serverName) return serverName + ' · ' + toolName
  return toolName
}

export const TOOL_STATUS_LABEL: Record<ToolCallStatus, string> = {
  queued: '排队中',
  awaiting_confirmation: '等待确认',
  running: '执行中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
  timed_out: '已超时',
}

// 把真实抛出的异常归类成简短错误码，方便卡片与看板过滤。
export function classifyToolError(message: string): string {
  if (/没有绑定到当前人物/.test(message)) return 'BOUND_REJECTED'
  if (/不是合法 JSON|必须是 JSON 对象/.test(message)) return 'BAD_ARGUMENTS'
  if (/新增世界书条目需要标题和内容/.test(message)) return 'MISSING_FIELDS'
  if (/找不到属于当前助手的条目/.test(message)) return 'NOT_FOUND'
  if (/HTTP \d{3}/.test(message)) return 'UPSTREAM_HTTP'
  if (/工具调用轮数达到安全上限/.test(message)) return 'ROUND_LIMIT'
  return 'TOOL_EXCEPTION'
}

// ---------------------------------------------------------------- 事件总线

const records = new Map<string, ToolCallRecord>()
const listeners = new Set<() => void>()
const CACHE_KEY = 'ai-home.toolCalls.v1'
const MAX_CACHE_RECORDS = 200
const STALE_RUNNING_MS = 10 * 60 * 1000

function emit() { for (const listener of listeners) listener() }

function snapshot(conversationId?: string): ToolCallRecord[] {
  const list = [...records.values()].filter(r => !conversationId || r.conversationId === conversationId)
  list.sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0))
  return list
}

function persistCache() {
  try {
    const list = [...records.values()].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).slice(0, MAX_CACHE_RECORDS)
    localStorage.setItem(CACHE_KEY, JSON.stringify(list))
  } catch { /* 存储满/隐私模式：缓存失败不影响聊天 */ }
}

// 刷新恢复：先读本地缓存立即出卡片，再向服务端对齐（服务端为准）。
function hydrateFromCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]')
    if (!Array.isArray(raw)) return
    const now = Date.now()
    for (const item of raw) {
      if (!item || typeof item.key !== 'string' || records.has(item.key)) continue
      const rawStatus: string = typeof item.status === 'string' ? item.status : ''
      const status: ToolCallStatus = (rawStatus in ALLOWED_TRANSITIONS ? rawStatus : 'timed_out') as ToolCallStatus
      // 页面关闭后没人再补事件：超过 10 分钟的进行中记录直接按超时展示。
      const stuck = !TERMINAL.has(status) && now - Date.parse(item.startedAt || 0) > STALE_RUNNING_MS
      records.set(item.key, { ...item, status: stuck ? 'timed_out' : status })
    }
  } catch { /* 缓存损坏则忽略 */ }
}
hydrateFromCache()

export function subscribeToolCalls(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

// ---------------------------------------------------------------- 上报入口

export type ToolCallStartInput = {
  runId: string
  conversationId: string
  messageId: string
  person: string
  source: ToolCallSource
  toolName: string
  serverName?: string
  arguments: unknown
  eventId?: string
}

// 在真实调用点同步登记一次工具调用（status: running）。返回本地 key，
// 完成时用它收尾。上报失败绝不抛出，聊天流程优先。
export function reportToolCallStart(input: ToolCallStartInput): string {
  // eventId 就是本地 key：同一逻辑调用的所有重试/重复发布共享一行记录。
  const eventId = input.eventId || crypto.randomUUID()
  const key = eventId
  const now = new Date().toISOString()
  const record: ToolCallRecord = {
    key,
    id: null,
    eventId,
    runId: input.runId,
    conversationId: input.conversationId,
    messageId: input.messageId,
    person: input.person,
    source: input.source,
    toolName: input.toolName,
    serverName: input.serverName || '',
    displayName: toolDisplayName(input.source, input.serverName || '', input.toolName),
    status: 'running',
    arguments: input.arguments,
    resultSummary: null,
    startedAt: now,
  }
  records.set(key, record)
  emit()
  persistCache()
  void pushCreate(record)
  return key
}

export type ToolCallEndInput = {
  status: 'succeeded' | 'failed' | 'cancelled' | 'timed_out'
  resultSummary?: unknown
  errorMessage?: string
  errorCode?: string
}

// 收尾一次调用。重复调用（重试/竞态）是幂等 no-op：终态不再变化。
export function reportToolCallEnd(key: string, input: ToolCallEndInput): void {
  const record = records.get(key)
  if (!record) return
  if (TERMINAL.has(record.status)) return
  if (!ALLOWED_TRANSITIONS[record.status].includes(input.status)) return
  const finishedAt = new Date().toISOString()
  const next: ToolCallRecord = {
    ...record,
    status: input.status,
    resultSummary: input.resultSummary ?? null,
    errorMessage: input.errorMessage,
    errorCode: input.errorCode,
    finishedAt,
    durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(record.startedAt)),
  }
  records.set(key, next)
  emit()
  persistCache()
  void pushTransition(next)
}

// ---------------------------------------------------------------- 服务端同步

async function pushCreate(record: ToolCallRecord) {
  try {
    const response = await fetch('/api/tool-logs', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        person: record.person,
        source: record.source,
        toolName: record.toolName,
        serverName: record.serverName,
        arguments: record.arguments,
        status: record.status,
        eventId: record.eventId,
        runId: record.runId,
        conversationId: record.conversationId,
        messageId: record.messageId,
      }),
    })
    if (!response.ok) return
    const data = await response.json()
    if (typeof data.id !== 'string') return
    const current = records.get(record.key)
    if (!current || current.id) return
    records.set(record.key, { ...current, id: data.id })
    persistCache()
    // POST 在状态推进之后才返回：补一次当前状态，避免服务端停在 running。
    if (current.status !== 'running') void pushTransition({ ...current, id: data.id })
  } catch { /* 同步失败不影响聊天；看板少一行而已 */ }
}

async function pushTransition(record: ToolCallRecord) {
  if (!record.id) return
  try {
    await fetch('/api/tool-logs/' + record.id, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: record.status,
        resultSummary: record.resultSummary,
        errorMessage: record.errorMessage,
        errorCode: record.errorCode,
      }),
    })
  } catch { /* 同步失败不影响聊天 */ }
}

// 刷新/切会话后从服务端拉取该会话的真实记录，覆盖本地缓存里的旧状态。
export async function restoreToolCalls(conversationId: string): Promise<void> {
  if (!conversationId) return
  try {
    const response = await fetch('/api/tool-logs?conversationId=' + encodeURIComponent(conversationId) + '&limit=200', { credentials: 'same-origin' })
    if (!response.ok) return
    const data = await response.json()
    const rows: any[] = Array.isArray(data.logs) ? data.logs : []
    for (const row of rows) {
      const runId = typeof row.runId === 'string' && row.runId ? row.runId : 'server'
      const key = runId + ':' + (row.eventId || row.id)
      const record: ToolCallRecord = {
        key,
        id: row.id,
        eventId: row.eventId || row.id,
        runId,
        conversationId: row.conversationId || conversationId,
        messageId: row.messageId || '',
        person: row.person,
        source: row.source,
        toolName: row.toolName,
        serverName: row.serverName || '',
        displayName: toolDisplayName(row.source, row.serverName || '', row.toolName),
        status: (typeof row.status === 'string' && row.status in ALLOWED_TRANSITIONS ? row.status : 'timed_out') as ToolCallStatus,
        arguments: row.arguments,
        resultSummary: row.resultSummary,
        errorMessage: row.errorMessage || undefined,
        errorCode: row.errorCode || undefined,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt || undefined,
        durationMs: row.durationMs ?? undefined,
      }
      const local = records.get(key)
      // 本地已是终态且服务端还在进行中：信本地（可能刚收尾、PUT 还在路上）。
      if (local && TERMINAL.has(local.status) && !TERMINAL.has(record.status)) continue
      records.set(key, record)
    }
    emit()
    persistCache()
  } catch { /* 离线时继续用本地缓存 */ }
}

// ---------------------------------------------------------------- React 绑定

// 订阅某会话的工具调用记录；挂载时先出缓存卡片，再向服务端对齐。
export function useToolCalls(conversationId: string): ToolCallRecord[] {
  const [list, setList] = useState<ToolCallRecord[]>(() => snapshot(conversationId))
  useEffect(() => {
    const update = () => setList(snapshot(conversationId))
    update()
    const unsubscribe = subscribeToolCalls(update)
    void restoreToolCalls(conversationId)
    return unsubscribe
  }, [conversationId])
  return list
}

// 供消息卡片按 messageId 取自己的调用。
export function useMessageToolCalls(messageId: string): ToolCallRecord[] {
  const [list, setList] = useState<ToolCallRecord[]>([])
  useEffect(() => {
    const update = () => setList(snapshot().filter(r => r.messageId === messageId))
    update()
    return subscribeToolCalls(update)
  }, [messageId])
  return list
}
