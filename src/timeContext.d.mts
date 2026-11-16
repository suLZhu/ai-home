export const DEFAULT_TIME_ZONE: string

export function normalizeTimeZone(tz: unknown): string

export type PartOfDay = '深夜' | '早晨' | '上午' | '下午' | '晚上'

export function partOfDayOf(hour: unknown): PartOfDay

export type TimeContext = {
  date: string // YYYY-MM-DD
  weekday: string // 星期一 … 星期日
  time: string // HH:mm（24 小时制）
  hour: number
  partOfDay: PartOfDay
  timeZone: string
  utcOffset: string // UTC+08:00
}

export function buildTimeContext(now?: Date | string | number, timeZone?: unknown): TimeContext

export function timeContextText(ctx: TimeContext): string

export function injectTimeContext(
  messages: unknown,
  now?: Date | string | number,
  timeZone?: unknown,
): Array<{ role: string; content: string }>
