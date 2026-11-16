// Client for the server-side memory governance store (lifecycle records +
// Recall Ledger). Candidate memories wait here for a human decision; the
// chat prompt never sees them until they are confirmed active.
import { useCallback, useEffect, useRef, useState } from 'react'

export type MemoryLifecycle = 'candidate' | 'active' | 'archived' | 'rejected'
export type MemoryScope = 'world' | 'private' | 'ops'

export type MemoryRecord = {
  id: string
  person: string
  scope: MemoryScope
  lifecycle: MemoryLifecycle
  title: string
  content: string
  keywords: string
  category: string
  sourceConversationId: string
  sourceMessageIds: string[]
  createdBy: 'model' | 'user' | 'system'
  recallCount: number
  createdAt: string
  updatedAt: string
}

export const LIFECYCLE_LABEL: Record<MemoryLifecycle, string> = {
  candidate: '候选 · 待确认', active: '已生效', archived: '已归档', rejected: '已拒绝（墓碑）',
}
export const SCOPE_LABEL: Record<MemoryScope, string> = {
  world: '世界观', private: '私密', ops: '事务',
}

import { apiFetch } from './apiBase.mjs'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(url, { credentials: 'include', ...init })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || '请求失败（HTTP ' + response.status + '）')
  return data as T
}

export function fetchMemoryRecords(person: string, lifecycle?: MemoryLifecycle) {
  const params = new URLSearchParams({ person })
  if (lifecycle) params.set('lifecycle', lifecycle)
  return request<{ records: MemoryRecord[] }>('/api/memory/records?' + params.toString())
    .then(d => (Array.isArray(d.records) ? d.records : []))
}

export function transitionMemoryRecord(id: string, lifecycle: MemoryLifecycle) {
  return request<{ record: MemoryRecord }>('/api/memory/records/' + id + '/transition', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lifecycle }),
  }).then(d => d.record)
}

export function createMemoryRecord(person: string, input: { title: string; content: string; keywords?: string; category?: string; scope?: MemoryScope }) {
  return request<{ record: MemoryRecord; duplicate: boolean }>('/api/memory/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ person, ...input }),
  })
}

// Polling hook (8s). SSE tool events don't cover memory transitions yet, so a
// light interval keeps the panel honest without hammering the API.
export function useMemoryRecords(person: string) {
  const [records, setRecords] = useState<MemoryRecord[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const aliveRef = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const list = await fetchMemoryRecords(person)
      if (!aliveRef.current) return
      setRecords(list)
      setError('')
    } catch (e) {
      if (!aliveRef.current) return
      setError(e instanceof Error ? e.message : '读取记忆记录失败')
    } finally { if (aliveRef.current) setLoading(false) }
  }, [person])

  useEffect(() => {
    aliveRef.current = true
    queueMicrotask(() => { if (aliveRef.current) void refresh() })
    return () => { aliveRef.current = false }
  }, [refresh])

  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) void refresh() }, 8000)
    return () => window.clearInterval(timer)
  }, [refresh])

  return { records, error, loading, refresh }
}

// ── 自动整理 ────────────────────────────────────────────────
// 服务端每 5 分钟按「轮数 / 字数 / 天数」任一满足触发一次整理；整理结果同样
// 只进候选区。这里只负责读状态、存策略、手动触发，规则全在服务端。
export type AutoTriggerReason = 'disabled' | 'no_new_messages' | 'messages' | 'chars' | 'days' | 'below_threshold'

export type AutoOrganizeStatus = {
  person: string
  enabled: boolean
  minMessages: number
  minChars: number
  minDays: number
  // 整理完是否把这一轮候选直接转正；rules 是用户写的整理规则，原样进提示词。
  autoConfirm: boolean
  rules: string
  lastRunAt: string | null
  pendingMessages: number
  pendingChars: number
  daysSinceLast: number
  triggerReason: AutoTriggerReason
  runningRunId: string | null
  lastRun: { id: string; status: string; finishedAt: string | null; error: string } | null
}

export function fetchAutoOrganize(person: string) {
  return request<AutoOrganizeStatus>('/api/memory/auto-config?person=' + encodeURIComponent(person))
}

export function saveAutoOrganize(person: string, patch: { enabled?: boolean; minMessages?: number; minChars?: number; minDays?: number; autoConfirm?: boolean; rules?: string }) {
  // PUT 只回显策略字段（不重新统计待整理量），保存后用 apply() 合并回状态。
  return request<Pick<AutoOrganizeStatus, 'enabled' | 'minMessages' | 'minChars' | 'minDays' | 'autoConfirm' | 'rules' | 'lastRunAt'>>('/api/memory/auto-config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ person, ...patch }),
  })
}

export function runAutoOrganize(person: string) {
  return request<{ ok: boolean; runId?: string; messages?: number; chars?: number }>('/api/memory/auto-config/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ person }),
  })
}

export function useAutoOrganize(person: string) {
  const [status, setStatus] = useState<AutoOrganizeStatus | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const aliveRef = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const next = await fetchAutoOrganize(person)
      if (!aliveRef.current) return
      setStatus(next)
      setError('')
    } catch (e) {
      if (!aliveRef.current) return
      setError(e instanceof Error ? e.message : '读取自动整理状态失败')
    } finally { if (aliveRef.current) setLoading(false) }
  }, [person])

  useEffect(() => {
    aliveRef.current = true
    queueMicrotask(() => { if (aliveRef.current) void refresh() })
    return () => { aliveRef.current = false }
  }, [refresh])

  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) void refresh() }, 8000)
    return () => window.clearInterval(timer)
  }, [refresh])

  // 保存成功后把服务端归一化的值合并进状态，界面立即一致，不必等下一次轮询。
  const apply = useCallback((patch: Partial<AutoOrganizeStatus>) => {
    setStatus(old => old ? { ...old, ...patch } : old)
  }, [])

  return { status, error, loading, refresh, apply }
}
