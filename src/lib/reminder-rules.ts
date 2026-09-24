import type { AppData, ReminderRule } from '../types'
import { bundledHolidays } from './holidays/query'

export interface FirePlan {
  ruleId: string
  occurrenceKey: string
  fireAt: string
  title: string
  delivery: ReminderRule['delivery']
}

function parseLocal(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] ?? 0), Number(match[5] ?? 0), 0, 0)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatLocal(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000)
}

export function startInstants(data: AppData, rule: ReminderRule, from: Date, until: Date): { at: Date; key: string; title: string }[] {
  const out: { at: Date; key: string; title: string }[] = []
  const push = (at: Date | null, key: string, title: string) => {
    if (!at || at.getTime() < from.getTime() || at.getTime() > until.getTime()) return
    out.push({ at, key, title })
  }
  if (rule.targetType === 'todo') {
    const item = data.todos.find((todo) => todo.id === rule.targetId)
    if (!item || item.done || !item.dueDate) return []
    push(parseLocal(`${item.dueDate}T${item.dueTime || '09:00'}`), item.dueDate, item.title)
  } else if (rule.targetType === 'exam') {
    const item = data.exams.find((exam) => exam.id === rule.targetId)
    if (!item) return []
    push(parseLocal(`${item.date}T${item.startTime}`), item.date, item.name)
  } else if (rule.targetType === 'event') {
    const item = data.calendarEvents.find((event) => event.id === rule.targetId)
    if (!item) return []
    push(parseLocal(`${item.date}T${item.startTime || '09:00'}`), item.date, item.title)
  } else if (rule.targetType === 'day') {
    const item = data.countdowns.find((day) => day.id === rule.targetId)
    if (!item) return []
    push(parseLocal(`${item.date}T09:00`), item.date, item.title)
  } else if (rule.targetType === 'course' || rule.targetType === 'self') {
    const item = rule.targetType === 'course'
      ? data.courses.find((course) => course.id === rule.targetId)
      : data.selfSchedules.find((row) => row.id === rule.targetId)
    if (!item) return []
    const cursor = new Date(from)
    cursor.setHours(0, 0, 0, 0)
    while (cursor.getTime() <= until.getTime()) {
      const weekday = cursor.getDay() === 0 ? 7 : cursor.getDay()
      if (weekday === item.weekday) {
        const key = formatLocal(cursor).slice(0, 10)
        push(parseLocal(`${key}T${item.startTime}`), key, 'name' in item ? item.name : item.title)
      }
      cursor.setDate(cursor.getDate() + 1)
    }
  } else if (rule.targetType === 'holiday') {
    const next = bundledHolidays.occurrences
      .filter((item) => item.stableKey === rule.targetId && item.kind !== 'day_off' && item.kind !== 'adjusted_workday')
      .sort((a, b) => a.date.localeCompare(b.date))
      .find((item) => parseLocal(`${item.date}T09:00`) && (parseLocal(`${item.date}T09:00`) as Date).getTime() >= from.getTime())
    if (next) push(parseLocal(`${next.date}T09:00`), next.date, next.name)
  } else if (rule.targetType === 'recurring') {
    const item = data.recurringReminders.find((row) => row.id === rule.targetId)
    if (item?.remindTime) push(parseLocal(`${item.startDate}T${item.remindTime}`), item.startDate, item.title)
  }
  return out
}

/** 滚动 21 天，避免为无限周次注册闹钟。 */
export function planFires(data: AppData, now = new Date(), horizonDays = 21): FirePlan[] {
  const until = new Date(now.getTime() + horizonDays * 86400000)
  const plans: FirePlan[] = []
  for (const rule of data.reminderRules ?? []) {
    if (!rule.enabled) continue
    for (const start of startInstants(data, rule, new Date(now.getTime() - 86400000), until)) {
      const fire = rule.triggerMode === 'absolute'
        ? parseLocal(rule.triggerAt || '')
        : addMinutes(start.at, -(rule.offsetMinutes ?? 0))
      if (!fire || fire.getTime() <= now.getTime() || fire.getTime() > until.getTime()) continue
      plans.push({
        ruleId: rule.id,
        occurrenceKey: `${rule.id}:${start.key}:${rule.revision}`,
        fireAt: formatLocal(fire),
        title: start.title,
        delivery: rule.delivery,
      })
    }
  }
  const seen = new Set<string>()
  return plans.filter((plan) => {
    if (seen.has(plan.occurrenceKey)) return false
    seen.add(plan.occurrenceKey)
    return true
  })
}

export function nextWeekdayStart(weekday: number, time: string, now = new Date()): Date {
  const date = new Date(now)
  const js = weekday === 7 ? 0 : weekday
  let add = js - date.getDay()
  if (add < 0) add += 7
  date.setDate(date.getDate() + add)
  const [hour, minute] = time.split(':').map((part) => Number(part))
  date.setHours(hour || 0, minute || 0, 0, 0)
  if (date.getTime() <= now.getTime()) date.setDate(date.getDate() + 7)
  return date
}

export function describeFire(rule: ReminderRule, start: Date, now = new Date()): { label: string; past: boolean } {
  const fire = rule.triggerMode === 'absolute' ? parseLocal(rule.triggerAt || '') : addMinutes(start, -(rule.offsetMinutes ?? 0))
  if (!fire) return { label: '时间不完整', past: true }
  return { label: formatLocal(fire).replace('T', ' '), past: fire.getTime() <= now.getTime() }
}
