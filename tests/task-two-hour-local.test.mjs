import test from 'node:test'
import assert from 'node:assert/strict'
import { makeLocalTask, nextRunAt, advanceLocalTask } from '../src/localTasks.mjs'

test('本地模式每两小时推进一次', () => {
  const start=Date.parse('2026-11-19T04:00:00.000Z')
  const task=makeLocalTask({person:'assistant-yanweixi',title:'来聊天',prompt:'每两小时找我聊天',runAt:new Date(start).toISOString(),recurrence:'daily',intervalMinutes:120},'test-1',start-1000)
  assert.equal(task.interval_minutes,120)
  assert.equal(nextRunAt(task,start),'2026-11-19T06:00:00.000Z')
  assert.equal(advanceLocalTask(task,start).status,'scheduled')
})

test('离线十小时不会补发五条旧提醒，只安排下个未来时间点', () => {
  const start=Date.parse('2026-11-19T04:00:00.000Z')
  const task=makeLocalTask({person:'assistant-yanweixi',title:'来聊天',prompt:'每两小时',runAt:new Date(start).toISOString(),recurrence:'daily',intervalMinutes:120},'test-2',start-1000)
  assert.equal(nextRunAt(task,Date.parse('2026-11-19T15:00:00.000Z')),'2026-11-19T16:00:00.000Z')
})

test('已有每日、每周任务不受间隔时间升级影响', () => {
  const start=Date.parse('2026-11-19T04:00:00.000Z')
  for(const [recurrence,hours] of [['daily',24],['weekly',168]]) {
    const task=makeLocalTask({person:'assistant-yanweixi',title:'原有任务',prompt:'继续执行',runAt:new Date(start).toISOString(),recurrence},'legacy',start-1000)
    assert.equal(task.interval_minutes,0)
    assert.equal(nextRunAt(task,start),new Date(start+hours*3600000).toISOString())
  }
})
