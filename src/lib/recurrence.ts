import type { RecurrenceRule, RecurrenceUnit, RecurringReminder } from '../types'
import { addDays, parseISODate, sameDay, startOfDay, startOfToday, toISODate } from './dates'

/** 当前真正会算日期的规则。其它 kind 只占位，不算 occurrence。 */
export function isIntervalRule(rule: RecurrenceRule | undefined): rule is RecurrenceRule & {
  kind: 'interval'
  interval: number
  unit: RecurrenceUnit
} {
  return Boolean(
    rule &&
      rule.kind === 'interval' &&
      typeof rule.interval === 'number' &&
      Number.isInteger(rule.interval) &&
      rule.interval > 0 &&
      (rule.unit === 'day' || rule.unit === 'week' || rule.unit === 'month' || rule.unit === 'year'),
  )
}

/** 按自然月加月份：1 月 31 日 + 1 月 = 2 月 28/29 日，不会溢出到 3 月。 */
export function addCalendarMonths(date: Date, months: number): Date {
  const day = date.getDate()
  const cursor = new Date(date.getFullYear(), date.getMonth() + months, 1)
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  return new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(day, last))
}

/** 按自然年加年份：闰年 2 月 29 日在平年落到 2 月 28 日。 */
export function addCalendarYears(date: Date, years: number): Date {
  return addCalendarMonths(date, years * 12)
}

export function addRecurrenceInterval(date: Date, interval: number, unit: RecurrenceUnit): Date {
  if (unit === 'day') return addDays(date, interval)
  if (unit === 'week') return addDays(date, interval * 7)
  if (unit === 'month') return addCalendarMonths(date, interval)
  return addCalendarYears(date, interval)
}

export function formatRecurrenceRule(rule: RecurrenceRule): string {
  if (!isIntervalRule(rule)) {
    if (rule.kind === 'term') return '学期规则（尚未启用）'
    if (rule.kind === 'season') return '季节/事件规则（尚未启用）'
    if (rule.kind === 'onThisDay') return '那年今日（尚未启用）'
    return '未设置周期'
  }
  const { interval, unit } = rule
  if (interval === 1) {
    if (unit === 'day') return '每天'
    if (unit === 'week') return '每周'
    if (unit === 'month') return '每月'
    return '每年'
  }
  if (unit === 'day') return `每 ${interval} 天`
  if (unit === 'week') return `每 ${interval} 周`
  if (unit === 'month') return `每 ${interval} 个月`
  return `每 ${interval} 年`
}

function monthIndex(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
}

function lastAllowedDay(item: RecurringReminder): Date | null {
  if (item.neverEnds || !item.endDate) return null
  return parseISODate(item.endDate)
}

function withinEnd(item: RecurringReminder, date: Date): boolean {
  const end = lastAllowedDay(item)
  return !end || startOfDay(date) <= end
}

/**
 * 这一天是否落在规则算出的某一场上。不展开几十年的列表。
 * 暂停的记录仍然算发生（方便在日历里看到并恢复），通知层再过滤 enabled。
 */
export function occursOn(item: RecurringReminder, iso: string): boolean {
  if (!isIntervalRule(item.rule)) return false
  const day = parseISODate(iso)
  const start = parseISODate(item.startDate)
  if (day < start || !withinEnd(item, day)) return false
  const { interval, unit } = item.rule
  if (unit === 'day' || unit === 'week') {
    const step = unit === 'week' ? interval * 7 : interval
    const diff = Math.round((day.getTime() - start.getTime()) / 86400000)
    return diff % step === 0
  }
  if (unit === 'month') {
    const months = monthIndex(start, day)
    if (months < 0 || months % interval !== 0) return false
    return sameDay(addCalendarMonths(start, months), day)
  }
  const years = day.getFullYear() - start.getFullYear()
  if (years < 0 || years % interval !== 0) return false
  return sameDay(addCalendarYears(start, years), day)
}

/**
 * 从 `from`（含当天）起的下一次发生日期。按规则算，不预生成。
 * 暂停不取消日期，只是通知不响。
 */
