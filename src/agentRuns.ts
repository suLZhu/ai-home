// Frontend binding for server-side agent runs.
//
// The server owns the truth (agent_runs + tool_call_logs); this module only
// mirrors it: it opens one shared SSE stream to /api/agent/events, keeps a
// bounded in-memory list per assistant, and exposes React hooks. Every SSE
// delta triggers a refetch of the affected run — the stream is a hint, the
// REST response is the state — so a dropped connection degrades to the
// existing polling instead of freezing cards.
import { useEffect, useState } from 'react'
import { apiFetch, apiUrl, getSessionToken } from './apiBase.mjs'

export type AgentRunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timed_out'

export type AgentRun = {
  id: string
  assistantId: string
  source: string
  conversationId: string
  prompt: string
  answer: string
  rounds: number
  toolCalls: number
  status: AgentRunStatus
  errorCode?: string | null
  errorMessage?: string | null
  usage: { promptTokens?: number; completionTokens?: number; cachedTokens?: number; calls?: number }
  model: string
  createdAt: string
  updatedAt: string
  finishedAt?: string | null
}

export type AgentEvent = {
  type: string
  at: string
  runId?: string
  assistantId?: string
  person?: string
  status?: string
  round?: number
  tool?: string
  logId?: string
}

const ACTIVE: ReadonlySet<AgentRunStatus> = new Set(['running'])
export const isRunActive = (status: AgentRunStatus) => ACTIVE.has(status)

export const RUN_STATUS_LABEL: Record<AgentRunStatus, string> = {
  running: '执行中', succeeded: '已完成', failed: '失败', cancelled: '已取消', timed_out: '已超时',
}
export const RUN_SOURCE_LABEL: Record<string, string> = {
  manual: '手动', scheduled: '定时', proactive: '主动', chat: '聊天',
}

// ------------------------------------------------------------------ SSE 共享流

const listeners = new Set<(event: AgentEvent) => void>()
let source: EventSource | null = null
let refCount = 0

function dispatch(raw: string) {
  let event: AgentEvent
  try { event = JSON.parse(raw) } catch { return }
  if (!event || typeof event.type !== 'string') return
  for (const listener of [...listeners]) {
    try { listener(event) } catch { /* 单个订阅者异常不影响其他订阅 */ }
  }
}

// 订阅一次共享连接；最后一个订阅者离开时关闭（避免看板卸载后仍挂长连接）。
export function subscribeAgentEvents(listener: (event: AgentEvent) => void): () => void {
  listeners.add(listener)
  refCount++
  if (!source) {
    try {
      // EventSource 无法设置 Authorization 头：跨源（Android 局域网）时凭证走 ?token= 查询参数，
      // 同源（Web）时 token 留空、继续走 Cookie。
      const eventsUrl = apiUrl('/api/agent/events')
      const token = getSessionToken()
      const withToken = token ? eventsUrl + (eventsUrl.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token) : eventsUrl
      source = new EventSource(withToken, { withCredentials: true })
      const types = ['run_created', 'run_finished', 'round_started', 'tool_started', 'tool_awaiting', 'tool_finished', 'approval_decided']
      for (const type of types) source.addEventListener(type, e => dispatch((e as MessageEvent<string>).data))
      source.onmessage = e => dispatch((e as MessageEvent<string>).data)
      // 断线由 EventSource 自动重连；重连后服务端会补发最近事件缓冲。
      source.onerror = () => { /* 交给浏览器重连策略 */ }
    } catch { source = null }
  }
  return () => {
    listeners.delete(listener)
    refCount--
    if (refCount <= 0 && source) { source.close(); source = null; refCount = 0 }
  }
}

// ------------------------------------------------------------------ REST 拉取

async function getJson(url: string, init?: RequestInit) {
  const response = await apiFetch(url, { credentials: 'include', ...init })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error((data as { error?: string }).error || '请求失败')
  return data as Record<string, any>
}

export async function fetchRuns(person: string, limit = 30): Promise<AgentRun[]> {
  const data = await getJson(`/api/agent/runs?person=${encodeURIComponent(person)}&limit=${limit}`)
  return Array.isArray(data.runs) ? data.runs : []
}

