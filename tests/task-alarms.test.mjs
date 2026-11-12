import test from 'node:test'
import assert from 'node:assert/strict'
import { notificationKey, SYSTEM_CHANNEL_ID } from '../src/notificationDispatch.mjs'
import {
  MAX_ALARMS, RESTORE_GRACE_MS, alarmRunId, normalizeAlarmTask,
  buildAlarmPlan, restoreAlarmPlan, syncSummary,
} from '../src/taskAlarms.mjs'

const NOW = Date.parse('2026-11-12T08:00:00.000Z')
const HOUR = 3_600_000
const DAY = 86_400_000
const WEEK = 604_800_000
const YWX = 'assistant-yanweixi'

const task = (over = {}) => ({
  id: 't1', person: YWX, title: '洗衣服', prompt: '记得去洗衣服哦……',
  run_at: new Date(NOW + HOUR).toISOString(), recurrence: 'once',
  status: 'scheduled', conversation_id: 'conv-1', ...over,
})

test('runId 与 localBackend /api/tasks/run 完全一致，且等于通知去重键', () => {
  const t = task()
  const runId = alarmRunId(t)
  assert.equal(runId, 'local-t1-' + Date.parse(t.run_at))
  assert.equal(notificationKey({ runId }), 'task:' + runId)
  assert.equal(buildAlarmPlan([t], NOW)[0].key, 'task:' + runId)
  assert.equal(alarmRunId({ id: 'x', run_at: 'not-a-date' }), '')
  assert.equal(alarmRunId({ run_at: '2026-11-12T09:00:00.000Z' }), '')
})

test('normalizeAlarmTask 清洗脏数据，不把非法时间送进 AlarmManager', () => {
  assert.equal(normalizeAlarmTask(null), null)
  assert.equal(normalizeAlarmTask({ id: 'a', run_at: 'x' }), null)
  const n = normalizeAlarmTask(task({ recurrence: 'yearly', status: 'weird', conversationId: 'c2' }))
  assert.equal(n.recurrence, 'once')
  assert.equal(n.status, 'weird')
  assert.equal(n.conversation_id, 'conv-1')
  assert.equal(n.title, '洗衣服')
})

test('常规同步：只登记严格未来的 scheduled 任务，按时间升序并限量', () => {
  const tasks = [
    task({ id: 'a', run_at: new Date(NOW + 3 * HOUR).toISOString() }),
    task({ id: 'b', run_at: new Date(NOW + HOUR).toISOString() }),
    task({ id: 'past', run_at: new Date(NOW - HOUR).toISOString() }),
    task({ id: 'paused', status: 'paused', run_at: new Date(NOW + 2 * HOUR).toISOString() }),
    task({ id: 'done', status: 'completed', run_at: new Date(NOW + 2 * HOUR).toISOString() }),
  ]
  const plan = buildAlarmPlan(tasks, NOW)
  assert.deepEqual(plan.map(p => p.taskId), ['b', 'a'])
  for (const p of plan) {
    assert.ok(p.at > NOW)
    assert.equal(p.status, 'scheduled')
    assert.equal(p.channelId, SYSTEM_CHANNEL_ID)
    assert.equal(p.assistantId, YWX)
    assert.equal(p.assistantName, '', '原生提醒的助手名由渠道同步时补上')
    assert.equal(p.conversationId, 'conv-1')
    assert.match(p.body, /^⏰ 洗衣服/)
    assert.equal(p.key, 'task:' + p.runId)
  }
  // 同一 task 重复出现在列表里不会注册两次
  assert.equal(buildAlarmPlan([task(), task()], NOW).length, 1)
  const many = Array.from({ length: MAX_ALARMS + 25 }, (_, i) =>
    task({ id: 'x' + i, run_at: new Date(NOW + (i + 1) * 60_000).toISOString() }))
  assert.equal(buildAlarmPlan(many, NOW).length, MAX_ALARMS)
})

test('开机恢复：已完成 / 已暂停 / 已取消 / ready 一律不恢复', () => {
  const future = new Date(NOW + HOUR).toISOString()
  const tasks = ['scheduled', 'paused', 'completed', 'cancelled', 'ready'].map((status, i) =>
    task({ id: 's' + i, status, run_at: future }))
  const plan = restoreAlarmPlan(tasks, NOW)
  assert.equal(plan.length, 1)
  assert.equal(plan[0].taskId, 's0')
  assert.equal(plan[0].status, 'scheduled')
})

test('开机恢复：已投递的 runId 不重复恢复 / 执行，重复任务只留一个未来时刻', () => {
  const t = task()
  const runId = alarmRunId(t)
  assert.equal(restoreAlarmPlan([t], NOW, new Set([runId])).length, 0)
  assert.equal(restoreAlarmPlan([t], NOW, [runId]).length, 0)
  assert.equal(restoreAlarmPlan([t], NOW, { [runId]: true }).length, 0)
  assert.equal(restoreAlarmPlan([t, t, t], NOW).length, 1, '重复注册只会留一条')
  assert.equal(restoreAlarmPlan([t], NOW).length, 1)
})

test('开机恢复：一次性任务过期超过宽限期不再重放历史提醒', () => {
  const old = task({ run_at: new Date(NOW - RESTORE_GRACE_MS - HOUR).toISOString() })
  assert.equal(restoreAlarmPlan([old], NOW).length, 0)
  assert.equal(buildAlarmPlan([old], NOW).length, 0)
  const recent = task({ id: 'recent', run_at: new Date(NOW - HOUR).toISOString() })
  const plan = restoreAlarmPlan([recent], NOW)
  assert.equal(plan.length, 1)
  assert.equal(plan[0].at, NOW + 30_000, '刚刚错过的提醒补到 30 秒后')
  assert.equal(plan[0].key, 'task:' + alarmRunId(recent))
})

test('开机恢复：重复任务从过期点递推，只保留严格未来的下一次', () => {
  const daily = task({ id: 'd', recurrence: 'daily', run_at: new Date(NOW - 3 * DAY - HOUR).toISOString() })
  const weekly = task({ id: 'w', recurrence: 'weekly', run_at: new Date(NOW - 2 * WEEK).toISOString() })
  const plan = restoreAlarmPlan([daily, weekly], NOW)
  assert.equal(plan.length, 2)
  const d = plan.find(p => p.taskId === 'd')
  const w = plan.find(p => p.taskId === 'w')
  assert.ok(d.at > NOW && d.at <= NOW + DAY)
  assert.ok(w.at > NOW && w.at <= NOW + WEEK)
  // 未来任务原样保留，不会被推算改点
  const future = task({ id: 'f', recurrence: 'daily', run_at: new Date(NOW + 2 * HOUR).toISOString() })
  assert.equal(restoreAlarmPlan([future], NOW)[0].at, NOW + 2 * HOUR)
})

test('精确定时权限有 / 无两条路径都能登记任务，只是标注降级', () => {
  const plan = buildAlarmPlan([task()], NOW)
  const ok = syncSummary(plan, true)
  assert.equal(ok.registered, 1)
  assert.equal(ok.exact, true)
  assert.equal(ok.degraded, false)
  assert.ok(Number.isFinite(ok.at))
  assert.equal(syncSummary(plan, false).exact, false)
  assert.equal(syncSummary(plan, false).degraded, true)
  assert.equal(syncSummary(plan, false).registered, 1, '缺精确权限不能让整个主动任务失效')
  assert.equal(syncSummary([], false).registered, 0)
})
