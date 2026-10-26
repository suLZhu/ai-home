// 动态时间上下文（前后端共享的纯函数模块）。
// 需求要点：
//  - 只注入日期、星期、本地时间（HH:mm 24 小时制）与时区，不注入天气、
//    位置、IP、地址或任何地理推断；
//  - 由服务端在每次模型请求前用 new Date() 实时生成，绝不用启动时的旧值；
//  - 时段判断（早晨/上午/下午/晚上/深夜）只是参考，提示词里明确「用户自述
//    补觉、上夜班等情况以实际对话为准」。
// 无网络请求、无副作用，node --test 可直接验证。

export const DEFAULT_TIME_ZONE = 'Asia/Shanghai'

// 校验 IANA 时区名；非法或空值回退到默认时区（Asia/Shanghai UTC+8）。
export function normalizeTimeZone(tz) {
  const raw = String(tz == null ? '' : tz).trim()
  if (!raw) return DEFAULT_TIME_ZONE
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: raw })
    return raw
  } catch {
    return DEFAULT_TIME_ZONE
  }
}

// 时段边界（本地小时）：深夜 23:00–04:59，早晨 05:00–08:59，
// 上午 09:00–11:59，下午 12:00–17:59，晚上 18:00–22:59。
// 上午 9 点明确归为「上午」，不会被当成睡觉时间。
export function partOfDayOf(hour) {
  const h = Number(hour)
  if (!Number.isFinite(h) || h < 0 || h > 23) return '上午'
  if (h >= 23 || h < 5) return '深夜'
  if (h < 9) return '早晨'
  if (h < 12) return '上午'
  if (h < 18) return '下午'
  return '晚上'
}

function timeZoneOffsetMinutes(now, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = {}
  for (const p of dtf.formatToParts(now)) parts[p.type] = p.value
  const asUTC = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second))
  // 与 now 的 UTC 墙钟对齐（忽略毫秒），避免夏令时切换时出现 59:59.9 的偏差。
  const nowUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds())
  return Math.round((asUTC - nowUTC) / 60000)
}

function formatUtcOffset(minutes) {
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return 'UTC' + sign + hh + ':' + mm
}

// 生成结构化时间上下文。now 可注入以便测试固定时刻。
export function buildTimeContext(now, timeZone) {
  const instant = now instanceof Date ? now : new Date(now)
  const tz = normalizeTimeZone(timeZone)
  const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  const weekdayFmt = new Intl.DateTimeFormat('zh-CN', { timeZone: tz, weekday: 'long' })
  const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const date = dateFmt.format(instant) // en-CA 直接给出 YYYY-MM-DD
  const weekday = weekdayFmt.format(instant) // 星期一 … 星期日
  const time = timeFmt.format(instant) // HH:mm
  const hour = Number(time.slice(0, 2))
  return {
    date,
    weekday,
    time,
    hour,
    partOfDay: partOfDayOf(hour),
    timeZone: tz,
    utcOffset: formatUtcOffset(timeZoneOffsetMinutes(instant, tz)),
  }
}

// 独立的时间 system 消息文本。明确：仅供参考、不含位置信息、
// 用户自述作息（补觉/上夜班等）优先于时段推断。
export function timeContextText(ctx) {
  return [
    '【当前时间上下文】（服务端实时生成，仅供参考）',
    '日期：' + ctx.date + '（' + ctx.weekday + '）',
    '本地时间：' + ctx.time + '（24 小时制）',
    '时段：' + ctx.partOfDay,
    '时区：' + ctx.timeZone + '（' + ctx.utcOffset + '）',
    '使用说明：',
    '1. 以上时间仅用于合理安排与时间有关的表达（例如把上午 9 点理解为通常的活动时间，而不是睡觉时间）。',
    '2. 若用户在对话中明确说自己在补觉、上夜班或作息与此时段不符，一律以用户所说的为准，不要机械套用常规作息。',
    '3. 本上下文不包含天气、位置、地址或任何地理推断信息；不要据此虚构天气或地点。',
  ].join('\n')
}

// 把时间上下文作为【独立】的 system 消息放到消息数组最前面。
// 不修改传入数组，也不替换/覆盖已有的 system 消息（人物设定、
// 世界书、长期记忆都保持原样）。
export function injectTimeContext(messages, now, timeZone) {
  const list = Array.isArray(messages) ? messages.slice() : []
  const ctx = buildTimeContext(now, timeZone)
  return [{ role: 'system', content: timeContextText(ctx) }, ...list]
}
