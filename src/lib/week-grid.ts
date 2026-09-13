import { addDays, parseISODate, startOfDay, toISODate } from './dates'
import { clockFromMinutes, minutesOf, WEEKDAY_LABELS } from './periods'
import type { Course, Exam } from '../types'

export const DEFAULT_DAY_START_MIN = 6 * 60
export const DEFAULT_DAY_END_MIN = 22 * 60
export const HOUR_PX = 56

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
  const d = startOfDay(date)
  const js = d.getDay()
  const weekday = js === 0 ? 7 : js
  d.setDate(d.getDate() - (weekday - 1))
  return d
}

export function weekDays(monday: Date, today = startOfDay(new Date())): WeekDayColumn[] {
  const todayIso = toISODate(today)
  return WEEKDAY_LABELS.map((label, i) => {
    const date = addDays(monday, i)
    return {
      weekday: i + 1,
      label,
      date,
      iso: toISODate(date),
      isToday: toISODate(date) === todayIso,
      isWeekend: i >= 5,
    }
  })
}

export function shiftWeek(monday: Date, weeks: number): Date {
  return addDays(monday, weeks * 7)
}

export function teachingWeekNumber(monday: Date, termStart?: string): number | null {
  if (!termStart) return null
  const start = mondayOf(parseISODate(termStart))
  const diffDays = Math.round((monday.getTime() - start.getTime()) / 86400000)
  return Math.floor(diffDays / 7) + 1
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

export function dayBounds(items: { startTime: string; endTime?: string }[]): {
  start: number
  end: number
} {
  let start = DEFAULT_DAY_START_MIN
  let end = DEFAULT_DAY_END_MIN
  for (const item of items) {
    const s = minutesOf(item.startTime)
    const e = item.endTime ? minutesOf(item.endTime) : s + 60
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue
    start = Math.min(start, Math.floor(s / 60) * 60)
    end = Math.max(end, Math.ceil(e / 60) * 60)
  }
  start = Math.max(0, start)
  end = Math.min(24 * 60, Math.max(end, start + 60))
  return { start, end }
}

export function hourMarks(start: number, end: number): { minutes: number; label: string }[] {
  const marks: { minutes: number; label: string }[] = []
  for (let m = start; m <= end; m += 60) {
    marks.push({ minutes: m, label: clockFromMinutes(m) })
  }
  return marks
}

export function snapMinutes(total: number, step = 30): number {
  return Math.round(total / step) * step
}

export function slotFromOffset(
  offsetY: number,
  dayStart: number,
  hourPx: number,
  duration = 90,
): { startTime: string; endTime: string } {
  const raw = dayStart + (offsetY / hourPx) * 60
  const start = Math.max(0, Math.min(24 * 60 - 30, snapMinutes(raw)))
  const end = Math.min(24 * 60, start + duration)
  return { startTime: clockFromMinutes(start), endTime: clockFromMinutes(end) }
}

export function nowLineTop(now: Date, dayStart: number, dayEnd: number, hourPx: number): number | null {
  const mins = now.getHours() * 60 + now.getMinutes()
  if (mins < dayStart || mins > dayEnd) return null
  return ((mins - dayStart) / 60) * hourPx
}

export function layoutDayCourses(
  courses: Course[],
  dayStart: number,
  hourPx: number,
): LaidOutCourse[] {
  const items = courses
    .map((course) => ({
      course,
      start: minutesOf(course.startTime),
      end: minutesOf(course.endTime),
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
      result.push({
        course: item.course,
        col,
        cols,
        top: ((item.start - dayStart) / 60) * hourPx,
        height: Math.max(28, ((item.end - item.start) / 60) * hourPx - 3),
      })
    }
  }
  return result
}

export function coursesForDay(courses: Course[], weekday: number, week: number | null): Course[] {
  return courses.filter((c) => c.weekday === weekday && courseInTeachingWeek(c, week))
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

export function weekRangeLabel(monday: Date): string {
  const sunday = addDays(monday, 6)
  return `${monday.getMonth() + 1}月${monday.getDate()}日 – ${sunday.getMonth() + 1}月${sunday.getDate()}日`
}

export { WEEKDAY_LABELS }