export async function fetchRunDetail(runId: string): Promise<{ run: AgentRun; logs: any[] }> {
  const data = await getJson('/api/agent/runs/' + encodeURIComponent(runId))
  return { run: data.run, logs: Array.isArray(data.logs) ? data.logs : [] }
}

export async function startRun(person: string, prompt: string, source = 'manual'): Promise<AgentRun> {
  const data = await getJson('/api/agent/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ person, prompt, source }),
  })
  return data.run as AgentRun
}

export async function cancelRun(runId: string): Promise<void> {
  await getJson('/api/agent/runs/' + encodeURIComponent(runId) + '/cancel', { method: 'POST' })
}

// ------------------------------------------------------------------ 审批（policy=ask）

export type Approval = {
  logId: string
  runId: string
  tool: string
  serverName: string
  arguments: unknown
  startedAt: string
  conversationId: string
  pending: boolean // false = 服务重启后失效，只能清理不能执行
}

export async function fetchApprovals(person: string): Promise<Approval[]> {
  const data = await getJson('/api/agent/approvals?person=' + encodeURIComponent(person))
  return Array.isArray(data.approvals) ? data.approvals : []
}

export async function decideApproval(logId: string, decision: 'approve' | 'reject'): Promise<string> {
  const data = await getJson('/api/agent/approvals/' + encodeURIComponent(logId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision }),
  })
  return String(data.decision || '')
}

// 待审批列表：挂载即拉，SSE 的 tool_awaiting / approval_decided 事件触发刷新。
export function useApprovals(person: string): { approvals: Approval[]; refresh: () => void } {
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    queueMicrotask(() => {
      if (!alive) return
      fetchApprovals(person)
        .then(list => { if (alive) setApprovals(list) })
        .catch(() => { /* 审批列表失败不打断看板 */ })
    })
    return () => { alive = false }
  }, [person, tick])

  useEffect(() => {
    let timer = 0
    let disposed = false
    const unsubscribe = subscribeAgentEvents(event => {
      if (event.type !== 'tool_awaiting' && event.type !== 'approval_decided' && event.type !== 'tool_finished') return
      if (event.person && event.person !== person) return
      if (disposed || timer) return
      timer = window.setTimeout(() => { timer = 0; if (!disposed) setTick(n => n + 1) }, 300)
    })
    return () => { disposed = true; if (timer) window.clearTimeout(timer); unsubscribe() }
  }, [person])

  return { approvals, refresh: () => setTick(n => n + 1) }
}

// ------------------------------------------------------------------ React hooks

// 订阅某助手的运行列表。挂载即拉全量，SSE 事件只做“有变化→重拉”的节流提示。
export function useAgentRuns(person: string): { runs: AgentRun[]; error: string; refresh: () => void } {
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    queueMicrotask(() => {
      if (!alive) return
      fetchRuns(person)
        .then(list => { if (alive) { setRuns(list); setError('') } })
        .catch(e => { if (alive) setError(e instanceof Error ? e.message : '读取运行记录失败') })
    })
    return () => { alive = false }
  }, [person, tick])

  useEffect(() => {
    let timer = 0
    let disposed = false
    const unsubscribe = subscribeAgentEvents(event => {
      // 只关心当前助手的事件；节流 400ms 合并连续事件，避免每个工具事件都打一次 REST。
      if (event.assistantId && event.assistantId !== person) return
      if (disposed || timer) return
      timer = window.setTimeout(() => { timer = 0; if (!disposed) setTick(n => n + 1) }, 400)
    })
    return () => { disposed = true; if (timer) window.clearTimeout(timer); unsubscribe() }
  }, [person])

  return { runs, error, refresh: () => setTick(n => n + 1) }
}

// 展开单个运行时拉详情（工具时间线 + 答案）。
export function useAgentRunDetail(runId: string | null): { logs: any[]; loading: boolean } {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!runId) { queueMicrotask(() => setLogs([])); return }
    let alive = true
    queueMicrotask(() => { if (alive) setLoading(true) })
    fetchRunDetail(runId)
      .then(detail => { if (alive) setLogs(detail.logs) })
      .catch(() => { /* 详情失败不打断列表 */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [runId])

  // 运行期间详情也要跟着 SSE 走：runId 变化（新事件触发的重拉）由调用方控制，
  // 这里只负责拉取与清理。
  return { logs, loading }
}
