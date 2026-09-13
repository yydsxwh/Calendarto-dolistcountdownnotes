import { addDays, parseISODate, startOfDay, toISODate } from './dates'
import { clockFromMinutes, minutesOf, WEEKDAY_LABELS } from './periods'
import type { Course, Exam } from '../types'

export const FULL_DAY_START_MIN = 0
export const FULL_DAY_END_MIN = 24 * 60
export const DEFAULT_DAY_START_MIN = 0
export const DEFAULT_DAY_END_MIN = 24 * 60
export const HOUR_PX = 56
export const DEFAULT_HIDDEN_HOURS = [0, 1, 2, 3, 4, 5]

export type LaidOutCourse = {
  course: Course
  col: number
  cols: number
  top: number
  height: number
}

export type WeekDayColumn = {
  weekday: number
  label: string
  date: Date
  iso: string
  isToday: boolean
  isWeekend: boolean
}

export function mondayOf(date: Date): Date {
  return startOfWeek(date, 1)
}

export function startOfWeek(date: Date, weekStartsOn: 1 | 7 = 1): Date {
  const d = startOfDay(date)
  if (weekStartsOn === 7) {
    d.setDate(d.getDate() - d.getDay())
    return d
  }
  const js = d.getDay()
  const weekday = js === 0 ? 7 : js
  d.setDate(d.getDate() - (weekday - 1))
  return d
}

export function weekdayOrder(weekStartsOn: 1 | 7 = 1): number[] {
  return weekStartsOn === 7 ? [7, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 7]
}

export function weekDays(
  weekStart: Date,
  today = startOfDay(new Date()),
  weekStartsOn: 1 | 7 = 1,
  hiddenWeekdays: number[] = [],
): WeekDayColumn[] {
  const todayIso = toISODate(today)
  const hidden = new Set(hiddenWeekdays)
  return weekdayOrder(weekStartsOn)
    .filter((weekday) => !hidden.has(weekday))
    .map((weekday) => {
      const offset = weekStartsOn === 7 ? (weekday === 7 ? 0 : weekday) : weekday - 1
      const date = addDays(weekStart, offset)
      return {
        weekday,
        label: WEEKDAY_LABELS[weekday - 1],
        date,
        iso: toISODate(date),
        isToday: toISODate(date) === todayIso,
        isWeekend: weekday >= 6,
      }
    })
}

export function shiftWeek(weekStart: Date, weeks: number): Date {
  return addDays(weekStart, weeks * 7)
}

export function teachingWeekNumber(
  weekStart: Date,
  termStart?: string,
  weekStartsOn: 1 | 7 = 1,
): number | null {
  if (!termStart) return null
  const start = startOfWeek(parseISODate(termStart), weekStartsOn)
  const view = startOfWeek(weekStart, weekStartsOn)
  const diffDays = Math.round((view.getTime() - start.getTime()) / 86400000)
  return Math.floor(diffDays / 7) + 1
}

export function weekStartForTeachingWeek(
  termStart: string,
  week: number,
  weekStartsOn: 1 | 7 = 1,
): Date {
  return addDays(startOfWeek(parseISODate(termStart), weekStartsOn), (Math.max(1, week) - 1) * 7)
}

/** 「1-16周」「1,3,5」「单周」「1-16单周」 */
export function parseWeekNumbers(raw?: string): Set<number> | null {
  if (!raw?.trim()) return null
  const text = raw.replace(/\s/g, '')
  const odd = /单/.test(text)
  const even = /双/.test(text)
  const nums = new Set<number>()
  const rest = text.replace(/(\d{1,2})\s*[-~到至—–]\s*(\d{1,2})/g, (_, a, b) => {
    const from = Number(a)
    const to = Number(b)
    const lo = Math.min(from, to)
    const hi = Math.max(from, to)
    for (let i = lo; i <= hi; i++) nums.add(i)
    return ' '
  })
  for (const part of rest.split(/[,，、;；]/)) {
    const n = part.match(/\d{1,2}/)
    if (n) nums.add(Number(n[0]))
  }
  if (nums.size === 0 && (odd || even)) {
    for (let i = 1; i <= 30; i++) {
      if (odd && i % 2 === 1) nums.add(i)
      if (even && i % 2 === 0) nums.add(i)
    }
  } else if (odd) {
    for (const n of [...nums]) if (n % 2 === 0) nums.delete(n)
  } else if (even) {
    for (const n of [...nums]) if (n % 2 === 1) nums.delete(n)
  }
  return nums.size ? nums : null
}

export function courseInTeachingWeek(course: Course, week: number | null): boolean {
  if (week == null || week < 1) return true
  const spec = parseWeekNumbers(course.weeks)
  if (!spec) return true
  return spec.has(week)
}

export function courseInTerm(course: Course, termId?: string): boolean {
  if (!termId || !course.termId) return true
  return course.termId === termId
}

export function visibleHours(hiddenHours: number[] = []): number[] {
  const hide = new Set(hiddenHours.filter((h) => h >= 0 && h <= 23))
  const hours = []
  for (let h = 0; h < 24; h++) {
    if (!hide.has(h)) hours.push(h)
  }
  return hours.length ? hours : [8]
}

