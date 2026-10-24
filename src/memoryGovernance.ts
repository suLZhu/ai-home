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

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...init })
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
