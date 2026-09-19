const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const MONTHS = [
  '一月',
  '二月',
  '三月',
  '四月',
  '五月',
  '六月',
  '七月',
  '八月',
  '九月',
  '十月',
  '十一月',
  '十二月',
]

export function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function addDays(date: Date, days: number): Date {
  const d = startOfDay(date)
  d.setDate(d.getDate() + days)
  return d
}

export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function formatLong(date: Date): string {
  return `${date.getFullYear()} 年 ${MONTHS[date.getMonth()]} ${date.getDate()} 日 星期${WEEKDAYS[date.getDay()]}`
}

export function formatShort(iso: string): string {
  const date = parseISODate(iso)
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
}

export function daysUntil(iso: string): number {
  const today = startOfToday()
  const target = parseISODate(iso)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

export function nextOccurrence(iso: string, repeatYearly: boolean, from: Date = startOfToday()): string {
  if (!repeatYearly) return iso
  const today = startOfDay(from)
  const origin = parseISODate(iso)
  let next = new Date(today.getFullYear(), origin.getMonth(), origin.getDate())
  if (next < today) {
    next = new Date(today.getFullYear() + 1, origin.getMonth(), origin.getDate())
  }
  return toISODate(next)
}

export function daysSince(iso: string, today: Date = startOfToday()): number {
  return Math.round((startOfDay(today).getTime() - parseISODate(iso).getTime()) / 86400000)
}

/** Completed years between two dates, e.g. 1998-06-01 -> 2026-05-31 is 27, not 28. */
function completedYears(origin: Date, until: Date): number {
  let years = until.getFullYear() - origin.getFullYear()
  const anniversaryThisYear = new Date(until.getFullYear(), origin.getMonth(), origin.getDate())
  if (anniversaryThisYear > until) years -= 1
  return Math.max(0, years)
}

/**
 * Both directions of one anchored day: how long since it happened and how long
 * until it comes round again. 倒数日 and 纪念日 are the same record — a birthday
 * is "已过 27 年" and "还有 12 天" at the same time.
 */
export type DayFacts = {
  origin: string
  /** Origin is strictly in the past. */
  originPassed: boolean
  /** Whole days since the origin; negative while the origin is still ahead. */
  elapsedDays: number
  /** Next time this day comes round; equals origin when it does not repeat. */
  next: string
  /** Whole days until `next`; negative for a one-off day already gone. */
  daysToNext: number
  /** There is still a future (or today) occurrence to count down to. */
  hasUpcoming: boolean
  /** Completed anniversaries so far. */
  yearsSince: number
  /** Which anniversary `next` will be; 0 when the day does not repeat. */
  upcomingOrdinal: number
}

export function dayFacts(iso: string, repeatYearly: boolean, today: Date = startOfToday()): DayFacts {
  const base = startOfDay(today)
  const origin = parseISODate(iso)
  const elapsedDays = daysSince(iso, base)
  const next = repeatYearly ? nextOccurrence(iso, true, base) : iso
  const daysToNext = Math.round((parseISODate(next).getTime() - base.getTime()) / 86400000)
  const yearsSince = completedYears(origin, base)
  return {
    origin: iso,
    originPassed: elapsedDays > 0,
    elapsedDays,
    next,
    daysToNext,
    hasUpcoming: daysToNext >= 0,
    yearsSince,
    upcomingOrdinal: repeatYearly ? completedYears(origin, parseISODate(next)) : 0,
  }
}

export function monthCells(view: Date): (Date | null)[] {
  const year = view.getFullYear()
  const month = view.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const result: (Date | null)[] = []
  for (let i = 0; i < firstDay; i++) result.push(null)
  for (let d = 1; d <= daysInMonth; d++) result.push(new Date(year, month, d))
  while (result.length % 7 !== 0) result.push(null)
  return result
}

export { WEEKDAYS, MONTHS }