export function hourMarksFromHidden(hiddenHours: number[] = []): { hour: number; minutes: number; label: string }[] {
  return visibleHours(hiddenHours).map((hour) => ({
    hour,
    minutes: hour * 60,
    label: hour === 0 ? '00:00' : clockFromMinutes(hour * 60),
  }))
}

export function visibleOffset(mins: number, hiddenHours: number[], hourPx: number): number {
  const hours = visibleHours(hiddenHours)
  let y = 0
  for (const hour of hours) {
    const start = hour * 60
    const end = start + 60
    if (mins <= start) return y
    if (mins < end) return y + ((mins - start) / 60) * hourPx
    y += hourPx
  }
  return y
}

export function gridHeight(hiddenHours: number[], hourPx: number): number {
  return visibleHours(hiddenHours).length * hourPx
}

export function dayBounds(): { start: number; end: number } {
  return { start: FULL_DAY_START_MIN, end: FULL_DAY_END_MIN }
}

export function hourMarks(start: number, end: number): { minutes: number; label: string }[] {
  const marks: { minutes: number; label: string }[] = []
  for (let m = start; m < end; m += 60) {
    marks.push({ minutes: m, label: clockFromMinutes(m) })
  }
  if (end === FULL_DAY_END_MIN) marks.push({ minutes: end, label: '23:59' })
  else marks.push({ minutes: end, label: clockFromMinutes(end) })
  return marks
}

export function snapMinutes(total: number, step = 30): number {
  return Math.round(total / step) * step
}

export function slotFromOffset(
  offsetY: number,
  hiddenHours: number[],
  hourPx: number,
  duration = 90,
): { startTime: string; endTime: string } {
  const hours = visibleHours(hiddenHours)
  let y = 0
  for (const hour of hours) {
    if (offsetY <= y + hourPx) {
      const within = Math.max(0, offsetY - y)
      const start = Math.max(0, Math.min(FULL_DAY_END_MIN - 30, snapMinutes(hour * 60 + (within / hourPx) * 60)))
      const end = Math.min(FULL_DAY_END_MIN, start + duration)
      return { startTime: clockFromMinutes(start), endTime: end === FULL_DAY_END_MIN ? '23:59' : clockFromMinutes(end) }
    }
    y += hourPx
  }
  const last = hours[hours.length - 1] * 60
  return { startTime: clockFromMinutes(last), endTime: clockFromMinutes(Math.min(FULL_DAY_END_MIN, last + 60)) }
}

export function nowLineTop(now: Date, hiddenHours: number[], hourPx: number): number | null {
  const mins = now.getHours() * 60 + now.getMinutes()
  if (hiddenHours.includes(now.getHours())) return null
  return visibleOffset(mins, hiddenHours, hourPx)
}

export function layoutDayCourses(
  courses: Course[],
  hiddenHours: number[],
  hourPx: number,
): LaidOutCourse[] {
  const items = courses
    .map((course) => ({
      course,
      start: minutesOf(course.startTime),
      end: course.endTime === '23:59' ? FULL_DAY_END_MIN : minutesOf(course.endTime),
    }))
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const clusters: typeof items[] = []
  let cluster: typeof items = []
  let clusterEnd = -1
  for (const item of items) {
    if (cluster.length > 0 && item.start >= clusterEnd) {
      clusters.push(cluster)
      cluster = [item]
      clusterEnd = item.end
    } else {
      cluster.push(item)
      clusterEnd = Math.max(clusterEnd, item.end)
    }
  }
  if (cluster.length) clusters.push(cluster)

  const result: LaidOutCourse[] = []
  for (const group of clusters) {
    const columns: number[] = []
    const assigned: { item: (typeof items)[number]; col: number }[] = []
    for (const item of group) {
      let col = columns.findIndex((end) => end <= item.start)
      if (col < 0) {
        col = columns.length
        columns.push(item.end)
      } else {
        columns[col] = item.end
      }
      assigned.push({ item, col })
    }
    const cols = Math.max(1, columns.length)
    for (const { item, col } of assigned) {
      const top = visibleOffset(item.start, hiddenHours, hourPx)
      const bottom = visibleOffset(item.end, hiddenHours, hourPx)
      const height = bottom - top
      if (height < 8) continue
      result.push({
        course: item.course,
        col,
        cols,
        top,
        height: Math.max(28, height - 3),
      })
    }
  }
  return result
}

export function examsForDay(exams: Exam[], iso: string): Exam[] {
  return exams.filter((exam) => exam.date === iso)
}

export function blockStyle(item: LaidOutCourse): { top: string; height: string; left: string; width: string } {
  const gap = 3
  const width = `calc((100% - ${(item.cols + 1) * gap}px) / ${item.cols})`
  const left = `calc(${gap}px + ${item.col} * ((100% - ${(item.cols + 1) * gap}px) / ${item.cols} + ${gap}px))`
  return {
    top: `${item.top}px`,
    height: `${item.height}px`,
    left,
    width,
  }
}

export function weekRangeLabel(weekStart: Date, dayCount = 7): string {
  const last = addDays(weekStart, Math.max(0, dayCount - 1))
  return `${weekStart.getMonth() + 1}月${weekStart.getDate()}日 – ${last.getMonth() + 1}月${last.getDate()}日`
}

export { WEEKDAY_LABELS }
