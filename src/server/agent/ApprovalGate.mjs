// In-process approval gate for policy=ask tool calls.
//
// When a run hits an `ask` tool, ToolExecutor parks here and the run stays
// `running` until the user decides (or a timeout fires). Decisions arrive via
// POST /api/agent/approvals/:logId. The resolver map lives in memory on
// purpose: a restarted server has no resolvers left, so stale parked logs are
// visible as `pending: false` and can only be cleaned up, never executed —
// approval must never be replayable from a dead process.
const PENDING = new Map() // logId -> { runId, person, tool, resolve, timer }

export const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000
export const DECISIONS = ['approve', 'reject']

// Resolves to 'approved' | 'rejected' | 'timeout' | 'aborted'.
export function awaitApproval({ logId, runId, person, tool, signal, timeoutMs = APPROVAL_TIMEOUT_MS }) {
  return new Promise(resolve => {
    const settle = result => {
      const entry = PENDING.get(logId)
      if (!entry) return
      PENDING.delete(logId)
      clearTimeout(entry.timer)
      signal?.removeEventListener('abort', onAbort)
      entry.resolve(result)
    }
    const onAbort = () => settle('aborted')
    const entry = {
      runId, person, tool,
      resolve,
      timer: setTimeout(() => settle('timeout'), timeoutMs),
    }
    PENDING.set(logId, entry)
    if (signal) {
      if (signal.aborted) settle('aborted')
      else signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

// Called by the HTTP endpoint. Returns:
//   'approved' / 'rejected' — a live waiter was resolved
//   'stale'                 — no waiter (restart/timeout); caller may only clean up
export function decideApproval(logId, decision) {
  const key = String(logId || '')
  const entry = PENDING.get(key)
  if (!entry) return 'stale'
  PENDING.delete(key)
  clearTimeout(entry.timer)
  const result = decision === 'approve' ? 'approved' : 'rejected'
  entry.resolve(result)
  return result
}

export function isPending(logId) { return PENDING.has(String(logId || '')) }

// Snapshot for the approvals endpoint: only live waiters are actionable.
export function pendingList() {
  return [...PENDING.entries()].map(([logId, entry]) => ({
    logId, runId: entry.runId, person: entry.person, tool: entry.tool,
  }))
}