export function nextRecurrenceDate(item: RecurringReminder, from: Date = startOfToday()): string | null {
  if (!isIntervalRule(item.rule)) return null
  const start = parseISODate(item.startDate)
  const fromDay = startOfDay(from)
  if (!withinEnd(item, fromDay) && fromDay > (lastAllowedDay(item) as Date)) return null
  const { interval, unit } = item.rule
  let next: Date
  if (fromDay <= start) {
    next = start
  } else if (unit === 'day' || unit === 'week') {
    const step = unit === 'week' ? interval * 7 : interval
    const diff = Math.round((fromDay.getTime() - start.getTime()) / 86400000)
    const k = Math.ceil(diff / step)
    next = addDays(start, k * step)
  } else if (unit === 'month') {
    const months = monthIndex(start, fromDay)
    let k = Math.max(0, Math.floor(months / interval))
    next = addCalendarMonths(start, k * interval)
    while (next < fromDay) {
      k += 1
      next = addCalendarMonths(start, k * interval)
      if (k > 12000) return null
    }
  } else {
    const years = fromDay.getFullYear() - start.getFullYear()
    let k = Math.max(0, Math.floor(years / interval))
    next = addCalendarYears(start, k * interval)
    while (next < fromDay) {
      k += 1
      next = addCalendarYears(start, k * interval)
      if (k > 2000) return null
    }
  }
  if (!withinEnd(item, next)) return null
  return toISODate(next)
}

/** 闭区间内的发生日。日历月视图用，按规则往前推，不写进存储。 */
export function occurrencesInRange(item: RecurringReminder, fromISO: string, toISO: string): string[] {
  const out: string[] = []
  let cursor = nextRecurrenceDate(item, parseISODate(fromISO))
  const last = parseISODate(toISO)
  let guard = 0
  while (cursor && parseISODate(cursor) <= last && guard < 800) {
    out.push(cursor)
    cursor = nextRecurrenceDate(item, addDays(parseISODate(cursor), 1))
    guard += 1
  }
  return out
}

export type RecurringDraft = {
  title: string
  body: string
  startDate: string
  remindTime: string
  interval: number
  unit: RecurrenceUnit
  neverEnds: boolean
  endDate: string
  enabled: boolean
}

export function emptyRecurringDraft(startDate: string): RecurringDraft {
  return {
    title: '',
    body: '',
    startDate,
    remindTime: '',
    interval: 1,
    unit: 'year',
    neverEnds: true,
    endDate: '',
    enabled: true,
  }
}

export function draftFromRecurring(item: RecurringReminder): RecurringDraft {
  return {
    title: item.title,
    body: item.body ?? '',
    startDate: item.startDate,
    remindTime: item.remindTime ?? '',
    interval: item.rule.interval && item.rule.interval > 0 ? item.rule.interval : 1,
    unit: item.rule.unit ?? 'year',
    neverEnds: item.neverEnds,
    endDate: item.endDate ?? '',
    enabled: item.enabled,
  }
}

export function extrasFromDraft(
  draft: RecurringDraft,
): Pick<RecurringReminder, 'body' | 'startDate' | 'remindTime' | 'rule' | 'neverEnds' | 'endDate' | 'enabled'> {
  const interval = Math.max(1, Math.floor(Number(draft.interval) || 1))
  return {
    body: draft.body.trim() || undefined,
    startDate: draft.startDate,
    remindTime: draft.remindTime || undefined,
    rule: { kind: 'interval', interval, unit: draft.unit },
    neverEnds: draft.neverEnds,
    endDate: draft.neverEnds ? undefined : draft.endDate || undefined,
    enabled: draft.enabled,
  }
}

export function upcomingRecurring(
  items: RecurringReminder[],
  from: Date = startOfToday(),
  limit = 8,
): { item: RecurringReminder; next: string }[] {
  return items
    .map((item) => {
      const next = nextRecurrenceDate(item, from)
      return next ? { item, next } : null
    })
    .filter((row): row is { item: RecurringReminder; next: string } => Boolean(row))
    .sort((a, b) => {
      if (a.item.enabled !== b.item.enabled) return a.item.enabled ? -1 : 1
      return a.next.localeCompare(b.next)
    })
    .slice(0, limit)
}
