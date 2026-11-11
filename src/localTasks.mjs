// 本地模式定时任务的状态机（纯函数，无 DOM / 网络 / 存储依赖）。
//
// 云端模式的 scheduled_tasks 由 SQLite + 常驻 Agent Runner 驱动；本地模式没有
// 常驻进程，因此把任务存进 localStorage，由 App 前台的 setInterval 结算到期任务。
// 这里只负责「哪些到期 / 下次几点 / 结算后状态怎么变」，读写交给 localBackend。
//
// 关键取舍：App 退到后台后 WebView 会被冻结，调度器不跑；切回前台时补跑，但
// 重复任务的 run_at 会直接递推到「下一个未来时刻」，避免离线几小时后补发几十条
// 历史提醒。一次只补最近一次，符合用户对「提醒」的直觉。

const str = (v) => String(v ?? '').trim()
const RECURRENCE = ['once', 'daily', 'weekly']
const STATUS = ['scheduled', 'paused', 'completed']
const DAY = 86_400_000
const WEEK = 604_800_000

// 把任意来源（旧数据、请求体、存储）收敛成结构固定的任务；无效时间直接丢弃。
export function normalizeLocalTask(raw) {
  if (!raw || typeof raw !== 'object' || !str(raw.id)) return null
  const at = Date.parse(str(raw.run_at))
  if (!Number.isFinite(at)) return null
  return {
    id: str(raw.id),
    person: str(raw.person),
    title: str(raw.title).slice(0, 160),
    prompt: str(raw.prompt).slice(0, 12000),
    run_at: new Date(at).toISOString(),
    recurrence: RECURRENCE.includes(raw.recurrence) ? raw.recurrence : 'once',
    status: STATUS.includes(raw.status) ? raw.status : 'scheduled',
    last_run_at: str(raw.last_run_at) || null,
    created_at: str(raw.created_at) || new Date().toISOString(),
    updated_at: str(raw.updated_at) || new Date().toISOString(),
    created_by: str(raw.created_by) || '',
    temporary: !!raw.temporary,
    conversation_id: str(raw.conversation_id) || null,
  }
}

// 创建任务。runAt 无效或必填项缺失时返回 null，由调用方转 400。
export function makeLocalTask(input, id, now = Date.now()) {
  const iso = new Date(now).toISOString()
  const task = normalizeLocalTask({
    id,
    person: input && input.person,
    title: input && input.title,
    prompt: input && input.prompt,
    run_at: input && input.runAt,
    recurrence: (input && input.recurrence) || 'once',
    status: 'scheduled',
    last_run_at: null,
    created_at: iso,
    updated_at: iso,
    created_by: (input && input.createdBy) || (input && input.person) || '',
    temporary: !!(input && input.temporary),
    conversation_id: (input && input.conversationId) || null,
  })
  if (!task || !task.title || !task.prompt || !task.person) return null
  return task
}

// 到期且仍启用（scheduled）的任务，按执行时间升序。paused / completed 永不触发。
export function dueLocalTasks(tasks, now = Date.now()) {
  return (Array.isArray(tasks) ? tasks : [])
    .map(normalizeLocalTask)
    .filter((t) => t && t.status === 'scheduled' && Date.parse(t.run_at) <= now)
    .sort((a, b) => Date.parse(a.run_at) - Date.parse(b.run_at))
}

// 计算重复任务的下一次执行时间；一次性任务返回 null。
// 从过期点直接算到「严格晚于 now」的第一个时刻。
export function nextRunAt(task, now = Date.now()) {
  const base = Date.parse(str(task && task.run_at))
  if (!Number.isFinite(base)) return null
  const step = task.recurrence === 'daily' ? DAY : task.recurrence === 'weekly' ? WEEK : 0
  if (!step) return null
  let t = base
  // 一次除算到位：离线几天甚至几年也不会循环上千次，更不会补发历史提醒。
  if (t <= now) t += Math.ceil((now - t + 1) / step) * step
  return Number.isFinite(t) && t > now ? new Date(t).toISOString() : null
}

// 结算一次：重复任务排到下一次并继续启用；一次性任务标记完成。
export function advanceLocalTask(task, now = Date.now()) {
  const iso = new Date(now).toISOString()
  const next = nextRunAt(task, now)
  if (next) return { ...task, run_at: next, last_run_at: iso, updated_at: iso, status: 'scheduled' }
  return { ...task, status: 'completed', last_run_at: iso, updated_at: iso }
}
