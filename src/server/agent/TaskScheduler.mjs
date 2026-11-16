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
//
// A 'ready' row seen at boot belongs to a dead process (this scheduler only
// ever claims from 'scheduled'), so server boot calls recoverInterruptedTasks
// to re-schedule it — recovery is explicit, and a live 'ready' row can never
// starve other due tasks inside one tick.
import { createAgentRun } from './AgentRunStore.mjs'
import { isValidAssistantId } from '../identity.mjs'

// Boot recovery: re-schedule once-tasks interrupted by a crash/restart. The
// next tick (within 15s) retries them; their dead run rows are already marked
// SERVER_RESTART by initAgentRuns. Returns the number of recovered rows.
export function recoverInterruptedTasks(db) {
  return db.prepare(`UPDATE scheduled_tasks SET status='scheduled', updated_at=? WHERE status='ready'`)
    .run(new Date().toISOString()).changes
}

// Claim one due task atomically. Returns the claimed row or null.
function claimDueTask(db, nowIso) {
  // Only 'scheduled' rows are claimable. 'ready' means claimed-and-running in
  // this process (settled by the finish callback) or orphaned by a crash
  // (recovered at boot) — never re-claimed here, so concurrent due tasks are
  // not starved by an in-flight one.
  const due = db.prepare(`SELECT * FROM scheduled_tasks
    WHERE status='scheduled' AND run_at<=? ORDER BY run_at ASC LIMIT 1`).all(nowIso)
  for (const task of due) {
    if (!isValidAssistantId(task.person)) continue
    // Conditional update = optimistic lock: only one tick can claim a row.
    if (task.recurrence === 'once') {
      const claimed = db.prepare(`UPDATE scheduled_tasks SET status='ready', last_run_at=?, updated_at=?
        WHERE id=? AND status='scheduled'`).run(nowIso, nowIso, task.id)
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

// ctx: { db, runner (AgentRunner), bus, deliverTask?({person,runId,taskId,conversationId,title,answer}) }
// deliverTask is injected by the server (mirrors ProactiveHeat's deliver) so
// inbox delivery stays in the inbox module — no cross-module hacks.
export function createTaskScheduler(ctx) {
  const { db, runner, bus, deliverTask } = ctx
  const inFlight = new Set() // task ids currently running — never double-dispatch

  function dispatch(task) {
    if (inFlight.has(task.id)) return false
    inFlight.add(task.id)
    const run = createAgentRun(db, {
      assistantId: task.person,
      source: 'scheduled',
      prompt: task.prompt,
      taskId: task.id,
      // Timer tasks write back into the conversation they were created from;
      // an empty value keeps the old behavior (no conversation binding).
      conversationId: task.conversation_id || null,
    })
    bus.publish({ type: 'run_created', runId: run.id, assistantId: task.person, source: 'scheduled', taskId: task.id })
    const handle = runner.start(run)
    handle.promise
      .then(finished => {
        const now = new Date().toISOString()
        const status = finished?.status || 'failed'
        const succeeded = status === 'succeeded'
        // `once` tasks settle exactly once: completed only on real success.
        // Failed/cancelled/timed-out runs park the task as paused instead —
        // never completed (a failure must not display as success), and never
        // left ready (that would re-dispatch the failed run every tick).
        // Recurring tasks already have their next run_at from the claim.
        if (task.recurrence === 'once') {
          db.prepare(`UPDATE scheduled_tasks SET status=?, updated_at=? WHERE id=? AND status='ready'`)
            .run(succeeded ? 'completed' : 'paused', now, task.id)
        }
        // Result delivery: only a succeeded run may enter the inbox, and only
        // through the deterministic-id writer (idempotent across replays).
        // Failures keep their traceable state in agent_runs (error_code /
        // error_message) and in the task_finished event below — they are never
        // dressed up as a delivered answer.
        let delivered = false
        if (succeeded && typeof deliverTask === 'function') {
          try {
            const result = deliverTask({
              person: task.person,
              runId: run.id,
              taskId: task.id,
              conversationId: task.conversation_id || '',
              title: task.title || '',
              answer: finished?.answer || '',
            })
            delivered = !!(result && result.inserted)
          } catch (error) {
            // Delivery failure never rewrites run/task state: the answer stays
            // auditable in agent_runs and the event reports delivered=false.
            console.error('[scheduler] deliver failed', task.id, error?.message || error)
          }
        }
        bus.publish({ type: 'task_finished', taskId: task.id, runId: run.id, status, delivered })
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
