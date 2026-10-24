// Scheduled-task pickup: turns due rows in scheduled_tasks into real agent
// runs. The 15s interval in server.mjs only flips due rows to `ready`; this
// module is what actually executes them through the shared AgentRunner, so a
// timer task gets the same bounded loop, logging and SSE events as a manual
// one.
//
// Delivery semantics: at-least-once. The row flips to a terminal/next state
// BEFORE the run finishes (claim-first), so a crash mid-run loses at most one
// execution rather than re-firing forever. `once` tasks move scheduled ->
// ready -> completed; recurring tasks reschedule their next run_at on claim.
import { createAgentRun } from './AgentRunStore.mjs'
import { isValidAssistantId } from '../identity.mjs'

// Claim one due task atomically. Returns the claimed row or null.
function claimDueTask(db, nowIso) {
  const due = db.prepare(`SELECT * FROM scheduled_tasks
    WHERE status IN ('scheduled','ready') AND run_at<=? ORDER BY run_at ASC LIMIT 1`).all(nowIso)
  for (const task of due) {
    if (!isValidAssistantId(task.person)) continue
    // Conditional update = optimistic lock: only one tick can claim a row.
    if (task.recurrence === 'once') {
      const claimed = db.prepare(`UPDATE scheduled_tasks SET status='ready', last_run_at=?, updated_at=?
        WHERE id=? AND status IN ('scheduled','ready')`).run(nowIso, nowIso, task.id)
      if (claimed.changes) return task
    } else {
      const next = new Date(task.run_at)
      do { next.setTime(next.getTime() + (task.recurrence === 'daily' ? 86400000 : 604800000)) } while (next <= new Date(nowIso))
      const claimed = db.prepare(`UPDATE scheduled_tasks SET last_run_at=?, run_at=?, updated_at=?
        WHERE id=? AND status='scheduled'`).run(nowIso, next.toISOString(), nowIso, task.id)
      if (claimed.changes) return task
    }
  }
  return null
}

// ctx: { db, runner (AgentRunner), bus }
export function createTaskScheduler(ctx) {
  const { db, runner, bus } = ctx
  const inFlight = new Set() // task ids currently running — never double-dispatch

  function dispatch(task) {
    if (inFlight.has(task.id)) return false
    inFlight.add(task.id)
    const run = createAgentRun(db, {
      assistantId: task.person,
      source: 'scheduled',
      prompt: task.prompt,
      taskId: task.id,
    })
    bus.publish({ type: 'run_created', runId: run.id, assistantId: task.person, source: 'scheduled', taskId: task.id })
    const handle = runner.start(run)
    handle.promise
      .then(finished => {
        // `once` tasks end as completed; recurring ones already have their
        // next run_at from the claim, so only the status needs settling.
        const now = new Date().toISOString()
        if (task.recurrence === 'once') {
          db.prepare(`UPDATE scheduled_tasks SET status='completed', updated_at=? WHERE id=? AND status='ready'`)
            .run(now, task.id)
        }
        bus.publish({ type: 'task_finished', taskId: task.id, runId: run.id, status: finished?.status || 'failed' })
      })
      .catch(error => {
        console.error('[scheduler] run crashed', task.id, error?.message || error)
      })
      .finally(() => inFlight.delete(task.id))
    return true
  }

  return {
    inFlight,
    // Called by the 15s interval. Drains every currently-due task (bounded so
    // a backlog cannot stall the interval tick).
    tick() {
      let dispatched = 0
      const nowIso = new Date().toISOString()
      for (let i = 0; i < 20; i++) {
        const task = claimDueTask(db, nowIso)
        if (!task) break
        if (dispatch(task)) dispatched++
      }
      return dispatched
    },
  }
}
