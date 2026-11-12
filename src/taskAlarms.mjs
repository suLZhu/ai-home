// 本地主动任务 → Android 原生闹钟的计划层（纯函数）。
// 前端把计划交给 AiHomeSystem.syncAlarms()，开机后 BootRestoreReceiver 用同一份
// 持久化快照重新注册。runId 必须与 localBackend /api/tasks/run 完全一致：
//   'local-' + task.id + '-' + Date.parse(task.run_at)
// 这样「原生闹钟先提醒」与「App 恢复后写回聊天」用的是同一个去重键。
//
// 去重 / 恢复规则：
// - 只恢复 status='scheduled'；completed / paused / cancelled / ready 一律跳过；
// - 已投递（delivered）的 runId 不重复恢复；
// - 一次性任务过期超过宽限期（默认 6 小时）不再补发，避免开机重放历史提醒；
// - 重复任务从过期点推算下一次，只保留一个未来时刻；
// - 按 runId 去重并限量，配合原生层「同 requestCode 先 cancel 再 set」不会重复注册。

import { nextRunAt } from './localTasks.mjs'

export const MAX_ALARMS = 60
export const RESTORE_GRACE_MS = 6 * 60 * 60 * 1000
export const SYSTEM_CHANNEL_ID = 'aihome.system'
export const SYSTEM_CHANNEL_NAME = '定时任务 / 系统消息'

export function alarmRunId(task) {
  const id = String(task?.id ?? '').trim()
  const at = Date.parse(String(task?.run_at ?? ''))
  if (!id || !Number.isFinite(at)) return ''
  return 'local-' + id + '-' + at
}

export function normalizeAlarmTask(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = String(raw.id ?? '').trim()
  const runAt = Date.parse(String(raw.run_at ?? ''))
  if (!id || !Number.isFinite(runAt)) return null
  return {
    id,
    person: String(raw.person ?? '').trim(),
    title: String(raw.title ?? '').trim().slice(0, 160),
    prompt: String(raw.prompt ?? '').trim().slice(0, 1200),
    run_at: new Date(runAt).toISOString(),
    recurrence: ['once', 'daily', 'weekly'].includes(raw.recurrence) ? raw.recurrence : 'once',
    status: String(raw.status ?? '').trim(),
    conversation_id: String(raw.conversation_id ?? raw.conversationId ?? '').trim().slice(0, 120),
  }
}

function planItem(task, at, runId) {
  const body = '⏰ ' + task.title + (task.prompt ? '\n' + task.prompt : '')
  return {
    taskId: task.id,
    runId,
    // 与 notificationKey({runId}) / 原生 AlarmReceiver 完全一致：闹钟、写回聊天、
    // 系统通知三方共用这一个稳定 ID，任何一端都只通知一次。
    key: 'task:' + runId,
    assistantId: task.person,
    // 同步到原生时会补上当前显示名，锁屏期间的原生提醒也能显示助手名。
    assistantName: '',
    conversationId: task.conversation_id,
    title: task.title,
    body,
    at,
    recurrence: task.recurrence,
    status: 'scheduled',
    kind: 'task',
    channelId: SYSTEM_CHANNEL_ID,
    channelName: SYSTEM_CHANNEL_NAME,
  }
}

function deliveredSet(delivered) {
  if (delivered instanceof Set) return delivered
  if (Array.isArray(delivered)) return new Set(delivered.map(String))
  if (delivered && typeof delivered === 'object') return new Set(Object.keys(delivered))
  return new Set()
}

function finalize(items) {
  const seen = new Set()
  const out = []
  for (const item of items.sort((a, b) => a.at - b.at)) {
    if (!item.runId || seen.has(item.runId)) continue
    seen.add(item.runId)
    out.push(item)
    if (out.length >= MAX_ALARMS) break
  }
  return out
}

/** 常规同步：只登记严格未来的、仍在 scheduled 的任务。 */
export function buildAlarmPlan(tasks, now = Date.now()) {
  const items = []
  for (const raw of Array.isArray(tasks) ? tasks : []) {
    const t = normalizeAlarmTask(raw)
    if (!t || t.status !== 'scheduled') continue
    const at = Date.parse(t.run_at)
    if (!Number.isFinite(at) || at <= now) continue
    const runId = alarmRunId(t)
    if (!runId) continue
    items.push(planItem(t, at, runId))
  }
  return finalize(items)
}

/** 开机恢复：过滤历史任务 / 已完成 / 已暂停 / 已投递，重复任务只留下一次。 */
export function restoreAlarmPlan(tasks, now = Date.now(), delivered = {}, graceMs = RESTORE_GRACE_MS) {
  const done = deliveredSet(delivered)
  const items = []
  for (const raw of Array.isArray(tasks) ? tasks : []) {
    const t = normalizeAlarmTask(raw)
    if (!t || t.status !== 'scheduled') continue
    const originalAt = Date.parse(t.run_at)
    const runId = alarmRunId(t)
    if (!runId || done.has(runId)) continue
    let at = originalAt
    if (at <= now) {
      if (t.recurrence === 'once') {
        if (now - at > graceMs) continue // 过期太久：不再重放历史提醒
        at = now + 30_000
      } else {
        const next = nextRunAt(t, now)
        if (!next) continue
        at = Date.parse(next)
        if (!Number.isFinite(at) || at <= now) continue
      }
    }
    items.push(planItem(t, at, runId))
  }
  return finalize(items)
}

export function syncSummary(plan, exact) {
  const hasExact = exact === true
  return {
    registered: Array.isArray(plan) ? plan.length : 0,
    exact: hasExact,
    degraded: !hasExact,
    at: Date.now(),
  }
}
